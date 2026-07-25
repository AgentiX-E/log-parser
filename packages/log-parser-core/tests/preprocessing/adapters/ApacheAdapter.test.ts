import { describe, it, expect } from 'vitest';
import { ApacheAdapter } from '../../../src/preprocessing/adapters/ApacheAdapter.js';

describe('ApacheAdapter', () => {
  const adapter = new ApacheAdapter();

  it('extracts content from common log format', () => {
    const line =
      '192.168.1.1 - - [15/Jan/2024:10:30:00 +0000] "GET /api/users HTTP/1.1" 200 1234';
    expect(adapter.extractContent(line)).toBe('GET /api/users HTTP/1.1 200 1234');
  });

  it('extracts content with dash size', () => {
    const line =
      '10.0.0.1 - - [15/Jan/2024:10:30:00 +0000] "POST /submit HTTP/1.1" 201 -';
    expect(adapter.extractContent(line)).toBe('POST /submit HTTP/1.1 201 -');
  });

  it('extracts metadata from combined log format', () => {
    const line =
      '192.168.1.1 - - [15/Jan/2024:10:30:00 +0000] "GET / HTTP/1.1" 200 1234 "https://referrer.com" "Mozilla/5.0"';
    const meta = adapter.extractMetadata(line);
    expect(meta.host).toBe('192.168.1.1');
    expect(meta.timestamp).toBe('15/Jan/2024:10:30:00 +0000');
    expect(meta.request).toBe('GET / HTTP/1.1');
    expect(meta.status).toBe('200');
    expect(meta.size).toBe('1234');
    expect(meta.referer).toBe('https://referrer.com');
    expect(meta.userAgent).toBe('Mozilla/5.0');
  });

  it('returns raw line for non-apache format', () => {
    expect(adapter.extractContent('plain text log')).toBe('plain text log');
  });

  it('returns empty metadata for non-apache', () => {
    expect(adapter.extractMetadata('plain text')).toEqual({});
  });

  it('extracts content from error response', () => {
    const line =
      '1.2.3.4 - - [15/Jan/2024:10:30:00 +0000] "GET /missing HTTP/1.1" 404 512';
    expect(adapter.extractContent(line)).toBe('GET /missing HTTP/1.1 404 512');
  });

  it('handles PUT request', () => {
    const line =
      '1.2.3.4 - - [15/Jan/2024:10:30:00 +0000] "PUT /update HTTP/1.1" 204 0';
    expect(adapter.extractContent(line)).toBe('PUT /update HTTP/1.1 204 0');
  });

  it('handles DELETE request', () => {
    const line =
      '1.2.3.4 - - [15/Jan/2024:10:30:00 +0000] "DELETE /resource/123 HTTP/1.1" 204 0';
    expect(adapter.extractContent(line)).toBe('DELETE /resource/123 HTTP/1.1 204 0');
  });
});
