import type { LogTemplate } from '../pipeline/types.js';

/** A node in the template cache trie. */
interface CacheTrieNode {
  /** Children keyed by token string. */
  readonly children: Map<string, CacheTrieNode>;
  /** Template at this node, or null if intermediate. */
  template: LogTemplate | null;
}

/**
 * Adaptive template cache with Trie indexing and LRU eviction.
 *
 * Inspired by LILAC's Adaptive Parsing Cache (FSE 2024).
 *
 * Features:
 * - Trie O(d) lookup by token sequence (d = token depth)
 * - Hit-frequency tracking for hot-path optimization
 * - Time-decayed access weights (cold templates deprioritize over time)
 * - LRU eviction when capacity exceeded
 *
 * Thread-safety note: this class is not thread-safe. Concurrent access
 * must be externally synchronized.
 */
export class AdaptiveTemplateCache {
  private trie: CacheTrieNode = { children: new Map(), template: null };
  private readonly freqMap = new Map<string, number>();
  private readonly timestampMap = new Map<string, number>();
  private readonly templateMap = new Map<string, LogTemplate>();
  private totalHits = 0;
  private totalMisses = 0;

  /**
   * @param maxEntries - Maximum number of templates before LRU eviction. Default 10000.
   * @param timeDecayFactor - Per-hour exponential decay factor. Default 0.95.
   */
  constructor(
    private readonly maxEntries: number = 10000,
    private readonly timeDecayFactor: number = 0.95,
  ) {}

  /**
   * Look up a template by its token sequence.
   *
   * Updates access frequency and timestamp on hit. Returns null on miss.
   */
  get(tokens: readonly string[]): LogTemplate | null {
    const node = this.trieSearch(tokens);
    if (node?.template && this.templateMap.has(node.template.id)) {
      const id = node.template.id;
      this.freqMap.set(id, (this.freqMap.get(id) ?? 0) + 1);
      this.timestampMap.set(id, Date.now());
      this.totalHits++;
      return node.template;
    }
    this.totalMisses++;
    return null;
  }

  /**
   * Store a template in the cache. Triggers LRU eviction if capacity exceeded.
   */
  put(template: LogTemplate): void {
    this.templateMap.set(template.id, template);
    this.trieInsert(template.tokens, template);
    this.freqMap.set(template.id, 1);
    this.timestampMap.set(template.id, Date.now());

    if (this.templateMap.size > this.maxEntries) {
      this.evict();
    }
  }

  /** Current number of cached templates. */
  get size(): number {
    return this.templateMap.size;
  }

  /** Cache hit rate as a fraction [0, 1]. */
  get hitRate(): number {
    const total = this.totalHits + this.totalMisses;
    return total === 0 ? 0 : this.totalHits / total;
  }

  /**
   * Compute the time-decayed effective frequency for a template.
   *
   * effective = raw_frequency * timeDecayFactor^(age_hours)
   */
  getEffectiveFrequency(templateId: string): number {
    const freq = this.freqMap.get(templateId) ?? 0;
    const ts = this.timestampMap.get(templateId) ?? 0;
    const ageHours = Date.now() - ts === 0 ? 0 : (Date.now() - ts) / 3600000;
    return freq * Math.pow(this.timeDecayFactor, ageHours);
  }

  /** Remove all entries from the cache. */
  clear(): void {
    this.trie = { children: new Map(), template: null };
    this.freqMap.clear();
    this.timestampMap.clear();
    this.templateMap.clear();
    this.totalHits = 0;
    this.totalMisses = 0;
  }

  // ─── Private helpers ───

  private trieSearch(tokens: readonly string[]): CacheTrieNode | null {
    let node: CacheTrieNode = this.trie;
    for (const token of tokens) {
      // Exact match first, then fall back to wildcard ('<*>') node
      const child = node.children.get(token) ?? node.children.get('<*>');
      if (!child) return null;
      node = child;
    }
    return node;
  }

  private trieInsert(tokens: readonly string[], template: LogTemplate): void {
    let node: CacheTrieNode = this.trie;
    for (const token of tokens) {
      let child = node.children.get(token);
      if (!child) {
        child = { children: new Map(), template: null };
        node.children.set(token, child);
      }
      node = child;
    }
    node.template = template;
  }

  private evict(): void {
    let lowestId: string | null = null;
    let lowestFreq = Infinity;

    for (const id of this.templateMap.keys()) {
      const effFreq = this.getEffectiveFrequency(id);
      if (effFreq < lowestFreq) {
        lowestFreq = effFreq;
        lowestId = id;
      }
    }

    if (lowestId) {
      this.templateMap.delete(lowestId);
      this.freqMap.delete(lowestId);
      this.timestampMap.delete(lowestId);
      this.compact();
    }
  }

  /**
   * Prune trie nodes that no longer point to any valid template.
   * Called automatically after eviction to prevent memory leaks.
   * Returns the number of nodes removed.
   */
  compact(): number {
    let removed = 0;
    const prune = (node: CacheTrieNode): boolean => {
      let hasAnyTemplate = node.template !== null;
      for (const [key, child] of node.children) {
        if (prune(child)) {
          hasAnyTemplate = true;
        } else {
          node.children.delete(key);
          removed++;
        }
      }
      return hasAnyTemplate;
    };
    prune(this.trie);
    return removed;
  }
}
