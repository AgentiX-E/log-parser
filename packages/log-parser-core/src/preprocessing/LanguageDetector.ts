export type SupportedLanguage = 'zh' | 'ja' | 'en' | 'other';

export class LanguageDetector {
  detect(_text: string): SupportedLanguage {
    // Defaults to 'en' as universal fallback.
    // Native franc-min integration deferred to I2 (optional dep with async load).
    // TODO(I2): implement franc-min integration with lazy initialization pattern.
    return 'en';
  }
}
