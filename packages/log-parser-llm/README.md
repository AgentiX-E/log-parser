# @agentix-e/log-parser-llm

> Convenient OpenAI-compatible LLM provider for the log-parser framework -- implements `ILLMProvider` using the Vercel AI SDK with structured output.

[![npm](https://img.shields.io/npm/v/@agentix-e/log-parser-llm?color=blue)](https://www.npmjs.com/package/@agentix-e/log-parser-llm)
[![License](https://img.shields.io/badge/license-MIT-blue)](https://github.com/AgentiX-E/log-parser/blob/main/LICENSE)

## Overview

`@agentix-e/log-parser-llm` provides the `OpenAICompatibleProvider` -- a single class that implements `ILLMProvider` for **any OpenAI-compatible endpoint**. It uses the Vercel AI SDK's `generateObject()` with a Zod schema to enforce structured NER-style template extraction. Every response is validated against the schema before being returned.

**Supported backends:**

| Provider | Default Endpoint | API Key Required |
|----------|-----------------|:---:|
| **Ollama** | `http://localhost:11434/v1` | No |
| **OpenAI** | `https://api.openai.com/v1` | Yes |
| **DeepSeek** | `https://api.deepseek.com/v1` | Yes |
| **Anthropic** | `https://api.anthropic.com/v1` | Yes |
| **Custom** | Any OpenAI-compatible URL | Depends |

No network calls occur at construction time -- the provider lazily creates the underlying AI SDK client. Network activity only occurs when `extractTemplate()` is called.

## Installation

```bash
npm install @agentix-e/log-parser-llm @agentix-e/log-parser-core ai zod @ai-sdk/openai-compatible
```

## Quick Start

### Ollama (Local, Zero Cost)

```bash
# Start Ollama with a model
ollama pull qwen2.5:7b
```

```typescript
import { OpenAICompatibleProvider } from '@agentix-e/log-parser-llm';
import { LogParserPipeline } from '@agentix-e/log-parser-core';

const llm = new OpenAICompatibleProvider({
  provider: 'ollama',
  model: 'qwen2.5:7b',
});

const pipeline = new LogParserPipeline({ llmProvider: llm });

const result = pipeline.parse('User alice uploaded file report_2025.pdf (2.4MB)');
console.log(result.template); // "User <*> uploaded file <*> (<*>MB)"
console.log(result.source);   // "llm"
```

### OpenAI

```typescript
import { OpenAICompatibleProvider } from '@agentix-e/log-parser-llm';

const llm = new OpenAICompatibleProvider({
  provider: 'openai',
  model: 'gpt-4o-mini',
  apiKey: process.env.OPENAI_API_KEY,
});

const pipeline = new LogParserPipeline({ llmProvider: llm });
// ~$0.0002 per call with gpt-4o-mini
```

### DeepSeek

```typescript
const llm = new OpenAICompatibleProvider({
  provider: 'deepseek',
  model: 'deepseek-chat',
  apiKey: process.env.DEEPSEEK_API_KEY,
});
// Excellent cost-performance for log parsing (~$0.0001 per call)
```

### Anthropic (via compatible adapter)

```typescript
const llm = new OpenAICompatibleProvider({
  provider: 'anthropic',
  model: 'claude-3-5-haiku-latest',
  apiKey: process.env.ANTHROPIC_API_KEY,
});
```

### Custom Endpoint (self-hosted, proxy, or any compatible API)

```typescript
const llm = new OpenAICompatibleProvider({
  provider: 'custom',
  model: 'my-fine-tuned-model',
  baseURL: 'https://my-inference-endpoint.example.com/v1',
  apiKey: 'sk-...',
});
```

### Using the provider standalone (without pipeline)

```typescript
import { OpenAICompatibleProvider } from '@agentix-e/log-parser-llm';

const llm = new OpenAICompatibleProvider({
  provider: 'deepseek',
  model: 'deepseek-chat',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const result = await llm.extractTemplate([
  'Disk usage on /dev/sda1 is 85% (threshold: 80%)',
  'Disk usage on /dev/sdb1 is 92% (threshold: 90%)',
]);

console.log(result.template);   // "Disk usage on <PATH> is <NUM>% (threshold: <NUM>%)"
console.log(result.variables);  // NER-style annotations with positions and categories
console.log(result.confidence); // 0.95
console.log(result.tokens);     // { input: ..., output: ... }
```

## Configuration

### `OpenAICompatibleConfig`

| Parameter | Type | Required | Default | Description |
|-----------|------|:---:|---------|-------------|
| `provider` | `'ollama' \| 'openai' \| 'deepseek' \| 'anthropic' \| 'custom'` | Yes | -- | Backend provider type |
| `model` | `string` | Yes | -- | Model identifier (e.g., `'qwen2.5:7b'`, `'gpt-4o-mini'`) |
| `apiKey` | `string` | No | -- | API key. Not needed for Ollama. Can also be set via env var. |
| `baseURL` | `string` | No | Provider default | Override the API endpoint URL |

### Provider defaults

| Provider | `baseURL` fallback |
|----------|--------------------|
| `ollama` | `http://localhost:11434/v1` |
| `openai` | `https://api.openai.com/v1` |
| `deepseek` | `https://api.deepseek.com/v1` |
| `anthropic` | `https://api.anthropic.com/v1` |
| `custom` | `http://localhost:11434/v1` |

## How It Works

The provider uses the Vercel AI SDK's `generateObject()` with a Zod schema to enforce structured output. The LLM receives NER-style prompts identifying variable positions (IP, number, path, UUID, etc.) and replacing them with typed placeholders. Every response is validated against the schema before being returned to the pipeline.

The control plane flow: `MissAccumulator` buffers drain-ts misses → `PartitioningEngine` clusters by TF-IDF similarity → `DppSampler` selects representative samples → `extractTemplate()` sends NER prompt → `SelfReflectionLoop` validates output (up to 3 iterations) → `AdaptiveTemplateCache` stores the result.

## API Reference

### `OpenAICompatibleProvider`

| Method | Description |
|--------|-------------|
| `new OpenAICompatibleProvider(config)` | Create a provider. No network calls. |
| `extractTemplate(logSamples: readonly string[])` | Call the LLM with NER-style prompting. Returns `LlmTemplateResult` with template, variable annotations, confidence, and token usage. |

### `LlmTemplateResult`

| Field | Type | Description |
|-------|------|-------------|
| `template` | `string` | Extracted template with typed placeholders (e.g., `<IP>`, `<NUM>`) |
| `variables` | `VariableAnnotation[]` | NER-style annotations with position, value, and category |
| `confidence` | `number` | Confidence score (0-1) |
| `tokens` | `{ input: number; output: number }` | Token usage for cost tracking |

## Related Packages

| Package | Purpose |
|---------|---------|
| `@agentix-e/log-parser-core` | Core pipeline engine (required) |
| `@agentix-e/log-parser-webllm` | Browser-local LLM via WebGPU (alternative to cloud providers) |
| `@agentix-e/log-parser-node` | Node.js I/O adapters for file streaming |
| `@agentix-e/log-parser-server` | REST API server wrapping the pipeline |

## License

MIT
