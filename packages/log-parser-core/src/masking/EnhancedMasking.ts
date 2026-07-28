import { MaskingInstruction, DEFAULT_MASKING_INSTRUCTIONS } from '@agentix-e/drain-ts';

/**
 * Enhanced masking instructions extending drain-ts defaults.
 *
 * Adds detection for hostnames, hostname:port pairs, bare hex strings,
 * and UUID variants that the default masking misses. These are critical
 * for closing the GA gap versus Drain3 on datasets like Proxifier and OpenStack.
 */

/** Hostname followed by optional port: db-primary.local, api.prod.example.com:8080 */
export const HOSTNAME_MASK = new MaskingInstruction(
  String.raw`\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?::\d+)?\b`,
  'HOSTNAME',
);

/** Bare hex strings (8+ hex chars, with or without 0x prefix) — critical for Proxifier. */
export const BARE_HEX_MASK = new MaskingInstruction(
  String.raw`\b(?:0x)?[0-9a-fA-F]{8,}\b`,
  'HEX',
);

/** UUIDs without dashes. */
export const UUID_NODASH_MASK = new MaskingInstruction(
  String.raw`\b[0-9a-fA-F]{32}\b`,
  'UUID',
);

/** Combined enhanced masking instructions. */
export const ENHANCED_MASKING_INSTRUCTIONS: readonly MaskingInstruction[] = [
  ...DEFAULT_MASKING_INSTRUCTIONS,
  HOSTNAME_MASK,
  BARE_HEX_MASK,
  UUID_NODASH_MASK,
];

export { DEFAULT_MASKING_INSTRUCTIONS };
