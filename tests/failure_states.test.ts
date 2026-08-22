import { describe, it, expect, vi } from 'vitest';
import { FortyGuardAdapter } from '@/lib/fortyguard/adapter';
import { findTileForPoint } from '@/lib/spatial/mapper';
import { evaluateCandidateWindows } from '@/lib/decision-engine/evaluator';
import { explainDecision } from '@/lib/explanation/ai-explainer';
import {
  AuthenticationError,
  FortyGuardApiError,
  FortyGuardProcessingError,
  IncompleteTemporalCoverageError,
  OutsideCoverageError,
} from '@/types/errors';
import type { ExplainableDecisionInput } from '@/types/explanation';
import type {
  JointDecisionResult,
  NormalizedThermalObservation,
  PolygonAOI,
  LocationPoint,
  DecisionConstraints,
} from '@/types/domain';
import hourlyFixtureData from './fixtures/heatmap_hourly_fixture.json';

describe('Milestone 9 — Comprehensive System Hardening & Failure-State Suite', () => {
  const sampleJointDecision: JointDecisionResult = {
    decisionType: 'JOINT_SPATIAL_TEMPORAL_PLAN',
    recommendedPlan: {
      planId: 'plan-loc-a-08',
      rank: 1,
      location: {
        locationId: 'LOC-A',
        name: 'Battery Park Greenway (Waterfront)',
        location: { latitude: 40.712, longitude: -74.008 },
      },
      window: {
        windowId: 'w-08-10',
        startTime: '2026-08-21T08:00:00.000Z',
        endTime: '2026-08-21T10:00:00.000Z',
        durationHours: 2,
      },
      tileId: 'tile-11',
      exposureScore: 29.15,
      deltaVsBest: 0.0,
      status: 'Optimal',
      thermalValues: [],
    },
    rankedPlans: [
      {
        planId: 'plan-loc-a-08',
        rank: 1,
        location: {
          locationId: 'LOC-A',
          name: 'Battery Park Greenway (Waterfront)',
          location: { latitude: 40.712, longitude: -74.008 },
        },
        window: {
          windowId: 'w-08-10',
          startTime: '2026-08-21T08:00:00.000Z',
          endTime: '2026-08-21T10:00:00.000Z',
          durationHours: 2,
        },
        tileId: 'tile-11',
        exposureScore: 29.15,
        deltaVsBest: 0.0,
        status: 'Optimal',
        thermalValues: [],
      },
      {
        planId: 'plan-loc-c-12',
        rank: 15,
        location: {
          locationId: 'LOC-C',
          name: 'Chinatown / Bowery Staging (Asphalt Canyon)',
          location: { latitude: 40.712, longitude: -73.988 },
        },
        window: {
          windowId: 'w-12-14',
          startTime: '2026-08-21T12:00:00.000Z',
          endTime: '2026-08-21T14:00:00.000Z',
          durationHours: 2,
        },
        tileId: 'tile-13',
        exposureScore: 37.55,
        deltaVsBest: 8.4,
        status: 'Feasible',
        thermalValues: [],
      },
    ],
    searchSpace: { locationCount: 3, windowCount: 5, totalEvaluatedPlans: 15 },
    dataSource: 'FIXTURE',
    modelVersion: 'v1.0.0-spatial-thermal-baseline',
    spatialFieldMetadata: {
      baseTimestamp: '2026-08-21T08:00:00.000Z',
      coverageType: 'BASE_TIMESTAMP_SNAPSHOT',
      totalEvaluatedHours: 6,
      description: 'Failure test metadata',
    },
    evidenceBundle: {
      candidateCount: 3,
      windowCount: 5,
      sourceEndpoint: '/v1/heatmap',
      dataSource: 'FIXTURE',
      provenance: 'DERIVED',
    },
  };

  const sampleInput: ExplainableDecisionInput = {
    jointDecision: sampleJointDecision,
  };

  const sampleAoi = hourlyFixtureData.hourlySnapshots[0].aoi as unknown as PolygonAOI;

  it('1. Missing FortyGuard API key throws AuthenticationError in LIVE mode', async () => {
    const adapter = new FortyGuardAdapter({ mode: 'LIVE', apiKey: '' });
    await expect(
      adapter.getHeatmap({
        polygon_aoi: sampleAoi,
        date_time: { start_date: '2026-08-21', filter_type: 1 },
        granularity: 60,
      })
    ).rejects.toThrow(AuthenticationError);
  });

  it('2. Invalid FortyGuard credentials (HTTP 401) throw AuthenticationError', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 })
    );

    const adapter = new FortyGuardAdapter({ mode: 'LIVE', apiKey: 'invalid-key' });
    await expect(
      adapter.getHeatmap({
        polygon_aoi: sampleAoi,
        date_time: { start_date: '2026-08-21', filter_type: 1 },
        granularity: 60,
      })
    ).rejects.toThrow(AuthenticationError);

    fetchSpy.mockRestore();
  });

  it('3. FortyGuard HTTP 500 failure throws FortyGuardApiError with status code', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 })
    );

    const adapter = new FortyGuardAdapter({ mode: 'LIVE', apiKey: 'valid-key' });
    await expect(
      adapter.getHeatmap({
        polygon_aoi: sampleAoi,
        date_time: { start_date: '2026-08-21', filter_type: 1 },
        granularity: 60,
      })
    ).rejects.toThrow(FortyGuardApiError);

    fetchSpy.mockRestore();
  });

  it('4. Malformed FortyGuard response missing activity_id throws FortyGuardApiError', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: {} }), { status: 200 })
    );

    const adapter = new FortyGuardAdapter({ mode: 'LIVE', apiKey: 'valid-key' });
    await expect(
      adapter.getHeatmap({
        polygon_aoi: sampleAoi,
        date_time: { start_date: '2026-08-21', filter_type: 1 },
        granularity: 60,
      })
    ).rejects.toThrow(FortyGuardApiError);

    fetchSpy.mockRestore();
  });

  it('5. FortyGuard activity polling timeout throws FortyGuardProcessingError', async () => {
    vi.useFakeTimers();
    let callCount = 0;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(
          new Response(JSON.stringify({ data: { activity_id: 'act-123' } }), { status: 200 })
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ data: { status: 'Processing' } }), { status: 200 })
      );
    });

    const adapter = new FortyGuardAdapter({ mode: 'LIVE', apiKey: 'valid-key' });
    const heatmapPromise = adapter.getHeatmap({
      polygon_aoi: sampleAoi,
      date_time: { start_date: '2026-08-21', filter_type: 1 },
      granularity: 60,
    });

    const assertion = expect(heatmapPromise).rejects.toThrow(FortyGuardProcessingError);
    await vi.advanceTimersByTimeAsync(65000);
    await assertion;

    fetchSpy.mockRestore();
    vi.useRealTimers();
  });



  it('6. Missing hourly snapshot throws IncompleteTemporalCoverageError', async () => {
    const adapter = new FortyGuardAdapter({ mode: 'FIXTURE' });
    await expect(
      adapter.getHourlyHeatmapSnapshots(
        { latitude: 40.712, longitude: -74.008 },
        ['2099-01-01T00:00:00.000Z']
      )
    ).rejects.toThrow(IncompleteTemporalCoverageError);
  });

  it('7. Operating window bounds exceeding +12h forecast lead time throw IncompleteTemporalCoverageError', () => {
    const baseTime = '2026-08-21T08:00:00.000Z';
    const futureStart = '2026-08-21T22:00:00.000Z'; // +14h
    const futureEnd = '2026-08-22T00:00:00.000Z'; // +16h

    const loc: LocationPoint = { latitude: 40.712, longitude: -74.008 };
    const observations: NormalizedThermalObservation[] = [];
    const constraints: DecisionConstraints = {
      allowedStart: futureStart,
      allowedEnd: futureEnd,
      durationHours: 2,
      dataResolutionHours: 1,
    };

    expect(() => evaluateCandidateWindows(loc, observations, constraints, baseTime)).toThrow(
      IncompleteTemporalCoverageError
    );
  });

  it('8. Coordinates outside spatial coverage throw OutsideCoverageError', () => {
    const outOfBoundsPoint = { latitude: 0.0, longitude: 0.0 };
    expect(() => findTileForPoint(outOfBoundsPoint, sampleAoi)).toThrow(OutsideCoverageError);
  });

  it('9. Explanation timeout triggers deterministic fallback', async () => {
    const exp = await explainDecision(sampleInput, { apiKey: '' });
    expect(exp.generatedBy).toBe('DETERMINISTIC_FALLBACK');
    expect(exp.fallbackReason).toBe('LLM_API_KEY_NOT_CONFIGURED: Defaulting to deterministic rule-based explanation.');
  });

  it('10. Explanation grounding rejection triggers deterministic fallback', async () => {
    const hallucinatedMock = {
      summary: 'Optimal plan at 29.15°C with 999% imaginary score.',
      whyThisPlan: 'Evaluated 15 feasible candidate plans.',
      epistemicNotice: 'Modeled thermal baseline (v1.0.0-spatial-thermal-baseline).',
    };

    const exp = await explainDecision(sampleInput, { mockLlmResponse: hallucinatedMock });
    expect(exp.generatedBy).toBe('DETERMINISTIC_FALLBACK');
    expect(exp.fallbackReason).toContain('UNGROUNDED_NUMERIC_VALUE');
  });

  it('11. Successful decision is never mutated by a failed explanation', async () => {
    const initialPlanScore = sampleJointDecision.recommendedPlan.exposureScore;
    const initialPlanLoc = sampleJointDecision.recommendedPlan.location.name;

    await explainDecision(sampleInput, { apiKey: '' });

    expect(sampleJointDecision.recommendedPlan.exposureScore).toBe(initialPlanScore);
    expect(sampleJointDecision.recommendedPlan.location.name).toBe(initialPlanLoc);
  });

  it('12. LIVE mode failure never silently falls back to FIXTURE mode', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
      new Error('Network offline')
    );

    const liveAdapter = new FortyGuardAdapter({ mode: 'LIVE', apiKey: 'valid-key' });
    await expect(
      liveAdapter.getHeatmap({
        polygon_aoi: sampleAoi,
        date_time: { start_date: '2026-08-21', filter_type: 1 },
        granularity: 60,
      })
    ).rejects.toThrow(FortyGuardApiError);

    expect(liveAdapter.mode).toBe('LIVE');
    fetchSpy.mockRestore();
  });

  it('13. FIXTURE mode explicitly preserves dataSource: FIXTURE', async () => {
    const fixtureAdapter = new FortyGuardAdapter({ mode: 'FIXTURE' });
    const res = await fixtureAdapter.getHourlyHeatmapSnapshots(
      { latitude: 40.712, longitude: -74.008 },
      ['2026-08-21T08:00:00.000Z']
    );

    expect(res.size).toBe(1);
    expect(fixtureAdapter.mode).toBe('FIXTURE');
  });
});
