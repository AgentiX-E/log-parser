import { describe, it, expect } from 'vitest';
import { StructuredLogExtractor } from '../../src/preprocessing/StructuredLogExtractor.js';

describe('StructuredLogExtractor', () => {
  const extractor = new StructuredLogExtractor();

  it('extracts message field from JSON', () => {
    expect(
      extractor.extract('{"timestamp":"2024-01-01","message":"user logged in"}'),
    ).toBe('user logged in');
  });

  it('extracts msg field from JSON', () => {
    expect(extractor.extract('{"msg":"connection refused"}')).toBe('connection refused');
  });

  it('extracts content field from JSON', () => {
    expect(extractor.extract('{"content":"disk full"}')).toBe('disk full');
  });

  it('extracts log field from JSON', () => {
    expect(extractor.extract('{"log":"timeout occurred"}')).toBe('timeout occurred');
  });

  it('returns original for non-JSON', () => {
    expect(extractor.extract('plain text log')).toBe('plain text log');
  });

  it('returns original for invalid JSON', () => {
    expect(extractor.extract('{invalid}')).toBe('{invalid}');
  });

  it('returns original when no content field in JSON', () => {
    expect(
      extractor.extract('{"timestamp":"2024-01-01","level":"error"}'),
    ).toBe('{"timestamp":"2024-01-01","level":"error"}');
  });

  it('returns original for JSON with non-string content field', () => {
    expect(extractor.extract('{"message":123}')).toBe('{"message":123}');
  });

  it('returns original for empty object', () => {
    expect(extractor.extract('{}')).toBe('{}');
  });
});
