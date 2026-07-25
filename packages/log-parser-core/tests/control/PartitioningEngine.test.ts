import { describe, it, expect, vi } from 'vitest';
import { PartitioningEngine, type MissEvent } from '../../src/control/PartitioningEngine.js';
import type { IEmbeddingProvider } from '../../src/embedding/IEmbeddingProvider.js';

function makeEvent(msg: string, tokens: string[]): MissEvent {
  return { logMessage: msg, tokens, timestamp: Date.now() };
}

describe('PartitioningEngine', () => {
  describe('empty / single element', () => {
    it('should return empty array for empty input', async () => {
      const engine = new PartitioningEngine();
      expect(await engine.partition([])).toEqual([]);
    });

    it('should return single group for single log', async () => {
      const engine = new PartitioningEngine();
      const result = await engine.partition([makeEvent('test', ['test'])]);
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(1);
    });
  });

  describe('TF-IDF fallback', () => {
    it('should partition logs using TF-IDF + DBSCAN', async () => {
      const engine = new PartitioningEngine(undefined);
      const events: MissEvent[] = [
        makeEvent('User alice logged in', ['User', 'alice', 'logged', 'in']),
        makeEvent('User bob logged in', ['User', 'bob', 'logged', 'in']),
        makeEvent('User charlie logged in', ['User', 'charlie', 'logged', 'in']),
        makeEvent('ERROR connection failed', ['ERROR', 'connection', 'failed']),
        makeEvent('ERROR timeout occurred', ['ERROR', 'timeout', 'occurred']),
      ];
      const result = await engine.partition(events);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should group identical logs together', async () => {
      const engine = new PartitioningEngine();
      const events = Array.from({ length: 5 }, (_, i) =>
        makeEvent(`log ${i}`, ['same', 'template']),
      );
      const result = await engine.partition(events);
      expect(result.length).toBe(1);
    });
  });

  describe('embedding provider injection', () => {
    it('should use injected IEmbeddingProvider', async () => {
      const mockProvider: IEmbeddingProvider = {
        modelId: 'mock',
        dimension: 2,
        embed: vi.fn().mockResolvedValue({
          vectors: [
            new Float32Array([0.99, 0.01]),
            new Float32Array([1.0, 0.0]),
            new Float32Array([0.98, 0.02]),
          ],
        }),
      };
      const engine = new PartitioningEngine(mockProvider);
      const events = [makeEvent('a', ['a']), makeEvent('b', ['b']), makeEvent('c', ['c'])];
      const result = await engine.partition(events);
      expect(mockProvider.embed).toHaveBeenCalled();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle provider with very small dimension', async () => {
      const mockProvider: IEmbeddingProvider = {
        modelId: 'mock',
        dimension: 1,
        embed: vi.fn().mockResolvedValue({
          vectors: Array.from({ length: 5 }, () => new Float32Array([0.9])),
        }),
      };
      const engine = new PartitioningEngine(mockProvider);
      const events = Array.from({ length: 5 }, (_, i) => makeEvent(`log${i}`, [`log${i}`]));
      const result = await engine.partition(events);
      // All identical 1D vectors should cluster together
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]!.length).toBeGreaterThanOrEqual(3);
    });
  });
});
