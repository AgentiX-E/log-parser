/**
 * SynLogPlus-inspired template refiner.
 *
 * Implements the two-phase template identification pipeline from the
 * SynLog+ paper (Chakraborty et al., 2025), which improves PTA of
 * syntax-based parsers by 236% on average.
 *
 * Algorithm:
 * 1. For each log group (cluster) from Drain:
 *    a. Sample 2 representative log messages
 *    b. Anonymize using domain-agnostic regex patterns
 *    c. Anonymize numbers
 *    d. Extract template by comparing samples (constants = tokens in both)
 *    e. Verify constants against ALL group members (absent → variable)
 *    f. Post-process (merge adjacent <*>, fix stray chars)
 *
 * Reference: https://arxiv.org/abs/2510.26793
 * Code: https://github.com/disa-lab/SynLogPlus
 */

/** Input for refining a single log group's template. */
export interface RefinementInput {
  /** Group members: raw log messages belonging to this cluster. */
  readonly logs: readonly string[];
  /** The original Drain template for this cluster. */
  readonly drainTemplate: string;
}

/** Result of refining a single log group's template. */
export interface RefinementResult {
  /** The refined template. */
  readonly refinedTemplate: string;
  /** Whether the template was changed. */
  readonly changed: boolean;
}

/**
 * SynLogPlus-inspired two-phase template refiner.
 *
 * Takes Drain's log groups (which already have high GA of 98.3%)
 * and applies regex anonymization + cross-group verification
 * to dramatically improve PTA.
 *
 * The key insight: Drain is excellent at GROUPING logs but its
 * template extraction within groups is weak. SynLogPlus fixes this
 * by applying domain-agnostic regex patterns BEFORE template
 * extraction, then verifying constants against ALL group members.
 */
export class SynLogTemplateRefiner {
  /**
   * Domain-agnostic regex patterns for common variable types.
   * These match across ALL log datasets without dataset-specific tuning.
   * Covers ~50% of all variables in LogHub-2k benchmark.
   */
  private static readonly VARIABLE_PATTERNS: readonly RegExp[] = [
    // MAC address: aa:bb:cc:dd:ee:ff
    /(\b)([A-Fa-f0-9]{2}:){5,}[A-Fa-f0-9]{2}(\b)/g,
    // Date & time: 2024-01-15, 01/15/2024, Jan 15 2024 (with optional time)
    /(\b)(\d{1,4}[-/]\d{1,2}[-/]\d{1,4})(\b)/g,
    // Timestamp with day/month names: Sat Jun 11 03:28:22 2005
    /(\b)((?:Sat|Sun|Mon|Tue|Wed|Thu|Fri)\s)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s\d{1,2}\s?(?:\d{2}:){2}\d{2}\s?(?:[A-Z]{3}\s?)?\d{4}?(\b)/g,
    // Time: HH:MM:SS or HH:MM
    /(\b)(\d{2}:\d{2}(:\d{2})?)(\b)/g,
    // Email address
    /(\b)[0-9a-zA-Z._%+-]+@([0-9a-zA-Z]([0-9a-zA-Z-]*[0-9a-zA-Z])?\.)+[a-zA-Z]{2,}(\b)/g,
    // IP address or hostname: 192.168.1.1, db-primary.local, api.example.com:8080
    /(\b)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?::?\d+)?(\b)/g,
    // IP v4: 192.168.1.1
    /(\b)((?:\d{1,3}\.){3}\d{1,3})(\b)/g,
    // Memory sizes: 128MB, 1.5GB, 64kb, 32KiB/s
    /(\b)(\d+(?:\.\d+)?)\s?[kmgtKMGT]i?[bB](?:\/s|ytes)?(\b)/g,
    // Frequency: 2.4GHz, 100MHz, 1KHz
    /(\b)(\d+(?:\.\d+)?)\s?[KMGT]?Hz(\b)/g,
    // Duration: 500ms, 3s, 2s500ms, +10ms
    /(\b)[+-]?(?:\d+s(?:\d+\s?ms)?|\d+\s?ms)(\b)/g,
    // Unix-style path: /var/log/syslog, /usr/local/bin/foo
    /(\b)(\/[\d+\w+\-_.#$]*[/.][\d+\w+\-_.#$/*]*)+(\b)/g,
    // Windows path: C:\Windows\System32
    /(\b)([a-zA-Z]:[/\\][\d+\w+\-_.#$\\/* ]*)(\b)/g,
    // Hex strings: 0xdeadbeef, bare deadbeef (8+ hex chars)
    /(\b)(0x)?[A-Fa-f0-9]{8,}(\b)/g,
    // UUID with dashes: 550e8400-e29b-41d4-a716-446655440000
    /(\b)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\b)/gi,
  ];

  /** Common variable-valued words that appear as literals in logs. */
  private static readonly COMMON_VARIABLES = new Set([
    'false',
    'true',
    'root',
    'null',
    'none',
    'undefined',
    '<*>',
  ]);

  /** Delimiter characters preserved as-is during tokenization. */
  private static readonly DELIMITERS = new Set(' ,!@#$%^&(){}[]=-_:;"\'+'.split(''));

  /**
   * Refine templates for all log groups.
   *
   * @param groups - Array of log groups with their Drain templates.
   * @returns Refined templates in the same order.
   */
  refine(groups: readonly RefinementInput[]): RefinementResult[] {
    return groups.map((group) => this.refineOne(group));
  }

  private refineOne(group: RefinementInput): RefinementResult {
    const { logs, drainTemplate } = group;
    if (logs.length === 0) {
      return { refinedTemplate: drainTemplate, changed: false };
    }

    // Step a: Sample 2 unique, representative log messages
    const unique = [...new Set(logs)];
    const samples = unique.slice(0, 2);

    // Step b: Regex anonymize
    const anon = samples.map((log) => this.anonymizeWithRegex(log));

    // Step c: Number anonymize
    const anonNums = anon.map((log) => this.anonymizeNumbers(log));

    // Step d: Tokenize and extract template
    const tokenized = anonNums.map((log) => this.tokenize(log));

    let template: string;
    if (tokenized.length === 1) {
      template = this.refineSingle(tokenized[0]!);
    } else {
      template = this.extractTemplate(tokenized[0]!, tokenized[1]!);
    }

    // Step e: Cross-group verification — verify constants against ALL group members
    for (const log of logs) {
      template = this.verifyConstants(template, log);
    }

    // Step f: Post-process
    template = this.postProcess(template);

    const changed = template !== drainTemplate;
    return { refinedTemplate: template, changed };
  }

  /** Apply all domain-agnostic regex patterns to anonymize a log line. */
  anonymizeWithRegex(log: string): string {
    let result = log;
    for (const pattern of SynLogTemplateRefiner.VARIABLE_PATTERNS) {
      pattern.lastIndex = 0; // Reset for global regex reuse
      result = result.replace(pattern, '<*>');
    }
    return result;
  }

  /** Check if a token should be treated as a number variable. */
  isNumber(token: string): boolean {
    if (token.length === 0) return false;

    // Pure number: integer, float
    if (/^-?\d+\.?\d*$/.test(token)) return true;

    // Long hex string (6+ chars, all hex)
    if (token.length >= 6 && /^[0-9A-Fa-f]+$/.test(token)) return true;

    // Digit-rich: more digits than letters
    let digits = 0;
    let alphas = 0;
    for (const c of token) {
      if (c >= '0' && c <= '9') digits++;
      else if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) alphas++;
    }
    return digits > alphas && digits > 0;
  }

  /** Number anonymization: replace number tokens with <*>. */
  anonymizeNumbers(log: string): string {
    const tokens = this.tokenize(log);
    return tokens
      .map((t) => (this.isNumber(t) && !SynLogTemplateRefiner.DELIMITERS.has(t) ? '<*>' : t))
      .join('');
  }

  /**
   * Tokenize a log string, preserving delimiters as separate tokens.
   * Handles trailing periods on tokens.
   */
  tokenize(log: string): string[] {
    const result: string[] = [];

    // Split on delimiters but keep them as separate tokens
    const parts = log.split(/([ ,!@#$%^&(){}[\]=\-_:;"'+])/);

    for (const part of parts) {
      if (!part) continue;
      if (SynLogTemplateRefiner.DELIMITERS.has(part)) {
        result.push(part);
      } else {
        // Handle trailing period on a token
        if (part.length > 1 && part.endsWith('.') && !part.startsWith('.')) {
          result.push(part.slice(0, -1), '.');
        } else {
          result.push(part);
        }
      }
    }
    return result.filter(Boolean);
  }

  /**
   * Extract template by comparing two token sequences.
   * Constants = tokens present in BOTH sequences in the same sequential order.
   * Variables = tokens present in only one sequence.
   */
  private extractTemplate(short: string[], long: string[]): string {
    const template: string[] = [];
    let lastIdx = -1;

    for (const word of short) {
      // Common variable literals → variable
      if (SynLogTemplateRefiner.COMMON_VARIABLES.has(word.toLowerCase())) {
        template.push('<*>');
        continue;
      }
      // Delimiters → keep as-is
      if (SynLogTemplateRefiner.DELIMITERS.has(word)) {
        template.push(word);
        lastIdx = -1;
        continue;
      }
      // Try to find word in long after last match position
      const idx = long.indexOf(word, lastIdx + 1);
      if (idx !== -1 && word === long[idx]) {
        template.push(word);
        lastIdx = idx;
      } else {
        template.push('<*>');
      }
    }
    return template.join('');
  }

  /** Refine a single-sample group using only regex + heuristics. */
  private refineSingle(tokens: string[]): string {
    return tokens
      .map((t) => {
        if (SynLogTemplateRefiner.COMMON_VARIABLES.has(t.toLowerCase())) return '<*>';
        if (this.isNumber(t)) return '<*>';
        return t;
      })
      .join('');
  }

  /**
   * Cross-group verification: remove any "constant" token from the template
   * that does NOT appear in every group member's raw log.
   *
   * This is the critical step that catches coincidental constant matches
   * from the 2-sample comparison.
   */
  private verifyConstants(template: string, log: string): string {
    let result = template;

    // Extract non-variable tokens from template
    const constantTokens = template
      .replace(/<[^>]*>/g, '\x00')
      .split('\x00')
      .filter(Boolean)
      .flatMap((s) => s.match(/\S+/g) ?? []);

    for (const token of [...new Set(constantTokens)]) {
      if (!log.includes(token)) {
        // Escape special regex chars in the token
        const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result.replace(new RegExp(escaped, 'g'), '<*>');
      }
    }
    return result;
  }

  /**
   * Post-process the template:
   * - Merge consecutive <*> markers into a single <*>
   * - Clean up stray delimiter characters around <*>
   */
  private postProcess(template: string): string {
    let result = template;

    // Merge consecutive <*> markers (up to 3 passes)
    for (let i = 0; i < 3; i++) {
      result = result.replace(/(<\*>\s*)+<\*>/g, '<*>');
      result = result.replace(/(<\*>,\s*)+<\*>/g, '<*>');
      result = result.replace(/(<\*>\+\s*)+<\*>/g, '<*>');
      result = result.replace(/(<\*>#+)<\*>/g, '<*>');
      result = result.replace(/<\*>%\s*/g, '<*>');
      result = result.replace(/<\*>\.<\*>/g, '<*>.<*>');
    }

    return result;
  }
}
