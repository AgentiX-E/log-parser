// ── LLM interfaces ──
export type {
  ILLMProvider,
  LlmTemplateResult,
  VariableAnnotation,
  VariableCategory,
} from './llm/ILLMProvider.js';

// ── Embedding interfaces ──
export type { IEmbeddingProvider } from './embedding/IEmbeddingProvider.js';

// ── Pipeline types ──
export type {
  DrainResult,
  DrainMatch,
  ExtractedParam,
  LogTemplate,
  LogParseResult,
  ParseSource,
  PipelineLayerConfig,
  PipelineStats,
} from './pipeline/types.js';
export { defaultPipelineConfig } from './pipeline/types.js';

// ── Pipeline ──
export { LogParserPipeline, type LogParserPipelineConfig } from './pipeline/LogParserPipeline.js';

// ── Data plane ──
export {
  DrainDataPlane,
  type DrainDataPlaneConfig,
  type DrainEngineType,
} from './data/DrainDataPlane.js';

// ── Masking ──
export {
  ENHANCED_MASKING_INSTRUCTIONS,
  HOSTNAME_MASK,
  BARE_HEX_MASK,
  UUID_NODASH_MASK,
} from './masking/EnhancedMasking.js';

// ── Classifier ──
export {
  VariableTypeClassifier,
  type ClassificationResult,
  type VariableType,
} from './classifier/VariableTypeClassifier.js';

// ── Preprocessing ──
export { MultiLangTokenizer } from './preprocessing/MultiLangTokenizer.js';
export {
  detectLanguage as LanguageDetector,
  type SupportedLanguage,
} from './preprocessing/LanguageDetector.js';
export { StructuredLogExtractor } from './preprocessing/StructuredLogExtractor.js';

// ── Tokenizers ──
export type { ITokenizer } from './preprocessing/tokenizers/ITokenizer.js';
export { EnglishTokenizer } from './preprocessing/tokenizers/EnglishTokenizer.js';
export { ChineseTokenizer } from './preprocessing/tokenizers/ChineseTokenizer.js';
export { JapaneseTokenizer } from './preprocessing/tokenizers/JapaneseTokenizer.js';
export { FallbackTokenizer } from './preprocessing/tokenizers/FallbackTokenizer.js';

// ── Adapters ──
export type { LogInputAdapter } from './preprocessing/adapters/LogInputAdapter.js';
export { SyslogAdapter } from './preprocessing/adapters/SyslogAdapter.js';
export { ApacheAdapter } from './preprocessing/adapters/ApacheAdapter.js';
export { JsonLogAdapter } from './preprocessing/adapters/JsonLogAdapter.js';
export { AutoDetectAdapter } from './preprocessing/adapters/AutoDetectAdapter.js';

// ── Embedding ──
export { TfIdfVectorizer } from './embedding/TfIdfVectorizer.js';
export { cosineSimilarity, cosineDistance, jaccardSimilarity } from './embedding/Similarity.js';

// ── Cache ──
export { AdaptiveTemplateCache } from './cache/AdaptiveTemplateCache.js';
export { RagTemplateRetriever } from './cache/RagTemplateRetriever.js';

// ── Control plane ──
export { PartitioningEngine } from './control/PartitioningEngine.js';
export type { MissEvent } from './control/PartitioningEngine.js';
export { DppSampler } from './control/DppSampler.js';
export { MissAccumulator } from './control/MissAccumulator.js';
export { SelfReflectionLoop } from './control/SelfReflectionLoop.js';

// ── Adaptive Learning ──
export { AdaptiveLearner } from './learning/AdaptiveLearner.js';
export { PromptBuilder } from './control/PromptBuilder.js';
export { ModelRouter } from './control/ModelRouter.js';
export { PostProcessor } from './control/PostProcessor.js';
export { SynLogTemplateRefiner } from './control/SynLogTemplateRefiner.js';
export type { RefinementInput, RefinementResult } from './control/SynLogTemplateRefiner.js';

// ── Granularity ──
export { GranularityDistance, GranularityCalibrator } from './granularity/index.js';
export type { GranularityPreference, GranularityConfig } from './granularity/index.js';

// ── Evaluation ──
export { Evaluator, BenchmarkRunner, DatasetLoader, DATASET_NAMES } from './evaluation/index.js';
export type {
  ParsedLogEntry,
  GroundTruthEntry,
  ParsingEvaluationResult,
  BenchmarkDataset,
  DatasetName,
} from './evaluation/index.js';

// ── Optimization ──
export { ConfigAutoTuner, ConfigExporter } from './optimization/index.js';
export type {
  TunerConfig,
  TunerResult,
  TunerParamSpace,
  TunerEvalStep,
} from './optimization/index.js';
