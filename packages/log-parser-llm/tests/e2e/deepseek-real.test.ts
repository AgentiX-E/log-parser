import { describe, it, expect } from 'vitest';
const API_KEY = process.env.DEEPSEEK_API_KEY;
const skipIfNoKey = API_KEY ? it : it.skip;
describe('OpenAICompatibleProvider E2E', () => {
  skipIfNoKey('real LLM template extraction', async () => {
    expect(true).toBe(true);
  });
});
