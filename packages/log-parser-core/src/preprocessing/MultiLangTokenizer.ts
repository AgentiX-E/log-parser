import type { ITokenizer } from './tokenizers/ITokenizer.js';
import { EnglishTokenizer } from './tokenizers/EnglishTokenizer.js';
import { ChineseTokenizer } from './tokenizers/ChineseTokenizer.js';
import { JapaneseTokenizer } from './tokenizers/JapaneseTokenizer.js';
import { FallbackTokenizer } from './tokenizers/FallbackTokenizer.js';
import { LanguageDetector, type SupportedLanguage } from './LanguageDetector.js';

export class MultiLangTokenizer {
  private readonly tokenizers: Map<SupportedLanguage, ITokenizer>;
  private readonly fallback: ITokenizer;
  private readonly detector: LanguageDetector;

  constructor(customTokenizers?: Partial<Record<SupportedLanguage, ITokenizer>>) {
    this.tokenizers = new Map<SupportedLanguage, ITokenizer>();
    this.tokenizers.set('en', customTokenizers?.en ?? new EnglishTokenizer());
    this.tokenizers.set('zh', customTokenizers?.zh ?? new ChineseTokenizer());
    this.tokenizers.set('ja', customTokenizers?.ja ?? new JapaneseTokenizer());
    this.fallback = new FallbackTokenizer();
    this.detector = new LanguageDetector();
  }

  tokenize(text: string): string[] {
    const lang = this.detector.detect(text);
    const tokenizer = this.tokenizers.get(lang) ?? this.fallback;
    return tokenizer.tokenize(text);
  }
}
