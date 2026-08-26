import { describe, it, expect } from 'vitest';
import { evaluateJointDecision } from '@/lib/decision-engine/evaluator';
import type {
  CandidateLocation,
  DecisionConstraints,
  NormalizedThermalObservation,
} from '@/types/domain';
import {
  ValidationError,
  IncompleteTemporalCoverageError,
} from '@/types/errors';
import { buildEngineTestObservations } from './helpers/engine-test-observations';

describe('Milestone 6 — Joint Spatial-Temporal Decision Model Suite', () => {
  const candidateLocations: CandidateLocation[] = [
    {
      locationId: 'LOC-A',
      name: 'Battery Park Greenway (Waterfront)',
      location: { latitude: 40.7120, longitude: -74.0080 },
    },
    {
      locationId: 'LOC-B',
      name: 'City Hall Civic Center (Mid-Density)',
      location: { latitude: 40.7120, longitude: -73.9980 },
    },
    {
      locationId: 'LOC-C',
      name: 'Chinatown / Bowery Staging (Asphalt Canyon)',
      location: { latitude: 40.7120, longitude: -73.9880 },
    },
  ];

  const constraints2h: DecisionConstraints = {
    allowedStart: '2026-08-21T08:00:00.000Z',
    allowedEnd: '2026-08-21T14:00:00.000Z',
    durationHours: 2,
    dataResolutionHours: 1,
  };

  const timestamps6h = [
    '2026-08-21T08:00:00.000Z',
    '2026-08-21T09:00:00.000Z',
    '2026-08-21T10:00:00.000Z',
    '2026-08-21T11:00:00.000Z',
    '2026-08-21T12:00:00.000Z',
    '2026-08-21T13:00:00.000Z',
  ];

  // Engine math is verified against EXPLICIT SYNTHETIC TEST INPUTS (see
  // tests/helpers/engine-test-observations.ts) — never the DEMO capture (which
  // is a single real hour) and never fabricated provider data.
  function loadTestObservations(): Map<string, NormalizedThermalObservation[]> {
    return buildEngineTestObservations(candidateLocations, timestamps6h);
  }

  it('1. Exhaustively evaluates Cartesian product (3 locations × 5 windows = 15 candidate plans)', async () => {
    const obsMap = loadTestObservations();
    const result = evaluateJointDecision(candidateLocations, obsMap, constraints2h);

    expect(result.decisionType).toBe('JOINT_SPATIAL_TEMPORAL_PLAN');
    expect(result.searchSpace.locationCount).toBe(3);
    expect(result.searchSpace.windowCount).toBe(5);
    expect(result.searchSpace.totalEvaluatedPlans).toBe(15);
    expect(result.rankedPlans.length).toBe(15);
  });

  it('2. Identifies correct Global Optimum (LOC-A @ 08:00–10:00 UTC = 29.15°C)', async () => {
    const obsMap = loadTestObservations();
    const result = evaluateJointDecision(candidateLocations, obsMap, constraints2h);

    const topPlan = result.recommendedPlan;
    expect(topPlan.rank).toBe(1);
    expect(topPlan.status).toBe('Optimal');
    expect(topPlan.location.locationId).toBe('LOC-A');
    expect(topPlan.window.startTime).toBe('2026-08-21T08:00:00.000Z');
    expect(topPlan.window.endTime).toBe('2026-08-21T10:00:00.000Z');
    expect(topPlan.exposureScore).toBe(29.15);
    expect(topPlan.deltaVsBest).toBe(0.00);
    expect(topPlan.tileId).toBe('tile-11');
  });

  it('3. Computes exact scores and deltas across all 15 plans and identifies worst feasible plan', async () => {
    const obsMap = loadTestObservations();
    const result = evaluateJointDecision(candidateLocations, obsMap, constraints2h);

    // Check rank #2: LOC-B @ 08:00–10:00 = 29.75°C (delta +0.60°C)
    expect(result.rankedPlans[1].location.locationId).toBe('LOC-B');
    expect(result.rankedPlans[1].window.startTime).toBe('2026-08-21T08:00:00.000Z');
    expect(result.rankedPlans[1].exposureScore).toBe(29.75);
    expect(result.rankedPlans[1].deltaVsBest).toBe(0.60);

    // Check rank #3: LOC-A @ 09:00–11:00 = 30.50°C (delta +1.35°C)
    expect(result.rankedPlans[2].location.locationId).toBe('LOC-A');
    expect(result.rankedPlans[2].window.startTime).toBe('2026-08-21T09:00:00.000Z');
    expect(result.rankedPlans[2].exposureScore).toBe(30.50);
    expect(result.rankedPlans[2].deltaVsBest).toBe(1.35);

    // Check worst plan (rank #15): LOC-C @ 12:00–14:00 = 37.55°C (delta +8.40°C)
    const worstPlan = result.rankedPlans[14];
    expect(worstPlan.rank).toBe(15);
    expect(worstPlan.location.locationId).toBe('LOC-C');
    expect(worstPlan.window.startTime).toBe('2026-08-21T12:00:00.000Z');
    expect(worstPlan.exposureScore).toBe(37.55);
    expect(worstPlan.deltaVsBest).toBe(8.40);
  });

  it('4. Preserves DERIVED provenance for all thermalValues across all candidate plans', async () => {
    const obsMap = loadTestObservations();
    const result = evaluateJointDecision(candidateLocations, obsMap, constraints2h);

    for (const plan of result.rankedPlans) {
      expect(plan.thermalValues.length).toBe(2);
      for (const tv of plan.thermalValues) {
        expect(tv.provenance).toBe('DERIVED');
        expect(tv.temperatureCelsius).toBeGreaterThan(0);
        expect(tv.tileId).toBeDefined();
      }
    }
  });

  it('5. Deterministic tie-breaking: lower score -> earlier start -> stable locationId', () => {
    const tiedCandidates: CandidateLocation[] = [
      { locationId: 'LOC-Z', name: 'Site Z', location: { latitude: 40.712, longitude: -74.008 } },
      { locationId: 'LOC-A', name: 'Site A', location: { latitude: 40.712, longitude: -73.998 } },
    ];

    const obsMap = new Map<string, NormalizedThermalObservation[]>();
    for (const cand of tiedCandidates) {
      obsMap.set(cand.locationId, [
        {
          timestamp: '2026-08-21T08:00:00.000Z',
          location: cand.location,
          selectedTileId: 'tile-tied',
          sourceEndpoint: '/v1/heatmap',
          dataSource: 'FIXTURE',
          metrics: { temperatureCelsius: 30.0 },
          provenance: 'DERIVED',
        },
        {
          timestamp: '2026-08-21T09:00:00.000Z',
          location: cand.location,
          selectedTileId: 'tile-tied',
          sourceEndpoint: '/v1/heatmap',
          dataSource: 'FIXTURE',
          metrics: { temperatureCelsius: 30.0 },
          provenance: 'DERIVED',
        },
        {
          timestamp: '2026-08-21T10:00:00.000Z',
          location: cand.location,
          selectedTileId: 'tile-tied',
          sourceEndpoint: '/v1/heatmap',
          dataSource: 'FIXTURE',
          metrics: { temperatureCelsius: 30.0 },
          provenance: 'DERIVED',
        },
      ]);
    }

    const testConstraints: DecisionConstraints = {
      allowedStart: '2026-08-21T08:00:00.000Z',
      allowedEnd: '2026-08-21T11:00:00.000Z',
      durationHours: 1,
      dataResolutionHours: 1,
    };

    const result = evaluateJointDecision(tiedCandidates, obsMap, testConstraints);

    // 2 candidates × 3 windows (08, 09, 10) = 6 plans, all scored 30.0°C
    expect(result.rankedPlans.length).toBe(6);

    // Earlier start time wins:
    // Rank #1: 08:00 start, LOC-A (alphabetical before LOC-Z)
    expect(result.rankedPlans[0].window.startTime).toBe('2026-08-21T08:00:00.000Z');
    expect(result.rankedPlans[0].location.locationId).toBe('LOC-A');

    // Rank #2: 08:00 start, LOC-Z
    expect(result.rankedPlans[1].window.startTime).toBe('2026-08-21T08:00:00.000Z');
    expect(result.rankedPlans[1].location.locationId).toBe('LOC-Z');

    // Rank #3: 09:00 start, LOC-A
    expect(result.rankedPlans[2].window.startTime).toBe('2026-08-21T09:00:00.000Z');
    expect(result.rankedPlans[2].location.locationId).toBe('LOC-A');
  });

  it('6. Rejects duplicate candidate location IDs with ValidationError', () => {
    const duplicates: CandidateLocation[] = [
      { locationId: 'LOC-DUP', name: 'Site 1', location: { latitude: 40.712, longitude: -74.008 } },
      { locationId: 'LOC-DUP', name: 'Site 2', location: { latitude: 40.712, longitude: -73.998 } },
    ];
    expect(() => evaluateJointDecision(duplicates, new Map(), constraints2h)).toThrow(ValidationError);
  });

  it('7. Throws IncompleteTemporalCoverageError when candidate observations are missing', async () => {
    const obsMap = loadTestObservations();
    // Delete LOC-C from observation map
    obsMap.delete('LOC-C');

    expect(() => evaluateJointDecision(candidateLocations, obsMap, constraints2h)).toThrow(
      IncompleteTemporalCoverageError
    );
  });

  it('8. Throws IncompleteTemporalCoverageError when window exceeds +12h forecast horizon', async () => {
    const obsMap = loadTestObservations();
    const horizonViolationConstraints: DecisionConstraints = {
      allowedStart: '2026-08-21T08:00:00.000Z',
      allowedEnd: '2026-08-21T22:00:00.000Z', // +14h
      durationHours: 2,
      dataResolutionHours: 1,
    };

    expect(() =>
      evaluateJointDecision(candidateLocations, obsMap, horizonViolationConstraints, {
        baseTimestamp: '2026-08-21T08:00:00.000Z',
      })
    ).toThrow(IncompleteTemporalCoverageError);
  });

  it('9. LIVE / FIXTURE Parity — Identical observation arrays yield 100% identical joint rankings', () => {
    const buildObs = (dataSource: 'LIVE' | 'FIXTURE') => {
      const map = new Map<string, NormalizedThermalObservation[]>();
      map.set('LOC-A', [
        {
          timestamp: '2026-08-21T08:00:00.000Z',
          location: candidateLocations[0].location,
          selectedTileId: 'tile-11',
          sourceEndpoint: '/v1/heatmap',
          dataSource,
          metrics: { temperatureCelsius: 28.5 },
          provenance: 'DERIVED',
        },
        {
          timestamp: '2026-08-21T09:00:00.000Z',
          location: candidateLocations[0].location,
          selectedTileId: 'tile-11',
          sourceEndpoint: '/v1/heatmap',
          dataSource,
          metrics: { temperatureCelsius: 29.8 },
          provenance: 'DERIVED',
        },
      ]);
      map.set('LOC-B', [
        {
          timestamp: '2026-08-21T08:00:00.000Z',
          location: candidateLocations[1].location,
          selectedTileId: 'tile-12',
          sourceEndpoint: '/v1/heatmap',
          dataSource,
          metrics: { temperatureCelsius: 29.1 },
          provenance: 'DERIVED',
        },
        {
          timestamp: '2026-08-21T09:00:00.000Z',
          location: candidateLocations[1].location,
          selectedTileId: 'tile-12',
          sourceEndpoint: '/v1/heatmap',
          dataSource,
          metrics: { temperatureCelsius: 30.4 },
          provenance: 'DERIVED',
        },
      ]);
      return map;
    };

    const shortConstraints: DecisionConstraints = {
      allowedStart: '2026-08-21T08:00:00.000Z',
      allowedEnd: '2026-08-21T10:00:00.000Z',
      durationHours: 2,
      dataResolutionHours: 1,
    };

    const cands = [candidateLocations[0], candidateLocations[1]];
    const resFixture = evaluateJointDecision(cands, buildObs('FIXTURE'), shortConstraints);
    const resLive = evaluateJointDecision(cands, buildObs('LIVE'), shortConstraints);

    expect(resFixture.recommendedPlan.exposureScore).toBe(resLive.recommendedPlan.exposureScore);
    expect(resFixture.recommendedPlan.location.locationId).toBe(resLive.recommendedPlan.location.locationId);
    expect(resFixture.rankedPlans[1].deltaVsBest).toBe(resLive.rankedPlans[1].deltaVsBest);
    expect(resFixture.dataSource).toBe('FIXTURE');
    expect(resLive.dataSource).toBe('LIVE');
  });

  it('10. Recalculates dynamically for 4-hour operation (3 locations × 3 windows = 9 plans)', async () => {
    const obsMap = loadTestObservations();
    const constraints4h: DecisionConstraints = {
      allowedStart: '2026-08-21T08:00:00.000Z',
      allowedEnd: '2026-08-21T14:00:00.000Z',
      durationHours: 4,
      dataResolutionHours: 1,
    };

    const result = evaluateJointDecision(candidateLocations, obsMap, constraints4h);

    expect(result.searchSpace.windowCount).toBe(3); // 08-12, 09-13, 10-14
    expect(result.searchSpace.totalEvaluatedPlans).toBe(9);

    // Global optimum for 4h is LOC-A @ 08:00–12:00 = (28.5 + 29.8 + 31.2 + 33.0)/4 = 30.63°C
    expect(result.recommendedPlan.location.locationId).toBe('LOC-A');
    expect(result.recommendedPlan.window.startTime).toBe('2026-08-21T08:00:00.000Z');
    expect(result.recommendedPlan.exposureScore).toBe(30.63);
    expect(result.recommendedPlan.deltaVsBest).toBe(0.00);
  });
});
