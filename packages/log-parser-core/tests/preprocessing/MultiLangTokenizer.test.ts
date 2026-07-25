import { describe, it, expect } from 'vitest';
import { MultiLangTokenizer } from '../../src/preprocessing/MultiLangTokenizer.js';

describe('MultiLangTokenizer', () => {
  it('tokenizes English text', () => {
    const tokenizer = new MultiLangTokenizer();
    const result = tokenizer.tokenize('User alice logged in');
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('User');
    expect(result).toContain('alice');
  });

  it('tokenizes arbitrary text with whitespace split (I1 fallback)', () => {
    const tokenizer = new MultiLangTokenizer();
    const result = tokenizer.tokenize('测试 测试');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns empty array for empty string', () => {
    const tokenizer = new MultiLangTokenizer();
    expect(tokenizer.tokenize('')).toEqual([]);
  });

  it('returns empty array for whitespace only', () => {
    const tokenizer = new MultiLangTokenizer();
    expect(tokenizer.tokenize('   ')).toEqual([]);
  });

  it('accepts custom tokenizers', () => {
    const customEn = { id: 'en-custom' as const, tokenize: (t: string) => t.split(' ') };
    const tokenizer = new MultiLangTokenizer({ en: customEn });
    const result = tokenizer.tokenize('hello world');
    expect(result).toEqual(['hello', 'world']);
  });

  it('uses default tokenizers when custom not provided', () => {
    const tokenizer = new MultiLangTokenizer();
    expect(tokenizer.tokenize('hello world').length).toBeGreaterThan(0);
  });
});
