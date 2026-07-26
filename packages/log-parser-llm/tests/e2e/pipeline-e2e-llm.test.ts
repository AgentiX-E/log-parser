/**
 * Pipeline E2E tests using DeepSeek API.
 *
 * Tests the full pipeline: drain-ts data plane → LLM control plane.
 * Uses AbortSignal timeouts to prevent hangs.
 */
import { describe, it, expect } from 'vitest';
import { OpenAICompatibleProvider } from '../../src/OpenAICompatibleProvider.js';
import { LogParserPipeline } from '@agentix-e/log-parser-core';

const API_KEY = process.env.DEEPSEEK_API_KEY;
const describeIf = API_KEY ? describe : describe.skip;

describeIf('Pipeline E2E with DeepSeek', () => {
  it('should parse logs through drain-ts data plane', () => {
    const pipeline = new LogParserPipeline();
    const result = pipeline.parse('User alice logged in from 192.168.1.1');
    expect(result.template.length).toBeGreaterThan(0);
    expect(result.source).toMatch(/drain/);
  });

  it('should create provider and verify modelId', () => {
    const provider = new OpenAICompatibleProvider({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      apiKey: API_KEY,
    });
    const pipeline = new LogParserPipeline({ llmProvider: provider });
    expect(pipeline.llm).toBeDefined();
    expect(pipeline.llm!.modelId).toContain('deepseek');
  });

  it('should extract template via DeepSeek LLM', async () => {
    const provider = new OpenAICompatibleProvider({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      apiKey: API_KEY,
    });

    const logs = [
      'Scheduler: task backup-db-01 rescheduled from node-alpha to node-beta',
      'Scheduler: task cleanup-tmp-02 rescheduled from node-gamma to node-delta',
      'Scheduler: task rotate-logs-03 rescheduled from node-epsilon to node-zeta',
    ];

    const result = await provider.extractTemplate(logs);
    expect(result.template.length).toBeGreaterThan(0);
    console.log(
      `DeepSeek scheduler: template="${result.template}", confidence=${result.confidence}`,
    );
  }, 60000);
});
