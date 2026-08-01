import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockChatCreate = vi.fn().mockResolvedValue({
  choices: [{ message: { content: '<TEMPLATE>User <*> logged in from <IP></TEMPLATE>' } }],
});
const mockCreateEngine = vi.fn().mockResolvedValue({
  chat: { completions: { create: mockChatCreate } },
});

vi.mock('@mlc-ai/web-llm', () => ({ CreateMLCEngine: mockCreateEngine }));

import { WebLLMProvider } from '../src/WebLLMProvider.js';

describe('WebLLMProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateEngine.mockResolvedValue({ chat: { completions: { create: mockChatCreate } } });
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: '<TEMPLATE>User <*> logged in from <IP></TEMPLATE>' } }],
    });
  });

  it('creates instance with correct modelId format', () => {
    const provider = new WebLLMProvider({ model: 'gemma-2-2b-it-q4f16_1-MLC' });
    expect(provider.modelId).toBe('webllm/gemma-2-2b-it-q4f16_1-MLC');
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

  it('create() returns a Promise', () => {
    expect(WebLLMProvider.create).toBeInstanceOf(Function);
    expect(WebLLMProvider.create({ model: 'test' })).toBeInstanceOf(Promise);
  });

  it('create() initializes engine with progress callback', async () => {
    const provider = await WebLLMProvider.create({ model: 'gemma-2-2b-it-q4f16_1-MLC' });
    expect(provider).toBeInstanceOf(WebLLMProvider);
    expect(provider.isReady).toBe(true);
    expect(mockCreateEngine).toHaveBeenCalledWith(
      'gemma-2-2b-it-q4f16_1-MLC',
      expect.objectContaining({ initProgressCallback: expect.any(Function) }),
    );
  });

  it('create() invokes progress callback on engine init', async () => {
    let capturedCb: ((r: { text: string }) => void) | undefined;
    mockCreateEngine.mockImplementationOnce(
      (_m: string, o: { initProgressCallback?: (r: { text: string }) => void }) => {
        capturedCb = o.initProgressCallback;
        return Promise.resolve({ chat: { completions: { create: mockChatCreate } } });
      },
    );
    await WebLLMProvider.create({ model: 'test-model' });
    expect(capturedCb).toBeDefined();
    capturedCb!({ text: 'Loading 50%' });
  });

  it('extractTemplate calls engine and returns parsed template', async () => {
    const provider = await WebLLMProvider.create({ model: 'gemma-2-2b-it-q4f16_1-MLC' });
    mockChatCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '<TEMPLATE>Error <*> at <PATH></TEMPLATE>' } }],
    });
    const result = await provider.extractTemplate(['Error 404 at /api/users']);
    expect(result.template).toBe('Error <*> at <PATH>');
    expect(result.confidence).toBe(0.85);
    expect(mockChatCreate).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0, max_tokens: 500 }),
    );
  });

  it('extractTemplate handles empty response', async () => {
    const provider = await WebLLMProvider.create({ model: 'gemma-2-2b-it-q4f16_1-MLC' });
    mockChatCreate.mockResolvedValueOnce({ choices: [{ message: { content: '' } }] });
    const result = await provider.extractTemplate(['log']);
    expect(result.template).toBe('');
  });

  it('extractTemplate handles missing choices', async () => {
    const provider = await WebLLMProvider.create({ model: 'gemma-2-2b-it-q4f16_1-MLC' });
    mockChatCreate.mockResolvedValueOnce({ choices: [] });
    const result = await provider.extractTemplate(['log']);
    expect(result.template).toBe('');
  });

  it('parseResponse extracts content within TEMPLATE tags', () => {
    const provider = new WebLLMProvider({ model: 'test' });
    const result = (provider as unknown as { parseResponse: (c: string) => { template: string } })
      .parseResponse('<TEMPLATE>User <*> logged in from <IP></TEMPLATE>');
    expect(result.template).toBe('User <*> logged in from <IP>');
  });

  it('parseResponse falls back to raw content without TEMPLATE tags', () => {
    const provider = new WebLLMProvider({ model: 'test' });
    const result = (provider as unknown as { parseResponse: (c: string) => { template: string } })
      .parseResponse('raw template output');
    expect(result.template).toBe('raw template output');
  });

  it('isReady returns true after create()', async () => {
    const provider = await WebLLMProvider.create({ model: 'gemma-2-2b-it-q4f16_1-MLC' });
    expect(provider.isReady).toBe(true);
  });
});
