/**
 * Tokenizer interface for multi-language log preprocessing.
 *
 * Each implementation handles a specific language's segmentation rules.
 * Output tokens are joined with spaces and then split on whitespace
 * for compatibility with drain-ts (which expects space-separated tokens).
 */
export interface ITokenizer {
  /** Unique identifier for this tokenizer. */
  readonly id: string;

  /**
   * Tokenize raw text into an array of tokens.
   *
   * @param text - Raw log message text.
   * @returns Array of word/character tokens.
   */
  tokenize(text: string): string[];
}
