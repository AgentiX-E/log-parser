# @agentix-e/log-parser-core

> Core interfaces, pipeline engine, and built-in TF-IDF fallback for the log-parser framework -- platform-agnostic, runs on Node.js, Browser, Deno, and Bun.

[![npm](https://img.shields.io/npm/v/@agentix-e/log-parser-core?color=blue)](https://www.npmjs.com/package/@agentix-e/log-parser-core)
[![License](https://img.shields.io/badge/license-MIT-blue)](https://github.com/AgentiX-E/log-parser/blob/main/LICENSE)

## Overview

`@agentix-e/log-parser-core` is the engine room of the log-parser framework. It composes the **data plane** (drain-ts), optional **control plane** (LLM), and built-in **TF-IDF embedding fallback** into a single `LogParserPipeline` entry point. All other packages (node, browser, llm, webllm, server, cli) depend on this package.

The package is **platform-agnostic** -- it has zero Node.js or browser-specific APIs. It only defines abstract interfaces (`ILLMProvider`, `IEmbeddingProvider`) and ships concrete implementations for everything except LLM backends.

**Key capabilities:**
- **DrainDataPlane** -- wraps `@agentix-e/drain-ts` (323/323 tests, 98.86% coverage) for statistical log parsing at 50K+ logs/sec
- **DI-driven architecture** -- inject an `ILLMProvider` for LLM-enhanced parsing, or leave it undefined for pure Drain mode
- **Multi-language tokenizer** -- auto-detects English, Chinese, and Japanese via `franc-min`, routes to `natural`, `nodejieba`, or `kuromoji`
- **Variable type classifier** -- regex-based recognition of 9 variable categories (IP, NUM, PATH, UUID, TIMESTAMP, etc.) with zero LLM calls
- **Control plane** -- MissAccumulator, DBSCAN partitioning, DPP sampling, SelfReflectionLoop, and ModelRouter for cost-optimized LLM workflows
- **Granularity Distance + HITL** -- Needleman-Wunsch alignment with 32-sample human-in-the-loop calibration
- **ConfigAutoTuner + WeeklyReplay** -- staged grid search over 69 config variants and weekly concept-drift detection
- **AdaptiveTemplateCache** -- trie tree with hit-frequency sorting, time decay, and LRU eviction

## Installation

```bash
npm install @agentix-e/log-parser-core @agentix-e/drain-ts
```

For multi-language tokenizer support (optional):

```bash
npm install franc-min natural nodejieba kuromoji
```

## Quick Start

### Pure Drain (zero LLM, zero network)

```typescript
import { LogParserPipeline } from '@agentix-e/log-parser-core';

// Create a pipeline with no LLM -- uses drain-ts exclusively
const pipeline = new LogParserPipeline();

// Parse individual log lines
const result1 = pipeline.parse('2025-01-15 08:32:11 ERROR Connection refused on port 5432');
const result2 = pipeline.parse('2025-01-15 08:32:15 ERROR Connection refused on port 8080');

console.log(result1.template); // "ERROR Connection refused on port <*>"
console.log(result1.source);   // "drain"

// Parse a batch
const batch = [
  'User alice logged in from 192.168.1.100',
  'User bob logged in from 10.0.0.5',
];
const batchResults = pipeline.parseBatch(batch);

console.log(pipeline.stats);
// { totalProcessed: 4, templateCount: 2, missCount: 0, ... }
```

### With LLM Enhancement (DI injection)

```typescript
import { LogParserPipeline } from '@agentix-e/log-parser-core';
import { OpenAICompatibleProvider } from '@agentix-e/log-parser-llm';

const llm = new OpenAICompatibleProvider({
  provider: 'ollama',
  model: 'qwen2.5:7b',
});

const pipeline = new LogParserPipeline({ llmProvider: llm });

// When drain-ts misses, the control plane kicks in with LLM refinement
const result = pipeline.parse('Unusual event: user_7a3f triggered alert threshold_42');
console.log(result.template); // "Unusual event: <*> triggered alert threshold_<*>"
console.log(result.source);   // "llm" (when drain missed)
```

### Built-in TF-IDF Embedding

```typescript
import { LogParserPipeline, TfIdfVectorizer } from '@agentix-e/log-parser-core';

// TF-IDF is the default when no IEmbeddingProvider is injected -- zero config
const pipeline = new LogParserPipeline();

// Or use it standalone for custom clustering
const vectorizer = new TfIdfVectorizer();
const vectors = vectorizer.fitTransform([
  'Connection refused on port 5432',
  'Connection refused on port 8080',
  'File not found: /etc/config.yaml',
]);

import { cosineSimilarity } from '@agentix-e/log-parser-core';
const sim = cosineSimilarity(vectors[0], vectors[1]);
console.log(sim); // ~0.92 -- very similar (same template, different port)
```

## API Reference

### `LogParserPipeline`

| Method | Description |
|--------|-------------|
| `parse(log: string)` | Parse a single log line, returns `LogParseResult` |
| `parseBatch(logs: string[])` | Parse multiple log lines in batch |
| `calibrateGranularity(samples)` | HITL calibration with 32 labeled samples |
| `stats` | Current pipeline statistics (`PipelineStats`) |
| `dispose()` | Release resources (LLM connections, caches) |

### `DrainDataPlane`

Direct access to the underlying drain-ts engine. Supports `Drain` and `JaccardDrain` engines, extended masking (hostname, hex, UUID), AEL similarity merging, and adjacent fusion.

### `VariableTypeClassifier`

```typescript
import { VariableTypeClassifier } from '@agentix-e/log-parser-core';

const classifier = new VariableTypeClassifier();
const result = classifier.classify('192.168.1.100');
console.log(result.type); // "IP"

const result2 = classifier.classify('/var/log/nginx/access.log');
console.log(result2.type); // "PATH"
```

Recognized types: `IP`, `NUM`, `PATH`, `UUID`, `EMAIL`, `TIMESTAMP`, `HOSTNAME`, `GENERIC`.

### `GranularityDistance`

```typescript
import { GranularityDistance } from '@agentix-e/log-parser-core';

const gd = new GranularityDistance({ preference: 'balanced' });
const distance = gd.compute(
  'Connection refused on port <*>',
  'Connection refused on port 5432'
);
```

### `Evaluator`

1:1 port of the LogPAI evaluation framework. Computes GA, FGA, PA, PTA, RTA, FTA, and NED metrics.

### `ConfigAutoTuner`

```typescript
import { ConfigAutoTuner, LogParserPipeline } from '@agentix-e/log-parser-core';

const tuner = new ConfigAutoTuner({
  dataset: myLogLines,
  groundTruth: myTemplates,
  maxEvals: 69,
});

const result = await tuner.tune();
console.log(result.bestConfig); // optimal DrainDataPlaneConfig
console.log(result.bestPTA);    // e.g., 0.902
```

### `WeeklyReplay`

```typescript
import { WeeklyReplay } from '@agentix-e/log-parser-core';

const replay = new WeeklyReplay({ pipeline, dataset, threshold: 0.05 });
const result = await replay.run();
console.log(result.pta);           // current PTA
console.log(result.needsRetuning); // true if PTA dropped >5%
```

## Related Packages

| Package | Purpose |
|---------|---------|
| `@agentix-e/log-parser-llm` | OpenAI-compatible LLM provider (Ollama, OpenAI, DeepSeek, Anthropic) |
| `@agentix-e/log-parser-webllm` | Browser-local LLM via WebGPU (zero server, zero API key) |
| `@agentix-e/log-parser-node` | Node.js filesystem streaming, stdin, and cluster parallelism |
| `@agentix-e/log-parser-browser` | Browser FileReader, Drag & Drop, IndexedDB, Web Workers |
| `@agentix-e/log-parser-server` | Fastify REST API server with OpenTelemetry |
| `@agentix-e/log-parser-cli` | Commander CLI for parsing logs from files and stdin |

## License

MIT
