/** Granularity preference: how fine or coarse variable boundaries should be. */
export type GranularityPreference = 'coarse' | 'balanced' | 'fine';

export interface GranularityConfig {
  readonly preference: GranularityPreference;
  readonly customPenalties?: Partial<Record<string, number>>;
}

/**
 * Granularity Distance (GD) metric.
 *
 * Measures the difference between two log templates at the variable-granularity
 * level, distinguishing true parsing errors from granularity preference differences.
 *
 * Based on the concept introduced by LogParser-LLM (KDD 2024).
 *
 * Algorithm:
 * 1. Align templates using Needleman-Wunsch global sequence alignment.
 * 2. For each aligned position:
 *    - Same token → penalty 0
 *    - Both variables (<*>) → penalty 0
 *    - One variable, one constant → variable penalty (weighted by preference)
 *    - Two different constants → penalty 1 (true error)
 * 3. Normalize by max template length.
 *
 * Returns 0 for identical templates, 1 for completely different.
 */
export class GranularityDistance {
  private static readonly PARAM_TOKEN = '<*>';

  compute(
    templateA: readonly string[],
    templateB: readonly string[],
    config: GranularityConfig = { preference: 'balanced' },
  ): number {
    if (templateA.length === 0 && templateB.length === 0) return 0;

    const alignment = this.nwAlign(templateA, templateB);
    let totalPenalty = 0;

    for (const [a, b] of alignment) {
      if (a === b) continue;
      if (a === GranularityDistance.PARAM_TOKEN && b === GranularityDistance.PARAM_TOKEN) continue;

      if (a === GranularityDistance.PARAM_TOKEN || b === GranularityDistance.PARAM_TOKEN) {
        totalPenalty += this.variablePenalty(config);
      } else {
        totalPenalty += 1;
      }
    }

    const maxLen = Math.max(templateA.length, templateB.length);
    return maxLen === 0 ? 0 : totalPenalty / maxLen;
  }

  private variablePenalty(config: GranularityConfig): number {
    switch (config.preference) {
      case 'fine':
        return 0.8;
      case 'coarse':
        return 0.3;
      case 'balanced':
        return 0.5;
    }
  }

  /** Needleman-Wunsch global sequence alignment. */
  private nwAlign(
    a: readonly string[],
    b: readonly string[],
  ): readonly (readonly [string | null, string | null])[] {
    const n = a.length;
    const m = b.length;
    const gap = -1;
    const match = 1;
    const mismatch = -1;

    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = 1; i <= n; i++) dp[i]![0] = i * gap;
    for (let j = 1; j <= m; j++) dp[0]![j] = j * gap;

    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const score = a[i - 1] === b[j - 1] ? match : mismatch;
        dp[i]![j] = Math.max(
          dp[i - 1]![j - 1]! + score,
          dp[i - 1]![j]! + gap,
          dp[i]![j - 1]! + gap,
        );
      }
    }

    const alignment: (readonly [string | null, string | null])[] = [];
    let i = n;
    let j = m;
    while (i > 0 || j > 0) {
      if (
        i > 0 &&
        j > 0 &&
        dp[i]![j] === dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? match : mismatch)
      ) {
        alignment.unshift([a[i - 1]!, b[j - 1]!]);
        i--;
        j--;
      } else if (i > 0 && dp[i]![j] === dp[i - 1]![j]! + gap) {
        alignment.unshift([a[i - 1]!, null]);
        i--;
      } else {
        alignment.unshift([null, b[j - 1]!]);
        j--;
      }
    }
    return alignment;
  }
}
