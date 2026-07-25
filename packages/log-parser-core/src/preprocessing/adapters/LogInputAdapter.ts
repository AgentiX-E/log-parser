/**
 * Log input adapter interface.
 *
 * Adapts raw log lines from various sources (syslog, Apache, JSON, etc.)
 * into a normalized content format suitable for drain-ts processing.
 *
 * Each adapter implementation knows how to parse its specific log format
 * and extract the unstructured content portion while preserving structured
 * metadata (timestamps, severity levels, hostnames, etc.).
 */
export interface LogInputAdapter {
  /**
   * Extract the unstructured content portion from a raw log line.
   * This is the text that drain-ts will cluster into templates.
   */
  extractContent(rawLine: string): string;

  /**
   * Extract structured metadata fields from a raw log line.
   * Keys vary by adapter implementation.
   */
  extractMetadata(rawLine: string): Record<string, string>;
}
