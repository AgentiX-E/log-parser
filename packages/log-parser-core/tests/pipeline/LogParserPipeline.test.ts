import { describe, it, expect, vi } from 'vitest';
import { LogParserPipeline } from '../../src/pipeline/LogParserPipeline.js';
import type { ILLMProvider, LlmTemplateResult } from '../../src/llm/ILLMProvider.js';

function createMockLLMProvider(): ILLMProvider {
  return {
    modelId: 'mock-model',
    extractTemplate: vi.fn().mockImplementation(async (): Promise<LlmTemplateResult> => ({
      template: 'User <*> logged in from <IP>',
      variables: [
        { position: 1, value: 'test', category: 'GENERIC' as const },
        { position: 4, value: '192.168.1.1', category: 'IP' as const },
      ],
      confidence: 0.95,
      usage: { promptTokens: 50, completionTokens: 30 },
    })),
  };
}

describe('LogParserPipeline', () => {
  // ── Pure drain-ts mode (no LLM) ──

  describe('pure drain-ts mode', () => {
    it('parses a log message', () => {
      const pipeline = new LogParserPipeline();
      const result = pipeline.parse('User alice logged in from 192.168.1.1');
      expect(result.template).toBeDefined();
      expect(result.templateId).toBeGreaterThan(0);
      expect(result.source).toBeDefined();
    });

    it('clusters similar log messages together', () => {
      const pipeline = new LogParserPipeline();
      const r1 = pipeline.parse('User alice logged in');
      const r2 = pipeline.parse('User bob logged in');
      expect(r1.templateId).toBe(r2.templateId);
    });

    it('creates new clusters for different templates', () => {
      const pipeline = new LogParserPipeline();
      const r1 = pipeline.parse('User alice logged in');
      const r2 = pipeline.parse('ERROR database connection failed');
      expect(r1.templateId).not.toBe(r2.templateId);
    });

    it('returns stats', () => {
      const pipeline = new LogParserPipeline();
      pipeline.parse('User alice logged in');
      pipeline.parse('User bob logged in');
      expect(pipeline.stats.totalProcessed).toBe(2);
      expect(pipeline.stats.templateCount).toBeGreaterThan(0);
    });

    it('match returns null for unseen logs', () => {
      const pipeline = new LogParserPipeline();
      expect(pipeline.match('completely new log message')).toBeNull();
    });

    it('match returns result for previously seen templates', () => {
      const pipeline = new LogParserPipeline();
      pipeline.parse('User alice logged in from 192.168.1.1');
      pipeline.parse('User bob logged in from 10.0.0.1');
      const result = pipeline.match('User charlie logged in from 172.16.0.1');
      expect(result).not.toBeNull();
      expect(result!.template).toContain('<IP>');
    });

    it('has undefined llm/embedding when not injected', () => {
      const pipeline = new LogParserPipeline();
      expect(pipeline.llm).toBeUndefined();
      expect(pipeline.embedding).toBeUndefined();
    });

    it('respects custom Drain config', () => {
      const pipeline = new LogParserPipeline({
        layers: {
          dataPlane: {
            enabled: true,
            drain: { simTh: 0.9, depth: 5, maxChildren: 50, maxClusters: 100 },
          },
        },
      });
      expect(pipeline.layerConfig.dataPlane.drain?.simTh).toBe(0.9);
    });

    it('returns source labels correctly', () => {
      const pipeline = new LogParserPipeline();
      const r1 = pipeline.parse('Brand new unique log message');
      expect(r1.source).toBe('drain-loose');
      const r2 = pipeline.parse('Brand new unique log message');
      expect(r2.source).toBe('drain-strict');
    });

    it('increments logId monotonically', () => {
      const pipeline = new LogParserPipeline();
      const r1 = pipeline.parse('msg1');
      const r2 = pipeline.parse('msg2');
      expect(Number(r2.logId)).toBeGreaterThan(Number(r1.logId));
    });

    it('has undefined classifier getter when not injected', () => {
      const pipeline = new LogParserPipeline();
      expect(pipeline.typeClassifier).toBeUndefined();
    });

    it('returns layerConfig with defaults', () => {
      const pipeline = new LogParserPipeline();
      expect(pipeline.layerConfig.dataPlane.enabled).toBe(true);
      expect(pipeline.layerConfig.controlPlane.enabled).toBe(false);
    });
  });

  // ── LLM-enhanced mode (control plane wired) ──

  describe('LLM-enhanced mode', () => {
    it('stores the llmProvider', () => {
      const llm = createMockLLMProvider();
      const pipeline = new LogParserPipeline({ llmProvider: llm });
      expect(pipeline.llm).toBe(llm);
    });

    it('enqueues miss events into accumulator', () => {
      const llm = createMockLLMProvider();
      const pipeline = new LogParserPipeline({ llmProvider: llm });

      // Use radically different log messages to ensure misses
      pipeline.parse('ERROR database connection timeout on host alpha');
      pipeline.parse('INFO cache miss for key user-session-abc');
      pipeline.parse('WARN disk space low on volume data-backup-01');
      pipeline.parse('DEBUG request completed in 123ms endpoint /api/users');
      pipeline.parse('FATAL kernel panic out of memory address 0xdeadbeef');

      // Stats should show misses counted
      expect(pipeline.stats.totalProcessed).toBe(5);
      expect(pipeline.stats.drainMisses).toBeGreaterThanOrEqual(3);
    });

    it('accumulates stats with llm provider', () => {
      const llm = createMockLLMProvider();
      const pipeline = new LogParserPipeline({ llmProvider: llm });

      pipeline.parse('User alice logged in from 192.168.1.1');
      pipeline.parse('User bob logged in from 10.0.0.1');

      // First log is a miss (new cluster)
      expect(pipeline.stats.drainMisses).toBeGreaterThanOrEqual(1);
    });

    it('flush resolves when accumulator is wired', async () => {
      const llm = createMockLLMProvider();
      const pipeline = new LogParserPipeline({ llmProvider: llm });
      await expect(pipeline.flush()).resolves.toBeUndefined();
    });

    it('flush is a no-op with pure drain-ts mode', async () => {
      const pipeline = new LogParserPipeline();
      await expect(pipeline.flush()).resolves.toBeUndefined();
    });

    it('embedding getter returns injected provider', () => {
      const mockEmb = { modelId: 'mock-emb', dimension: 768, embed: vi.fn() };
      const pipeline = new LogParserPipeline({ embeddingProvider: mockEmb });
      expect(pipeline.embedding).toBe(mockEmb);
    });

    it('processControlBatch runs without crashing with real accum', async () => {
      const llm = createMockLLMProvider();
      const pipeline = new LogParserPipeline({ llmProvider: llm });

      // Generate miss events
      for (let i = 0; i < 3; i++) {
        pipeline.parse(`Unique control plane test log message ${i} with extra words`);
      }

      // Flush to trigger processing
      await pipeline.flush();

      // Should have made at least one LLM call after flushing
      expect(pipeline.stats.llmCalls).toBeGreaterThanOrEqual(1);
    });
  });
});
