import type { DrainDataPlane } from '../data/DrainDataPlane.js';

/**
 * Correction type for HITL feedback.
 */
type CorrectionType = 'over-splitting' | 'under-splitting';

/**
 * Minimum safe simTh threshold.
 */
const SIM_TH_MIN = 0.2;

/**
 * Maximum safe simTh threshold.
 */
const SIM_TH_MAX = 0.8;

/**
 * Default simTh step size for each correction.
 */
const SIM_TH_STEP = 0.05;

/**
 * Default depth step size for each correction.
 */
const DEPTH_STEP = 1;

/**
 * Adaptive Learning Pipeline.
 *
 * Automatically tunes drain-ts parameters (simTh, depth) based on
 * Human-in-the-Loop (HITL) feedback corrections. No competitor has
 * an auto-tuning log parser — this is a unique innovation.
 *
 * Learning algorithm:
 * - Over-splitting (too many clusters for same semantic template) → lower simTh
 *   to merge semantically identical templates.
 * - Under-splitting (different templates merged into one) → raise simTh
 *   to separate distinct templates.
 * - Adaptive bounds: simTh stays in [0.2, 0.8] and depth stays in [3, 8].
 *
 * @example
 * ```typescript
 * const learner = new AdaptiveLearner(drainPlane);
 * learner.learnFromCorrection(
 *   'User alice logged in from 10.0.0.1',
 *   'User <*> logged in from <IP>',
 *   'User alice logged in from 10.0.0.1',  // over-split
 * );
 * learner.apply(); // auto-tunes drain
 * ```
 */
export class AdaptiveLearner {
  private currentSimTh: number;
  private currentDepth: number;
  private corrections: number = 0;
  private overSplittingCount: number = 0;
  private underSplittingCount: number = 0;

  constructor(private readonly drain: DrainDataPlane) {
    this.currentSimTh = 0.4; // Drain3 default
    this.currentDepth = 4; // Drain3 default
  }

  /**
   * Feed a HITL correction.
   *
   * @param log - The original log message.
   * @param expectedTemplate - The correct template (from human annotation).
   * @param actualTemplate - The template produced by the parser.
   */
  learnFromCorrection(log: string, expectedTemplate: string, actualTemplate: string): void {
    this.corrections++;

    // Count `<*>` tokens in both templates
    const expectedVars = (expectedTemplate.match(/<\*>/g) ?? []).length;
    const actualVars = (actualTemplate.match(/<\*>/g) ?? []).length;

    // Detect correction type
    const correctionType = this.detectCorrectionType(
      log,
      expectedTemplate,
      actualTemplate,
      expectedVars,
      actualVars,
    );

    // Apply correction to simTh
    if (correctionType === 'over-splitting') {
      this.overSplittingCount++;
      this.currentSimTh = Math.max(SIM_TH_MIN, this.currentSimTh - SIM_TH_STEP);
      // Also consider increasing depth to enable finer-grained matching
      this.currentDepth = Math.min(8, this.currentDepth + DEPTH_STEP);
    } else if (correctionType === 'under-splitting') {
      this.underSplittingCount++;
      this.currentSimTh = Math.min(SIM_TH_MAX, this.currentSimTh + SIM_TH_STEP);
      // Decrease depth to enable coarser matching
      this.currentDepth = Math.max(3, this.currentDepth - DEPTH_STEP);
    }
  }

  /** Apply learned parameters to the drain engine. */
  apply(): void {
    this.drain.updateConfig({
      simTh: this.currentSimTh,
      depth: this.currentDepth,
    });
  }

  /** Get the recommended simTh after learning. */
  get recommendedSimTh(): number {
    return Math.round(this.currentSimTh * 100) / 100;
  }

  /** Get the recommended depth after learning. */
  get recommendedDepth(): number {
    return this.currentDepth;
  }

  /** How many corrections have been processed. */
  get correctionCount(): number {
    return this.corrections;
  }

  /** Count of over-splitting corrections. */
  get overSplittingTotal(): number {
    return this.overSplittingCount;
  }

  /** Count of under-splitting corrections. */
  get underSplittingTotal(): number {
    return this.underSplittingCount;
  }

  /** Reset all learning state to defaults. */
  reset(): void {
    this.currentSimTh = 0.4;
    this.currentDepth = 4;
    this.corrections = 0;
    this.overSplittingCount = 0;
    this.underSplittingCount = 0;
  }

  /**
   * Detect whether a correction indicates over-splitting or under-splitting.
   *
   * Over-splitting: actual template has fewer `<*>` than expected
   *   → variables not recognized, concrete values treated as static text
   *   → need LOWER simTh to merge more aggressively
   *
   * Under-splitting: actual template has more `<*>` than expected
   *   → static text incorrectly treated as variables
   *   → need HIGHER simTh to be more selective
   */
  private detectCorrectionType(
    _log: string,
    expectedTemplate: string,
    actualTemplate: string,
    expectedVars: number,
    actualVars: number,
  ): CorrectionType {
    if (actualVars < expectedVars) {
      // Fewer variables than expected → over-splitting
      return 'over-splitting';
    }
    if (actualVars > expectedVars) {
      // More variables than expected → under-splitting
      return 'under-splitting';
    }
    // Same variable count but templates differ → check token structure
    const expectedTokens = expectedTemplate.split(/\s+/);
    const actualTokens = actualTemplate.split(/\s+/);
    if (expectedTokens.length > actualTokens.length) {
      return 'over-splitting'; // expected more detail
    }
    return 'under-splitting';
  }
}
