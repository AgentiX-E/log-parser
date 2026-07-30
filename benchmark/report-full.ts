#!/usr/bin/env node
/**
 * LogHub Full benchmark HTML report generator.
 *
 * Reads Full benchmark output files from a directory containing
 * individual dataset artifacts (bench-{dataset}.txt) and generates
 * a self-contained HTML report.
 *
 * Usage:
 *   npx tsx benchmark/report-full.ts /tmp/full-results docs/full
 *
 * In CI:
 *   - Downloads all benchmark-full-* artifacts to /tmp/full-results/
 *   - Runs this script to produce docs/full/index.html
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ============================================================
// Dataset target thresholds (mirrored from loghub-full.ts)
// ============================================================
const TARGETS: Record<string, { ga: number; pta: number }> = {
  HDFS:       { ga: 0.99, pta: 0.70 },
  Hadoop:     { ga: 0.94, pta: 0.74 },
  Spark:      { ga: 0.91, pta: 0.70 },
  OpenStack:  { ga: 0.85, pta: 0.67 },
  Zookeeper:  { ga: 0.98, pta: 0.75 },
  BGL:        { ga: 0.96, pta: 0.76 },
  HPC:        { ga: 0.93, pta: 0.80 },
  Thunderbird:{ ga: 0.94, pta: 0.76 },
  Linux:      { ga: 0.75, pta: 0.65 },
  Mac:        { ga: 0.85, pta: 0.70 },
  Windows:    { ga: 0.99, pta: 0.80 },
  Apache:     { ga: 0.99, pta: 0.78 },
  OpenSSH:    { ga: 0.88, pta: 0.75 },
  Android:    { ga: 0.90, pta: 0.66 },
  HealthApp:  { ga: 0.85, pta: 0.70 },
  Proxifier:  { ga: 0.95, pta: 0.70 },
};

// ============================================================
// Parsed result row
// ============================================================
interface FullRow {
  dataset: string;
  category: string;
  ga: number;
  fga: number;
  pta: number;
  fta: number;
  gaPass: boolean;
  ptaPass: boolean;
  timeStr: string;
  throughputStr: string;
  messages: number;
  targetGA: number;
  targetPTA: number;
}

// ============================================================
// Parser: fixed-column extraction from structured output
// ============================================================
/**
 * The benchmark output format is controlled by loghub-full.ts:printResults():
 *
 *   `${dataset.padEnd(14)} ${category.padEnd(20)} ${ga.padStart(8)} ${fga.padStart(8)}
 *    ${pta.padStart(8)} ${fta.padStart(8)} ${gaPass.padStart(8)} ${ptaPass.padStart(8)}
 *    ${timeStr.padStart(8)} ${throughputStr.padStart(10)} ${messages.padStart(12)}`
 *
 * Column positions (0-indexed), including 1-space separator between fields:
 *   Dataset:    2..15  (padEnd 14)
 *   Category:   17..36 (padEnd 20)
 *   GA:         38..45 (padStart 8)
 *   FGA:        47..54 (padStart 8)
 *   PTA:        56..63 (padStart 8)
 *   FTA:        65..72 (padStart 8)
 *   GA Pass:    74..81 (padStart 8)
 *   PTA Pass:   83..90 (padStart 8)
 *   Time:       92..99 (padStart 8)
 *   Throughput: 101..110 (padStart 10)
 *   Messages:   112..123 (padStart 12)
 */
const COLUMNS = {
  dataset:    { start: 2,  end: 15 },
  category:   { start: 17, end: 36 },
  ga:         { start: 38, end: 45 },
  fga:        { start: 47, end: 54 },
  pta:        { start: 56, end: 63 },
  fta:        { start: 65, end: 72 },
  gaPass:     { start: 74, end: 81 },
  ptaPass:    { start: 83, end: 90 },
  time:       { start: 92, end: 99 },
  throughput: { start: 101, end: 110 },
  messages:   { start: 112, end: 123 },
};

function extractCol(line: string, col: { start: number; end: number }): string {
  if (line.length <= col.start) return "";
  return line.substring(col.start, Math.min(col.end, line.length)).trim();
}

function parseRow(line: string): FullRow | null {
  const dataset = extractCol(line, COLUMNS.dataset);
  // Must start with a capital letter (dataset names)
  if (!dataset || !/^[A-Z]/.test(dataset)) return null;

  const category = extractCol(line, COLUMNS.category);
  const gaStr = extractCol(line, COLUMNS.ga);
  const fgaStr = extractCol(line, COLUMNS.fga);
  const ptaStr = extractCol(line, COLUMNS.pta);
  const ftaStr = extractCol(line, COLUMNS.fta);
  const gaPassStr = extractCol(line, COLUMNS.gaPass);
  const ptaPassStr = extractCol(line, COLUMNS.ptaPass);
  const timeStr = extractCol(line, COLUMNS.time);
  const throughputStr = extractCol(line, COLUMNS.throughput);
  const messagesStr = extractCol(line, COLUMNS.messages);

  const ga = parseFloat(gaStr);
  const fga = parseFloat(fgaStr);
  const pta = parseFloat(ptaStr);
  const fta = parseFloat(ftaStr);

  if (isNaN(ga) || isNaN(pta)) return null;

  const messages = parseInt(messagesStr.replace(/,/g, ""), 10);
  if (isNaN(messages)) return null;

  const targets = TARGETS[dataset] ?? { ga: 0, pta: 0 };

  return {
    dataset,
    category: category || "",
    ga, fga, pta, fta,
    gaPass: gaPassStr === "✓",
    ptaPass: ptaPassStr === "✓",
    timeStr: timeStr || "",
    throughputStr: throughputStr || "",
    messages,
    targetGA: targets.ga,
    targetPTA: targets.pta,
  };
}

// ============================================================
// File discovery
// ============================================================
function findBenchmarkFiles(resultsDir: string): string[] {
  const files: string[] = [];

  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.startsWith("bench-") && entry.name.endsWith(".txt")) {
        files.push(full);
      }
    }
  }

  walk(resultsDir);
  return files.sort();
}

// ============================================================
// HTML generation
// ============================================================
function fmtPercent(n: number): string {
  return (n * 100).toFixed(2) + "%";
}

function fmtMessages(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toLocaleString();
}

function genHtml(rows: FullRow[], genDate: string): string {
  const totalLogs = rows.reduce((s, r) => s + r.messages, 0);
  const avgGA = rows.length > 0 ? rows.reduce((s, r) => s + r.ga, 0) / rows.length : 0;
  const avgPTA = rows.length > 0 ? rows.reduce((s, r) => s + r.pta, 0) / rows.length : 0;
  const passCount = rows.filter(r => r.gaPass && r.ptaPass).length;

  return `<!DOCTYPE html><html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Log-Parser LogHub Full Benchmark</title>
<style>
:root{--bg:#fff;--fg:#1a1a2e;--accent:#2563eb;--bdr:#e5e7eb;--green:#059669;--red:#dc2626;--muted:#6b7280;--card:#f9fafb;--yellow:#d97706}
@media(prefers-color-scheme:dark){:root{--bg:#0f172a;--fg:#e2e8f0;--accent:#60a5fa;--bdr:#334155;--green:#34d399;--red:#f87171;--muted:#94a3b8;--card:#1e293b;--yellow:#fbbf24}}
*{box-sizing:border-box}body{font-family:system-ui,sans-serif;background:var(--bg);color:var(--fg);margin:2rem auto;padding:0 1rem;max-width:1400px}
h1{border-bottom:2px solid var(--accent);padding-bottom:.5rem}
h2{margin-top:2rem}.meta{color:var(--muted);font-size:.85rem;margin-bottom:1rem}
.card{background:var(--card);border:1px solid var(--bdr);border-radius:8px;padding:1.5rem;text-align:center;min-width:120px}
.cards{display:flex;gap:1rem;flex-wrap:wrap;margin:1rem 0}
.card .value{font-size:2rem;font-weight:700;color:var(--accent)}.card .label{font-size:.85rem;color:var(--muted)}
table{width:100%;border-collapse:collapse;margin:1rem 0;font-size:.9rem}
th,td{text-align:right;padding:.5rem .75rem;border-bottom:1px solid var(--bdr)}
th:first-child,td:first-child{text-align:left}
th:nth-child(2),td:nth-child(2){text-align:right}
th{background:var(--bdr);font-weight:600}td:first-child{font-weight:500}
.pass{color:var(--green)}.fail{color:var(--red)}.warn{color:var(--yellow)}
a{color:var(--accent)}a:hover{opacity:.8}
tr:hover{background:var(--card)}.best{font-weight:700;color:var(--green)}
</style></head><body>
<h1>Log-Parser LogHub Full Benchmark</h1>
<p class="meta">Generated: ${genDate} · ${rows.length} datasets parallel · drain-only · <a href="/log-parser/">← back to benchmarks</a> · <a href="/log-parser/2k/">LogHub-2k →</a></p>

<div class="cards">
<div class="card"><div class="value">${rows.length}</div><div class="label">Datasets</div></div>
<div class="card"><div class="value">${fmtMessages(totalLogs)}</div><div class="label">Total Logs</div></div>
<div class="card"><div class="value">${(avgGA * 100).toFixed(2)}%</div><div class="label">Avg GA</div></div>
<div class="card"><div class="value">${(avgPTA * 100).toFixed(2)}%</div><div class="label">Avg PTA</div></div>
<div class="card"><div class="value">${passCount}/${rows.length}</div><div class="label">Passing</div></div>
</div>

<h2>Per-Dataset Results — drain-ts (Production Scale)</h2>
<table><thead><tr>
<th>Dataset</th><th>Category</th><th>Messages</th><th>GA</th><th>FGA</th><th>PTA</th><th>FTA</th>
<th>GA Target</th><th>PTA Target</th><th>Time</th><th>Throughput</th>
</tr></thead><tbody>
${rows.map(r => {
  const gaClass = r.gaPass ? "pass" : "fail";
  const ptaClass = r.ptaPass ? "pass" : "fail";
  return `<tr>
    <td>${r.dataset}</td>
    <td>${r.category}</td>
    <td>${fmtMessages(r.messages)}</td>
    <td class="${gaClass}">${fmtPercent(r.ga)}</td>
    <td>${fmtPercent(r.fga)}</td>
    <td class="${ptaClass}">${fmtPercent(r.pta)}</td>
    <td>${fmtPercent(r.fta)}</td>
    <td>${fmtPercent(r.targetGA)}</td>
    <td>${fmtPercent(r.targetPTA)}</td>
    <td>${r.timeStr}</td>
    <td>${r.throughputStr}</td>
  </tr>`;
}).join("\n") || `<tr><td colspan="11" style="text-align:center;color:var(--muted);padding:2rem">No benchmark results available. All dataset downloads may have failed. Check CI logs for details.</td></tr>`}
</tbody></table>

<p class="meta">GA, FGA, PTA, FTA computed using logpai/logparser-compatible compact evaluation · Target thresholds from drain-ts published benchmarks · Higher is better for all metrics · Green = meets or exceeds target</p>
</body></html>`;
}

// ============================================================
// Main
// ============================================================
async function main() {
  const args = process.argv.slice(2);
  const resultsDir = args[0] ?? process.env.FULL_RESULTS_DIR ?? "/tmp/full-results";
  const outDir = args[1] ?? process.env.OUTPUT_DIR ?? "docs/full";

  console.log(`Full benchmark report generator`);
  console.log(`  Results dir: ${resultsDir}`);
  console.log(`  Output dir:  ${outDir}`);

  const files = findBenchmarkFiles(resultsDir);

  if (files.length === 0) {
    console.warn("WARNING: No benchmark result files found. Generating placeholder report.\n");
  }

  const rows: FullRow[] = [];

  for (const file of files) {
    console.log(`  Reading: ${file}`);
    const content = fs.readFileSync(file, "utf-8");
    const lines = content.split("\n");

    for (const line of lines) {
      const row = parseRow(line);
      if (row) {
        rows.push(row);
        console.log(`    → ${row.dataset}: GA=${fmtPercent(row.ga)} PTA=${fmtPercent(row.pta)} Messages=${row.messages.toLocaleString()}`);
      }
    }
  }

  // Deduplicate by dataset name (keep last occurrence)
  const seen = new Map<string, FullRow>();
  for (const row of rows) {
    seen.set(row.dataset, row);
  }
  const uniqueRows = [...seen.values()].sort((a, b) => a.dataset.localeCompare(b.dataset));

  fs.mkdirSync(outDir, { recursive: true });

  const genDate = new Date().toISOString();

  // Generate warning if no data found
  if (uniqueRows.length === 0 && files.length > 0) {
    console.warn("WARNING: All benchmark files were found but contained no successful results. Check if datasets failed to download.");
  }

  const html = genHtml(uniqueRows, genDate);

  fs.writeFileSync(path.join(outDir, "index.html"), html);
  console.log(`\nReport written to ${outDir}/index.html (${uniqueRows.length} datasets)`);
}

main().catch((e) => {
  console.error("Report generation failed:", e);
  process.exit(1);
});
