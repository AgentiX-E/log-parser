import type { LogInputAdapter } from './LogInputAdapter.js';
import { StructuredLogExtractor } from '../StructuredLogExtractor.js';

/**
 * JSON log format adapter.
 *
 * Handles newline-delimited JSON (NDJSON) and single JSON object logs.
 * Extracts the content field and all metadata from the JSON structure.
 *
 * Example:
 *   `{"timestamp":"2024-01-15T10:30:00Z","level":"error","message":"Connection refused"}`
 *   → content: `Connection refused`
 */
export class JsonLogAdapter implements LogInputAdapter {
  private readonly extractor = new StructuredLogExtractor();

  extractContent(rawLine: string): string {
    return this.extractor.extract(rawLine);
  }

  extractMetadata(rawLine: string): Record<string, string> {
    const trimmed = rawLine.trim();
    if (!trimmed.startsWith('{')) return {};

    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const metadata: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (key === 'message' || key === 'msg' || key === 'content') continue;
        if (typeof value === 'string') {
          metadata[key] = value;
        } else if (typeof value === 'number' || typeof value === 'boolean') {
          metadata[key] = String(value);
        }
      }
      return metadata;
    } catch {
      return {};
    }
  }
}
