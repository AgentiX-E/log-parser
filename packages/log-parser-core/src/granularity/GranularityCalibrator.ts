import type { GranularityPreference, GranularityConfig } from './GranularityDistance.js';

const CALIBRATION_THRESHOLD = 32;

/**
 * Human-in-the-Loop granularity calibrator.
 *
 * Collects user-annotated log-template pairs. After 32 samples,
 * automatically learns the user's granularity preference by analyzing
 * variable density in the provided templates.
 *
 * Based on the HITL concept from LogParser-LLM (KDD 2024).
 */
export class GranularityCalibrator {
  private readonly samples: Array<{
    readonly log: string;
    readonly expectedTemplate: string;
  }> = [];
  private learnedConfig: GranularityConfig | null = null;

  addSample(log: string, expectedTemplate: string): void {
    this.samples.push({ log, expectedTemplate });
    if (this.samples.length >= CALIBRATION_THRESHOLD) {
      this.calibrate();
    }
  }

  get config(): GranularityConfig | null {
    return this.learnedConfig;
  }

  get sampleCount(): number {
    return this.samples.length;
  }

  get isCalibrated(): boolean {
    return this.learnedConfig !== null;
  }

  reset(): void {
    this.samples.length = 0;
    this.learnedConfig = null;
  }

  private calibrate(): void {
    let fineCount = 0;
    let coarseCount = 0;

    for (const { expectedTemplate } of this.samples) {
      const tokens = expectedTemplate.split(/\s+/).filter(Boolean);
      const varCount = tokens.filter((t) => t === '<*>').length;
      const varRatio = tokens.length > 0 ? varCount / tokens.length : 0;

      if (varRatio > 0.5) fineCount++;
      else if (varRatio < 0.2) coarseCount++;
    }

    const preference: GranularityPreference =
      fineCount > coarseCount * 2 ? 'fine' : coarseCount > fineCount * 2 ? 'coarse' : 'balanced';

    this.learnedConfig = { preference };
  }
}
