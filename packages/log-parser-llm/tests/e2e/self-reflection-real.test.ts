/**
 * Real LLM E2E tests using DeepSeek API.
 *
 * These tests make actual network calls to the DeepSeek API and may take
 * significant time. They are skipped when DEEPSEEK_API_KEY is not set.
 *
 * Use AbortSignal timeouts to prevent indefinite hangs.
 */
import { describe, it, expect } from 'vitest';
import { OpenAICompatibleProvider } from '../../src/OpenAICompatibleProvider.js';

const API_KEY = process.env.DEEPSEEK_API_KEY;
const describeIf = API_KEY ? describe : describe.skip;

describeIf('DeepSeek real API integration', () => {
  it('should construct provider with DeepSeek config', () => {
    const provider = new OpenAICompatibleProvider({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      apiKey: API_KEY,
    });
    expect(provider.modelId).toContain('deepseek');
    expect(provider.modelId).toContain('deepseek-v4-flash');
  });

  it('should extract template from simple SSH logs', async () => {
    const provider = new OpenAICompatibleProvider({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      apiKey: API_KEY,
    });

    const logs = [
      'Accepted password for root from 192.168.1.1 port 22 ssh2',
      'Accepted password for admin from 10.0.0.1 port 22 ssh2',
      'Failed password for root from 172.16.0.1 port 22 ssh2',
    ];

    const result = await provider.extractTemplate(logs);
    expect(result.template.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0);
    console.log(`DeepSeek SSH: template="${result.template}", confidence=${result.confidence}`);
  }, 60000); // 60s timeout for real API call
});
