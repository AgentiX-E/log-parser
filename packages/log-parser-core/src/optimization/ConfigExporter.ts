import type { DrainDataPlaneConfig } from '../data/DrainDataPlane.js';

/**
 * Configuration exporter for production deployment.
 * Supports JSON serialization and environment variable format.
 */
export class ConfigExporter {
  /** Serialize config to pretty-printed JSON. */
  static toJSON(config: DrainDataPlaneConfig): string {
    return JSON.stringify(config, null, 2);
  }

  /** Parse config from JSON string. */
  static fromJSON(json: string): DrainDataPlaneConfig {
    return JSON.parse(json) as DrainDataPlaneConfig;
  }

  /** Export config as environment variable assignments for Docker / K8s deployment. */
  static toEnv(config: DrainDataPlaneConfig): string {
    const lines: string[] = [];
    if (config.simTh !== undefined) lines.push(`LOG_PARSER_SIM_TH=${config.simTh}`);
    if (config.depth !== undefined) lines.push(`LOG_PARSER_DEPTH=${config.depth}`);
    if (config.maxChildren !== undefined)
      lines.push(`LOG_PARSER_MAX_CHILDREN=${config.maxChildren}`);
    if (config.extendedMasking !== undefined)
      lines.push(`LOG_PARSER_EXTENDED_MASKING=${config.extendedMasking}`);
    if (config.enableAELSimilarity !== undefined)
      lines.push(`LOG_PARSER_AEL_SIMILARITY=${config.enableAELSimilarity}`);
    if (config.enableAdjacentFusion !== undefined)
      lines.push(`LOG_PARSER_ADJACENT_FUSION=${config.enableAdjacentFusion}`);
    if (config.engine !== undefined) lines.push(`LOG_PARSER_ENGINE=${config.engine}`);
    return lines.join('\n');
  }
}
