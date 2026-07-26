import { VariableTypeClassifier } from '../classifier/VariableTypeClassifier.js';

/** Shared classifier instance — stateless, safe for concurrent access. */
const classifier = new VariableTypeClassifier();

/**
 * Post-processing rule engine for template correction.
 * Applied after LLM extraction to fix common errors.
 *
 * Inspired by LogBatcher's 9-rule correction engine.
 */
export class PostProcessor {
  static correct(
    template: string,
    originalLogs: readonly string[],
  ): { template: string; rulesApplied: string[] } {
    let result = template;
    const rulesApplied: string[] = [];
    let prev: string;

    prev = result;
    result = PostProcessor.consolidateVariables(result);
    if (result !== prev) rulesApplied.push('consolidate-variables');

    prev = result;
    result = PostProcessor.typeIps(result);
    if (result !== prev) rulesApplied.push('type-ips');

    prev = result;
    result = PostProcessor.typePaths(result);
    if (result !== prev) rulesApplied.push('type-paths');

    prev = result;
    result = PostProcessor.typeUuids(result);
    if (result !== prev) rulesApplied.push('type-uuids');

    prev = result;
    result = PostProcessor.typeEmails(result);
    if (result !== prev) rulesApplied.push('type-emails');

    prev = result;
    result = PostProcessor.typeHostnames(result);
    if (result !== prev) rulesApplied.push('type-hostnames');

    prev = result;
    result = PostProcessor.typeNumbers(result);
    if (result !== prev) rulesApplied.push('type-numbers');

    if (!PostProcessor.verifyConsistency(result, originalLogs)) {
      rulesApplied.push('consistency-warning');
    }

    return { template: result, rulesApplied };
  }

  static consolidateVariables(template: string): string {
    return template.replace(/<\*>(\s+<\*>)+/g, '<*>');
  }

  static typeNumbers(template: string): string {
    return template.replace(/\b\d+(\.\d+)?\b/g, (match) => {
      return classifier.classify(match).type === 'NUM' ? '<NUM>' : match;
    });
  }

  static typeIps(template: string): string {
    return template.replace(/\b(\d{1,3}\.){3}\d{1,3}\b/g, '<IP>');
  }

  static typePaths(template: string): string {
    return template.replace(/[/\\][\w.\-/\\]*/g, (match) => {
      return match.length > 1 ? '<PATH>' : match;
    });
  }

  static typeUuids(template: string): string {
    return template.replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      '<UUID>',
    );
  }

  static typeEmails(template: string): string {
    return template.replace(/\b[\w.-]+@[\w.-]+\.\w+\b/g, '<EMAIL>');
  }

  static typeHostnames(template: string): string {
    return template.replace(/\b[\w.-]+\.[a-z]{2,}\b(?!@)/gi, (match) => {
      return /^\d/.test(match) ? match : '<HOSTNAME>';
    });
  }

  static verifyConsistency(template: string, logs: readonly string[]): boolean {
    const regex = PostProcessor.templateToRegex(template);
    return logs.every((log) => regex.test(log));
  }

  private static templateToRegex(template: string): RegExp {
    const patterns: Record<string, string> = {
      IP: '\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}',
      NUM: '-?\\d+\\.?\\d*',
      UUID: '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
      EMAIL: '[\\w.\\-]+@[\\w.\\-]+\\.\\w+',
      HOSTNAME: '[\\w.\\-]+\\.[a-z]{2,}',
      PATH: '[/\\\\][\\w./\\-]*',
      TIMESTAMP: '\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}:\\d{2}',
      '*': '\\S+',
    };

    // Parse template into segments: static text vs typed placeholders
    const tagRegex = /<(\*|IP|NUM|UUID|EMAIL|HOSTNAME|PATH|TIMESTAMP)>/g;
    const segments: Array<{ kind: 'static' | 'var'; text: string; type?: string }> = [];
    let lastIdx = 0;
    let match: RegExpExecArray | null;

    while ((match = tagRegex.exec(template)) !== null) {
      const staticText = template.slice(lastIdx, match.index);
      const typeName = match[1]!;
      if (staticText.length > 0) {
        segments.push({ kind: 'static', text: staticText });
      }
      segments.push({ kind: 'var', text: match[0], type: typeName });
      lastIdx = match.index + match[0].length;
    }
    const trailing = template.slice(lastIdx);
    if (trailing.length > 0) {
      segments.push({ kind: 'static', text: trailing });
    }

    // Build regex: escape static parts, substitute patterns for variables
    let regexStr = '^';
    for (const seg of segments) {
      if (seg.kind === 'static') {
        regexStr += seg.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      } else {
        regexStr += patterns[seg.type!] ?? '\\S+';
      }
    }
    regexStr += '$';

    return new RegExp(regexStr);
  }
}
