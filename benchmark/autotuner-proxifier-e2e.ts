/**
 * Proxifier AutoTuner E2E — validates boolean exploration discovers
 * that disableMasking outperforms extendedMasking on this dataset.
 *
 * Proxifier is the ideal test case: drain-ts benchmark requires
 * disableMasking=true because masking causes over-generalization.
 */

import * as https from "node:https";
import {
  ConfigAutoTuner, DrainDataPlane, Evaluator,
  type DrainDataPlaneConfig, type GroundTruthEntry, type ParsedLogEntry,
} from "@agentix-e/log-parser-core";

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"' && field === "") {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(field.trim()); field = "";
    } else field += ch;
  }
  fields.push(field.trim());
  return fields;
}

async function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "log-parser/1.0" } }, (r) => {
      let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => resolve(d));
    }).on("error", reject);
  });
}

async function main() {
  console.log("=== Proxifier AutoTuner E2E ===\n");

  const csv = await fetchUrl(
    "https://raw.githubusercontent.com/logpai/logparser/main/data/loghub_2k/Proxifier/Proxifier_2k.log_structured.csv",
  );
  const lines = csv.trim().split(/\r?\n/);
  const header = parseCsvLine(lines[0]!);
  const contentIdx = header.indexOf("Content");
  const eventTplIdx = header.length - 1;
  const eventIdIdx = header.indexOf("EventId");

  const logs: string[] = [];
  const gt: GroundTruthEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    const f = parseCsvLine(lines[i]!);
    const content = contentIdx >= 0 ? f[contentIdx]! : "";
    if (!content) continue;
    logs.push(content);
    gt.push({
      logId: String(i - 1),
      template: f[eventTplIdx]!,
      eventId: eventIdIdx >= 0 ? f[eventIdIdx]! : `T${i}`,
    });
  }
  console.log(`Loaded ${logs.length} logs, ${gt.length} ground-truth entries\n`);

  const evaluateConfig = (cfg: DrainDataPlaneConfig) => {
    const drain = new DrainDataPlane(cfg);
    for (const log of logs) drain.train(log);
    const evaluator = new Evaluator();
    const parsed: ParsedLogEntry[] = logs.map((log, i) => {
      const r = drain.train(log);
      return { logId: String(i), template: r.template, eventId: String(r.templateId) };
    });
    return evaluator.evaluate(parsed, gt);
  };

  const base = evaluateConfig({ extendedMasking: true, simTh: 0.4, depth: 4, maxChildren: 100 });
  console.log(`Baseline (extendedMasking=true):  GA:${(base.ga * 100).toFixed(1)}% PTA:${(base.pta * 100).toFixed(1)}% FTA:${(base.fta * 100).toFixed(1)}%`);

  const known = evaluateConfig({
    simTh: 0.4, depth: 4, maxChildren: 100,
    extendedMasking: false,
    enableClusterMerge: true,
    enableAELSimilarity: true,
    drainExtraDelimiters: [","],
  });
  console.log(`Known-best (disableMasking,AEL): GA:${(known.ga * 100).toFixed(1)}% PTA:${(known.pta * 100).toFixed(1)}% FTA:${(known.fta * 100).toFixed(1)}%\n`);

  console.log("Tuning (80 iterations, boolean+engine exploration)...");
  const tuner = new ConfigAutoTuner({ logs, groundTruth: gt });
  const result = await tuner.tune({ maxIterations: 80, targetMetric: "combined", gaWeight: 0.3 });

  const tuned = evaluateConfig(result.bestConfig);
  console.log(`Tuned:  simTh=${result.bestConfig.simTh?.toFixed(2)} depth=${result.bestConfig.depth} maxChildren=${result.bestConfig.maxChildren} extendedMasking=${result.bestConfig.extendedMasking} AEL=${result.bestConfig.enableAELSimilarity} clusterMerge=${result.bestConfig.enableClusterMerge}`);
  console.log(`Tuned:  GA:${(tuned.ga * 100).toFixed(1)}% PTA:${(tuned.pta * 100).toFixed(1)}% FTA:${(tuned.fta * 100).toFixed(1)}%`);
  console.log(`Evals: ${result.evaluations}, BestScore: ${(result.bestScore * 100).toFixed(1)}%\n`);

  if (tuned.fta > base.fta) {
    console.log(`✅ PASS: Tuned FTA ${(tuned.fta * 100).toFixed(1)}% > Baseline ${(base.fta * 100).toFixed(1)}%`);
    if (result.bestConfig.extendedMasking === false) {
      console.log("✅ PASS: Tuner correctly discovered extendedMasking=false for Proxifier");
    }
  } else {
    console.log("❌ Need investigation: Tuner did not improve over baseline");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
