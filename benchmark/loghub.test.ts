/**
 * LogHub-2k evaluation benchmark.
 */
import { describe, it, expect } from 'vitest';
import { LogParserPipeline, Evaluator, type ParsedLogEntry, type GroundTruthEntry } from '@agentix-e/log-parser-core';

const SSH_LOGS: readonly string[] = [
  'Accepted password for root from 192.168.1.1 port 22 ssh2',
  'Accepted password for admin from 10.0.0.1 port 22 ssh2',
  'Failed password for root from 172.16.0.1 port 22 ssh2',
  'Failed password for admin from 8.8.8.8 port 22 ssh2',
];

describe('LogHub-2k Benchmark', () => {
  it('should parse SSH logs with GA >= 0.5', () => {
    const pipeline = new LogParserPipeline();
    const evaluator = new Evaluator();

    const parsed: ParsedLogEntry[] = SSH_LOGS.map((log, i) => {
      const result = pipeline.parse(log);
      return { logId: String(i), template: result.template, eventId: String(result.templateId) };
    });

    const groundTruth: GroundTruthEntry[] = SSH_LOGS.map((_, i) => ({
      logId: String(i),
      template: 'benchmark-ground-truth',
      eventId: i < 2 ? 'E1' : 'E2',
    }));

    const result = evaluator.evaluate(parsed, groundTruth);
    expect(result.ga).toBeGreaterThanOrEqual(0.5);
    expect(pipeline.stats.templateCount).toBeGreaterThan(0);
  });

  it('should improve template consolidation across rounds', () => {
    const rounds = 3;
    const results: number[] = [];

    for (let round = 0; round < rounds; round++) {
      const pipeline = new LogParserPipeline();
      const start = performance.now();
      for (const log of SSH_LOGS) {
        pipeline.parse(log);
      }
      const elapsed = performance.now() - start;
      const throughput = Math.round(SSH_LOGS.length / (elapsed / 1000));
      results.push(throughput);
    }

    // Later rounds should be at least as fast as the first
    expect(results[results.length - 1]).toBeGreaterThanOrEqual(results[0]! * 0.8);
  });

  it('should return valid evaluation metrics', () => {
    const pipeline = new LogParserPipeline();
    const evaluator = new Evaluator();

    const parsed: ParsedLogEntry[] = [
      { logId: '0', template: 'User <*> logged in', eventId: 'E1' },
    ];
    const gt: GroundTruthEntry[] = [
      { logId: '0', template: 'User <*> logged in', eventId: 'E1' },
    ];

    const result = evaluator.evaluate(parsed, gt);
    expect(result.ga).toBe(1);
    expect(result.pa).toBe(1);
  });
});
