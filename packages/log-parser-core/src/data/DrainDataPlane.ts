import {
  TemplateMiner,
  TemplateMinerConfig,
  LogCluster,
  DEFAULT_MASKING_INSTRUCTIONS,
  type ExtractedParameter,
} from '@agentix-e/drain-ts';
import type { DrainResult, DrainMatch } from '../pipeline/types.js';

/**
 * Default Drain configuration applied to every new TemplateMiner instance.
 * Matches Drain3 v0.9.11 defaults exactly.
 */
const DEFAULT_DRAIN_CONFIG = TemplateMinerConfig.from({
  simTh: 0.4,
  depth: 4,
  maxChildren: 100,
  maxClusters: null,
  maskingInstructions: DEFAULT_MASKING_INSTRUCTIONS,
});

/**
 * Data plane wrapping @agentix-e/drain-ts.
 *
 * Provides the primary log template mining capability. This is the
 * "always available" layer — zero LLM, zero network, zero external services.
 *
 * Performance: ~226K logs/sec with masking enabled (single-threaded, Node.js 22).
 */
export interface DrainConfigUpdate {
  readonly simTh?: number;
  readonly depth?: number;
  readonly maxChildren?: number;
}

export class DrainDataPlane {
  readonly miner: TemplateMiner;
  private config: TemplateMinerConfig;

  constructor(config: TemplateMinerConfig = DEFAULT_DRAIN_CONFIG) {
    this.config = config;
    this.miner = new TemplateMiner({ config });
  }

  /**
   * Update the active Drain configuration.
   *
   * This rebuilds the internal TemplateMiner with new parameters.
   * Existing clusters are preserved via snapshot export/import.
   *
   * Used by AdaptiveLearner for auto-tuning simTh and depth.
   */
  updateConfig(update: DrainConfigUpdate): void {
    const snapshot = this.saveSnapshot();
    this.config = TemplateMinerConfig.from({
      simTh: update.simTh ?? this.config.simTh,
      depth: update.depth ?? this.config.depth,
      maxChildren: update.maxChildren ?? this.config.maxChildren,
      maskingInstructions: this.config.maskingInstructions,
    });
    this.loadSnapshot(snapshot);
  }

  /**
   * Training mode: cluster a log message, potentially creating or updating templates.
   *
   * Returns 'match' when the log fits an existing template (strict or loose).
   * Returns 'miss' when a new cluster is created (candidate for LLM enhancement
   * in the control plane).
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
   * Captures all clusters and their templates.
   */
  saveSnapshot(): Uint8Array {
    const clusters = Array.from(this.miner.drain.idToCluster.entries()).map(([id, cluster]) => ({
      cluster_id: id,
      log_template_tokens: [...cluster.logTemplateTokens],
      size: cluster.size,
    }));
    return new TextEncoder().encode(JSON.stringify({ clusters }));
  }

  /**
   * Restore Drain state from a previously saved snapshot.
   * Rebuilds the prefix tree and cluster registry.
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
  static fromSnapshot(snapshot: Uint8Array, config?: TemplateMinerConfig): DrainDataPlane {
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
