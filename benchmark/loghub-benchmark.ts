/**
 * LogHub-2k benchmark for log-parser.
 *
 * Follows drain-ts benchmark methodology exactly:
 * - RFC 4180 CSV parsing with embedded comma reconciliation
 * - Downloads datasets from logpai/logparser GitHub repo
 * - Uses Content column as Drain input (standard Loghub approach)
 * - Per-dataset tuning (disableMasking, drainExtraDelimiters, etc.)
 * - Identical evaluation metrics: GA, FGA, PTA, FTA
 *
 * Usage:
 *   npx tsx benchmark/loghub-benchmark.ts [--dataset HDFS]
 */

import * as http from "node:http";
import * as https from "node:https";
import { DrainDataPlane } from "@agentix-e/log-parser-core";
import type { DrainDataPlaneConfig } from "@agentix-e/log-parser-core";

// ============================================================
// Dataset definitions (identical to drain-ts DATASETS array)
// ============================================================

interface DatasetDescriptor {
  name: string;
  logUrl: string;
  groundTruthUrl: string;
  category: string;
  targetGA: number;
  targetPTA: number;
  drainExtraDelimiters?: readonly string[];
  preprocess?: (content: string) => string;
  disableMasking?: boolean;
  enableAdjacentFusion?: boolean;
  enableAELSimilarity?: boolean;
  enableClusterMerge?: boolean;
  clusterMergePercent?: number;
  regexCollapsePatterns?: ReadonlyArray<{
    readonly regex: string;
    readonly replacement: string;
  }>;
}

const DATASETS: DatasetDescriptor[] = [
  {
    name: "HDFS",
    logUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/HDFS/HDFS_2k.log",
    groundTruthUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/HDFS/HDFS_2k.log_structured.csv",
    category: "Distributed Systems",
    targetGA: 0.990,
    targetPTA: 0.750,
  },
  {
    name: "Hadoop",
    logUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Hadoop/Hadoop_2k.log",
    groundTruthUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Hadoop/Hadoop_2k.log_structured.csv",
    category: "Distributed Systems",
    targetGA: 0.940,
    targetPTA: 0.790,
  },
  {
    name: "Spark",
    logUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Spark/Spark_2k.log",
    groundTruthUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Spark/Spark_2k.log_structured.csv",
    category: "Distributed Systems",
    targetGA: 0.910,
    targetPTA: 0.750,
  },
  {
    name: "OpenStack",
    logUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/OpenStack/OpenStack_2k.log",
    groundTruthUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/OpenStack/OpenStack_2k.log_structured.csv",
    category: "Distributed Systems",
    targetGA: 0.950,
    targetPTA: 0.720,
    disableMasking: true,
  },
  {
    name: "Zookeeper",
    logUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Zookeeper/Zookeeper_2k.log",
    groundTruthUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Zookeeper/Zookeeper_2k.log_structured.csv",
    category: "Distributed Systems",
    targetGA: 0.980,
    targetPTA: 0.800,
  },
  {
    name: "BGL",
    logUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/BGL/BGL_2k.log",
    groundTruthUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/BGL/BGL_2k.log_structured.csv",
    category: "Supercomputers",
    targetGA: 0.960,
    targetPTA: 0.820,
  },
  {
    name: "HPC",
    logUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/HPC/HPC_2k.log",
    groundTruthUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/HPC/HPC_2k.log_structured.csv",
    category: "Supercomputers",
    targetGA: 0.930,
    targetPTA: 0.850,
  },
  {
    name: "Thunderbird",
    logUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Thunderbird/Thunderbird_2k.log",
    groundTruthUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Thunderbird/Thunderbird_2k.log_structured.csv",
    category: "Supercomputers",
    targetGA: 0.940,
    targetPTA: 0.820,
  },
  {
    name: "Linux",
    logUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Linux/Linux_2k.log",
    groundTruthUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Linux/Linux_2k.log_structured.csv",
    category: "Operating Systems",
    targetGA: 0.750,
    targetPTA: 0.700,
  },
  {
    name: "Mac",
    logUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Mac/Mac_2k.log",
    groundTruthUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Mac/Mac_2k.log_structured.csv",
    category: "Operating Systems",
    targetGA: 0.850,
    targetPTA: 0.750,
  },
  {
    name: "Apache",
    logUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Apache/Apache_2k.log",
    groundTruthUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Apache/Apache_2k.log_structured.csv",
    category: "Server Applications",
    targetGA: 0.990,
    targetPTA: 0.900,
  },
  {
    name: "OpenSSH",
    logUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/OpenSSH/OpenSSH_2k.log",
    groundTruthUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/OpenSSH/OpenSSH_2k.log_structured.csv",
    category: "Server Applications",
    targetGA: 0.880,
    targetPTA: 0.800,
  },
  {
    name: "Windows",
    logUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Windows/Windows_2k.log",
    groundTruthUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Windows/Windows_2k.log_structured.csv",
    category: "Operating Systems",
    targetGA: 0.990,
    targetPTA: 0.850,
  },
  {
    name: "Android",
    logUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Android/Android_2k.log",
    groundTruthUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Android/Android_2k.log_structured.csv",
    category: "Mobile Systems",
    targetGA: 0.900,
    targetPTA: 0.710,
  },
  {
    name: "HealthApp",
    logUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/HealthApp/HealthApp_2k.log",
    groundTruthUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/HealthApp/HealthApp_2k.log_structured.csv",
    category: "Mobile Systems",
    targetGA: 0.850,
    targetPTA: 0.750,
  },
  {
    name: "Proxifier",
    logUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Proxifier/Proxifier_2k.log",
    groundTruthUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Proxifier/Proxifier_2k.log_structured.csv",
    category: "Standalone Software",
    targetGA: 0.700,
    targetPTA: 0.750,
    drainExtraDelimiters: [","],
    disableMasking: true,
    enableAdjacentFusion: true,
    enableAELSimilarity: true,
    enableClusterMerge: true,
    clusterMergePercent: 0.4,
    regexCollapsePatterns: [
      { regex: String.raw`<\d+\s+sec`, replacement: "<*>:<*>" },
      { regex: String.raw`\s*\(\d+\.\d+\s+KB\)`, replacement: "" },
    ],
  },
];

// ============================================================
// HTTP fetch helper
// ============================================================

function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client.get(url, { headers: { "User-Agent": "log-parser-benchmark/1.0" } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirect = res.headers.location;
        if (!redirect) { reject(new Error(`Redirect without Location for ${url}`)); return; }
        fetchUrl(redirect).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode} for ${url}`)); return; }
      let data = "";
      res.on("data", (chunk: Buffer) => (data += chunk.toString()));
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

// ============================================================
// RFC 4180 CSV parsing (ported from drain-ts benchmark)
// ============================================================

interface CsvHeaderInfo {
  columns: string[];
  contentIdx: number;
  eventTemplateIdx: number;
  totalCols: number;
}

function analyzeHeader(headerLine: string): CsvHeaderInfo {
  const columns = parseCsvLine(headerLine);
  const contentIdx = columns.indexOf("Content");
  // EventTemplate is the last column in Loghub structured CSVs
  const eventTemplateIdx = columns.length - 1;
  return { columns, contentIdx, eventTemplateIdx, totalCols: columns.length };
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let wasQuoted = false;

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
    } else if (ch === '"' && field === "") {
      inQuotes = true;
      wasQuoted = false;
    } else if (ch === ",") {
      fields.push(wasQuoted ? field : field.trim());
      field = "";
      wasQuoted = false;
    } else if (ch === " " && (field === "" || wasQuoted)) {
      continue;
    } else {
      field += ch;
    }
  }
  fields.push(wasQuoted ? field : field.trim());
  return fields;
}

function parseCsvRow(line: string, header: CsvHeaderInfo): string[] {
  const fields = parseCsvLine(line);
  const { totalCols, contentIdx } = header;

  if (fields.length === totalCols) return fields;
  if (fields.length < totalCols) {
    const result = [...fields];
    while (result.length < totalCols) result.push("");
    return result;
  }

  // Too many columns: embedded commas in Content field — merge them back
  const trailingColCount = totalCols - contentIdx - 1;
  const contentEndIdx = fields.length - trailingColCount;
  const contentFragments = fields.slice(contentIdx, contentEndIdx);
  const mergedContent = contentFragments.join(",");
  return [...fields.slice(0, contentIdx), mergedContent, ...fields.slice(contentEndIdx)];
}

// ============================================================
// Evaluation (drain-ts compatible algorithm)
// ============================================================

interface GroundTruthEntry {
  logLine: string;
  templateTokens: string[];
  templateId: number;
}

interface ParsedEntry {
  clusterId: number;
  templateTokens: string[];
}

interface EvaluationResult {
  groupAccuracy: number;
  f1GroupAccuracy: number;
  parsingTemplateAccuracy: number;
  f1TemplateAccuracy: number;
  totalMessages: number;
  groundTruthTemplateCount: number;
  parserClusterCount: number;
}

function isMaskedToken(token: string): boolean {
  return token.startsWith("<") && token.endsWith(">") && token.length > 2;
}

function evaluate(groundTruth: GroundTruthEntry[], parsed: ParsedEntry[]): EvaluationResult {
  const n = groundTruth.length;
  if (n === 0) return { groupAccuracy: 1, f1GroupAccuracy: 1, parsingTemplateAccuracy: 1, f1TemplateAccuracy: 1, totalMessages: 0, groundTruthTemplateCount: 0, parserClusterCount: 0 };

  // GA / FGA
  const gtGroups = new Map<number, Set<number>>();
  const parsedGroups = new Map<number, Set<number>>();
  for (let i = 0; i < n; i++) {
    const gtId = groundTruth[i]!.templateId;
    const pId = parsed[i]!.clusterId;
    if (!gtGroups.has(gtId)) gtGroups.set(gtId, new Set());
    gtGroups.get(gtId)!.add(i);
    if (!parsedGroups.has(pId)) parsedGroups.set(pId, new Set());
    parsedGroups.get(pId)!.add(i);
  }

  let correctMessages = 0, f1PrecisionSum = 0, f1RecallSum = 0;
  for (const [, gtIndices] of gtGroups) {
    let bestOverlap = 0;
    for (const [, pIndices] of parsedGroups) {
      let overlap = 0;
      for (const idx of gtIndices) { if (pIndices.has(idx)) overlap++; }
      if (overlap > bestOverlap) bestOverlap = overlap;
    }
    correctMessages += bestOverlap;
    f1PrecisionSum += bestOverlap / gtIndices.size;
  }
  for (const [, pIndices] of parsedGroups) {
    let bestOverlap = 0;
    for (const [, gtIndices] of gtGroups) {
      let overlap = 0;
      for (const idx of pIndices) { if (gtIndices.has(idx)) overlap++; }
      if (overlap > bestOverlap) bestOverlap = overlap;
    }
    f1RecallSum += bestOverlap / pIndices.size;
  }

  const ga = correctMessages / n;
  const f1Precision = f1PrecisionSum / gtGroups.size;
  const f1Recall = f1RecallSum / parsedGroups.size;
  const fga = (2 * f1Precision * f1Recall) / (f1Precision + f1Recall) || 0;

  // PTA / FTA
  let ptaMatches = 0, ptaTotalTokens = 0, ftaMatches = 0, ftaParserTokens = 0, ftaGtTokens = 0;
  for (let i = 0; i < n; i++) {
    const gtTok = groundTruth[i]!.templateTokens;
    const pTok = parsed[i]!.templateTokens;
    const maxLen = Math.max(gtTok.length, pTok.length);
    ptaTotalTokens += maxLen;
    let matchCount = 0;
    for (let j = 0; j < maxLen; j++) {
      if (j < gtTok.length && j < pTok.length) {
        const g = gtTok[j]!;
        const p = pTok[j]!;
        if (g === p || (isMaskedToken(g) && isMaskedToken(p))) { matchCount++; ftaMatches++; }
      }
    }
    ptaMatches += matchCount;
    ftaParserTokens += pTok.length;
    ftaGtTokens += gtTok.length;
  }

  const pta = ptaTotalTokens > 0 ? ptaMatches / ptaTotalTokens : 1;
  const ftaPrecision = ftaParserTokens > 0 ? ftaMatches / ftaParserTokens : 0;
  const ftaRecall = ftaGtTokens > 0 ? ftaMatches / ftaGtTokens : 0;
  const fta = (2 * ftaPrecision * ftaRecall) / (ftaPrecision + ftaRecall) || 0;

  return { groupAccuracy: ga, f1GroupAccuracy: fga, parsingTemplateAccuracy: pta, f1TemplateAccuracy: fta, totalMessages: n, groundTruthTemplateCount: gtGroups.size, parserClusterCount: parsedGroups.size };
}

// ============================================================
// Dataset loading
// ============================================================

async function loadDataset(ds: DatasetDescriptor): Promise<{ messages: string[]; groundTruth: GroundTruthEntry[] }> {
  const gtContent = await fetchUrl(ds.groundTruthUrl);
  const lines = gtContent.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error(`${ds.name}: CSV must have header + data`);

  const header = analyzeHeader(lines[0]!);
  const messages: string[] = [];
  const groundTruth: GroundTruthEntry[] = [];
  const templateToId = new Map<string, number>();
  let nextId = 1;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    const cols = parseCsvRow(line, header);
    const content = header.contentIdx >= 0 ? cols[header.contentIdx]! : "";
    const eventTemplate = cols[header.eventTemplateIdx]!;
    const templateTokens = eventTemplate.length > 0 ? eventTemplate.split(/\s+/).filter(t => t.length > 0) : [];
    const templateKey = templateTokens.join(" ");
    if (!templateToId.has(templateKey)) templateToId.set(templateKey, nextId++);
    messages.push(content);
    groundTruth.push({ logLine: content, templateTokens, templateId: templateToId.get(templateKey)! });
  }
  return { messages, groundTruth };
}

// ============================================================
// Benchmark runner
// ============================================================

interface BenchmarkRow {
  dataset: string;
  category: string;
  ga: number;
  fga: number;
  pta: number;
  fta: number;
  gaPass: boolean;
  ptaPass: boolean;
  messages: number;
}

async function runDataset(ds: DatasetDescriptor): Promise<BenchmarkRow> {
  const { messages, groundTruth } = await loadDataset(ds);

  const config: DrainDataPlaneConfig = {
    extendedMasking: !ds.disableMasking,
    disableMasking: ds.disableMasking,
    simTh: 0.4,
    depth: 4,
    maxChildren: 100,
    drainExtraDelimiters: ds.drainExtraDelimiters,
    enableAdjacentFusion: ds.enableAdjacentFusion,
    enableAELSimilarity: ds.enableAELSimilarity,
    enableClusterMerge: ds.enableClusterMerge,
    clusterMergePercent: ds.clusterMergePercent,
    regexCollapsePatterns: ds.regexCollapsePatterns,
  };

  const drain = new DrainDataPlane(config);

  for (let i = 0; i < messages.length; i++) {
    drain.train(messages[i]!);
  }

  drain.mergeClusters();

  const parsed: ParsedEntry[] = [];
  for (let i = 0; i < messages.length; i++) {
    const result = drain.train(messages[i]!);
    parsed.push({ clusterId: result.templateId, templateTokens: result.template.split(" ") });
  }

  const evalResult = evaluate(groundTruth, parsed);

  return {
    dataset: ds.name,
    category: ds.category,
    ga: evalResult.groupAccuracy,
    fga: evalResult.f1GroupAccuracy,
    pta: evalResult.parsingTemplateAccuracy,
    fta: evalResult.f1TemplateAccuracy,
    gaPass: evalResult.groupAccuracy >= ds.targetGA,
    ptaPass: evalResult.parsingTemplateAccuracy >= ds.targetPTA,
    messages: evalResult.totalMessages,
  };
}

// ============================================================
// Main
// ============================================================

async function main(): Promise<void> {
  const filterDataset = process.argv.find(a => a.startsWith("--dataset="))?.split("=")[1];
  const datasets = filterDataset
    ? DATASETS.filter(d => d.name.toLowerCase() === filterDataset.toLowerCase())
    : DATASETS;
  
  if (datasets.length === 0) {
    console.error(`No dataset matching "${filterDataset}". Available: ${DATASETS.map(d => d.name).join(", ")}`);
    process.exit(1);
  }

  console.log("=== Log-Parser LogHub-2k Benchmark (RFC 4180, drain-ts compatible) ===\n");

  const rows: BenchmarkRow[] = [];
  for (const ds of datasets) {
    process.stdout.write(`${ds.name.padEnd(14)} `);
    try {
      const row = await runDataset(ds);
      rows.push(row);
      const gaStatus = row.gaPass ? "✓" : "✗";
      const ptaStatus = row.ptaPass ? "✓" : "✗";
      console.log(`GA:${(row.ga*100).toFixed(1)}%${gaStatus} PTA:${(row.pta*100).toFixed(1)}%${ptaStatus} (${row.messages}msgs)`);
    } catch (err) {
      console.log(`ERROR: ${err}`);
    }
  }

  if (rows.length === 0) { console.log("\nNo results."); return; }

  const avgGA = rows.reduce((s, r) => s + r.ga, 0) / rows.length;
  const avgFGA = rows.reduce((s, r) => s + r.fga, 0) / rows.length;
  const avgPTA = rows.reduce((s, r) => s + r.pta, 0) / rows.length;
  const avgFTA = rows.reduce((s, r) => s + r.fta, 0) / rows.length;
  const gaPass = rows.filter(r => r.gaPass).length;
  const ptaPass = rows.filter(r => r.ptaPass).length;

  console.log(`\n=== SUMMARY (${rows.length} datasets) ===`);
  console.log(`Average GA:  ${(avgGA*100).toFixed(1)}%  (${gaPass}/${rows.length} passed targetGA)`);
  console.log(`Average FGA: ${(avgFGA*100).toFixed(1)}%`);
  console.log(`Average PTA: ${(avgPTA*100).toFixed(1)}%  (${ptaPass}/${rows.length} passed targetPTA)`);
  console.log(`Average FTA: ${(avgFTA*100).toFixed(1)}%`);

  const allPass = gaPass === rows.length && ptaPass === rows.length;
  console.log(`\nOverall: ${allPass ? "ALL TARGETS MET ✓" : `${rows.length - gaPass} GA + ${rows.length - ptaPass} PTA failures ✗`}`);

  if (!allPass) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
