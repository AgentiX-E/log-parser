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
  LogParseResult,
  ParseSource,
  PipelineLayerConfig,
  PipelineStats,
} from './pipeline/types.js';
export { defaultPipelineConfig } from './pipeline/types.js';

// ── Pipeline ──
export { LogParserPipeline, type LogParserPipelineConfig } from './pipeline/LogParserPipeline.js';

// ── Data plane ──
export { DrainDataPlane } from './data/DrainDataPlane.js';

// ── Classifier ──
export { VariableTypeClassifier, type ClassificationResult, type VariableType } from './classifier/VariableTypeClassifier.js';

// ── Preprocessing ──
export { MultiLangTokenizer } from './preprocessing/MultiLangTokenizer.js';
export { LanguageDetector, type SupportedLanguage } from './preprocessing/LanguageDetector.js';
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
