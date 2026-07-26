/**
 * Post-processing rule engine for template correction.
 * Applied after LLM extraction to fix common errors.
 *
 * 9-rule engine inspired by LogBatcher's postprocess.py (ASE 2024):
 *   DS — Duplicate Space normalization
 *   BL — Boolean replacement (true/false → <*>)
 *   US — User String replacement (null/root/admin → <*>)
 *   DG — Digit Group consolidation
 *   PS — Path Segment normalization
 *   WV — Word-Variable concatenation cleanup
 *   DV — Dot-separated Variable consolidation
 *   CV — Consecutive Variable consolidation
 *   CS — Consistency check against original logs
 */
export class PostProcessor {
  /** Default tokens treated as variables (LogBatcher BL/US rules). */
  private static readonly DEFAULT_STRINGS = new Set([
    'null',
    'root',
    'true',
    'false',
    'none',
    'unknown',
    'undefined',
  ]);

  static correct(
    template: string,
    originalLogs: readonly string[],
  ): { template: string; rulesApplied: string[] } {
    let result = template;
    const rulesApplied: string[] = [];
    let prev: string;

    // DS: normalize whitespace
    prev = result;
    result = result.trim().replace(/\s+/g, ' ');
    if (result !== prev) rulesApplied.push('DS');

    // Precise type classification FIRST (to protect typed tokens from heuristics)
    prev = result;
    result = PostProcessor.typeIps(result);
    if (result !== prev) rulesApplied.push('type-ips');

    prev = result;
    result = PostProcessor.typeUuids(result);
    if (result !== prev) rulesApplied.push('type-uuids');

    prev = result;
    result = PostProcessor.typeEmails(result);
    if (result !== prev) rulesApplied.push('type-emails');

    prev = result;
    result = PostProcessor.typeHostnames(result);
    if (result !== prev) rulesApplied.push('type-hostnames');

    prev = result;
    result = PostProcessor.typePaths(result);
    if (result !== prev) rulesApplied.push('type-paths');

    // Heuristic rules AFTER type classification
    // PS: normalize path-like patterns
    prev = result;
    result = PostProcessor.applyPathNormalization(result);
    if (result !== prev) rulesApplied.push('PS');

    // DG: consolidate digit tokens
    prev = result;
    result = PostProcessor.applyDigitExclusion(result);
    if (result !== prev) rulesApplied.push('DG');

    // BL + US: replace booleans and user strings
    prev = result;
    result = PostProcessor.applyStringReplacements(result);
    if (result !== prev) rulesApplied.push('BL/US');

    // WV: word concatenated with variable
    prev = result;
    result = PostProcessor.applyWordVariableCleanup(result);
    if (result !== prev) rulesApplied.push('WV');

    // DV: dot-separated variable consolidation (<*>.<*> → <*>)
    prev = result;
    result = PostProcessor.applyDelimiterConsolidation(result);
    if (result !== prev) rulesApplied.push('DV');

    // CV: consecutive variable consolidation (<*><*> → <*>)
    prev = result;
    result = PostProcessor.applyConsecutiveVariableConsolidation(result);
    if (result !== prev) rulesApplied.push('CV');

    // CS: consistency check
    if (!PostProcessor.verifyConsistency(result, originalLogs)) {
      rulesApplied.push('CS-warning');
    }

    return { template: result, rulesApplied };
  }

  // ── DS/PS/DG/BL/US ──

  /** PS: replace path-like tokens with <*>. */
  private static applyPathNormalization(template: string): string {
    return template
      .replace(/\/[\w./-]*\/?/g, (match) => {
        return match.includes('/') && match.length > 3 ? '<*>' : match;
      })
      .replace(/([\w-]+\.){3,}[a-z]+/gi, '<*>'); // FQDN pattern
  }

  /** DG: replace digit-dominant tokens with <*>. */
  private static applyDigitExclusion(template: string): string {
    return template.replace(/\S+/g, (token) => {
      if (token === '<*>' || token.startsWith('<')) return token;
      return PostProcessor.excludeDigits(token) ? '<*>' : token;
    });
  }

  private static excludeDigits(token: string): boolean {
    const digits = token.replace(/\D/g, '');
    if (digits.length === 0) return false;
    // Keep if first char is alpha or contains uppercase (mixed semantic content)
    if (/^[a-zA-Z]/.test(token) || /[A-Z]/.test(token.slice(1))) return false;
    // Very long digit sequences (>4) are likely variables
    if (digits.length >= 4) return true;
    // If >30% of token is digits, treat as variable
    return digits.length / token.length > 0.3;
  }

  /** BL/US: replace known variable-like strings with <*>. */
  private static applyStringReplacements(template: string): string {
    let result = template;
    for (const str of PostProcessor.DEFAULT_STRINGS) {
      const regex = new RegExp(`\\b${str}\\b`, 'gi');
      result = result.replace(regex, '<*>');
    }
    return result;
  }

  // ── WV/DV/CV ──

  /** WV: word concatenated with variable (e.g., "abc<*>" → "<*>"). */
  private static applyWordVariableCleanup(template: string): string {
    // Patterns like: word<*>, <*>word, <*>word<*>
    return template.replace(/[^\s<]+<\*>[^\s<]*/g, '<*>').replace(/<\*>[\w.]+<\*>/g, '<*>');
  }

  /** DV: consolidate delimiter-separated variables (<*>.<*>, <*>@<*>, etc. → <*>). */
  private static applyDelimiterConsolidation(template: string): string {
    const delimiters = ['.', ':', '/', '#', '@', '-'];
    let result = template;
    for (const delim of delimiters) {
      const escaped = delim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(`<\\*>${escaped}<\\*>`, 'g'), '<*>');
    }
    return result;
  }

  /** CV: consecutive variables and space-padded variables. */
  private static applyConsecutiveVariableConsolidation(template: string): string {
    let result = template;
    // <*> <*> → <*> (adjacent with space)
    result = result.replace(/<\*> <\*>/g, '<*>');
    // <*><*> → <*> (no space)
    while (/<\*><\*>/.test(result)) {
      result = result.replace(/<\*><\*>/g, '<*>');
    }
    // " <*> " → " <*> " (trim spaces around single variables in quotes)
    result = result.replace(/" <\*> "/g, ' <*> ');
    result = result.replace(/' <\*> '/g, ' <*> ');
    // <*> KB/MB/GB/TB → <*>
    result = result.replace(/<\*> [KMGTP]B\b/g, '<*>');
    return result;
  }

  // ── Type classification rules ──

  static typeIps(template: string): string {
    return template.replace(/\b(\d{1,3}\.){3}\d{1,3}\b/g, '<IP>');
  }

  static typePaths(template: string): string {
    return template.replace(/[/\\][\w.\-/\\]*/g, (match) => {
      return match.length > 1 ? '<PATH>' : match;
    });
  }

  static typeUuids(template: string): string {
    return template.replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      '<UUID>',
    );
  }

  static typeEmails(template: string): string {
    return template.replace(/\b[\w.-]+@[\w.-]+\.\w+\b/g, '<EMAIL>');
  }

  static typeHostnames(template: string): string {
    return template.replace(/\b[\w.-]+\.[a-z]{2,}\b(?!@)/gi, (match) => {
      return /^\d/.test(match) ? match : '<HOSTNAME>';
    });
  }

  static verifyConsistency(template: string, logs: readonly string[]): boolean {
    const regex = PostProcessor.templateToRegex(template);
    return logs.every((log) => regex.test(log));
  }

  private static templateToRegex(template: string): RegExp {
    const patterns: Record<string, string> = {
      IP: '\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}',
      UUID: '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
      EMAIL: '[\\w.\\-]+@[\\w.\\-]+\\.\\w+',
      HOSTNAME: '[\\w.\\-]+\\.[a-z]{2,}',
      PATH: '[/\\\\][\\w./\\-]*',
      TIMESTAMP: '\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}:\\d{2}',
      '*': '\\S+',
    };

    const tagRegex = /<(\*|IP|NUM|UUID|EMAIL|HOSTNAME|PATH|TIMESTAMP)>/g;
    const segments: Array<{ kind: 'static' | 'var'; text: string; type?: string }> = [];
    let lastIdx = 0;
    let match: RegExpExecArray | null;

    while ((match = tagRegex.exec(template)) !== null) {
      const staticText = template.slice(lastIdx, match.index);
      const typeName = match[1]!;
      if (staticText.length > 0) {
        segments.push({ kind: 'static', text: staticText });
      }
      segments.push({ kind: 'var', text: match[0], type: typeName });
      lastIdx = match.index + match[0].length;
    }
    const trailing = template.slice(lastIdx);
    if (trailing.length > 0) {
      segments.push({ kind: 'static', text: trailing });
    }

    let regexStr = '^';
    for (const seg of segments) {
      if (seg.kind === 'static') {
        regexStr += seg.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      } else {
        regexStr += patterns[seg.type!] ?? '\\S+';
      }
    }
    regexStr += '$';

    return new RegExp(regexStr);
  }
}
