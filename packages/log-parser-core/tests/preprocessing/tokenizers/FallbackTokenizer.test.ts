import { describe, it, expect } from 'vitest';
import { FallbackTokenizer } from '../../../src/preprocessing/tokenizers/FallbackTokenizer.js';

describe('FallbackTokenizer', () => {
  const tokenizer = new FallbackTokenizer();

  it('splits on whitespace', () => {
    expect(tokenizer.tokenize('User alice logged in')).toEqual(['User', 'alice', 'logged', 'in']);
  });

  it('filters empty tokens', () => {
    expect(tokenizer.tokenize('  a   b  ')).toEqual(['a', 'b']);
  });

  it('returns empty array for empty string', () => {
    expect(tokenizer.tokenize('')).toEqual([]);
  });

  it('returns empty array for whitespace-only', () => {
    expect(tokenizer.tokenize('   ')).toEqual([]);
  });

  it('handles tabs and newlines as whitespace', () => {
    expect(tokenizer.tokenize('line1\tcol2\nline3')).toEqual(['line1', 'col2', 'line3']);
  });

  it('returns single token for no whitespace', () => {
    expect(tokenizer.tokenize('singleword')).toEqual(['singleword']);
  });

  it('has id fallback', () => {
    expect(tokenizer.id).toBe('fallback');
  });
});
