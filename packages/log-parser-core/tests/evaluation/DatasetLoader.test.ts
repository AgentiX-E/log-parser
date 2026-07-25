import { describe, it, expect, beforeAll } from 'vitest';
import { DatasetLoader, DATASET_NAMES } from '../../src/evaluation/DatasetLoader.js';

describe('DatasetLoader', () => {
  describe('listDatasets', () => {
    it('returns all 16 LogHub-2k dataset names', () => {
      expect(DatasetLoader.listDatasets()).toHaveLength(16);
    });

    it('includes all major system categories', () => {
      const names = DatasetLoader.listDatasets();
      expect(names).toContain('HDFS');
      expect(names).toContain('Apache');
      expect(names).toContain('Linux');
      expect(names).toContain('Mac');
      expect(names).toContain('Spark');
      expect(names).toContain('Zookeeper');
    });

    it('DATASET_NAMES matches listDatasets', () => {
      expect(DATASET_NAMES).toEqual(DatasetLoader.listDatasets());
    });
  });

  describe('loadSync — SSH dataset', () => {
    const loader = new DatasetLoader();
    let ds: ReturnType<typeof loader.loadSync>;

    beforeAll(() => {
      ds = loader.loadSync('ssh');
    });

    it('loads the SSH dataset successfully', () => {
      expect(ds.name).toBe('ssh');
    });

    it('returns 21 log messages', () => {
      expect(ds.logs).toHaveLength(21);
    });

    it('has matching log and ground truth lengths', () => {
      expect(ds.logs.length).toBe(ds.groundTruth.length);
    });

    it('logs contain SSH daemon messages', () => {
      for (const log of ds.logs) {
        expect(log.toLowerCase()).toMatch(/sshd|password|invalid|accepted|disconnect/);
      }
    });

    it('ground truth has 10 unique eventIds (E1-E10)', () => {
      const eventIds = new Set(ds.groundTruth.map((g) => g.eventId));
      expect(eventIds.size).toBe(10);
      for (let i = 1; i <= 10; i++) {
        expect(eventIds.has(`E${i}`)).toBe(true);
      }
    });

    it('ground truth templates use <*> placeholder convention', () => {
      for (const gt of ds.groundTruth) {
        expect(gt.template).toContain('<*>');
      }
    });

    it('logs and ground truth are aligned by logId', () => {
      for (let i = 0; i < ds.logs.length; i++) {
        expect(ds.groundTruth[i]!.logId).toBe(String(i));
      }
    });
  });

  describe('error handling', () => {
    it('throws for invalid dataset name', () => {
      const loader = new DatasetLoader();
      expect(() => loader.loadSync('nonexistent' as never)).toThrow(/not found/);
    });

    it('throws descriptive error with download URL', () => {
      const loader = new DatasetLoader();
      try {
        loader.loadSync('FooBar' as never);
      } catch (e) {
        expect(String(e)).toContain('https://github.com/logpai/Loghub-2.0');
      }
    });
  });

  describe('loadAllSync', () => {
    it('returns available datasets without throwing', () => {
      const loader = new DatasetLoader();
      // loadAllSync catches missing datasets, returns what it can find
      const datasets = loader.loadAllSync();
      expect(Array.isArray(datasets)).toBe(true);
      // At minimum, no datasets = empty array (graceful degradation)
    });

    it('all loaded datasets have valid structure', () => {
      const loader = new DatasetLoader();
      for (const ds of loader.loadAllSync()) {
        expect(ds.name).toBeTruthy();
        expect(ds.logs.length).toBeGreaterThan(0);
        expect(ds.groundTruth.length).toBe(ds.logs.length);
      }
    });
  });

  describe('cache directory', () => {
    it('uses cacheDir when fixture not found', () => {
      const loader = new DatasetLoader('/tmp/nonexistent-cache');
      // cacheDir doesn't have the file either, should still throw
      expect(() => loader.loadSync('BGL')).toThrow(/not found/);
    });
  });
});
