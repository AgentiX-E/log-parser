import type { GroundTruthEntry as EvaluatorGroundTruthEntry } from '../evaluation/Evaluator.js';

export const DATASET_NAMES = [
  'Android',
  'Apache',
  'BGL',
  'Hadoop',
  'HDFS',
  'HealthApp',
  'HPC',
  'Linux',
  'Mac',
  'OpenSSH',
  'OpenStack',
  'Proxifier',
  'Spark',
  'Thunderbird',
  'Windows',
  'Zookeeper',
] as const;

export type DatasetName = (typeof DATASET_NAMES)[number];

/** A loaded benchmark dataset with logs and ground truth templates. */
export interface BenchmarkDataset {
  readonly name: string;
  readonly logs: readonly string[];
  readonly groundTruth: readonly EvaluatorGroundTruthEntry[];
}

/**
 * LogHub-2k dataset loader.
 *
 * Loads structured log parsing benchmark datasets in standard CSV format.
 * Each row: lineId,logContent,eventTemplate,eventId
 *
 * References:
 * - Loghub-2.0: https://github.com/logpai/Loghub-2.0 (ISSTA 2024)
 * - Loghub-2k: sampled 2,000 logs per dataset from 16 systems
 */
export class DatasetLoader {
  /** List all 16 available dataset names. */
  static listDatasets(): readonly DatasetName[] {
    return DATASET_NAMES;
  }

  /**
   * Parse a LogHub-2k CSV string into a BenchmarkDataset.
   * Platform-agnostic — works in Node.js and Browser.
   *
   * CSV format: lineId,logContent,eventTemplate,eventId
   */
  static parseCSV(csvContent: string, name: string): BenchmarkDataset {
    const lines = csvContent.trim().split('\n');
    const header = lines[0] ?? '';
    const skipHeader = header.includes('eventId') || header.includes('EventId');
    const dataLines = skipHeader ? lines.slice(1) : lines;

    const logs: string[] = [];
    const groundTruth: EvaluatorGroundTruthEntry[] = [];

    for (const line of dataLines) {
      const fields = line.split(',');
      if (fields.length < 2) continue;
      const logId = fields[0]?.trim() ?? '';
      const logContent = (fields.slice(1, -2).join(',').trim() || fields[1]?.trim()) ?? '';
      const eventTemplate = fields[fields.length - 2]?.trim() ?? '';
      const eventId = fields[fields.length - 1]?.trim() ?? '';

      if (logContent) {
        logs.push(logContent);
        groundTruth.push({ logId, template: eventTemplate, eventId });
      }
    }

    return { name, logs, groundTruth };
  }
}
