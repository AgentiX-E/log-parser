import { describe, it, expect } from 'vitest';
import { JsonLogAdapter } from '../../../src/preprocessing/adapters/JsonLogAdapter.js';

describe('JsonLogAdapter', () => {
  const adapter = new JsonLogAdapter();

  it('extracts content from JSON log', () => {
    expect(
      adapter.extractContent(
        '{"timestamp":"2024-01-01","level":"info","message":"user logged in"}',
      ),
    ).toBe('user logged in');
  });

  it('extracts metadata fields', () => {
    const line =
      '{"timestamp":"2024-01-01","level":"error","message":"fail","host":"srv1"}';
    const meta = adapter.extractMetadata(line);
    expect(meta.timestamp).toBe('2024-01-01');
    expect(meta.level).toBe('error');
    expect(meta.host).toBe('srv1');
    expect(meta.message).toBeUndefined();
  });

  it('returns empty metadata for non-JSON', () => {
    expect(adapter.extractMetadata('plain text')).toEqual({});
  });

  it('extracts content from JSON with msg field', () => {
    expect(adapter.extractContent('{"msg":"disk full"}')).toBe('disk full');
  });

  it('returns original for non-JSON', () => {
    expect(adapter.extractContent('just a log')).toBe('just a log');
  });

  it('handles numeric and boolean metadata values', () => {
    const line = '{"code":500,"retry":true,"message":"error"}';
    const meta = adapter.extractMetadata(line);
    expect(meta.code).toBe('500');
    expect(meta.retry).toBe('true');
  });

  it('extracts content from JSON with content field', () => {
    expect(adapter.extractContent('{"content":"disk quota exceeded"}')).toBe(
      'disk quota exceeded',
    );
  });

  it('returns original for invalid JSON', () => {
    expect(adapter.extractContent('{broken')).toBe('{broken');
  });

  it('returns empty metadata for invalid JSON input', () => {
    expect(adapter.extractMetadata('{broken')).toEqual({});
  });

  it('returns original for JSON without string content (object value)', () => {
    expect(
      adapter.extractContent('{"message":{"nested":"value"}}'),
    ).toBe('{"message":{"nested":"value"}}');
  });
});
