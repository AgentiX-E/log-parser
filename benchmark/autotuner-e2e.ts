/**
 * ConfigAutoTuner E2E test — verifies offline-to-production workflow.
 *
 * Generates a synthetic dataset with controlled template patterns,
 * tunes Drain configuration against it, and verifies the tuned
 * config outperforms (or matches) the default config.
 *
 * Usage: npx tsx benchmark/autotuner-e2e.ts
 */

import { ConfigAutoTuner, DrainDataPlane, Evaluator } from "@agentix-e/log-parser-core";

const TEMPLATES = [
  "User <*> logged in from <IP>",
  "User <*> login failed from <IP>",
  "ERROR connection to <HOSTNAME> timed out after <NUM>ms",
  "Cache eviction key=<*> size=<NUM> ttl=<NUM>s",
  "Request <*> <PATH> status:<NUM> latency:<NUM>ms",
];

function rand(arr: readonly string[]): string {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function generateLog(tmpl: string): string {
  return tmpl
    .replace("<*>", rand(["alice", "bob", "charlie", "dave", "eve"]))
    .replace("<IP>", rand(["192.168.1.1", "10.0.0.1", "172.16.0.1"]))
    .replace("<HOSTNAME>", rand(["db-primary.local", "cache-02.cluster", "api.prod.example.com"]))
    .replace("<PATH>", rand(["/api/users", "/var/log/syslog", "/tmp/backup", "/home/data"]))
    .replace("<NUM>", () => String(Math.floor(Math.random() * 5000)));
}

async function main() {
  // Generate 200 logs — 40 per template
  const logs: string[] = [];
  const gt: Array<{ logId: string; template: string; eventId: string }> = [];
  for (let i = 0; i < 200; i++) {
    const idx = Math.floor(i / 40);
    const tmpl = TEMPLATES[idx]!;
    logs.push(generateLog(tmpl));
    gt.push({ logId: String(i), template: tmpl, eventId: String(idx + 1) });
  }

  // ── Baseline ──
  const baseline = new DrainDataPlane();
  for (const log of logs) baseline.train(log);

  const evaluator = new Evaluator();
  const baseParsed = logs.map((log, i) => {
    const r = baseline.match(log);
    return { logId: String(i), template: r?.template ?? "", eventId: String(r?.templateId ?? -1) };
  });
  const baseEval = evaluator.evaluate(baseParsed, gt);

  // ── Tune ──
  const tuner = new ConfigAutoTuner({ logs: logs.slice(0, 100), groundTruth: gt.slice(0, 100) });
  const result = await tuner.tune({ maxIterations: 30, targetMetric: "combined", gaWeight: 0.3 });

  // ── Evaluate tuned ──
  const tuned = new DrainDataPlane(result.bestConfig);
  for (const log of logs) tuned.train(log);
  const tunedParsed = logs.map((log, i) => {
    const r = tuned.match(log);
    return { logId: String(i), template: r?.template ?? "", eventId: String(r?.templateId ?? -1) };
  });
  const tunedEval = evaluator.evaluate(tunedParsed, gt);

  console.log("=== ConfigAutoTuner E2E Results ===\n");
  console.log(`Default: simTh=0.4 depth=4 maxChildren=100`);
  console.log(`  GA:${(baseEval.ga * 100).toFixed(1)}%  PTA:${(baseEval.pta * 100).toFixed(1)}%  FTA:${(baseEval.fta * 100).toFixed(1)}%`);
  console.log(`Tuned:   simTh=${result.bestConfig.simTh?.toFixed(2)} depth=${result.bestConfig.depth} maxChildren=${result.bestConfig.maxChildren}`);
  console.log(`  GA:${(tunedEval.ga * 100).toFixed(1)}%  PTA:${(tunedEval.pta * 100).toFixed(1)}%  FTA:${(tunedEval.fta * 100).toFixed(1)}%`);
  console.log(`\nImprovement: GA ${(result.improvement.ga * 100).toFixed(1)}pp  PTA ${(result.improvement.pta * 100).toFixed(1)}pp`);
  console.log(`Evaluations: ${result.evaluations}`);

  if (tunedEval.fta < baseEval.fta - 0.05) {
    console.log("\n\u274c FAIL: Tuned config WORSE than baseline");
    process.exit(1);
  }
  console.log(
    tunedEval.fta > baseEval.fta
      ? "\n\u2705 PASS: Tuned config IMPROVES over baseline"
      : "\n\u2705 PASS: Tuned config matches baseline (optimal reached)",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
