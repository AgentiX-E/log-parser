import type { ITokenizer } from './ITokenizer.js';

export class JapaneseTokenizer implements ITokenizer {
  readonly id = 'ja';

  tokenize(text: string): string[] {
    // Uses whitespace split as universal fallback.
    // Native kuromoji.js integration deferred to I2 (async init pattern).
    return text.split(/\s+/).filter((t: string) => t.length > 0);
  }
}
