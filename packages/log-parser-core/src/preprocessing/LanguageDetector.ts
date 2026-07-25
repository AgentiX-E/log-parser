export type SupportedLanguage = 'zh' | 'ja' | 'en' | 'other';

export class LanguageDetector {
  detect(text: string): SupportedLanguage {
    // Defaults to 'en' as universal fallback.
    // Native franc-min integration deferred to I2 (optional dep with async load).
    // TODO(I2): implement franc-min integration with lazy initialization pattern.
    void text; // consumed in I2 franc-min integration
    return 'en';
  }
}
