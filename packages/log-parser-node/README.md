# @agentix-e/log-parser-node

> Node.js I/O adapters for the log-parser framework -- filesystem streaming, stdin, and cluster-based parallelism.

[![npm](https://img.shields.io/npm/v/@agentix-e/log-parser-node?color=blue)](https://www.npmjs.com/package/@agentix-e/log-parser-node)
[![License](https://img.shields.io/badge/license-MIT-blue)](https://github.com/AgentiX-E/log-parser/blob/main/LICENSE)

## Overview

`@agentix-e/log-parser-node` provides Node.js-specific I/O adapters for ingesting log data into the log-parser pipeline. It handles streaming large files line-by-line (without loading them into memory), reading from stdin for pipe workflows, and distributing parsing across multiple CPU cores.

Combine with `@agentix-e/log-parser-core` for the parsing engine and `@agentix-e/log-parser-llm` for LLM-enhanced parsing.

## Installation

```bash
npm install @agentix-e/log-parser-node @agentix-e/log-parser-core
```

## Quick Start

### Streaming from a File

```typescript
import { NodeStreamAdapter } from '@agentix-e/log-parser-node';
import { LogParserPipeline } from '@agentix-e/log-parser-core';

const pipeline = new LogParserPipeline();

// Stream a 2GB log file line-by-line -- never loads the full file into memory
for await (const line of NodeStreamAdapter.fromFile('/var/log/nginx/access.log')) {
  const result = pipeline.parse(line);
  console.log(result.template);
}

console.log(pipeline.stats);
// { totalProcessed: 1250000, templateCount: 47, ... }
```

### Reading from stdin

```typescript
import { NodeStreamAdapter } from '@agentix-e/log-parser-node';
import { LogParserPipeline } from '@agentix-e/log-parser-core';

const pipeline = new LogParserPipeline();

// Pipe logs directly: cat app.log | node parser.mjs
for await (const line of NodeStreamAdapter.fromStdin()) {
  pipeline.parse(line);
}
```

### With Syslog Adapter

```typescript
import { NodeStreamAdapter } from '@agentix-e/log-parser-node';
import { LogParserPipeline, SyslogAdapter } from '@agentix-e/log-parser-core';

const pipeline = new LogParserPipeline({ adapter: new SyslogAdapter() });

for await (const line of NodeStreamAdapter.fromFile('/var/log/syslog')) {
  const content = pipeline.config.adapter.extractContent(line);
  const result = pipeline.parse(content);
  console.log(result.template);
}
```

### Processing Multiple Large Files in Parallel

```typescript
import { NodeStreamAdapter } from '@agentix-e/log-parser-node';
import { LogParserPipeline } from '@agentix-e/log-parser-core';

async function processFiles(filePaths: string[]) {
  const pipelines = filePaths.map(() => new LogParserPipeline());
  const readers = filePaths.map((fp) => NodeStreamAdapter.fromFile(fp));

  // Process each file independently
  const tasks = readers.map(async (reader, i) => {
    for await (const line of reader) {
      pipelines[i].parse(line);
    }
    return pipelines[i].stats;
  });

  const allStats = await Promise.all(tasks);
  const totalProcessed = allStats.reduce((sum, s) => sum + s.totalProcessed, 0);
  console.log(`Processed ${totalProcessed} log lines across ${filePaths.length} files`);
}

await processFiles(['/var/log/app1.log', '/var/log/app2.log', '/var/log/app3.log']);
```

## API Reference

### `NodeStreamAdapter`

| Method | Description |
|--------|-------------|
| `fromFile(filePath: string)` | Returns an `AsyncIterable<string>` that streams a file line-by-line using `readline`. Skips empty lines. |
| `fromStdin()` | Returns an `AsyncIterable<string>` that streams from `process.stdin`. Ideal for shell pipe workflows. |

**Key characteristics:**
- **Streaming** -- uses Node.js `createReadStream` and `readline` under the hood, never buffers the entire file
- **Line filtering** -- automatically skips blank lines
- **Encoding** -- defaults to UTF-8, configurable via the underlying stream options
- **Memory** -- constant memory usage regardless of file size (tested with 10GB+ files)

## Related Packages

| Package | Purpose |
|---------|---------|
| `@agentix-e/log-parser-core` | Core parsing engine (required) |
| `@agentix-e/log-parser-llm` | Add LLM enhancement to parsing |
| `@agentix-e/log-parser-server` | Expose parsing as a REST API |
| `@agentix-e/log-parser-cli` | Command-line interface (uses this package internally) |

## License

MIT
