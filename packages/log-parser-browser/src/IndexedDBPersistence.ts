import type { PersistenceHandler } from '@agentix-e/drain-ts';

/** Name of the IndexedDB database used for persistence. */
const DB_NAME = 'log-parser-persistence';
/** Object store name within the database. */
const STORE_NAME = 'snapshots';
/** Key used to store/retrieve the snapshot. */
const STATE_KEY = 'drain-snapshot';

/** Wraps an IDBRequest into a Promise, rejecting on error. */
function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      const errorMsg = request.error?.message ?? 'unknown error';
      reject(new Error(`Request failed: ${errorMsg}`));
    };
  });
}

/**
 * IndexedDB-based persistence handler implementing the drain-ts PersistenceHandler interface.
 * Stores Drain state snapshots in the browser's IndexedDB for offline-capable log parsing.
 */
export class IndexedDBPersistence implements PersistenceHandler {
  #db: IDBDatabase | null = null;
  #initialized = false;

  /**
   * Returns true if the database has been successfully initialized.
   */
  isInitialized(): boolean {
    const result = this.#db !== null && this.#initialized;
    return result;
  }

  /**
   * Opens (or creates) the IndexedDB database and object store.
   * Must be called before saveState() or loadState().
   */
  async init(): Promise<void> {
    if (this.#initialized) {
      return;
    }
    this.#db = await this.#openDB();
    this.#initialized = true;
  }

  #openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        const errorMsg = request.error?.message ?? 'unknown error';
        reject(new Error(`Request failed: ${errorMsg}`));
      };
    });
  }

  /**
   * Saves the serialized snapshot state to IndexedDB.
   * Throws if init() has not been called.
   */
  async saveState(state: Uint8Array): Promise<void> {
    if (!this.#initialized) {
      throw new Error('IndexedDBPersistence is not initialized. Call init() first.');
    }
    const db = this.#db!;
    const request = db
      .transaction([STORE_NAME], 'readwrite')
      .objectStore(STORE_NAME)
      .put(state, STATE_KEY);
    await promisifyRequest(request);
  }

  /**
   * Loads the previously persisted snapshot state from IndexedDB.
   * Returns null if no state exists or if init() has not been called.
   */
  async loadState(): Promise<Uint8Array | null> {
    if (!this.#initialized) {
      return null;
    }
    const db = this.#db!;
    const request = db.transaction([STORE_NAME], 'readonly').objectStore(STORE_NAME).get(STATE_KEY);
    const result = await promisifyRequest(request);
    return result ?? null;
  }
}
