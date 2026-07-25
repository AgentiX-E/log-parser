import { describe, it, expect } from 'vitest';
import { JapaneseTokenizer } from '../../../src/preprocessing/tokenizers/JapaneseTokenizer.js';

describe('JapaneseTokenizer', () => {
  const tokenizer = new JapaneseTokenizer();

  it('has id ja', () => {
    expect(tokenizer.id).toBe('ja');
  });

  it('tokenize returns fallback tokens (kuromoji not installed)', () => {
    const result = tokenizer.tokenize('ユーザーがログイン');
    expect(result.length).toBeGreaterThan(0);
  });

  it('filters empty tokens', () => {
    const result = tokenizer.tokenize('  テスト  ');
    expect(result).toEqual(['テスト']);
  });

  it('returns empty for empty string', () => {
    expect(tokenizer.tokenize('')).toEqual([]);
  });

  it('returns empty for whitespace only', () => {
    expect(tokenizer.tokenize('   \t  ')).toEqual([]);
  });
});
