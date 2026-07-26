import { describe, it, expect } from 'vitest';
import { RagTemplateRetriever } from '../../src/cache/RagTemplateRetriever.js';
import type { LogTemplate } from '../../src/pipeline/types.js';

function createTemplate(id: string, tokens: readonly string[]): LogTemplate {
  return { id, template: tokens.join(' '), tokens };
}

describe('RagTemplateRetriever', () => {
  it('should store and retrieve by exact match', () => {
    const retriever = new RagTemplateRetriever();
    const tpl = createTemplate('t1', ['User', '<*>', 'logged', 'in']);
    retriever.addTemplate(tpl);
    const result = retriever.findSimilar(['User', '<*>', 'logged', 'in']);
    expect(result).toBe(tpl);
  });

  it('should return null when no templates stored', () => {
    const retriever = new RagTemplateRetriever();
    expect(retriever.findSimilar(['any', 'tokens'])).toBeNull();
  });

  it('should return null below threshold', () => {
    const retriever = new RagTemplateRetriever();
    retriever.addTemplate(createTemplate('t1', ['User', 'logged', 'in']));
    const result = retriever.findSimilar(['completely', 'different', 'words'], 0.5);
    expect(result).toBeNull();
  });

  it('should match partial overlap at lower threshold', () => {
    const retriever = new RagTemplateRetriever();
    retriever.addTemplate(createTemplate('t1', ['User', '<*>', 'logged', 'in']));
    const result = retriever.findSimilar(['User', 'bob', 'logged', 'out'], 0.3);
    expect(result).not.toBeNull();
  });

  it('should return null for empty queries', () => {
    const retriever = new RagTemplateRetriever();
    retriever.addTemplate(createTemplate('t1', ['a', 'b']));
    expect(retriever.findSimilar([])).toBeNull();
  });

  it('should findTopK return correct count', () => {
    const retriever = new RagTemplateRetriever();
    retriever.addTemplate(createTemplate('t1', ['User', '<*>']));
    retriever.addTemplate(createTemplate('t2', ['User', 'logged']));
    retriever.addTemplate(createTemplate('t3', ['ERROR', '<*>']));
    const results = retriever.findTopK(['User', 'logged', 'in'], 2);
    expect(results).toHaveLength(2);
  });

  it('should findTopK sort by similarity', () => {
    const retriever = new RagTemplateRetriever();
    retriever.addTemplate(createTemplate('a', ['User', '<*>', 'logged', 'in']));
    retriever.addTemplate(createTemplate('b', ['ERROR', '<*>', 'failed']));
    retriever.addTemplate(createTemplate('c', ['User', '<*>', 'logged', 'out']));
    const results = retriever.findTopK(['User', '<*>', 'logged', 'in'], 3);
    expect(results[0]!.id).toBe('a');
    expect(results[results.length - 1]!.id).toBe('b');
  });

  it('should not duplicate templates', () => {
    const retriever = new RagTemplateRetriever();
    const tpl = createTemplate('t1', ['a', 'b']);
    retriever.addTemplate(tpl);
    retriever.addTemplate(tpl);
    expect(retriever.templateCount).toBe(1);
  });

  it('should report correct template count', () => {
    const retriever = new RagTemplateRetriever();
    expect(retriever.templateCount).toBe(0);
    retriever.addTemplate(createTemplate('t1', ['a']));
    expect(retriever.templateCount).toBe(1);
    retriever.addTemplate(createTemplate('t2', ['b']));
    expect(retriever.templateCount).toBe(2);
  });

  it('should use token index for pruning', () => {
    const retriever = new RagTemplateRetriever();
    retriever.addTemplate(createTemplate('t1', ['User', '<*>', 'logged', 'in']));
    retriever.addTemplate(createTemplate('t2', ['ERROR', '<*>', 'failed']));
    // Query using token 'User' should find t1 faster than full scan
    const result = retriever.findSimilar(['User', 'something'], 0.2);
    expect(result).not.toBeNull();
  });

  it('should handle performance with many templates', () => {
    const retriever = new RagTemplateRetriever();
    for (let i = 0; i < 100; i++) {
      retriever.addTemplate(createTemplate(`t${i}`, ['template', String(i), 'token']));
    }
    const start = performance.now();
    const result = retriever.findSimilar(['template', '42', 'token']);
    const elapsed = performance.now() - start;
    expect(result).not.toBeNull();
    expect(elapsed).toBeLessThan(50);
  });
});
