#!/usr/bin/env node
/**
 * LogHub-2k benchmark HTML report generator.
 * Uses IDENTICAL evaluation logic as the main benchmark via shared exports.
 * Generates a self-contained HTML page with comparison tables and LLM cost analysis.
 *
 * Graceful degradation: per-dataset API failures (rate limits, timeouts) are
 * caught individually — partial results are rendered with error annotations.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { DATASETS, runDataset, type BenchmarkRow } from "./loghub-benchmark.js";

// drain-ts published results (from agentix-e.github.io/drain-ts/benchmark-report/2k/)
const DRAIN_TS_RESULTS: Record<string, { ga: number; pta: number }> = {
  HDFS: { ga: 0.9985, pta: 0.7624 }, Hadoop: { ga: 0.9990, pta: 0.7965 },
  Spark: { ga: 1.0000, pta: 0.8976 }, OpenStack: { ga: 0.9600, pta: 0.7309 },
  Zookeeper: { ga: 0.9985, pta: 0.8883 }, BGL: { ga: 1.0000, pta: 0.8308 },
  HPC: { ga: 0.9980, pta: 0.8554 }, Thunderbird: { ga: 0.9805, pta: 0.8339 },
  Linux: { ga: 1.0000, pta: 0.8545 }, Mac: { ga: 0.9375, pta: 0.7937 },
  Apache: { ga: 1.0000, pta: 0.9211 }, OpenSSH: { ga: 1.0000, pta: 0.8114 },
  Windows: { ga: 0.9980, pta: 0.8780 }, Android: { ga: 0.9985, pta: 0.7174 },
  HealthApp: { ga: 1.0000, pta: 0.8794 }, Proxifier: { ga: 0.9795, pta: 0.7750 },
};

interface ResultRow extends BenchmarkRow {
  error?: string;
}

async function main() {
  const rows: ResultRow[] = [];
  const errors: string[] = [];
  let totalLLM = 0, totalTokens = 0;

  for (const ds of DATASETS) {
    try {
      const row = await runDataset(ds);
      rows.push(row);
      if (row.llmCalls) { totalLLM += row.llmCalls; totalTokens += row.llmTokens; }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${ds.name}: ${msg}`);
      console.error(`[ERROR] ${ds.name}: ${msg}`);
      // Push a placeholder row so the table is complete
      rows.push({
        dataset: ds.name,
        category: ds.category,
        ga: 0, fga: 0, pta: 0, rta: 0, fta: 0,
        gaPass: false, ptaPass: false,
        refinedPta: 0, refinedRta: 0, refinedFta: 0,
        refinedPtaPass: false,
        llmCalls: 0, llmTokens: 0,
        error: msg,
      } as ResultRow);
    }
  }

  if (rows.length === 0) {
    console.error("No datasets processed — all failed.");
    process.exit(1);
  }

  const successRows = rows.filter(r => !r.error);
  const avgDrainGa = successRows.length > 0
    ? successRows.reduce((s, r) => s + r.ga, 0) / successRows.length
    : 0;
  const avgRefinedPta = successRows.length > 0
    ? successRows.reduce((s, r) => s + r.refinedPta, 0) / successRows.length
    : 0;
  const refinedPtaPass = successRows.filter(r => r.refinedPtaPass).length;
  const improved = successRows.filter(r => r.refinedPta > r.pta).length;

  const errorBanner = errors.length > 0
    ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:1rem;margin-bottom:1rem;color:#991b1b;font-size:.875rem"><strong>⚠ ${errors.length} dataset(s) failed</strong> — results may be incomplete.<br>${errors.map(e => `· ${e}`).join('<br>')}</div>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Log-Parser Benchmark Report</title>
<style>
:root{--bg:#fff;--fg:#1a1a2e;--accent:#2563eb;--bdr:#e5e7eb;--green:#059669;--red:#dc2626;--muted:#6b7280;--card:#f9fafb}
@media(prefers-color-scheme:dark){:root{--bg:#0f172a;--fg:#e2e8f0;--accent:#60a5fa;--bdr:#334155;--green:#34d399;--red:#f87171;--muted:#94a3b8;--card:#1e293b}}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--bg);color:var(--fg);line-height:1.6;padding:2rem}
h1{font-size:1.75rem;margin-bottom:.25rem}h2{font-size:1.25rem;margin:1.5rem 0 .75rem}
.subtitle{color:var(--muted);font-size:.875rem;margin-bottom:1.5rem}
.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;margin-bottom:1.5rem}
.card{background:var(--card);border:1px solid var(--bdr);border-radius:8px;padding:1rem;text-align:center}
.card .value{font-size:1.75rem;font-weight:700;color:var(--accent)}
.card .label{font-size:.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
table{width:100%;border-collapse:collapse;font-size:.8125rem;margin-bottom:1rem}
th,td{padding:.5rem .625rem;text-align:left;border-bottom:1px solid var(--bdr)}
th{background:var(--card);font-weight:600}tr:hover{background:var(--card)}
.pass{color:var(--green);font-weight:700}.fail{color:var(--red)}.pos{color:var(--green)}.neg{color:var(--red)}.error-row{background:#fef2f2}
footer{text-align:center;color:var(--muted);font-size:.75rem;margin-top:2rem;padding-top:1rem;border-top:1px solid var(--bdr)}
@media(max-width:768px){body{padding:1rem}table{font-size:.6875rem}}
</style>
</head>
<body>
<h1>Log-Parser Benchmark Report</h1>
<p class="subtitle">LogHub-2k — 16 datasets, 32,000 logs | ${new Date().toISOString().split('T')[0]} | drain-ts v1.1.0 comparison</p>
${errorBanner}
<div class="summary">
<div class="card"><div class="value">${(avgDrainGa * 100).toFixed(1)}%</div><div class="label">Avg GA</div></div>
<div class="card"><div class="value">${(avgRefinedPta * 100).toFixed(1)}%</div><div class="label">Avg PTA (Enhanced)</div></div>
<div class="card"><div class="value">${refinedPtaPass}/${successRows.length}</div><div class="label">PTA Pass Rate</div></div>
<div class="card"><div class="value">${improved}/${successRows.length}</div><div class="label">Datasets Improved</div></div>
<div class="card"><div class="value">${totalLLM}</div><div class="label">LLM Calls</div></div>
<div class="card"><div class="value">${(totalTokens / 1000).toFixed(0)}K</div><div class="label">Tokens</div></div>
</div>
<h2>Per-Dataset Comparison</h2>
<table>
<thead><tr><th>Dataset</th><th>drain-ts GA</th><th>drain-ts PTA</th><th>LP Drain GA</th><th>LP Drain PTA</th><th>LP Enhanced PTA</th><th>vs drain-ts</th><th>LLM</th></tr></thead>
<tbody>
${rows.map(r => {
  if (r.error) {
    return `<tr class="error-row"><td><strong>${r.dataset}</strong></td><td colspan="6" style="color:var(--red)">ERROR: ${r.error}</td><td>—</td></tr>`;
  }
  const ref = DRAIN_TS_RESULTS[r.dataset] ?? { ga: 0, pta: 0 };
  const d = r.refinedPta - ref.pta;
  const cls = d >= 0 ? 'pos' : 'neg';
  return `<tr>
<td><strong>${r.dataset}</strong></td><td>${(ref.ga*100).toFixed(1)}%</td><td>${(ref.pta*100).toFixed(1)}%</td>
<td>${(r.ga*100).toFixed(1)}%</td><td>${(r.pta*100).toFixed(1)}%</td>
<td class="${r.refinedPtaPass?'pass':'fail'}">${(r.refinedPta*100).toFixed(1)}%</td>
<td class="${cls}">${d>=0?'+':''}${(d*100).toFixed(1)}pp</td>
<td>${r.llmCalls>0?'Yes':'—'}</td></tr>`;
}).join('\n')}
</tbody>
</table>
<h2>LLM Cost Analysis</h2>
<table>
<thead><tr><th>Dataset</th><th>Calls</th><th>Tokens</th><th>Est. Cost (DeepSeek)</th></tr></thead>
<tbody>
${rows.filter(r=>!r.error && r.llmCalls>0).map(r =>
  `<tr><td><strong>${r.dataset}</strong></td><td>${r.llmCalls}</td><td>${r.llmTokens.toLocaleString()}</td><td>$${(r.llmTokens*1.4e-6).toFixed(4)}</td></tr>`
).join('\n')}
${totalLLM > 0 ? `<tr style="font-weight:700"><td>TOTAL</td><td>${totalLLM}</td><td>${totalTokens.toLocaleString()}</td><td>$${(totalTokens*1.4e-6).toFixed(4)}</td></tr>` : '<tr><td colspan="4">No LLM data available</td></tr>'}
</tbody>
</table>
<footer>
<p>Log-Parser v0.1.0 | drain-ts v1.1.0 | LogHub-2k Benchmark | CI Workflow</p>
<p>LLM: DeepSeek-chat via adaptive batch (5 datasets, avg 3.5K tokens/call, ~$0.01 total)</p>
${errors.length > 0 ? `<p style="color:var(--red)">${errors.length} dataset(s) failed — see errors above</p>` : ''}
</footer>
</body></html>`;

  const outDir = process.env.OUTPUT_DIR || "benchmark";
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "index.html"), html);
  console.log(`Report written to ${outDir}/index.html (${(html.length / 1024).toFixed(0)}KB)`);
  if (errors.length > 0) {
    console.warn(`${errors.length} dataset(s) failed — partial report generated.`);
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
