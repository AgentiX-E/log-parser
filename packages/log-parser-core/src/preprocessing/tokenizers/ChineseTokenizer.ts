import type { ITokenizer } from './ITokenizer.js';

export class ChineseTokenizer implements ITokenizer {
  readonly id = 'zh';

  tokenize(text: string): string[] {
    // Uses whitespace split as universal fallback.
    // Native nodejieba integration deferred to I2 (optional dep).
    return text.split(/\s+/).filter((t: string) => t.trim().length > 0);
  }
}
