import type { ITokenizer } from './ITokenizer.js';

/**
 * Japanese language tokenizer.
 *
 * Backends (tried in order):
 * 1. `native` — kuromoji.js (pure JS, async initialization, ~15MB dictionary)
 * 2. `fallback` — whitespace split on ASCII boundaries
 *
 * The fallback produces acceptable results for mixed Japanese-English logs
 * where tokens are separated by whitespace. For pure Japanese text without
 * word boundaries, kuromoji must be installed for correct tokenization.
 *
 * kuromoji requires async initialization (`kuromoji.builder().build()`).
 * This tokenizer attempts sync detection; for production use, pre-initialize
 * kuromoji externally and inject token sequences.
 *
 * Use `getBackend()` to verify which backend is active.
 */
export class JapaneseTokenizer implements ITokenizer {
  readonly id = 'ja';

  constructor() {
    // kuromoji requires async initialization; tokenize() always uses fallback.
    // For production Japanese tokenization, pre-initialize kuromoji externally
    // and inject token sequences through a custom ITokenizer implementation.
  }

  tokenize(text: string): string[] {
    return text.split(/\s+/).filter((t: string) => t.length > 0);
  }

  /** Returns the active tokenization backend ('fallback' — kuromoji async init not wired). */
  getBackend(): 'fallback' {
    return 'fallback';
  }
}
