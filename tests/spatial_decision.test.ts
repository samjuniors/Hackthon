import { describe, it, expect } from 'vitest';
import { FortyGuardAdapter } from '@/lib/fortyguard/adapter';
import { evaluateCandidateLocations } from '@/lib/decision-engine/evaluator';
import type {
  CandidateLocation,
  CandidateWindow,
  NormalizedThermalObservation,
} from '@/types/domain';
import {
  ValidationError,
  IncompleteTemporalCoverageError,
} from '@/types/errors';

describe('Milestone 5 — Spatial Multi-Location Decision Engine Suite', () => {
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

  const window2h: CandidateWindow = {
    windowId: 'w-001',
    startTime: '2026-08-21T08:00:00.000Z',
    endTime: '2026-08-21T10:00:00.000Z',
    durationHours: 2,
  };

  it('1. Evaluates 3 candidate locations, produces deterministic ranking, and identifies winning location', async () => {
    const adapter = new FortyGuardAdapter({ mode: 'FIXTURE' });
    const timestamps = ['2026-08-21T08:00:00.000Z', '2026-08-21T09:00:00.000Z'];
    const snapshots = await adapter.getHourlyHeatmapSnapshots(candidateLocations[0].location, timestamps);

    const obsMap = new Map<string, NormalizedThermalObservation[]>();
    for (const cand of candidateLocations) {
      const list = timestamps.map((ts) => {
        const aoi = snapshots.get(ts);
        if (!aoi) throw new Error('Missing snapshot');
        return adapter.normalizePointObservation(aoi, cand.location, ts, '/v1/heatmap', 'DERIVED');
      });
      obsMap.set(cand.locationId, list);
    }

    const result = evaluateCandidateLocations(candidateLocations, obsMap, window2h);

    expect(result.decisionType).toBe('SPATIAL_LOCATION_CHOICE');
    expect(result.rankedLocations.length).toBe(3);

    // Winner must be LOC-A
    expect(result.recommendedLocation.locationId).toBe('LOC-A');
    expect(result.recommendedLocation.rank).toBe(1);
    expect(result.recommendedLocation.exposureScore).toBe(29.15);
    expect(result.recommendedLocation.deltaVsBest).toBe(0.00);

    // Rank #2 must be LOC-B
    expect(result.rankedLocations[1].locationId).toBe('LOC-B');
    expect(result.rankedLocations[1].rank).toBe(2);
    expect(result.rankedLocations[1].exposureScore).toBe(29.75);
    expect(result.rankedLocations[1].deltaVsBest).toBe(0.60);

    // Rank #3 must be LOC-C
    expect(result.rankedLocations[2].locationId).toBe('LOC-C');
    expect(result.rankedLocations[2].rank).toBe(3);
    expect(result.rankedLocations[2].exposureScore).toBe(31.35);
    expect(result.rankedLocations[2].deltaVsBest).toBe(2.20);
  });

  it('2. Preserves DERIVED provenance on thermalValues in RankedLocationResult', async () => {
    const adapter = new FortyGuardAdapter({ mode: 'FIXTURE' });
    const timestamps = ['2026-08-21T08:00:00.000Z', '2026-08-21T09:00:00.000Z'];
    const snapshots = await adapter.getHourlyHeatmapSnapshots(candidateLocations[0].location, timestamps);

    const obsMap = new Map<string, NormalizedThermalObservation[]>();
    for (const cand of candidateLocations) {
      const list = timestamps.map((ts) => {
        const aoi = snapshots.get(ts);
        if (!aoi) throw new Error('Missing snapshot');
        return adapter.normalizePointObservation(aoi, cand.location, ts, '/v1/heatmap', 'DERIVED');
      });
      obsMap.set(cand.locationId, list);
    }

    const result = evaluateCandidateLocations(candidateLocations, obsMap, window2h);

    for (const ranked of result.rankedLocations) {
      expect(ranked.thermalValues.length).toBe(2);
      for (const tv of ranked.thermalValues) {
        expect(tv.provenance).toBe('DERIVED');
        expect(tv.temperatureCelsius).toBeGreaterThan(0);
        expect(tv.tileId).toBeDefined();
        expect(tv.evidenceReference).toBe('/v1/heatmap');
      }
    }
  });

  it('3. Deterministic tie-breaking on identical exposure scores uses stable locationId ordering', () => {
    const tiedCandidates: CandidateLocation[] = [
      { locationId: 'LOC-Z', name: 'Site Z', location: { latitude: 40.7120, longitude: -74.0080 } },
      { locationId: 'LOC-A', name: 'Site A', location: { latitude: 40.7120, longitude: -73.9980 } },
      { locationId: 'LOC-M', name: 'Site M', location: { latitude: 40.7120, longitude: -73.9880 } },
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
      ]);
    }

    const window1h: CandidateWindow = {
      windowId: 'w-test',
      startTime: '2026-08-21T08:00:00.000Z',
      endTime: '2026-08-21T09:00:00.000Z',
      durationHours: 1,
    };

    const result = evaluateCandidateLocations(tiedCandidates, obsMap, window1h);

    // All scores are 30.0°C; tie-break must sort LOC-A (#1), LOC-M (#2), LOC-Z (#3)
    expect(result.rankedLocations[0].locationId).toBe('LOC-A');
    expect(result.rankedLocations[1].locationId).toBe('LOC-M');
    expect(result.rankedLocations[2].locationId).toBe('LOC-Z');
  });

  it('4. Rejects duplicate candidate location IDs with ValidationError', () => {
    const duplicates: CandidateLocation[] = [
      { locationId: 'LOC-DUP', name: 'Site 1', location: { latitude: 40.712, longitude: -74.008 } },
      { locationId: 'LOC-DUP', name: 'Site 2', location: { latitude: 40.712, longitude: -73.998 } },
    ];

    const obsMap = new Map<string, NormalizedThermalObservation[]>();
    obsMap.set('LOC-DUP', []);

    expect(() => evaluateCandidateLocations(duplicates, obsMap, window2h)).toThrow(ValidationError);
  });

  it('5. Rejects empty candidate list with ValidationError', () => {
    expect(() => evaluateCandidateLocations([], new Map(), window2h)).toThrow(ValidationError);
  });

  it('6. Throws IncompleteTemporalCoverageError if candidate observations are missing', () => {
    const obsMap = new Map<string, NormalizedThermalObservation[]>();
    obsMap.set('LOC-A', [
      {
        timestamp: '2026-08-21T08:00:00.000Z',
        location: candidateLocations[0].location,
        selectedTileId: 'tile-11',
        sourceEndpoint: '/v1/heatmap',
        dataSource: 'FIXTURE',
        metrics: { temperatureCelsius: 28.5 },
        provenance: 'DERIVED',
      },
    ]);
    // LOC-B has missing observations in map

    expect(() => evaluateCandidateLocations(candidateLocations, obsMap, window2h)).toThrow(
      IncompleteTemporalCoverageError
    );
  });

  it('7. LIVE / FIXTURE Parity — Equivalent observation inputs yield 100% identical rankings and scores', () => {
    const createObs = (dataSource: 'LIVE' | 'FIXTURE') => {
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

    const cands = [candidateLocations[0], candidateLocations[1]];
    const resFixture = evaluateCandidateLocations(cands, createObs('FIXTURE'), window2h);
    const resLive = evaluateCandidateLocations(cands, createObs('LIVE'), window2h);

    expect(resFixture.recommendedLocation.exposureScore).toBe(resLive.recommendedLocation.exposureScore);
    expect(resFixture.recommendedLocation.locationId).toBe(resLive.recommendedLocation.locationId);
    expect(resFixture.rankedLocations[1].deltaVsBest).toBe(resLive.rankedLocations[1].deltaVsBest);

    expect(resFixture.dataSource).toBe('FIXTURE');
    expect(resLive.dataSource).toBe('LIVE');
  });

  it('8. Changing duration recalculates scores deterministically across 4-hour operation', async () => {
    const adapter = new FortyGuardAdapter({ mode: 'FIXTURE' });
    const timestamps4h = [
      '2026-08-21T08:00:00.000Z',
      '2026-08-21T09:00:00.000Z',
      '2026-08-21T10:00:00.000Z',
      '2026-08-21T11:00:00.000Z',
    ];
    const snapshots = await adapter.getHourlyHeatmapSnapshots(candidateLocations[0].location, timestamps4h);

    const obsMap = new Map<string, NormalizedThermalObservation[]>();
    for (const cand of candidateLocations) {
      const list = timestamps4h.map((ts) => {
        const aoi = snapshots.get(ts);
        if (!aoi) throw new Error('Missing snapshot');
        return adapter.normalizePointObservation(aoi, cand.location, ts, '/v1/heatmap', 'DERIVED');
      });
      obsMap.set(cand.locationId, list);
    }

    const window4h: CandidateWindow = {
      windowId: 'w-001',
      startTime: '2026-08-21T08:00:00.000Z',
      endTime: '2026-08-21T12:00:00.000Z',
      durationHours: 4,
    };

    const result = evaluateCandidateLocations(candidateLocations, obsMap, window4h);

    // 4h means:
    // LOC-A: (28.5 + 29.8 + 31.2 + 33.0) / 4 = 30.625 -> 30.63
    // LOC-B: (29.1 + 30.4 + 32.0 + 33.7) / 4 = 31.300 -> 31.30
    // LOC-C: (30.6 + 32.1 + 33.9 + 35.8) / 4 = 33.100 -> 33.10
    expect(result.rankedLocations[0].exposureScore).toBe(30.63);
    expect(result.rankedLocations[1].exposureScore).toBe(31.3);
    expect(result.rankedLocations[2].exposureScore).toBe(33.1);

    expect(result.rankedLocations[0].deltaVsBest).toBe(0);
    expect(result.rankedLocations[1].deltaVsBest).toBe(0.67); // 31.30 - 30.63 = 0.67
    expect(result.rankedLocations[2].deltaVsBest).toBe(2.47); // 33.10 - 30.63 = 2.47
  });
});

