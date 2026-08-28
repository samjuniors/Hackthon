/**
 * ANALYSIS HISTORY — storage layer.
 *
 * Browser-local persistence via the native IndexedDB API (Phase 4): a
 * complete thermal analysis is structured data that can contain hundreds of
 * GeoJSON polygons — far beyond localStorage's practical limits. No Redis,
 * queues, microservices, auth, cloud database, or background workers.
 *
 * The storage is injectable so tests can drive the repository with either
 * fake-indexeddb (real IDB semantics in Node) or an in-memory backend.
 */
import type { HistoryRecord } from './types';

export interface HistoryStorage {
  /** Open/upgrade the database (idempotent). */
  open(): Promise<void>;
  put(record: HistoryRecord): Promise<void>;
  get(id: string): Promise<HistoryRecord | undefined>;
  getAll(): Promise<HistoryRecord[]>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}

const DB_NAME = 'thermal-decision-history';
const DB_VERSION = 1;
const STORE = 'analyses';

/** The object-store handle shape we actually use (structural, no IDB types). */
interface StoreHandle {
  put(value: unknown): IDBRequestLike;
  get(key: string): IDBRequestLike;
  getAll(): IDBRequestLike;
  delete(key: string): IDBRequestLike;
  clear(): IDBRequestLike;
}

interface IDBRequestLike {
  onsuccess: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  result: unknown;
  error?: unknown;
}

interface DbHandle {
  objectStoreNames: { contains(name: string): boolean };
  createObjectStore(name: string, options?: { keyPath?: string }): unknown;
  transaction(store: string, mode: 'readonly' | 'readwrite'): {
    objectStore(name: string): StoreHandle;
  };
}

function requestToPromise<T>(req: IDBRequestLike): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

/**
 * Native IndexedDB storage. Returns null when IndexedDB is unavailable
 * (SSR pre-render, ancient browsers) — the hook treats that as
 * "history unavailable" and never crashes the app.
 */
export function createIndexedDbHistoryStorage(): HistoryStorage | null {
  if (typeof indexedDB === 'undefined') return null;

  let dbPromise: Promise<DbHandle> | null = null;

  const openDb = (): Promise<DbHandle> => {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise<DbHandle>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result as unknown as DbHandle;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result as unknown as DbHandle);
      req.onerror = () => reject(req.error ?? new Error('Failed to open history database'));
    });
    return dbPromise;
  };

  const withStore = async <T>(
    mode: 'readonly' | 'readwrite',
    fn: (store: StoreHandle) => Promise<T>,
  ): Promise<T> => {
    const db = await openDb();
    const tx = db.transaction(STORE, mode);
    return fn(tx.objectStore(STORE));
  };

  return {
    async open() {
      await openDb();
    },
    async put(record) {
      await withStore('readwrite', (store) => requestToPromise(store.put(record)));
    },
    async get(id) {
      return withStore('readonly', (store) =>
        requestToPromise<HistoryRecord | undefined>(store.get(id)),
      );
    },
    async getAll() {
      return withStore('readonly', (store) =>
        requestToPromise<HistoryRecord[]>(store.getAll()),
      );
    },
    async delete(id) {
      await withStore('readwrite', (store) => requestToPromise(store.delete(id)));
    },
    async clear() {
      await withStore('readwrite', (store) => requestToPromise(store.clear()));
    },
  };
}

/**
 * In-memory storage backend — used by unit tests and as a graceful fallback
 * when IndexedDB is unavailable (records live for the session only).
 */
export function createMemoryHistoryStorage(seed: HistoryRecord[] = []): HistoryStorage {
  const map = new Map<string, HistoryRecord>(seed.map((r) => [r.id, r]));
  return {
    async open() { /* nothing to do */ },
    async put(record) { map.set(record.id, record); },
    async get(id) { return map.get(id); },
    async getAll() { return [...map.values()]; },
    async delete(id) { map.delete(id); },
    async clear() { map.clear(); },
  };
}
