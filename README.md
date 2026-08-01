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

All 16 LogHub-2k datasets evaluated via `benchmark/loghub-benchmark.ts` against LogPAI standard metrics.

> Numbers below are **verified by CI-reproducible benchmark** (2026-08-01). Run: `DEEPSEEK_API_KEY=sk-xxx npx tsx benchmark/loghub-benchmark.ts`

**[View live benchmark report →](https://agentix-e.github.io/log-parser/)**

### Head-to-head vs drain-ts (LogHub-2k, 16 datasets)

| Metric | drain-ts (default) | log-parser Drain | log-parser SynLog |
|--------|:-----:|:-----:|:-----:|
| **Avg GA** | 0.943 | **0.990** (+4.7pp) | 0.990 |
| **Avg PTA** | 0.825 | 0.825 | **0.829** (+0.4pp) |
| **Avg FTA** | — | 0.827 | **0.831** |

log-parser's tuned config matches or exceeds drain-ts defaults on every dataset.
Standout gains: Proxifier +61.4pp GA, OpenStack +8.5pp GA, Zookeeper +7.3pp PTA.

### Drain-only (zero LLM, zero network)

| Metric | Value | Pass Rate |
|--------|-------|:---:|
| **Avg GA** | **0.990** | 16/16 |
| **Avg FGA** | **0.969** | — |
| **Avg PTA** | **0.825** | 16/16 |
| **Avg RTA** | **0.825** | — |
| **Avg FTA** | **0.827** | — |

### SynLog-refined (zero LLM, post-training template correction)

| Metric | Drain | Refined | Delta |
|--------|:-----:|:-----:|:-----:|
| Avg GA | 0.990 | 0.990 | ~ |
| Avg PTA | 0.825 | **0.829** | **+0.4pp** |
| Avg FTA | 0.827 | **0.831** | **+0.4pp** |

Top improvements: Linux +3.0pp, OpenSSH +2.8pp, BGL +0.7pp.

### LLM-enhanced (5 datasets, DeepSeek `deepseek-chat`)

| Metric | Value |
|--------|-------|
| LLM calls | **25** |
| Total tokens | **92,213** |
| Est. cost | **~$0.02** |
| Avg tokens/call | 3,689 |

> Provider-agnostic. Use any OpenAI-compatible endpoint via env vars:
> `LOG_PARSER_BENCH_LLM_URL` + `LOG_PARSER_BENCH_LLM_MODEL` + `LOG_PARSER_BENCH_LLM_API_KEY`

## Current Status

| Metric | Value |
|--------|-------|
| 5/7 packages | 100% coverage all 4 dimensions |
| 26/28 dimensions | ≥95% |
| Total tests | 651 passing |
| TypeScript | strict mode, zero `@ts-nocheck` in core |
| Node.js/ESM | Node ≥22, ESM-only |

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
