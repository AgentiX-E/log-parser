import { describe, it, expect } from 'vitest';
import { ModelRouter } from '../../src/control/ModelRouter.js';
import type { ILLMProvider, LlmTemplateResult } from '../../src/llm/ILLMProvider.js';

function createMockProvider(modelId: string): ILLMProvider {
  return {
    modelId,
    extractTemplate: async (): Promise<LlmTemplateResult> => ({
      template: 'test <*>',
      variables: [],
      confidence: 1,
    }),
  };
}

describe('ModelRouter', () => {
  // ── Constructor ──

  describe('constructor', () => {
    it('creates with only local provider', () => {
      const local = createMockProvider('local-model');
      const router = new ModelRouter(local);
      expect(router.select(['simple log'])).toBe(local);
    });

    it('creates with local and remote providers', () => {
      const local = createMockProvider('local');
      const remote = createMockProvider('remote');
      const router = new ModelRouter(local, remote);
      expect(router.select(['simple'])).toBe(local);
    });
  });

  // ── select ──

  describe('select', () => {
    it('returns local provider when no remote is configured', () => {
      const local = createMockProvider('local');
      const router = new ModelRouter(local);
      const result = router.select(['very complex long log message with many unique tokens']);
      expect(result).toBe(local);
    });

    it('returns local for simple short logs', () => {
      const local = createMockProvider('local');
      const remote = createMockProvider('remote');
      const router = new ModelRouter(local, remote);
      expect(router.select(['simple'])).toBe(local);
    });

    it('returns remote for complex diverse logs', () => {
      const local = createMockProvider('local');
      const remote = createMockProvider('remote');
      const router = new ModelRouter(local, remote);

      // 10 diverse + long log messages (each ~100 chars, unique content)
      const complexLogs: string[] = [];
      const uniqueBodies = [
        'database connection timeout after 30000ms on host db-prod',
        'TLS handshake failed cert CN=*.example.com expired',
        'OUT_OF_MEMORY alloc failed at 0xdeadbeef heap=512MB',
        'firewall ACL rule rejected inbound from 10.0.0.5:443',
        'worker-pool thread starvation detected queueDepth=500',
        'disk IO saturation on device /dev/sda1 latency=5000ms',
        'DNS resolution failure for upstream api.service.internal',
        'OOM killer invoked on process runner-v2 pid=39482 score=950',
        'circuit breaker tripped for downstream payment-gateway',
        'SIGSEGV received at address 0x0 thread=main loop iteration=42',
      ];
      for (let i = 0; i < 10; i++) {
        complexLogs.push(`[FATAL] node-${i} ${uniqueBodies[i % 10]} extra-context-${i} trace=abc${i}`);
      }

      const result = router.select(complexLogs);
      expect(result).toBe(remote);
    });
  });

  // ── assessComplexity ──

  describe('assessComplexity', () => {
    it('returns 0 for empty input', () => {
      const router = new ModelRouter(createMockProvider('local'));
      expect(router.assessComplexity([])).toBe(0);
    });

    it('returns low score for simple identical logs', () => {
      const router = new ModelRouter(createMockProvider('local'));
      const score = router.assessComplexity([
        'User logged in',
        'User logged in',
        'User logged in',
      ]);
      expect(score).toBeLessThan(0.3);
    });

    it('returns higher score for diverse logs', () => {
      const router = new ModelRouter(createMockProvider('local'));
      const score = router.assessComplexity([
        'ERROR database timeout',
        'INFO User logged in',
        'WARN disk space low',
        'DEBUG cache miss key=xyz',
      ]);
      expect(score).toBeGreaterThan(0.4);
    });

    it('returns score between 0 and 1', () => {
      const router = new ModelRouter(createMockProvider('local'));
      for (const testCase of [
        ['a'],
        ['a', 'b', 'c'],
        ['very long message ' + 'x'.repeat(500)],
      ]) {
        const score = router.assessComplexity(testCase);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    });

    it('scores long messages higher than short ones', () => {
      const router = new ModelRouter(createMockProvider('local'));
      const shortScore = router.assessComplexity(['short']);
      const longScore = router.assessComplexity(['a'.repeat(300)]);
      expect(longScore).toBeGreaterThan(shortScore);
    });
  });
});
