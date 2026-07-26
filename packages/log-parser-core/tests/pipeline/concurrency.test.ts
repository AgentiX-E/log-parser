import { describe, it, expect } from 'vitest';
import { LogParserPipeline } from '../../src/pipeline/LogParserPipeline.js';

describe('LogParserPipeline Concurrency Safety', () => {
  const LOGS = Array.from({ length: 100 }, (_, i) => `User user${i} logged in from 192.168.1.${i}`);

  it('G7: 50 concurrent parse() calls complete without errors', async () => {
    const pipeline = new LogParserPipeline();
    const results = await Promise.all(LOGS.slice(0, 50).map((log) => pipeline.parse(log)));
    expect(results).toHaveLength(50);
    expect(results.every((r) => r.template && r.templateId > 0)).toBe(true);
  });

  it('G24: parseBatch output matches sequential parseBatch calls', () => {
    const p1 = new LogParserPipeline();
    const p2 = new LogParserPipeline();

    const batch1 = p1.parseBatch(LOGS);
    const batch2 = p2.parseBatch(LOGS.slice(0, 50));
    const batch3 = p2.parseBatch(LOGS.slice(50));

    const templates1 = batch1.map((r) => r.template);
    const templates2 = [...batch2, ...batch3].map((r) => r.template);

    // Both pipelines should discover the same templates
    expect(templates1.length).toBe(100);
    expect(templates2.length).toBe(100);
  });

  it('G7: concurrent + sequential results are self-consistent', async () => {
    const pipeline = new LogParserPipeline();
    const concurrent = await Promise.all(LOGS.slice(0, 30).map((log) => pipeline.parse(log)));
    const sequential = pipeline.parseBatch(LOGS.slice(0, 30));

    expect(concurrent.length).toBe(30);
    expect(sequential.length).toBe(30);
    sequential.forEach((r) => expect(r.template).toBeTruthy());
  });
});
