#!/usr/bin/env node
/**
 * Benchmark comparison report generator.
 * Runs drain-first mode on LogHub-2k test fixtures and compares
 * against published competitor results.
 */
import { LogParserPipeline } from '@agentix-e/log-parser-core';
import {
  Evaluator,
  type ParsedLogEntry,
  type GroundTruthEntry,
} from '@agentix-e/log-parser-core';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

interface LogHubRow {
  lineId: string;
  logContent: string;
  eventTemplate: string;
  eventId: string;
}

async function main(): Promise<void> {
  console.log('# Log Parser Benchmark Report\n');
  console.log(`Generated: ${new Date().toISOString()}\n`);

  const fixtureDir = resolve(
    import.meta.dirname,
    '../packages/log-parser-core/tests/fixtures',
  );
  const fixturePath = resolve(fixtureDir, 'loghub-2k-sample.csv');

  if (!existsSync(fixturePath)) {
    console.log('No LogHub-2k test fixtures found. Skipping benchmark.\n');
    console.log('## Published Competitor Results (Reference)\n');
    console.log('| Tool | Avg GA | Avg PA | Notes |');
    console.log('|------|--------|--------|-------|');
    console.log('| Drain3 | 0.84 | 0.47 | 16 datasets, ISSTA 2024 |');
    console.log('| LogBatcher | 0.97 | — | 16 datasets, ASE 2024 |');
    console.log('| OpenLogParser | 0.87 | 0.85 | 14 datasets, arXiv 2024 |');
    console.log('| DivLog | — | 0.98 | 16 datasets, ICSE 2024 (with labels) |');
    return;
  }

  const content = readFileSync(fixturePath, 'utf-8');
  const rows: LogHubRow[] = content
    .split('\n')
    .filter((l) => l.trim())
    .slice(1) // skip header
    .map((line) => {
      const parts = line.split(',');
      return {
        lineId: parts[0]?.trim() ?? '',
        logContent: parts[1]?.trim() ?? '',
        eventTemplate: parts[2]?.trim() ?? '',
        eventId: parts[3]?.trim() ?? '',
      };
    });

  if (rows.length === 0) {
    console.log('Empty fixture file.\n');
    return;
  }

  const pipeline = new LogParserPipeline();
  const evaluator = new Evaluator();

  const start = Date.now();
  const parsed: ParsedLogEntry[] = rows.map((row, i) => {
    const result = pipeline.parse(row.logContent);
    return {
      logId: String(i),
      template: result.template,
      eventId: String(result.templateId),
    };
  });
  const elapsed = Date.now() - start;

  const gt: GroundTruthEntry[] = rows.map((row, i) => ({
    logId: String(i),
    template: row.eventTemplate,
    eventId: row.eventId,
  }));

  const result = evaluator.evaluate(parsed, gt);

  console.log('| Dataset | Logs | GA | PA | PTA | RTA | FTA | NED | Templates | Time |');
  console.log('|---------|------|----|----|-----|-----|-----|-----|-----------|------|');
  console.log(
    `| LogHub-2k sample | ${rows.length} | ${(result.ga * 100).toFixed(1)}% | ${(result.pa * 100).toFixed(1)}% | ${(result.pta * 100).toFixed(1)}% | ${(result.rta * 100).toFixed(1)}% | ${(result.fta * 100).toFixed(1)}% | ${result.ned.toFixed(4)} | ${pipeline.stats.templateCount} | ${elapsed}ms |`,
  );

  console.log('\n## Published Competitor Results (Reference)\n');
  console.log('| Tool | Avg GA | Avg PA | Notes |');
  console.log('|------|--------|--------|-------|');
  console.log('| Drain3 | 0.84 | 0.47 | 16 datasets, ISSTA 2024 |');
  console.log('| LogBatcher | 0.97 | — | 16 datasets, ASE 2024 |');
  console.log('| OpenLogParser | 0.87 | 0.85 | 14 datasets, arXiv 2024 |');
  console.log('| DivLog | — | 0.98 | 16 datasets, ICSE 2024 (with labels) |');
  console.log('| **log-parser** | — | — | **This report** |');
}

main().catch(console.error);
