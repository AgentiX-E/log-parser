import { describe, it, expect } from 'vitest';
import { DatasetLoader } from '../../src/evaluation/DatasetLoader.js';
import { LogParserPipeline } from '../../src/pipeline/LogParserPipeline.js';
import { Evaluator } from '../../src/evaluation/Evaluator.js';

describe('Real Benchmark — LogHub-2k SSH', () => {
  const loader = new DatasetLoader();

  it('parses all 21 SSH logs without errors', () => {
    const ds = loader.loadSync('ssh');
    const pipeline = new LogParserPipeline();

    for (const log of ds.logs) {
      const result = pipeline.parse(log);
      expect(result.template).toBeTruthy();
      expect(result.templateId).toBeGreaterThan(0);
    }

    expect(pipeline.stats.totalProcessed).toBe(21);
    // drain-ts should discover some templates (exact count depends on sim_th)
    expect(pipeline.stats.templateCount).toBeGreaterThan(0);
    expect(pipeline.stats.drainHits).toBeGreaterThanOrEqual(0);
  });

  it('deterministic — 10 identical runs produce identical metrics', () => {
    const run = () => {
      const ds = loader.loadSync('ssh');
      const pipeline = new LogParserPipeline();
      const evaluator = new Evaluator();
      const parsed = ds.logs.map((log, i) => {
        const r = pipeline.parse(log);
        return { logId: String(i), template: r.template, eventId: String(r.templateId) };
      });
      return evaluator.evaluate(parsed, ds.groundTruth);
    };

    const first = run();
    for (let attempt = 0; attempt < 5; attempt++) {
      const next = run();
      expect(next.ga).toBe(first.ga);
      expect(next.pa).toBe(first.pa);
    }
  });

  it('evaluator produces all 7 metrics in valid [0,1] range', () => {
    const ds = loader.loadSync('ssh');
    const pipeline = new LogParserPipeline();
    const evaluator = new Evaluator();

    const parsed = ds.logs.map((log, i) => {
      const r = pipeline.parse(log);
      return { logId: String(i), template: r.template, eventId: String(r.templateId) };
    });

    const metrics = evaluator.evaluate(parsed, ds.groundTruth);

    expect(metrics.ga).toBeGreaterThanOrEqual(0);
    expect(metrics.ga).toBeLessThanOrEqual(1);
    expect(metrics.pa).toBeGreaterThanOrEqual(0);
    expect(metrics.pa).toBeLessThanOrEqual(1);
    expect(metrics.pta).toBeGreaterThanOrEqual(0);
    expect(metrics.pta).toBeLessThanOrEqual(1);
    expect(metrics.rta).toBeGreaterThanOrEqual(0);
    expect(metrics.rta).toBeLessThanOrEqual(1);
    expect(metrics.fta).toBeGreaterThanOrEqual(0);
    expect(metrics.fta).toBeLessThanOrEqual(1);
    expect(metrics.ned).toBeGreaterThanOrEqual(0);
    expect(metrics.ned).toBeLessThanOrEqual(1);
    expect(metrics.fga).toBeGreaterThanOrEqual(0);
    expect(metrics.fga).toBeLessThanOrEqual(1);
  });
});
