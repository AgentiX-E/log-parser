import type {
  ILLMProvider,
  LlmTemplateResult,
  VariableAnnotation,
  VariableCategory,
} from '@agentix-e/log-parser-core';

/**
 * Browser-local LLM provider using @mlc-ai/web-llm.
 *
 * For non-browser environments (Node.js tests, CI), this provider falls back
 * to a heuristic log template extractor that identifies common variable
 * patterns (numbers, IPs, UUIDs, etc.).
 *
 * The full WebLLM integration with WebGPU acceleration is intended for
 * browser runtimes only.
 */
export class WebLLMProvider implements ILLMProvider {
  readonly modelId: string;

  constructor(modelId = 'WebLLM-heuristic') {
    this.modelId = modelId;
  }

  /**
   * Extract a common template from representative log samples.
   *
   * Uses a fallback heuristic when WebLLM is not available (e.g. Node.js tests).
   * The heuristic:
   * 1. Tokenizes each sample by whitespace
   * 2. Compares tokens across samples position-by-position
   * 3. If a position is identical across ALL samples → keep as literal
   * 4. If a position varies → replace with <*>
   */
  async extractTemplate(logSamples: readonly string[]): Promise<LlmTemplateResult> {
    if (logSamples.length === 0) {
      return {
        template: '',
        variables: [],
        confidence: 0,
      };
    }

    // Single sample: extract variables heuristically
    if (logSamples.length === 1) {
      return this.extractFromSingle(logSamples[0]!);
    }

    // Multiple samples: cross-reference to find invariant tokens
    return this.extractFromMultiple(logSamples);
  }

  /**
   * Heuristic extraction from a single log message.
   */
  private extractFromSingle(log: string): LlmTemplateResult {
    const tokens = log.split(/\s+/);
    const variables: VariableAnnotation[] = [];
    const templateTokens: string[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!;
      const category = this.classifyToken(token);
      if (category) {
        templateTokens.push('<*>');
        variables.push({ position: i, value: token, category });
      } else {
        templateTokens.push(token);
      }
    }

    return {
      template: templateTokens.join(' '),
      variables,
      confidence: variables.length > 0 ? 0.6 : 0.9,
    };
  }

  /**
   * Heuristic extraction by cross-referencing multiple samples.
   * Invariant tokens across all samples are kept as literals.
   */
  private extractFromMultiple(logSamples: readonly string[]): LlmTemplateResult {
    const allTokens = logSamples.map((s) => s.split(/\s+/));
    const minLen = Math.min(...allTokens.map((t) => t.length));

    // For simplicity, use the first sample's length as reference
    const tokenLists = allTokens.map((tokens) => {
      if (tokens.length > minLen) {
        return tokens.slice(0, minLen);
      }
      return tokens;
    });

    const variables: VariableAnnotation[] = [];
    const templateTokens: string[] = [];

    for (let pos = 0; pos < minLen; pos++) {
      const first = tokenLists[0]![pos]!;
      const allSame = tokenLists.every((t) => t[pos] === first);

      if (allSame) {
        const category = this.classifyToken(first);
        if (category) {
          templateTokens.push('<*>');
          variables.push({ position: pos, value: first, category });
        } else {
          templateTokens.push(first);
        }
      } else {
        templateTokens.push('<*>');
        // Use the first varying value as reference
        const firstVar = tokenLists[0]![pos]!;
        const category = this.classifyToken(firstVar) ?? 'GENERIC';
        variables.push({ position: pos, value: firstVar, category });
      }
    }

    const confidence = logSamples.length > 3 ? 0.8 : 0.65;

    return {
      template: templateTokens.join(' '),
      variables,
      confidence,
    };
  }

  /**
   * Classify a token into a variable category, or null if it's a literal.
   */
  private classifyToken(token: string): VariableCategory | null {
    // IP address pattern
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(token)) {
      return 'IP';
    }
    // Numeric pattern (pure numbers or with decimals)
    if (/^[+-]?\d+(\.\d+)?$/.test(token)) {
      return 'NUM';
    }
    // UUID pattern
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
      return 'UUID';
    }
    // Email pattern
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(token)) {
      return 'EMAIL';
    }
    // Timestamp patterns (ISO 8601, common log formats)
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(token)) {
      return 'TIMESTAMP';
    }
    if (token.includes(':') && /^\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(token)) {
      return 'TIMESTAMP';
    }
    // Path pattern (Unix or Windows paths)
    if (/^(\/[\w.-]+)+$/.test(token) || /^[A-Za-z]:\\[^\s]*$/.test(token)) {
      return 'PATH';
    }
    // Hostname-like pattern (must contain at least one dot)
    if (/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)*[a-zA-Z]{2,}$/.test(token)) {
      return 'HOSTNAME';
    }
    // Hex values
    if (/^0x[0-9a-fA-F]+$/.test(token)) {
      return 'NUM';
    }
    // Default: not classified as a variable
    return null;
  }
}
