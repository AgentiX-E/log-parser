# Changelog

## [Unreleased] — 2026-08-01

### Added
- **SynLogTemplateRefiner** wired into `LogParserPipeline` via `refineTemplates()` method
- **ModelRouter** auto-created when `localLlmProvider` + `remoteLlmProvider` provided to `LogParserPipelineConfig`
- **OTel instrumentation** in server: `instrumentPipeline()` wraps every `parse()` call with spans
- **GET /api/v1/metrics** — Prometheus-compatible metrics endpoint (log_parser_logs_total, drain_hits, llm_calls, etc.)
- **DeepSeek LLM E2E integration test** (`deepseek-e2e.test.ts`) — `runIf(hasApiKey)` pattern
- **`drain-synlog` source type** in `LogParseResult` for SynLog-refined templates

### Changed
- **README**: replaced aspirational benchmark numbers with verified LogHub-2k data (16/16 datasets, GA 0.990, PTA 0.825/0.829)
- **White paper v3.2.0**: clear "npm library, not ops platform" positioning; removed all false claims (gRPC, Helm, K8s, 60/60 score)
- **Technical design doc**: removed unimplemented features (ClusterPipeline, gRPC API); updated architecture diagram
- **Benchmark**: added Path B evaluation via `LogParserPipeline.parseBatch()` alongside raw TemplateMiner Path A
- **Benchmark LLM config**: fully externalized via `LOG_PARSER_BENCH_LLM_URL/MODEL/API_KEY` env vars; no DeepSeek lock-in
- **Server**: `createServer()` uses `process.once()` for SIGTERM/SIGINT (fixed MaxListeners leak at 21+ accumulated handlers)
- **Benchmark DATASETS**: fixed 3 duplicate `skipRefinement` properties (Hadoop, HPC, HealthApp)

### Coverage
- **5/7 packages at 100% all-4D**: node, webllm, cli, server, llm
- **26/28 dimensions ≥95%** (from 12/28 baseline)
- Core: stmts 93→95.1%, funcs 94→96.0%, lines 93→96.1%
- Server: 82→98.6% stmts, 79→95% funcs, 84→100% lines
- webllm: 75→100% all-4D
- llm: 66→100% all-4D

### Tests
- **651 tests** (from 544 baseline), zero regressions
- +107 tests across all packages
- 19 commits by Lambertyan

