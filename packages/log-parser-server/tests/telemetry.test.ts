import { describe, it, expect } from 'vitest';
import { LogParserPipeline } from '@agentix-e/log-parser-core';
import { instrumentPipeline } from '../src/telemetry.js';

describe('instrumentPipeline', () => {
  it('should parse logs and return instrumented result', () => {
    const pipeline = new LogParserPipeline();
    const instrumented = instrumentPipeline(pipeline);
    const result = instrumented.parse('User alice logged in from 192.168.1.1');
    expect(result.template).toBeDefined();
    expect(result.source).toBeDefined();
    expect(result.parseDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('should return stats after processing logs', () => {
    const pipeline = new LogParserPipeline();
    const instrumented = instrumentPipeline(pipeline);
    instrumented.parse('test log message');
    instrumented.parse('another test message');
    const stats = instrumented.getStats();
    expect(stats.totalProcessed).toBeGreaterThanOrEqual(2);
  });

  it('should return the underlying pipeline instance', () => {
    const pipeline = new LogParserPipeline();
    const instrumented = instrumentPipeline(pipeline);
    expect(instrumented.getPipeline()).toBe(pipeline);
  });

  it('should return parseDurationMs for each parse call', () => {
    const pipeline = new LogParserPipeline();
    const instrumented = instrumentPipeline(pipeline);
    const r1 = instrumented.parse('log one');
    const r2 = instrumented.parse('log two');
    expect(r1.parseDurationMs).toBeGreaterThanOrEqual(0);
    expect(r2.parseDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('should preserve template and source from underlying pipeline', () => {
    const pipeline = new LogParserPipeline();
    const instrumented = instrumentPipeline(pipeline);
    const result = instrumented.parse('User alice logged in from 192.168.1.1');
    expect(result.template).toContain('User');
    expect(['drain-strict', 'drain-loose', 'cache-hit', 'llm-extracted']).toContain(result.source);
  });

  it('should set error status and rethrow when pipeline throws', () => {
    const brokenPipeline = {
      parse: () => {
        throw new Error('simulated failure');
      },
      stats: {
        totalProcessed: 0,
        drainHits: 0,
        drainMisses: 0,
        cacheHits: 0,
        llmCalls: 0,
        llmTokensConsumed: 0,
        templateCount: 0,
        cacheHitRate: 0,
      },
    } as unknown as LogParserPipeline;
    const instrumented = instrumentPipeline(brokenPipeline);
    expect(() => instrumented.parse('bad log')).toThrow('simulated failure');
  });
});
