import { DrainDataPlane } from '../data/DrainDataPlane.js';
import type { ILLMProvider } from '../llm/ILLMProvider.js';
import type { IEmbeddingProvider } from '../embedding/IEmbeddingProvider.js';
import type { MultiLangTokenizer } from '../preprocessing/MultiLangTokenizer.js';
import type { LogInputAdapter } from '../preprocessing/adapters/LogInputAdapter.js';
import type { VariableTypeClassifier } from '../classifier/VariableTypeClassifier.js';
import type { LogParseResult, PipelineLayerConfig, PipelineStats } from './types.js';
import { defaultPipelineConfig } from './types.js';

/**
 * Configuration for constructing a LogParserPipeline.
 *
 * All providers are optional. When omitted:
 * - llmProvider undefined → pure drain-ts mode (zero LLM)
 * - embeddingProvider undefined → built-in TF-IDF fallback
 * - controlPlane enabled but no llmProvider → control plane skipped
 */
export interface LogParserPipelineConfig {
  /** LLM provider. undefined = pure drain-ts mode. */
  readonly llmProvider?: ILLMProvider;
  /** Embedding provider. undefined = built-in TF-IDF. */
  readonly embeddingProvider?: IEmbeddingProvider;
  /** Pipeline layer configuration (merged with defaults). */
  readonly layers?: Partial<PipelineLayerConfig>;
  /** Pre-configured multi-language tokenizer (optional). */
  readonly tokenizer?: MultiLangTokenizer;
  /** Pre-configured log input adapter (optional). */
  readonly adapter?: LogInputAdapter;
  /** Pre-configured variable type classifier (optional). */
  readonly classifier?: VariableTypeClassifier;
}

/**
 * Main pipeline facade for intelligent log parsing.
 *
 * Composes the data plane (drain-ts), optional control plane (LLM),
 * and optional embedding layer into a single entry point.
 *
 * Usage:
 * ```typescript
 * // Pure drain-ts (zero LLM, zero network)
 * const pipeline = new LogParserPipeline();
 *
 * // With LLM enhancement
 * const pipeline = new LogParserPipeline({ llmProvider: myLlm });
 *
 * // With semantic embedding
 * const pipeline = new LogParserPipeline({ embeddingProvider: myEmb });
 * ```
 */
export class LogParserPipeline {
  private readonly drain: DrainDataPlane;
  private readonly config: PipelineLayerConfig;
  private readonly llmProvider?: ILLMProvider;
  private readonly embeddingProvider?: IEmbeddingProvider;
  private readonly classifier: VariableTypeClassifier | undefined;

  // Stats
  private totalProcessed = 0;
  private drainHits = 0;
  private drainMisses = 0;

  private nextLogId = 0;

  constructor(pipelineConfig: LogParserPipelineConfig = {}) {
    this.llmProvider = pipelineConfig.llmProvider;
    this.embeddingProvider = pipelineConfig.embeddingProvider;
    this.classifier = pipelineConfig.classifier;
    this.config = {
      ...defaultPipelineConfig(),
      ...pipelineConfig.layers,
    };
    this.drain = new DrainDataPlane();
  }

  /**
   * Parse a single log message.
   *
   * Routes through the data plane (drain-ts). When the data plane
   * reports a "miss" (new cluster created) and an ILLMProvider is
   * configured, the log message is queued for asynchronous batch
   * processing through the control plane.
   *
   * In I1, only the data plane path is active — control plane
   * integration arrives in I3.
   */
  parse(logMessage: string): LogParseResult {
    this.totalProcessed++;
    const logId = String(this.nextLogId++);

    const result = this.drain.train(logMessage);

    if (result.kind === 'match') {
      this.drainHits++;
      return {
        logId,
        template: result.template,
        templateId: result.templateId,
        parameters: result.parameters,
        source: 'drain-strict',
      };
    }

    // Miss — new cluster created by drain-ts
    this.drainMisses++;
    return {
      logId,
      template: result.template,
      templateId: result.templateId,
      parameters: result.parameters,
      source: 'drain-loose',
    };
  }

  /**
   * Inference mode: classify logs without modifying state.
   * Returns null for logs that don't match any known template.
   */
  match(logMessage: string): LogParseResult | null {
    const match = this.drain.match(logMessage);
    if (!match) return null;
    return {
      logId: String(this.nextLogId++),
      template: match.template,
      templateId: match.templateId,
      parameters: [],
      source: 'drain-strict',
    };
  }

  /** The configured LLM provider, if any. */
  get llm(): ILLMProvider | undefined {
    return this.llmProvider;
  }
  /** The configured embedding provider, if any. */
  get embedding(): IEmbeddingProvider | undefined {
    return this.embeddingProvider;
  }
  /** The configured variable type classifier. */
  get typeClassifier(): VariableTypeClassifier | undefined {
    return this.classifier;
  }
  /** The active pipeline configuration. */
  get layerConfig(): PipelineLayerConfig {
    return this.config;
  }

  /** Runtime statistics. */
  get stats(): PipelineStats {
    return {
      totalProcessed: this.totalProcessed,
      drainHits: this.drainHits,
      drainMisses: this.drainMisses,
      cacheHits: 0,
      llmCalls: 0,
      llmTokensConsumed: 0,
      templateCount: this.drain.templateCount,
      cacheHitRate: 0,
    };
  }
}
