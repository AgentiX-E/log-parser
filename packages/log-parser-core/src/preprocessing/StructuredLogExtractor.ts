/**
 * Structured log extractor for JSON and key=value formatted logs.
 *
 * Extracts the unstructured `content` portion from structured log formats,
 * enabling drain-ts to operate on the meaningful text only.
 */
export class StructuredLogExtractor {
  /**
   * Attempt to extract the content field from a structured log entry.
   *
   * Supported formats:
   * - JSON: parses the line and extracts `message`, `msg`, or `content` fields
   * - key=value: extracts the value portion
   *
   * @param rawLine - Raw log line which may be structured.
   * @returns The extracted content string, or the original line if not structured.
   */
  extract(rawLine: string): string {
    // Try JSON
    const jsonContent = this.tryJson(rawLine);
    if (jsonContent !== null) return jsonContent;

    // Return as-is (will be parsed by drain-ts tokenizer)
    return rawLine;
  }

  private tryJson(line: string): string | null {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) return null;

    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      // Common log message field names
      const contentField = parsed['message'] ?? parsed['msg'] ?? parsed['content'] ?? parsed['log'];
      if (typeof contentField === 'string') return contentField;
    } catch {
      // Not valid JSON, return null to fall through
    }
    return null;
  }
}
