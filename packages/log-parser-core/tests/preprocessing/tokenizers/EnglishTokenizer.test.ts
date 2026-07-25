import { describe, it, expect } from 'vitest';
import { EnglishTokenizer } from '../../../src/preprocessing/tokenizers/EnglishTokenizer.js';

describe('EnglishTokenizer', () => {
  const tokenizer = new EnglishTokenizer();

  it('has id en', () => {
    expect(tokenizer.id).toBe('en');
  });

  it('tokenize returns fallback tokens (natural not installed)', () => {
    // When natural is not available, falls back to whitespace split
    const result = tokenizer.tokenize('User alice logged in');
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('User');
    expect(result).toContain('alice');
  });

  it('filters empty tokens', () => {
    const result = tokenizer.tokenize('  hello  world  ');
    expect(result).toEqual(['hello', 'world']);
  });

  it('returns empty for empty string', () => {
    expect(tokenizer.tokenize('')).toEqual([]);
  });

  it('returns empty for whitespace only', () => {
    expect(tokenizer.tokenize('   \t  ')).toEqual([]);
  });
});
