import { describe, it, expect } from 'vitest';
import { PromptBuilder } from '../../src/control/PromptBuilder.js';

describe('PromptBuilder', () => {
  it('should have a non-empty system prompt', () => {
    expect(PromptBuilder.SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  it('should include log samples in numbered format', () => {
    const p = PromptBuilder.build(['User alice logged in', 'User bob logged in']);
    expect(p).toContain('[1] User alice logged in');
    expect(p).toContain('[2] User bob logged in');
  });

  it('should mention template extraction and TEMPLATE tags', () => {
    const p = PromptBuilder.build(['test']);
    expect(p).toContain('template');
    expect(p).toContain('<TEMPLATE>');
  });

  it('should handle single sample', () => {
    const p = PromptBuilder.build(['only one']);
    expect(p).toContain('[1] only one');
  });

  it('should handle empty samples', () => {
    const p = PromptBuilder.build([]);
    expect(p.length).toBeGreaterThan(0);
  });

  it('should be deterministic', () => {
    const s = ['a', 'b', 'c'];
    expect(PromptBuilder.build(s)).toBe(PromptBuilder.build(s));
  });

  it('should include all variable types in system prompt', () => {
    const types = [
      '<IP>',
      '<NUM>',
      '<PATH>',
      '<UUID>',
      '<EMAIL>',
      '<TIMESTAMP>',
      '<HOSTNAME>',
      '<*>',
    ];
    for (const t of types) expect(PromptBuilder.SYSTEM_PROMPT).toContain(t);
  });

  // ── buildWithExamples (I4 continued) ──

  it('buildWithExamples returns base when domain is missing', () => {
    const result = PromptBuilder.buildWithExamples(['log a']);
    expect(result).toContain('log a');
    expect(result).not.toContain('Here are examples');
  });

  it('buildWithExamples returns base when domain not in FEW_SHOT', () => {
    const result = PromptBuilder.buildWithExamples(['log a'], 'nonexistent');
    expect(result).toContain('log a');
    expect(result).not.toContain('Here are examples');
  });

  it('buildWithExamples includes examples for openstack domain', () => {
    const result = PromptBuilder.buildWithExamples(['test log'], 'openstack');
    expect(result).toContain('Here are examples');
  });
});
