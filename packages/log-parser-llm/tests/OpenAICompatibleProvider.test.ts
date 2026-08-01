import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAICompatibleProvider } from '../src/OpenAICompatibleProvider.js';

vi.mock('ai', () => ({
  generateObject: vi.fn().mockResolvedValue({
    object: { template: 'ok', variables: [], confidence: 0.95 },
    usage: { promptTokens: 50, completionTokens: 20 },
    finishReason: 'stop', warnings: undefined, rawResponse: { headers: {} },
    toJsonResponse: vi.fn(), response: {} as Response,
  }),
  generateText: vi.fn().mockResolvedValue({
    text: '{"template":"ok","variables":[],"confidence":0.9}',
    usage: { promptTokens: 30, completionTokens: 15 },
    finishReason: 'stop', warnings: undefined, rawResponse: { headers: {} },
    response: {} as Response,
  }),
}));

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: vi.fn(() => ({
    chatModel: vi.fn((modelId: string) => ({
      specificationVersion: 'v1', provider: 'mock', modelId,
    })),
  })),
}));

import { generateObject, generateText } from 'ai';
const gObj = vi.mocked(generateObject);
const gTxt = vi.mocked(generateText);

function mockObj(overrides: Record<string, unknown> = {}) {
  return { object: { template: 't', variables: [], confidence: 1 }, usage: { promptTokens: 10, completionTokens: 5 }, finishReason: 'stop', warnings: undefined, rawResponse: { headers: {} }, toJsonResponse: vi.fn(), response: {} as Response, ...overrides };
}

describe('OpenAICompatibleProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gObj.mockResolvedValue(mockObj() as never);
    gTxt.mockResolvedValue({ text: '{"template":"ok","variables":[],"confidence":0.9}', usage: { promptTokens: 30, completionTokens: 15 }, finishReason: 'stop', warnings: undefined, rawResponse: { headers: {} }, response: {} as Response } as never);
  });

  it('ollama modelId', () => {
    expect(new OpenAICompatibleProvider({ provider: 'ollama', model: 'qwen2.5:7b' }).modelId).toBe('ollama/qwen2.5:7b');
  });
  it('openai modelId', () => {
    expect(new OpenAICompatibleProvider({ provider: 'openai', model: 'gpt-4o', apiKey: 'sk' }).modelId).toBe('openai/gpt-4o');
  });
  it('deepseek modelId', () => {
    expect(new OpenAICompatibleProvider({ provider: 'deepseek', model: 'dc', apiKey: 'sk' }).modelId).toBe('deepseek/dc');
  });
  it('anthropic modelId', () => {
    expect(new OpenAICompatibleProvider({ provider: 'anthropic', model: 'c3h', apiKey: 'sk' }).modelId).toBe('anthropic/c3h');
  });
  it('custom baseURL', () => {
    expect(new OpenAICompatibleProvider({ provider: 'custom', model: 'm', baseURL: 'https://x.com/v1' }).modelId).toBe('custom/m');
  });
  it('throws on invalid provider', () => {
    expect(() => new OpenAICompatibleProvider({ provider: 'bad' as never, model: 't' })).toThrow(/invalid provider type/);
  });
  it('throws on empty model', () => {
    expect(() => new OpenAICompatibleProvider({ provider: 'ollama', model: '' })).toThrow(/model is required/);
  });
  it('special chars in model', () => {
    expect(new OpenAICompatibleProvider({ provider: 'ollama', model: 'qw:7b-q4_K_M' }).modelId).toBe('ollama/qw:7b-q4_K_M');
  });

  // Happy path
  it('extracts template via structured output', async () => {
    gObj.mockResolvedValueOnce(mockObj({
      object: { template: 'User <*> logged in from <IP>', variables: [{ position: 1, value: 'a', category: 'GENERIC' }], confidence: 0.95 },
      usage: { promptTokens: 100, completionTokens: 30 },
    }) as never);
    const p = new OpenAICompatibleProvider({ provider: 'ollama', model: 'q' });
    const r = await p.extractTemplate(['log1', 'log2']);
    expect(r.template).toBe('User <*> logged in from <IP>');
    expect(r.confidence).toBe(0.95);
    expect(r.usage).toEqual({ promptTokens: 100, completionTokens: 30 });
  });

  it('empty samples returns zeros', async () => {
    const r = await new OpenAICompatibleProvider({ provider: 'ollama', model: 'q' }).extractTemplate([]);
    expect(r.template).toBe('');
    expect(r.confidence).toBe(0);
  });

  it('usage undefined when not provided', async () => {
    gObj.mockResolvedValueOnce(mockObj({ usage: undefined }) as never);
    const r = await new OpenAICompatibleProvider({ provider: 'ollama', model: 'q' }).extractTemplate(['l']);
    expect(r.usage).toBeUndefined();
  });

  // Fallback path
  it('falls back to generateText on error', async () => {
    gObj.mockRejectedValueOnce(new Error('fail'));
    gTxt.mockResolvedValueOnce({ text: '{"template":"T","variables":[],"confidence":0.9}', usage: { promptTokens: 10, completionTokens: 5 }, finishReason: 'stop', warnings: undefined, rawResponse: { headers: {} }, response: {} as Response } as never);
    const r = await new OpenAICompatibleProvider({ provider: 'ollama', model: 'q' }).extractTemplate(['l']);
    expect(r.template).toBe('T');
    expect(r.confidence).toBe(0.9);
  });

  it('fallback with no JSON returns raw text', async () => {
    gObj.mockRejectedValueOnce(new Error('fail'));
    gTxt.mockResolvedValueOnce({ text: 'raw template output', usage: undefined, finishReason: 'stop', warnings: undefined, rawResponse: { headers: {} }, response: {} as Response } as never);
    const r = await new OpenAICompatibleProvider({ provider: 'ollama', model: 'q' }).extractTemplate(['l']);
    expect(r.template).toBe('raw template output');
    expect(r.confidence).toBe(0.7);
  });

  it('fallback double failure returns 0.5 confidence', async () => {
    gObj.mockRejectedValueOnce(new Error('fail'));
    gTxt.mockResolvedValueOnce({ text: '{not valid: json}', usage: undefined, finishReason: 'stop', warnings: undefined, rawResponse: { headers: {} }, response: {} as Response } as never);
    const r = await new OpenAICompatibleProvider({ provider: 'ollama', model: 'q' }).extractTemplate(['l']);
    expect(r.template).toBe('{not valid: json}');
    expect(r.confidence).toBe(0.5);
  });

  it('fallback partial JSON', async () => {
    gObj.mockRejectedValueOnce(new Error('fail'));
    gTxt.mockResolvedValueOnce({ text: '{"template":"only"}', usage: undefined, finishReason: 'stop', warnings: undefined, rawResponse: { headers: {} }, response: {} as Response } as never);
    const r = await new OpenAICompatibleProvider({ provider: 'ollama', model: 'q' }).extractTemplate(['l']);
    expect(r.template).toBe('only');
    expect(r.confidence).toBe(0.7);
  });

  it('fallback with non-array variables', async () => {
    gObj.mockRejectedValueOnce(new Error('fail'));
    gTxt.mockResolvedValueOnce({ text: '{"template":"t","variables":"x","confidence":0.8}', usage: undefined, finishReason: 'stop', warnings: undefined, rawResponse: { headers: {} }, response: {} as Response } as never);
    const r = await new OpenAICompatibleProvider({ provider: 'ollama', model: 'q' }).extractTemplate(['l']);
    expect(r.variables).toEqual([]);
  });

  // All provider types
  it('ollama default baseURL branch', () => {
    expect(new OpenAICompatibleProvider({ provider: 'ollama', model: 'llama3' }).modelId).toBe('ollama/llama3');
  });
  it('openai default baseURL branch', () => {
    expect(new OpenAICompatibleProvider({ provider: 'openai', model: 'gpt-4', apiKey: 'sk' }).modelId).toBe('openai/gpt-4');
  });
  it('deepseek default baseURL branch', () => {
    expect(new OpenAICompatibleProvider({ provider: 'deepseek', model: 'dc', apiKey: 'sk' }).modelId).toBe('deepseek/dc');
  });
  it('anthropic default baseURL branch', () => {
    expect(new OpenAICompatibleProvider({ provider: 'anthropic', model: 'c3h', apiKey: 'sk-ant' }).modelId).toBe('anthropic/c3h');
  });
  it('custom default baseURL branch', () => {
    expect(new OpenAICompatibleProvider({ provider: 'custom', model: 'm' }).modelId).toBe('custom/m');
  });
});
