import type { LogParserPipeline } from '../pipeline/LogParserPipeline.js';
import { Evaluator } from './Evaluator.js';
import type { ParsedLogEntry, GroundTruthEntry, ParsingEvaluationResult } from './Evaluator.js';

export interface BenchmarkDataset {
  readonly name: string;
  readonly logs: readonly string[];
  readonly groundTruth: readonly GroundTruthEntry[];
}

/**
 * Automated benchmark runner.
 *
 * Runs a LogParserPipeline against one or more benchmark datasets
 * and returns standard LogPAI evaluation metrics.
 */
export class BenchmarkRunner {
  private readonly evaluator = new Evaluator();

  run(pipeline: LogParserPipeline, dataset: BenchmarkDataset): ParsingEvaluationResult {
    const parsed: ParsedLogEntry[] = dataset.logs.map((log) => {
      const result = pipeline.parse(log);
      return {
        logId: result.logId,
        template: result.template,
        eventId: String(result.templateId),
      };
    });

    return this.evaluator.evaluate(parsed, dataset.groundTruth);
  }

  runAll(
    pipeline: LogParserPipeline,
    datasets: readonly BenchmarkDataset[],
  ): ReadonlyMap<string, ParsingEvaluationResult> {
    const results = new Map<string, ParsingEvaluationResult>();
    for (const ds of datasets) {
      results.set(ds.name, this.run(pipeline, ds));
    }
    return results;
  }
}
