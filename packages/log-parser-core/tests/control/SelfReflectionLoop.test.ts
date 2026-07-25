import { describe, it, expect } from 'vitest';
import { SelfReflectionLoop } from '../../src/control/SelfReflectionLoop.js';
import type { ILLMProvider, LlmTemplateResult } from '../../src/llm/ILLMProvider.js';

function res(template: string): LlmTemplateResult {
  return { template, variables: [], confidence: 0.9 };
}

describe('SelfReflectionLoop', () => {
  it('should return immediately if all logs match', async () => {
    const provider: ILLMProvider = {
      modelId: 'mock',
      extractTemplate: async () => res('User <*> logged in from <IP>'),
    };
    const loop = new SelfReflectionLoop(provider);
    const result = await loop.refine([
      'User alice logged in from 192.168.1.1',
      'User bob logged in from 10.0.0.1',
    ]);
    expect(result.template).toBe('User <*> logged in from <IP>');
  });

  it('should refine when first template fails', async () => {
    let calls = 0;
    const provider: ILLMProvider = {
      modelId: 'mock',
      extractTemplate: async () => {
        calls++;
        return calls === 1
          ? res('User alice logged in from 192.168.1.1')
          : res('User <*> logged in from <IP>');
      },
    };
    const loop = new SelfReflectionLoop(provider);
    const result = await loop.refine([
      'User alice logged in from 192.168.1.1',
      'User bob logged in from 10.0.0.1',
    ]);
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(result.template).toBe('User <*> logged in from <IP>');
  });

  it('should stop at maxIterations', async () => {
    let calls = 0;
    const provider: ILLMProvider = {
      modelId: 'mock',
      extractTemplate: async () => {
        calls++;
        return res('Bad');
      },
    };
    const loop = new SelfReflectionLoop(provider, { maxIterations: 3 });
    await loop.refine(['a', 'b']);
    expect(calls).toBeLessThanOrEqual(4);
  });

  it('should verify matching correctly', () => {
    const provider: ILLMProvider = { modelId: 'x', extractTemplate: async () => res('x') };
    const loop = new SelfReflectionLoop(provider);
    const unmatched = loop.verify('User <*> logged in from <IP>', [
      'User alice logged in from 192.168.1.1',
      'ERROR crash',
    ]);
    expect(unmatched).toHaveLength(1);
  });

  it('should handle NUM variables in verification', () => {
    const provider: ILLMProvider = { modelId: 'x', extractTemplate: async () => res('x') };
    const loop = new SelfReflectionLoop(provider);
    const unmatched = loop.verify('Port <NUM> opened', ['Port 8080 opened']);
    expect(unmatched).toHaveLength(0);
  });

  it('should handle UUID variables in verification', () => {
    const provider: ILLMProvider = { modelId: 'x', extractTemplate: async () => res('x') };
    const loop = new SelfReflectionLoop(provider);
    const unmatched = loop.verify('Request <UUID> processed', [
      'Request 550e8400-e29b-41d4-a716-446655440000 processed',
    ]);
    expect(unmatched).toHaveLength(0);
  });

  it('should handle EMAIL variables in verification', () => {
    const provider: ILLMProvider = { modelId: 'x', extractTemplate: async () => res('x') };
    const loop = new SelfReflectionLoop(provider);
    const unmatched = loop.verify('Mail from <EMAIL>', ['Mail from user@example.com']);
    expect(unmatched).toHaveLength(0);
  });

  it('should handle TIMESTAMP variables in verification', () => {
    const provider: ILLMProvider = { modelId: 'x', extractTemplate: async () => res('x') };
    const loop = new SelfReflectionLoop(provider);
    const unmatched = loop.verify('At <TIMESTAMP> event', ['At 2024-01-15T10:30:00 event']);
    expect(unmatched).toHaveLength(0);
  });

  it('should handle HOSTNAME variables in verification', () => {
    const provider: ILLMProvider = { modelId: 'x', extractTemplate: async () => res('x') };
    const loop = new SelfReflectionLoop(provider);
    const unmatched = loop.verify('Connected to <HOSTNAME>', ['Connected to api.example.com']);
    expect(unmatched).toHaveLength(0);
  });

  it('should handle PATH variables in verification', () => {
    const provider: ILLMProvider = { modelId: 'x', extractTemplate: async () => res('x') };
    const loop = new SelfReflectionLoop(provider);
    const unmatched = loop.verify('Reading <PATH>', ['Reading /var/log/syslog']);
    expect(unmatched).toHaveLength(0);
  });

  it('should handle unknown tag types as static text', () => {
    const provider: ILLMProvider = { modelId: 'x', extractTemplate: async () => res('x') };
    const loop = new SelfReflectionLoop(provider);
    // <UNKNOWN> is not a recognized type — treated as static text
    const unmatched = loop.verify('Error <UNKNOWN> occurred', ['Error <UNKNOWN> occurred']);
    expect(unmatched).toHaveLength(0);
  });
});
