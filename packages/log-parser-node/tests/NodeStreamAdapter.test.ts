import { describe, it, expect, afterEach } from 'vitest';
import { NodeStreamAdapter } from '../src/NodeStreamAdapter.js';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';

describe('NodeStreamAdapter', () => {
  const tempFiles: string[] = [];

  afterEach(() => {
    for (const file of tempFiles) {
      try { unlinkSync(file); } catch { /* already cleaned up */ }
    }
    tempFiles.length = 0;
  });

  function createTempFile(prefix: string, content: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'nst-'));
    const filePath = join(dir, `${prefix}.log`);
    writeFileSync(filePath, content, 'utf-8');
    tempFiles.push(filePath);
    return filePath;
  }

  // ── fromFile tests ──

  it('fromFile reads all lines correctly', async () => {
    const filePath = createTempFile('test1', 'line1\nline2\nline3\n');
    const lines: string[] = [];
    for await (const line of NodeStreamAdapter.fromFile(filePath)) {
      lines.push(line);
    }
    expect(lines).toEqual(['line1', 'line2', 'line3']);
  });

  it('fromFile filters empty lines', async () => {
    const filePath = createTempFile('test2', 'line1\n\n\nline2\n\n\nline3\n');
    const lines: string[] = [];
    for await (const line of NodeStreamAdapter.fromFile(filePath)) {
      lines.push(line);
    }
    expect(lines).toEqual(['line1', 'line2', 'line3']);
  });

  it('fromFile filters whitespace-only lines', async () => {
    const filePath = createTempFile('test3', 'line1\n   \n\t\nline2\n');
    const lines: string[] = [];
    for await (const line of NodeStreamAdapter.fromFile(filePath)) {
      lines.push(line);
    }
    expect(lines).toEqual(['line1', 'line2']);
  });

  it('fromFile throws on non-existent file', async () => {
    const nonExistentPath = '/nonexistent/path/logfile.log';
    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _line of NodeStreamAdapter.fromFile(nonExistentPath)) {
        // should throw before entering loop
      }
    }).rejects.toThrow();
  });

  it('fromFile handles empty file', async () => {
    const filePath = createTempFile('test5', '');
    const lines: string[] = [];
    for await (const line of NodeStreamAdapter.fromFile(filePath)) {
      lines.push(line);
    }
    expect(lines).toEqual([]);
  });

  it('fromFile handles file with only empty lines', async () => {
    const filePath = createTempFile('test6', '\n\n   \n\t\n\n');
    const lines: string[] = [];
    for await (const line of NodeStreamAdapter.fromFile(filePath)) {
      lines.push(line);
    }
    expect(lines).toEqual([]);
  });

  it('fromFile handles file with single line', async () => {
    const filePath = createTempFile('test7', 'single-line\n');
    const lines: string[] = [];
    for await (const line of NodeStreamAdapter.fromFile(filePath)) {
      lines.push(line);
    }
    expect(lines).toEqual(['single-line']);
  });

  it('fromFile handles file with no trailing newline', async () => {
    const filePath = createTempFile('test8', 'line1\nline2\nline3');
    const lines: string[] = [];
    for await (const line of NodeStreamAdapter.fromFile(filePath)) {
      lines.push(line);
    }
    expect(lines).toEqual(['line1', 'line2', 'line3']);
  });

  it('fromFile handles large file streaming', async () => {
    const lineCount = 10000;
    const content = Array.from({ length: lineCount }, (_, i) => `log line ${i}`).join('\n') + '\n';
    const filePath = createTempFile('test9', content);
    const lines: string[] = [];
    for await (const line of NodeStreamAdapter.fromFile(filePath)) {
      lines.push(line);
    }
    expect(lines.length).toBe(lineCount);
  });

  it('fromFile preserves line content including special characters', async () => {
    const filePath = createTempFile('test10', 'line with spaces\nline,with,commas\nline|with|pipes\n');
    const lines: string[] = [];
    for await (const line of NodeStreamAdapter.fromFile(filePath)) {
      lines.push(line);
    }
    expect(lines).toEqual([
      'line with spaces',
      'line,with,commas',
      'line|with|pipes',
    ]);
  });

  it('fromFile handles CRLF line endings', async () => {
    const filePath = createTempFile('test11', 'line1\r\nline2\r\nline3\r\n');
    const lines: string[] = [];
    for await (const line of NodeStreamAdapter.fromFile(filePath)) {
      lines.push(line);
    }
    expect(lines).toEqual(['line1', 'line2', 'line3']);
  });

  // ── fromStdin tests ──

  it('fromStdin reads lines from stdin', async () => {
    const mockStdin = new Readable({ read() {} });
    mockStdin.push('stdin-line1\nstdin-line2\nstdin-line3\n');
    mockStdin.push(null);

    Object.defineProperty(process, 'stdin', {
      value: mockStdin,
      configurable: true,
    });

    const lines: string[] = [];
    for await (const line of NodeStreamAdapter.fromStdin()) {
      lines.push(line);
    }
    // Restore stdin
    expect(lines).toEqual(['stdin-line1', 'stdin-line2', 'stdin-line3']);
  });

  it('fromStdin filters empty and whitespace lines from stdin', async () => {
    const mockStdin = new Readable({ read() {} });
    mockStdin.push('a\n\n\n   \nb\n');
    mockStdin.push(null);

    Object.defineProperty(process, 'stdin', {
      value: mockStdin,
      configurable: true,
    });

    const lines: string[] = [];
    for await (const line of NodeStreamAdapter.fromStdin()) {
      lines.push(line);
    }
    expect(lines).toEqual(['a', 'b']);
  });
});
