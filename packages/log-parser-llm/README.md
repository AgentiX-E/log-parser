# @agentix-e/log-parser-llm

Convenient OpenAI-compatible LLM provider for the log-parser framework as an npm package.
Implements `ILLMProvider` using the Vercel AI SDK with structured output.

## Installation

```bash
npm install @agentix-e/log-parser-llm @agentix-e/log-parser-core ai zod @ai-sdk/openai-compatible
```

## Supported Providers

- **Ollama** — local models, zero data egress, zero API key
- **OpenAI** — GPT-4o-mini, GPT-4o
- **DeepSeek** — DeepSeek-V3, DeepSeek-Chat
- **Anthropic** — Claude 3 Haiku, Claude 3 Sonnet
- **Custom** — any OpenAI-compatible endpoint

## Quick Start

### Ollama (Local)

```typescript
import { OpenAICompatibleProvider } from '@agentix-e/log-parser-llm';
import { LogParserPipeline } from '@agentix-e/log-parser-core';

const llm = new OpenAICompatibleProvider({
  provider: 'ollama',
  model: 'qwen2.5:7b',
  baseURL: 'http://localhost:11434/v1',
});

const pipeline = new LogParserPipeline({ llmProvider: llm });
```

### OpenAI

```typescript
const llm = new OpenAICompatibleProvider({
  provider: 'openai',
  model: 'gpt-4o-mini',
  apiKey: process.env.OPENAI_API_KEY,
});
```

### DeepSeek

```typescript
const llm = new OpenAICompatibleProvider({
  provider: 'deepseek',
  model: 'deepseek-chat',
  apiKey: process.env.DEEPSEEK_API_KEY,
});
```

## How It Works

The provider uses the Vercel AI SDK's `generateObject()` with a Zod schema to enforce structured output. The LLM receives NER-style prompts asking it to identify variables (IP, number, path, UUID, etc.) and replace them with typed placeholders. Every response is validated against the schema before being returned.

## API

### `new OpenAICompatibleProvider(config)`

| Parameter | Type | Required | Description |
|-----------|------|:---:|-------------|
| `provider` | `'ollama' \| 'openai' \| 'deepseek' \| 'anthropic' \| 'custom'` | Yes | Backend provider type |
| `model` | `string` | Yes | Model identifier (e.g., `'qwen2.5:7b'`) |
| `apiKey` | `string` | No | API key (not needed for Ollama) |
| `baseURL` | `string` | No | API endpoint URL (provider defaults used if omitted) |

### `.extractTemplate(logSamples)`

Calls the LLM with NER-style prompting. Returns the extracted template, variable annotations, confidence score, and token usage statistics.

## License

MIT
