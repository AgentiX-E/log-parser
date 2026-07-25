import { describe, it, expect, vi } from 'vitest';
import { BrowserFileAdapter } from '../src/BrowserFileAdapter.js';

/** Creates a mock File with the given content. */
function createMockFile(name: string, content: string): File {
  const blob = new Blob([content], { type: 'text/plain' });
  return new File([blob], name, { type: 'text/plain' });
}

/** Creates a mock FileList from an array of Files. */
function createMockFileList(files: File[]): FileList {
  const list = Object.create(FileList.prototype);
  Object.defineProperties(list, {
    length: { value: files.length },
    item: {
      value: (index: number) => files[index] ?? null,
      configurable: true,
    },
  });
  for (let i = 0; i < files.length; i++) {
    Object.defineProperty(list, i, {
      value: files[i],
      configurable: true,
      enumerable: true,
    });
  }
  return list;
}

/** Creates a mock DragEvent with the given files in dataTransfer. */
function createMockDragEvent(files: File[]): DragEvent {
  const list = createMockFileList(files);
  return {
    dataTransfer: { files: list },
  } as DragEvent;
}

describe('BrowserFileAdapter', () => {
  it('fromFileList reads lines from a single file', async () => {
    const file = createMockFile('test.log', 'line1\nline2\nline3');
    const fileList = createMockFileList([file]);
    const adapter = await BrowserFileAdapter.fromFileList(fileList);
    expect(adapter.getLines()).toEqual(['line1', 'line2', 'line3']);
  });

  it('fromFileList reads from multiple files', async () => {
    const file1 = createMockFile('a.log', 'aaa\nbbb');
    const file2 = createMockFile('b.log', 'ccc\nddd');
    const fileList = createMockFileList([file1, file2]);
    const adapter = await BrowserFileAdapter.fromFileList(fileList);
    expect(adapter.getLines()).toEqual(['aaa', 'bbb', 'ccc', 'ddd']);
  });

  it('fromFileList filters empty and whitespace lines', async () => {
    const file = createMockFile('test.log', 'line1\n\n   \n\t\nline2\n');
    const fileList = createMockFileList([file]);
    const adapter = await BrowserFileAdapter.fromFileList(fileList);
    expect(adapter.getLines()).toEqual(['line1', 'line2']);
  });

  it('fromFileList handles empty FileList', async () => {
    const fileList = createMockFileList([]);
    const adapter = await BrowserFileAdapter.fromFileList(fileList);
    expect(adapter.getLines()).toEqual([]);
  });

  it('fromFileList handles empty file content', async () => {
    const file = createMockFile('empty.log', '');
    const fileList = createMockFileList([file]);
    const adapter = await BrowserFileAdapter.fromFileList(fileList);
    expect(adapter.getLines()).toEqual([]);
  });

  it('fromDragEvent reads files from dataTransfer', async () => {
    const file = createMockFile('dropped.log', 'd1\nd2\nd3');
    const event = createMockDragEvent([file]);
    const adapter = await BrowserFileAdapter.fromDragEvent(event);
    expect(adapter.getLines()).toEqual(['d1', 'd2', 'd3']);
  });

  it('fromDragEvent handles empty dataTransfer', async () => {
    const event = { dataTransfer: null } as unknown as DragEvent;
    const adapter = await BrowserFileAdapter.fromDragEvent(event);
    expect(adapter.getLines()).toEqual([]);
  });

  it('fromDragEvent handles dataTransfer with no files', async () => {
    const noFiles = createMockFileList([]);
    const event = { dataTransfer: { files: noFiles } } as DragEvent;
    const adapter = await BrowserFileAdapter.fromDragEvent(event);
    expect(adapter.getLines()).toEqual([]);
  });

  it('fromFetch fetches and parses content successfully', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => 'remote1\n\nremote2\nremote3',
    });
    try {
      const adapter = await BrowserFileAdapter.fromFetch('https://example.com/logs.txt');
      expect(adapter.getLines()).toEqual(['remote1', 'remote2', 'remote3']);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('fromFetch throws on non-ok response', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });
    try {
      await expect(BrowserFileAdapter.fromFetch('https://example.com/missing.txt')).rejects.toThrow('404');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('fromFetch throws on network error', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    try {
      await expect(BrowserFileAdapter.fromFetch('https://example.com/logs.txt')).rejects.toThrow('Network error');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('getLines returns a copy of the lines', async () => {
    const file = createMockFile('test.log', 'aaa\nbbb');
    const fileList = createMockFileList([file]);
    const adapter = await BrowserFileAdapter.fromFileList(fileList);
    const lines = adapter.getLines();
    lines.push('ccc');
    expect(adapter.getLines()).toEqual(['aaa', 'bbb']);
  });

  it('count returns the number of lines', async () => {
    const file = createMockFile('test.log', 'a\nb\nc\nd\ne\n');
    const fileList = createMockFileList([file]);
    const adapter = await BrowserFileAdapter.fromFileList(fileList);
    expect(adapter.count()).toBe(5);
  });

  it('handles CRLF line endings in fromFileList', async () => {
    const file = createMockFile('win.log', 'line1\r\nline2\r\nline3\r\n');
    const fileList = createMockFileList([file]);
    const adapter = await BrowserFileAdapter.fromFileList(fileList);
    expect(adapter.getLines()).toEqual(['line1', 'line2', 'line3']);
  });

  it('fromFileList skips null entries in FileList', async () => {
    const file = createMockFile('real.log', 'content1\ncontent2');
    // Create a FileList with a null entry between valid files
    const files = [file, null as unknown as File, file];
    const list = Object.create(FileList.prototype);
    Object.defineProperties(list, {
      length: { value: 3 },
      item: {
        value: (index: number) => files[index] ?? null,
        configurable: true,
      },
      0: { value: files[0], configurable: true, enumerable: true },
      1: { value: files[1], configurable: true, enumerable: true },
      2: { value: files[2], configurable: true, enumerable: true },
    });
    const adapter = await BrowserFileAdapter.fromFileList(list as FileList);
    expect(adapter.getLines()).toEqual(['content1', 'content2', 'content1', 'content2']);
  });
});
