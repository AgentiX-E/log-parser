# @agentix-e/log-parser-browser

> Browser I/O adapters for the log-parser framework -- FileReader, Drag & Drop, IndexedDB persistence, Web Workers, and ReadableStream.

[![npm](https://img.shields.io/npm/v/@agentix-e/log-parser-browser?color=blue)](https://www.npmjs.com/package/@agentix-e/log-parser-browser)
[![License](https://img.shields.io/badge/license-MIT-blue)](https://github.com/AgentiX-E/log-parser/blob/main/LICENSE)

## Overview

`@agentix-e/log-parser-browser` brings the log-parser engine to the browser. It provides adapters for reading log files via `<input type="file">`, drag-and-drop events, and `fetch()`, plus **IndexedDB persistence** (survives page reloads) and **Web Worker offloading** (parses without freezing the UI).

Combine with `@agentix-e/log-parser-webllm` for browser-local LLM inference with zero server dependencies.

## Installation

```bash
npm install @agentix-e/log-parser-browser @agentix-e/log-parser-core
```

## Quick Start

### File Input via `<input type="file">`

```typescript
import { BrowserFileAdapter } from '@agentix-e/log-parser-browser';
import { LogParserPipeline } from '@agentix-e/log-parser-core';

const fileInput = document.querySelector<HTMLInputElement>('#log-file');

fileInput.addEventListener('change', async () => {
  const adapter = await BrowserFileAdapter.fromFileList(fileInput.files!);
  const lines = adapter.getLines();
  console.log(`Loaded ${adapter.count()} log lines`);

  const pipeline = new LogParserPipeline();
  const results = pipeline.parseBatch(lines);

  results.forEach((r) => {
    console.log(`${r.template} (source: ${r.source})`);
  });
});
```

### Drag-and-Drop Log Analysis

```typescript
import { BrowserFileAdapter } from '@agentix-e/log-parser-browser';

const dropZone = document.querySelector<HTMLDivElement>('#drop-zone');

dropZone.addEventListener('drop', async (event: DragEvent) => {
  event.preventDefault();
  const adapter = await BrowserFileAdapter.fromDragEvent(event);
  const lines = adapter.getLines();

  // Feed into pipeline...
});
```

### Fetching Remote Log Files

```typescript
import { BrowserFileAdapter } from '@agentix-e/log-parser-browser';
import { LogParserPipeline, ApacheAdapter } from '@agentix-e/log-parser-core';

const adapter = await BrowserFileAdapter.fromFetch(
  'https://example.com/logs/2025-01-15-access.log',
);
const pipeline = new LogParserPipeline({ adapter: new ApacheAdapter() });

adapter.getLines().forEach((line) => {
  const content = pipeline.config.adapter.extractContent(line);
  const result = pipeline.parse(content);
  console.log(result.template);
});
```

### IndexedDB Persistence

```typescript
import { IndexedDBPersistence } from '@agentix-e/log-parser-browser';
import { LogParserPipeline } from '@agentix-e/log-parser-core';

// IndexedDBPersistence implements the drain-ts PersistenceHandler interface
const persistence = new IndexedDBPersistence();
await persistence.init();

// Use with DrainDataPlane for persistent template state
const pipeline = new LogParserPipeline({
  drain: { persistence },
});

// Parse logs as usual -- state is automatically persisted
pipeline.parse('ERROR Connection refused on port 5432');

// After a page reload, previous templates are restored from IndexedDB
```

### Web Worker Offloading

```typescript
import { WebWorkerPipeline } from '@agentix-e/log-parser-browser';

// Create a worker that imports log-parser-core
const worker = new Worker(new URL('./log-parser.worker.ts', import.meta.url), {
  type: 'module',
});

const workerPipeline = new WebWorkerPipeline(worker);

// Parse a batch without blocking the UI thread
const results = await workerPipeline.parse([
  'ERROR Connection refused on port 5432',
  'ERROR Connection refused on port 8080',
  'WARN Disk usage at 85%',
]);

// When done
workerPipeline.terminate();
```

The worker file (`log-parser.worker.ts`) should handle messages:

```typescript
import { LogParserPipeline } from '@agentix-e/log-parser-core';

const pipeline = new LogParserPipeline();

self.addEventListener('message', (event) => {
  if (event.data.type === 'parse') {
    const results = pipeline.parseBatch(event.data.lines);
    self.postMessage(results);
  }
});
```

## API Reference

### `BrowserFileAdapter`

| Method | Description |
|--------|-------------|
| `fromFileList(files: FileList)` | Read log lines from a file input's `FileList`. Returns a Promise with the adapter. |
| `fromDragEvent(event: DragEvent)` | Read log lines from a `drop` event's `dataTransfer.files`. |
| `fromFetch(url: string, init?: RequestInit)` | Fetch and parse a log file from a URL. Throws on non-2xx responses. |
| `getLines()` | Returns all parsed lines as `string[]`. |
| `count()` | Returns the total number of lines. |

### `IndexedDBPersistence`

Implements `PersistenceHandler` from `@agentix-e/drain-ts`. Stores Drain state snapshots in the browser's IndexedDB.

| Method | Description |
|--------|-------------|
| `init()` | Open or create the IndexedDB database. Must be called before `saveState()` / `loadState()`. |
| `saveState(state: Uint8Array)` | Persist a serialized Drain snapshot. |
| `loadState()` | Retrieve the previously persisted snapshot, or `null`. |
| `isInitialized()` | Returns `true` if the database is ready. |

### `WebWorkerPipeline`

| Method | Description |
|--------|-------------|
| `new WebWorkerPipeline(worker: Worker)` | Wrap a Web Worker for offloading log parsing. |
| `parse(lines: string[])` | Send batch to the worker, returns parsed templates as `Promise`. |
| `terminate()` | Terminate the underlying Web Worker and release resources. |

## Related Packages

| Package | Purpose |
|---------|---------|
| `@agentix-e/log-parser-core` | Core parsing engine (required) |
| `@agentix-e/log-parser-webllm` | Browser-local LLM using WebGPU -- zero server, zero API key |
| `@agentix-e/log-parser-llm` | Cloud LLM provider (use browser's `fetch()`-based providers) |

## License

MIT
