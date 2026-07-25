import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAICompatibleProvider } from '../src/OpenAICompatibleProvider.js';

// Mock the entire ai module to avoid any network calls
vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

// Mock @ai-sdk/openai-compatible
vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: vi.fn((_config: unknown) => ({
    chatModel: vi.fn((_modelId: string) => ({
      specificationVersion: 'v1',
      provider: 'mock',
      modelId: _modelId,
    })),
  })),
}));

import { generateObject } from 'ai';

const mockGenerateObject = vi.mocked(generateObject);

describe('OpenAICompatibleProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Constructor ──

  describe('constructor', () => {
    it('creates a provider with ollama configuration', () => {
      const provider = new OpenAICompatibleProvider({
        provider: 'ollama',
        model: 'qwen2.5:7b',
      });
      expect(provider.modelId).toBe('ollama/qwen2.5:7b');
    });

    it('creates a provider with openai configuration', () => {
      const provider = new OpenAICompatibleProvider({
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: 'sk-test-key',
      });
      expect(provider.modelId).toBe('openai/gpt-4o-mini');
    });

    it('creates a provider with deepseek configuration', () => {
      const provider = new OpenAICompatibleProvider({
        provider: 'deepseek',
        model: 'deepseek-chat',
        apiKey: 'sk-test-key',
      });
      expect(provider.modelId).toBe('deepseek/deepseek-chat');
    });

    it('creates a provider with anthropic configuration', () => {
      const provider = new OpenAICompatibleProvider({
        provider: 'anthropic',
        model: 'claude-3-haiku',
        apiKey: 'sk-ant-test',
      });
      expect(provider.modelId).toBe('anthropic/claude-3-haiku');
    });

    it('creates a provider with custom baseURL', () => {
      const provider = new OpenAICompatibleProvider({
        provider: 'custom',
        model: 'my-model',
        baseURL: 'https://my-api.example.com/v1',
      });
      expect(provider.modelId).toBe('custom/my-model');
    });

    it('throws when provider type is invalid', () => {
      expect(
        () =>
          new OpenAICompatibleProvider({
            provider: 'invalid' as 'ollama',
            model: 'test',
          }),
      ).toThrow(/invalid provider type/);
    });

    it('throws when model is empty string', () => {
      expect(
        () =>
          new OpenAICompatibleProvider({
            provider: 'ollama',
            model: '',
          }),
      ).toThrow(/model is required/);
    });
  });

  // ── modelId ──

  describe('modelId', () => {
    it('formats as provider/model', () => {
      const provider = new OpenAICompatibleProvider({
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'sk-test',
      });
      expect(provider.modelId).toBe('openai/gpt-4o');
    });

    it('includes model name with special characters', () => {
      const provider = new OpenAICompatibleProvider({
        provider: 'ollama',
        model: 'qwen2.5:7b-instruct-q4_K_M',
      });
      expect(provider.modelId).toBe('ollama/qwen2.5:7b-instruct-q4_K_M');
    });
  });

  // ── extractTemplate ──

  describe('extractTemplate', () => {
    it('extracts a template from log samples via LLM', async () => {
      mockGenerateObject.mockResolvedValueOnce({
        object: {
          template: 'User <*> logged in from <IP>',
          variables: [
            { position: 1, value: 'alice', category: 'GENERIC' as const },
            { position: 4, value: '192.168.1.1', category: 'IP' as const },
          ],
          confidence: 0.95,
        },
        usage: { promptTokens: 120, completionTokens: 35 },
        finishReason: 'stop',
        warnings: undefined,
        rawResponse: { headers: {} },
        toJsonResponse: vi.fn(),
        response: {} as Response,
        logprobs: undefined,
        providerMetadata: undefined,
        experimental_providerMetadata: undefined,
        request: {} as unknown as { body: string },
      } as unknown as Awaited<ReturnType<typeof generateObject>>);

      const provider = new OpenAICompatibleProvider({
        provider: 'ollama',
        model: 'qwen2.5:7b',
      });
      const result = await provider.extractTemplate([
        'User alice logged in from 192.168.1.1',
        'User bob logged in from 10.0.0.1',
      ]);

      expect(result.template).toBe('User <*> logged in from <IP>');
      expect(result.variables).toHaveLength(2);
      expect(result.confidence).toBe(0.95);
      expect(result.usage).toEqual({ promptTokens: 120, completionTokens: 35 });
    });

    it('passes the system prompt from PromptBuilder', async () => {
      mockGenerateObject.mockResolvedValueOnce({
        object: { template: 'test', variables: [], confidence: 1 },
        usage: { promptTokens: 10, completionTokens: 5 },
        finishReason: 'stop',
        warnings: undefined,
        rawResponse: { headers: {} },
        toJsonResponse: vi.fn(),
        response: {} as Response,
        logprobs: undefined,
        providerMetadata: undefined,
        experimental_providerMetadata: undefined,
        request: {} as unknown as { body: string },
      } as unknown as Awaited<ReturnType<typeof generateObject>>);

      const provider = new OpenAICompatibleProvider({
        provider: 'ollama',
        model: 'qwen2.5:7b',
      });
      await provider.extractTemplate(['test log']);

      expect(mockGenerateObject).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0,
        }),
      );
    });

    it('handles empty log samples gracefully', async () => {
      const provider = new OpenAICompatibleProvider({
        provider: 'ollama',
        model: 'qwen2.5:7b',
      });
      const result = await provider.extractTemplate([]);

      expect(result.template).toBe('');
      expect(result.variables).toEqual([]);
      expect(result.confidence).toBe(0);
      expect(mockGenerateObject).not.toHaveBeenCalled();
    });

    it('handles all variable categories', async () => {
      mockGenerateObject.mockResolvedValueOnce({
        object: {
          template: '<*> <IP> <NUM> <PATH> <UUID> <EMAIL> <TIMESTAMP> <HOSTNAME>',
          variables: [
            { position: 0, value: 'alice', category: 'GENERIC' as const },
            { position: 1, value: '192.168.1.1', category: 'IP' as const },
            { position: 2, value: '42', category: 'NUM' as const },
            { position: 3, value: '/var/log', category: 'PATH' as const },
            { position: 4, value: '550e8400-e29b-41d4-a716-446655440000', category: 'UUID' as const },
            { position: 5, value: 'a@b.com', category: 'EMAIL' as const },
            { position: 6, value: '2024-01-15T10:30:00Z', category: 'TIMESTAMP' as const },
            { position: 7, value: 'api.example.com', category: 'HOSTNAME' as const },
          ],
          confidence: 0.92,
        },
        usage: undefined,
        finishReason: 'stop',
        warnings: undefined,
        rawResponse: { headers: {} },
        toJsonResponse: vi.fn(),
        response: {} as Response,
        logprobs: undefined,
        providerMetadata: undefined,
        experimental_providerMetadata: undefined,
        request: {} as unknown as { body: string },
      } as unknown as Awaited<ReturnType<typeof generateObject>>);

      const provider = new OpenAICompatibleProvider({
        provider: 'ollama',
        model: 'qwen2.5:7b',
      });
      const result = await provider.extractTemplate(['test log']);

      expect(result.variables).toHaveLength(8);
      const categories = result.variables.map((v) => v.category);
      expect(categories).toContain('GENERIC');
      expect(categories).toContain('IP');
      expect(categories).toContain('NUM');
      expect(categories).toContain('PATH');
      expect(categories).toContain('UUID');
      expect(categories).toContain('EMAIL');
      expect(categories).toContain('TIMESTAMP');
      expect(categories).toContain('HOSTNAME');
    });

    it('returns usage as undefined when not provided by model', async () => {
      mockGenerateObject.mockResolvedValueOnce({
        object: { template: 'test <*>', variables: [], confidence: 1 },
        usage: undefined,
        finishReason: 'stop',
        warnings: undefined,
        rawResponse: { headers: {} },
        toJsonResponse: vi.fn(),
        response: {} as Response,
        logprobs: undefined,
        providerMetadata: undefined,
        experimental_providerMetadata: undefined,
        request: {} as unknown as { body: string },
      } as unknown as Awaited<ReturnType<typeof generateObject>>);

      const provider = new OpenAICompatibleProvider({
        provider: 'ollama',
        model: 'qwen2.5:7b',
      });
      const result = await provider.extractTemplate(['test log']);

      expect(result.usage).toBeUndefined();
    });
  });
});
