import { describe, it, expect } from 'vitest';
import { AutoDetectAdapter } from '../../../src/preprocessing/adapters/AutoDetectAdapter.js';

describe('AutoDetectAdapter', () => {
  const adapter = new AutoDetectAdapter();

  it('detects syslog format', () => {
    const line = '<134>Jan 15 10:30:00 myhost sshd[1234]: Accepted publickey';
    expect(adapter.extractContent(line)).toBe('Accepted publickey');
  });

  it('detects apache format', () => {
    const line =
      '192.168.1.1 - - [15/Jan/2024:10:30:00 +0000] "GET / HTTP/1.1" 200 1234';
    expect(adapter.extractContent(line)).toBe('GET / HTTP/1.1 200 1234');
  });

  it('detects JSON format', () => {
    expect(adapter.extractContent('{"message":"hello"}')).toBe('hello');
  });

  it('falls back to raw for unknown format', () => {
    expect(adapter.extractContent('random log text')).toBe('random log text');
  });

  it('handles empty string', () => {
    expect(adapter.extractContent('')).toBe('');
  });

  it('extracts metadata for syslog', () => {
    const line = '<134>Jan 15 10:30:00 myhost sshd[1234]: Accepted publickey';
    const meta = adapter.extractMetadata(line);
    expect(meta.hostname).toBe('myhost');
  });

  it('extracts metadata for apache', () => {
    const line =
      '192.168.1.1 - - [15/Jan/2024:10:30:00 +0000] "GET / HTTP/1.1" 200 1234';
    const meta = adapter.extractMetadata(line);
    expect(meta.host).toBe('192.168.1.1');
  });

  it('returns empty metadata for unknown format', () => {
    expect(adapter.extractMetadata('unknown format')).toEqual({});
  });
});
