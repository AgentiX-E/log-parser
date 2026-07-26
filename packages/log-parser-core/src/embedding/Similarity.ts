/**
 * Shared similarity computation utilities.
 *
 * Centralizes cosine similarity, cosine distance, and Jaccard similarity
 * to eliminate code duplication across the codebase (PartitioningEngine,
 * DppSampler, RagTemplateRetriever).
 */

/** L2 cosine similarity between two numeric vectors. */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = i < a.length ? (a[i] ?? 0) : 0;
    const bv = i < b.length ? (b[i] ?? 0) : 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Cosine distance = 1 - cosine similarity. */
export function cosineDistance(a: readonly number[], b: readonly number[]): number {
  return 1 - cosineSimilarity(a, b);
}

/**
 * Jaccard similarity between two sets represented as arrays.
 * Returns |A ∩ B| / |A ∪ B|.
 */
export function jaccardSimilarity(a: readonly string[], b: readonly string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
