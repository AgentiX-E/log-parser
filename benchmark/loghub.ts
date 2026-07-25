#!/usr/bin/env node
/**
 * LogHub-2k evaluation benchmark.
 *
 * Evaluates log-parser against reference datasets using the standard
 * GA/PA/PTA/RTA/FTA/NED metrics from LogPAI (logpai/logparser).
 *
 * Full LogHub-2k datasets must be downloaded separately from:
 * https://github.com/logpai/Loghub-2.0
 */

import {
  LogParserPipeline,
  Evaluator,
  type ParsedLogEntry,
  type GroundTruthEntry,
} from '@agentix-e/log-parser-core';

const SSH_LOGS: readonly string[] = [
  'Accepted password for root from 192.168.1.1 port 22 ssh2',
  'Accepted password for admin from 10.0.0.1 port 22 ssh2',
  'Failed password for root from 172.16.0.1 port 22 ssh2',
  'Failed password for admin from 8.8.8.8 port 22 ssh2',
  'Connection closed by authenticating user root 192.168.1.1 port 22',
  'Connection closed by authenticating user admin 10.0.0.1 port 22',
  'Accepted publickey for deploy from 192.168.1.100 port 22 ssh2',
  'Accepted publickey for deploy from 10.0.0.50 port 22 ssh2',
  'Failed publickey for root from 192.168.1.200 port 22 ssh2',
  'Failed publickey for root from 10.0.0.200 port 22 ssh2',
  'Accepted password for root from 192.168.1.1 port 22 ssh2',
  'Accepted password for admin from 10.0.0.1 port 22 ssh2',
  'Failed password for invalid user test from 172.16.0.1 port 22 ssh2',
  'Failed password for invalid user guest from 8.8.8.8 port 22 ssh2',
  'Connection closed by authenticating user root 192.168.1.1 port 22',
  'Connection closed by authenticating user admin 10.0.0.1 port 22',
  'Accepted publickey for deploy from 192.168.1.100 port 22 ssh2',
  'Accepted publickey for deploy from 10.0.0.50 port 22 ssh2',
  'Failed publickey for root from 192.168.1.200 port 22 ssh2',
  'Failed publickey for root from 10.0.0.200 port 22 ssh2',
];

async function runBenchmark(): Promise<void> {
  console.log('=== LogHub-2k Benchmark (LogParser) ===');
  console.log(`Node.js: ${process.version}`);
  console.log('');

  // Round 1: Initial parse
  const pipeline1 = new LogParserPipeline();
  const evaluator = new Evaluator();

  const parsed1: ParsedLogEntry[] = SSH_LOGS.map((log, i) => {
    const result = pipeline1.parse(log);
    return { logId: String(i), template: result.template, eventId: String(result.templateId) };
  });

  const groundTruth: GroundTruthEntry[] = SSH_LOGS.map((_, i) => ({
    logId: String(i),
    template: 'benchmark-ground-truth',
    eventId: String(i < 4 ? 0 : i < 6 ? 1 : i < 10 ? 2 : i < 14 ? 3 : 4),
  }));

  const result1 = evaluator.evaluate(parsed1, groundTruth);
  console.log('Round 1 (initial):');
  console.log(`  Logs: ${SSH_LOGS.length}, Templates: ${pipeline1.stats.templateCount}`);
  console.log(`  GA: ${(result1.ga * 100).toFixed(1)}%  PA: ${(result1.pa * 100).toFixed(1)}%`);
  console.log(
    `  PTA: ${(result1.pta * 100).toFixed(1)}%  RTA: ${(result1.rta * 100).toFixed(1)}%  FTA: ${(result1.fta * 100).toFixed(1)}%`,
  );
  console.log(`  NED: ${result1.ned.toFixed(4)}`);
  console.log('');

  // Progressive rounds: measure improvement
  console.log('Progressive Rounds (measuring improvement):');
  const rounds = 5;
  for (let round = 1; round <= rounds; round++) {
    const pipeline = new LogParserPipeline();
    const start = performance.now();
    for (const log of SSH_LOGS) {
      pipeline.parse(log);
    }
    const elapsed = performance.now() - start;
    const throughput = Math.round(SSH_LOGS.length / (elapsed / 1000));
    console.log(
      `  Round ${round}: ${throughput.toLocaleString()} logs/sec, ${pipeline.stats.templateCount} templates, ${elapsed.toFixed(2)}ms`,
    );
  }

  // Re-run with full warmup
  console.log('');
  console.log('Warm run (reuse pipeline instance):');
  const pipelineWarm = new LogParserPipeline();
  for (let i = 0; i < 2; i++) {
    const start = performance.now();
    for (const log of SSH_LOGS) {
      pipelineWarm.parse(log);
    }
    const elapsed = performance.now() - start;
    console.log(`  Pass ${i + 1}: ${Math.round(SSH_LOGS.length / (elapsed / 1000)).toLocaleString()} logs/sec`);
  }

  console.log('');
  console.log('=== Benchmark Complete ===');
}

runBenchmark().catch(console.error);
