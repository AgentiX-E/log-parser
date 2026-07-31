#!/usr/bin/env node
/**
 * LogHub-2k benchmark HTML report generator.
 * Reads benchmark output from stdin — does NOT re-run the benchmark.
 *
 * Usage in CI:
 *   benchmark-2k job runs benchmark → pipes output to report-2k job
 *   cat results.txt | npx tsx benchmark/report.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";

// drain-ts published results (from agentix-e.github.io/drain-ts/benchmark-report/2k/)
const DRAIN_TS: Record<string, { ga: number; pta: number }> = {
  HDFS: { ga: 0.9985, pta: 0.7624 }, Hadoop: { ga: 0.9990, pta: 0.7978 },
  Spark: { ga: 1.0, pta: 0.8976 }, OpenStack: { ga: 0.96, pta: 0.7309 },
  Zookeeper: { ga: 0.9985, pta: 0.8883 }, BGL: { ga: 1.0, pta: 0.8308 },
  HPC: { ga: 0.998, pta: 0.8554 }, Thunderbird: { ga: 0.9805, pta: 0.8339 },
  Linux: { ga: 1.0, pta: 0.8545 }, Mac: { ga: 0.9375, pta: 0.7937 },
  Apache: { ga: 1.0, pta: 0.9211 }, OpenSSH: { ga: 1.0, pta: 0.8114 },
  Windows: { ga: 0.998, pta: 0.8780 }, Android: { ga: 0.9985, pta: 0.7174 },
  HealthApp: { ga: 1.0, pta: 0.8794 }, Proxifier: { ga: 0.9795, pta: 0.7750 },
};

interface Row {
  dataset: string;
  ga: number; pta: number;
  refinedGa: number; refinedPta: number;
}

function parseLine(line: string): Row | null {
  // LLM-enhanced datasets have an "[LLM]" tag between name and metrics:
  //   "  OpenStack [LLM]  GA:70.1%→73.4%+3.3pp    PTA:65.2%→72.1%+6.9pp"
  // Non-LLM datasets omit the tag:
  //   "  HDFS            GA:99.9%→99.9%~         PTA:76.2%→76.2%~"
  const m = line.match(/^(\S+)(?:\s+\[LLM\])?\s+GA:([\d.]+)%→([\d.]+)%\s.*PTA:([\d.]+)%→([\d.]+)%/);
  if (!m) return null;
  return {
    dataset: m[1]!,
    ga: parseFloat(m[2]!) / 100, pta: parseFloat(m[4]!) / 100,
    refinedGa: parseFloat(m[3]!) / 100, refinedPta: parseFloat(m[5]!) / 100,
  };
}

function fmt(n: number): string { return (n * 100).toFixed(1) + "%"; }
function delta(a: number, b: number): string {
  const d = (b - a) * 100;
  if (d > 0) return "+" + d.toFixed(1) + "pp";
  if (d < 0) return d.toFixed(1) + "pp";
  return "~";
}

async function main() {
  const input = await new Promise<string>((resolve, reject) => {
    if (!process.stdin.isTTY) {
      const chunks: Buffer[] = [];
      process.stdin.on("data", (d: Buffer) => chunks.push(d));
      process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString()));
      process.stdin.on("error", reject);
      process.stdin.resume();
    } else {
      // fallback: read from file argument
      const file = process.argv[2] ?? "/dev/stdin";
      try { resolve(fs.readFileSync(file, "utf-8")); } catch { reject(new Error("No input")); }
    }
  });

  const lines = input.split("\n");
  const rows: Row[] = [];
  for (const line of lines) {
    const row = parseLine(line);
    if (row) rows.push(row);
  }

  // Parse LLM summary
  const llmCalls = parseInt(input.match(/Total LLM calls:\s*(\d+)/)?.[1] ?? "0");
  const llmTokens = parseInt((input.match(/Total tokens consumed:\s*([\d,]+)/)?.[1] ?? "0").replace(/,/g, ""));

  const outDir = process.env.OUTPUT_DIR || "benchmark";
  fs.mkdirSync(outDir, { recursive: true });

  const html = `<!DOCTYPE html><html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Log-Parser LogHub-2k Benchmark</title>
<style>
:root{--bg:#fff;--fg:#1a1a2e;--accent:#2563eb;--bdr:#e5e7eb;--green:#059669;--red:#dc2626;--muted:#6b7280;--card:#f9fafb}
@media(prefers-color-scheme:dark){:root{--bg:#0f172a;--fg:#e2e8f0;--accent:#60a5fa;--bdr:#334155;--green:#34d399;--red:#f87171;--muted:#94a3b8;--card:#1e293b}}
*{box-sizing:border-box}body{font-family:system-ui,sans-serif;background:var(--bg);color:var(--fg);margin:2rem auto;padding:0 1rem;max-width:1400px}
h1{border-bottom:2px solid var(--accent);padding-bottom:.5rem}
h2{margin-top:2rem}.meta{color:var(--muted);font-size:.85rem;margin-bottom:1rem}
.card{background:var(--card);border:1px solid var(--bdr);border-radius:8px;padding:1.5rem;text-align:center;min-width:120px}
.cards{display:flex;gap:1rem;flex-wrap:wrap;margin:1rem 0}
.card .value{font-size:2rem;font-weight:700;color:var(--accent)}.card .label{font-size:.85rem;color:var(--muted)}
table{width:100%;border-collapse:collapse;margin:1rem 0;font-size:.9rem}
th,td{text-align:right;padding:.5rem .75rem;border-bottom:1px solid var(--bdr)}
th:first-child,td:first-child{text-align:left}th{background:var(--bdr);font-weight:600}td:first-child{font-weight:500}
.pos{color:var(--green)}.neg{color:var(--red)}.zero{color:var(--muted)}
a{color:var(--accent)}a:hover{opacity:.8}
</style></head><body>
<h1>Log-Parser LogHub-2k Benchmark Report</h1>
<p class="meta">Generated: ${new Date().toISOString()} · <a href="/log-parser/">← back to benchmarks</a> · <a href="/log-parser/full/">LogHub Full →</a></p>

<div class="cards">
<div class="card"><div class="value">${rows.length}</div><div class="label">Datasets</div></div>
<div class="card"><div class="value">${llmCalls}</div><div class="label">LLM Calls</div></div>
<div class="card"><div class="value">${(llmTokens/1000).toFixed(0)}K</div><div class="label">Tokens</div></div>
<div class="card"><div class="value">$${(llmTokens*1.4e-6).toFixed(3)}</div><div class="label">Est. Cost</div></div>
</div>

<h2>Dataset Comparison — drain-ts vs log-parser</h2>
<table><thead><tr>
<th>Dataset</th><th>drain-ts GA</th><th>drain-ts PTA</th>
<th>LP Drain GA</th><th>LP Drain PTA</th>
<th>LP Refined GA</th><th>LP Refined PTA</th>
<th>GA Δ</th><th>PTA Δ</th>
</tr></thead><tbody>
${rows.map(r => {
  const dt = DRAIN_TS[r.dataset] ?? { ga: 0, pta: 0 };
  return `<tr>
    <td>${r.dataset}</td>
    <td>${fmt(dt.ga)}</td><td>${fmt(dt.pta)}</td>
    <td>${fmt(r.ga)}</td><td>${fmt(r.pta)}</td>
    <td>${fmt(r.refinedGa)}</td><td>${fmt(r.refinedPta)}</td>
    <td class="${r.refinedGa > r.ga ? 'pos' : r.refinedGa < r.ga ? 'neg' : 'zero'}">${delta(r.ga, r.refinedGa)}</td>
    <td class="${r.refinedPta > r.pta ? 'pos' : r.refinedPta < r.pta ? 'neg' : 'zero'}">${delta(r.pta, r.refinedPta)}</td>
  </tr>`;
}).join('\n')}
</tbody></table>

<p class="meta">LLM-enhanced datasets: OpenStack, Thunderbird, Windows, Android, Proxifier · SynLogRefiner applied to all others · skipRefinement: HDFS, Hadoop, Spark, Zookeeper, HPC, Mac, Apache, HealthApp</p>
</body></html>`;

  fs.writeFileSync(path.join(outDir, "index.html"), html);
  console.log(`Report written to ${outDir}/index.html (${rows.length} datasets, ${llmCalls} LLM calls, ${llmTokens.toLocaleString()} tokens)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
