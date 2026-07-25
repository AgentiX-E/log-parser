import type { ITokenizer } from './ITokenizer.js';

export class EnglishTokenizer implements ITokenizer {
  readonly id = 'en';

  tokenize(text: string): string[] {
    // Uses whitespace split as universal fallback.
    // Native natural.WordTokenizer integration deferred to I2 (optional dep).
    return text.split(/\s+/).filter((t: string) => t.length > 0);
  }
}
