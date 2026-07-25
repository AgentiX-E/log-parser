import type { ITokenizer } from './ITokenizer.js';

export class FallbackTokenizer implements ITokenizer {
  readonly id = 'fallback';

  tokenize(text: string): string[] {
    return text.split(/\s+/).filter((t) => t.length > 0);
  }
}
