import { describe, it, expect } from 'vitest';
import {
  cosineSimilarity,
  cosineDistance,
  jaccardSimilarity,
} from '../../src/embedding/Similarity.js';

describe('cosineSimilarity', () => {
  it('should return 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5);
  });

  it('should return 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it('should return 0 for zero vectors', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0);
  });

  it('should handle vectors of different lengths', () => {
    const result = cosineSimilarity([1, 0], [1, 0, 0]);
    expect(result).toBeCloseTo(1, 5);
  });

  it('should handle empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('should produce symmetric results', () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    expect(cosineSimilarity(a, b)).toBe(cosineSimilarity(b, a));
  });
});

describe('cosineDistance', () => {
  it('should return 0 for identical vectors', () => {
    expect(cosineDistance([1, 2, 3], [1, 2, 3])).toBeCloseTo(0, 5);
  });

  it('should return 1 for orthogonal vectors', () => {
    expect(cosineDistance([1, 0], [0, 1])).toBe(1);
  });

  it('should equal 1 - cosineSimilarity', () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    expect(cosineDistance(a, b)).toBeCloseTo(1 - cosineSimilarity(a, b), 10);
  });
});

describe('jaccardSimilarity', () => {
  it('should return 1 for identical sets', () => {
    expect(jaccardSimilarity(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1);
  });

  it('should return 0 for disjoint sets', () => {
    expect(jaccardSimilarity(['a', 'b'], ['c', 'd'])).toBe(0);
  });

  it('should compute partial overlap', () => {
    expect(jaccardSimilarity(['a', 'b', 'c'], ['b', 'c', 'd'])).toBe(0.5);
  });

  it('should handle duplicate elements', () => {
    expect(jaccardSimilarity(['a', 'a', 'b'], ['a', 'b'])).toBe(1);
  });

  it('should handle empty arrays', () => {
    expect(jaccardSimilarity([], [])).toBe(1);
    expect(jaccardSimilarity([], ['a'])).toBe(0);
  });

  it('should handle single-element sets', () => {
    expect(jaccardSimilarity(['x'], ['x'])).toBe(1);
    expect(jaccardSimilarity(['x'], ['y'])).toBe(0);
  });
});
