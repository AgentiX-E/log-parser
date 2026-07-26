/**
 * Real DeepSeek LLM benchmark — template extraction accuracy.
 *
 * Tests the OpenAICompatibleProvider with actual DeepSeek API calls.
 * Skipped when DEEPSEEK_API_KEY is not set.
 */
import { describe, it, expect } from 'vitest';
import { OpenAICompatibleProvider } from '../../src/OpenAICompatibleProvider.js';

const API_KEY = process.env.DEEPSEEK_API_KEY;
const describeIf = API_KEY ? describe : describe.skip;

describeIf('DeepSeek LLM template extraction', () => {
  async function createProvider(): Promise<OpenAICompatibleProvider> {
    return new OpenAICompatibleProvider({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      apiKey: API_KEY,
    });
  }

  it('should extract SSH log templates', async () => {
    const provider = await createProvider();
    const logs = [
      'Accepted password for root from 192.168.1.1 port 22 ssh2',
      'Accepted password for admin from 10.0.0.1 port 22 ssh2',
      'Failed password for root from 172.16.0.1 port 22 ssh2',
      'Failed password for invalid user test from 8.8.8.8 port 22 ssh2',
    ];

    const result = await provider.extractTemplate(logs);
    // Accept either generic <*> or typed placeholders like <HOSTNAME>, <NUM>
    const hasPlaceholder = /<[*A-Z]/.test(result.template);
    expect(hasPlaceholder).toBe(true);
    expect(result.confidence).toBeGreaterThan(0);
    console.log(`SSH: template="${result.template}", confidence=${result.confidence}`);
  }, 60000);

  it('should extract web server log templates', async () => {
    const provider = await createProvider();
    const logs = [
      '192.168.1.1 - - [15/Jan/2024:10:30:45 +0000] "GET /api/users HTTP/1.1" 200 1234',
      '10.0.0.1 - - [15/Jan/2024:10:31:02 +0000] "GET /api/products HTTP/1.1" 200 5678',
      '172.16.0.1 - - [15/Jan/2024:10:31:15 +0000] "POST /api/orders HTTP/1.1" 201 890',
    ];

    const result = await provider.extractTemplate(logs);
    // Accept either generic <*> or typed placeholders like <HOSTNAME>, <NUM>
    const hasPlaceholder = /<[*A-Z]/.test(result.template);
    expect(hasPlaceholder).toBe(true);
    console.log(`Apache: template="${result.template}", confidence=${result.confidence}`);
  }, 60000);

  it('should extract application error log templates', async () => {
    const provider = await createProvider();
    const logs = [
      'ERROR database connection failed for host db-primary.local after 3 retries',
      'ERROR database connection failed for host db-replica.local after 5 retries',
      'ERROR database connection failed for host cache-01.local after 2 retries',
    ];

    const result = await provider.extractTemplate(logs);
    // Accept either generic <*> or typed placeholders like <HOSTNAME>, <NUM>
    const hasPlaceholder = /<[*A-Z]/.test(result.template);
    expect(hasPlaceholder).toBe(true);
    console.log(`Error: template="${result.template}", confidence=${result.confidence}`);
  }, 60000);
});
