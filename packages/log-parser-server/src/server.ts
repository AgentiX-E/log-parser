import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { LogParserPipeline } from '@agentix-e/log-parser-core';
import { instrumentPipeline } from './telemetry.js';

// Module-level signal handler state — ensures handlers are registered once
// across multiple createServer() calls (critical for test suites).
let sigHandlersRegistered = false;
const registeredFastifyRefs = new Set<FastifyInstance>();

function registerGlobalShutdown(fastify: FastifyInstance): void {
  if (sigHandlersRegistered) {
    registeredFastifyRefs.add(fastify);
    return;
  }
  sigHandlersRegistered = true;
  registeredFastifyRefs.add(fastify);

  const shutdown = async (signal: string) => {
    for (const instance of registeredFastifyRefs) {
      try {
        await instance.close();
      } catch {
        // Best-effort cleanup
      }
    }
    process.exit(0);
  };

  process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.once('SIGINT', () => { void shutdown('SIGINT'); });
}

function unregisterFromShutdown(fastify: FastifyInstance): void {
  registeredFastifyRefs.delete(fastify);
}

/**
 * Configuration for the log-parser REST API server.
 */
export interface ServerConfig {
  readonly port?: number;
  readonly host?: string;
  readonly pipeline?: LogParserPipeline;
}

/**
 * Represents a running server instance with start/stop controls.
 */
export interface ServerInstance {
  readonly fastify: FastifyInstance;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Create a Fastify REST API server for the log-parser pipeline.
 *
 * Provides 6 endpoints:
 * - POST /api/v1/parse
 * - POST /api/v1/parse/batch
 * - GET /api/v1/templates
 * - POST /api/v1/calibrate
 * - GET /api/v1/stats
 * - GET /api/v1/health
 */
export async function createServer(config: ServerConfig = {}): Promise<ServerInstance> {
  const fastify = Fastify({ logger: true });
  const pipeline = config.pipeline ?? new LogParserPipeline();
  const instrumented = instrumentPipeline(pipeline);
  const startTime = Date.now();

  // POST /api/v1/parse — parse a single log or batch of logs
  fastify.post(
    '/api/v1/parse',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            log: { type: 'string' },
            logs: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as { log?: string; logs?: string[] };
      if (body.log) {
        try {
          return { results: [instrumented.parse(body.log)] };
        } catch (err) {
          return reply.status(500).send({ error: 'Parse failed', detail: String(err) });
        }
      }
      if (body.logs) {
        try {
          return { results: body.logs.map((l) => instrumented.parse(l)) };
        } catch (err) {
          return reply.status(500).send({ error: 'Parse failed', detail: String(err) });
        }
      }
      return reply.status(400).send({ error: 'Provide "log" or "logs"' });
    },
  );

  // POST /api/v1/parse/batch — efficient batch parsing via parseBatch()
  fastify.post(
    '/api/v1/parse/batch',
    {
      schema: {
        body: {
          type: 'object',
          required: ['logs'],
          properties: {
            logs: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as { logs: string[] };
      try {
        return { results: pipeline.parseBatch(body.logs) };
      } catch (err) {
        return reply.status(500).send({ error: 'Batch parse failed', detail: String(err) });
      }
    },
  );

  // GET /api/v1/templates — return current template count
  fastify.get('/api/v1/templates', async () => {
    return { templateCount: pipeline.stats.templateCount };
  });

  // POST /api/v1/calibrate — HITL calibration endpoint
  fastify.post(
    '/api/v1/calibrate',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            samples: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  log: { type: 'string' },
                  expectedTemplate: { type: 'string' },
                },
                required: ['log', 'expectedTemplate'],
              },
            },
          },
          required: ['samples'],
        },
      },
    },
    async (request) => {
      const { samples } = request.body as {
        samples: Array<{ log: string; expectedTemplate: string }>;
      };
      pipeline.calibrateGranularity(samples);
      return { calibrated: true, samplesProcessed: samples.length };
    },
  );

  // GET /api/v1/stats — return full pipeline statistics
  fastify.get('/api/v1/stats', async () => {
    return pipeline.stats;
  });

  // GET /api/v1/metrics — Prometheus-compatible metrics endpoint
  fastify.get('/api/v1/metrics', async () => {
    const stats = pipeline.stats;
    return {
      log_parser_logs_total: stats.totalProcessed,
      log_parser_drain_hits: stats.drainHits,
      log_parser_drain_misses: stats.drainMisses,
      log_parser_llm_calls: stats.llmCalls,
      log_parser_template_count: stats.templateCount,
      log_parser_cache_hit_rate: stats.cacheHitRate,
    };
  });

  // GET /api/v1/health — health check endpoint
  fastify.get('/api/v1/health', async () => {
    return {
      status: 'ok',
      uptime: Date.now() - startTime,
      version: '0.1.0',
    };
  });

  // Register global shutdown handlers (once per process, handles multiple instances)
  registerGlobalShutdown(fastify);

  return {
    fastify,
    async start() {
      await fastify.listen({ port: config.port ?? 3000, host: config.host ?? '0.0.0.0' });
    },
    async stop() {
      unregisterFromShutdown(fastify);
      await fastify.close();
    },
  };
}
