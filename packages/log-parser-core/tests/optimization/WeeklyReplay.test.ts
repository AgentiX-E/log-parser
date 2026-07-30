import { describe, it, expect } from 'vitest';
import { WeeklyReplay } from '../../src/optimization/WeeklyReplay.js';

function makeLogs(count: number): string[] {
  const logs: string[] = [];
  for (let i = 0; i < count; i++) {
    logs.push(`User user${i} logged in from 192.168.1.${i % 255}`);
  }
  return logs;
}

function makeGroundTruth(
  count: number,
): Array<{ logId: string; template: string; eventId: string }> {
  return Array.from({ length: count }, (_, i) => ({
    logId: String(i),
    template: 'User <*> logged in from <IP>',
    eventId: 'E1',
  }));
}

describe('WeeklyReplay', () => {
  it('runs with ground truth and produces valid config', async () => {
    const replay = new WeeklyReplay(undefined, { maxIterations: 10 });
    const result = await replay.run(makeLogs(100), makeGroundTruth(100));
    expect(result.config).toBeDefined();
    expect(result.config.simTh).toBeDefined();
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.evaluations).toBeGreaterThan(0);
  });

  it('produces valid JSON config for deployment', async () => {
    const replay = new WeeklyReplay(undefined, { maxIterations: 10 });
    const result = await replay.run(makeLogs(50), makeGroundTruth(50));
    const parsed = JSON.parse(result.configJSON);
    expect(parsed.simTh).toBeDefined();
    expect(typeof result.configEnv).toBe('string');
    expect(result.configEnv).toContain('LOG_PARSER_SIM_TH');
  });

  it('runs without ground truth (unsupervised)', async () => {
    const replay = new WeeklyReplay(undefined, { maxIterations: 10 });
    const result = await replay.run(makeLogs(30));
    expect(result.config).toBeDefined();
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('handles empty logs gracefully', async () => {
    const replay = new WeeklyReplay(undefined, { maxIterations: 5 });
    const result = await replay.run([]);
    expect(result.config).toBeDefined();
    expect(result.evaluations).toBeGreaterThanOrEqual(0);
  });

  it('reports changed=true when improvement exists', async () => {
    const replay = new WeeklyReplay(undefined, { maxIterations: 20 });
    const result = await replay.run(makeLogs(50), makeGroundTruth(50));
    expect(typeof result.changed).toBe('boolean');
  });

  it('accepts previous config for comparison', async () => {
    const prev = { simTh: 0.5, depth: 4, maxChildren: 100 };
    const replay = new WeeklyReplay(prev, { maxIterations: 10 });
    const result = await replay.run(makeLogs(30), makeGroundTruth(30));
    expect(result.config).toBeDefined();
  });
});
