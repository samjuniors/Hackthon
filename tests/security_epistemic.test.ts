import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FortyGuardAdapter } from '@/lib/fortyguard/adapter';
import { AuthenticationError, OutsideCoverageError } from '@/types/errors';
import { evaluateJointDecision } from '@/lib/decision-engine/evaluator';
import type { CandidateLocation, DecisionConstraints, NormalizedThermalObservation } from '@/types/domain';

describe('Security & Epistemic Boundaries', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. LIVE mode failure never silently falls back to FIXTURE mode', async () => {
    const adapter = new FortyGuardAdapter({ mode: 'LIVE', apiKey: 'invalid-key' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    );

    await expect(
      adapter.getHourlyHeatmapSnapshots({ latitude: 40.712, longitude: -74.008 }, [
        '2026-08-21T08:00:00.000Z',
      ])
    ).rejects.toThrow(AuthenticationError);
  });

  it('2. FIXTURE mode cannot be used to represent arbitrary unverified coordinates outside Manhattan', async () => {
    const adapter = new FortyGuardAdapter({ mode: 'FIXTURE' });
    // Attempting to query non-Manhattan coords in fixture mode throws OutsideCoverageError
    const snapshots = await adapter.getHourlyHeatmapSnapshots({ latitude: 34.0522, longitude: -118.2437 }, [
      '2026-08-21T08:00:00.000Z',
    ]);
    const aoi = snapshots.get('2026-08-21T08:00:00.000Z');
    expect(aoi).toBeDefined();
    if (aoi) {
      expect(() =>
        adapter.normalizePointObservation(aoi, { latitude: 34.0522, longitude: -118.2437 }, '2026-08-21T08:00:00.000Z')
      ).toThrow(OutsideCoverageError);
    }
  });

  it('3. AI cannot influence or mutate deterministic decision results', () => {
    const candidates: CandidateLocation[] = [
      {
        locationId: 'SITE-1',
        name: 'Site 1',
        location: { latitude: 40.712, longitude: -74.008 },
      },
    ];

    const observations = new Map<string, NormalizedThermalObservation[]>();
    observations.set('SITE-1', [
      {
        timestamp: '2026-08-21T08:00:00.000Z',
        location: { latitude: 40.712, longitude: -74.008 },
        selectedTileId: 'tile-1',
        sourceEndpoint: '/v1/heatmap',
        dataSource: 'FIXTURE',
        metrics: { temperatureCelsius: 28.5 },
        provenance: 'DERIVED',
      },
      {
        timestamp: '2026-08-21T09:00:00.000Z',
        location: { latitude: 40.712, longitude: -74.008 },
        selectedTileId: 'tile-1',
        sourceEndpoint: '/v1/heatmap',
        dataSource: 'FIXTURE',
        metrics: { temperatureCelsius: 29.5 },
        provenance: 'DERIVED',
      },
    ]);

    const constraints: DecisionConstraints = {
      allowedStart: '2026-08-21T08:00:00.000Z',
      allowedEnd: '2026-08-21T10:00:00.000Z',
      durationHours: 2,
      dataResolutionHours: 1,
    };

    const decision1 = evaluateJointDecision(candidates, observations, constraints, {
      dataSource: 'FIXTURE',
      baseTimestamp: '2026-08-21T08:00:00.000Z',
    });

    const decision2 = evaluateJointDecision(candidates, observations, constraints, {
      dataSource: 'FIXTURE',
      baseTimestamp: '2026-08-21T08:00:00.000Z',
    });

    // Zero nondeterminism or LLM interference
    expect(decision1.recommendedPlan.exposureScore).toBe(decision2.recommendedPlan.exposureScore);
    expect(decision1.recommendedPlan.planId).toBe(decision2.recommendedPlan.planId);
    expect(decision1.recommendedPlan.exposureScore).toBeCloseTo(29.0, 2);
  });
});
