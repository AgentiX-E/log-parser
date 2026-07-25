/** What changed as a result of processing a log message through the data plane. */
export type DataPlaneChangeType = 'cluster_created' | 'cluster_template_changed' | 'none';

/** Result from the Drain data plane. */
export interface DrainResult {
  /** The kind of match result. */
  readonly kind: 'match' | 'miss';
  /** Cluster ID assigned to this log message. */
  readonly templateId: number;
  /** The current template string of the assigned cluster. */
  readonly template: string;
  /** Extracted parameter name-value pairs. */
  readonly parameters: readonly ExtractedParam[];
  /** Tokenized representation for downstream processing. */
  readonly tokens: readonly string[];
}

/** Result from drain-ts inference mode matching. */
export interface DrainMatch {
  readonly templateId: number;
  readonly template: string;
}

/** A single extracted parameter from a log message. */
export interface ExtractedParam {
  readonly value: string;
  readonly maskName: string;
}

/** A parsed log template stored in the cache. */
export interface LogTemplate {
  readonly id: string;
  readonly template: string;
  readonly tokens: readonly string[];
}

/** Source of a parsed log result. */
export type ParseSource = 'drain-strict' | 'drain-loose' | 'cache-hit' | 'llm-extracted';

/** Final parsed log result returned to consumers. */
export interface LogParseResult {
  readonly logId: string;
  readonly template: string;
  readonly templateId: number;
  readonly parameters: readonly ExtractedParam[];
  readonly source: ParseSource;
  readonly confidence?: number;
}

/** Pipeline-layer configuration switches and hyperparameters. */
export interface PipelineLayerConfig {
  readonly dataPlane: {
    readonly enabled: boolean;
    readonly drain?: {
      readonly simTh: number;
      readonly depth: number;
      readonly maxChildren: number;
      readonly maxClusters: number | null;
    };
  };
  readonly controlPlane: {
    readonly enabled: boolean;
    readonly batch: {
      readonly maxSize: number;
      readonly maxWaitMs: number;
    };
    readonly partitioning: {
      readonly method: 'dbscan' | 'meanshift' | 'hierarchical';
      readonly dbscan?: {
        readonly epsilon: number;
        readonly minPoints: number;
      };
    };
    readonly sampling: {
      readonly method: 'dpp' | 'similar' | 'random';
      readonly samplesPerBatch: number;
    };
    readonly selfReflection: {
      readonly enabled: boolean;
      readonly maxIterations: number;
    };
  };
  readonly tokenization: {
    readonly languageDetection: boolean;
    readonly fallbackLanguage: string;
  };
}

/** Runtime statistics collected during pipeline execution. */
export interface PipelineStats {
  readonly totalProcessed: number;
  readonly drainHits: number;
  readonly drainMisses: number;
  readonly cacheHits: number;
  readonly llmCalls: number;
  readonly llmTokensConsumed: number;
  readonly templateCount: number;
  readonly cacheHitRate: number;
}

/** Partial config applying defaults for all unspecified fields. */
export function defaultPipelineConfig(): PipelineLayerConfig {
  return {
    dataPlane: {
      enabled: true,
      drain: { simTh: 0.4, depth: 4, maxChildren: 100, maxClusters: null },
    },
    controlPlane: {
      enabled: false,
      batch: { maxSize: 50, maxWaitMs: 5000 },
      partitioning: {
        method: 'dbscan',
        dbscan: { epsilon: 0.5, minPoints: 3 },
      },
      sampling: { method: 'dpp', samplesPerBatch: 5 },
      selfReflection: { enabled: true, maxIterations: 3 },
    },
    tokenization: { languageDetection: true, fallbackLanguage: 'en' },
  };
}
