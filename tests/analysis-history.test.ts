import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { POST as decisionPOST } from '@/app/api/decision/route';
import {
  FIXTURE_CAPTURE_REQUEST_AOI,
  FIXTURE_DISPLAY_GRANULARITY,
  FIXTURE_CAPTURED_AT_ISO,
  FIXTURE_ACTIVITY_ID,
  FIXTURE_CAPTURE_SPAN_METRES,
  DEMO_CANDIDATE_SITES,
} from '@/lib/fortyguard/fixture-display';
import { buildFixtureTemporalInput } from '@/lib/temporal/analysis-window';
import { createIndexedDbHistoryStorage, createMemoryHistoryStorage } from '@/lib/history/storage';
import {
  saveCompletedAnalysis,
  listHistory,
  getHistoryRecord,
  updateHistoryRecord,
  deleteHistoryRecord,
  clearHistoryStorage,
} from '@/lib/history/repository';
import {
  buildHistoryRecord,
  selectEvictionIds,
  groupHistoryByDay,
  findSecretKeys,
  isValidHistoryRecord,
} from '@/lib/history/record';
import type { CompletedAnalysisInput, HistoryRecord } from '@/lib/history/types';
import type { PolygonAOI } from '@/types/domain';
import capturedDemoFixture from './fixtures/heatmap_captured_demo.json';

/**
 * ANALYSIS HISTORY TESTS (Phase 11).
 *
 * Uses fake-indexeddb so the REAL IndexedDB storage code path is exercised
 * in Node (open → upgrade → put/get/getAll/delete/clear), not a mock.
 *
 * Contracts proven:
 *   - save ONLY completed analyses
 *   - load (newest first)
 *   - restore record completeness (the 425-cell fixture preserved verbatim)
 *   - delete + cap eviction (oldest out, newest never evicted)
 *   - NO secret persistence
 *   - LIVE vs DEMO provenance labels
 *   - restoration does not call the provider (source contract + pure state)
 */

const fixtureField = (
  capturedDemoFixture as {
    hourlySnapshots: Array<{ timestamp: string; aoi: PolygonAOI }>;
  }
).hourlySnapshots[0].aoi;

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/decision', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Run a REAL DEMO analysis through the decision route (fixture replay). */
async function runDemoAnalysis() {
  const res = await decisionPOST(makeRequest({
    latitude: 40.712,
    longitude: -74.006,
    mode: 'FIXTURE',
    granularity: FIXTURE_DISPLAY_GRANULARITY,
    analysisAoi: FIXTURE_CAPTURE_REQUEST_AOI,
    temporalInput: buildFixtureTemporalInput(),
    timezone: 'UTC',
  }));
  return (await res.json()) as {
    success: boolean;
    decision: never;
    spatialDecision: never;
    jointDecision: never;
    scenarioAnalysis: never;
    spatialField: PolygonAOI;
    spatialFieldMetadata: { baseTimestamp: string; coverageType: string; description: string; totalEvaluatedHours: number };
    providerActivityId: string | null;
    temporalProvenance: Record<string, unknown>;
  };
}

/** The exact CompletedAnalysisInput the page builds after a DEMO Generate. */
async function demoAnalysisInput(): Promise<CompletedAnalysisInput> {
  const data = await runDemoAnalysis();
  return {
    location: {
      name: 'Battery Park Greenway',
      latitude: 40.712,
      longitude: -74.006,
      timezone: 'UTC',
      city: 'New York',
      state: 'NY',
      country: 'US',
    },
    aoiGeometry: FIXTURE_CAPTURE_REQUEST_AOI,
    aoiShape: 'polygon',
    aoiSpanMetres: FIXTURE_CAPTURE_SPAN_METRES.width,
    aoiSizeLabel: '2.4km × 2.4km captured area',
    temporalInput: buildFixtureTemporalInput(),
    timezone: 'UTC',
    dataSourceMode: 'FIXTURE',
    providerActivityId: data.providerActivityId,
    granularity: FIXTURE_DISPLAY_GRANULARITY,
    thermalField: data.spatialField,
    spatialFieldMetadata: data.spatialFieldMetadata,
    candidates: DEMO_CANDIDATE_SITES,
    decision: data.decision,
    spatialDecision: data.spatialDecision,
    jointDecision: data.jointDecision,
    scenarioAnalysis: data.scenarioAnalysis,
    explanation: null,
    temporalProvenance: data.temporalProvenance as never,
    capturedAt: FIXTURE_CAPTURED_AT_ISO,
  };
}

/** Minimal completed-analysis input for volume tests (eviction etc.). */
function syntheticInput(n: number, field: PolygonAOI): CompletedAnalysisInput {
  return {
    location: { name: `Site ${n}`, latitude: 40.7 + n * 0.001, longitude: -74.0, timezone: 'UTC' },
    aoiGeometry: FIXTURE_CAPTURE_REQUEST_AOI,
    aoiShape: 'polygon',
    aoiSpanMetres: 1000,
    aoiSizeLabel: '1km × 1km',
    temporalInput: { date: '2026-08-14', startTime: '12:00', endTime: '13:00', timeMode: 'single-hour' },
    timezone: 'UTC',
    dataSourceMode: 'LIVE',
    providerActivityId: `act-${n}`,
    granularity: 100,
    thermalField: field,
    spatialFieldMetadata: {
      baseTimestamp: '2026-08-14T12:00:00.000Z',
      coverageType: 'BASE_TIMESTAMP_SNAPSHOT',
      description: 'test',
      totalEvaluatedHours: 1,
    },
    candidates: [{ locationId: 'SITE-01', name: 'S1', location: { latitude: 40.712, longitude: -74.006 } }],
    decision: null,
    spatialDecision: null,
    jointDecision: {
      decisionType: 'JOINT_SPATIAL_TEMPORAL_PLAN',
      recommendedPlan: {
        planId: 'p1', rank: 1,
        location: { locationId: 'SITE-01', name: 'S1', location: { latitude: 40.712, longitude: -74.006 } },
        window: { windowId: 'w1', startTime: '2026-08-14T12:00:00.000Z', endTime: '2026-08-14T13:00:00.000Z', durationHours: 1 },
        tileId: 't1', exposureScore: 30, deltaVsBest: 0, status: 'Optimal', thermalValues: [],
      },
      rankedPlans: [],
      searchSpace: { locationCount: 1, windowCount: 1, totalEvaluatedPlans: 1 },
      dataSource: 'LIVE',
      modelVersion: 'v1.0.0-spatial-thermal-baseline',
      spatialFieldMetadata: {
        baseTimestamp: '2026-08-14T12:00:00.000Z', coverageType: 'BASE_TIMESTAMP_SNAPSHOT',
        totalEvaluatedHours: 1, description: 'test',
      },
      evidenceBundle: { candidateCount: 1, windowCount: 1, sourceEndpoint: '/v1/heatmap', dataSource: 'LIVE', provenance: 'DERIVED' },
    },
    scenarioAnalysis: null,
    explanation: null,
    temporalProvenance: null,
  };
}

/** One-cell field for lightweight volume tests. */
const singleCellField: PolygonAOI = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { tile_id: 0, average_temperature: 30, min_temperature: 30, max_temperature: 30 },
    geometry: { type: 'Polygon', coordinates: [[[-74.01, 40.71], [-74.0, 40.71], [-74.0, 40.72], [-74.01, 40.72], [-74.01, 40.71]]] },
  }],
};

describe('Analysis History — repository over REAL IndexedDB (fake-indexeddb)', () => {
  let storage: ReturnType<typeof createMemoryHistoryStorage>;
  let idbStorage: ReturnType<typeof createIndexedDbHistoryStorage>;

  beforeEach(async () => {
    idbStorage = createIndexedDbHistoryStorage()!;
    storage = idbStorage;
    await storage.open();
    await storage.clear();
  });

  it('1. save COMPLETED analysis → load history (round trip through real IndexedDB)', async () => {
    const input = await demoAnalysisInput();
    const saved = await saveCompletedAnalysis(storage, input);
    expect(saved).not.toBeNull();

    const records = await listHistory(storage);
    expect(records.length).toBe(1);
    expect(records[0].id).toBe(saved!.id);
    expect(records[0].location.name).toBe('Battery Park Greenway');
    expect(records[0].thermalCellCount).toBe(425);
  });

  it('2. the 425-cell fixture is preserved VERBATIM in the saved record', async () => {
    const input = await demoAnalysisInput();
    const saved = await saveCompletedAnalysis(storage, input)!;

    const loaded = await getHistoryRecord(storage, saved!.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.thermalCellCount).toBe(425);
    expect(loaded!.thermalField).toEqual(fixtureField); // deep-equal — verbatim provider geometry
    expect(loaded!.spatialFieldMetadata?.baseTimestamp).toBe('2026-08-14T12:00:00.000Z');
    // Decisions + candidates travel with the record.
    expect(loaded!.jointDecision).toEqual(input.jointDecision);
    expect(loaded!.candidates).toEqual(DEMO_CANDIDATE_SITES);
  });

  it('3. save REJECTS incomplete analyses — no decision or empty field → nothing persisted', async () => {
    const input = await demoAnalysisInput();

    // No jointDecision → not a completed analysis.
    expect(await saveCompletedAnalysis(storage, { ...input, jointDecision: null })).toBeNull();
    // Empty thermal field → not a reproducible thermal analysis.
    expect(await saveCompletedAnalysis(storage, { ...input, thermalField: { type: 'FeatureCollection', features: [] } })).toBeNull();
    expect((await listHistory(storage)).length).toBe(0);
  });

  it('4. delete one record + clear all', async () => {
    const a = await saveCompletedAnalysis(storage, { ...(await demoAnalysisInput()), createdAt: '2026-08-01T10:00:00.000Z' });
    const b = await saveCompletedAnalysis(storage, { ...(await demoAnalysisInput()), createdAt: '2026-08-02T10:00:00.000Z' });
    await deleteHistoryRecord(storage, a!.id);
    let records = await listHistory(storage);
    expect(records.length).toBe(1);
    expect(records[0].id).toBe(b!.id);

    await clearHistoryStorage(storage);
    expect((await listHistory(storage)).length).toBe(0);
  });

  it('5. cap eviction — beyond 20 records the OLDEST are evicted; the newest survives', async () => {
    // 22 saves with increasing createdAt → exactly 20 remain.
    for (let i = 0; i < 22; i++) {
      const input = syntheticInput(i, singleCellField);
      const saved = await saveCompletedAnalysis(
        storage,
        input,
        { id: `hx-evict-${i}`, createdAt: new Date(Date.parse('2026-08-01T00:00:00Z') + i * 3600_000).toISOString() },
      );
      expect(saved).not.toBeNull();
    }

    const records = await listHistory(storage);
    expect(records.length).toBe(20);
    // Newest (i=21) is present; oldest (i=0, i=1) evicted.
    expect(records.some((r) => r.id === 'hx-evict-21')).toBe(true);
    expect(records.some((r) => r.id === 'hx-evict-20')).toBe(true);
    expect(records.some((r) => r.id === 'hx-evict-0')).toBe(false);
    expect(records.some((r) => r.id === 'hx-evict-1')).toBe(false);
    // Strictly newest-first ordering.
    for (let i = 1; i < records.length; i++) {
      expect(records[i - 1].createdAt >= records[i].createdAt).toBe(true);
    }
  });

  it('6. late-arriving explanation is UPSERTED into the saved record (id/createdAt immutable)', async () => {
    const input = await demoAnalysisInput();
    const saved = await saveCompletedAnalysis(storage, input)!;
    const explanation = {
      summary: 'test explanation',
      reasoning: [],
      grounding: { grounded: true, unsupportedClaims: [] },
      provenance: { provider: 'deterministic' },
      generatedAt: '2026-08-14T12:00:01.000Z',
    } as never;

    const updated = await updateHistoryRecord(storage, saved!.id, { explanation });
    expect(updated!.explanation).toEqual(explanation);
    expect(updated!.id).toBe(saved!.id);
    expect(updated!.createdAt).toBe(saved!.createdAt);

    const reloaded = await getHistoryRecord(storage, saved!.id);
    expect(reloaded!.explanation).toEqual(explanation);
  });
});

describe('Analysis History — provenance (Phase 8)', () => {
  it('7. DEMO provenance: "Captured FortyGuard" + capture date — never implied to be fresh', async () => {
    const input = await demoAnalysisInput();
    const saved = await saveCompletedAnalysis(createMemoryHistoryStorage(), input);
    expect(saved).not.toBeNull();
    const record = saved as HistoryRecord;

    expect(record.dataSourceMode).toBe('FIXTURE');
    expect(record.provenance.providerLabel).toBe('Captured FortyGuard');
    expect(record.provenance.capturedAt).toBe(FIXTURE_CAPTURED_AT_ISO);
    expect(record.provenance.description).toMatch(/no live provider request/i);
    expect(record.providerActivityId).toBe(FIXTURE_ACTIVITY_ID);
  });

  it('8. LIVE provenance: "FortyGuard" + no capture date + provider activity id', () => {
    const record = buildHistoryRecord(syntheticInput(1, singleCellField));
    expect(record.dataSourceMode).toBe('LIVE');
    expect(record.provenance.providerLabel).toBe('FortyGuard');
    expect(record.provenance.capturedAt).toBeNull();
    expect(record.provenance.description).toMatch(/live fortyguard/i);
    expect(record.providerActivityId).toBe('act-1');
  });

  it('9. list rows can render Phase-8 detail lines (granularity · cells · recommended site)', () => {
    const record = buildHistoryRecord(syntheticInput(1, singleCellField));
    expect(record.granularity).toBe(100);
    expect(record.thermalCellCount).toBe(1);
    expect(record.jointDecision!.recommendedPlan.location.name).toBe('S1');
  });
});

describe('Analysis History — NO secret persistence', () => {
  it('10. a saved record contains no credential-shaped keys and no API-key material', async () => {
    // The key exists in the process env (tests/setup-env.ts loads .env.local).
    const key = process.env.FORTYGUARD_API_KEY;
    expect(key).toBeTruthy();

    const input = await demoAnalysisInput();
    const record = await saveCompletedAnalysis(createMemoryHistoryStorage(), input)!;

    const json = JSON.stringify(record);
    expect(json).not.toContain(key!); // no key material
    expect(json).not.toContain('api-key');
    expect(json).not.toContain('api_key');
    expect(findSecretKeys(record)).toEqual([]); // no credential-shaped property keys
  });
});

describe('Analysis History — record helpers', () => {
  it('11. selectEvictionIds never selects the newest and only evicts overflow', () => {
    const records: HistoryRecord[] = [];
    for (let i = 0; i < 25; i++) {
      records.push(buildHistoryRecord(
        syntheticInput(i, singleCellField),
        `hx-${String(i).padStart(2, '0')}`,
        new Date(Date.parse('2026-08-01T00:00:00Z') + i * 60_000).toISOString(),
      ));
    }
    const evict = selectEvictionIds(records, 20);
    expect(evict.length).toBe(5);
    expect(evict).toContain('hx-00'); // oldest
    expect(evict).not.toContain('hx-24'); // newest is NEVER evicted
  });

  it('12. groupHistoryByDay labels TODAY / YESTERDAY and orders newest first', () => {
    const now = new Date('2026-08-28T15:00:00');
    const mk = (iso: string, id: string) =>
      buildHistoryRecord(syntheticInput(1, singleCellField), id, iso);
    const records = [
      mk('2026-08-28T09:00:00', 'hx-today'),
      mk('2026-08-27T18:00:00', 'hx-yesterday'),
      mk('2026-08-21T08:00:00', 'hx-old'),
    ];
    const groups = groupHistoryByDay(records, now);
    expect(groups[0].label).toBe('TODAY');
    expect(groups[0].records[0].id).toBe('hx-today');
    expect(groups[1].label).toBe('YESTERDAY');
    expect(groups[2].label).toBe('Aug 21, 2026');
  });

  it('13. isValidHistoryRecord rejects malformed / future-version rows', () => {
    const record = buildHistoryRecord(syntheticInput(1, singleCellField));
    expect(isValidHistoryRecord(record)).toBe(true);
    expect(isValidHistoryRecord(null)).toBe(false);
    expect(isValidHistoryRecord({ ...record, version: 99 })).toBe(false);
    expect(isValidHistoryRecord({ ...record, dataSourceMode: 'WEIRD' })).toBe(false);
  });
});

describe('Analysis History — restoration MUST NOT call the provider (Phase 10)', () => {
  const pageSource = readFileSync(resolvePath(process.cwd(), 'src/app/page.tsx'), 'utf-8');

  it('14. the restore handler is pure local state — no pipeline, no fetch, no Generate', () => {
    // Locate the restore handler body.
    const start = pageSource.indexOf('const handleRestoreHistory = useCallback(');
    const end = pageSource.indexOf('}, [', start);
    expect(start).toBeGreaterThan(-1);
    const body = pageSource.slice(start, end);

    expect(body).not.toContain('runDecisionPipeline');
    expect(body).not.toContain("fetch(");
    expect(body).not.toContain("'/api/decision'");
    expect(body).toContain('setSpatialField(record.thermalField'); // saved field is authoritative
  });

  it('15. the auto-pipeline mode effect is guarded by the restoring flag', () => {
    const start = pageSource.indexOf('// React to data-source mode changes');
    const end = pageSource.indexOf('}, [mode]);', start);
    const effect = pageSource.slice(start, end);
    expect(effect).toContain('if (restoringRef.current) return;');
  });

  it('16. the AOI-prefs effect is guarded by the restoring flag (restored results not cleared)', () => {
    const start = pageSource.indexOf('// React to AOI shape / size / resolution changes');
    const end = pageSource.indexOf('], [prefs.analysisAreaShape, prefs.analysisAoiSpanMetres, prefs.analysisResolution]);', start);
    const effect = pageSource.slice(start, end);
    expect(effect).toContain('if (restoringRef.current) return;');
  });

  it('17. restoring sets the Saved-analysis label with the original timestamp', () => {
    expect(pageSource).toContain('setRestoredAnalysis(record)');
    expect(pageSource).toContain('data-testid="restored-analysis-banner"');
    expect(pageSource).toContain('Saved analysis');
  });

  it('18. the ONLY save path is the completed-analysis success branch', () => {
    const occurrences = pageSource.split('await saveHistory({').length - 1;
    expect(occurrences).toBe(1); // exactly one call site — the success path
    // …and it sits AFTER the success guard and BEFORE the failure return.
    const saveIdx = pageSource.indexOf('await saveHistory({');
    const successIdx = pageSource.indexOf('return; // failed analysis → NO history record (Phase 5)');
    expect(saveIdx).toBeGreaterThan(successIdx);
  });
});
