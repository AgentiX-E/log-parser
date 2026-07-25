import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const DATASET_NAMES = [
  'Android', 'Apache', 'BGL', 'Hadoop', 'HDFS', 'HealthApp', 'HPC',
  'Linux', 'Mac', 'OpenSSH', 'OpenStack', 'Proxifier', 'Spark',
  'Thunderbird', 'Windows', 'Zookeeper',
] as const;

export type DatasetName = (typeof DATASET_NAMES)[number];

/** Ground truth entry from a benchmark dataset. */
export interface GroundTruthEntry {
  readonly logId: string;
  readonly template: string;
  readonly eventId: string;
}

/** A loaded benchmark dataset with logs and ground truth templates. */
export interface BenchmarkDataset {
  readonly name: string;
  readonly logs: readonly string[];
  readonly groundTruth: readonly GroundTruthEntry[];
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
  constructor(private readonly cacheDir?: string) {}

  /** List all 16 available dataset names. */
  static listDatasets(): readonly DatasetName[] {
    return DATASET_NAMES;
  }

  /**
   * Load a single dataset synchronously.
   *
   * First checks the local fixture directory, then the optional cache directory.
   * Throws if the dataset file is not found.
   */
  loadSync(name: DatasetName): BenchmarkDataset {
    const fixturePath = join(
      __dirname, '..', '..', 'tests', 'fixtures',
      `loghub-2k-${name.toLowerCase()}.csv`,
    );
    let loadPath = fixturePath;
    if (!existsSync(fixturePath) && this.cacheDir) {
      loadPath = join(this.cacheDir, `loghub-2k-${name}.csv`);
    }
    if (!existsSync(loadPath)) {
      throw new Error(
        `Dataset "${name}" not found at ${fixturePath}. ` +
        'Download from https://github.com/logpai/Loghub-2.0',
      );
    }
    return this.parseFile(loadPath, name);
  }

  /**
   * Load all 16 LogHub-2k datasets synchronously.
   * Skips datasets whose fixture files are not found.
   */
  loadAllSync(): BenchmarkDataset[] {
    const results: BenchmarkDataset[] = [];
    for (const name of DATASET_NAMES) {
      try {
        results.push(this.loadSync(name));
      } catch {
        // Skip unavailable datasets
      }
    }
    return results;
  }

  /** Parse a LogHub-2k CSV file into a BenchmarkDataset. */
  private parseFile(filePath: string, name: string): BenchmarkDataset {
    const raw = readFileSync(filePath, 'utf-8');
    const lines = raw.trim().split('\n');
    const header = lines[0] ?? '';
    const skipHeader = header.includes('eventId') || header.includes('EventId');
    const dataLines = skipHeader ? lines.slice(1) : lines;

    const logs: string[] = [];
    const groundTruth: GroundTruthEntry[] = [];

    for (const line of dataLines) {
      if (!line.trim()) continue;
      const parts = this.parseCSVLine(line);
      if (parts.length < 4) continue;
      logs.push(parts[1]!);
      groundTruth.push({
        logId: parts[0]!,
        template: parts[2]!,
        eventId: parts[3]!,
      });
    }

    return { name, logs, groundTruth };
  }

  /**
   * Simple CSV parser that handles quoted fields containing commas.
   * Does NOT handle escaped quotes within quoted fields.
   */
  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    result.push(current.trim());
    return result;
  }
}
