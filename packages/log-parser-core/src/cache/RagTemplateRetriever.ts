import type { LogTemplate } from '../pipeline/types.js';

/**
 * RAG-based template retriever using Jaccard similarity.
 * Alternative to Trie-based AdaptiveTemplateCache.
 *
 * Inspired by OpenLogParser's Jaccard-based RAG selection.
 *
 * Suitable when semantic token overlap matters more than prefix matching.
 * Token-index prunes candidates before full similarity scoring.
 */
export class RagTemplateRetriever {
  private readonly templates = new Map<string, LogTemplate>();
  private readonly tokenIndex = new Map<string, Set<string>>();
  private templateList: LogTemplate[] = [];

  addTemplate(template: LogTemplate): void {
    if (this.templates.has(template.id)) return;
    this.templates.set(template.id, template);
    this.templateList.push(template);
    for (const token of template.tokens) {
      if (!this.tokenIndex.has(token)) {
        this.tokenIndex.set(token, new Set());
      }
      this.tokenIndex.get(token)!.add(template.id);
    }
  }

  findSimilar(logTokens: readonly string[], threshold: number = 0.5): LogTemplate | null {
    let bestScore = 0;
    let bestTemplate: LogTemplate | null = null;
    const candidates = this.getCandidates(logTokens);

    for (const template of candidates) {
      const score = this.jaccardSimilarity(logTokens, template.tokens);
      if (score > bestScore) {
        bestScore = score;
        bestTemplate = template;
      }
    }
    return bestScore >= threshold ? bestTemplate : null;
  }

  findTopK(logTokens: readonly string[], k: number): LogTemplate[] {
    const scored = this.templateList
      .map((t) => ({ template: t, score: this.jaccardSimilarity(logTokens, t.tokens) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
    return scored.map((s) => s.template);
  }

  get templateCount(): number {
    return this.templates.size;
  }

  private getCandidates(logTokens: readonly string[]): LogTemplate[] {
    const candidateIds = new Set<string>();
    for (const token of logTokens) {
      const ids = this.tokenIndex.get(token);
      if (ids) for (const id of ids) candidateIds.add(id);
    }
    if (candidateIds.size === 0) return this.templateList;
    return [...candidateIds].map((id) => this.templates.get(id)!).filter(Boolean);
  }

  jaccardSimilarity(a: readonly string[], b: readonly string[]): number {
    const setA = new Set(a);
    const setB = new Set(b);
    let intersection = 0;
    for (const token of setA) {
      if (setB.has(token)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 1 : intersection / union;
  }
}
