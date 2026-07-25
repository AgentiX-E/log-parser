import { describe, it, expect } from 'vitest';
import { SyslogAdapter } from '../../../src/preprocessing/adapters/SyslogAdapter.js';

describe('SyslogAdapter', () => {
  const adapter = new SyslogAdapter();

  it('extracts content from syslog line with PRI', () => {
    const line = '<134>Jan 15 10:30:00 myhost sshd[1234]: Accepted publickey for alice';
    expect(adapter.extractContent(line)).toBe('Accepted publickey for alice');
  });

  it('extracts content from syslog line without PRI', () => {
    const line = 'Jan 15 10:30:00 myhost sshd[1234]: Accepted publickey';
    expect(adapter.extractContent(line)).toBe('Accepted publickey');
  });

  it('extracts metadata from syslog line', () => {
    const line = '<134>Jan 15 10:30:00 myhost sshd[1234]: Accepted publickey';
    const meta = adapter.extractMetadata(line);
    expect(meta.timestamp).toBe('Jan 15 10:30:00');
    expect(meta.hostname).toBe('myhost');
    expect(meta.application).toBe('sshd');
    expect(meta.pid).toBe('1234');
  });

  it('returns raw line for non-syslog', () => {
    expect(adapter.extractContent('plain text')).toBe('plain text');
  });

  it('returns empty metadata for non-syslog', () => {
    expect(adapter.extractMetadata('plain text')).toEqual({});
  });

  it('handles syslog without PID', () => {
    const line = 'Jan 15 10:30:00 myhost app: message here';
    const meta = adapter.extractMetadata(line);
    expect(meta.application).toBe('app');
    expect(meta.pid).toBe('');
  });

  it('trims extracted content', () => {
    const line = '<134>Jan 15 10:30:00 myhost app:   message with spaces   ';
    expect(adapter.extractContent(line)).toBe('message with spaces');
  });
});
