# @agentix-e/log-parser-server

> REST API server for the log-parser framework -- built on Fastify with OpenTelemetry instrumentation, graceful shutdown, and Docker-ready deployment.

[![npm](https://img.shields.io/npm/v/@agentix-e/log-parser-server?color=blue)](https://www.npmjs.com/package/@agentix-e/log-parser-server)
[![License](https://img.shields.io/badge/license-MIT-blue)](https://github.com/AgentiX-E/log-parser/blob/main/LICENSE)

## Overview

`@agentix-e/log-parser-server` wraps the log-parser pipeline in a production-ready **Fastify** REST API server. It provides endpoints for parsing logs, retrieving templates, HITL granularity calibration, statistics, and health checks. Includes OpenTelemetry tracing instrumentation, graceful shutdown handling (SIGTERM/SIGINT), and is designed to run in Docker and Kubernetes.

## Installation

```bash
npm install @agentix-e/log-parser-server @agentix-e/log-parser-core @agentix-e/log-parser-node fastify pino
```

## Quick Start

### Minimal Server

```typescript
import { createServer } from '@agentix-e/log-parser-server';

const server = await createServer({ port: 3000 });
await server.start();

console.log('Log parser API running on http://localhost:3000');
// Stop gracefully:
// await server.stop();
```

### With LLM Enhancement

```typescript
import { createServer } from '@agentix-e/log-parser-server';
import { LogParserPipeline } from '@agentix-e/log-parser-core';
import { OpenAICompatibleProvider } from '@agentix-e/log-parser-llm';

const llm = new OpenAICompatibleProvider({
  provider: 'deepseek',
  model: 'deepseek-chat',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const pipeline = new LogParserPipeline({ llmProvider: llm });
const server = await createServer({ pipeline, port: 3000, host: '0.0.0.0' });
await server.start();
```

### Docker Deployment

```dockerfile
# Dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod
COPY dist/ ./dist/
EXPOSE 3000
CMD ["node", "dist/server-entry.mjs"]
```

```typescript
// server-entry.mjs
import { createServer } from '@agentix-e/log-parser-server';

const server = await createServer({
  port: parseInt(process.env.PORT ?? '3000'),
  host: process.env.HOST ?? '0.0.0.0',
});
await server.start();
```

```bash
docker build -t log-parser-server .
docker run -p 3000:3000 log-parser-server
```

## API Endpoints

### `POST /api/v1/parse`

Parse a single log line or a batch of log lines.

**Request:**
```json
{
  "log": "2025-01-15 08:32:11 ERROR Connection refused on port 5432"
}
```

**Response (200):**
```json
{
  "results": [
    {
      "logId": 1,
      "template": "ERROR Connection refused on port <*>",
      "source": "drain",
      "params": { "port": "5432" }
    }
  ]
}
```

**Batch request:**
```json
{
  "logs": [
    "ERROR Connection refused on port 5432",
    "ERROR Connection refused on port 8080",
    "WARN Disk usage at 85%"
  ]
}
```

**Error (400):**
```json
{ "error": "Provide \"log\" or \"logs\"" }
```

---

### `POST /api/v1/parse/batch`

Optimized batch parsing via `parseBatch()` for throughput.

**Request:**
```json
{
  "logs": ["line 1", "line 2", "..."]
}
```

**Response (200):**
```json
{
  "results": [ /* array of LogParseResult */ ]
}
```

---

### `GET /api/v1/templates`

Return the current template count in the pipeline.

**Response (200):**
```json
{ "templateCount": 47 }
```

---

### `POST /api/v1/calibrate`

Human-in-the-loop granularity calibration with labeled samples.

**Request:**
```json
{
  "samples": [
    {
      "log": "Connection refused on port 5432",
      "expectedTemplate": "Connection refused on port <NUM>"
    },
    {
      "log": "User alice logged in from 192.168.1.100",
      "expectedTemplate": "User <*> logged in from <IP>"
    }
  ]
}
```

**Response (200):**
```json
{ "calibrated": true, "samplesProcessed": 2 }
```

---

### `GET /api/v1/stats`

Return full pipeline statistics.

**Response (200):**
```json
{
  "totalProcessed": 1250000,
  "templateCount": 47,
  "missCount": 23,
  "llmCallCount": 5,
  "uptime": 43200000
}
```

---

### `GET /api/v1/health`

Health check endpoint.

**Response (200):**
```json
{ "status": "ok", "uptime": 43200000, "version": "0.1.0" }
```

## API Reference

### `createServer(config?)`

| Parameter | Type | Required | Default | Description |
|-----------|------|:---:|---------|-------------|
| `port` | `number` | No | `3000` | Server listen port |
| `host` | `string` | No | `'0.0.0.0'` | Server listen host |
| `pipeline` | `LogParserPipeline` | No | `new LogParserPipeline()` | Pre-configured pipeline instance |

Returns `Promise<ServerInstance>`:

| Method | Description |
|--------|-------------|
| `start()` | Start the Fastify server. Resolves when listening. |
| `stop()` | Graceful shutdown -- closes connections, flushes logs. |
| `fastify` | The underlying Fastify instance for custom middleware/plugins. |

### `instrumentPipeline(pipeline)`

Wraps a pipeline with OpenTelemetry tracing:

```typescript
import { instrumentPipeline, tracer } from '@agentix-e/log-parser-server';

const instrumented = instrumentPipeline(pipeline);
// All parse() calls are now traced with OpenTelemetry spans
```

### Graceful Shutdown

The server automatically registers `SIGTERM` and `SIGINT` handlers. On receiving a termination signal, it calls `fastify.close()` and exits cleanly. This is compatible with Docker stop, Kubernetes pod termination, and process managers.

## Related Packages

| Package | Purpose |
|---------|---------|
| `@agentix-e/log-parser-core` | Core pipeline engine (required) |
| `@agentix-e/log-parser-llm` | Add LLM enhancement to the server pipeline |
| `@agentix-e/log-parser-node` | Node.js I/O adapters (included as dependency) |
| `@agentix-e/log-parser-cli` | CLI alternative for one-shot parsing |

## License

MIT
