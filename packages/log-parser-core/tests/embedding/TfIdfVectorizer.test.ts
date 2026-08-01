import { describe, it, expect } from 'vitest';
import { TfIdfVectorizer } from '../../src/embedding/TfIdfVectorizer.js';

describe('TfIdfVectorizer', () => {
  it('should return empty array for empty input', () => {
    const vec = new TfIdfVectorizer();
    expect(vec.fitTransform([])).toEqual([]);
  });

  it('should produce equal-length vectors for all documents', () => {
    const vec = new TfIdfVectorizer();
    const docs = [
      ['a', 'b'],
      ['b', 'c'],
      ['a', 'c'],
    ];
    const result = vec.fitTransform(docs);
    expect(result).toHaveLength(3);
    const dim = result[0]!.length;
    for (const v of result) expect(v).toHaveLength(dim);
  });

  it('should handle single-document input', () => {
    const vec = new TfIdfVectorizer();
    const result = vec.fitTransform([['hello', 'world']]);
    expect(result).toHaveLength(1);
    expect(result[0]!.length).toBeGreaterThan(0);
  });

  it('should handle empty documents gracefully', () => {
    const vec = new TfIdfVectorizer();
    const result = vec.fitTransform([[], ['a'], []]);
    expect(result).toHaveLength(3);
    expect(result[0]!.every((v) => v === 0)).toBe(true);
    expect(result[2]!.every((v) => v === 0)).toBe(true);
  });

  it('should produce deterministic output', () => {
    const docs = [
      ['a', 'b'],
      ['b', 'c'],
    ];
    const r1 = new TfIdfVectorizer().fitTransform(docs);
    const r2 = new TfIdfVectorizer().fitTransform(docs);
    expect(r1).toEqual(r2);
  });

  it('should handle repeated terms within a document', () => {
    const vec = new TfIdfVectorizer();
    const result = vec.fitTransform([['a', 'a', 'a', 'b']]);
    expect(result).toHaveLength(1);
  });

  it('should produce identical vectors for identical documents', () => {
    const vec = new TfIdfVectorizer();
    const docs = [
      ['a', 'b'],
      ['a', 'b'],
    ];
    const result = vec.fitTransform(docs);
    expect(result[0]).toEqual(result[1]);
  });

  it('should produce different vectors for different documents', () => {
    const vec = new TfIdfVectorizer();
    const docs = [
      ['x', 'y', 'z'],
      ['a', 'b', 'c'],
    ];
    const result = vec.fitTransform(docs);
    const same = result[0]!.every((v, i) => v === result[1]![i]);
    expect(same).toBe(false);
  });

  it('should give higher weight to rare terms', () => {
    const vec = new TfIdfVectorizer();
    const docs = [['rare', 'common'], ['common'], ['common']];
    const result = vec.fitTransform(docs);
    expect(result).toHaveLength(3);
    const rareIdx = result[0]!.findIndex((v) => v > 0);
    expect(rareIdx).toBeGreaterThanOrEqual(0);
  });

  it('should track isFitted and vocabularySize', () => {
    const vec = new TfIdfVectorizer();
    expect(vec.isFitted).toBe(false);
    expect(vec.vocabularySize).toBe(0);
    vec.fitTransform([
      ['a', 'b'],
      ['b', 'c'],
    ]);
    expect(vec.isFitted).toBe(true);
    expect(vec.vocabularySize).toBeGreaterThan(0);
  });

  it('should expose terms and getIdf', () => {
    const vec = new TfIdfVectorizer();
    vec.fitTransform([['hello', 'world']]);
    expect(vec.terms.length).toBe(2);
    expect(vec.terms).toContain('hello');
    expect(vec.terms).toContain('world');
    expect(vec.getIdf('hello')).toBeGreaterThan(0);
    expect(vec.getIdf('world')).toBeGreaterThan(0);
    expect(vec.getIdf('unknown')).toBe(0);
  });

  it('should throw when transform() called before fitTransform()', () => {
    const vec = new TfIdfVectorizer();
    expect(() => vec.transform(['a', 'b'])).toThrow(/must be fitted/);
  });

  it('should throw when transform() called before fitTransform() with empty tokens', () => {
    const vec = new TfIdfVectorizer();
    expect(() => vec.transform([])).toThrow(/must be fitted/);
  });
});
