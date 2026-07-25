import type { LogInputAdapter } from './LogInputAdapter.js';

/**
 * Apache Common/Combined Log Format adapter.
 *
 * Common: `HOST - - [TIMESTAMP] "METHOD PATH PROTO" STATUS SIZE`
 * Combined: same + `"REFERER" "USER_AGENT"`
 *
 * Example:
 *   `192.168.1.1 - - [15/Jan/2024:10:30:00 +0000] "GET /api/users HTTP/1.1" 200 1234`
 *   → content: `GET /api/users HTTP/1.1 200 1234`
 */
export class ApacheAdapter implements LogInputAdapter {
  private static readonly APACHE_REGEX =
    /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"([^"]+)"\s+(\d+)\s+(\d+|-)(?:\s+"([^"]*)"\s+"([^"]*)")?/;

  extractContent(rawLine: string): string {
    const match = ApacheAdapter.APACHE_REGEX.exec(rawLine);
    if (match?.[3] && match?.[4] && match?.[5]) {
      return `${match[3]} ${match[4]} ${match[5]}`;
    }
    return rawLine.trim();
  }

  extractMetadata(rawLine: string): Record<string, string> {
    const match = ApacheAdapter.APACHE_REGEX.exec(rawLine);
    if (!match) return {};
    return {
      host: match[1] ?? '',
      timestamp: match[2] ?? '',
      request: match[3] ?? '',
      status: match[4] ?? '',
      size: match[5] ?? '',
      referer: match[6] ?? '',
      userAgent: match[7] ?? '',
    };
  }
}
