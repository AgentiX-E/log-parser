/**
 * Semantic embedding provider abstraction.
 *
 * Design principle: core defines the interface contract ONLY.
 * Implementations are injected by the user at the application layer.
 *
 * When undefined, PartitioningEngine degrades to built-in TF-IDF (zero deps, zero network).
 *
 * Recommended implementation approaches (not mandatory):
 *   - Local ONNX Runtime: zero network inference, ideal for privacy-sensitive scenarios
 *   - Cloud embedding API: stronger semantic understanding
 *   - Custom models
 */

/**
 * Embedding provider interface.
 *
 * Generates L2-normalized dense vector representations of text inputs.
 * All output vectors must be unit-length so cosine similarity equals dot product.
 */
export interface IEmbeddingProvider {
  /** Model identifier used in logs and metrics. */
  readonly modelId: string;
  /** Fixed dimension of output embedding vectors. */
  readonly dimension: number;

  /**
   * Batch-generate L2-normalized embedding vectors.
   *
   * Constraints:
   * - `vectors.length === texts.length`
   * - Each vector has length `this.dimension`
   * - All vectors are L2-normalized (cosine similarity = dot product)
   *
   * @param texts - Input text array.
   * @returns Normalized embedding vectors.
   */
  embed(texts: readonly string[]): Promise<{ readonly vectors: readonly Float32Array[] }>;
}
