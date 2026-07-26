/**
 * NER-style prompt builder for log template extraction.
 *
 * Generates prompts instructing the LLM to identify variables
 * (IP, number, path, UUID, etc.) and replace them with typed placeholders.
 *
 * Design influences:
 * - NER-style variable annotation (LogParser-LLM, KDD 2024)
 * - Locator Pair output constraint (DivLog, ICSE 2024)
 */
export class PromptBuilder {
  static readonly SYSTEM_PROMPT = `You are a log parsing expert. Extract the static template from log messages by identifying variables and replacing them with typed placeholders.

Rules:
1. Same position with different values → variable (replace with <type>).
2. Same position with same value → static text (keep as-is).
3. Variable types:
   - IP addresses → <IP>
   - Numbers (integers or decimals) → <NUM>
   - File paths → <PATH>
   - UUIDs → <UUID>
   - Email addresses → <EMAIL>
   - Timestamps → <TIMESTAMP>
   - Hostnames → <HOSTNAME>
   - Unclassified variables → <*>
4. Output the template enclosed in <TEMPLATE> tags.
5. List each variable with its position and type.
6. Respond with valid JSON matching the requested schema.`;

  /**
   * Build a NER-style prompt for log template extraction.
   *
   * @param logSamples - Representative log samples (from DPP sampling).
   * @returns Prompt string ready for LLM consumption.
   */
  static build(logSamples: readonly string[]): string {
    const samples = logSamples.map((log, i) => `[${i + 1}] ${log}`).join('\n');

    return `${samples}

Extract the common template. Replace variables with typed placeholders.
Output the template in <TEMPLATE> tags, then list each variable.`;
  }
}
