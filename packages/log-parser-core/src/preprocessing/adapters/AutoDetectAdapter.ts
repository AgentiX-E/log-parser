import type { LogInputAdapter } from './LogInputAdapter.js';
import { SyslogAdapter } from './SyslogAdapter.js';
import { ApacheAdapter } from './ApacheAdapter.js';
import { JsonLogAdapter } from './JsonLogAdapter.js';

/**
 * Auto-detect log format adapter.
 *
 * Attempts to detect the log format of each line and delegates to the
 * appropriate adapter. Falls back to returning the raw line when no
 * format can be detected.
 *
 * Detection order:
 *   1. JSON (starts with `{`)
 *   2. Syslog (matches `<PRI>...` or `Mon DD HH:MM:SS ...`)
 *   3. Apache (matches `IP - - [timestamp] "..."`)
 *   4. Raw (no match)
 */
export class AutoDetectAdapter implements LogInputAdapter {
  private readonly syslog = new SyslogAdapter();
  private readonly apache = new ApacheAdapter();
  private readonly json = new JsonLogAdapter();

  extractContent(rawLine: string): string {
    const adapter = this.detect(rawLine);
    return adapter.extractContent(rawLine);
  }

  extractMetadata(rawLine: string): Record<string, string> {
    const adapter = this.detect(rawLine);
    return adapter.extractMetadata(rawLine);
  }

  private detect(rawLine: string): LogInputAdapter {
    const trimmed = rawLine.trim();
    if (!trimmed) return this.createRawAdapter();

    if (trimmed.startsWith('{')) return this.json;
    if (/^(?:<\d+>)?[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}/.test(trimmed)) return this.syslog;
    if (/^\S+\s+\S+\s+\S+\s+\[/.test(trimmed)) return this.apache;

    return this.createRawAdapter();
  }

  private createRawAdapter(): LogInputAdapter {
    return {
      extractContent: (line: string) => line.trim(),
      extractMetadata: () => ({}),
    };
  }
}
