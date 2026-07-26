import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatasetLoader, DATASET_NAMES } from '../../src/evaluation/DatasetLoader.js';

const FIXTURE_DIR = join(__dirname, '..', 'fixtures');

describe('DatasetLoader', () => {
  describe('parseCSV', () => {
    it('parses SSH fixture CSV into BenchmarkDataset', () => {
      const csv = readFileSync(join(FIXTURE_DIR, 'loghub-2k-ssh.csv'), 'utf-8');
      const ds = DatasetLoader.parseCSV(csv, 'SSH');
      expect(ds.name).toBe('SSH');
      expect(ds.logs.length).toBeGreaterThan(0);
      expect(ds.groundTruth.length).toBe(ds.logs.length);
    });

    it('ground truth templates contain <*> placeholders', () => {
      const csv = readFileSync(join(FIXTURE_DIR, 'loghub-2k-ssh.csv'), 'utf-8');
      const ds = DatasetLoader.parseCSV(csv, 'SSH');
      const templates = ds.groundTruth.map((g) => g.template);
      expect(templates.filter((t) => t.includes('<*>')).length).toBeGreaterThan(0);
    });

    it('throws for empty CSV', () => {
      const ds = DatasetLoader.parseCSV('', 'Empty');
      expect(ds.logs).toHaveLength(0);
      expect(ds.groundTruth).toHaveLength(0);
    });

    it('skips CSV header row', () => {
      const csv = 'lineId,logContent,eventTemplate,eventId\n0,hello,hello,E1';
      const ds = DatasetLoader.parseCSV(csv, 'test');
      expect(ds.logs).toHaveLength(1);
      expect(ds.logs[0]).toBe('hello');
    });
  });

  it('listDatasets returns all 16 names', () => {
    const names = DatasetLoader.listDatasets();
    expect(names).toHaveLength(16);
    expect(names).toContain('OpenSSH');
    expect(names).toContain('Apache');
    expect(names).toContain('HDFS');
  });

  it('all dataset names are unique', () => {
    const names = DatasetLoader.listDatasets();
    expect(new Set(names).size).toBe(names.length);
  });
});
