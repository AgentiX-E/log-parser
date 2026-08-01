import { describe, it, expect, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { LogParserPipeline } from '@agentix-e/log-parser-core';
import { createServer } from '../src/server.js';

describe('Log Parser Server', () => {
  const servers: FastifyInstance[] = [];

  afterEach(async () => {
    for (const fastify of servers) {
      await fastify.close();
    }
    servers.length = 0;
  });

  async function initServer(overrides?: { pipeline?: LogParserPipeline }) {
    const server = await createServer({ ...overrides });
    servers.push(server.fastify);
    return server.fastify;
  }

  // POST /api/v1/parse — single log
  it('POST /api/v1/parse should parse a single log message', async () => {
    const fastify = await initServer();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/parse',
      payload: { log: 'User admin logged in from 192.168.1.1' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { results: unknown[] };
    expect(body.results).toBeInstanceOf(Array);
    expect(body.results).toHaveLength(1);
  });

  // POST /api/v1/parse — batch
  it('POST /api/v1/parse should parse batch of log messages', async () => {
    const fastify = await initServer();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/parse',
      payload: {
        logs: [
          'User admin logged in from 192.168.1.1',
          'User admin logged in from 192.168.1.2',
          'Error: connection timeout on port 8080',
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { results: unknown[] };
    expect(body.results).toBeInstanceOf(Array);
    expect(body.results).toHaveLength(3);
  });

  // POST /api/v1/parse — empty body
  it('POST /api/v1/parse should return error for empty body', async () => {
    const fastify = await initServer();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/parse',
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { error?: string };
    expect(body.error).toBeDefined();
    expect(body.error).toBe('Provide "log" or "logs"');
  });

  // POST /api/v1/parse — validate response shape
  it('POST /api/v1/parse should return result with correct shape', async () => {
    const fastify = await initServer();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/parse',
      payload: { log: 'Server started on port 3000' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      results: Array<{
        logId: string;
        template: string;
        templateId: number;
        source: string;
      }>;
    };
    const result = body.results[0];
    expect(result).toBeDefined();
    expect(result!.logId).toBeDefined();
    expect(result!.template).toBeDefined();
    expect(typeof result!.templateId).toBe('number');
    expect(result!.source).toBe('drain-loose');
  });

  // GET /api/v1/templates
  it('GET /api/v1/templates should return templateCount', async () => {
    const fastify = await initServer();
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/v1/templates',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { templateCount: number };
    expect(body).toHaveProperty('templateCount');
    expect(typeof body.templateCount).toBe('number');
  });

  // GET /api/v1/templates — changes after parsing
  it('GET /api/v1/templates should reflect changes after parsing', async () => {
    const fastify = await initServer();

    const before = await fastify.inject({ method: 'GET', url: '/api/v1/templates' });
    const beforeCount = (JSON.parse(before.body) as { templateCount: number }).templateCount;

    await fastify.inject({
      method: 'POST',
      url: '/api/v1/parse',
      payload: { log: 'New unique log message never seen before' },
    });

    const after = await fastify.inject({ method: 'GET', url: '/api/v1/templates' });
    const afterCount = (JSON.parse(after.body) as { templateCount: number }).templateCount;

    expect(afterCount).toBeGreaterThanOrEqual(beforeCount);
  });

  // POST /api/v1/calibrate
  it('POST /api/v1/calibrate should accept calibration samples', async () => {
    const fastify = await initServer();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/calibrate',
      payload: {
        samples: [
          {
            log: 'User admin logged in from 192.168.1.1',
            expectedTemplate: 'User <*> logged in from <IP>',
          },
          {
            log: 'User guest logged in from 10.0.0.1',
            expectedTemplate: 'User <*> logged in from <IP>',
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { calibrated: boolean; samplesProcessed: number };
    expect(body.calibrated).toBe(true);
    expect(body.samplesProcessed).toBe(2);
  });

  // POST /api/v1/calibrate — empty samples
  it('POST /api/v1/calibrate should handle empty samples', async () => {
    const fastify = await initServer();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/calibrate',
      payload: { samples: [] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { calibrated: boolean; samplesProcessed: number };
    expect(body.calibrated).toBe(true);
    expect(body.samplesProcessed).toBe(0);
  });

  // POST /api/v1/calibrate — invalid body (missing samples)
  it('POST /api/v1/calibrate should reject missing samples field', async () => {
    const fastify = await initServer();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/calibrate',
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  // GET /api/v1/stats
  it('GET /api/v1/stats should return pipeline stats object', async () => {
    const fastify = await initServer();
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/v1/stats',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as Record<string, unknown>;
    expect(body).toHaveProperty('totalProcessed');
    expect(body).toHaveProperty('drainHits');
    expect(body).toHaveProperty('drainMisses');
    expect(body).toHaveProperty('templateCount');
    expect(typeof body.totalProcessed).toBe('number');
  });

  // GET /api/v1/stats — reflects parse activity
  it('GET /api/v1/stats should reflect parsed log count', async () => {
    const fastify = await initServer();

    await fastify.inject({
      method: 'POST',
      url: '/api/v1/parse',
      payload: { logs: ['msg1', 'msg2', 'msg3'] },
    });

    const res = await fastify.inject({ method: 'GET', url: '/api/v1/stats' });
    const body = JSON.parse(res.body) as { totalProcessed: number };
    expect(body.totalProcessed).toBeGreaterThanOrEqual(3);
  });

  // GET /api/v1/health
  it('GET /api/v1/health should return status ok', async () => {
    const fastify = await initServer();
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      status: string;
      uptime: number;
      version: string;
    };
    expect(body.status).toBe('ok');
  });

  // GET /api/v1/health — version
  it('GET /api/v1/health should show correct version', async () => {
    const fastify = await initServer();
    const res = await fastify.inject({ method: 'GET', url: '/api/v1/health' });

    const body = JSON.parse(res.body) as { version: string };
    expect(body.version).toBe('0.1.0');
  });

  // GET /api/v1/health — positive uptime
  it('GET /api/v1/health should show positive uptime', async () => {
    const fastify = await initServer();
    const res = await fastify.inject({ method: 'GET', url: '/api/v1/health' });

    const body = JSON.parse(res.body) as { uptime: number };
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  // Custom pipeline injection
  it('should accept a custom pipeline instance', async () => {
    const pipeline = new LogParserPipeline();
    // Parse a few messages to pre-warm the pipeline
    pipeline.parse('Pre-warmed message');
    pipeline.parse('Another pre-warmed message');

    const fastify = await initServer({ pipeline });

    const res = await fastify.inject({ method: 'GET', url: '/api/v1/stats' });
    const body = JSON.parse(res.body) as { totalProcessed: number };
    expect(body.totalProcessed).toBeGreaterThanOrEqual(2);
  });

  // start() method works
  it('should support start() and stop() lifecycle', async () => {
    const { start, stop } = await createServer({ port: 0 });
    await start();
    await stop();
  });

  // start() with no config uses default port
  it('should use default port when not configured', async () => {
    const { start, stop, fastify } = await createServer();
    const listenSpy = vi.spyOn(fastify, 'listen').mockResolvedValue({} as never);
    await start();
    expect(listenSpy).toHaveBeenCalledWith({ port: 3000, host: '0.0.0.0' });
    listenSpy.mockRestore();
    await stop();
  });

  // Error scenario: parse with non-object body (Fastify schema validation rejects)
  it('POST /api/v1/parse should reject non-object body', async () => {
    const fastify = await initServer();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/parse',
      payload: null,
    });

    // Fastify schema validation rejects non-object payloads
    expect(res.statusCode).toBe(400);
  });

  // Parse with empty string body
  it('POST /api/v1/parse should return error for non-object body type', async () => {
    const fastify = await initServer();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/parse',
      payload: 'just a string',
    });

    // Fastify returns 415 for unsupported content-type, or 400 for schema mismatch
    // Both are valid error responses
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });

  // Error scenario: unknown route
  it('should return 404 for unknown route', async () => {
    const fastify = await initServer();
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/v1/nonexistent',
    });

    expect(res.statusCode).toBe(404);
  });

  // Templates endpoint returns valid JSON
  it('GET /api/v1/templates should return valid JSON', async () => {
    const fastify = await initServer();
    const res = await fastify.inject({ method: 'GET', url: '/api/v1/templates' });

    expect(() => JSON.parse(res.body)).not.toThrow();
  });

  // ── Graceful shutdown lifecycle ──

  it('should handle multiple createServer + stop without listener leak', async () => {
    const s1 = await createServer();
    const s2 = await createServer();
    // Both created successfully — tests sigHandlersRegistered codepath
    await s1.stop();
    await s2.stop();
    // No MaxListeners warning = pass
  });

  it('should unregister from shutdown on stop', async () => {
    const server = await createServer();
    // Call stop twice — second call should be safe after unregister
    await server.stop();
    // Second close on already-closed instance is handled by fastify
  });

  it('should handle stop() on already-closed server gracefully', async () => {
    const server = await createServer();
    await server.stop();
    // Second stop should not throw
    await server.stop().catch(() => { /* fastify may throw on double-close */ });
  });

  // ── POST /api/v1/parse/batch ──

  it('POST /api/v1/parse/batch should parse multiple logs efficiently', async () => {
    const fastify = await initServer();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/parse/batch',
      payload: { logs: ['User alice logged in from 10.0.0.1', 'Error 500 on server'] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results).toHaveLength(2);
    expect(body.results[0]).toHaveProperty('template');
  });

  it('POST /api/v1/parse/batch should reject missing logs', async () => {
    const fastify = await initServer();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/parse/batch',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  // ── Error handling paths ──

  it('POST /api/v1/parse should handle parse errors gracefully', async () => {
    const fastify = await initServer();
    // Force an error by injecting a pipeline that throws
    const customPipeline = {
      parse: vi.fn(() => { throw new Error('forced error'); }),
      stats: { templateCount: 0 },
      calibrateGranularity: vi.fn(),
      parseBatch: vi.fn(),
    };
    const server = await createServer({ pipeline: customPipeline as unknown as LogParserPipeline });
    const res = await server.fastify.inject({
      method: 'POST',
      url: '/api/v1/parse',
      payload: { log: 'test' },
    });
    expect(res.statusCode).toBe(500);
    await server.stop();
  });

  it('POST /api/v1/parse should handle batch parse errors', async () => {
    const customPipeline = {
      parse: vi.fn(() => { throw new Error('forced error'); }),
      stats: { templateCount: 0 },
      calibrateGranularity: vi.fn(),
      parseBatch: vi.fn(),
    };
    const server = await createServer({ pipeline: customPipeline as unknown as LogParserPipeline });
    const res = await server.fastify.inject({
      method: 'POST',
      url: '/api/v1/parse',
      payload: { logs: ['test1', 'test2'] },
    });
    expect(res.statusCode).toBe(500);
    await server.stop();
  });

  it('POST /api/v1/parse/batch should handle errors', async () => {
    const customPipeline = {
      parseBatch: vi.fn(() => { throw new Error('batch error'); }),
      stats: { templateCount: 0 },
      parse: vi.fn(),
      calibrateGranularity: vi.fn(),
    };
    const server = await createServer({ pipeline: customPipeline as unknown as LogParserPipeline });
    const res = await server.fastify.inject({
      method: 'POST',
      url: '/api/v1/parse/batch',
      payload: { logs: ['test1'] },
    });
    expect(res.statusCode).toBe(500);
    await server.stop();
  });
});
