/**
 * LLM Provider abstraction.
 *
 * Design principle: core defines the interface contract ONLY.
 * Implementations live in application-layer packages (log-parser-llm, log-parser-webllm)
 * or user-provided custom implementations.
 *
 * Consumers:
 *   1. `npm install @agentix-e/log-parser-llm` → convenient OpenAI-compatible impl
 *   2. `npm install @agentix-e/log-parser-webllm` → browser WebLLM impl
 *   3. Implement this interface yourself → inject into Pipeline
 *   4. Don't inject → Pipeline degrades to pure drain-ts mode (zero LLM)
 *
 * Reference pattern: @agentix-e/nl2spel IVendorProvider
 */

/** Variable category types recognized in log messages. */
export type VariableCategory =
  | 'IP'
  | 'NUM'
  | 'PATH'
  | 'UUID'
  | 'EMAIL'
  | 'TIMESTAMP'
  | 'HOSTNAME'
  | 'GENERIC';

/** A single variable annotation extracted by the LLM. */
export interface VariableAnnotation {
  /** Zero-based position index in the template token sequence. */
  readonly position: number;
  /** The original variable value from the log message. */
  readonly value: string;
  /** The detected variable category. */
  readonly category: VariableCategory;
}

/** Result of an LLM template extraction call. */
export interface LlmTemplateResult {
  /** Extracted template string, e.g. "User <*> logged in from <IP>". */
  readonly template: string;
  /** NER-style variable annotations. */
  readonly variables: readonly VariableAnnotation[];
  /** Confidence score [0, 1]. */
  readonly confidence: number;
  /** Token consumption statistics for cost tracking. */
  readonly usage?: {
    readonly promptTokens: number;
    readonly completionTokens: number;
  };
}

/**
 * LLM Provider interface.
 *
 * Implementations extract common log templates from a set of sample log messages
 * using NER-style prompting (identify variables, don't "generate" templates).
 */
export interface ILLMProvider {
  /** Unique model identifier used in logs and metrics. */
  readonly modelId: string;

  /**
   * Extract a common template from representative log samples.
   *
   * Uses NER-style prompting: annotate variable positions and types
   * rather than generating a template string from scratch.
   *
   * @param logSamples - Representative log samples (pre-selected by DPP sampling).
   * @returns Extracted template, variable annotations, and confidence.
   */
  extractTemplate(logSamples: readonly string[]): Promise<LlmTemplateResult>;
}
