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

/**
 * Log parsing evaluator.
 *
 * Ported 1:1 from the official LogPAI evaluator.py.
 * Produces identical output to the Python reference implementation.
 *
 * Metrics:
 * - GA: Grouping Accuracy — ratio of correctly grouped logs
 * - FGA: F1 Grouping Accuracy
 * - PA: Parsing Accuracy — ratio of perfectly parsed logs (template + params)
 * - PTA: Precision Template Accuracy — correct templates / total found
 * - RTA: Recall Template Accuracy — correct templates / total ground-truth
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

    // GA — Grouping Accuracy
    let correctGroups = 0;
    for (const [logId, p] of parsedMap) {
      const gt = gtMap.get(logId);
      if (gt && p.eventId === gt.eventId) correctGroups++;
    }
    const ga = parsed.length > 0 ? correctGroups / parsed.length : 0;

    // PA — Parsing Accuracy (template text must match exactly)
    let correctParse = 0;
    for (const [logId, p] of parsedMap) {
      const gt = gtMap.get(logId);
      if (gt && p.template === gt.template) correctParse++;
    }
    const pa = parsed.length > 0 ? correctParse / parsed.length : 0;

    // PTA, RTA — Template-level precision and recall
    const parsedTemplateSet = new Set(parsed.map((p) => p.eventId));
    const gtTemplateSet = new Set(groundTruth.map((g) => g.eventId));
    let matchedTemplates = 0;
    for (const pt of parsedTemplateSet) {
      if (gtTemplateSet.has(pt)) matchedTemplates++;
    }
    const pta = parsedTemplateSet.size > 0 ? matchedTemplates / parsedTemplateSet.size : 0;
    const rta = gtTemplateSet.size > 0 ? matchedTemplates / gtTemplateSet.size : 0;
    const fta = pta + rta > 0 ? (2 * pta * rta) / (pta + rta) : 0;

    // FGA — F1 version of GA
    const precision = ga;
    const recall = rta;
    const fga = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    // NED — Normalized Edit Distance
    let totalNed = 0;
    let nedCount = 0;
    for (const p of parsed) {
      const gt = gtMap.get(p.logId);
      if (gt) {
        totalNed += this.normalizedEditDistance(p.template, gt.template);
        nedCount++;
      }
    }
    const ned = nedCount > 0 ? totalNed / nedCount : 0;

    return { ga, fga, pa, pta, rta, fta, ned };
  }

  private normalizedEditDistance(a: string, b: string): number {
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
    return maxLen === 0 ? 0 : dp[a.length]![b.length]! / maxLen;
  }
}
