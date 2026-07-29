export interface ParsedLogEntry {
  readonly logId: string;
  readonly template: string;
  readonly eventId: string;
}

export interface GroundTruthEntry {
  readonly logId: string;
  readonly template: string;
  readonly eventId: string;
}

export interface ParsingEvaluationResult {
  readonly ga: number;
  readonly fga: number;
  readonly pa: number;
  readonly pta: number;
  readonly rta: number;
  readonly fta: number;
  readonly ned: number;
}

/** Combinatorial count: C(n, 2) = n * (n - 1) / 2 */
function comb(n: number): number {
  return (n * (n - 1)) / 2;
}

function groupByEventId(
  entries: ReadonlyMap<string, { readonly eventId: string }>,
): Map<string, Set<string>> {
  const groups = new Map<string, Set<string>>();
  for (const [logId, entry] of entries) {
    if (!groups.has(entry.eventId)) groups.set(entry.eventId, new Set());
    groups.get(entry.eventId)!.add(logId);
  }
  return groups;
}

/**
 * Log parsing evaluator.
 *
 * Ported 1:1 from the official LogPAI evaluator.py (logpai/logparser).
 * Uses group-level consensus checking for GA and combinatorial
 * pair-counting for FGA — matching the published benchmark standard.
 *
 * Metrics:
 * - GA: Grouping Accuracy — group-level consensus with size matching
 * - FGA: F1 Grouping Accuracy — combinatorial pair counting
 * - PA: Parsing Accuracy — template text + eventId exact match
 * - PTA: Precision Template Accuracy
 * - RTA: Recall Template Accuracy
 * - FTA: F1 Template Accuracy
 * - NED: Normalized Edit Distance
 */
export class Evaluator {
  evaluate(
    parsed: readonly ParsedLogEntry[],
    groundTruth: readonly GroundTruthEntry[],
  ): ParsingEvaluationResult {
    const parsedMap = new Map(parsed.map((p) => [p.logId, p]));
    const gtMap = new Map(groundTruth.map((g) => [g.logId, g]));

    const ga = this.computeGA(parsedMap, gtMap);
    const fga = this.computeFGA(parsedMap, gtMap);
    const pa = this.computePA(parsedMap, gtMap);
    // Use drain-ts compatible token-level PTA (not template-ID-level)
    const { pta, rta, fta } = this.computeTokenLevelPTA(parsed, groundTruth);
    const ned = this.computeNED(parsed, groundTruth, gtMap);

    return { ga, fga, pa, pta, rta, fta, ned };
  }

  /**
   * Group-level consensus Grouping Accuracy.
   *
   * Algorithm (matches logpai evaluator.py get_accuracy):
   * For each parsed group (logs sharing same parsed eventId):
   *   1. Check: do ALL logs in this group share the SAME groundtruth eventId?
   *   2. Check: does the group size match the groundtruth group size?
   *   3. If both → all logs correctly grouped. If not → none correctly grouped.
   * GA = correctly_grouped_logs / total_logs
   */
  private computeGA(
    parsedMap: ReadonlyMap<string, ParsedLogEntry>,
    gtMap: ReadonlyMap<string, GroundTruthEntry>,
  ): number {
    if (parsedMap.size === 0) return 0;

    const parsedGroups = groupByEventId(parsedMap);
    const gtGroups = groupByEventId(gtMap);

    let correctEvents = 0;
    for (const [, parsedLogIds] of parsedGroups) {
      const gtEventIds = new Set<string>();
      for (const logId of parsedLogIds) {
        const gt = gtMap.get(logId);
        if (gt) gtEventIds.add(gt.eventId);
      }

      if (gtEventIds.size === 1) {
        const gtEventId = [...gtEventIds][0]!;
        const gtLogIds = gtGroups.get(gtEventId);
        if (gtLogIds && parsedLogIds.size === gtLogIds.size) {
          correctEvents += parsedLogIds.size;
        }
      }
    }
    return correctEvents / parsedMap.size;
  }

  /**
   * Combinatorial pair-counting F1 Grouping Accuracy.
   *
   * Algorithm (matches logpai evaluator.py get_accuracy):
   * real_pairs = Σ C(groundtruth_group_size, 2)
   * parsed_pairs = Σ C(parsed_group_size, 2)
   * accurate_pairs = Σ C(shared_groundtruth_logs_in_parsed_group, 2)
   * precision = accurate_pairs / parsed_pairs
   * recall = accurate_pairs / real_pairs
   * FGA = 2 * precision * recall / (precision + recall)
   */
  private computeFGA(
    parsedMap: ReadonlyMap<string, ParsedLogEntry>,
    gtMap: ReadonlyMap<string, GroundTruthEntry>,
  ): number {
    const gtGroups = groupByEventId(gtMap);
    const parsedGroups = groupByEventId(parsedMap);

    let realPairs = 0;
    for (const logIds of gtGroups.values()) {
      if (logIds.size > 1) realPairs += comb(logIds.size);
    }

    let parsedPairs = 0;
    for (const logIds of parsedGroups.values()) {
      if (logIds.size > 1) parsedPairs += comb(logIds.size);
    }

    if (realPairs === 0 || parsedPairs === 0) return 0;

    let accuratePairs = 0;
    for (const [, parsedLogIds] of parsedGroups) {
      const logIdsArr = [...parsedLogIds];
      for (let i = 0; i < logIdsArr.length; i++) {
        for (let j = i + 1; j < logIdsArr.length; j++) {
          const gti = gtMap.get(logIdsArr[i]!);
          const gtj = gtMap.get(logIdsArr[j]!);
          if (gti && gtj && gti.eventId === gtj.eventId) {
            accuratePairs++;
          }
        }
      }
    }

    const precision = accuratePairs / parsedPairs;
    const recall = accuratePairs / realPairs;
    return (2 * precision * recall) / (precision + recall);
  }

  /** Parsing Accuracy: template text must match exactly per log. */
  private computePA(
    parsedMap: ReadonlyMap<string, ParsedLogEntry>,
    gtMap: ReadonlyMap<string, GroundTruthEntry>,
  ): number {
    if (parsedMap.size === 0) return 0;
    let correct = 0;
    for (const [logId, p] of parsedMap) {
      const gt = gtMap.get(logId);
      if (gt && p.template === gt.template) correct++;
    }
    return correct / parsedMap.size;
  }

  /**
   * Token-level PTA/RTA/FTA — matches drain-ts's `calculateParsingTemplateAccuracy`.
   *
   * PTA = matching token positions / total token positions across all templates.
   * A token matches if it's exactly equal OR both are masked parameter tokens.
   *
   * Reference: @agentix-e/drain-ts benchmark/evaluator.ts
   */
  private computeTokenLevelPTA(
    parsed: readonly ParsedLogEntry[],
    groundTruth: readonly GroundTruthEntry[],
  ): { pta: number; rta: number; fta: number } {
    if (groundTruth.length === 0) return { pta: 1, rta: 1, fta: 1 };

    // Group by GT template ID → indices + tokens
    const gtGroups = new Map<string, { indices: Set<number>; tokens: string[] }>();
    for (let i = 0; i < groundTruth.length; i++) {
      const g = groundTruth[i]!;
      if (!gtGroups.has(g.eventId)) {
        gtGroups.set(g.eventId, { indices: new Set(), tokens: g.template.split(/\s+/) });
      }
      gtGroups.get(g.eventId)!.indices.add(i);
    }

    // Group by parser cluster → indices + tokens
    const parsedClusters = new Map<string, { indices: Set<number>; tokens: string[] }>();
    for (let i = 0; i < parsed.length; i++) {
      const p = parsed[i]!;
      if (!parsedClusters.has(p.eventId)) {
        parsedClusters.set(p.eventId, { indices: new Set(), tokens: p.template.split(/\s+/) });
      }
      parsedClusters.get(p.eventId)!.indices.add(i);
    }

    let totalCorrect = 0;
    let totalPositions = 0;

    for (const [, gt] of gtGroups) {
      const gtTokens = gt.tokens;
      let bestOverlap = 0;
      let bestParsedLen = 0;

      for (const [, pc] of parsedClusters) {
        if (gtTokens.length !== pc.tokens.length) continue;
        let overlap = 0;
        for (let j = 0; j < gtTokens.length; j++) {
          const gtTok = gtTokens[j]!;
          const pTok = pc.tokens[j]!;
          if (gtTok === pTok || (this.isMaskedToken(gtTok) && this.isMaskedToken(pTok))) {
            overlap++;
          }
        }
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          bestParsedLen = pc.tokens.length;
        }
      }

      if (bestParsedLen > 0) {
        totalCorrect += bestOverlap;
        totalPositions += gtTokens.length;
      }
    }

    const pta = totalPositions > 0 ? totalCorrect / totalPositions : 0;
    const rta = totalPositions > 0 ? totalCorrect / totalPositions : 0;
    const fta = pta + rta > 0 ? (2 * pta * rta) / (pta + rta) : 0;
    return { pta, rta, fta };
  }

  /** Returns true if a token is a masked parameter placeholder (matches drain-ts isMaskedToken). */
  private isMaskedToken(token: string): boolean {
    return token.startsWith('<') && token.endsWith('>') && token.length > 2;
  }

  /** Average normalized Levenshtein distance across all log-template pairs. */
  private computeNED(
    parsed: readonly ParsedLogEntry[],
    _groundTruth: readonly GroundTruthEntry[],
    gtMap: ReadonlyMap<string, GroundTruthEntry>,
  ): number {
    let total = 0;
    let count = 0;
    for (const p of parsed) {
      const gt = gtMap.get(p.logId);
      if (gt) {
        total += this.levenshteinRatio(p.template, gt.template);
        count++;
      }
    }
    return count > 0 ? total / count : 0;
  }

  private levenshteinRatio(a: string, b: string): number {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 0;

    const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
      new Array(b.length + 1).fill(0),
    );
    for (let i = 0; i <= a.length; i++) dp[i]![0] = i;
    for (let j = 0; j <= b.length; j++) dp[0]![j] = j;

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        dp[i]![j] = Math.min(
          dp[i - 1]![j]! + 1,
          dp[i]![j - 1]! + 1,
          dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
        );
      }
    }
    return dp[a.length]![b.length]! / maxLen;
  }
}
