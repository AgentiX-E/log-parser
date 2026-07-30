import { ConfigAutoTuner } from './ConfigAutoTuner.js';
import { ConfigExporter } from './ConfigExporter.js';
import type { DrainDataPlaneConfig } from '../data/DrainDataPlane.js';

export interface WeeklyReplayResult {
  /** Optimized configuration for production deployment. */
  config: DrainDataPlaneConfig;
  /** JSON-serialized config for file-based deployment. */
  configJSON: string;
  /** Environment-variable formatted config for Docker/K8s. */
  configEnv: string;
  /** GA improvement over previous config. */
  gaDelta: number;
  /** PTA improvement over previous config. */
  ptaDelta: number;
  /** Absolute combined score of the best config. */
  scoreDelta: number;
  /** Whether the config changed from the previous optimal. */
  changed: boolean;
  /** ISO date of this replay (YYYY-MM-DD). */
  date: string;
  /** Number of hyperparameter evaluations performed. */
  evaluations: number;
}

/**
 * Weekly replay pipeline — the complete offline-to-production workflow.
 *
 * Usage:
 * ```typescript
 * const replay = new WeeklyReplay(previousConfig, { maxIterations: 80 });
 * const result = await replay.run(logs, groundTruth);
 * if (result.changed) {
 *   fs.writeFileSync('/etc/log-parser/config.json', result.configJSON);
 *   // or deploy via env vars: process.env.LOG_PARSER_* = result.configEnv
 * }
 * ```
 *
 * Pipeline stages:
 * 1. ConfigAutoTuner — staged grid search + boolean/engine exploration
 * 2. Compare — measure improvement over previous optimal config
 * 3. ConfigExporter — export as JSON + environment variables
 * 4. Report — delta metrics, date stamped, ready for CI/CD
 */
export class WeeklyReplay {
  private readonly previousConfig?: DrainDataPlaneConfig;
  private readonly maxIterations: number;
  private readonly gaWeight: number;

  constructor(
    previousConfig?: DrainDataPlaneConfig,
    options?: { maxIterations?: number; gaWeight?: number },
  ) {
    this.previousConfig = previousConfig;
    this.maxIterations = options?.maxIterations ?? 80;
    this.gaWeight = options?.gaWeight ?? 0.3;
  }

  /**
   * Run the weekly replay pipeline.
   *
   * @param logs - Weekly log export from production.
   * @param groundTruth - Optional ground-truth annotations for supervised tuning.
   * @returns Replay result with optimized config and improvement report.
   */
  async run(
    logs: readonly string[],
    groundTruth?: Array<{ logId: string; template: string; eventId: string }>,
  ): Promise<WeeklyReplayResult> {
    const tuner = new ConfigAutoTuner({ logs, groundTruth }, this.previousConfig);
    const result = await tuner.tune({
      maxIterations: this.maxIterations,
      targetMetric: 'combined',
      gaWeight: this.gaWeight,
    });

    const json = ConfigExporter.toJSON(result.bestConfig);
    const env = ConfigExporter.toEnv(result.bestConfig);
    const changed =
      result.improvement.pta > 0.001 || result.improvement.ga > 0.001;

    return {
      config: result.bestConfig,
      configJSON: json,
      configEnv: env,
      gaDelta: result.improvement.ga,
      ptaDelta: result.improvement.pta,
      scoreDelta: result.bestScore,
      changed,
      date: new Date().toISOString().split('T')[0]!,
      evaluations: result.evaluations,
    };
  }
}
