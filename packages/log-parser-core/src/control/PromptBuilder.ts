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
   * Domain-specific few-shot examples for challenging log formats.
   * Each pair shows a raw log and the correctly parsed template.
   */
  static readonly FEW_SHOT_EXAMPLES: Record<string, readonly string[]> = {
    openstack: [
      'Example: "GET /v2/abc123/servers/detail HTTP/1.1" status: 200 len: 1234 time: 0.0567',
      'Template: GET /v2/<UUID>/servers/detail HTTP/1.1 status: <NUM> len: <NUM> time: <NUM>',
      'Example: "POST /v2/xyz789/servers HTTP/1.1" status: 202 len: 89 time: 0.1234',
      'Template: POST /v2/<UUID>/servers HTTP/1.1 status: <NUM> len: <NUM> time: <NUM>',
    ],
    android: [
      'Example: "acquire lock=233570404, flags=0x1, tag=\\"View Lock\\", name=com.android.systemui, ws=null, uid=10037, pid=2227"',
      'Template: acquire lock=<*>, flags=<*>, tag="<*>", name=<*>, ws=<*>, uid=<*>, pid=<*>',
      'Example: "Skipping AppWindowToken{df0798e token=Token{78af589 ActivityRecord{3b04890 u0 com.tencent.qt.qtl/com.tencent.video.player.activity.PlayerActivity t761}}} -- going to hide"',
      'Template: Skipping AppWindowToken{<*> token=Token{<*> ActivityRecord{<*> u0 <*>}}} -- going to hide',
    ],
    proxifier: [
      'Example: "10.0.0.1:8080 open through proxy proxy.local:3128 TCP"',
      'Template: <IP>:<NUM> open through proxy <HOSTNAME>:<NUM> TCP',
      'Example: "192.168.1.1:443 close connection to api.example.com:443"',
      'Template: <IP>:<NUM> close connection to <HOSTNAME>:<NUM>',
    ],
    thunderbird: [
      'Example: "r12=0xa0006470 r13=0x1eeeeeee r14=0x00000004 r15=0x0048eb90"',
      'Template: r12=<HEX> r13=<HEX> r14=<HEX> r15=<HEX>',
      'Example: "fpr0=0x9da6d7a9 bfb97649 00000000 40cb7380"',
      'Template: fpr0=<HEX> <HEX> <HEX> <HEX>',
    ],
    windows: [
      'Example: "Loaded Servicing Stack v6.1.7601.23505 with Core: C:\\Windows\\winsxs\\abc\\cbscore.dll"',
      'Template: Loaded Servicing Stack <*> with Core: <PATH>\\cbscore.dll',
      'Example: "00000001@2016/9/27:20:30:31.455 WcpInitialize (wcp.dll version 0.0.0.6) called (stack @0x7fed806eb5d)"',
      'Template: <HEX>@<*> WcpInitialize (wcp.dll version <NUM>) called (stack @<HEX>)',
    ],
  };

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

  /**
   * Build a prompt with domain-specific few-shot examples appended.
   * The domain key is case-insensitive.
   *
   * @param logSamples - Representative log samples (from DPP sampling).
   * @param domain - Dataset name for few-shot lookup (e.g. "openstack", "android").
   * @returns Prompt string with few-shot examples when available for this domain.
   */
  static buildWithExamples(logSamples: readonly string[], domain?: string): string {
    const base = PromptBuilder.build(logSamples);
    if (!domain) return base;

    const examples = PromptBuilder.FEW_SHOT_EXAMPLES[domain.toLowerCase()];
    if (!examples || examples.length === 0) return base;

    return `${base}\n\nHere are examples of correct parsing for this log domain:\n${examples.join('\n')}`;
  }
}
