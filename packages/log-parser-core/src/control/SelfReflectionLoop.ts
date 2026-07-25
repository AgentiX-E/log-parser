import type { ILLMProvider, LlmTemplateResult } from '../llm/ILLMProvider.js';

/**
 * Self-reflection loop for LLM template extraction.
 *
 * Verifies LLM-generated templates against input log samples.
 * Unmatched samples are re-sent to the LLM for refinement,
 * up to maxIterations times (default 3).
 *
 * Inspired by OpenLogParser's self-reflection mechanism
 * (arXiv:2408.01585) — improves parsing accuracy by 7%+.
 */
export class SelfReflectionLoop {
  constructor(
    private readonly llmProvider: ILLMProvider,
    private readonly config: { readonly maxIterations: number } = { maxIterations: 3 },
  ) {}

  /**
   * Iteratively refine a template until all input logs are matched
   * or maxIterations is reached.
   */
  async refine(logSamples: readonly string[]): Promise<LlmTemplateResult> {
    let current = [...logSamples];

    for (let iteration = 0; iteration < this.config.maxIterations; iteration++) {
      const result = await this.llmProvider.extractTemplate(current);
      const unmatched = this.verify(result.template, current);
      if (unmatched.length === 0) return result;
      current = unmatched;
    }

    // Final attempt with all remaining unmatched logs
    return this.llmProvider.extractTemplate(current);
  }

  /**
   * Verify a template against log samples.
   * Returns samples that do NOT match the template.
   */
  verify(template: string, logs: readonly string[]): string[] {
    const regex = this.templateToRegex(template);
    return logs.filter((log) => !regex.test(log));
  }

  /**
   * Convert a template string like "User <*> logged in from <IP>"
   * to a RegExp matching concrete log messages.
   */
  private templateToRegex(template: string): RegExp {
    // Step 1: tokenize the template into segments (static text and placeholders)
    const segments: Array<{
      kind:
        'static' | 'ip' | 'num' | 'uuid' | 'email' | 'timestamp' | 'hostname' | 'path' | 'generic';
      text: string;
    }> = [];
    let remaining = template;

    while (remaining.length > 0) {
      const match = remaining.match(/^([^<]*)(<([A-Za-z*]+)>)?/);
      if (!match) break;
      const staticText = match[1] ?? '';
      const fullTag = match[2];
      const tagName = match[3];

      if (staticText.length > 0) {
        segments.push({ kind: 'static', text: staticText });
      }

      if (fullTag) {
        switch (tagName) {
          case 'IP':
            segments.push({ kind: 'ip', text: fullTag });
            break;
          case 'NUM':
            segments.push({ kind: 'num', text: fullTag });
            break;
          case 'UUID':
            segments.push({ kind: 'uuid', text: fullTag });
            break;
          case 'EMAIL':
            segments.push({ kind: 'email', text: fullTag });
            break;
          case 'TIMESTAMP':
            segments.push({ kind: 'timestamp', text: fullTag });
            break;
          case 'HOSTNAME':
            segments.push({ kind: 'hostname', text: fullTag });
            break;
          case 'PATH':
            segments.push({ kind: 'path', text: fullTag });
            break;
          case '*':
            segments.push({ kind: 'generic', text: fullTag });
            break;
          default:
            segments.push({ kind: 'static', text: fullTag });
            break;
        }
        remaining = remaining.slice((staticText + fullTag).length);
      } else {
        remaining = remaining.slice(staticText.length);
      }
    }

    // Step 2: build regex from segments
    const patterns: Record<string, string> = {
      static: '',
      ip: '\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}',
      num: '-?\\d+\\.?\\d*',
      uuid: '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
      email: '[\\w.-]+@[\\w.-]+\\.\\w+',
      timestamp: '\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}:\\d{2}',
      hostname: '[\\w.-]+\\.[a-z]{2,}',
      path: '[/\\\\][\\w./-]*',
      generic: '\\S+',
    };

    let regexStr = '^';
    for (const seg of segments) {
      if (seg.kind === 'static') {
        regexStr += seg.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      } else {
        regexStr += patterns[seg.kind] ?? '\\S+';
      }
    }
    regexStr += '$';

    return new RegExp(regexStr);
  }
}
