import type { ITokenizer } from './tokenizers/ITokenizer.js';
import { EnglishTokenizer } from './tokenizers/EnglishTokenizer.js';
import { ChineseTokenizer } from './tokenizers/ChineseTokenizer.js';
import { JapaneseTokenizer } from './tokenizers/JapaneseTokenizer.js';
import { detectLanguage, type SupportedLanguage } from './LanguageDetector.js';

export class MultiLangTokenizer {
  private readonly tokenizers: Map<SupportedLanguage, ITokenizer>;

  constructor(customTokenizers?: Partial<Record<SupportedLanguage, ITokenizer>>) {
    this.tokenizers = new Map<SupportedLanguage, ITokenizer>();
    this.tokenizers.set('en', customTokenizers?.en ?? new EnglishTokenizer());
    this.tokenizers.set('zh', customTokenizers?.zh ?? new ChineseTokenizer());
    this.tokenizers.set('ja', customTokenizers?.ja ?? new JapaneseTokenizer());
  }

  tokenize(text: string): string[] {
    const lang = this.detectLanguage(text);
    const tokenizer = this.tokenizers.get(lang) ?? this.tokenizers.get('en')!;
    return tokenizer.tokenize(text);
  }

  private detectLanguage(text: string): SupportedLanguage {
    const direct = detectLanguage(text);
    if (direct !== 'other') return direct;
    // For unrecognized text, try English tokenizer as universal fallback
    return 'en';
  }
}
