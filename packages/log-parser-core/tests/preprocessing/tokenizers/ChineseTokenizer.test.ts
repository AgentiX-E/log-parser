import { describe, it, expect } from 'vitest';
import { ChineseTokenizer } from '../../../src/preprocessing/tokenizers/ChineseTokenizer.js';

describe('ChineseTokenizer', () => {
  const tokenizer = new ChineseTokenizer();

  it('has id zh', () => {
    expect(tokenizer.id).toBe('zh');
  });

  it('tokenize returns fallback tokens (nodejieba not installed)', () => {
    const result = tokenizer.tokenize('用���登录成功');
    expect(result.length).toBeGreaterThan(0);
  });

  it('filters empty tokens', () => {
    const result = tokenizer.tokenize('  测试  ');
    expect(result).toEqual(['测试']);
  });

  it('returns empty for empty string', () => {
    expect(tokenizer.tokenize('')).toEqual([]);
  });

  it('returns empty for whitespace only', () => {
    expect(tokenizer.tokenize('   \t  ')).toEqual([]);
  });
});
