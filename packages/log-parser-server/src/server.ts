import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { LogParserPipeline } from '@agentix-e/log-parser-core';

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
 * Provides 5 endpoints:
 * - POST /api/v1/parse
 * - GET /api/v1/templates
 * - POST /api/v1/calibrate
 * - GET /api/v1/stats
 * - GET /api/v1/health
 */
export async function createServer(config: ServerConfig = {}): Promise<ServerInstance> {
  const fastify = Fastify({ logger: true });
  const pipeline = config.pipeline ?? new LogParserPipeline();
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
    async (request) => {
      const body = request.body as { log?: string; logs?: string[] };
      if (body.log) {
        return { results: [pipeline.parse(body.log)] };
      }
      if (body.logs) {
        return { results: body.logs.map((l) => pipeline.parse(l)) };
      }
      return { error: 'Provide "log" or "logs"' };
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

  // GET /api/v1/health — health check endpoint
  fastify.get('/api/v1/health', async () => {
    return {
      status: 'ok',
      uptime: Date.now() - startTime,
      version: '0.1.0',
    };
  });

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    fastify.log.info(`Received ${signal}, shutting down gracefully...`);
    try {
      await fastify.close();
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return {
    fastify,
    async start() {
      await fastify.listen({ port: config.port ?? 3000, host: config.host ?? '0.0.0.0' });
    },
    async stop() {
      await fastify.close();
    },
  };
}
