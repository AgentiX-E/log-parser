#!/usr/bin/env node
/**
 * Real DeepSeek LLM benchmark on log parsing datasets.
 *
 * Measures GA/PA/PTA/RTA/FTA/NED with actual LLM-enhanced parsing
 * and compares drain-only vs LLM-enhanced modes.
 *
 * Usage:
 *   DEEPSEEK_API_KEY=sk-xxx node benchmark/deepseek-benchmark.ts
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any;

async function main(): Promise<void> {
  const API_KEY = process.env['DEEPSEEK_API_KEY'];
  if (!API_KEY) {
    console.error('Set DEEPSEEK_API_KEY environment variable');
    process.exit(1);
  }

  const {
    LogParserPipeline,
    Evaluator,
  } = await import('@agentix-e/log-parser-core');
  const { OpenAICompatibleProvider } = await import('@agentix-e/log-parser-llm');

  const llm = new OpenAICompatibleProvider({
    provider: 'deepseek',
    model: 'deepseek-chat',
    apiKey: API_KEY,
    baseURL: 'https://api.deepseek.com/v1',
  });

  const datasets: Array<{
    name: string;
    logs: string[];
    groundTruth: AnyObj[];
  }> = [
    {
      name: 'SSH',
      logs: [
        'Accepted password for root from 192.168.1.1 port 22 ssh2',
        'Accepted password for admin from 10.0.0.1 port 22 ssh2',
        'Failed password for root from 172.16.0.1 port 22 ssh2',
        'Failed password for admin from 8.8.8.8 port 22 ssh2',
      ],
      groundTruth: [
        { logId: '0', eventId: 'E1', template: 'Accepted password for <*> from <IP> port 22 ssh2' },
        { logId: '1', eventId: 'E1', template: 'Accepted password for <*> from <IP> port 22 ssh2' },
        { logId: '2', eventId: 'E2', template: 'Failed password for <*> from <IP> port 22 ssh2' },
        { logId: '3', eventId: 'E2', template: 'Failed password for <*> from <IP> port 22 ssh2' },
      ],
    },
    {
      name: 'WebServer',
      logs: [
        '192.168.1.1 - - [01/Jan/2024:10:00:00 +0000] "GET /api/users HTTP/1.1" 200 1234',
        '10.0.0.1 - - [01/Jan/2024:10:00:01 +0000] "GET /api/users HTTP/1.1" 200 5678',
        '172.16.0.1 - - [01/Jan/2024:10:00:02 +0000] "POST /api/login HTTP/1.1" 401 89',
        '8.8.8.8 - - [01/Jan/2024:10:00:03 +0000] "POST /api/login HTTP/1.1" 401 45',
      ],
      groundTruth: [
        { logId: '0', eventId: 'E3', template: '<IP> - - [<TIMESTAMP>] "GET <PATH> HTTP/1.1" 200 <NUM>' },
        { logId: '1', eventId: 'E3', template: '<IP> - - [<TIMESTAMP>] "GET <PATH> HTTP/1.1" 200 <NUM>' },
        { logId: '2', eventId: 'E4', template: '<IP> - - [<TIMESTAMP>] "POST <PATH> HTTP/1.1" 401 <NUM>' },
        { logId: '3', eventId: 'E4', template: '<IP> - - [<TIMESTAMP>] "POST <PATH> HTTP/1.1" 401 <NUM>' },
      ],
    },
    {
      name: 'AppError',
      logs: [
        'ERROR connection to db-primary.local failed after 3 retries',
        'ERROR connection to cache-02.cluster failed after 5 retries',
        'WARN memory usage on node-01 exceeded 85 percent',
        'WARN memory usage on node-02 exceeded 92 percent',
      ],
      groundTruth: [
        { logId: '0', eventId: 'E5', template: 'ERROR connection to <HOSTNAME> failed after <NUM> retries' },
        { logId: '1', eventId: 'E5', template: 'ERROR connection to <HOSTNAME> failed after <NUM> retries' },
        { logId: '2', eventId: 'E6', template: 'WARN memory usage on <*> exceeded <NUM> percent' },
        { logId: '3', eventId: 'E6', template: 'WARN memory usage on <*> exceeded <NUM> percent' },
      ],
    },
  ];

  console.log('=== Log-Parser DeepSeek LLM Benchmark ===\n');
  const evaluator = new Evaluator();
  const summary: AnyObj[] = [];

  for (const ds of datasets) {
    console.log(`Dataset: ${ds.name} (${ds.logs.length} logs)`);

    // ── Drain-only mode ──
    const drainPipe = new LogParserPipeline();
    const drainStart = Date.now();
    for (const log of ds.logs) {
      drainPipe.parse(log);
    }
    const drainElapsed = (Date.now() - drainStart) / 1000;
    const drainParsed = ds.logs.map((log, i) => {
      const r = drainPipe.parse(log);
      return { logId: String(i), template: r.template, eventId: String(r.templateId) };
    });
    const drainResult = evaluator.evaluate(drainParsed, ds.groundTruth);
    console.log(`  [Drain-only] GA: ${(drainResult.ga * 100).toFixed(1)}%  PA: ${(drainResult.pa * 100).toFixed(1)}%  FTA: ${(drainResult.fta * 100).toFixed(1)}%  (${drainElapsed.toFixed(2)}s)`);

    // ── LLM-enhanced mode ──
    const llmPipe = new LogParserPipeline({ llmProvider: llm });
    const llmStart = Date.now();
    for (const log of ds.logs) {
      llmPipe.parse(log);
    }
    // Allow async batch processing to complete
    await new Promise((r) => setTimeout(r, 2000));
    const llmElapsed = (Date.now() - llmStart) / 1000;
    const llmParsed = ds.logs.map((log, i) => {
      const r = llmPipe.parse(log);
      return { logId: String(i), template: r.template, eventId: String(r.templateId) };
    });
    const llmResult = evaluator.evaluate(llmParsed, ds.groundTruth);
    console.log(`  [LLM-enhanced] GA: ${(llmResult.ga * 100).toFixed(1)}%  PA: ${(llmResult.pa * 100).toFixed(1)}%  FTA: ${(llmResult.fta * 100).toFixed(1)}%  (${llmElapsed.toFixed(2)}s)`);
    console.log(`  LLM calls: ${llmPipe.stats.llmCalls}  Tokens: ${llmPipe.stats.llmTokensConsumed}\n`);

    summary.push({
      Dataset: ds.name,
      'Drain GA': (drainResult.ga * 100).toFixed(1) + '%',
      'Drain PA': (drainResult.pa * 100).toFixed(1) + '%',
      'LLM GA': (llmResult.ga * 100).toFixed(1) + '%',
      'LLM PA': (llmResult.pa * 100).toFixed(1) + '%',
      'LLM Calls': llmPipe.stats.llmCalls,
    });
  }

  console.log('=== Summary ===');
  console.table(summary);
}

main().catch(console.error);
