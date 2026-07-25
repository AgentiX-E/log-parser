import { describe, it, expect, beforeEach } from 'vitest';
import { AdaptiveTemplateCache } from '../../src/cache/AdaptiveTemplateCache.js';
import type { LogTemplate } from '../../src/pipeline/types.js';

function tpl(id: string, tokens: string[]): LogTemplate {
  return { id, template: tokens.join(' '), tokens };
}

describe('AdaptiveTemplateCache', () => {
  let cache: AdaptiveTemplateCache;

  beforeEach(() => {
    cache = new AdaptiveTemplateCache(10);
  });

  it('should return null for unknown tokens', () => {
    expect(cache.get(['unknown'])).toBeNull();
  });

  it('should return cached template on match', () => {
    const t = tpl('1', ['User', '<*>', 'logged', 'in']);
    cache.put(t);
    expect(cache.get(['User', 'alice', 'logged', 'in'])).toBe(t);
  });

  it('should return null when token length differs', () => {
    cache.put(tpl('1', ['short']));
    expect(cache.get(['short', 'extra'])).toBeNull();
  });

  it('should track hit rate', () => {
    cache.put(tpl('1', ['test']));
    cache.get(['test']); // hit
    cache.get(['miss']); // miss
    expect(cache.hitRate).toBe(0.5);
  });

  it('should return 0 hit rate with no accesses', () => {
    expect(cache.hitRate).toBe(0);
  });

  it('should evict when capacity exceeded', () => {
    const small = new AdaptiveTemplateCache(3);
    for (let i = 0; i < 5; i++) small.put(tpl(String(i), [`tpl_${i}`]));
    expect(small.size).toBeLessThanOrEqual(3);
    expect(small.get(['tpl_0'])).toBeNull();
  });

  it('should track size correctly', () => {
    expect(cache.size).toBe(0);
    cache.put(tpl('1', ['a']));
    expect(cache.size).toBe(1);
    cache.put(tpl('2', ['b']));
    expect(cache.size).toBe(2);
  });

  it('should handle Trie with shared prefix', () => {
    cache.put(tpl('1', ['User', '<*>', 'logged']));
    cache.put(tpl('2', ['User', '<*>', 'failed']));
    expect(cache.get(['User', 'alice', 'logged'])).not.toBeNull();
    expect(cache.get(['User', 'bob', 'failed'])).not.toBeNull();
  });

  it('should return valid effective frequency', () => {
    cache.put(tpl('1', ['test']));
    expect(cache.getEffectiveFrequency('1')).toBeGreaterThan(0);
  });

  it('should return zero effective frequency for unknown template', () => {
    expect(cache.getEffectiveFrequency('nonexistent')).toBe(0);
  });

  it('should clear all entries', () => {
    cache.put(tpl('1', ['a']));
    cache.put(tpl('2', ['b']));
    cache.get(['a']); // generate a hit
    expect(cache.size).toBe(2);
    expect(cache.hitRate).toBeGreaterThan(0);

    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.hitRate).toBe(0);
    expect(cache.get(['a'])).toBeNull();
  });
});
