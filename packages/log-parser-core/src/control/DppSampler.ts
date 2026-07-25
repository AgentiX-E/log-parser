/**
 * Determinantal Point Process sampler for diverse log selection.
 *
 * Selects K maximally-diverse log samples from a partition to send to the
 * LLM. Uses greedy maximum-determinant selection on a similarity kernel
 * matrix, approximating the full Cholesky DPP decomposition.
 *
 * Self-implemented — no suitable npm DPP implementation exists.
 */
export class DppSampler {
  /**
   * Select K diverse sample indices from a set of feature vectors.
   *
   * @param vectors - Feature vectors (TF-IDF or embedding output).
   * @param k - Number of samples to select.
   * @returns Indices of selected samples.
   */
  sample(vectors: readonly number[][], k: number): number[] {
    if (vectors.length === 0) return [];
    if (vectors.length <= k) return vectors.map((_, i) => i);

    const L = this.buildKernelMatrix(vectors);
    return this.greedyMaxDet(L, k);
  }

  /** Build similarity kernel matrix using cosine similarity. */
  private buildKernelMatrix(vectors: readonly number[][]): number[][] {
    const n = vectors.length;
    const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        const sim = this.cosine(vectors[i]!, vectors[j]!);
        L[i]![j] = sim;
        L[j]![i] = sim;
      }
    }
    return L;
  }

  private cosine(a: number[], b: number[]): number {
    let dot = 0;
    let na = 0;
    let nb = 0;
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
      const av = a[i] ?? 0;
      const bv = b[i] ?? 0;
      dot += av * bv;
      na += av * av;
      nb += bv * bv;
    }
    if (na === 0 || nb === 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  /** Greedy maximum-determinant selection. */
  private greedyMaxDet(L: number[][], k: number): number[] {
    const selected: number[] = [];
    const remaining = new Set(L.map((_, i) => i));

    for (let step = 0; step < k && remaining.size > 0; step++) {
      let bestIdx = -1;
      let bestScore = -Infinity;
      for (const idx of remaining) {
        const score = this.computeScore(L, selected, idx);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = idx;
        }
      }
      if (bestIdx >= 0) {
        selected.push(bestIdx);
        remaining.delete(bestIdx);
      }
    }
    return selected;
  }

  /**
   * Compute the incremental determinant contribution of adding `candidate`
   * to the already-selected set.
   *
   * For the first selection (empty set), returns L[i][i] (self-similarity = 1).
   * For subsequent selections, subtracts squared similarities with already
   * selected points to approximate the determinant gain.
   */
  private computeScore(L: number[][], selected: number[], candidate: number): number {
    if (selected.length === 0) return L[candidate]![candidate]!;
    let score = L[candidate]![candidate]!;
    for (const s of selected) {
      const sim = L[candidate]![s]!;
      score -= sim * sim;
    }
    return Math.max(0, score);
  }
}
