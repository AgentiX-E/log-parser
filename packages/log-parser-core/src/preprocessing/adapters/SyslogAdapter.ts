import type { LogInputAdapter } from './LogInputAdapter.js';

/**
 * Syslog adapter (RFC 3164 / RFC 5424).
 *
 * Format: `<PRI>TIMESTAMP HOSTNAME APP[PID]: CONTENT`
 *
 * Example:
 *   `<134>Jan 15 10:30:00 myhost sshd[1234]: Accepted publickey for alice from 192.168.1.1`
 *   → content: `Accepted publickey for alice from 192.168.1.1`
 */
export class SyslogAdapter implements LogInputAdapter {
  private static readonly SYSLOG_REGEX =
    /^(?:<\d+>)?(\w{3}\s+\d+\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+(\S+?)(?:\[(\d+)\])?:\s+(.*)/s;

  extractContent(rawLine: string): string {
    const match = SyslogAdapter.SYSLOG_REGEX.exec(rawLine);
    if (match?.[5]) return match[5].trim();
    return rawLine.trim();
  }

  extractMetadata(rawLine: string): Record<string, string> {
    const match = SyslogAdapter.SYSLOG_REGEX.exec(rawLine);
    if (!match) return {};
    return {
      timestamp: match[1] ?? '',
      hostname: match[2] ?? '',
      application: match[3] ?? '',
      pid: match[4] ?? '',
    };
  }
}
