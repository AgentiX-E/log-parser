import {
  TemplateMiner,
  TemplateMinerConfig,
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
export class DrainDataPlane {
  readonly miner: TemplateMiner;

  constructor(config: TemplateMinerConfig = DEFAULT_DRAIN_CONFIG) {
    this.miner = new TemplateMiner({ config });
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

  private toExtractedParams(params: readonly ExtractedParameter[]): readonly {
    value: string;
    maskName: string;
  }[] {
    return params.map((p) => ({ value: p.value, maskName: p.maskName }));
  }
}
