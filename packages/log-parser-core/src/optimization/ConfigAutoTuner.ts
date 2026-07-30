import { DrainDataPlane, type DrainDataPlaneConfig } from '../data/DrainDataPlane.js';

export interface TunerParamSpace {
  simThRange?: [number, number];
  depthRange?: [number, number];
  maxChildrenRange?: [number, number];
}

export interface TunerConfig extends TunerParamSpace {
  maxIterations?: number;
  targetMetric?: 'pta' | 'ga' | 'combined';
  gaWeight?: number;
}

export interface TunerEvalStep {
  ga: number;
  pta: number;
  score: number;
  config: DrainDataPlaneConfig;
}

export interface TunerResult {
  bestConfig: DrainDataPlaneConfig;
  bestGa: number;
  bestPta: number;
  bestScore: number;
  evaluations: number;
  history: TunerEvalStep[];
  improvement: { ga: number; pta: number };
}

const DEFAULT_SPACE: Required<TunerParamSpace> = {
  simThRange: [0.2, 0.8],
  depthRange: [3, 6],
  maxChildrenRange: [50, 500],
};

/** Simplest possible metric for unsupervised tuning: template-to-log ratio. */
function unsupervisedScore(drain: DrainDataPlane, logCount: number): { ga: number; pta: number } {
  const templateCount = drain.templateCount;
  if (templateCount === 0) return { ga: 0, pta: 0 };
  // Fewer templates → better grouping (heuristic: good grouping reduces fragmentation).
  // Normalize: 1 template for all logs = 1.0, 1 template per log = ~0.
  const gaEstimate = Math.max(0, 1 - (templateCount - 1) / Math.max(1, logCount));
  return { ga: gaEstimate, pta: gaEstimate };
}

/**
 * Staged grid-search configuration optimizer for Drain.
 *
 * Two-stage process:
 * 1. Coarse grid (wider steps) → find best region
 * 2. Fine grid (narrower steps around best) → find optimum
 *
 * Evaluates each config by training on the dataset and scoring
 * via GA + PTA composite (weighted by gaWeight).
 *
 * Supports supervised mode (with ground truth) and unsupervised
 * mode (heuristic: minimize template fragmentation).
 */
export class ConfigAutoTuner {
  private readonly defaultConfig: DrainDataPlaneConfig;

  constructor(
    private readonly dataset: {
      logs: readonly string[];
      groundTruth?: Array<{ logId: string; template: string; eventId: string }>;
    },
    defaultConfig?: DrainDataPlaneConfig,
  ) {
    this.defaultConfig = defaultConfig ?? {
      extendedMasking: true,
      simTh: 0.4,
      depth: 4,
      maxChildren: 100,
    };
  }

  async tune(config?: TunerConfig): Promise<TunerResult> {
    const space = { ...DEFAULT_SPACE, ...config };
    const maxIter = config?.maxIterations ?? 30;
    const metric = config?.targetMetric ?? 'combined';
    const gaW = config?.gaWeight ?? 0.3;
    const history: TunerEvalStep[] = [];

    // Stage 1: Coarse grid
    const simThSteps = this.linspace(space.simThRange[0], space.simThRange[1], 4);
    const depthSteps = [3, 4, 5, 6];
    const maxChildSteps = [50, 200, 350, 500];

    let bestScore = -Infinity;
    let bestConfig = this.defaultConfig;
    let bestGa = 0;
    let bestPta = 0;

    for (const simTh of simThSteps) {
      for (const depth of depthSteps) {
        for (const maxChildren of maxChildSteps) {
          if (history.length >= maxIter) break;
          const cfg: DrainDataPlaneConfig = {
            ...this.defaultConfig,
            simTh,
            depth,
            maxChildren,
          };
          const { ga, pta } = await this.evaluate(cfg);
          const score = this.computeScore(ga, pta, metric, gaW);
          const step: TunerEvalStep = { ga, pta, score, config: cfg };
          history.push(step);
          if (score > bestScore) {
            bestScore = score;
            bestConfig = cfg;
            bestGa = ga;
            bestPta = pta;
          }
        }
      }
    }

    // Stage 2: Fine grid around best
    const fineSimTh = this.linspace(
      Math.max(space.simThRange[0], (bestConfig.simTh ?? 0.4) - 0.15),
      Math.min(space.simThRange[1], (bestConfig.simTh ?? 0.4) + 0.15),
      5,
    );
    for (const simTh of fineSimTh) {
      if (history.length >= maxIter) break;
      const cfg: DrainDataPlaneConfig = { ...bestConfig, simTh };
      const { ga, pta } = await this.evaluate(cfg);
      const score = this.computeScore(ga, pta, metric, gaW);
      history.push({ ga, pta, score, config: cfg });
      if (score > bestScore) {
        bestScore = score;
        bestConfig = cfg;
        bestGa = ga;
        bestPta = pta;
      }
    }

    // Baseline
    const baseline = await this.evaluate(this.defaultConfig);

    return {
      bestConfig,
      bestGa,
      bestPta,
      bestScore,
      evaluations: history.length,
      history,
      improvement: {
        ga: bestGa - baseline.ga,
        pta: bestPta - baseline.pta,
      },
    };
  }

  private async evaluate(config: DrainDataPlaneConfig): Promise<{ ga: number; pta: number }> {
    const drain = new DrainDataPlane(config);
    for (const log of this.dataset.logs) drain.train(log);

    if (!this.dataset.groundTruth) {
      return unsupervisedScore(drain, this.dataset.logs.length);
    }

    let correct = 0;
    let total = 0;
    for (let i = 0; i < this.dataset.logs.length; i++) {
      const log = this.dataset.logs[i]!;
      const gt = this.dataset.groundTruth[i]!;
      const result = drain.match(log);
      if (result && result.template === gt.template) correct++;
      total++;
    }
    const ga = total > 0 ? correct / total : 0;
    return { ga, pta: ga };
  }

  private computeScore(ga: number, pta: number, metric: string, gaW: number): number {
    switch (metric) {
      case 'ga':
        return ga;
      case 'pta':
        return pta;
      case 'combined':
        return (1 - gaW) * pta + gaW * ga;
      default:
        return (1 - gaW) * pta + gaW * ga;
    }
  }

  private linspace(start: number, end: number, steps: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < steps; i++) {
      result.push(start + ((end - start) * i) / (steps - 1));
    }
    return result;
  }
}
