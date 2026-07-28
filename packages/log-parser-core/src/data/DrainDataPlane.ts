import {
  TemplateMiner,
  TemplateMinerConfig,
  LogCluster,
  JaccardDrain,
  DEFAULT_MASKING_INSTRUCTIONS,
  type ExtractedParameter,
} from '@agentix-e/drain-ts';
import { ENHANCED_MASKING_INSTRUCTIONS } from '../masking/EnhancedMasking.js';
import type { DrainResult, DrainMatch } from '../pipeline/types.js';

/** Available Drain algorithm variants from drain-ts v1.1.0. */
export type DrainEngineType = 'Drain' | 'JaccardDrain';

/**
 * Configuration for the Drain data plane.
 *
 * Exposes drain-ts v1.1.0 capabilities: JaccardDrain engine selection,
 * extended masking presets, AEL-similarity cluster merging, and
 * adjacent-constant token fusion.
 */
export interface DrainDataPlaneConfig {
  /** Drain algorithm engine. Default: "Drain". */
  readonly engine?: DrainEngineType;
  /** Similarity threshold. Default: 0.4. */
  readonly simTh?: number;
  /** Parse tree depth (minimum 3). Default: 4. */
  readonly depth?: number;
  /** Max child nodes per tree level. Default: 100. */
  readonly maxChildren?: number;
  /** Max clusters (LRU eviction). null = unlimited. Default: null. */
  readonly maxClusters?: number | null;
  /**
   * Use extended masking instructions.
   * Includes PATH, HOST_PORT, BLOCK_ID, SYSLOG_NUM in addition to IP/NUM/HEX/UUID/EMAIL.
   * Default: false.
   */
  readonly extendedMasking?: boolean;
  /**
   * Enable AEL-style diff-ratio similarity for post-training cluster merge.
   * When true, similar clusters are reconciled after training completes.
   * Default: false.
   */
  readonly enableAELSimilarity?: boolean;
  /**
   * Enable adjacent constant token fusion via TokenNormalizer.
   * Automatically detects and fuses constant adjacent tokens
   * (e.g., "bytes", "4096", "sent" → may be fused to reduce fragmentation).
   * Default: false.
   */
  readonly enableAdjacentFusion?: boolean;
  /**
   * Enable param-count binning in the prefix tree root layer.
   * Groups messages with the same parameter count together.
   * Default: false (Drain3-compatible behavior).
   */
  readonly enableParamBinning?: boolean;
  /**
   * Enable affix-preserving parameterization.
   * Tokens with common prefixes/suffixes are parameterized in the middle
   * rather than replaced entirely (e.g., "bytes4096sent" → "bytes<*>sent").
   * Default: false.
   */
  readonly enableAffixPreserving?: boolean;
  /**
   * Enable post-training cluster merge pipeline.
   * When true, ClusterMergePipeline is applied after all messages
   * are processed to merge clusters representing the same template.
   * Default: false.
   */
  readonly enableClusterMerge?: boolean;
  /**
   * Optional preprocessor function applied to every log message BEFORE
   * masking and Drain clustering.
   */
  readonly preprocessor?: (content: string) => string;
}

/**
 * Build a TemplateMinerConfig from DrainDataPlaneConfig.
 *
 * Maps high-level log-parser config options to drain-ts v1.1.0's
 * expanded configuration surface.
 */
function buildDrainConfig(config: DrainDataPlaneConfig): TemplateMinerConfig {
  const masking = config.extendedMasking ? ENHANCED_MASKING_INSTRUCTIONS : DEFAULT_MASKING_INSTRUCTIONS;

  return TemplateMinerConfig.from({
    simTh: config.simTh ?? 0.4,
    depth: config.depth ?? 4,
    maxChildren: config.maxChildren ?? 100,
    maxClusters: config.maxClusters ?? null,
    maskingInstructions: masking,
    engine: config.engine ?? 'Drain',
    enableAELSimilarity: config.enableAELSimilarity ?? false,
    enableAdjacentFusion: config.enableAdjacentFusion ?? false,
    enableParamBinning: config.enableParamBinning ?? false,
    enableAffixPreserving: config.enableAffixPreserving ?? false,
    enableClusterMerge: config.enableClusterMerge ?? false,
    preprocessor: config.preprocessor,
  });
}

/**
 * Data plane wrapping @agentix-e/drain-ts v1.1.0.
 *
 * Provides the primary log template mining capability. This is the
 * "always available" layer — zero LLM, zero network, zero external services.
 *
 * With drain-ts v1.1.0, supports:
 * - Engine selection: standard Drain or JaccardDrain
 * - Extended masking: PATH, HOST_PORT, BLOCK_ID, SYSLOG_NUM
 * - AEL-similarity cluster merging
 * - Adjacent-constant token fusion
 * - Affix-preserving parameterization
 * - Param-count binning
 */
export class DrainDataPlane {
  readonly miner: TemplateMiner;
  private config: TemplateMinerConfig;

  constructor(config: DrainDataPlaneConfig = {}) {
    this.config = buildDrainConfig(config);
    this.miner = new TemplateMiner({ config: this.config });
  }

  /**
   * Update the active Drain configuration.
   *
   * Rebuilds the internal TemplateMiner with new parameters.
   * Existing clusters are preserved via snapshot export/import.
   */
  updateConfig(update: DrainDataPlaneConfig): void {
    const snapshot = this.saveSnapshot();
    this.config = buildDrainConfig(update);
    this.loadSnapshot(snapshot);
  }

  /**
   * Training mode: cluster a log message, potentially creating or updating templates.
   */
  train(logMessage: string): DrainResult {
    const result = this.miner.addLogMessage(logMessage);
    const tokens = this.miner.drain.getContentAsTokens(logMessage);
    const params = this.toExtractedParams(
      this.miner.extractParameters(result.templateMined, logMessage),
    );

    return {
      kind: result.changeType === 'cluster_created' ? 'miss' : 'match',
      templateId: result.clusterId,
      template: result.templateMined,
      parameters: params,
      tokens,
    };
  }

  /**
   * Inference mode: classify a log message against existing clusters
   * WITHOUT modifying state.
   */
  match(logMessage: string): DrainMatch | null {
    const cluster = this.miner.match(logMessage, 'fallback');
    if (!cluster) return null;
    return {
      templateId: cluster.clusterId,
      template: cluster.getTemplate(),
    };
  }

  // ─── drain-ts v1.1.0 capabilities ───

  /**
   * Merge similar clusters after training completes.
   *
   * Uses AEL-style cluster reconciliation when enableClusterMerge is true,
   * or AEL diff-ratio similarity when enableAELSimilarity is true.
   *
   * @returns Number of clusters merged.
   */
  mergeClusters(): number {
    return this.miner.mergeClusters();
  }

  /**
   * Pre-learn tokens from a training corpus.
   *
   * Feeds a batch of messages to TokenNormalizer pipeline for
   * pattern learning (e.g., AdjacentConstantFusion auto-detection).
   * Call this before parse() when using enableAdjacentFusion.
   */
  learnTokens(corpus: readonly string[]): void {
    this.miner.learnTokens(corpus);
  }

  /**
   * Get the underlying drain engine type.
   * Uses instanceof check against JaccardDrain for reliability.
   */
  get engineType(): DrainEngineType {
    return this.miner.drain instanceof JaccardDrain ? 'JaccardDrain' : 'Drain';
  }

  /** Total number of templates currently tracked. */
  get templateCount(): number {
    return this.miner.drain.idToCluster.size;
  }

  /** Total number of log messages processed. */
  get totalProcessed(): number {
    return this.miner.drain.getTotalClusterSize();
  }

  /**
   * Serialize the current Drain state to a byte buffer for persistence.
   */
  saveSnapshot(): Uint8Array {
    const clusters = Array.from(this.miner.drain.idToCluster.entries()).map(([id, c]) => ({
      cluster_id: id,
      log_template_tokens: [...c.logTemplateTokens],
      size: c.size,
    }));
    return new TextEncoder().encode(JSON.stringify({ clusters }));
  }

  /**
   * Restore Drain state from a previously saved snapshot.
   */
  loadSnapshot(data: Uint8Array): void {
    const raw = JSON.parse(new TextDecoder().decode(data));
    if (!raw.clusters || !Array.isArray(raw.clusters)) return;
    this.miner.drain.idToCluster.clear();
    let maxId = 0;
    for (const c of raw.clusters) {
      const tokens: readonly string[] = Object.freeze([...c.log_template_tokens]);
      const cluster = new LogCluster(tokens, c.cluster_id);
      cluster.size = c.size;
      this.miner.drain.idToCluster.set(c.cluster_id, cluster);
      this.miner.drain.addSeqToPrefixTree(this.miner.drain.rootNode, cluster);
      if (c.cluster_id > maxId) maxId = c.cluster_id;
    }
    this.miner.drain.clustersCounter = maxId;
  }

  /**
   * Create a DrainDataPlane from a previously saved snapshot.
   */
  static fromSnapshot(snapshot: Uint8Array, config?: DrainDataPlaneConfig): DrainDataPlane {
    const plane = new DrainDataPlane(config);
    plane.loadSnapshot(snapshot);
    return plane;
  }

  private toExtractedParams(params: readonly ExtractedParameter[]): readonly {
    value: string;
    maskName: string;
  }[] {
    return params.map((p) => ({ value: p.value, maskName: p.maskName }));
  }
}
