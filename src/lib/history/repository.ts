/**
 * ANALYSIS HISTORY — repository (storage-composed operations).
 *
 * Lifecycle contract (Phase 5): ONLY completed analyses are persisted. The
 * repository never saves on Generate-start, on provider failure, or on a
 * cancelled/stale request — callers invoke `saveCompletedAnalysis` solely
 * from the success path.
 *
 * Cap contract (Phase 9): at most HISTORY_MAX_RECORDS entries; on overflow
 * the OLDEST records are evicted. The just-saved record is never evicted.
 */
import type { CompletedAnalysisInput, HistoryRecord } from './types';
import { HISTORY_MAX_RECORDS } from './types';
import type { HistoryStorage } from './storage';
import {
  buildHistoryRecord,
  isValidHistoryRecord,
  selectEvictionIds,
  sortHistoryNewestFirst,
} from './record';

/**
 * Persist a completed analysis, then enforce the client-side cap by evicting
 * the oldest overflow records. Returns the saved record (or null when
 * storage is unavailable / the input was not persistable).
 *
 * `opts.id` / `opts.createdAt` exist for deterministic tests — production
 * callers omit them (timestamp + random id).
 */
export async function saveCompletedAnalysis(
  storage: HistoryStorage,
  input: CompletedAnalysisInput,
  opts?: { id?: string; createdAt?: string },
): Promise<HistoryRecord | null> {
  // A history record must be a COMPLETE thermal analysis: a decision plus a
  // renderable thermal field. (An empty-field LIVE oddity is not a
  // reproducible thermal analysis and is honestly not saved.)
  if (!input.jointDecision || !input.thermalField || input.thermalField.features.length === 0) {
    return null;
  }

  const record = buildHistoryRecord(input, opts?.id, opts?.createdAt);
  await storage.put(record);

  // Cap enforcement — evict the OLDEST overflow, never the newest.
  const all = await storage.getAll();
  const valid = all.filter(isValidHistoryRecord);
  for (const id of selectEvictionIds(valid, HISTORY_MAX_RECORDS)) {
    await storage.delete(id);
  }

  return record;
}

/** All history records, NEWEST first. Invalid/unknown-version rows skipped. */
export async function listHistory(storage: HistoryStorage): Promise<HistoryRecord[]> {
  const all = await storage.getAll();
  return sortHistoryNewestFirst(all.filter(isValidHistoryRecord));
}

/** Fetch one record by id (validated). */
export async function getHistoryRecord(
  storage: HistoryStorage,
  id: string,
): Promise<HistoryRecord | null> {
  const record = await storage.get(id);
  return isValidHistoryRecord(record) ? record : null;
}

/**
 * Patch an existing record (used to attach the AI explanation when it
 * arrives after the initial save). Never changes id/createdAt/provenance.
 */
export async function updateHistoryRecord(
  storage: HistoryStorage,
  id: string,
  patch: Partial<Pick<HistoryRecord, 'explanation'>>,
): Promise<HistoryRecord | null> {
  const existing = await getHistoryRecord(storage, id);
  if (!existing) return null;
  const next: HistoryRecord = { ...existing, ...patch };
  await storage.put(next);
  return next;
}

/** Delete one record. */
export async function deleteHistoryRecord(
  storage: HistoryStorage,
  id: string,
): Promise<void> {
  await storage.delete(id);
}

/** Clear the entire history (explicit user action only). */
export async function clearHistoryStorage(storage: HistoryStorage): Promise<void> {
  await storage.clear();
}
