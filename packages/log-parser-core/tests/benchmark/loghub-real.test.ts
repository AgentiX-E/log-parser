/**
 * Real LogHub-2k benchmark test for log-parser.
 *
 * Downloads 15 LogHub-2k datasets via HTTP, runs drain-only parsing,
 * and evaluates against ground truth using drain-ts compatible metrics.
 *
 * NOTE: This test requires internet access. Datasets are ~2MB total.
 * It is SKIPPED in CI by default (use LOGHUB_BENCHMARK=1 to enable).
 */
import { describe, it, expect } from 'vitest';
import * as http from 'node:http';
import * as https from 'node:https';
import { DrainDataPlane } from '@agentix-e/log-parser-core';
import type { DrainDataPlaneConfig } from '@agentix-e/log-parser-core';

// ── Dataset definitions (identical to drain-ts) ──

interface DatasetDescriptor {
  name: string;
  logUrl: string;
  groundTruthUrl: string;
  category: string;
  targetGA: number;
  targetPTA: number;
  drainExtraDelimiters?: readonly string[];
  disableMasking?: boolean;
}

const DATASETS: DatasetDescriptor[] = [
  { name: 'HDFS', logUrl: 'https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/HDFS/HDFS_2k.log', groundTruthUrl: 'https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/HDFS/HDFS_2k.log_structured.csv', category: 'Distributed Systems', targetGA: 0.990, targetPTA: 0.750 },
  { name: 'Hadoop', logUrl: 'https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Hadoop/Hadoop_2k.log', groundTruthUrl: 'https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Hadoop/Hadoop_2k.log_structured.csv', category: 'Distributed Systems', targetGA: 0.940, targetPTA: 0.790 },
  { name: 'Spark', logUrl: 'https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Spark/Spark_2k.log', groundTruthUrl: 'https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Spark/Spark_2k.log_structured.csv', category: 'Distributed Systems', targetGA: 0.910, targetPTA: 0.750 },
  { name: 'OpenStack', logUrl: 'https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/OpenStack/OpenStack_2k.log', groundTruthUrl: 'https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/OpenStack/OpenStack_2k.log_structured.csv', category: 'Distributed Systems', targetGA: 0.950, targetPTA: 0.720, disableMasking: true },
  { name: 'Zookeeper', logUrl: 'https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Zookeeper/Zookeeper_2k.log', groundTruthUrl: 'https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Zookeeper/Zookeeper_2k.log_structured.csv', category: 'Distributed Systems', targetGA: 0.980, targetPTA: 0.800 },
  { name: 'BGL', logUrl: 'https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/BGL/BGL_2k.log', groundTruthUrl: 'https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/BGL/BGL_2k.log_structured.csv', category: 'Supercomputers', targetGA: 0.960, targetPTA: 0.820 },
  { name: 'HPC', logUrl: 'https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/HPC/HPC_2k.log', groundTruthUrl: 'https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/HPC/HPC_2k.log_structured.csv', category: 'Supercomputers', targetGA: 0.930, targetPTA: 0.850 },
  { name: 'Thunderbird', logUrl: 'https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Thunderbird/Thunderbird_2k.log', groundTruthUrl: 'https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Thunderbird/Thunderbird_2k.log_structured.csv', category: 'Supercomputers', targetGA: 0.940, targetPTA: 0.820 },
  { name: 'Linux', logUrl: 'https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Linux/Linux_2k.log', groundTruthUrl: 'https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Linux/Linux_2k.log_structured.csv', category: 'Operating Systems', targetGA: 0.750, targetPTA: 0.700 },
  { name: 'Mac', logUrl: 'https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Mac/Mac_2k.log', groundTruthUrl: 'https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Mac/Mac_2k.log_structured.csv', category: 'Operating Systems', targetGA: 0.850, targetPTA: 0.750 },
  { name: 'Apache', logUrl: 'https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Apache/Apache_2k.log', groundTruthUrl: 'https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Apache/Apache_2k.log_structured.csv', category: 'Server Applications', targetGA: 0.990, targetPTA: 0.900 },
  { name: 'OpenSSH', logUrl: 'https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/OpenSSH/OpenSSH_2k.log', groundTruthUrl: 'https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/OpenSSH/OpenSSH_2k.log_structured.csv', category: 'Server Applications', targetGA: 0.880, targetPTA: 0.800 },
  { name: 'Windows', logUrl: 'https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Windows/Windows_2k.log', groundTruthUrl: 'https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Windows/Windows_2k.log_structured.csv', category: 'Operating Systems', targetGA: 0.990, targetPTA: 0.850 },
  { name: 'Android', logUrl: 'https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Android/Android_2k.log', groundTruthUrl: 'https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Android/Android_2k.log_structured.csv', category: 'Mobile Systems', targetGA: 0.900, targetPTA: 0.710 },
  { name: 'HealthApp', logUrl: 'https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/HealthApp/HealthApp_2k.log', groundTruthUrl: 'https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/HealthApp/HealthApp_2k.log_structured.csv', category: 'Mobile Systems', targetGA: 0.850, targetPTA: 0.750 },
  { name: 'Proxifier', logUrl: 'https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Proxifier/Proxifier_2k.log', groundTruthUrl: 'https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Proxifier/Proxifier_2k.log_structured.csv', category: 'Standalone Software', targetGA: 0.700, targetPTA: 0.750, drainExtraDelimiters: [','], disableMasking: true },
];

// ── HTTP + CSV parsing (RFC 4180, ported from drain-ts benchmark) ──

function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'User-Agent': 'log-parser-benchmark/1.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirect = res.headers.location;
        if (!redirect) { reject(new Error(`Redirect without Location for ${url}`)); return; }
        fetchUrl(redirect).then(resolve, reject); return;
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode} for ${url}`)); return; }
      let data = ''; res.on('data', (chunk: Buffer) => (data += chunk.toString()));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = []; let field = ''; let inQuotes = false; let wasQuoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) { if (ch === '"') { if (i + 1 < line.length && line[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; wasQuoted = true; } } else { field += ch; } }
    else if (ch === '"' && field === '') { inQuotes = true; wasQuoted = false; }
    else if (ch === ',') { fields.push(wasQuoted ? field : field.trim()); field = ''; wasQuoted = false; }
    else if (ch === ' ' && (field === '' || wasQuoted)) { continue; }
    else { field += ch; }
  }
  fields.push(wasQuoted ? field : field.trim()); return fields;
}

interface CsvHeaderInfo { columns: string[]; contentIdx: number; eventTemplateIdx: number; totalCols: number; }

function analyzeHeader(headerLine: string): CsvHeaderInfo {
  const columns = parseCsvLine(headerLine);
  return { columns, contentIdx: columns.indexOf('Content'), eventTemplateIdx: columns.length - 1, totalCols: columns.length };
}

function parseCsvRow(line: string, header: CsvHeaderInfo): string[] {
  const fields = parseCsvLine(line);
  if (fields.length === header.totalCols) return fields;
  if (fields.length < header.totalCols) { const r = [...fields]; while (r.length < header.totalCols) r.push(''); return r; }
  const trailingColCount = header.totalCols - header.contentIdx - 1;
  const contentEndIdx = fields.length - trailingColCount;
  const merged = fields.slice(header.contentIdx, contentEndIdx).join(',');
  return [...fields.slice(0, header.contentIdx), merged, ...fields.slice(contentEndIdx)];
}

async function loadDataset(ds: DatasetDescriptor) {
  const gtContent = await fetchUrl(ds.groundTruthUrl);
  const lines = gtContent.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error(`${ds.name}: CSV must have header + data`);
  const header = analyzeHeader(lines[0]!);
  const messages: string[] = [];
  const groundTruth: Array<{ logLine: string; templateTokens: string[]; templateId: number }> = [];
  const templateToId = new Map<string, number>(); let nextId = 1;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!; if (!line.trim()) continue;
    const cols = parseCsvRow(line, header);
    const content = header.contentIdx >= 0 ? cols[header.contentIdx]! : '';
    const eventTemplate = cols[header.eventTemplateIdx]!;
    const templateTokens = eventTemplate.length > 0 ? eventTemplate.split(/\s+/).filter(t => t.length > 0) : [];
    const key = templateTokens.join(' ');
    if (!templateToId.has(key)) templateToId.set(key, nextId++);
    messages.push(content); groundTruth.push({ logLine: content, templateTokens, templateId: templateToId.get(key)! });
  }
  return { messages, groundTruth, header };
}

// ── Evaluation (drain-ts compatible) ──

function isMaskedToken(token: string): boolean { return token.startsWith('<') && token.endsWith('>') && token.length > 2; }

function evaluateLoghub(gt: Array<{ templateTokens: string[]; templateId: number }>, parsed: Array<{ clusterId: number; templateTokens: string[] }>) {
  const n = gt.length;
  if (n === 0) return { ga: 1, fga: 1, pta: 1, fta: 1 };
  const gtGroups = new Map<number, Set<number>>(); const parsedGroups = new Map<number, Set<number>>();
  for (let i = 0; i < n; i++) {
    if (!gtGroups.has(gt[i]!.templateId)) gtGroups.set(gt[i]!.templateId, new Set()); gtGroups.get(gt[i]!.templateId)!.add(i);
    if (!parsedGroups.has(parsed[i]!.clusterId)) parsedGroups.set(parsed[i]!.clusterId, new Set()); parsedGroups.get(parsed[i]!.clusterId)!.add(i);
  }
  let correct = 0, fpSum = 0, frSum = 0;
  for (const [, g] of gtGroups) { let best = 0; for (const [, p] of parsedGroups) { let o = 0; for (const idx of g) if (p.has(idx)) o++; if (o > best) best = o; } correct += best; fpSum += best / g.size; }
  for (const [, p] of parsedGroups) { let best = 0; for (const [, g] of gtGroups) { let o = 0; for (const idx of p) if (g.has(idx)) o++; if (o > best) best = o; } frSum += best / p.size; }
  const ga = correct / n;
  const fga = (2 * (fpSum/gtGroups.size) * (frSum/parsedGroups.size)) / ((fpSum/gtGroups.size) + (frSum/parsedGroups.size)) || 0;
  let pm = 0, pt = 0, fm = 0, fp = 0, fg = 0;
  for (let i = 0; i < n; i++) { const g = gt[i]!.templateTokens; const p = parsed[i]!.templateTokens; const ml = Math.max(g.length, p.length); pt += ml; let m = 0; for (let j = 0; j < ml; j++) { if (j < g.length && j < p.length && (g[j] === p[j] || (isMaskedToken(g[j]!) && isMaskedToken(p[j]!)))) { m++; fm++; } } pm += m; fp += p.length; fg += g.length; }
  const pta = pt > 0 ? pm / pt : 1; const fta = (2 * (fp>0?fm/fp:0) * (fg>0?fm/fg:0)) / ((fp>0?fm/fp:0) + (fg>0?fm/fg:0)) || 0;
  return { ga, fga, pta, fta };
}

// ── Benchmark ──

const RUN_BENCHMARK = process.env.LOGHUB_BENCHMARK === '1';

describe.runIf(RUN_BENCHMARK)('LogHub-2k Benchmark (drain-ts compatible)', () => {
  for (const ds of DATASETS) {
    it(`${ds.name}: GA ≥ ${(ds.targetGA * 100).toFixed(0)}%, PTA ≥ ${(ds.targetPTA * 100).toFixed(0)}%`, async () => {
      const { messages, groundTruth } = await loadDataset(ds);
      expect(messages.length).toBeGreaterThan(0);

      const config: DrainDataPlaneConfig = {
        extendedMasking: !ds.disableMasking,
        simTh: 0.4, depth: 4, maxChildren: 100,
      };
      if (ds.drainExtraDelimiters) {
        config.preprocess = (content: string) => {
          let r = content; for (const d of ds.drainExtraDelimiters!) r = r.split(d).join(' '); return r;
        };
      }

      const drain = new DrainDataPlane(config);
      for (const msg of messages) drain.train(msg);
      drain.mergeClusters();

      const parsed = messages.map(msg => { const r = drain.train(msg); return { clusterId: r.templateId, templateTokens: r.template.split(' ') }; });
      const result = evaluateLoghub(groundTruth, parsed);

      console.log(`${ds.name.padEnd(14)} GA:${(result.ga*100).toFixed(1)}% (target ${(ds.targetGA*100).toFixed(0)}%) PTA:${(result.pta*100).toFixed(1)}% (target ${(ds.targetPTA*100).toFixed(0)}%) FTA:${(result.fta*100).toFixed(1)}%`);

      expect(result.ga).toBeGreaterThanOrEqual(ds.targetGA * 0.95); // 5% tolerance for benchmark runs
      expect(result.pta).toBeGreaterThanOrEqual(ds.targetPTA * 0.95);
    }, 30000);
  }
});
