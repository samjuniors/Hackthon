import { describe, it, expect } from 'vitest';
import { buildHeatmapCacheKey } from '@/lib/fortyguard/adapter';
import { localToUtcIso, buildFortyGuardDateTime } from '@/lib/temporal/server-conversion';

const baseBody = {
  polygon_aoi: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { shape: 'polygon', halfSideMetres: 400 },
        geometry: {
          type: 'Polygon',
          coordinates: [[[-74.01, 40.708], [-74.005, 40.708], [-74.005, 40.716], [-74.01, 40.716], [-74.01, 40.708]]],
        },
      },
    ],
  },
  date_time: { start_date: '2026-08-26', start_time: '12:00', filter_type: 1 },
  granularity: 100,
};

describe('credit-safe heatmap request identity', () => {
  it('is identical for logically identical requests regardless of key order', () => {
    const reordered = {
      granularity: baseBody.granularity,
      date_time: { filter_type: 1, start_time: '12:00', start_date: '2026-08-26' },
      polygon_aoi: baseBody.polygon_aoi,
    };
    expect(buildHeatmapCacheKey('/v1/heatmap', reordered)).toBe(buildHeatmapCacheKey('/v1/heatmap', baseBody));
  });

  it('changes when ANY analytic input changes (AOI / date / time / filter / resolution)', () => {
    const key = buildHeatmapCacheKey('/v1/heatmap', baseBody);
    expect(buildHeatmapCacheKey('/v1/heatmap', { ...baseBody, granularity: 60 })).not.toBe(key);
    expect(
      buildHeatmapCacheKey('/v1/heatmap', {
        ...baseBody,
        date_time: { ...baseBody.date_time, start_time: '13:00' },
      })
    ).not.toBe(key);
    expect(
      buildHeatmapCacheKey('/v1/heatmap', {
        ...baseBody,
        date_time: { ...baseBody.date_time, filter_type: 2, end_time: '15:00' },
      })
    ).not.toBe(key);
    const movedAoi = JSON.parse(JSON.stringify(baseBody));
    movedAoi.polygon_aoi.features[0].geometry.coordinates[0][0][0] = -74.02;
    expect(buildHeatmapCacheKey('/v1/heatmap', movedAoi)).not.toBe(key);
    // Different endpoints never collide
    expect(buildHeatmapCacheKey('/v1/other', baseBody)).not.toBe(key);
  });
});

describe('adapter-boundary temporal conversion (never the AI)', () => {
  it('converts Los Angeles local wall-clock to the correct UTC instant', () => {
    // PDT = UTC-7 in August
    expect(localToUtcIso('2026-08-26', '05:00', 'America/Los_Angeles')).toBe('2026-08-26T12:00:00.000Z');
  });

  it('converts New York and Tokyo wall-clocks correctly across offsets', () => {
    // EDT = UTC-4 in August
    expect(localToUtcIso('2026-08-26', '04:00', 'America/New_York')).toBe('2026-08-26T08:00:00.000Z');
    // JST = UTC+9 (no DST)
    expect(localToUtcIso('2026-08-26', '13:00', 'Asia/Tokyo')).toBe('2026-08-26T04:00:00.000Z');
  });

  it('builds the verified FortyGuard date_time blocks per filter_type', () => {
    expect(
      buildFortyGuardDateTime({ date: '2026-08-26', startTime: '05:00', endTime: '08:00', timeMode: 'range-of-hours' })
    ).toEqual({ start_date: '2026-08-26', start_time: '05:00', end_time: '08:00', filter_type: 2 });
    expect(
      buildFortyGuardDateTime({ date: '2026-08-26', startTime: '13:00', endTime: '14:00', timeMode: 'single-hour' })
    ).toEqual({ start_date: '2026-08-26', start_time: '13:00', filter_type: 1 });
    expect(
      buildFortyGuardDateTime({ date: '2026-08-26', startTime: '06:00', endTime: '20:00', timeMode: 'single-day' })
    ).toEqual({ start_date: '2026-08-26', end_date: '2026-08-26', filter_type: 3 });
  });
});
