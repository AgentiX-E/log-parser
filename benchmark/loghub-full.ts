#!/usr/bin/env node
/**
 * LogHub-2.0 Full benchmark — production-scale validation.
 *
 * Runs drain-ts on full-size LogHub datasets (up to 16M logs each).
 * Uses compact evaluation for memory efficiency and streaming CSV parsing
 * to avoid OOM on large datasets.
 *
 * Dataset source: Zenodo (https://zenodo.org/record/8275861)
 * Full datasets are in loghub-2.0/full_dataset/ format.
 *
 * Usage:
 *   npx tsx benchmark/loghub-full.ts [--dataset HDFS]
 *   npx tsx benchmark/loghub-full.ts --all
 *   npx tsx benchmark/loghub-full.ts --data-dir ./loghub-data
 */

import * as http from 'node:http';
import * as https from 'node:https';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { TemplateMiner, TemplateMinerConfig } from '@agentix-e/drain-ts';
import { EXTENDED_MASKING_INSTRUCTIONS } from '@agentix-e/drain-ts';

// Catch unhandled exceptions for debugging
process.on('uncaughtException', (err) => {
  process.stderr.write(`[UNCAUGHT] ${err.message}\n${err.stack}\n`);
  process.exit(1);
});

// ============================================================
// Dataset definitions (full datasets from LogHub-2.0 Zenodo)
// ============================================================

interface FullDatasetDescriptor {
  name: string;
  /** Zenodo zip URL containing .log and .log_structured.csv */
  zipUrl: string;
  category: string;
  targetGA: number;
  targetPTA: number;
  /** Additional dataset size info for progress display. */
  approximateSize: string;
  /** Approximate log count. */
  approximateCount: string;
  /** Extra delimiters for tokenization. */
  drainExtraDelimiters?: readonly string[];
  /** Disable extended masking (use parametrizeNumericTokens only). */
  disableMasking?: boolean;
  /** Enable AdjacentConstantFusion for token-level normalization. */
  enableAdjacentFusion?: boolean;
  /** Regex collapse patterns for pre-fusion token normalization. */
  regexCollapsePatterns?: ReadonlyArray<{
    readonly regex: RegExp;
    readonly replacement: string;
  }>;
  /** Enable post-training cluster merge. */
  enableClusterMerge?: boolean;
  /** Cluster merge percent threshold. */
  clusterMergePercent?: number;
  /** Enable AEL-style diff-ratio similarity. */
  enableAELSimilarity?: boolean;
  /** Maximum diff ratio for AEL similarity. */
  maxDiffRatio?: number;
}

/**
 * LogHub-2.0 full datasets — all 14 official benchmarks.
 *
 * Full dataset URLs point to the LogHub-2.0 Zenodo repository
 * (https://zenodo.org/records/8275861).
 */
const FULL_DATASETS: FullDatasetDescriptor[] = [
  // ===================== Distributed Systems =====================
  {
    name: 'HDFS',
    zipUrl: 'https://zenodo.org/records/8275861/files/HDFS.zip?download=1',
    category: 'Distributed Systems',
    targetGA: 0.99,
    targetPTA: 0.70,
    approximateSize: '1.5 GB',
    approximateCount: '11M',
  },
  {
    name: 'Hadoop',
    zipUrl: 'https://zenodo.org/records/8275861/files/Hadoop.zip?download=1',
    category: 'Distributed Systems',
    targetGA: 0.94,
    targetPTA: 0.74,
    approximateSize: '230 MB',
    approximateCount: '1.6M',
  },
  {
    name: 'Spark',
    zipUrl: 'https://zenodo.org/records/8275861/files/Spark.zip?download=1',
    category: 'Distributed Systems',
    targetGA: 0.91,
    targetPTA: 0.70,
    approximateSize: '2.4 GB',
    approximateCount: '16M',
  },
  {
    name: 'OpenStack',
    zipUrl: 'https://zenodo.org/records/8275861/files/OpenStack.zip?download=1',
    category: 'Distributed Systems',
    targetGA: 0.85,
    targetPTA: 0.67,
    approximateSize: '58 MB',
    approximateCount: '207K',
    disableMasking: true,
  },
  {
    name: 'Zookeeper',
    zipUrl: 'https://zenodo.org/records/8275861/files/Zookeeper.zip?download=1',
    category: 'Distributed Systems',
    targetGA: 0.98,
    targetPTA: 0.75,
    approximateSize: '9.9 MB',
    approximateCount: '74K',
  },
  // ===================== Supercomputers =====================
  {
    name: 'BGL',
    zipUrl: 'https://zenodo.org/records/8275861/files/BGL.zip?download=1',
    category: 'Supercomputers',
    targetGA: 0.96,
    targetPTA: 0.76,
    approximateSize: '700 MB',
    approximateCount: '4.6M',
  },
  {
    name: 'HPC',
    zipUrl: 'https://zenodo.org/records/8275861/files/HPC.zip?download=1',
    category: 'Supercomputers',
    targetGA: 0.93,
    targetPTA: 0.80,
    approximateSize: '32 MB',
    approximateCount: '200K',
  },
  {
    name: 'Thunderbird',
    zipUrl: 'https://zenodo.org/records/8275861/files/Thunderbird.zip?download=1',
    category: 'Supercomputers',
    targetGA: 0.94,
    targetPTA: 0.76,
    approximateSize: '23 GB',
    approximateCount: '211M',
  },
  // ===================== Operating Systems =====================
  {
    name: 'Linux',
    zipUrl: 'https://zenodo.org/records/8275861/files/Linux.zip?download=1',
    category: 'Operating Systems',
    targetGA: 0.75,
    targetPTA: 0.65,
    approximateSize: '2.0 MB',
    approximateCount: '23K',
  },
  {
    name: 'Mac',
    zipUrl: 'https://zenodo.org/records/8275861/files/Mac.zip?download=1',
    category: 'Operating Systems',
    targetGA: 0.85,
    targetPTA: 0.70,
    approximateSize: '16 MB',
    approximateCount: '117K',
  },
  {
    name: 'Windows',
    zipUrl: 'https://zenodo.org/records/8275861/files/Windows.zip?download=1',
    category: 'Operating Systems',
    targetGA: 0.99,
    targetPTA: 0.80,
    approximateSize: '25 GB',
    approximateCount: '114M',
  },
  // ===================== Server Applications =====================
  {
    name: 'Apache',
    zipUrl: 'https://zenodo.org/records/8275861/files/Apache.zip?download=1',
    category: 'Server Applications',
    targetGA: 0.99,
    targetPTA: 0.78,
    approximateSize: '27 MB',
    approximateCount: '270K',
  },
  {
    name: 'OpenSSH',
    zipUrl: 'https://zenodo.org/records/8275861/files/OpenSSH.zip?download=1',
    category: 'Server Applications',
    targetGA: 0.88,
    targetPTA: 0.75,
    approximateSize: '39 MB',
    approximateCount: '310K',
  },
  // ===================== Mobile Systems =====================
  {
    name: 'Android',
    zipUrl: 'https://zenodo.org/records/8275861/files/Android.zip?download=1',
    category: 'Mobile Systems',
    targetGA: 0.90,
    targetPTA: 0.66,
    approximateSize: '158 MB',
    approximateCount: '1.2M',
  },
  {
    name: 'HealthApp',
    zipUrl: 'https://zenodo.org/records/8275861/files/HealthApp.zip?download=1',
    category: 'Mobile Systems',
    targetGA: 0.85,
    targetPTA: 0.70,
    approximateSize: '6.3 MB',
    approximateCount: '55K',
  },
  // ===================== Security =====================
  {
    name: 'Proxifier',
    zipUrl: 'https://zenodo.org/records/8275861/files/Proxifier.zip?download=1',
    category: 'Security',
    targetGA: 0.95,
    targetPTA: 0.70,
    approximateSize: '380 kB',
    approximateCount: '2K',
  },
];

// ============================================================
// RFC 4180 CSV parsing
// ============================================================

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '',
    inQuotes = false,
    wasQuoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
          wasQuoted = true;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      inQuotes = true;
      wasQuoted = false;
    } else if (ch === ',') {
      fields.push(wasQuoted ? field : field.trim());
      field = '';
      wasQuoted = false;
    } else if (ch === ' ' && (field === '' || wasQuoted)) {
      continue;
    } else {
      field += ch;
    }
  }
  fields.push(wasQuoted ? field : field.trim());
  return fields;
}

interface CsvHeaderInfo {
  columns: string[];
  contentIdx: number;
  eventTemplateIdx: number;
  totalCols: number;
}

function analyzeHeader(headerLine: string): CsvHeaderInfo {
  const columns = parseCsvLine(headerLine);
  const totalCols = columns.length;
  const contentIdx = columns.indexOf('Content');
  const eventTemplateIdx = totalCols - 1;
  return { columns, contentIdx, eventTemplateIdx, totalCols };
}

function parseCsvRow(line: string, header: CsvHeaderInfo): string[] {
  const fields = parseCsvLine(line);
  const { totalCols, contentIdx } = header;
  if (fields.length === totalCols) return fields;
  if (fields.length < totalCols) {
    const result = [...fields];
    while (result.length < totalCols) result.push('');
    return result;
  }
  // Too many columns: embedded commas in Content field — merge them back
  const trailingColCount = totalCols - contentIdx - 1;
  const contentEndIdx = fields.length - trailingColCount;
  const contentFragments = fields.slice(contentIdx, contentEndIdx);
  return [
    ...fields.slice(0, contentIdx),
    contentFragments.join(','),
    ...fields.slice(contentEndIdx),
  ];
}

// ============================================================
// Compact evaluation (memory-efficient for 16M+ datasets)
// ============================================================

/**
 * Returns true if a token is a masked parameter placeholder.
 * Matches tokens like `<*>`, `<IP>`, `<NUM>`, `<BLOCK_ID>`, etc.
 */
function isMaskedToken(token: string): boolean {
  return token.startsWith('<') && token.endsWith('>') && token.length > 2;
}

/** Standard Loghub evaluation metrics. */
interface EvaluationResult {
  groupAccuracy: number;
  f1GroupAccuracy: number;
  parsingTemplateAccuracy: number;
  f1TemplateAccuracy: number;
  totalMessages: number;
  groundTruthTemplateCount: number;
  parserClusterCount: number;
}

/**
 * Computes GA + FGA from compact integer arrays.
 * Identical algorithm to drain-ts benchmark/evaluator.ts.
 */
function computeGroupingAccuracy(
  gtTemplateIds: number[],
  clusterIds: number[],
  totalMessages: number,
): { ga: number; fga: number; gtGroups: number; parsedGroups: number } {
  const gtGroups = new Map<number, Set<number>>();
  const parsedGroups = new Map<number, Set<number>>();

  for (let i = 0; i < totalMessages; i++) {
    const gtId = gtTemplateIds[i]!;
    const pId = clusterIds[i]!;
    if (!gtGroups.has(gtId)) gtGroups.set(gtId, new Set());
    gtGroups.get(gtId)!.add(i);
    if (!parsedGroups.has(pId)) parsedGroups.set(pId, new Set());
    parsedGroups.get(pId)!.add(i);
  }

  let correctMessages = 0;
  let f1PrecisionSum = 0;

  for (const [, gtSet] of gtGroups) {
    let bestOverlap = 0;
    for (const [, pSet] of parsedGroups) {
      let overlap = 0;
      for (const idx of gtSet) {
        if (pSet.has(idx)) overlap++;
      }
      if (overlap > bestOverlap) bestOverlap = overlap;
    }
    correctMessages += bestOverlap;
    f1PrecisionSum += bestOverlap / gtSet.size;
  }

  let f1RecallSum = 0;
  for (const [, pSet] of parsedGroups) {
    let bestOverlap = 0;
    for (const [, gtSet] of gtGroups) {
      let overlap = 0;
      for (const idx of pSet) {
        if (gtSet.has(idx)) overlap++;
      }
      if (overlap > bestOverlap) bestOverlap = overlap;
    }
    f1RecallSum += bestOverlap / pSet.size;
  }

  const ga = correctMessages / totalMessages;
  const avgPrecision = f1PrecisionSum / gtGroups.size;
  const avgRecall = f1RecallSum / parsedGroups.size;
  const fga =
    avgPrecision + avgRecall > 0 ? (2 * avgPrecision * avgRecall) / (avgPrecision + avgRecall) : 0;

  return { ga, fga, gtGroups: gtGroups.size, parsedGroups: parsedGroups.size };
}

/**
 * Computes PTA + FTA from compact arrays.
 * Identical algorithm to drain-ts benchmark/evaluator.ts.
 */
function computeParsingTemplateAccuracy(
  gtTemplateIds: number[],
  clusterIds: number[],
  templateTokensMap: Map<number, string[]>,
  parsedTemplateTokens: Map<number, string[]>,
  totalMessages: number,
): { pta: number; fta: number } {
  if (totalMessages === 0) return { pta: 1.0, fta: 1.0 };

  // Build GT template info
  const gtTemplateToIndices = new Map<number, { indices: Set<number>; tokens: string[] }>();
  for (let i = 0; i < totalMessages; i++) {
    const gtId = gtTemplateIds[i]!;
    if (!gtTemplateToIndices.has(gtId)) {
      gtTemplateToIndices.set(gtId, {
        indices: new Set(),
        tokens: templateTokensMap.get(gtId) ?? [],
      });
    }
    gtTemplateToIndices.get(gtId)!.indices.add(i);
  }

  // Build parsed cluster info
  const parsedClusterToInfo = new Map<number, { indices: Set<number>; tokens: string[] }>();
  for (let i = 0; i < totalMessages; i++) {
    const cId = clusterIds[i]!;
    if (!parsedClusterToInfo.has(cId)) {
      parsedClusterToInfo.set(cId, {
        indices: new Set(),
        tokens: parsedTemplateTokens.get(cId) ?? [],
      });
    }
    parsedClusterToInfo.get(cId)!.indices.add(i);
  }

  let totalCorrectTokens = 0,
    totalTokens = 0,
    f1PrecisionSum = 0,
    f1RecallSum = 0,
    matchedGtCount = 0;

  for (const [, gtInfo] of gtTemplateToIndices) {
    const gtTokens = gtInfo.tokens;
    let bestOverlap = 0;
    let bestParsedTokens: string[] | null = null;

    for (const [, parsedInfo] of parsedClusterToInfo) {
      const parsedTokens = parsedInfo.tokens;
      if (gtTokens.length !== parsedTokens.length) continue;
      let overlap = 0;
      for (let j = 0; j < gtTokens.length; j++) {
        const gtTok = gtTokens[j]!;
        const parsedTok = parsedTokens[j]!;
        if (gtTok === parsedTok || (isMaskedToken(gtTok) && isMaskedToken(parsedTok))) {
          overlap++;
        }
      }
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestParsedTokens = parsedTokens;
      }
    }

    if (bestParsedTokens && gtTokens.length > 0) {
      totalCorrectTokens += bestOverlap;
      totalTokens += gtTokens.length;
      f1PrecisionSum += bestOverlap / bestParsedTokens.length;
      f1RecallSum += bestOverlap / gtTokens.length;
      matchedGtCount++;
    }
  }

  const pta = totalTokens > 0 ? totalCorrectTokens / totalTokens : 0;
  const fta =
    matchedGtCount > 0
      ? (() => {
          const avgP = f1PrecisionSum / matchedGtCount;
          const avgR = f1RecallSum / matchedGtCount;
          return avgP + avgR > 0 ? (2 * avgP * avgR) / (avgP + avgR) : 0;
        })()
      : 0;

  return { pta, fta };
}

function evaluateCompact(
  gtTemplateIds: number[],
  clusterIds: number[],
  templateTokensMap: Map<number, string[]>,
  parsedTemplateTokens: Map<number, string[]>,
  totalMessages: number,
): EvaluationResult {
  const ga = computeGroupingAccuracy(gtTemplateIds, clusterIds, totalMessages);
  const pa = computeParsingTemplateAccuracy(
    gtTemplateIds,
    clusterIds,
    templateTokensMap,
    parsedTemplateTokens,
    totalMessages,
  );
  return {
    groupAccuracy: ga.ga,
    f1GroupAccuracy: ga.fga,
    parsingTemplateAccuracy: pa.pta,
    f1TemplateAccuracy: pa.fta,
    totalMessages,
    groundTruthTemplateCount: ga.gtGroups,
    parserClusterCount: ga.parsedGroups,
  };
}

// ============================================================
// Zip download + extraction (Zenodo now serves .zip archives)
// ============================================================

/**
 * Downloads a zip archive from a URL, extracts it to a temp directory,
 * and returns the path to the extracted .log_structured.csv file.
 * Uses a local cache to avoid re-downloading on repeated runs.
 */
async function downloadAndExtractZip(
  zipUrl: string,
  datasetName: string,
  cacheDir?: string | null,
): Promise<string> {
  // Use a cached directory if available
  const workDir = cacheDir
    ? path.join(cacheDir, datasetName)
    : path.join(os.tmpdir(), `loghub-full-${datasetName}-${Date.now()}`);

  // Check if already extracted
  const csvPattern = /_structured\.csv$/;
  if (fs.existsSync(workDir)) {
    const existing = fs.readdirSync(workDir).find((f) => csvPattern.test(f));
    if (existing) {
      console.log(`  Using cached extraction: ${path.join(workDir, existing)}`);
      return path.join(workDir, existing);
    }
  }

  // Download zip
  const zipPath = path.join(workDir, `${datasetName}.zip`);
  fs.mkdirSync(workDir, { recursive: true });

  if (!fs.existsSync(zipPath)) {
    console.log(`  Downloading ${zipUrl}`);
    const data = await fetchUrlBinary(zipUrl);
    fs.writeFileSync(zipPath, data);
    console.log(`  Downloaded ${(data.length / 1024 / 1024).toFixed(1)}MB`);
  } else {
    console.log(`  Using cached zip: ${zipPath}`);
  }

  // Extract zip
  console.log(`  Extracting ${zipPath}...`);
  try {
    execSync(`unzip -o "${zipPath}" -d "${workDir}"`, { stdio: 'pipe' });
  } catch (e: any) {
    throw new Error(`Failed to unzip ${zipPath}: ${e.message}`);
  }

  // Find the structured CSV file
  const extracted = fs.readdirSync(workDir);
  const csvFile = extracted.find((f) => csvPattern.test(f));
  if (!csvFile) {
    // List extracted files for debugging
    console.error(`  Extracted files: ${extracted.join(', ')}`);
    throw new Error(
      `No _structured.csv found in extracted zip for ${datasetName}`,
    );
  }

  return path.join(workDir, csvFile);
}

/**
 * Downloads binary data from a URL (for zip files).
 */
function fetchUrlBinary(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client
      .get(url, { headers: { 'User-Agent': 'log-parser-benchmark/2.0' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const redirect = res.headers.location;
          if (!redirect) {
            reject(new Error(`Redirect without Location for ${url}`));
            return;
          }
          fetchUrlBinary(redirect).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject);
  });
}

// ============================================================
// Dataset loading (streaming for full datasets)
// ============================================================

interface FullDataset {
  /** Content strings indexed by message position. */
  messages: string[];
  /** GT template ID per message position. */
  gtTemplateIds: number[];
  /** Template tokens per unique GT template ID. */
  templateTokensMap: Map<number, string[]>;
  /** Total message count. */
  totalMessages: number;
}

/**
 * Loads a dataset from a local structured CSV file path.
 * Uses streaming CSV parsing for large datasets.
 */
async function loadDataset(csvPath: string): Promise<FullDataset> {
  const messages: string[] = [];
  const gtTemplateIds: number[] = [];
  const templateTokensMap = new Map<number, string[]>();
  const templateKeyToId = new Map<string, number>();
  let nextId = 1;
  let header: CsvHeaderInfo | null = null;

  const processLine = (line: string) => {
    if (!line.trim()) return;
    if (!header) {
      header = analyzeHeader(line);
      return;
    }
    const cols = parseCsvRow(line, header);
    const content = header.contentIdx >= 0 ? cols[header.contentIdx]! : '';
    const eventTemplate = cols[header.eventTemplateIdx]!;
    const templateTokens =
      eventTemplate.length > 0
        ? eventTemplate.split(/\s+/).filter((t: string) => t.length > 0)
        : [];
    const templateKey = templateTokens.join(' ');

    let tid = templateKeyToId.get(templateKey);
    if (tid === undefined) {
      tid = nextId++;
      templateKeyToId.set(templateKey, tid);
      templateTokensMap.set(tid, templateTokens);
    }

    messages.push(content);
    gtTemplateIds.push(tid);
  };

  // Stream-read the CSV file
  const fileContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = fileContent.split('\n');
  for (const line of lines) {
    processLine(line);
  }

  if (!header) throw new Error(`CSV must have header and data: ${csvPath}`);
  return { messages, gtTemplateIds, templateTokensMap, totalMessages: messages.length };
}

// ============================================================
// Benchmark runner
// ============================================================

interface BenchmarkRow {
  dataset: string;
  category: string;
  totalMessages: number;
  gtTemplates: number;
  parserClusters: number;
  ga: number;
  fga: number;
  pta: number;
  fta: number;
  gaPass: boolean;
  ptaPass: boolean;
  durationMs: number;
  throughputPerSec: number;
}

async function runDataset(
  ds: FullDatasetDescriptor,
  cacheDir?: string | null,
): Promise<BenchmarkRow> {
  // Download zip and extract structured CSV
  const csvPath = await downloadAndExtractZip(ds.zipUrl, ds.name, cacheDir);
  const { messages, gtTemplateIds, templateTokensMap, totalMessages } =
    await loadDataset(csvPath);

  const miner = new TemplateMiner({
    config: TemplateMinerConfig.from({
      simTh: 0.4,
      depth: 4,
      maxChildren: 100,
      maskingInstructions: ds.disableMasking ? [] : [...EXTENDED_MASKING_INSTRUCTIONS],
      ...(ds.drainExtraDelimiters ? { drainExtraDelimiters: [...ds.drainExtraDelimiters] } : {}),
      ...(ds.enableAdjacentFusion !== undefined
        ? { enableAdjacentFusion: ds.enableAdjacentFusion }
        : {}),
      ...(ds.regexCollapsePatterns !== undefined
        ? { regexCollapsePatterns: [...ds.regexCollapsePatterns] }
        : {}),
      ...(ds.enableAELSimilarity !== undefined
        ? { enableAELSimilarity: ds.enableAELSimilarity }
        : {}),
      ...(ds.maxDiffRatio !== undefined ? { maxDiffRatio: ds.maxDiffRatio } : {}),
      ...(ds.enableClusterMerge !== undefined ? { enableClusterMerge: ds.enableClusterMerge } : {}),
      ...(ds.clusterMergePercent !== undefined
        ? { clusterMergePercent: ds.clusterMergePercent }
        : {}),
    }),
  });

  // Train token normalizers on a sample (first 2000 messages)
  const sampleSize = Math.min(2000, messages.length);
  miner.learnTokens(messages.slice(0, sampleSize));

  const startTime = performance.now();

  // Process all messages — store clusterId + templateMined per position
  const clusterIds = new Array<number>(totalMessages);
  const templatesMined = new Array<string>(totalMessages);
  for (let i = 0; i < totalMessages; i++) {
    const result = miner.addLogMessage(messages[i]!);
    clusterIds[i] = result.clusterId;
    templatesMined[i] = result.templateMined;
    if ((i + 1) % 100000 === 0) {
      process.stdout.write(
        `  ${(i + 1).toLocaleString()}/${totalMessages.toLocaleString()} (${(((i + 1) / totalMessages) * 100).toFixed(1)}%)\r`,
      );
    }
  }

  // Apply cluster merge if enabled
  try {
    miner.mergeClusters();
  } catch {
    // mergeClusters may fail if there are no clusters — non-fatal
  }

  const durationMs = performance.now() - startTime;

  // Build parsed template tokens map
  const parsedTemplateTokens = new Map<number, string[]>();
  for (let i = 0; i < totalMessages; i++) {
    const cId = clusterIds[i]!;
    if (!parsedTemplateTokens.has(cId)) {
      parsedTemplateTokens.set(cId, templatesMined[i]!.split(' '));
    }
  }

  // Compact evaluation
  let evalResult: EvaluationResult;
  try {
    evalResult = evaluateCompact(
      gtTemplateIds,
      clusterIds,
      templateTokensMap,
      parsedTemplateTokens,
      totalMessages,
    );
  } catch (e: any) {
    process.stderr.write(`[eval] failed: ${e.message}\n`);
    return {
      dataset: ds.name,
      category: ds.category,
      totalMessages,
      gtTemplates: 0,
      parserClusters: 0,
      ga: 0,
      fga: 0,
      pta: 0,
      fta: 0,
      gaPass: false,
      ptaPass: false,
      durationMs,
      throughputPerSec: 0,
    };
  }

  const throughputPerSec = durationMs > 0 ? Math.round(totalMessages / (durationMs / 1000)) : 0;

  return {
    dataset: ds.name,
    category: ds.category,
    totalMessages: evalResult.totalMessages,
    gtTemplates: evalResult.groundTruthTemplateCount,
    parserClusters: evalResult.parserClusterCount,
    ga: evalResult.groupAccuracy,
    fga: evalResult.f1GroupAccuracy,
    pta: evalResult.parsingTemplateAccuracy,
    fta: evalResult.f1TemplateAccuracy,
    gaPass: evalResult.groupAccuracy >= ds.targetGA,
    ptaPass: evalResult.parsingTemplateAccuracy >= ds.targetPTA,
    durationMs,
    throughputPerSec,
  };
}

// ============================================================
// Result formatting
// ============================================================

function printResults(rows: BenchmarkRow[]): void {
  if (rows.length === 0) return;
  console.log('\n' + '═'.repeat(115));
  console.log(
    `  ${'Dataset'.padEnd(14)} ${'Category'.padEnd(20)} ${'GA'.padStart(8)} ${'FGA'.padStart(8)} ${'PTA'.padStart(8)} ${'FTA'.padStart(8)} ${'GA Pass'.padStart(8)} ${'PTA Pass'.padStart(8)} ${'Time'.padStart(8)} ${'Thruput'.padStart(10)} ${'Messages'.padStart(12)}`,
  );
  console.log('─'.repeat(115));

  let totalGA = 0;
  let gaFailCount = 0;
  let ptaFailCount = 0;

  for (const r of rows) {
    const gaPass = r.gaPass ? '✓' : '✗';
    const ptaPass = r.ptaPass ? '✓' : '✗';
    const timeStr =
      r.durationMs > 60000
        ? `${(r.durationMs / 60000).toFixed(1)}m`
        : `${(r.durationMs / 1000).toFixed(1)}s`;
    const throughputStr =
      r.throughputPerSec >= 1000
        ? `${(r.throughputPerSec / 1000).toFixed(1)}K/s`
        : `${r.throughputPerSec}/s`;
    console.log(
      `  ${r.dataset.padEnd(14)} ${r.category.padEnd(20)} ${r.ga.toFixed(4).padStart(8)} ${r.fga.toFixed(4).padStart(8)} ${r.pta.toFixed(4).padStart(8)} ${r.fta.toFixed(4).padStart(8)} ${gaPass.padStart(8)} ${ptaPass.padStart(8)} ${timeStr.padStart(8)} ${throughputStr.padStart(10)} ${r.totalMessages.toLocaleString().padStart(12)}`,
    );
    totalGA += r.ga;
    if (!r.gaPass) gaFailCount++;
    if (!r.ptaPass) ptaFailCount++;
  }

  console.log('─'.repeat(115));
  console.log(`  AVERAGE${''.padEnd(34)} ${(totalGA / rows.length).toFixed(4).padStart(8)}`);
  console.log('═'.repeat(115));

  const allPass = gaFailCount === 0 && ptaFailCount === 0;
  console.log(
    `\n  Result: ${allPass ? '✅ ALL TARGETS MET' : `❌ ${gaFailCount + ptaFailCount} targets not met`}`,
  );

  // Throughput summary
  const totalLogs = rows.reduce((s, r) => s + r.totalMessages, 0);
  const totalMs = rows.reduce((s, r) => s + r.durationMs, 0);
  const overallTput = totalMs > 0 ? Math.round(totalLogs / (totalMs / 1000)) : 0;
  console.log(
    `  Total: ${totalLogs.toLocaleString()} logs in ${(totalMs / 1000).toFixed(1)}s  |  ${overallTput >= 1000 ? `${(overallTput / 1000).toFixed(1)}K` : overallTput} logs/sec overall`,
  );
}

function printDatasetTable(): void {
  console.log('\nFull Benchmark Datasets (LogHub-2.0 Zenodo):');
  console.log('─'.repeat(80));
  console.log(
    `  ${'Dataset'.padEnd(14)} ${'Category'.padEnd(22)} ${'Logs'.padStart(12)} ${'Size'.padStart(12)} ${'GA Target'.padStart(12)} ${'PTA Target'.padStart(12)}`,
  );
  console.log('─'.repeat(80));
  for (const ds of FULL_DATASETS) {
    console.log(
      `  ${ds.name.padEnd(14)} ${ds.category.padEnd(22)} ${ds.approximateCount.padStart(12)} ${ds.approximateSize.padStart(12)} ${ds.targetGA.toFixed(3).padStart(12)} ${ds.targetPTA.toFixed(3).padStart(12)}`,
    );
  }
  console.log('─'.repeat(80));
  console.log(`  Total: 15 datasets | Zenodo record: https://zenodo.org/records/8275861`);
}

// ============================================================
// Entry point
// ============================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isAll = args.includes('--all');
  const isList = args.includes('--list');
  const isLLM = args.includes('--llm');
  const dataDirIdx = args.indexOf('--data-dir');
  const dataDir = dataDirIdx >= 0 ? args[dataDirIdx + 1] : null;
  const datasetIdx = args.indexOf('--dataset');
  const datasetArg = datasetIdx >= 0 ? args[datasetIdx + 1] : null;

  if (isList) {
    printDatasetTable();
    process.exit(0);
  }

  let datasetsToRun: FullDatasetDescriptor[];

  if (isAll) {
    console.log('🏗️  Full dataset mode (LogHub-2.0 Zenodo)');
    console.log(
      '⚠️  WARNING: Downloading all 15 datasets requires ~1GB+ storage and significant time.\n',
    );
    datasetsToRun = FULL_DATASETS;
  } else if (datasetArg) {
    datasetsToRun = FULL_DATASETS.filter(
      (ds) => ds.name.toLowerCase() === datasetArg.toLowerCase(),
    );
    if (datasetsToRun.length === 0) {
      console.error(`Unknown dataset: ${datasetArg}. Use --list to see available datasets.`);
      process.exit(1);
    }
    const ds = datasetsToRun[0]!;
    console.log(
      `🏗️  Full dataset mode: ${ds.name} (${ds.approximateSize}, ~${ds.approximateCount} logs)`,
    );
  } else {
    console.log('LogHub-2.0 Full Benchmark Runner');
    console.log('');
    console.log('Usage: npx tsx benchmark/loghub-full.ts [options]');
    console.log('');
    console.log('Options:');
    console.log('  --dataset <name>   Run a single full dataset (e.g., Linux, Zookeeper)');
    console.log('  --all              Run all 15 full datasets (requires ~1GB+ storage)');
    console.log('  --llm              Enable LLM-enhanced mode (adaptive batch refinement)');
    console.log('  --list             List all available datasets with sizes');
    console.log('  --data-dir <dir>   Cache downloads to directory (default: no cache)');
    console.log('');
    console.log('Datasets source: https://zenodo.org/records/8275861');
    console.log('Use --list to see all 14 datasets with sizes.');
    process.exit(0);
  }

  // Show dataset info before running
  if (!isAll) {
    printDatasetTable();
  }

  console.log(`\nRunning ${datasetsToRun.length} dataset(s)...\n`);

  const results: BenchmarkRow[] = [];
  const failures: { dataset: string; error: string }[] = [];

  for (const ds of datasetsToRun) {
    process.stdout.write(`  ${ds.name.padEnd(14)}... `);
    try {
      const row = await runDataset(ds, dataDir);
      results.push(row);
      process.stdout.write(
        `GA=${row.ga.toFixed(4)} PTA=${row.pta.toFixed(4)} clusters=${row.parserClusters} throughput=${row.throughputPerSec >= 1000 ? `${(row.throughputPerSec / 1000).toFixed(1)}K/s` : `${row.throughputPerSec}/s`}\n`,
      );
    } catch (err) {
      const msg = (err as Error).message;
      process.stdout.write(`FAILED: ${msg}\n`);
      failures.push({ dataset: ds.name, error: msg });
    }
  }

  if (results.length > 0) printResults(results);

  if (failures.length > 0) {
    console.log(`\nFailures:`);
    for (const f of failures) console.log(`  ${f.dataset}: ${f.error}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
