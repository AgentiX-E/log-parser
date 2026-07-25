/**
 * Progressive multi-round performance benchmark.
 */
import { describe, it, expect } from 'vitest';
import { LogParserPipeline } from '@agentix-e/log-parser-core';

const TEMPLATES = [
  'User <*> logged in from <IP>',
  'ERROR connection to <HOSTNAME> failed after <NUM> retries',
  'Request <*> <PATH> returned <NUM> in <NUM>ms',
  'Scheduler rescheduled task <*> from <IP> to <HOSTNAME>',
  'Cache eviction for key <*> completed in <NUM>ms',
  'Health check <HOSTNAME>:<NUM> status <*>',
  'Backup completed for volume <PATH> size <NUM> bytes',
];

const USERNAMES = ['alice', 'bob', 'charlie', 'dave', 'eve', 'task-42', 'job-7'];
const IP_VALUES = ['192.168.1.1', '10.0.0.1', '172.16.0.1', '8.8.8.8'];
const HOSTS = ['db-primary.local', 'cache-02.cluster', 'api.prod.example.com'];
const PATHS = ['/api/users', '/var/log/syslog', '/tmp/backup', '/home/data'];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function generateLog(template: string): string {
  return template
    .replace('<*>', () => pick(USERNAMES))
    .replace('<IP>', () => pick(IP_VALUES))
    .replace('<HOSTNAME>', () => pick(HOSTS))
    .replace('<PATH>', () => pick(PATHS))
    .replace('<NUM>', () => String(Math.floor(Math.random() * 5000)));
}

describe('Performance Benchmark', () => {
  const BATCH_SIZES = [100, 1000, 5000];

  for (const batchSize of BATCH_SIZES) {
    it(`should achieve >= 1K logs/sec with ${batchSize} logs over 5 rounds`, () => {
      const logs: string[] = [];
      for (let i = 0; i < batchSize; i++) {
        logs.push(generateLog(pick(TEMPLATES)));
      }

      let bestThroughput = 0;
      for (let round = 0; round < 5; round++) {
        const pipeline = new LogParserPipeline();
        const start = performance.now();
        for (const log of logs) {
          pipeline.parse(log);
        }
        const elapsed = performance.now() - start;
        const throughput = Math.round(batchSize / (elapsed / 1000));
        if (throughput > bestThroughput) bestThroughput = throughput;
      }

      console.log(
        `  Batch ${batchSize.toLocaleString()}: best ${bestThroughput.toLocaleString()} logs/sec`,
      );
      expect(bestThroughput).toBeGreaterThanOrEqual(1000);
    }, 60000);
  }

  it('should learn a reasonable number of templates', () => {
    const pipeline = new LogParserPipeline();
    for (let i = 0; i < 1000; i++) {
      pipeline.parse(generateLog(pick(TEMPLATES)));
    }
    // With 7 template patterns, expect <= 7 templates learned
    expect(pipeline.stats.templateCount).toBeLessThanOrEqual(TEMPLATES.length);
    expect(pipeline.stats.templateCount).toBeGreaterThan(0);
  });
});
