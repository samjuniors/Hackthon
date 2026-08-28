'use client';

/**
 * ANALYSIS HISTORY — React binding.
 *
 * Owns the IndexedDB connection lifecycle (browser-only, SSR-safe) and
 * exposes the repository operations as stable callbacks. The page calls
 * `save()` ONLY from the completed-analysis path (Phase 5 lifecycle) and
 * `restore()` ONLY to rehydrate a saved analysis WITHOUT any provider call
 * (Phase 10 — restoration is pure local state).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CompletedAnalysisInput, HistoryRecord } from '@/lib/history/types';
import {
  createIndexedDbHistoryStorage,
  createMemoryHistoryStorage,
  type HistoryStorage,
} from '@/lib/history/storage';
import {
  clearHistoryStorage,
  deleteHistoryRecord,
  listHistory,
  saveCompletedAnalysis,
  updateHistoryRecord,
} from '@/lib/history/repository';

export interface UseAnalysisHistoryResult {
  /** Records, newest first. */
  records: HistoryRecord[];
  /** True once the initial load finished (IndexedDB opened or unavailable). */
  ready: boolean;
  /** True when IndexedDB is unavailable → history is session-only memory. */
  persistent: boolean;
  /**
   * Persist a COMPLETED analysis. Returns the saved record or null (not
   * persistable / storage failure — never throws).
   */
  save: (input: CompletedAnalysisInput) => Promise<HistoryRecord | null>;
  /** Attach a late-arriving explanation to a previously saved record. */
  update: (id: string, patch: { explanation: CompletedAnalysisInput['explanation'] }) => Promise<void>;
  /** Delete one record. */
  remove: (id: string) => Promise<void>;
  /** Clear all records. */
  clear: () => Promise<void>;
}

export function useAnalysisHistory(): UseAnalysisHistoryResult {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [persistent, setPersistent] = useState(false);
  const storageRef = useRef<HistoryStorage | null>(null);

  useEffect(() => {
    let cancelled = false;
    const storage = createIndexedDbHistoryStorage() ?? createMemoryHistoryStorage();
    storage
      .open()
      .then(() => (cancelled ? null : listHistory(storage)))
      .then((initial) => {
        if (cancelled) return;
        storageRef.current = storage;
        setPersistent(typeof indexedDB !== 'undefined');
        setRecords(initial ?? []);
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        // Storage failed to open — fall back to session-only memory so the
        // rest of the app is unaffected.
        storageRef.current = createMemoryHistoryStorage();
        setPersistent(false);
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    const storage = storageRef.current;
    if (!storage) return;
    try {
      setRecords(await listHistory(storage));
    } catch {
      /* keep the last known list */
    }
  }, []);

  const save = useCallback(
    async (input: CompletedAnalysisInput): Promise<HistoryRecord | null> => {
      const storage = storageRef.current;
      if (!storage) return null;
      try {
        const record = await saveCompletedAnalysis(storage, input);
        await refresh();
        return record;
      } catch {
        return null; // persistence failure must never break the analysis flow
      }
    },
    [refresh],
  );

  const update = useCallback(
    async (id: string, patch: { explanation: CompletedAnalysisInput['explanation'] }) => {
      const storage = storageRef.current;
      if (!storage) return;
      try {
        await updateHistoryRecord(storage, id, patch);
        await refresh();
      } catch {
        /* non-fatal */
      }
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      const storage = storageRef.current;
      if (!storage) return;
      try {
        await deleteHistoryRecord(storage, id);
        await refresh();
      } catch {
        /* non-fatal */
      }
    },
    [refresh],
  );

  const clear = useCallback(async () => {
    const storage = storageRef.current;
    if (!storage) return;
    try {
      await clearHistoryStorage(storage);
      setRecords([]);
    } catch {
      /* non-fatal */
    }
  }, []);

  return { records, ready, persistent, save, update, remove, clear };
}
