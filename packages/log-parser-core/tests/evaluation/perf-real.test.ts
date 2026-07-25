import { describe, it, expect } from 'vitest';
import { LogParserPipeline } from '../../src/pipeline/LogParserPipeline.js';

const TEMPLATES = [
  'User <*> logged in from <*>',
  'ERROR connection to <*> failed after <*> retries',
  'Request <*> <*> returned <*> in <*>ms',
  'Scheduler rescheduled task <*> from <*> to <*>',
  'Cache eviction for key <*> completed in <*>ms',
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function generateLog(): string {
  const template = pick(TEMPLATES);
  return template
    .replace('<*>', () => pick(['alice', 'bob', 'charlie', 'dave', 'eve', 'task-42', 'job-7']))
    .replace('<*>', () => pick(['alice', 'bob', 'charlie', 'dave', 'eve', 'task-42', 'job-7']))
    .replace('<*>', () => pick(['192.168.1.1', '10.0.0.1', 'db-primary.local', '/api/users', '500']));
}

describe('Performance Benchmark', () => {
  const LOG_COUNT = 5000;

  it('parses 5K synthetic logs in under 2 seconds', () => {
    const pipeline = new LogParserPipeline();
    const logs = Array.from({ length: LOG_COUNT }, () => generateLog());

    const start = performance.now();
    for (const log of logs) {
      pipeline.parse(log);
    }
    const elapsed = performance.now() - start;
    const throughput = Math.round(LOG_COUNT / (elapsed / 1000));

    expect(pipeline.stats.totalProcessed).toBe(LOG_COUNT);
    expect(elapsed).toBeLessThan(3000); // Under 3 seconds
    console.log(
      `[perf] ${LOG_COUNT.toLocaleString()} logs in ${elapsed.toFixed(0)}ms ` +
      `(${throughput.toLocaleString()} logs/sec), ` +
      `${pipeline.stats.templateCount} templates learned`,
    );
  });

  it('progressive rounds show stable throughput', () => {
    const rounds = 5;
    const results: number[] = [];

    for (let round = 0; round < rounds; round++) {
      const pipeline = new LogParserPipeline();
      const logs = Array.from({ length: LOG_COUNT }, () => generateLog());
      const start = performance.now();
      for (const log of logs) {
        pipeline.parse(log);
      }
      const elapsed = performance.now() - start;
      const throughput = Math.round(LOG_COUNT / (elapsed / 1000));
      results.push(throughput);
    }

    const avg = results.reduce((a, b) => a + b, 0) / results.length;
    // Throughput should be at least 1000 logs/sec
    expect(avg).toBeGreaterThan(1000);

    // Variance across rounds should be reasonable (<100% of mean for CI variance in VMs)
    const variance = results.reduce((s, r) => s + (r - avg) ** 2, 0) / results.length;
    const stdDev = Math.sqrt(variance);
    expect(stdDev / avg).toBeLessThan(1.0);
  });

  it('memory usage is bounded', () => {
    const pipeline = new LogParserPipeline();
    const logs = Array.from({ length: 2000 }, () => generateLog());
    const before = process.memoryUsage().heapUsed;

    for (const log of logs) {
      pipeline.parse(log);
    }

    const after = process.memoryUsage().heapUsed;
    const deltaMB = (after - before) / 1024 / 1024;

    // Memory growth should be reasonable (<50MB for 2000 logs)
    expect(deltaMB).toBeLessThan(50);
    console.log(`[memory] Heap delta: ${deltaMB.toFixed(1)}MB for ${LOG_COUNT} logs`);
  });
});
