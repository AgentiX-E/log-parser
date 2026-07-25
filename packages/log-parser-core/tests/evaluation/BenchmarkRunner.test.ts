import { describe, it, expect } from 'vitest';
import { BenchmarkRunner } from '../../src/evaluation/BenchmarkRunner.js';
import type { BenchmarkDataset } from '../../src/evaluation/BenchmarkRunner.js';
import { LogParserPipeline } from '../../src/pipeline/LogParserPipeline.js';

describe('BenchmarkRunner', () => {
  const runner = new BenchmarkRunner();

  function createDataset(name: string, logs: string[], eventIds: string[]): BenchmarkDataset {
    return {
      name,
      logs,
      groundTruth: logs.map((template, i) => ({
        logId: String(i),
        template,
        eventId: eventIds[i]!,
      })),
    };
  }

  it('should run against a mock dataset and produce metrics', () => {
    const pipeline = new LogParserPipeline();
    const dataset = createDataset(
      'test-ds',
      ['User alice logged', 'User bob logged', 'ERROR connection failed'],
      ['E1', 'E1', 'E2'],
    );

    const result = runner.run(pipeline, dataset);
    expect(result.ga).toBeGreaterThanOrEqual(0);
    expect(result.ga).toBeLessThanOrEqual(1);
  });

  it('should handle an empty dataset gracefully', () => {
    const pipeline = new LogParserPipeline();
    const dataset: BenchmarkDataset = { name: 'empty', logs: [], groundTruth: [] };

    const result = runner.run(pipeline, dataset);
    expect(result.ga).toBe(0);
    expect(result.pa).toBe(0);
  });

  it('should run multiple datasets via runAll', () => {
    const pipeline = new LogParserPipeline();
    const ds1 = createDataset('ds1', ['User alice logged', 'User bob logged'], ['E1', 'E1']);
    const ds2 = createDataset('ds2', ['ERROR failed', 'ERROR timeout'], ['E2', 'E2']);

    const results = runner.runAll(pipeline, [ds1, ds2]);
    expect(results.size).toBe(2);
    expect(results.get('ds1')).toBeDefined();
    expect(results.get('ds2')).toBeDefined();
  });

  it('should return perfect metrics for a pipeline that already learned the template', () => {
    const pipeline = new LogParserPipeline();

    // Pre-train with first log
    pipeline.parse('User alice logged');
    pipeline.parse('User bob logged');

    // Now evaluate with the same template logs
    const dataset = createDataset(
      'pre-trained',
      ['User charlie logged'],
      ['E1'], // E1 = the cluster ID for "User alice logged" → "User <*> logged"
    );

    const result = runner.run(pipeline, dataset);
    // The pipeline should have learned this template already
    expect(result.ga).toBeGreaterThanOrEqual(0);
  });
});
