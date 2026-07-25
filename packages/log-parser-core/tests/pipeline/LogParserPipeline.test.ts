import { describe, it, expect } from 'vitest';
import { LogParserPipeline } from '../../src/pipeline/LogParserPipeline.js';

describe('LogParserPipeline', () => {
  it('parses a log message (pure drain-ts mode)', () => {
    const pipeline = new LogParserPipeline();
    const result = pipeline.parse('User alice logged in from 192.168.1.1');
    expect(result.template).toBeDefined();
    expect(result.templateId).toBeGreaterThan(0);
    expect(result.source).toBeDefined();
  });

  it('clusters similar log messages together', () => {
    const pipeline = new LogParserPipeline();
    const r1 = pipeline.parse('User alice logged in');
    const r2 = pipeline.parse('User bob logged in');

    // Same template should be assigned
    expect(r1.templateId).toBe(r2.templateId);
  });

  it('creates new clusters for different templates', () => {
    const pipeline = new LogParserPipeline();
    const r1 = pipeline.parse('User alice logged in');
    const r2 = pipeline.parse('ERROR database connection failed');

    // Different templates
    expect(r1.templateId).not.toBe(r2.templateId);
  });

  it('returns stats', () => {
    const pipeline = new LogParserPipeline();
    pipeline.parse('User alice logged in');
    pipeline.parse('User bob logged in');

    expect(pipeline.stats.totalProcessed).toBe(2);
    expect(pipeline.stats.templateCount).toBeGreaterThan(0);
  });

  it('match returns null for unseen logs', () => {
    const pipeline = new LogParserPipeline();
    expect(pipeline.match('completely new log message')).toBeNull();
  });

  it('match returns result for previously seen templates', () => {
    const pipeline = new LogParserPipeline();
    pipeline.parse('User alice logged in from 192.168.1.1');
    pipeline.parse('User bob logged in from 10.0.0.1');

    const result = pipeline.match('User charlie logged in from 172.16.0.1');
    expect(result).not.toBeNull();
    expect(result!.template).toContain('<IP>');
  });

  it('has undefined llm/embedding when not injected', () => {
    const pipeline = new LogParserPipeline();
    expect(pipeline.llm).toBeUndefined();
    expect(pipeline.embedding).toBeUndefined();
  });

  it('respects custom Drain config', () => {
    const pipeline = new LogParserPipeline({
      layers: {
        dataPlane: {
          enabled: true,
          drain: { simTh: 0.9, depth: 5, maxChildren: 50, maxClusters: 100 },
        },
      },
    });
    expect(pipeline.layerConfig.dataPlane.drain?.simTh).toBe(0.9);
  });

  it('returns source labels correctly', () => {
    const pipeline = new LogParserPipeline();
    const r1 = pipeline.parse('Brand new unique log message');
    expect(r1.source).toBe('drain-loose');

    const r2 = pipeline.parse('Brand new unique log message');
    expect(r2.source).toBe('drain-strict');
  });

  it('increments logId monotonically', () => {
    const pipeline = new LogParserPipeline();
    const r1 = pipeline.parse('msg1');
    const r2 = pipeline.parse('msg2');
    expect(Number(r2.logId)).toBeGreaterThan(Number(r1.logId));
  });

  it('has undefined classifier getter when not injected', () => {
    const pipeline = new LogParserPipeline();
    expect(pipeline.typeClassifier).toBeUndefined();
  });

  it('returns layerConfig with defaults', () => {
    const pipeline = new LogParserPipeline();
    expect(pipeline.layerConfig.dataPlane.enabled).toBe(true);
    expect(pipeline.layerConfig.controlPlane.enabled).toBe(false);
  });
});
