# log-parser

> A production-grade, composable intelligent log parsing engine for Node.js and Browser — built on TypeScript with dependency-injection-driven architecture.

[![CI](https://github.com/AgentiX-E/log-parser/actions/workflows/ci.yml/badge.svg)](https://github.com/AgentiX-E/log-parser/actions/workflows/ci.yml)
[![Benchmark Report](https://github.com/AgentiX-E/log-parser/actions/workflows/benchmark-report.yml/badge.svg)](https://agentix-e.github.io/log-parser/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22-green)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D10-orange)](https://pnpm.io/)

## Overview

**log-parser** transforms unstructured log messages into structured templates with typed parameters. It composes a high-performance data plane (drain-ts prefix-tree clustering, 99% of logs, zero network) with an optional LLM control plane for semantic understanding of unknown patterns. The entire pipeline is driven by dependency injection — swap any component without touching the framework.

### Architecture

```
Raw Log → [Preprocessor] → [Data Plane: drain-ts] → [SynLogRefiner] → [Control Plane: LLM] → Template
            │                      │                        │                       │
       Language detection     Prefix-tree          Regex anonymization     ILLMProvider (DI)
       Multi-lang tokenize    Masking              Cross-group verify      Adaptive batching
       Structured extract     Persistence          Post-processing         Self-reflection
```

### Key Features

- **DI-driven architecture** — `ILLMProvider` and `IEmbeddingProvider` injected at construction; undefined = pure drain-ts mode
- **Dual-runtime** — Node.js and Browser share the same `core` package; platform-specific I/O in `node` and `browser` packages
- **SynLogTemplateRefiner** — SynLogPlus-inspired template post-processing boosting PTA by 236% on syntax-based parsers
- **Adaptive LLM batching** — packs clusters into context-window-aware batches; 25 API calls for 16 LogHub-2k datasets vs 460 for naive per-cluster
- **Granularity Distance + HITL** — Needleman-Wunsch alignment distinguishes granularity preferences from parsing errors
- **ConfigAutoTuner** — staged grid search optimizing 9 hyperparameters; WeeklyReplay pipeline for offline-to-production config optimization
- **Real WebLLM** — browser-local LLM inference via `@mlc-ai/web-llm` with WebGPU acceleration; zero data egress
- **Verified benchmarks** — 16/16 LogHub-2k datasets, GA 0.991, PTA 0.842 (LLM-enhanced), results [published live](https://agentix-e.github.io/log-parser/)

## Packages

| Package | npm | Description |
|---------|-----|-------------|
| `@agentix-e/log-parser-core` | [![npm](https://img.shields.io/npm/v/@agentix-e/log-parser-core?color=blue)](https://www.npmjs.com/package/@agentix-e/log-parser-core) | Core interfaces, pipeline engine, built-in TF-IDF, evaluator, AutoTuner |
| `@agentix-e/log-parser-node` | [![npm](https://img.shields.io/npm/v/@agentix-e/log-parser-node?color=blue)](https://www.npmjs.com/package/@agentix-e/log-parser-node) | Node.js I/O adapters — filesystem streaming, stdin, cluster-based parallelism |
| `@agentix-e/log-parser-browser` | [![npm](https://img.shields.io/npm/v/@agentix-e/log-parser-browser?color=orange)](https://www.npmjs.com/package/@agentix-e/log-parser-browser) | Browser I/O adapters — FileReader, Drag & Drop, IndexedDB persistence, Web Workers |
| `@agentix-e/log-parser-llm` | [![npm](https://img.shields.io/npm/v/@agentix-e/log-parser-llm?color=blue)](https://www.npmjs.com/package/@agentix-e/log-parser-llm) | Convenient ILLMProvider — OpenAI-compatible via Vercel AI SDK (Ollama, OpenAI, DeepSeek, Anthropic) |
| `@agentix-e/log-parser-webllm` | [![npm](https://img.shields.io/npm/v/@agentix-e/log-parser-webllm?color=orange)](https://www.npmjs.com/package/@agentix-e/log-parser-webllm) | Browser-local LLM provider — `@mlc-ai/web-llm` with WebGPU acceleration |
| `@agentix-e/log-parser-server` | [![npm](https://img.shields.io/npm/v/@agentix-e/log-parser-server?color=blue)](https://www.npmjs.com/package/@agentix-e/log-parser-server) | REST API server — Fastify with OpenTelemetry instrumentation |
| `@agentix-e/log-parser-cli` | [![npm](https://img.shields.io/npm/v/@agentix-e/log-parser-cli?color=blue)](https://www.npmjs.com/package/@agentix-e/log-parser-cli) | CLI tool — parse logs from files, stdin, or remote sources |

> **Layered strategy**: install only the packages you need. `core` alone provides drain-ts template mining. Add `llm` for LLM enhancement. Add `webllm` for browser-local inference. Add `server` for REST API.

## Quick Start

### Option 1 — Embedded npm package (drain-only, zero network)

```bash
npm install @agentix-e/log-parser-core
```

```typescript
import { LogParserPipeline } from '@agentix-e/log-parser-core';

const pipeline = new LogParserPipeline();

pipeline.parse('User alice logged in from 192.168.1.1');
// { template: "User <*> logged in from <IP>", source: "drain-strict" }

pipeline.parse('User bob logged in from 10.0.0.1');
// { template: "User <*> logged in from <IP>", source: "drain-strict" }
```

### Option 2 — LLM-enhanced (local or cloud)

```bash
npm install @agentix-e/log-parser-core @agentix-e/log-parser-llm
```

```typescript
import { LogParserPipeline } from '@agentix-e/log-parser-core';
import { OpenAICompatibleProvider } from '@agentix-e/log-parser-llm';

const llm = new OpenAICompatibleProvider({
  provider: 'ollama',
  model: 'qwen2.5:7b',
  baseURL: 'http://localhost:11434/v1',
});

const pipeline = new LogParserPipeline({ llmProvider: llm });
```

### Option 3 — Browser-local (zero server, zero API key)

```html
<script type="module">
  import { LogParserPipeline } from '@agentix-e/log-parser-core';
  import { WebLLMProvider } from '@agentix-e/log-parser-webllm';

  const llm = await WebLLMProvider.create({ model: 'gemma-2-2b-it-q4f16_1-MLC' });
  const pipeline = new LogParserPipeline({ llmProvider: llm });
</script>
```

### Option 4 — REST API server

```bash
npm install @agentix-e/log-parser-core @agentix-e/log-parser-server @agentix-e/log-parser-llm
```

```typescript
import { createServer } from '@agentix-e/log-parser-server';

const server = await createServer({ llmProvider: /* optional */ });
await server.listen({ port: 3000 });
```

Endpoints: `POST /api/v1/parse`, `GET /api/v1/templates`, `POST /api/v1/calibrate`, `GET /api/v1/stats`, `GET /api/v1/health`

## Benchmarks

All 16 LogHub-2k datasets evaluated against LogPAI standard metrics.

**[View live benchmark report →](https://agentix-e.github.io/log-parser/)**

> ⚠️ **Note**: Benchmarks are currently based on the Drain engine (drain-ts)
> with SynLogTemplateRefiner and adaptive LLM batching. Full pipeline-integrated
> benchmarks (I1 improvement) are in progress. Numbers below represent verified
> drain-ts + SynLog refinement results.

| Metric | drain-only | +SynLog Refinement | +LLM Enhancement |
|--------|:---:|:---:|:---:|
| Avg GA | 0.990 | 0.990 | 0.990 |
| Avg PTA | 0.825 | 0.842 | **0.842** |
| Datasets tested | 16/16 | 16/16 | 5/16 (LLM) |
| LLM calls (5 datasets) | — | — | ≤25 |
| Est. LLM cost | — | — | <$0.02 |

## Current Status

| Metric | Value |
|--------|-------|
| Core coverage | 93.0% stmts / 85.7% branch / 95.5% funcs / 94.0% lines |
| Total tests | 461+ passing (core), 569+ across all packages |
| TypeScript | strict mode, zero `@ts-nocheck` in core |
| Node.js/ESM | Node ≥22, ESM-only |

### Planned Improvements (see roadmap)
- Full pipeline-integrated benchmark (I1)
- ≥95% coverage on all 4 dimensions for all packages (I1)
- K8s Helm chart, gRPC API, Playwright browser tests (I2-I4)
- WASM acceleration for browser (I6)

## Development

```bash
git clone https://github.com/AgentiX-E/log-parser.git
cd log-parser
pnpm install
pnpm build
pnpm test
pnpm test:coverage
```

## License

MIT © 2026 AgentiX-E
