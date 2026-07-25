/**
 * Self-implemented TF-IDF vectorizer.
 *
 * Built-in fallback for the embedding layer — zero dependencies,
 * zero network calls, always available.
 *
 * When a user injects an IEmbeddingProvider, the PartitioningEngine
 * uses that instead. When no provider is injected, this TF-IDF
 * implementation serves as the default.
 *
 * The IDF formula matches sklearn's TfidfVectorizer with
 * `smooth_idf=true`:
 *   idf(t) = log((1 + N) / (1 + df(t))) + 1
 *
 * where N = document count, df(t) = number of documents containing term t.
 */
export class TfIdfVectorizer {
  private idfCache: Map<string, number> = new Map();
  private termIndices: string[] = [];
  private docCount = 0;
  private fitted = false;

  /**
   * Fit the vectorizer on a corpus and transform in one step.
   *
   * @param documents - A list of tokenized documents.
   * @returns A list of TF-IDF vectors, one per document.
   */
  fitTransform(documents: readonly (readonly string[])[]): number[][] {
    this.docCount = documents.length;
    this.fitted = true;

    if (this.docCount === 0) {
      this.termIndices = [];
      this.idfCache.clear();
      return [];
    }

    // Compute document frequency for each term
    const df = new Map<string, number>();
    for (const doc of documents) {
      const seen = new Set<string>();
      for (const token of doc) {
        if (!seen.has(token)) {
          seen.add(token);
          df.set(token, (df.get(token) ?? 0) + 1);
        }
      }
    }

    // Sort terms for deterministic output order
    this.termIndices = [...df.keys()].sort();

    // Compute IDF for each term
    const n = this.docCount;
    this.idfCache.clear();
    for (const term of this.termIndices) {
      const docFreq = df.get(term)!;
      this.idfCache.set(term, Math.log((1 + n) / (1 + docFreq)) + 1);
    }

    // Transform each document
    return documents.map((doc) => this._transform(doc));
  }

  /**
   * Transform a single tokenized document into a TF-IDF vector.
   * Requires `fitTransform` to have been called first.
   */
  transform(tokens: readonly string[]): number[] {
    if (!this.fitted) {
      throw new Error('TfIdfVectorizer must be fitted before transform()');
    }
    return this._transform(tokens);
  }

  private _transform(tokens: readonly string[]): number[] {
    const totalTokens = tokens.length;
    if (totalTokens === 0) {
      return new Array(this.termIndices.length).fill(0);
    }

    // Compute raw term frequencies
    const tf = new Map<string, number>();
    for (const token of tokens) {
      if (this.idfCache.has(token)) {
        tf.set(token, (tf.get(token) ?? 0) + 1);
      }
    }

    // Build TF-IDF vector
    const vector = new Array(this.termIndices.length).fill(0) as number[];
    for (let i = 0; i < this.termIndices.length; i++) {
      const term = this.termIndices[i]!;
      const idf = this.idfCache.get(term)!;
      const termTf = tf.get(term) ?? 0;
      vector[i] = (termTf / totalTokens) * idf;
    }

    return vector;
  }

  /** Whether the vectorizer has been fitted. */
  get isFitted(): boolean {
    return this.fitted;
  }

  /** Number of terms in the vocabulary. */
  get vocabularySize(): number {
    return this.termIndices.length;
  }

  /** Sorted list of vocabulary terms. */
  get terms(): readonly string[] {
    return this.termIndices;
  }

  /** IDF value for a specific term, or 0 if unknown. */
  getIdf(term: string): number {
    return this.idfCache.get(term) ?? 0;
  }
}
