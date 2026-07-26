import type { ITokenizer } from './ITokenizer.js';

/**
 * Chinese language tokenizer.
 *
 * Backends (tried in order):
 * 1. `native` — nodejieba (C++ binding, fastest, requires native compilation)
 * 2. `fallback` — whitespace split on ASCII boundaries
 *
 * The fallback produces acceptable results for mixed Chinese-English logs
 * where tokens are separated by whitespace. For pure Chinese text without
 * word boundaries (e.g. "用户登录成功"), nodejieba MUST be installed for
 * correct tokenization.
 *
 * Use `getBackend()` to verify which backend is active.
 */
export class ChineseTokenizer implements ITokenizer {
  readonly id = 'zh';
  private backendType: 'native' | 'fallback' = 'fallback';
  private jiebaModule: unknown = null;

  constructor() {
    try {
      this.jiebaModule = require('nodejieba');
      this.backendType = 'native';
    } catch {
      this.backendType = 'fallback';
    }
  }

  tokenize(text: string): string[] {
    if (this.backendType === 'native' && this.jiebaModule) {
      try {
        return (this.jiebaModule as { cut: (t: string) => string[] }).cut(text);
      } catch {
        // Fall through to fallback on runtime error
      }
    }
    return text.split(/\s+/).filter((t: string) => t.trim().length > 0);
  }

  /** Returns the active tokenization backend. */
  getBackend(): 'native' | 'fallback' {
    return this.backendType;
  }
}
