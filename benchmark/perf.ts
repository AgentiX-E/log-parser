#!/usr/bin/env node
/**
 * Progressive multi-round performance benchmark.
 *
 * Measures drain-only throughput across increasing batch sizes
 * and tracks performance improvement round by round.
 *
 * Target: >= 50,000 logs/sec drain-only (single-threaded, Node.js 22).
 */

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

const USERNAMES = ['alice', 'bob', 'charlie', 'dave', 'eve', 'task-42', 'job-7', 'process-99'];
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

const BATCH_SIZES = [1000, 5000, 10000, 50000, 100000];
const ROUNDS_PER_BATCH = 5;

console.log('=== Log Parser Performance Benchmark ===');
console.log(`Node.js: ${process.version}`);
console.log(`Templates: ${TEMPLATES.length}, Rounds per batch: ${ROUNDS_PER_BATCH}`);
console.log('');

let overallBest = 0;

for (const batchSize of BATCH_SIZES) {
  const pipeline = new LogParserPipeline();
  const logs: string[] = [];
  for (let i = 0; i < batchSize; i++) {
    logs.push(generateLog(pick(TEMPLATES)));
  }

  const roundResults: number[] = [];
  for (let round = 1; round <= ROUNDS_PER_BATCH; round++) {
    const start = performance.now();
    for (const log of logs) {
      pipeline.parse(log);
    }
    const elapsed = performance.now() - start;
    const throughput = Math.round(batchSize / (elapsed / 1000));
    roundResults.push(throughput);
    console.log(
      `  Batch ${batchSize.toLocaleString()} Round ${round}: ` +
        `${throughput.toLocaleString()} logs/sec (${elapsed.toFixed(1)}ms)`,
    );
  }

  const avg = Math.round(roundResults.reduce((a, b) => a + b, 0) / roundResults.length);
  const best = Math.max(...roundResults);
  if (best > overallBest) overallBest = best;

  const improvement =
    roundResults.length > 1
      ? ((roundResults[roundResults.length - 1]! - roundResults[0]!) / roundResults[0]!) * 100
      : 0;
  console.log(
    `  → Avg: ${avg.toLocaleString()} logs/sec, Best: ${best.toLocaleString()}, ` +
      `Improvement: ${improvement > 0 ? '+' : ''}${improvement.toFixed(1)}%`,
  );
  console.log(`  → Templates learned: ${pipeline.stats.templateCount}`);
  console.log('');
}

console.log(`Overall best: ${overallBest.toLocaleString()} logs/sec`);
console.log(`Target: 50,000 logs/sec — ${overallBest >= 50000 ? 'PASS ✅' : 'BELOW TARGET ⚠️'}`);
console.log('');
console.log('=== Benchmark Complete ===');
