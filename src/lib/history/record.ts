/**
 * ANALYSIS HISTORY — record construction + eviction + date grouping (pure).
 *
 * Everything here is pure and synchronous: no IndexedDB, no React. The
 * repository/storage layers compose these helpers.
 */
import type {
  CompletedAnalysisInput,
  HistoryRecord,
} from './types';
import { HISTORY_MAX_RECORDS, HISTORY_RECORD_VERSION } from './types';
import { analyzeAoiArea } from '@/lib/spatial/aoi';

/**
 * Generate a collision-safe record id (timestamp base36 + random suffix).
 * Not a UUID for compactness — local, single-writer storage only.
 */
export function generateHistoryId(now = Date.now()): string {
  return `hx-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Build a history record from a COMPLETED analysis. Only completed analyses
 * are ever passed here (the caller enforces the lifecycle); the builder
 * copies exactly the structured analysis state — API keys, tokens, and any
 * other secrets are structurally impossible to include (they never appear in
 * the input type).
 */
export function buildHistoryRecord(
  input: CompletedAnalysisInput,
  id: string = generateHistoryId(),
  createdAt: string = new Date().toISOString(),
): HistoryRecord {
  const isFixture = input.dataSourceMode === 'FIXTURE';
  // AOI area — computed from the AUTHORITATIVE geometry via the single
  // shared area function (never from the passed size label text).
  const aoiArea = analyzeAoiArea(input.aoiGeometry);
  return {
    id,
    version: HISTORY_RECORD_VERSION,
    createdAt,
    location: input.location,
    aoiGeometry: input.aoiGeometry,
    aoiShape: input.aoiShape,
    aoiSpanMetres: input.aoiSpanMetres,
    aoiSizeLabel: input.aoiSizeLabel,
    aoiAreaKm2: Number.isFinite(aoiArea.areaKm2) ? Number(aoiArea.areaKm2.toFixed(4)) : null,
    aoiAreaMi2: Number.isFinite(aoiArea.areaMi2) ? Number(aoiArea.areaMi2.toFixed(4)) : null,
    temporalInput: input.temporalInput,
    timezone: input.timezone,
    dataSourceMode: input.dataSourceMode,
    providerActivityId: input.providerActivityId,
    granularity: input.granularity,
    thermalField: input.thermalField,
    thermalCellCount: input.thermalField?.features?.length ?? 0,
    spatialFieldMetadata: input.spatialFieldMetadata,
    candidates: input.candidates,
    decision: input.decision,
    spatialDecision: input.spatialDecision,
    jointDecision: input.jointDecision,
    scenarioAnalysis: input.scenarioAnalysis,
    explanation: input.explanation,
    provenance: {
      dataSource: input.dataSourceMode,
      providerLabel: isFixture ? 'Captured FortyGuard' : 'FortyGuard',
      activityId: input.providerActivityId,
      capturedAt: isFixture ? (input.capturedAt ?? null) : null,
      analyzedAt: createdAt,
      temporalProvenance: input.temporalProvenance,
      description: isFixture
        ? 'DEMO replay of a captured FortyGuard response — no live provider request was made for this analysis.'
        : 'Live FortyGuard /v1/heatmap request completed at analysis time.',
    },
  };
}

/**
 * Records sorted NEWEST-first (primary list ordering).
 */
export function sortHistoryNewestFirst(records: HistoryRecord[]): HistoryRecord[] {
  return [...records].sort((a, b) =>
    a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : b.createdAt.localeCompare(a.createdAt),
  );
}

/**
 * Eviction policy (Phase 9): with a cap of N records, the OLDEST records
 * beyond the cap are evicted. The newest record (index 0 after sorting, i.e.
 * the one just saved) is NEVER selected for eviction.
 */
export function selectEvictionIds(
  records: HistoryRecord[],
  cap: number = HISTORY_MAX_RECORDS,
): string[] {
  if (records.length <= cap) return [];
  const oldest = sortHistoryNewestFirst(records).slice(cap); // drop newest `cap`, keep oldest overflow
  return oldest.map((r) => r.id);
}

/**
 * Validate an unknown stored value as a HistoryRecord (schema version guard
 * for forward compatibility — unknown versions are ignored, not mutated).
 */
export function isValidHistoryRecord(value: unknown): value is HistoryRecord {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.createdAt === 'string' &&
    v.version === HISTORY_RECORD_VERSION &&
    !!v.location && typeof v.location === 'object' &&
    (v.dataSourceMode === 'LIVE' || v.dataSourceMode === 'FIXTURE') &&
    Array.isArray(v.candidates)
  );
}

export interface HistoryDayGroup {
  /** Group key 'YYYY-MM-DD' in LOCAL browser time. */
  key: string;
  /** Human label: TODAY / YESTERDAY / 'Aug 21, 2026'. */
  label: string;
  records: HistoryRecord[];
}

/** Group records by local calendar day, newest first (Phase 7 list layout). */
export function groupHistoryByDay(records: HistoryRecord[], now = new Date()): HistoryDayGroup[] {
  const sorted = sortHistoryNewestFirst(records);
  const groups: HistoryDayGroup[] = [];
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOfDay(now);
  const yesterday = today - 86400_000;

  for (const r of sorted) {
    const d = new Date(r.createdAt);
    const day = startOfDay(d);
    const label =
      day === today ? 'TODAY' : day === yesterday ? 'YESTERDAY' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = { key, label, records: [] };
      groups.push(group);
    }
    group.records.push(r);
  }
  return groups;
}

/**
 * Secret scanner (defense-in-depth for tests/diagnostics): recursively walk a
 * record and report any property KEY that looks credential-shaped. The record
 * builder cannot produce these (structural guarantee), but the scan makes the
 * "no secret persistence" contract testable.
 */
const SECRET_KEY_RE = /(api[_-]?key|token|secret|password|authorization|credential|bearer)/i;

export function findSecretKeys(value: unknown, path = '$', depth = 0): string[] {
  if (depth > 8 || value === null || typeof value !== 'object') return [];
  const hits: string[] = [];
  if (Array.isArray(value)) {
    for (let i = 0; i < Math.min(value.length, 64); i++) {
      hits.push(...findSecretKeys(value[i], `${path}[${i}]`, depth + 1));
    }
    return hits;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const p = `${path}.${k}`;
    if (SECRET_KEY_RE.test(k)) hits.push(p);
    hits.push(...findSecretKeys(v, p, depth + 1));
  }
  return hits;
}
