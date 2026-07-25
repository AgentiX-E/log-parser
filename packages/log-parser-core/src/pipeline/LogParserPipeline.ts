import { DrainDataPlane } from '../data/DrainDataPlane.js';
import type { ILLMProvider } from '../llm/ILLMProvider.js';
import type { IEmbeddingProvider } from '../embedding/IEmbeddingProvider.js';
import type { MultiLangTokenizer } from '../preprocessing/MultiLangTokenizer.js';
import type { LogInputAdapter } from '../preprocessing/adapters/LogInputAdapter.js';
import type { VariableTypeClassifier } from '../classifier/VariableTypeClassifier.js';
import { PartitioningEngine, type MissEvent } from '../control/PartitioningEngine.js';
import { DppSampler } from '../control/DppSampler.js';
import { MissAccumulator } from '../control/MissAccumulator.js';
import { SelfReflectionLoop } from '../control/SelfReflectionLoop.js';
import { AdaptiveTemplateCache } from '../cache/AdaptiveTemplateCache.js';
import type { LogTemplate, LogParseResult, PipelineLayerConfig, PipelineStats } from './types.js';
import { defaultPipelineConfig } from './types.js';

/**
 * Configuration for constructing a LogParserPipeline.
 *
 * All providers are optional. When omitted:
 * - llmProvider undefined → pure drain-ts mode (zero LLM)
 * - embeddingProvider undefined → built-in TF-IDF fallback
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
 * **Control plane wiring (I3)**:
 * When an llmProvider is injected, miss events from the data plane
 * are queued into a {@link MissAccumulator}. Batches flow through:
 *   MissAccumulator → PartitioningEngine → DppSampler → SelfReflectionLoop → Cache
 *
 * **DI-driven architecture**:
 * - ILLMProvider injected → LLM-enhanced mode
 * - ILLMProvider undefined → pure drain-ts mode (always available)
 * - IEmbeddingProvider injected → semantic embeddings in partitioning
 * - IEmbeddingProvider undefined → built-in TF-IDF (always available)
 *
 * @example Pure drain-ts (zero LLM, zero network)
 * ```typescript
 * const pipeline = new LogParserPipeline();
 * ```
 *
 * @example With LLM enhancement
 * ```typescript
 * const pipeline = new LogParserPipeline({ llmProvider: myLlm });
 * ```
 */
export class LogParserPipeline {
  private readonly drain: DrainDataPlane;
  private readonly config: PipelineLayerConfig;
  private readonly llmProvider?: ILLMProvider;
  private readonly embeddingProvider?: IEmbeddingProvider;
  private readonly classifier: VariableTypeClassifier | undefined;

  // Control plane (wired when llmProvider is present)
  private readonly accumulator?: MissAccumulator;
  private readonly partitioner?: PartitioningEngine;
  private readonly sampler = new DppSampler();
  private readonly cache = new AdaptiveTemplateCache();

  // Stats
  private totalProcessed = 0;
  private drainHits = 0;
  private drainMisses = 0;
  private cacheHits = 0;
  private llmCalls = 0;
  private llmTokensConsumed = 0;

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

    // Wire control plane when LLM provider is injected
    if (this.llmProvider) {
      this.partitioner = new PartitioningEngine(this.embeddingProvider);
      this.accumulator = new MissAccumulator(
        {
          maxSize: this.config.controlPlane.batch.maxSize,
          maxWaitMs: this.config.controlPlane.batch.maxWaitMs,
        },
        (batch) => this.processControlBatch(batch),
      );
    }
  }

  /**
   * Parse a single log message.
   *
   * When the data plane reports a "miss" and an ILLMProvider is
   * configured, the miss event is queued for asynchronous batch
   * processing through the full control plane chain:
   * MissAccumulator → PartitioningEngine → DppSampler → SelfReflectionLoop.
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

    // If control plane is wired, enqueue for async LLM processing
    if (this.accumulator) {
      const missEvent: MissEvent = {
        logMessage,
        tokens: result.tokens,
        timestamp: Date.now(),
      };
      this.accumulator.push(missEvent);
    }

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

  /**
   * Process a batch of miss events through the full control plane.
   *
   * Pipeline: Cache check → Partition → DPP sample → LLM extract → Register
   */
  private async processControlBatch(batch: readonly MissEvent[]): Promise<void> {
    if (!this.llmProvider || !this.partitioner) return;

    // Step 1: Check adaptive cache for each miss event
    const cacheMisses: MissEvent[] = [];
    for (const event of batch) {
      const cached = this.cache.get(event.tokens);
      if (cached) {
        this.cacheHits++;
      } else {
        cacheMisses.push(event);
      }
    }

    if (cacheMisses.length === 0) return;

    // Step 2: Partition cache misses into clusters
    const clusters = await this.partitioner.partition(cacheMisses);

    // Step 3: For each cluster, sample representative logs and extract template
    for (const cluster of clusters) {
      const logMessages = cluster.map((e) => e.logMessage);
      const sampleCount = this.config.controlPlane.sampling.samplesPerBatch;

      // Select diverse representatives via DPP
      let selected: readonly string[];
      if (this.embeddingProvider && logMessages.length > sampleCount) {
        const vecResult = await this.embeddingProvider.embed(logMessages);
        const indices = this.sampler.sample(
          vecResult.vectors.map((v) => Array.from(v)),
          sampleCount,
        );
        selected = indices.map((i) => logMessages[i]!);
      } else {
        selected = logMessages.slice(0, sampleCount);
      }

      // Step 4: Self-reflection loop for template extraction
      const reflector = new SelfReflectionLoop(
        this.llmProvider,
        this.config.controlPlane.selfReflection.enabled
          ? { maxIterations: this.config.controlPlane.selfReflection.maxIterations }
          : { maxIterations: 1 },
      );
      const result = await reflector.refine(selected);

      this.llmCalls++;
      if (result.usage) {
        this.llmTokensConsumed += result.usage.promptTokens + result.usage.completionTokens;
      }

      // Step 5: Cache the extracted template
      const template: LogTemplate = {
        id: `llm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        template: result.template,
        tokens: result.template.split(/\s+/),
      };
      this.cache.put(template);
    }
  }

  /**
   * Flush any pending miss events in the accumulator.
   * Call before shutting down to ensure all events are processed.
   */
  async flush(): Promise<void> {
    await this.accumulator?.flush();
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
      cacheHits: this.cacheHits,
      llmCalls: this.llmCalls,
      llmTokensConsumed: this.llmTokensConsumed,
      templateCount: this.drain.templateCount,
      cacheHitRate: this.cache.size > 0 ? this.cache.hitRate : 0,
    };
  }
}
