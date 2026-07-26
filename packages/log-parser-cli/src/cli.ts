import { Command } from 'commander';
import {
  LogParserPipeline,
  SyslogAdapter,
  ApacheAdapter,
  JsonLogAdapter,
  AutoDetectAdapter,
  type LogInputAdapter,
} from '@agentix-e/log-parser-core';
import { NodeStreamAdapter } from '@agentix-e/log-parser-node';

/** Resolve an adapter name to an adapter instance. */
function resolveAdapter(type: string): LogInputAdapter {
  switch (type.toLowerCase()) {
    case 'syslog':
      return new SyslogAdapter();
    case 'apache':
      return new ApacheAdapter();
    case 'json':
      return new JsonLogAdapter();
    default:
      return new AutoDetectAdapter();
  }
}

/**
 * Create the Commander CLI program for log parsing.
 */
export function createCLI(): Command {
  const program = new Command();

  program.name('log-parser').description('Intelligent log parsing engine').version('0.1.0');

  program
    .command('parse')
    .description('Parse log messages')
    .requiredOption('-i, --input <file>', 'Input log file path')
    .option('-a, --adapter <type>', 'Log format adapter (syslog, apache, json, auto)', 'auto')
    .action(async (opts: { input: string; adapter: string }) => {
      const adapter = resolveAdapter(opts.adapter);
      const pipeline = new LogParserPipeline({ adapter });
      for await (const line of NodeStreamAdapter.fromFile(opts.input)) {
        const content = adapter.extractContent(line);
        const result = pipeline.parse(content);
        console.log(
          JSON.stringify({
            logId: result.logId,
            template: result.template,
            source: result.source,
          }),
        );
      }
    });

  program
    .command('stats')
    .description('Show parsing statistics')
    .requiredOption('-i, --input <file>', 'Input log file path')
    .action(async (opts: { input: string }) => {
      const pipeline = new LogParserPipeline();
      for await (const line of NodeStreamAdapter.fromFile(opts.input)) {
        pipeline.parse(line);
      }
      console.log(JSON.stringify(pipeline.stats, null, 2));
    });

  return program;
}
