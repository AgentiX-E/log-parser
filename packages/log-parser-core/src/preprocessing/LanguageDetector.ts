import { franc } from 'franc-min';

export type SupportedLanguage = 'zh' | 'ja' | 'en' | 'other';

/**
 * Language detection for multi-language log tokenization.
 *
 * Uses franc-min for statistical language detection. Falls back
 * to 'other' when the input is too short or ambiguous.
 *
 * Supported languages:
 * - 'zh' — Chinese (Mandarin, detected as 'cmn' by franc)
 * - 'ja' — Japanese (detected as 'jpn')
 * - 'en' — English (detected as 'eng')
 * - 'other' — unrecognized language
 */
export function detectLanguage(text: string): SupportedLanguage {
  if (!text || text.trim().length < 3) return 'other';
  const code = franc(text, { minLength: 3, only: ['cmn', 'jpn', 'eng'] });
  switch (code) {
    case 'cmn': return 'zh';
    case 'jpn': return 'ja';
    case 'eng': return 'en';
    default: return 'other';
  }
}
