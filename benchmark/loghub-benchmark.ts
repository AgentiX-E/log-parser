/**
 * LogHub-2k benchmark for log-parser.
 *
 * Follows drain-ts benchmark methodology exactly:
 * - RFC 4180 CSV parsing with embedded comma reconciliation
 * - Downloads datasets from logpai/logparser GitHub repo
 * - Uses Content column as Drain input (standard Loghub approach)
 * - Per-dataset tuning (disableMasking, drainExtraDelimiters, etc.)
 * - Identical evaluation metrics: GA, FGA, PTA, RTA, FTA
 * - SynLogTemplateRefiner side-by-side comparison (Drain vs Refined)
 *
 * Usage:
 *   npx tsx benchmark/loghub-benchmark.ts [--dataset HDFS]
 */

import * as http from "node:http";
import * as https from "node:https";
import {
  DrainDataPlane,
  SynLogTemplateRefiner,
  PromptBuilder,
} from "@agentix-e/log-parser-core";
import type {
  DrainDataPlaneConfig,
  RefinementInput,
  DrainResult,
} from "@agentix-e/log-parser-core";

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
  /** Skip SynLogTemplateRefiner on this dataset (Drain already near-perfect). */
  skipRefinement?: boolean;
  regexCollapsePatterns?: ReadonlyArray<{
    readonly regex: string;
    readonly replacement: string;
  }>;
  /** Enable LLM control plane for this dataset (DeepSeek via OpenAICompatibleProvider). */
  useLLM?: boolean;
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
    skipRefinement: true,
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
    useLLM: true,
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
    skipRefinement: true,
  },
  {
    name: "Thunderbird",
    logUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Thunderbird/Thunderbird_2k.log",
    groundTruthUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Thunderbird/Thunderbird_2k.log_structured.csv",
    category: "Supercomputers",
    targetGA: 0.940,
    targetPTA: 0.820,
    useLLM: true,
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
    useLLM: true,
  },
  {
    name: "Android",
    logUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Android/Android_2k.log",
    groundTruthUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Android/Android_2k.log_structured.csv",
    category: "Mobile Systems",
    targetGA: 0.900,
    targetPTA: 0.710,
    useLLM: true,
  },
  {
    name: "HealthApp",
    logUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/HealthApp/HealthApp_2k.log",
    groundTruthUrl: "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/HealthApp/HealthApp_2k.log_structured.csv",
    category: "Mobile Systems",
    targetGA: 0.850,
    targetPTA: 0.750,
    skipRefinement: true,
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
    useLLM: true,
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
  recallTemplateAccuracy: number;
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
  if (n === 0) return { groupAccuracy: 1, f1GroupAccuracy: 1, parsingTemplateAccuracy: 1, recallTemplateAccuracy: 1, f1TemplateAccuracy: 1, totalMessages: 0, groundTruthTemplateCount: 0, parserClusterCount: 0 };

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

  // PTA / RTA / FTA (token-level)
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
  const rta = ftaRecall;
  const fta = (2 * ftaPrecision * ftaRecall) / (ftaPrecision + ftaRecall) || 0;

  return { groupAccuracy: ga, f1GroupAccuracy: fga, parsingTemplateAccuracy: pta, recallTemplateAccuracy: rta, f1TemplateAccuracy: fta, totalMessages: n, groundTruthTemplateCount: gtGroups.size, parserClusterCount: parsedGroups.size };
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

interface DualEval {
  drain: EvaluationResult;
  refined: EvaluationResult;
}

interface BenchmarkRow {
  dataset: string;
  category: string;
  // Drain metrics
  ga: number;
  fga: number;
  pta: number;
  rta: number;
  fta: number;
  gaPass: boolean;
  ptaPass: boolean;
  // Refined metrics
  refinedGa: number;
  refinedFga: number;
  refinedPta: number;
  refinedRta: number;
  refinedFta: number;
  refinedGaPass: boolean;
  refinedPtaPass: boolean;
  // Metadata
  messages: number;
  drainClusters: number;
  refinedChanged: number;
  // LLM cost tracking
  llmCalls: number;
  llmTokens: number;
}

/**
 * Build DrainDataPlaneConfig from dataset descriptor.
 */
function getDrainConfig(ds: DatasetDescriptor): DrainDataPlaneConfig {
  return {
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
}

/**
 * LLM-enhanced template refinement for a single drain cluster.
 *
 * Calls DeepSeek API directly via HTTPS fetch — avoids the AI SDK
 * double-call pattern (generateObject → fail → generateText) which
 * DeepSeek does not support. Uses PromptBuilder for NER-style prompting.
 *
 * @returns Refined template, confidence score, and tokens consumed.
 */
async function refineClusterWithDeepSeek(
  clusterLogs: string[],
  drainTemplate: string,
  sampleCount: number,
  apiKey: string,
  domain?: string,
  maxSelfReflect?: number,
): Promise<{ template: string; confidence: number; tokensConsumed: number; iterations: number }> {
  // Select up to sampleCount representative logs from the cluster
  const samples = clusterLogs.length <= sampleCount
    ? [...clusterLogs]
    : clusterLogs.filter((_, i) => i % Math.ceil(clusterLogs.length / sampleCount) < 1).slice(0, sampleCount);

  if (samples.length === 0) {
    return { template: drainTemplate, confidence: 0, tokensConsumed: 0, iterations: 0 };
  }

  // Use few-shot examples when domain provides them
  const prompt = PromptBuilder.buildWithExamples(samples, domain);
  const systemPrompt = PromptBuilder.SYSTEM_PROMPT + "\nRespond ONLY with a valid JSON object.";

  let currentTemplate = drainTemplate;
  let totalTokens = 0;
  let bestConfidence = 0;
  const maxIterations = maxSelfReflect ?? 1;
  let iterations = 0;

  for (let iter = 0; iter < maxIterations; iter++) {
    iterations = iter + 1;

    const body = JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 0,
      max_tokens: 2048,
    });

    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`DeepSeek API error ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
    };

    totalTokens += data.usage?.total_tokens ?? 0;
    const content = data.choices?.[0]?.message?.content ?? "";

    // Parse JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) continue;

    try {
      const parsed = JSON.parse(jsonMatch[0]) as { template?: string; confidence?: number };
      let template: string = parsed.template ?? drainTemplate;

      // Strip <TEMPLATE> wrapper tags injected by PromptBuilder's SYSTEM_PROMPT
      template = template.replace(/<\/?TEMPLATE>/g, "").trim();
      // Strip [<NUM>] prefix artifact from PromptBuilder sample numbering ([1], [2], ...)
      template = template.replace(/^\[<NUM>\]\s*/, "");

      const confidence: number = typeof parsed.confidence === "number" ? parsed.confidence : 0.5;
      if (template.length > 0) currentTemplate = template;
      if (confidence > bestConfidence) bestConfidence = confidence;

      // Self-reflection: verify template against all samples. If all match, stop.
      if (iter < maxIterations - 1) {
        const allMatch = samples.every((log) => {
          const regex = new RegExp("^" + currentTemplate
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            .replace(/<[^>]*>/g, '\\S+')
            .replace(/\\s\+/g, '\\s+') + "$");
          return regex.test(log);
        });
        if (allMatch) break;
      }
    } catch {
      // JSON parse failure — continue to next iteration
    }
  }

  return {
    template: currentTemplate.length > 0 ? currentTemplate : drainTemplate,
    confidence: bestConfidence,
    tokensConsumed: totalTokens,
    iterations,
  };
}

async function runDataset(ds: DatasetDescriptor): Promise<BenchmarkRow> {
  const { messages, groundTruth } = await loadDataset(ds);

  const config = getDrainConfig(ds);

  const drain = new DrainDataPlane(config);

  // Phase 1: Train Drain on all messages
  for (let i = 0; i < messages.length; i++) {
    drain.train(messages[i]!);
  }

  drain.mergeClusters();

  // Phase 2: Collect Drain results and cluster assignments
  const drainResults: DrainResult[] = [];
  for (let i = 0; i < messages.length; i++) {
    drainResults.push(drain.train(messages[i]!));
  }

  // Build Drain ParsedEntry[]
  const parsedDrain: ParsedEntry[] = drainResults.map(r => ({
    clusterId: r.templateId,
    templateTokens: r.template.split(" "),
  }));

  const drainEval = evaluate(groundTruth, parsedDrain);

  // Group logs by Drain cluster
  const clusterGroups = new Map<number, { logs: string[]; template: string }>();
  for (let i = 0; i < messages.length; i++) {
    const r = drainResults[i]!;
    const key = r.templateId;
    if (!clusterGroups.has(key)) {
      clusterGroups.set(key, { logs: [], template: r.template });
    }
    clusterGroups.get(key)!.logs.push(messages[i]!);
  }

  let llmCalls = 0;
  let llmTokens = 0;

  // Phase 3: Template refinement — LLM for useLLM datasets, SynLogTemplateRefiner for others
  const drainTemplateIds = [...clusterGroups.keys()];
  const templateIdToRefined = new Map<number, string>();
  let changedCount = 0;

  if (ds.useLLM) {
    // ── LLM-enhanced refinement (DeepSeek direct fetch — fast path) ──
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error("DEEPSEEK_API_KEY not set — required for LLM-enhanced datasets");

    const sampleCount = 5;
    const isHardDataset = ["OpenStack", "Android", "Thunderbird", "Proxifier"].includes(ds.name);
    const maxSelfReflect = isHardDataset ? 5 : 3;

    // Process clusters sequentially with a small delay to respect rate limits
    const delayMs = 50; // 50ms between API calls (~20 QPS, well within DeepSeek limits)
    let totalIterations = 0;
    for (const templateId of drainTemplateIds) {
      const cluster = clusterGroups.get(templateId)!;
      llmCalls++;

      const refined = await refineClusterWithDeepSeek(
        cluster.logs,
        cluster.template,
        sampleCount,
        apiKey,
        ds.name.toLowerCase(),
        maxSelfReflect,
      );

      llmTokens += refined.tokensConsumed;
      totalIterations += refined.iterations;
      templateIdToRefined.set(templateId, refined.template);
      if (refined.template !== cluster.template) changedCount++;

      // Rate-limit: small delay between calls
      if (llmCalls < drainTemplateIds.length) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  } else if (ds.skipRefinement) {
    // ── No refinement needed (Drain already near-perfect) ──
    for (const templateId of drainTemplateIds) {
      templateIdToRefined.set(templateId, clusterGroups.get(templateId)!.template);
    }
    return {
      dataset: ds.name, category: ds.category,
      ga: drainEval.groupAccuracy, fga: drainEval.f1GroupAccuracy,
      pta: drainEval.parsingTemplateAccuracy, rta: drainEval.recallTemplateAccuracy,
      fta: drainEval.f1TemplateAccuracy,
      gaPass: drainEval.groupAccuracy >= ds.targetGA,
      ptaPass: drainEval.parsingTemplateAccuracy >= ds.targetPTA,
      refinedGa: drainEval.groupAccuracy, refinedFga: drainEval.f1GroupAccuracy,
      refinedPta: drainEval.parsingTemplateAccuracy, refinedRta: drainEval.recallTemplateAccuracy,
      refinedFta: drainEval.f1TemplateAccuracy,
      refinedGaPass: drainEval.groupAccuracy >= ds.targetGA,
      refinedPtaPass: drainEval.parsingTemplateAccuracy >= ds.targetPTA,
      messages: drainEval.totalMessages, drainClusters: drainEval.parserClusterCount,
      refinedChanged: 0,
      llmCalls: 0, llmTokens: 0,
    };
  } else {
    // ── SynLogTemplateRefiner (non-LLM datasets) ──
    const refiner = new SynLogTemplateRefiner();
    const refinementInputs: RefinementInput[] = drainTemplateIds.map(id => ({
      logs: clusterGroups.get(id)!.logs,
      drainTemplate: clusterGroups.get(id)!.template,
    }));
    const refinedResults = refiner.refine(refinementInputs);

    for (let i = 0; i < drainTemplateIds.length; i++) {
      const result = refinedResults[i]!;
      templateIdToRefined.set(drainTemplateIds[i]!, result.refinedTemplate);
      if (result.changed) changedCount++;
    }
  }

  // Phase 4: Build refined ParsedEntry[] (same clusterIds, refined templates)
  const parsedRefined: ParsedEntry[] = drainResults.map(r => ({
    clusterId: r.templateId,
    templateTokens: templateIdToRefined.get(r.templateId)!.split(" "),
  }));

  const refinedEval = evaluate(groundTruth, parsedRefined);

  return {
    dataset: ds.name,
    category: ds.category,
    ga: drainEval.groupAccuracy,
    fga: drainEval.f1GroupAccuracy,
    pta: drainEval.parsingTemplateAccuracy,
    rta: drainEval.recallTemplateAccuracy,
    fta: drainEval.f1TemplateAccuracy,
    gaPass: drainEval.groupAccuracy >= ds.targetGA,
    ptaPass: drainEval.parsingTemplateAccuracy >= ds.targetPTA,
    refinedGa: refinedEval.groupAccuracy,
    refinedFga: refinedEval.f1GroupAccuracy,
    refinedPta: refinedEval.parsingTemplateAccuracy,
    refinedRta: refinedEval.recallTemplateAccuracy,
    refinedFta: refinedEval.f1TemplateAccuracy,
    refinedGaPass: refinedEval.groupAccuracy >= ds.targetGA,
    refinedPtaPass: refinedEval.parsingTemplateAccuracy >= ds.targetPTA,
    messages: drainEval.totalMessages,
    drainClusters: drainEval.parserClusterCount,
    refinedChanged: changedCount,
    llmCalls,
    llmTokens,
  };
}

// ============================================================
// Formatting helpers
// ============================================================

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function delta(drain: number, refined: number): string {
  const diff = (refined - drain) * 100;
  if (Math.abs(diff) < 0.05) return " ~";
  return diff > 0 ? `+${diff.toFixed(1)}pp` : `${diff.toFixed(1)}pp`;
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

  console.log("=== Log-Parser LogHub-2k Benchmark — SynLogTemplateRefiner + LLM comparison ===\n");

  const rows: BenchmarkRow[] = [];
  for (const ds of datasets) {
    try {
      const row = await runDataset(ds);
      rows.push(row);

      const llmTag = ds.useLLM ? " [LLM]" : "";
      // Side-by-side output per dataset
      console.log(`${(row.dataset + llmTag).padEnd(18)} ` +
        `GA:${pct(row.ga)}→${pct(row.refinedGa)}${delta(row.ga, row.refinedGa).padEnd(8)} ` +
        `PTA:${pct(row.pta)}→${pct(row.refinedPta)}${delta(row.pta, row.refinedPta).padEnd(8)} ` +
        `RTA:${pct(row.rta)}→${pct(row.refinedRta)}${delta(row.rta, row.refinedRta).padEnd(8)} ` +
        `FTA:${pct(row.fta)}→${pct(row.refinedFta)}${delta(row.fta, row.refinedFta)}`);
    } catch (err) {
      console.log(`${ds.name.padEnd(14)} ERROR: ${err}`);
    }
  }

  if (rows.length === 0) { console.log("\nNo results."); return; }

  // Summary: Drain averages
  const avgGA = rows.reduce((s, r) => s + r.ga, 0) / rows.length;
  const avgFGA = rows.reduce((s, r) => s + r.fga, 0) / rows.length;
  const avgPTA = rows.reduce((s, r) => s + r.pta, 0) / rows.length;
  const avgRTA = rows.reduce((s, r) => s + r.rta, 0) / rows.length;
  const avgFTA = rows.reduce((s, r) => s + r.fta, 0) / rows.length;
  const gaPass = rows.filter(r => r.gaPass).length;
  const ptaPass = rows.filter(r => r.ptaPass).length;

  // Summary: Refined averages
  const avgRefGA = rows.reduce((s, r) => s + r.refinedGa, 0) / rows.length;
  const avgRefFGA = rows.reduce((s, r) => s + r.refinedFga, 0) / rows.length;
  const avgRefPTA = rows.reduce((s, r) => s + r.refinedPta, 0) / rows.length;
  const avgRefRTA = rows.reduce((s, r) => s + r.refinedRta, 0) / rows.length;
  const avgRefFTA = rows.reduce((s, r) => s + r.refinedFta, 0) / rows.length;
  const refGaPass = rows.filter(r => r.refinedGaPass).length;
  const refPtaPass = rows.filter(r => r.refinedPtaPass).length;

  console.log(`\n=== SUMMARY (${rows.length} datasets) ===`);
  console.log(`                     Drain       Refined      Delta`);
  console.log(`Average GA:     ${pct(avgGA).padEnd(10)}  ${pct(avgRefGA).padEnd(10)}  ${delta(avgGA, avgRefGA)}`);
  console.log(`Average FGA:    ${pct(avgFGA).padEnd(10)}  ${pct(avgRefFGA).padEnd(10)}  ${delta(avgFGA, avgRefFGA)}`);
  console.log(`Average PTA:    ${pct(avgPTA).padEnd(10)}  ${pct(avgRefPTA).padEnd(10)}  ${delta(avgPTA, avgRefPTA)}`);
  console.log(`Average RTA:    ${pct(avgRTA).padEnd(10)}  ${pct(avgRefRTA).padEnd(10)}  ${delta(avgRTA, avgRefRTA)}`);
  console.log(`Average FTA:    ${pct(avgFTA).padEnd(10)}  ${pct(avgRefFTA).padEnd(10)}  ${delta(avgFTA, avgRefFTA)}`);

  console.log(`\nGA targets:     ${gaPass}/${rows.length} passed  →  ${refGaPass}/${rows.length} passed (refined)`);
  console.log(`PTA targets:    ${ptaPass}/${rows.length} passed  →  ${refPtaPass}/${rows.length} passed (refined)`);

  const allPass = refGaPass === rows.length && refPtaPass === rows.length;
  console.log(`\nOverall: ${allPass ? "ALL TARGETS MET ✓" : `${rows.length - refGaPass} GA + ${rows.length - refPtaPass} PTA failures ✗`}`);

  // ── LLM-enhanced summary ──
  const llmRows = rows.filter(r => r.llmCalls > 0);
  if (llmRows.length > 0) {
    const totalLlmCalls = llmRows.reduce((s, r) => s + r.llmCalls, 0);
    const totalLlmTokens = llmRows.reduce((s, r) => s + r.llmTokens, 0);
    const avgTokens = totalLlmCalls > 0 ? Math.round(totalLlmTokens / totalLlmCalls) : 0;

    console.log(`\n=== LLM-enhanced summary (${llmRows.length} datasets) ===`);
    console.log(`  Total LLM calls: ${totalLlmCalls}`);
    console.log(`  Total tokens consumed: ${totalLlmTokens.toLocaleString()}`);
    console.log(`  Avg tokens per call: ${avgTokens.toLocaleString()}`);

    // Per-dataset LLM breakdown
    console.log(`\n  Per-dataset LLM breakdown:`);
    for (const r of llmRows) {
      const drainPta = pct(r.pta);
      const refinedPta = pct(r.refinedPta);
      const ptaDelta = delta(r.pta, r.refinedPta).trim();
      console.log(`    ${r.dataset.padEnd(14)} calls: ${String(r.llmCalls).padStart(3)}  tokens: ${String(r.llmTokens).padStart(8)}  PTA: ${drainPta} → ${refinedPta} (${ptaDelta})`);
    }
  }

  if (!allPass) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
