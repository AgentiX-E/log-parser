/**
 * IndexedDBPersistence tests using fake-indexeddb.
 *
 * fake-indexeddb provides an in-memory IndexedDB implementation backed by
 * the same real IDB classes — no native DOM required.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { IndexedDBPersistence } from '../src/IndexedDBPersistence.js';

describe('IndexedDBPersistence', () => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  beforeEach(() => {
    // Reset fake-indexeddb state between tests
    indexedDB = new IDBFactory();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    indexedDB = new IDBFactory();
    vi.restoreAllMocks();
  });

  it('init creates the database and object store', async () => {
    const persistence = new IndexedDBPersistence();
    expect(persistence.isInitialized()).toBe(false);

    await persistence.init();
    expect(persistence.isInitialized()).toBe(true);
  });

  it('save and load roundtrip preserves data', async () => {
    const persistence = new IndexedDBPersistence();
    await persistence.init();

    const data = encoder.encode('{"version": 1, "clusters": []}');
    await persistence.saveState(data);

    const loaded = await persistence.loadState();
    expect(loaded).not.toBeNull();
    expect(decoder.decode(loaded!)).toBe('{"version": 1, "clusters": []}');
  });

  it('save and load handles binary data', async () => {
    const persistence = new IndexedDBPersistence();
    await persistence.init();

    const binaryData = new Uint8Array([0x00, 0x01, 0xfe, 0xff, 0x42]);
    await persistence.saveState(binaryData);

    const loaded = await persistence.loadState();
    expect(loaded).not.toBeNull();
    expect(Array.from(loaded!)).toEqual([0x00, 0x01, 0xfe, 0xff, 0x42]);
  });

  it('load returns null when no state stored', async () => {
    const persistence = new IndexedDBPersistence();
    await persistence.init();

    const loaded = await persistence.loadState();
    expect(loaded).toBeNull();
  });

  it('load returns null when not initialized', async () => {
    const persistence = new IndexedDBPersistence();
    const loaded = await persistence.loadState();
    expect(loaded).toBeNull();
  });

  it('save throws when not initialized', async () => {
    const persistence = new IndexedDBPersistence();
    const data = encoder.encode('test');
    await expect(persistence.saveState(data)).rejects.toThrow('not initialized');
  });

  it('double init is safe and maintains initialized state', async () => {
    const persistence = new IndexedDBPersistence();
    await persistence.init();
    await persistence.init();
    expect(persistence.isInitialized()).toBe(true);
  });

  it('save overwrites previous state', async () => {
    const persistence = new IndexedDBPersistence();
    await persistence.init();

    await persistence.saveState(encoder.encode('old-state'));
    await persistence.saveState(encoder.encode('new-state'));

    const loaded = await persistence.loadState();
    expect(decoder.decode(loaded!)).toBe('new-state');
  });

  it('load after save across multiple calls preserves last state', async () => {
    const persistence = new IndexedDBPersistence();
    await persistence.init();

    for (let i = 0; i < 5; i++) {
      await persistence.saveState(encoder.encode(`state-${i}`));
    }

    const loaded = await persistence.loadState();
    expect(decoder.decode(loaded!)).toBe('state-4');
  });

  it('save empty Uint8Array works', async () => {
    const persistence = new IndexedDBPersistence();
    await persistence.init();

    await persistence.saveState(new Uint8Array(0));
    const loaded = await persistence.loadState();
    expect(loaded).not.toBeNull();
    expect(loaded!.byteLength).toBe(0);
  });

  it('init rejects when IndexedDB open fails', async () => {
    // Mock indexedDB.open to fail after persistence is created
    const fakeRequest = {
      result: null as unknown as IDBDatabase,
      error: new DOMException('Blocked', 'AbortError'),
      onsuccess: null as unknown as ((ev: Event) => void) | null,
      onerror: null as unknown as ((ev: Event) => void) | null,
      onupgradeneeded: null as unknown as (() => void) | null,
    };

    // Override with a spy that returns the fake request and fires onerror
    const openSpy = vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      // Schedule error callback after the listener is attached
      queueMicrotask(() => {
        if (fakeRequest.onerror) {
          fakeRequest.onerror({} as Event);
        }
      });
      return fakeRequest as unknown as IDBOpenDBRequest;
    });

    const persistence = new IndexedDBPersistence();
    await expect(persistence.init()).rejects.toThrow('Request failed');

    openSpy.mockRestore();
  });

  it('init rejects when IndexedDB open fails with null error', async () => {
    // Mock with null error to test the 'unknown error' fallback message
    const fakeRequest = {
      result: null as unknown as IDBDatabase,
      error: null as unknown as DOMException,
      onsuccess: null as unknown as ((ev: Event) => void) | null,
      onerror: null as unknown as ((ev: Event) => void) | null,
      onupgradeneeded: null as unknown as (() => void) | null,
    };

    const openSpy = vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      queueMicrotask(() => {
        if (fakeRequest.onerror) {
          fakeRequest.onerror({} as Event);
        }
      });
      return fakeRequest as unknown as IDBOpenDBRequest;
    });

    const persistence = new IndexedDBPersistence();
    await expect(persistence.init()).rejects.toThrow('unknown error');

    openSpy.mockRestore();
  });

  it('isInitialized returns false before init and true after', async () => {
    const persistence = new IndexedDBPersistence();
    expect(persistence.isInitialized()).toBe(false);
    expect(persistence.isInitialized()).toBe(false); // Call twice for good measure

    await persistence.init();
    expect(persistence.isInitialized()).toBe(true);
    expect(persistence.isInitialized()).toBe(true); // Call twice for good measure
  });

  it('init rejects with unknown error when request.error has no message', async () => {
    const fakeRequest = {
      result: null as unknown as IDBDatabase,
      error: {
        get message(): string | undefined {
          return undefined;
        },
      } as DOMException,
      onsuccess: null as unknown as ((ev: Event) => void) | null,
      onerror: null as unknown as ((ev: Event) => void) | null,
      onupgradeneeded: null as unknown as (() => void) | null,
    };
    const openSpy = vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      queueMicrotask(() => {
        if (fakeRequest.onerror) fakeRequest.onerror({} as Event);
      });
      return fakeRequest as unknown as IDBOpenDBRequest;
    });
    const persistence = new IndexedDBPersistence();
    await expect(persistence.init()).rejects.toThrow('unknown error');
    openSpy.mockRestore();
  });
});
