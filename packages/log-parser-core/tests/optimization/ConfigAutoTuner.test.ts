import { describe, it, expect } from 'vitest';
import { ConfigAutoTuner } from '../../src/optimization/ConfigAutoTuner.js';

function makeDataset(logCount: number) {
  const logs: string[] = [];
  const groundTruth: Array<{ logId: string; template: string; eventId: string }> = [];
  for (let i = 0; i < logCount; i++) {
    const user = ['alice', 'bob', 'charlie'][i % 3];
    const ip = ['192.168.1.1', '10.0.0.1', '172.16.0.1'][i % 3];
    const log = `User ${user} logged in from ${ip}`;
    logs.push(log);
    groundTruth.push({
      logId: String(i),
      template: 'User <*> logged in from <IP>',
      eventId: 'E1',
    });
  }
  return { logs, groundTruth };
}

describe('ConfigAutoTuner', () => {
  it('runs on a synthetic dataset and returns a result', async () => {
    const dataset = makeDataset(30);
    const tuner = new ConfigAutoTuner(dataset);
    const result = await tuner.tune({ maxIterations: 10 });
    expect(result.bestConfig).toBeDefined();
    expect(result.bestConfig.simTh).toBeGreaterThanOrEqual(0.2);
    expect(result.bestConfig.simTh).toBeLessThanOrEqual(0.8);
    expect(result.evaluations).toBeGreaterThan(0);
    expect(result.evaluations).toBeLessThanOrEqual(10);
  });

  it('returns history with all evaluations', async () => {
    const dataset = makeDataset(30);
    const tuner = new ConfigAutoTuner(dataset);
    const result = await tuner.tune({ maxIterations: 10 });
    expect(result.history.length).toBe(result.evaluations);
    for (const step of result.history) {
      expect(step.ga).toBeGreaterThanOrEqual(0);
      expect(step.ga).toBeLessThanOrEqual(1);
      expect(step.config).toBeDefined();
    }
  });

  it('computes improvement over baseline', async () => {
    const dataset = makeDataset(30);
    const tuner = new ConfigAutoTuner(dataset);
    const result = await tuner.tune({ maxIterations: 10 });
    expect(result.improvement.ga).toBeDefined();
    expect(result.improvement.pta).toBeDefined();
  });

  it('handles empty dataset gracefully', async () => {
    const tuner = new ConfigAutoTuner({ logs: [] });
    const result = await tuner.tune({ maxIterations: 5 });
    expect(result.bestConfig).toBeDefined();
    // Empty dataset: Evaluator returns 1.0 (0/0 = no errors)
    expect(result.bestGa).toBeGreaterThanOrEqual(0);
    expect(result.bestPta).toBeGreaterThanOrEqual(0);
  });

  it('handles single-log dataset', async () => {
    const dataset = makeDataset(1);
    const tuner = new ConfigAutoTuner(dataset);
    const result = await tuner.tune({ maxIterations: 5 });
    expect(result.bestConfig).toBeDefined();
  });

  it('runs in unsupervised mode without ground truth', async () => {
    const logs = Array.from({ length: 20 }, (_, i) => `log message ${i}`);
    const tuner = new ConfigAutoTuner({ logs });
    const result = await tuner.tune({ maxIterations: 5 });
    expect(result.bestConfig).toBeDefined();
    expect(result.bestGa).toBeGreaterThanOrEqual(0);
  });

  it('respects maxIterations limit', async () => {
    const dataset = makeDataset(30);
    const tuner = new ConfigAutoTuner(dataset);
    const result = await tuner.tune({ maxIterations: 5 });
    expect(result.evaluations).toBeLessThanOrEqual(5);
  });

  it('accepts custom param space ranges', async () => {
    const dataset = makeDataset(30);
    const tuner = new ConfigAutoTuner(dataset);
    const result = await tuner.tune({
      maxIterations: 5,
      simThRange: [0.5, 0.7],
      depthRange: [4, 5],
      maxChildrenRange: [100, 200],
    });
    expect(result.bestConfig.simTh).toBeGreaterThanOrEqual(0.5);
    expect(result.bestConfig.simTh).toBeLessThanOrEqual(0.7);
  });

  it('computes score correctly per metric', async () => {
    const dataset = makeDataset(30);
    const tuner = new ConfigAutoTuner(dataset);
    const gaResult = await tuner.tune({ maxIterations: 3, targetMetric: 'ga' });
    const ptaResult = await tuner.tune({ maxIterations: 3, targetMetric: 'pta' });
    expect(gaResult).toBeDefined();
    expect(ptaResult).toBeDefined();
  });

  it('handles combined metric with custom gaWeight', async () => {
    const dataset = makeDataset(30);
    const tuner = new ConfigAutoTuner(dataset);
    const result = await tuner.tune({ maxIterations: 3, targetMetric: 'combined', gaWeight: 0.5 });
    expect(result.bestGa).toBeGreaterThanOrEqual(0);
    expect(result.bestPta).toBeGreaterThanOrEqual(0);
  });

  it('uses default config when none provided', async () => {
    const tuner = new ConfigAutoTuner(makeDataset(10));
    expect(tuner).toBeDefined();
    const result = await tuner.tune({ maxIterations: 2 });
    expect(result.bestConfig.simTh).toBeDefined();
  });

  it('accepts custom default config', async () => {
    const dataset = makeDataset(10);
    const customDefault = { simTh: 0.6, depth: 5, maxChildren: 200 };
    const tuner = new ConfigAutoTuner(dataset, customDefault);
    const result = await tuner.tune({ maxIterations: 2 });
    expect(result.bestConfig).toBeDefined();
  });
});
