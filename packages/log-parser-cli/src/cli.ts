import { Command } from 'commander';
import { LogParserPipeline } from '@agentix-e/log-parser-core';
import { NodeStreamAdapter } from '@agentix-e/log-parser-node';

/**
 * Create the Commander CLI program for log parsing.
 *
 * Commands:
 * - parse: Parse log messages from a file
 * - stats: Show parsing statistics from a file
 */
export function createCLI(): Command {
  const program = new Command();

  program.name('log-parser').description('Intelligent log parsing engine').version('0.1.0');

  program
    .command('parse')
    .description('Parse log messages')
    .requiredOption('-i, --input <file>', 'Input log file path')
    .option('-a, --adapter <type>', 'Log format adapter', 'auto')
    .action(async (opts: { input: string; adapter: string }) => {
      const pipeline = new LogParserPipeline();
      for await (const line of NodeStreamAdapter.fromFile(opts.input)) {
        const result = pipeline.parse(line);
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
