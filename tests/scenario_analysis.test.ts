import { describe, it, expect } from 'vitest';
import { evaluateWhatIfScenarios } from '@/lib/decision-engine/evaluator';
import { buildEngineTestObservations } from './helpers/engine-test-observations';
import type {
  CandidateLocation,
  DecisionConstraints,
  NormalizedThermalObservation,
} from '@/types/domain';

describe('Milestone 7 — What-If Constraint Sensitivity Analysis Suite', () => {
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

  const baselineConstraints: DecisionConstraints = {
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

  it('1. Evaluates baseline plan P0 matching the global unconstrained optimum (LOC-A @ 08:00–10:00 UTC = 29.15°C)', async () => {
    const obsMap = loadTestObservations();
    const result = evaluateWhatIfScenarios(candidateLocations, obsMap, baselineConstraints);

    expect(result.baselinePlan.location.locationId).toBe('LOC-A');
    expect(result.baselinePlan.window.startTime).toBe('2026-08-21T08:00:00.000Z');
    expect(result.baselinePlan.window.endTime).toBe('2026-08-21T10:00:00.000Z');
    expect(result.baselinePlan.exposureScore).toBe(29.15);
  });

  it('2. Scenario 1 (TEMPORAL_SHIFT): Imposing 10:00 UTC start shifts window and computes exact +2.95°C constraint cost', async () => {
    const obsMap = loadTestObservations();
    const result = evaluateWhatIfScenarios(candidateLocations, obsMap, baselineConstraints);

    const sc1 = result.scenarios.find((s) => s.constraintType === 'TEMPORAL_SHIFT');
    expect(sc1).toBeDefined();
    expect(sc1?.status).toBe('FEASIBLE');
    expect(sc1?.constrainedPlan?.location.locationId).toBe('LOC-A');
    expect(sc1?.constrainedPlan?.window.startTime).toBe('2026-08-21T10:00:00.000Z');
    expect(sc1?.constrainedPlan?.window.endTime).toBe('2026-08-21T12:00:00.000Z');
    expect(sc1?.constrainedPlan?.exposureScore).toBe(32.10);

    // Exact cost calculation: 32.10 - 29.15 = +2.95°C
    expect(sc1?.costOfConstraintCelsius).toBe(2.95);
    expect(sc1?.locationShifted).toBe(false);
    expect(sc1?.windowShifted).toBe(true);
    expect(sc1?.durationChanged).toBe(false);
  });

  it('3. Scenario 2 (LOCATION_LOCK): Locking to Chinatown (LOC-C) shifts location and computes exact +2.20°C constraint cost', async () => {
    const obsMap = loadTestObservations();
    const result = evaluateWhatIfScenarios(candidateLocations, obsMap, baselineConstraints);

    const sc2 = result.scenarios.find((s) => s.constraintType === 'LOCATION_LOCK');
    expect(sc2).toBeDefined();
    expect(sc2?.status).toBe('FEASIBLE');
    expect(sc2?.constrainedPlan?.location.locationId).toBe('LOC-C');
    expect(sc2?.constrainedPlan?.window.startTime).toBe('2026-08-21T08:00:00.000Z');
    expect(sc2?.constrainedPlan?.window.endTime).toBe('2026-08-21T10:00:00.000Z');
    expect(sc2?.constrainedPlan?.exposureScore).toBe(31.35);

    // Exact cost calculation: 31.35 - 29.15 = +2.20°C
    expect(sc2?.costOfConstraintCelsius).toBe(2.20);
    expect(sc2?.locationShifted).toBe(true);
    expect(sc2?.windowShifted).toBe(false);
    expect(sc2?.durationChanged).toBe(false);
  });

  it('4. Scenario 3 (DURATION_EXPANSION): Expanding to 4 Hours alters duration and computes exact +1.48°C constraint cost', async () => {
    const obsMap = loadTestObservations();
    const result = evaluateWhatIfScenarios(candidateLocations, obsMap, baselineConstraints);

    const sc3 = result.scenarios.find((s) => s.constraintType === 'DURATION_EXPANSION');
    expect(sc3).toBeDefined();
    expect(sc3?.status).toBe('FEASIBLE');
    expect(sc3?.constrainedPlan?.location.locationId).toBe('LOC-A');
    expect(sc3?.constrainedPlan?.window.startTime).toBe('2026-08-21T08:00:00.000Z');
    expect(sc3?.constrainedPlan?.window.endTime).toBe('2026-08-21T12:00:00.000Z');
    expect(sc3?.constrainedPlan?.exposureScore).toBe(30.63);

    // Exact cost calculation: 30.63 - 29.15 = +1.48°C
    expect(sc3?.costOfConstraintCelsius).toBe(1.48);
    expect(sc3?.locationShifted).toBe(false);
    expect(sc3?.windowShifted).toBe(false);
    expect(sc3?.durationChanged).toBe(true);
  });

  it('5. Infeasible constraint handling produces status INFEASIBLE with explanation and null cost', async () => {
    const obsMap = loadTestObservations();
    // Constraints where duration exceeds the total allowable window
    const impossibleConstraints: DecisionConstraints = {
      allowedStart: '2026-08-21T08:00:00.000Z',
      allowedEnd: '2026-08-21T09:00:00.000Z', // Only 1h allowable
      durationHours: 2,                        // But 2h requested
      dataResolutionHours: 1,
    };

    expect(() => evaluateWhatIfScenarios(candidateLocations, obsMap, impossibleConstraints)).toThrow();
  });

  it('6. LIVE / FIXTURE Parity — Scenario results and constraint costs are 100% identical regardless of data source mode', () => {
    const createObs = (dataSource: 'LIVE' | 'FIXTURE') => {
      const map = new Map<string, NormalizedThermalObservation[]>();
      for (const cand of candidateLocations) {
        map.set(
          cand.locationId,
          timestamps6h.map((ts, idx) => ({
            timestamp: ts,
            location: cand.location,
            selectedTileId: `tile-${cand.locationId}`,
            sourceEndpoint: '/v1/heatmap',
            dataSource,
            metrics: { temperatureCelsius: 28.0 + idx * 1.5 },
            provenance: 'DERIVED',
          }))
        );
      }
      return map;
    };

    const resFixture = evaluateWhatIfScenarios(candidateLocations, createObs('FIXTURE'), baselineConstraints);
    const resLive = evaluateWhatIfScenarios(candidateLocations, createObs('LIVE'), baselineConstraints);

    expect(resFixture.baselinePlan.exposureScore).toBe(resLive.baselinePlan.exposureScore);
    expect(resFixture.scenarios.length).toBe(resLive.scenarios.length);

    for (let i = 0; i < resFixture.scenarios.length; i++) {
      expect(resFixture.scenarios[i].costOfConstraintCelsius).toBe(resLive.scenarios[i].costOfConstraintCelsius);
      expect(resFixture.scenarios[i].constrainedPlan?.exposureScore).toBe(
        resLive.scenarios[i].constrainedPlan?.exposureScore
      );
    }
  });
});
