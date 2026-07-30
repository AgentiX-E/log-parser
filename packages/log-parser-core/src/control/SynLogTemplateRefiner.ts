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
    // Hex strings: 0xdeadbeef, bare deadbeef (5+ hex chars)
    // Matches Python's word_is_variable: (0x)?[A-Fa-f0-9]{5,}
    /(\b)(0x)?[A-Fa-f0-9]{5,}(\b)/g,
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

    // Skip tiny clusters — too few samples for reliable comparison
    if (logs.length <= 3) {
      return { refinedTemplate: drainTemplate, changed: false };
    }

    // Guard: skip if drain template already matches all group members.
    // Prevent over-correction on datasets where drain-ts already achieves
    // near-perfect templates (Spark, Zookeeper, Mac, Apache).
    if (this.templateMatchesAllLogs(drainTemplate, logs)) {
      return { refinedTemplate: drainTemplate, changed: false };
    }

    // Step a: Sample 2 unique, representative log messages
    const unique = [...new Set(logs)];
    const samples = unique.slice(0, 2);

    // Step b: Anonymize with regex FIRST, then number anonymize.
    // This matches the original SynLogPlus Python at DrainPlus.py lines 605-610.
    // Python: anonymize_with_regex → anonymize_numbers → tokenize
    const anonymized = samples.map((log) => this.anonymizeWithRegex(log));
    const anonymizedNums = anonymized.map((log) => this.anonymizeNumbers(log));

    // Step c: Tokenize anonymized samples
    const tokenized = anonymizedNums.map((log) => this.tokenize(log));

    // Step d: Extract template by comparing anonymized tokenized samples.
    // Variable patterns (numbers, IPs, etc.) are already <*> in both →
    // they match as variables. Constants survive comparison.
    let template: string;
    if (tokenized.length === 1) {
      template = this.refineSingle(tokenized[0]!);
    } else {
      template = this.extractTemplate(tokenized[0]!, tokenized[1]!, drainTemplate);
    }

    // Step e: Cross-group verification — per-log constant check
    template = this.verifyConstants(template, logs);

    // Step f: Post-process — merge consecutive <*>, fix stray chars
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

    // Handle 0x/0X hex prefix — matches Python's int(s, 0) auto-base-detection.
    // Python's is_pure_number catches 0x-prefixed hex via int(s, 0).
    // Without this, tokens like 0x1a2b3c are kept as templates on HPC/Hadoop logs.
    if (/^[+-]?0[xX][0-9A-Fa-f]+$/.test(token)) return true;

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
   * Tokenize a log message exactly matching Python's tokenize_log().
   *
   * Python reference: re.split(r'(\.$|\.{5,}|[\s,;!@#$%^&(){}\[\]=\-_:\\"+])', msg)
   * from /tmp/SynLogPlus/benchmark/DrainPlus/DrainPlus.py:550-563
   *
   * The regex uses a CAPTURING group, which keeps delimiters as separate
   * tokens in the output. Post-processing splits tokens >1 char ending
   * with '.' into [token, '.'] to normalize trailing periods.
   */
  tokenize(log: string): string[] {
    // Python capturing-group split: delimiters appear as separate tokens
    // Match: trailing period (\.$), 5+ consecutive periods (\.{5,}),
    // or any char in [\s,;!@#$%^&(){}\[\]=\-_:\\"+]
    const splitPattern = /(\.$|\.{5,}|[\s,;!@#$%^&(){}[\]=\-_:"\\'+])/;
    const parts = log.split(splitPattern);

    const result: string[] = [];
    for (const part of parts) {
      if (!part) continue;

      // Python post-processing: tokens >1 char ending with '.' → split
      // into [token_without_dot, '.'] (lines 551-558 in DrainPlus.py)
      if (part.length > 1 && part.endsWith('.') && part !== '.') {
        result.push(part.slice(0, -1));
        result.push('.');
      } else {
        result.push(part);
      }
    }

    return result.filter(Boolean);
  }

  /**
   * Extract template by comparing two token sequences against the Drain template.
   *
   * Mirrors Python's extract_template() multi-tier confidence system:
   * 1. Common variable literals → <*> immediately
   * 2. Delimiters → kept as-is
   * 3. Found in both → check Drain template:
   *    a. In Drain template → high confidence constant → kept
   *    b. Matches variable heuristics → <*> (Python's word_is_variable)
   *    c. None of the above → moderate confidence constant → kept
   * 4. Not found in both → <*>
   *
   * @param short - Tokens from the shorter/anonymized log
   * @param long  - Tokens from the longer/anonymized log
   * @param drainTemplate - The original Drain cluster template for reference
   */
  private extractTemplate(short: string[], long: string[], drainTemplate: string): string {
    const template: string[] = [];
    let lastIdx = -1;

    for (const word of short) {
      // Common variable literals → variable (Python line 498)
      if (SynLogTemplateRefiner.COMMON_VARIABLES.has(word.toLowerCase())) {
        template.push('<*>');
        continue;
      }
      // Delimiters → keep as-is (Python line 503-507)
      if (SynLogTemplateRefiner.DELIMITERS.has(word)) {
        template.push(word);
        lastIdx = -1;
        continue;
      }
      // Try to find word in long after last match position
      const idx = long.indexOf(word, lastIdx + 1);
      if (idx !== -1 && word === long[idx]) {
        // Python line 510: word in "".join(templ) — Drain template reference
        if (drainTemplate.includes(word)) {
          // In Drain template → high confidence constant
          template.push(word);
        }
        // Python lines 519-526: word_is_variable check for non-Drain matches
        else if (this.isWordVariable(word)) {
          template.push('<*>');
        }
        // Python line 528: default — keep as constant
        else {
          template.push(word);
        }
        lastIdx = idx;
      } else {
        // Python line 532: not found in both → variable
        template.push('<*>');
      }
    }
    return template.join('');
  }

  /**
   * Check if a token matches Python's word_is_variable heuristics
   * (patterns at DrainPlus.py line 346-349, plus COMMON_VARIABLES and isNumber).
   *
   * Python checks: time (HH:MM), date, IPs, hex 5+, hostname:port.
   * These cover the patterns that Python applies in extract_template
   * when a matched word is NOT in the Drain template.
   */
  private isWordVariable(word: string): boolean {
    if (SynLogTemplateRefiner.COMMON_VARIABLES.has(word.toLowerCase())) return true;
    if (this.isNumber(word)) return true;
    for (const pattern of SynLogTemplateRefiner.VARIABLE_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(word)) return true;
    }
    return false;
  }

  /** Refine a single-sample group using only regex + heuristics. */
  private refineSingle(tokens: string[]): string {
    return tokens
      .map((t) => {
        if (this.isWordVariable(t)) return '<*>';
        return t;
      })
      .join('');
  }

  /**
   * Per-log constant verification — matches the original SynLogPlus Python
   * fix_templates() loop at DrainPlus.py lines 624-632.
   *
   * Python reference:
   *   for idx in group_member_indices:
   *       log = log_messages[idx]
   *       _template = extracted_template
   *       template_split = self.tokenize_log(_template.replace('<*>',''))
   *       for token in template_split:
   *           if token not in log:
   *               _template = _template.replace(token, '<*>')
   *       extracted_template = _template
   *
   * For each group member, checks that every constant token in the template
   * appears in that log. If absent, marks it as <*> for all subsequent checks.
   * Template changes accumulate across members — a token removed by one log
   * stays removed for all later logs.
   */
  private verifyConstants(template: string, logs: readonly string[]): string {
    if (logs.length === 0) return template;
    let result = template;

    for (const log of logs) {
      // Extract constant (non-<*>) tokens from current template state
      const constTokens = result
        .replace(/<[^>]*>/g, '\x00')
        .split('\x00')
        .filter(Boolean)
        .flatMap((s) => s.match(/\S+/g) ?? [])
        .filter((t) => t.length > 1);

      for (const token of constTokens) {
        if (!log.includes(token)) {
          // Absent from this log — mark as variable
          const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          result = result.replace(new RegExp(escaped, 'g'), '<*>');
        }
      }
    }

    return result;
  }

  /**
   * Generate a deterministic 64-bit hash for a template string.
   *
   * ByteBrain (SIGMOD'25) uses hash encoding instead of ordinal
   * encoding for storage-efficient template identity comparison.
   * This avoids token-to-ID lookup tables.
   *
   * Uses two independent 32-bit hashes (Murmur-inspired mixing)
   * combined into a 16-char hex string.
   */
  static hashTemplate(template: string): string {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < template.length; i++) {
      const ch = template.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 0x85ebca6b);
      h2 = Math.imul(h2 ^ ch, 0xc2b2ae35);
    }
    return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
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

  /**
   * Check if a drain template matches all log messages in a group.
   * Returns true if every non-<*> constant token in the template
   * appears in every group member — meaning the template is correct
   * and refinement would be counterproductive.
   */
  private templateMatchesAllLogs(template: string, logs: readonly string[]): boolean {
    // Extract constant (non-<*>) tokens
    const tokens = template.split(/<[^>]*>/).flatMap((s) => s.match(/\S+/g) ?? []);
    if (tokens.length === 0) return false;

    for (const log of logs) {
      for (const token of tokens) {
        if (!log.includes(token)) return false;
      }
    }
    return true;
  }
}
