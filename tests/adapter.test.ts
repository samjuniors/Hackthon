import { describe, it, expect, beforeEach } from 'vitest';
import { FortyGuardAdapter } from '@/lib/fortyguard/adapter';
import type { PolygonAOI } from '@/types/domain';
import { OutsideCoverageError, AuthenticationError, IncompleteTemporalCoverageError } from '@/types/errors';

describe('FortyGuard Adapter Unit Tests', () => {
  let adapter: FortyGuardAdapter;

  beforeEach(() => {
    process.env.FORTYGUARD_API_KEY = 'test-key-12345';
    adapter = new FortyGuardAdapter({ mode: 'FIXTURE' });
  });

  const sampleAOI: PolygonAOI = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          tile_id: 'tile-alpha',
          average_temperature: 32.4,
          min_temperature: 30.1,
          max_temperature: 35.0,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-74.01, 40.70],
              [-74.00, 40.70],
              [-74.00, 40.71],
              [-74.01, 40.71],
              [-74.01, 40.70],
            ],
          ],
        },
      },
    ],
  };

  it('normalizes spatial tile to point observation via exact point-in-polygon mapping', () => {
    const point = { latitude: 40.705, longitude: -74.005 };
    const timestamp = '2026-08-20T14:00:00.000Z';

    const obs = adapter.normalizePointObservation(sampleAOI, point, timestamp);

    expect(obs.timestamp).toBe(timestamp);
    expect(obs.selectedTileId).toBe('tile-alpha');
    expect(obs.dataSource).toBe('FIXTURE');
    expect(obs.metrics.temperatureCelsius).toBe(32.4);
    expect(obs.metrics.tileMinTemperatureCelsius).toBe(30.1);
    expect(obs.metrics.tileMaxTemperatureCelsius).toBe(35.0);
    expect(obs.provenance).toBe('DERIVED');
  });

  it('throws OutsideCoverageError if point lies outside tile boundary', () => {
    const outsidePoint = { latitude: 40.80, longitude: -74.005 };
    const timestamp = '2026-08-20T14:00:00.000Z';

    expect(() =>
      adapter.normalizePointObservation(sampleAOI, outsidePoint, timestamp)
    ).toThrow(OutsideCoverageError);
  });

  it('throws AuthenticationError in LIVE mode when API key is missing', async () => {
    const liveAdapter = new FortyGuardAdapter({ mode: 'LIVE', apiKey: '' });
    await expect(
      liveAdapter.getHeatmap({
        polygon_aoi: sampleAOI,
        date_time: { start_date: '2026-08-21', start_time: '10:00', filter_type: 1 },
        granularity: 60,
      })
    ).rejects.toThrow(AuthenticationError);
  });

  it('fetches discrete hourly snapshots in FIXTURE mode without inventing data', async () => {
    const fixtureAdapter = new FortyGuardAdapter({ mode: 'FIXTURE' });
    const snapshots = await fixtureAdapter.getHourlyHeatmapSnapshots(
      { latitude: 40.7128, longitude: -74.006 },
      ['2026-08-21T08:00:00.000Z', '2026-08-21T09:00:00.000Z']
    );

    expect(snapshots.size).toBe(2);
    expect(snapshots.has('2026-08-21T08:00:00.000Z')).toBe(true);
    expect(snapshots.has('2026-08-21T09:00:00.000Z')).toBe(true);
  });

  it('throws IncompleteTemporalCoverageError when requested timestamp is missing from fixture', async () => {
    const fixtureAdapter = new FortyGuardAdapter({ mode: 'FIXTURE' });
    await expect(
      fixtureAdapter.getHourlyHeatmapSnapshots(
        { latitude: 40.7128, longitude: -74.006 },
        ['2029-01-01T00:00:00.000Z']
      )
    ).rejects.toThrow(IncompleteTemporalCoverageError);
  });
});

