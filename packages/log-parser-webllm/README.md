# @agentix-e/log-parser-webllm

> Browser-local LLM provider for the log-parser framework -- implements `ILLMProvider` using `@mlc-ai/web-llm` with WebGPU acceleration, zero server dependency, zero API key.

[![npm](https://img.shields.io/npm/v/@agentix-e/log-parser-webllm?color=blue)](https://www.npmjs.com/package/@agentix-e/log-parser-webllm)
[![License](https://img.shields.io/badge/license-MIT-blue)](https://github.com/AgentiX-E/log-parser/blob/main/LICENSE)

## Overview

`@agentix-e/log-parser-webllm` runs large language models **entirely in the browser** via `@mlc-ai/web-llm` with WebGPU acceleration. Data never leaves the user's device -- no server, no API keys, no network calls during inference. This is ideal for security-sensitive environments, offline-capable applications, and privacy-first log analysis.

**Requirements:**
- Browser with WebGPU support (Chrome 113+, Edge 113+, Firefox Nightly with `dom.webgpu.enabled`)
- `@mlc-ai/web-llm` peer dependency (auto-installed with compliant package managers)

Model download happens once (cached by the browser). Download size varies by model (typically 1-4 GB for quantized models). Initial download may take several minutes on first use; subsequent page loads are instant.

## Installation

```bash
npm install @agentix-e/log-parser-webllm @agentix-e/log-parser-core @mlc-ai/web-llm
```

## Quick Start

### Full Pipeline with Browser-Local LLM

```typescript
import { WebLLMProvider } from '@agentix-e/log-parser-webllm';
import { LogParserPipeline } from '@agentix-e/log-parser-core';

// IMPORTANT: Always use WebLLMProvider.create() -- constructor alone is not enough
const llm = await WebLLMProvider.create({
  model: 'gemma-2-2b-it-q4f16_1-MLC',
});

const pipeline = new LogParserPipeline({ llmProvider: llm });

// All parsing happens locally in the browser
const result = pipeline.parse(
  '2025-01-15 08:32:11 [ERROR] mod_ssl: SSL handshake failed (client 192.168.1.100)',
);
console.log(result.template);
// "2025-01-15 08:32:11 [ERROR] mod_ssl: SSL handshake failed (client <IP>)"
console.log(result.source); // "llm"
```

### With Web Worker Offloading (no UI freeze)

```typescript
import { WebWorkerPipeline } from '@agentix-e/log-parser-browser';
import { WebLLMProvider } from '@agentix-e/log-parser-webllm';

// Run the LLM + pipeline in a Web Worker to keep the UI responsive
const worker = new Worker(new URL('./llm-parser.worker.ts', import.meta.url), {
  type: 'module',
});

const workerPipeline = new WebWorkerPipeline(worker);

// Worker file (llm-parser.worker.ts):
// ---
// import { WebLLMProvider } from '@agentix-e/log-parser-webllm';
// import { LogParserPipeline } from '@agentix-e/log-parser-core';
//
// const llm = await WebLLMProvider.create({ model: 'gemma-2-2b-it-q4f16_1-MLC' });
// const pipeline = new LogParserPipeline({ llmProvider: llm });
//
// self.addEventListener('message', (event) => {
//   const results = pipeline.parseBatch(event.data.lines);
//   self.postMessage(results);
// });
```

### With IndexedDB Persistence + Browser-Local LLM

```typescript
import { WebLLMProvider } from '@agentix-e/log-parser-webllm';
import { IndexedDBPersistence } from '@agentix-e/log-parser-browser';
import { LogParserPipeline } from '@agentix-e/log-parser-core';

const [llm, persistence] = await Promise.all([
  WebLLMProvider.create({ model: 'gemma-2-2b-it-q4f16_1-MLC' }),
  (async () => {
    const p = new IndexedDBPersistence();
    await p.init();
    return p;
  })(),
]);

const pipeline = new LogParserPipeline({
  llmProvider: llm,
  drain: { persistence },
});

// Parse logs. Templates survive page reloads via IndexedDB.
// LLM inference is local. No network. No API keys. Zero cost.
```

## Configuration

### `WebLLMProvider.create(config)`

| Parameter | Type | Required | Description |
|-----------|------|:---:|-------------|
| `model` | `string` | Yes | MLC model identifier (e.g., `'gemma-2-2b-it-q4f16_1-MLC'`) |

**Recommended models for log parsing:**

| Model | Size | Notes |
|-------|------|-------|
| `gemma-2-2b-it-q4f16_1-MLC` | ~1.3 GB | Fast, good NER accuracy for log variables |
| `Llama-3.2-1B-Instruct-q4f16_1-MLC` | ~0.8 GB | Smallest, fastest download |
| `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` | ~1.0 GB | Strong on structured output tasks |
| `Phi-3.5-mini-instruct-q4f16_1-MLC` | ~2.2 GB | Best accuracy, larger download |

See the [MLC model catalog](https://huggingface.co/mlc-ai) for the full list and updates.

## API Reference

### `WebLLMProvider`

| Method | Description |
|--------|-------------|
| `WebLLMProvider.create(config)` | **Static factory.** Initializes the WebLLM engine and downloads the model (first use only). Must be called instead of `new WebLLMProvider()`. |
| `extractTemplate(logSamples: readonly string[])` | Run local LLM inference with NER-style prompting. Returns `LlmTemplateResult`. |

**Important:** The constructor (`new WebLLMProvider()`) creates an uninitialized provider. Always use `WebLLMProvider.create()` which handles engine initialization, model download, and progress reporting.

**Progress reporting:** The provider logs model download progress to `console.debug`:

```
[WebLLM] Loading gemma-2-2b-it-q4f16_1-MLC: Loading model weights (45%)
[WebLLM] Loading gemma-2-2b-it-q4f16_1-MLC: Initializing WebGPU pipeline (80%)
[WebLLM] Loading gemma-2-2b-it-q4f16_1-MLC: Ready
```

## Related Packages

| Package | Purpose |
|---------|---------|
| `@agentix-e/log-parser-core` | Core pipeline engine (required) |
| `@agentix-e/log-parser-llm` | Cloud LLM provider (Ollama, OpenAI, DeepSeek) -- alternative to WebLLM |
| `@agentix-e/log-parser-browser` | Browser I/O adapters, IndexedDB, Web Workers |

## License

MIT
