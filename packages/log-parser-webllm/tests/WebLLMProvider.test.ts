import { describe, it, expect, vi } from 'vitest';

// Must be at top-level for vitest hoisting — mock before any imports
vi.mock('@mlc-ai/web-llm', () => ({
  CreateMLCEngine: vi.fn().mockResolvedValue({
    chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content: '<TEMPLATE>test</TEMPLATE>' } }] }) } },
  }),
}));

import { WebLLMProvider } from '../src/WebLLMProvider.js';

describe('WebLLMProvider', () => {
  it('creates instance with correct modelId format', () => {
    const provider = new WebLLMProvider({ model: 'gemma-2-2b-it-q4f16_1-MLC' });
    expect(provider.modelId).toBe('webllm/gemma-2-2b-it-q4f16_1-MLC');
    expect(provider.modelId).toContain('webllm/');
  });

  it('modelId preserves custom model name', () => {
    const provider = new WebLLMProvider({ model: 'phi-3-mini-4k-instruct' });
    expect(provider.modelId).toBe('webllm/phi-3-mini-4k-instruct');
  });

  it('is not ready before initialization', () => {
    const provider = new WebLLMProvider({ model: 'gemma-2-2b-it' });
    expect(provider.isReady).toBe(false);
  });

  it('throws when extractTemplate called without initialization', async () => {
    const provider = new WebLLMProvider({ model: 'gemma-2-2b-it' });
    await expect(provider.extractTemplate(['test'])).rejects.toThrow(/not initialized/);
  });

  it('create() returns a Promise (async factory pattern)', () => {
    // create() is async due to WebLLM engine loading — skip in Node.js CI
    expect(WebLLMProvider.create).toBeInstanceOf(Function);
    expect(WebLLMProvider.create({ model: 'test' })).toBeInstanceOf(Promise);
  });

  it('parseResponse extracts content within TEMPLATE tags', () => {
    const provider = new WebLLMProvider({ model: 'test' });
    // Access private method via type assertion for testing
    const result = (
      provider as unknown as { parseResponse: (c: string) => { template: string } }
    ).parseResponse('<TEMPLATE>User <*> logged in from <IP></TEMPLATE>');
    expect(result.template).toBe('User <*> logged in from <IP>');
  });

  it('parseResponse falls back to raw content without TEMPLATE tags', () => {
    const provider = new WebLLMProvider({ model: 'test' });
    const result = (
      provider as unknown as { parseResponse: (c: string) => { template: string } }
    ).parseResponse('User <*> logged in from <IP>');
    expect(result.template).toBe('User <*> logged in from <IP>');
  });

  it('extractTemplate rejects when engine is null', async () => {
    const provider = new WebLLMProvider({ model: 'gemma-2-2b' });
    await expect(provider.extractTemplate(['test'])).rejects.toThrow(
      'WebLLMProvider not initialized',
    );
  });
});
