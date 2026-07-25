import type { ILLMProvider } from '../llm/ILLMProvider.js';

/**
 * Multi-model router for log parsing complexity-based LLM selection.
 *
 * Routes simple log patterns to a local (fast, free) model and
 * complex patterns to a remote (powerful) model.
 *
 * Complexity assessment is heuristic-bassed:
 * - Token count and diversity
 * - Average log length
 * - Special character density
 *
 * When no remote provider is configured, all requests go to the local provider.
 */
export class ModelRouter {
  constructor(
    private readonly localProvider: ILLMProvider,
    private readonly remoteProvider?: ILLMProvider,
  ) {}

  /**
   * Select the appropriate LLM provider based on log sample complexity.
   *
   * @param logSamples - Log samples to analyze for complexity.
   * @returns The selected ILLMProvider.
   */
  select(logSamples: readonly string[]): ILLMProvider {
    if (!this.remoteProvider) return this.localProvider;
    const complexity = this.assessComplexity(logSamples);
    return complexity >= 0.7 ? this.remoteProvider : this.localProvider;
  }

  /**
   * Assess log sample complexity on a [0, 1] scale.
   *
   * Factors:
   * - Token diversity (unique tokens / total tokens)
   * - Average log length scaled by 200 chars
   * - Sample count scaled by 10 logs per batch
   */
  assessComplexity(logSamples: readonly string[]): number {
    if (logSamples.length === 0) return 0;

    const avgLength = logSamples.reduce((sum, log) => sum + log.length, 0) / logSamples.length;

    const allTokens = logSamples.flatMap((log) => log.split(/\s+/));
    const uniqueTokens = new Set(allTokens).size;
    const totalTokens = allTokens.length;
    const tokenDiversity = totalTokens > 0 ? uniqueTokens / totalTokens : 0;

    // Weighted sum: token diversity 40%, log length 30%, batch size 30%
    const score =
      tokenDiversity * 0.4 +
      Math.min(avgLength / 200, 1) * 0.3 +
      Math.min(logSamples.length / 10, 1) * 0.3;

    return Math.min(1, Math.max(0, score));
  }
}
