import { describe, it, expect } from 'vitest';
import { DppSampler } from '../../src/control/DppSampler.js';

describe('DppSampler', () => {
  it('should return empty array for empty input', () => {
    expect(new DppSampler().sample([], 3)).toEqual([]);
  });

  it('should return all indices when k >= n', () => {
    const sampler = new DppSampler();
    const vectors = [
      [1, 0],
      [0, 1],
      [1, 1],
    ];
    const result = sampler.sample(vectors, 5);
    expect(result.sort()).toEqual([0, 1, 2]);
  });

  it('should select diverse samples from two clusters', () => {
    const sampler = new DppSampler();
    const clusterA = Array.from({ length: 10 }, (_, i) => [1 + i * 0.001, 0]);
    const clusterB = Array.from({ length: 10 }, (_, i) => [0, 1 + i * 0.001]);
    const vectors = [...clusterA, ...clusterB];
    const result = sampler.sample(vectors, 4);
    const fromA = result.filter((i) => i < 10).length;
    const fromB = result.filter((i) => i >= 10).length;
    expect(fromA).toBeGreaterThan(0);
    expect(fromB).toBeGreaterThan(0);
  });

  it('should return exactly k indices when k < n', () => {
    const sampler = new DppSampler();
    const vectors = Array.from({ length: 10 }, (_, i) => [i, 10 - i]);
    expect(sampler.sample(vectors, 5)).toHaveLength(5);
  });

  it('should avoid selecting duplicate samples', () => {
    const sampler = new DppSampler();
    const vectors = Array.from({ length: 20 }, () => [Math.random(), Math.random()]);
    const result = sampler.sample(vectors, 10);
    expect(new Set(result).size).toBe(result.length);
  });

  it('should handle all-identical vectors', () => {
    const sampler = new DppSampler();
    const vectors = Array.from({ length: 10 }, () => [1.0, 0.0]);
    expect(sampler.sample(vectors, 3)).toHaveLength(3);
  });

  it('should handle zero vectors gracefully', () => {
    const sampler = new DppSampler();
    const vectors: number[][] = [
      [0, 0],
      [1, 0],
      [0, 1],
    ];
    const result = sampler.sample(vectors, 2);
    expect(result).toHaveLength(2);
  });
});
