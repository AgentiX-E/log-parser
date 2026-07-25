import type { IEmbeddingProvider } from '../embedding/IEmbeddingProvider.js';
import { TfIdfVectorizer } from '../embedding/TfIdfVectorizer.js';

/** A log event queued for batch processing through the control plane. */
export interface MissEvent {
  readonly logMessage: string;
  readonly tokens: readonly string[];
  readonly timestamp: number;
}

/**
 * Partitioning engine — groups miss events into clusters.
 *
 * Embedding chain:
 * - IEmbeddingProvider injected → semantic embedding → cosine distance → DBSCAN
 * - No provider → built-in TF-IDF → cosine distance → DBSCAN (always available)
 *
 * Uses a self-implemented DBSCAN rather than ml-dbscan to avoid additional
 * dependencies and keep core truly zero-external-deps beyond drain-ts.
 */
export class PartitioningEngine {
  private readonly tfidf = new TfIdfVectorizer();

  constructor(private readonly embeddingProvider?: IEmbeddingProvider) {}

  async partition(logs: readonly MissEvent[]): Promise<readonly MissEvent[][]> {
    if (logs.length === 0) return [];
    if (logs.length === 1) return [[logs[0]!]];

    const vectors = await this.computeVectors(logs);
    const distanceMatrix = this.computeDistanceMatrix(vectors);
    const labels = this.dbscan(distanceMatrix, 0.5, 3);
    return this.groupByLabels(logs, labels);
  }

  private async computeVectors(logs: readonly MissEvent[]): Promise<number[][]> {
    if (this.embeddingProvider) {
      const result = await this.embeddingProvider.embed(logs.map((l) => l.logMessage));
      return result.vectors.map((v) => Array.from(v));
    }
    // Built-in TF-IDF fallback — zero deps, zero network, always available
    return this.tfidf.fitTransform(logs.map((l) => l.tokens));
  }

  private computeDistanceMatrix(vectors: number[][]): number[][] {
    const n = vectors.length;
    const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < i; j++) {
        const dist = 1 - this.cosine(vectors[i]!, vectors[j]!);
        matrix[i]![j] = dist;
        matrix[j]![i] = dist;
      }
    }
    return matrix;
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

  /** Self-implemented DBSCAN clustering algorithm. */
  private dbscan(distanceMatrix: number[][], epsilon: number, minPoints: number): number[] {
    const n = distanceMatrix.length;
    const labels = new Array<number>(n).fill(-2); // -2 = unvisited
    let clusterId = 0;

    const regionQuery = (pointIdx: number): number[] => {
      const neighbors: number[] = [];
      for (let i = 0; i < n; i++) {
        if (distanceMatrix[pointIdx]![i]! <= epsilon) {
          neighbors.push(i);
        }
      }
      return neighbors;
    };

    const expandCluster = (pointIdx: number, neighbors: number[]): void => {
      labels[pointIdx] = clusterId;
      const queue = [...neighbors];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (labels[current] === -1) labels[current] = clusterId;
        if (labels[current] !== -2) continue;
        labels[current] = clusterId;
        const cn = regionQuery(current);
        if (cn.length >= minPoints) queue.push(...cn);
      }
    };

    for (let i = 0; i < n; i++) {
      if (labels[i] !== -2) continue;
      const neighbors = regionQuery(i);
      if (neighbors.length < minPoints) {
        labels[i] = -1; // noise
      } else {
        expandCluster(i, neighbors);
        clusterId++;
      }
    }
    return labels;
  }

  private groupByLabels(
    logs: readonly MissEvent[],
    labels: readonly number[],
  ): readonly MissEvent[][] {
    const groups = new Map<number, MissEvent[]>();
    for (let i = 0; i < logs.length; i++) {
      const label = labels[i]!;
      if (label === -1) continue; // skip noise
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(logs[i]!);
    }
    return Array.from(groups.values());
  }
}
