import { DrainDataPlane, type DrainDataPlaneConfig } from '../data/DrainDataPlane.js';
import type { ILLMProvider } from '../llm/ILLMProvider.js';
import type { IEmbeddingProvider } from '../embedding/IEmbeddingProvider.js';
import type { MultiLangTokenizer } from '../preprocessing/MultiLangTokenizer.js';
import type { LogInputAdapter } from '../preprocessing/adapters/LogInputAdapter.js';
import type { VariableTypeClassifier } from '../classifier/VariableTypeClassifier.js';
import { PartitioningEngine, type MissEvent } from '../control/PartitioningEngine.js';
import { DppSampler } from '../control/DppSampler.js';
import { MissAccumulator } from '../control/MissAccumulator.js';
import { SelfReflectionLoop } from '../control/SelfReflectionLoop.js';
import { ModelRouter } from '../control/ModelRouter.js';
import { AdaptiveTemplateCache } from '../cache/AdaptiveTemplateCache.js';
import { GranularityCalibrator } from '../granularity/GranularityCalibrator.js';
import type { GranularityConfig } from '../granularity/GranularityDistance.js';
import { SynLogTemplateRefiner } from '../control/SynLogTemplateRefiner.js';
import type { RefinementInput } from '../control/SynLogTemplateRefiner.js';
import type { LogParseResult, PipelineLayerConfig, PipelineStats } from './types.js';
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
  /** Model router for multi-model LLM selection. Auto-created if local+remote providers given. */
  readonly modelRouter?: ModelRouter;
  /** Local (fast/free) LLM provider for ModelRouter routing. */
  readonly localLlmProvider?: ILLMProvider;
  /** Remote (powerful) LLM provider for ModelRouter routing. */
  readonly remoteLlmProvider?: ILLMProvider;
  /** Pipeline layer configuration (merged with defaults). */
  readonly layers?: Partial<PipelineLayerConfig>;
  /** Pre-configured multi-language tokenizer (optional). */
  readonly tokenizer?: MultiLangTokenizer;
  /** Pre-configured log input adapter (optional). */
  readonly adapter?: LogInputAdapter;
  /** Pre-configured variable type classifier (optional). */
  readonly classifier?: VariableTypeClassifier;
  /**
   * Drain engine configuration (drain-ts v1.1.0+).
   *
   * Controls engine selection (Drain vs JaccardDrain), extended masking,
   * AEL similarity merging, adjacent fusion, and other low-level parameters.
   */
  readonly drain?: DrainDataPlaneConfig;
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
  private readonly modelRouter?: ModelRouter;

  // Control plane (wired when llmProvider is present)
  private readonly accumulator?: MissAccumulator;
  private readonly partitioner?: PartitioningEngine;
  private readonly sampler = new DppSampler();
  private readonly cache = new AdaptiveTemplateCache();

  // SynLog refinement: track logs per drain cluster for refinement
  private readonly clusterLogs = new Map<number, string[]>();

  // Concurrency safety: serialize parse() calls through a promise chain
  private parseQueue: Promise<void> = Promise.resolve();

  // Stats
  private totalProcessed = 0;
  private drainHits = 0;
  private drainMisses = 0;
  private cacheHits = 0;
  private llmCalls = 0;
  private llmTokensConsumed = 0;
  private modelStats = new Map<string, { calls: number; tokens: number }>();

  // Granularity calibration (HITL)
  private readonly calibrator = new GranularityCalibrator();

  // SynLogPlus-inspired template refiner (I1: wired into pipeline)
  private readonly synLogRefiner = new SynLogTemplateRefiner();

  private nextLogId = 0;

  constructor(pipelineConfig: LogParserPipelineConfig = {}) {
    // Resolve LLM provider: explicit provider > modelRouter > local/remote pair > none
    this.llmProvider = pipelineConfig.llmProvider
      ?? pipelineConfig.localLlmProvider
      ?? undefined;

    this.embeddingProvider = pipelineConfig.embeddingProvider;

    // Auto-create ModelRouter when local + remote providers are given
    // and no explicit modelRouter was provided.
    if (pipelineConfig.modelRouter) {
      this.modelRouter = pipelineConfig.modelRouter;
    } else if (pipelineConfig.localLlmProvider && pipelineConfig.remoteLlmProvider) {
      this.modelRouter = new ModelRouter(
        pipelineConfig.localLlmProvider,
        pipelineConfig.remoteLlmProvider,
      );
    }

    this.classifier = pipelineConfig.classifier;
    this.config = {
      ...defaultPipelineConfig(),
      ...pipelineConfig.layers,
    };
    this.drain = new DrainDataPlane(pipelineConfig.drain ?? {});

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
   * Parse a single log message. Synchronous for single-threaded use.
   * For concurrent access, use {@link parseAsync}.
   */
  parse(logMessage: string): LogParseResult {
    return this.parseSync(logMessage);
  }

  /**
   * Concurrency-safe parse via internal serialization promise chain.
   * Use when calling parse() from multiple concurrent contexts.
   */
  async parseAsync(logMessage: string): Promise<LogParseResult> {
    return new Promise((resolve) => {
      this.parseQueue = this.parseQueue.then(() => {
        resolve(this.parseSync(logMessage));
      });
    });
  }

  /**
   * Synchronous parse implementation (internal use only).
   */
  private parseSync(logMessage: string): LogParseResult {
    this.totalProcessed++;
    const logId = String(this.nextLogId++);

    const result = this.drain.train(logMessage);

    // Track log message for SynLog refinement per cluster
    if (!this.clusterLogs.has(result.templateId)) {
      this.clusterLogs.set(result.templateId, []);
    }
    this.clusterLogs.get(result.templateId)!.push(logMessage);

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

    this.drainMisses++;

    if (this.accumulator) {
      this.accumulator.push({
        logMessage,
        tokens: result.tokens,
        timestamp: Date.now(),
      });
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
   * Parse a batch of log messages efficiently. Synchronous — uses internal serialization.
   */
  parseBatch(logs: readonly string[]): LogParseResult[] {
    return logs.map((log) => this.parseSync(log));
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

      // Step 4: Self-reflection loop for template extraction (routed through ModelRouter)
      const activeProvider = this.modelRouter?.select(selected) ?? this.llmProvider;
      const modelId = activeProvider.modelId;

      const reflector = new SelfReflectionLoop(
        activeProvider,
        this.config.controlPlane.selfReflection.enabled
          ? { maxIterations: this.config.controlPlane.selfReflection.maxIterations }
          : { maxIterations: 1 },
      );
      const result = await reflector.refine(selected);

      this.llmCalls++;
      const existing = this.modelStats.get(modelId) ?? { calls: 0, tokens: 0 };
      existing.calls++;
      if (result.usage) {
        const tokens = result.usage.promptTokens + result.usage.completionTokens;
        this.llmTokensConsumed += tokens;
        existing.tokens += tokens;
      }
      this.modelStats.set(modelId, existing);

      // Step 5: Cache the extracted template AND register it back to drain-ts.
      // Registering back to drain-ts is critical: subsequent logs matching
      // this template hit drain directly, avoiding redundant LLM calls.
      // Without this, every occurrence of the same pattern triggers a new
      // LLM invocation.
      const templateTokens = result.template.split(/\s+/).filter(Boolean);
      this.cache.put({
        id: `llm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        template: result.template,
        tokens: templateTokens,
      });
      this.drain.registerTemplate(templateTokens);
    }
  }

  /**
   * Flush any pending miss events in the accumulator.
   * Call before shutting down to ensure all events are processed.
   */
  async flush(): Promise<void> {
    await this.accumulator?.flush();
  }

  /**
   * Run SynLogPlus-inspired template refinement on all drain clusters.
   *
   * Applies the two-phase template refinement pipeline (regex anonymization
   * + cross-group constant verification) to every cluster with ≥4 samples.
   * Refined templates are registered back to drain for subsequent parsing.
   *
   * @returns Number of templates changed by refinement.
   */
  refineTemplates(): number {
    const refinementInputs: RefinementInput[] = [];

    for (const [clusterId, logs] of this.clusterLogs) {
      if (logs.length < 4) continue; // Need enough samples per SynLogPlus algorithm
      // Get current drain template for this cluster
      const drainTemplate = this.resolveClusterTemplate(clusterId);
      if (!drainTemplate) continue;

      refinementInputs.push({
        logs,
        drainTemplate,
      });
    }

    if (refinementInputs.length === 0) return 0;

    const results = this.synLogRefiner.refine(refinementInputs);
    let changedCount = 0;

    // Walk back: match refined results to cluster IDs via original refinementInputs order
    let idx = 0;
    for (const [clusterId, logs] of this.clusterLogs) {
      if (logs.length < 4) continue;
      const result = results[idx++];
      if (!result || !result.changed) continue;

      // Register refined template back to drain for future parsing
      const refinedTokens = result.refinedTemplate.split(/\s+/).filter(Boolean);
      this.drain.registerTemplate(refinedTokens);
      changedCount++;
    }

    return changedCount;
  }

  /**
   * Resolve the current template string for a drain cluster ID.
   * Falls back to token reconstruction from the drain state.
   */
  private resolveClusterTemplate(clusterId: number): string | null {
    // DrainDataPlane does not expose getTemplate(clusterId) directly.
    // We reconstruct by matching: the drain.train() result gives us
    // templateId → template mapping at parse time. Use the last logged
    // template for this cluster from the tracking map.
    // This is sufficient for SynLog refinement which only needs the
    // original drain template as a baseline for comparison.
    const logs = this.clusterLogs.get(clusterId);
    if (!logs || logs.length === 0) return null;

    // Re-run the first log through train() to get its template
    // Actually, avoid side-effect — just use the train result from matching.
    // We don't have the original template stored. Use drain.match() instead.
    const match = this.drain.match(logs[0]!);
    if (!match) return null;
    return match.template;
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

  /**
   * Calibrate granularity preference using Human-in-the-Loop samples.
   *
   * After collecting 32 samples, the calibrator automatically learns
   * whether the user prefers coarse, balanced, or fine variable boundaries.
   *
   * @param samples - Array of { log, expectedTemplate } pairs.
   */
  calibrateGranularity(
    samples: readonly { readonly log: string; readonly expectedTemplate: string }[],
  ): void {
    for (const s of samples) {
      this.calibrator.addSample(s.log, s.expectedTemplate);
    }
  }

  /** The current granularity calibration config, if calibrated. */
  get granularityConfig(): GranularityConfig | null {
    return this.calibrator.config;
  }

  /** Runtime statistics including per-model breakdown if ModelRouter is wired. */
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
      modelStats: this.modelStats.size > 0 ? new Map(this.modelStats) : undefined,
    };
  }

  // ============================================================
  // Persistence: save/load full pipeline state
  // ============================================================

  /** Serialize full pipeline state for persistence. */
  exportState(): Record<string, unknown> {
    return {
      version: '1.0.0',
      drainSnapshot: Array.from(this.drain.saveSnapshot()),
      totalProcessed: this.totalProcessed,
      drainHits: this.drainHits,
      drainMisses: this.drainMisses,
      cacheHits: this.cacheHits,
      llmCalls: this.llmCalls,
      llmTokensConsumed: this.llmTokensConsumed,
      nextLogId: this.nextLogId,
      clusterLogsCount: this.clusterLogs.size,
    };
  }

  /** Export serializable pipeline state as a JSON string. */
  serializeState(): string {
    return JSON.stringify(this.exportState());
  }

  /**
   * Restore pipeline from a serialized state string.
   * Platform-agnostic — works in Node.js and Browser.
   */
  importState(json: string): void {
    const state = JSON.parse(json);
    if (state.drainSnapshot && Array.isArray(state.drainSnapshot)) {
      this.drain.loadSnapshot(new Uint8Array(state.drainSnapshot));
    }
    if (typeof state.totalProcessed === 'number') this.totalProcessed = state.totalProcessed;
    if (typeof state.nextLogId === 'number') this.nextLogId = state.nextLogId;
  }

  /**
   * Create a new pipeline from a serialized state string.
   * Platform-agnostic — works in Node.js and Browser.
   */
  static deserialize(json: string, config?: LogParserPipelineConfig): LogParserPipeline {
    const pipeline = new LogParserPipeline(config);
    pipeline.importState(json);
    return pipeline;
  }
}
