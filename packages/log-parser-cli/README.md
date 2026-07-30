# @agentix-e/log-parser-cli

> Command-line interface for the log-parser framework -- parse logs from files, stdin, or remote sources with Commander.

[![npm](https://img.shields.io/npm/v/@agentix-e/log-parser-cli?color=blue)](https://www.npmjs.com/package/@agentix-e/log-parser-cli)
[![License](https://img.shields.io/badge/license-MIT-blue)](https://github.com/AgentiX-E/log-parser/blob/main/LICENSE)

## Overview

`@agentix-e/log-parser-cli` provides the `log-parser` command-line tool for quick, one-shot log parsing from the terminal. Built on Commander, it wraps `LogParserPipeline` (core) and `NodeStreamAdapter` (node) to stream large files line-by-line and output parsed templates as JSON.

Supports multiple log format adapters: Syslog (RFC 5424/3164), Apache Common/Combined, JSON, and auto-detection.

## Installation

```bash
# Global install
npm install -g @agentix-e/log-parser-cli @agentix-e/log-parser-core @agentix-e/log-parser-node commander

# Or run directly with npx
npx @agentix-e/log-parser-cli parse -i /var/log/syslog

# As a project dependency
npm install @agentix-e/log-parser-cli
```

## Quick Start

### Parse a Log File

```bash
log-parser parse -i /var/log/nginx/access.log

# Output (one JSON per line):
# {"logId":1,"template":"<IP> - - [<TIMESTAMP>] \"<*> /<PATH> HTTP/1.1\" <NUM> <NUM>","source":"drain"}
# {"logId":2,"template":"<IP> - - [<TIMESTAMP>] \"<*> /<PATH> HTTP/1.1\" <NUM> <NUM>","source":"drain"}
```

### Parse with a Specific Adapter

```bash
# Syslog format
log-parser parse -i /var/log/syslog -a syslog

# Apache access log format
log-parser parse -i /var/log/apache2/access.log -a apache

# JSON log format
log-parser parse -i /var/log/app.json -a json

# Auto-detection (default)
log-parser parse -i /var/log/messages -a auto
```

### Pipe from stdin

```bash
# Pipe logs from another command
cat /var/log/syslog | while IFS= read -r line; do
  echo "$line" | log-parser parse -i /dev/stdin
done

# Or use the streaming adapter programmatically via NodeStreamAdapter
```

### Show Parsing Statistics

```bash
log-parser stats -i /var/log/nginx/access.log

# Output:
# {
#   "totalProcessed": 1250000,
#   "templateCount": 47,
#   "missCount": 0,
#   "llmCallCount": 0,
#   "uptime": 234
# }
```

### Help and Version

```bash
log-parser --help

# Commands:
#   parse     Parse log messages
#   stats     Show parsing statistics
#   help      Display help for command

log-parser parse --help

# Options:
#   -i, --input <file>     Input log file path (required)
#   -a, --adapter <type>   Log format adapter (syslog, apache, json, auto) (default: "auto")

log-parser --version
# 0.1.0
```

## Programmatic Usage

You can also use the CLI as a library to embed log-parser commands in your own CLI tools:

```typescript
import { createCLI } from '@agentix-e/log-parser-cli';

const program = createCLI();

// Add custom commands
program
  .command('custom-parse')
  .option('-o, --output <format>', 'Output format (json, csv)', 'json')
  .action(async (opts) => {
    // Your custom logic here
  });

program.parse(process.argv);
```

## Adapter Reference

| Adapter | Flag | Description |
|---------|------|-------------|
| `syslog` | `-a syslog` | Parses RFC 5424/3164 syslog messages. Extracts timestamp, hostname, facility, severity. |
| `apache` | `-a apache` | Parses Apache Common and Combined log format. Handles quoted fields, user agents. |
| `json` | `-a json` | Parses JSON log lines. Extracts the `message` field for template extraction. |
| `auto` | `-a auto` | Auto-detects the format per line. Falls back to raw line content on unrecognized formats. |

## API Reference

### `createCLI()`

Returns a Commander `Command` instance with `parse` and `stats` subcommands registered.

```typescript
import { createCLI } from '@agentix-e/log-parser-cli';

const program = createCLI();
program.parse(process.argv);
```

The returned `Command` is a standard Commander program -- you can add additional subcommands, modify descriptions, or integrate into a larger CLI.

## Related Packages

| Package | Purpose |
|---------|---------|
| `@agentix-e/log-parser-core` | Core parsing engine (required) |
| `@agentix-e/log-parser-node` | Node.js I/O adapters used by the CLI for file streaming |
| `@agentix-e/log-parser-server` | REST API alternative for long-running services |
| `@agentix-e/log-parser-llm` | Add LLM enhancement when using programmatic API |

## License

MIT
