import { describe, it, expect } from 'vitest';
import { FortyGuardAdapter } from '@/lib/fortyguard/adapter';
import { evaluateCandidateWindows } from '@/lib/decision-engine/evaluator';
import type { LocationPoint, DecisionConstraints, NormalizedThermalObservation, PolygonAOI } from '@/types/domain';
import {
  IncompleteTemporalCoverageError,
  AuthenticationError,
} from '@/types/errors';

describe('M4.1 Evidence Integrity & Parity Test Suite', () => {
  const nycCenter: LocationPoint = { latitude: 40.7128, longitude: -74.006 };
  const baseTime = '2026-08-21T08:00:00.000Z';

  it('1. No fabricated hourly observations are generated — values match genuine fixture/API data without mathematical curve mutations', async () => {
    const adapter = new FortyGuardAdapter({ mode: 'FIXTURE' });
    const snapshots = await adapter.getHourlyHeatmapSnapshots(nycCenter, [
      '2026-08-21T08:00:00.000Z',
      '2026-08-21T09:00:00.000Z',
      '2026-08-21T10:00:00.000Z',
    ]);

    const aoi8 = snapshots.get('2026-08-21T08:00:00.000Z');
    const aoi9 = snapshots.get('2026-08-21T09:00:00.000Z');
    const aoi10 = snapshots.get('2026-08-21T10:00:00.000Z');

    expect(aoi8).toBeDefined();
    expect(aoi9).toBeDefined();
    expect(aoi10).toBeDefined();

    if (!aoi8 || !aoi9 || !aoi10) throw new Error('Snapshots missing');

    const obs8 = adapter.normalizePointObservation(aoi8, nycCenter, '2026-08-21T08:00:00.000Z');
    const obs9 = adapter.normalizePointObservation(aoi9, nycCenter, '2026-08-21T09:00:00.000Z');
    const obs10 = adapter.normalizePointObservation(aoi10, nycCenter, '2026-08-21T10:00:00.000Z');

    // Values in fixture: 28.5, 29.8, 31.2
    expect(obs8.metrics.temperatureCelsius).toBe(28.5);
    expect(obs9.metrics.temperatureCelsius).toBe(29.8);
    expect(obs10.metrics.temperatureCelsius).toBe(31.2);
  });

  it('2. Missing hourly coverage produces IncompleteTemporalCoverageError (no fabricated missing hours)', async () => {
    const adapter = new FortyGuardAdapter({ mode: 'FIXTURE' });
    // Request a timestamp outside fixture coverage
    await expect(
      adapter.getHourlyHeatmapSnapshots(nycCenter, [
        '2026-08-21T08:00:00.000Z',
        '2026-08-22T04:00:00.000Z', // Missing
      ])
    ).rejects.toThrow(IncompleteTemporalCoverageError);
  });

  it('3. Live API failure does not silently produce synthetic data — throws explicit typed error', async () => {
    const liveAdapter = new FortyGuardAdapter({
      mode: 'LIVE',
      apiKey: '', // Missing key
      baseUrl: 'https://api.fortyguard.com',
    });

    await expect(
      liveAdapter.getHeatmap({
        polygon_aoi: {
          type: 'FeatureCollection',
          features: [],
        },
        date_time: { start_date: '2026-08-21', start_time: '08:00', filter_type: 1 },
        granularity: 60,
      })
    ).rejects.toThrow(AuthenticationError);
  });

  it('4. Fixture mode is explicitly identified on observations and DecisionResult', async () => {
    const adapter = new FortyGuardAdapter({ mode: 'FIXTURE' });
    const snapshots = await adapter.getHourlyHeatmapSnapshots(nycCenter, [
      '2026-08-21T08:00:00.000Z',
      '2026-08-21T09:00:00.000Z',
    ]);

    const aoi8 = snapshots.get('2026-08-21T08:00:00.000Z');
    const aoi9 = snapshots.get('2026-08-21T09:00:00.000Z');
    if (!aoi8 || !aoi9) throw new Error('Snapshots missing');

    const obs: NormalizedThermalObservation[] = [
      adapter.normalizePointObservation(aoi8, nycCenter, '2026-08-21T08:00:00.000Z', '/v1/heatmap', 'DERIVED'),
      adapter.normalizePointObservation(aoi9, nycCenter, '2026-08-21T09:00:00.000Z', '/v1/heatmap', 'PREDICTED'),
    ];

    expect(obs[0].dataSource).toBe('FIXTURE');
    expect(obs[1].dataSource).toBe('FIXTURE');

    const constraints: DecisionConstraints = {
      allowedStart: '2026-08-21T08:00:00.000Z',
      allowedEnd: '2026-08-21T10:00:00.000Z',
      durationHours: 1,
      dataResolutionHours: 1,
    };

    const decision = evaluateCandidateWindows(nycCenter, obs, constraints, baseTime);

    expect(decision.dataSource).toBe('FIXTURE');
    expect(decision.evidenceBundle.dataSource).toBe('FIXTURE');
  });

  it('5. LIVE / FIXTURE Decision Parity — equivalent observations produce 100% identical decision results', () => {
    const obsFixture: NormalizedThermalObservation[] = [
      {
        timestamp: '2026-08-21T08:00:00.000Z',
        location: nycCenter,
        selectedTileId: 'tile-11',
        sourceEndpoint: '/v1/heatmap',
        dataSource: 'FIXTURE',
        metrics: { temperatureCelsius: 28.5, tileMinTemperatureCelsius: 26.8, tileMaxTemperatureCelsius: 30.2 },
        provenance: 'DERIVED',
      },
      {
        timestamp: '2026-08-21T09:00:00.000Z',
        location: nycCenter,
        selectedTileId: 'tile-11',
        sourceEndpoint: '/v1/heatmap',
        dataSource: 'FIXTURE',
        metrics: { temperatureCelsius: 29.8, tileMinTemperatureCelsius: 28.0, tileMaxTemperatureCelsius: 31.5 },
        provenance: 'PREDICTED',
      },
    ];

    const obsLive: NormalizedThermalObservation[] = [
      {
        timestamp: '2026-08-21T08:00:00.000Z',
        location: nycCenter,
        selectedTileId: 'tile-11',
        sourceEndpoint: '/v1/heatmap',
        dataSource: 'LIVE',
        metrics: { temperatureCelsius: 28.5, tileMinTemperatureCelsius: 26.8, tileMaxTemperatureCelsius: 30.2 },
        provenance: 'DERIVED',
      },
      {
        timestamp: '2026-08-21T09:00:00.000Z',
        location: nycCenter,
        selectedTileId: 'tile-11',
        sourceEndpoint: '/v1/heatmap',
        dataSource: 'LIVE',
        metrics: { temperatureCelsius: 29.8, tileMinTemperatureCelsius: 28.0, tileMaxTemperatureCelsius: 31.5 },
        provenance: 'PREDICTED',
      },
    ];

    const constraints: DecisionConstraints = {
      allowedStart: '2026-08-21T08:00:00.000Z',
      allowedEnd: '2026-08-21T10:00:00.000Z',
      durationHours: 1,
      dataResolutionHours: 1,
    };

    const decisionFixture = evaluateCandidateWindows(nycCenter, obsFixture, constraints, baseTime);
    const decisionLive = evaluateCandidateWindows(nycCenter, obsLive, constraints, baseTime);

    // Parity verification: recommendations and scores must be identical
    expect(decisionFixture.recommendedWindow.exposureScore).toBe(decisionLive.recommendedWindow.exposureScore);
    expect(decisionFixture.recommendedWindow.startTime).toBe(decisionLive.recommendedWindow.startTime);
    expect(decisionFixture.recommendedWindow.endTime).toBe(decisionLive.recommendedWindow.endTime);
    expect(decisionFixture.rankedWindows.length).toBe(decisionLive.rankedWindows.length);
    expect(decisionFixture.rankedWindows[0].exposureScore).toBe(decisionLive.rankedWindows[0].exposureScore);

    // Data sources must reflect their true mode
    expect(decisionFixture.dataSource).toBe('FIXTURE');
    expect(decisionLive.dataSource).toBe('LIVE');
  });

  it('6. Provenance tagging is strictly enforced', () => {
    const adapter = new FortyGuardAdapter({ mode: 'FIXTURE' });
    const sampleTileAoi: PolygonAOI = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { tile_id: 'tile-1', average_temperature: 30.0, min_temperature: 28.0, max_temperature: 32.0 },
          geometry: {
            type: 'Polygon',
            coordinates: [[[-74.01, 40.71], [-74.00, 40.71], [-74.00, 40.72], [-74.01, 40.72], [-74.01, 40.71]]],
          },
        },
      ],
    };

    const obsDerived = adapter.normalizePointObservation(
      sampleTileAoi,
      { latitude: 40.715, longitude: -74.005 },
      '2026-08-21T08:00:00.000Z',
      '/v1/heatmap',
      'DERIVED'
    );
    expect(obsDerived.provenance).toBe('DERIVED');

    const obsPredicted = adapter.normalizePointObservation(
      sampleTileAoi,
      { latitude: 40.715, longitude: -74.005 },
      '2026-08-21T12:00:00.000Z',
      '/v1/heatmap',
      'PREDICTED'
    );
    expect(obsPredicted.provenance).toBe('PREDICTED');
  });

  it('7. +12h boundary remains strictly enforced on candidate evaluation', () => {
    const obs: NormalizedThermalObservation[] = [
      {
        timestamp: '2026-08-21T21:00:00.000Z',
        location: nycCenter,
        selectedTileId: 'tile-11',
        sourceEndpoint: '/v1/heatmap',
        dataSource: 'FIXTURE',
        metrics: { temperatureCelsius: 28.0 },
        provenance: 'DERIVED',
      },
    ];

    const constraintsExceeding12h: DecisionConstraints = {
      allowedStart: '2026-08-21T21:00:00.000Z',
      allowedEnd: '2026-08-22T02:00:00.000Z', // 18h lead time (> 12h)
      durationHours: 2,
      dataResolutionHours: 1,
    };

    expect(() =>
      evaluateCandidateWindows(nycCenter, obs, constraintsExceeding12h, baseTime)
    ).toThrow(IncompleteTemporalCoverageError);
  });

  it('8. Fixture date ownership is decoupled — adapter provides default bounds without route hardcoding', () => {
    const fixtureAdapter = new FortyGuardAdapter({ mode: 'FIXTURE' });
    const fixtureWindow = fixtureAdapter.getDefaultOperatingWindow(4);
    expect(fixtureWindow.allowedStart).toBeDefined();
    expect(fixtureWindow.allowedEnd).toBeDefined();
    expect(new Date(fixtureWindow.allowedEnd).getTime() - new Date(fixtureWindow.allowedStart).getTime()).toBe(4 * 3600 * 1000);

    const liveAdapter = new FortyGuardAdapter({ mode: 'LIVE', apiKey: 'mock-key' });
    const liveWindow = liveAdapter.getDefaultOperatingWindow(4);
    expect(liveWindow.allowedStart).toBeDefined();
    expect(liveWindow.allowedEnd).toBeDefined();
    expect(new Date(liveWindow.allowedEnd).getTime() - new Date(liveWindow.allowedStart).getTime()).toBe(4 * 3600 * 1000);
  });
});

