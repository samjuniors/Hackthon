import type {
  CandidateLocation,
  NormalizedThermalObservation,
} from '@/types/domain';

/**
 * SYNTHETIC TEST INPUT DATA for the deterministic decision engine.
 *
 * These numbers are TEST FIXTURES ONLY — explicitly authored inputs used to
 * verify the engine's math (window means, rankings, deltas, tie-breaking,
 * what-if costs). They are NOT provider data, NOT the DEMO capture, and MUST
 * NEVER be used by application code. The real DEMO path replays
 * `tests/fixtures/heatmap_captured_demo.json` (a verbatim captured FortyGuard
 * response); engine unit tests use these standalone inputs instead.
 *
 * Curve (6 values per site, hours 08:00–13:00 UTC):
 *   LOC-A tile-11: 28.5, 29.8, 31.2, 33.0, 34.5, 35.2
 *   LOC-B tile-12: 29.1, 30.4, 32.0, 33.7, 35.1, 35.8
 *   LOC-C tile-13: 30.6, 32.1, 33.9, 35.8, 37.2, 37.9
 */

export const ENGINE_TEST_TIMESTAMPS_6H = [
  '2026-08-21T08:00:00.000Z',
  '2026-08-21T09:00:00.000Z',
  '2026-08-21T10:00:00.000Z',
  '2026-08-21T11:00:00.000Z',
  '2026-08-21T12:00:00.000Z',
  '2026-08-21T13:00:00.000Z',
] as const;

const TEST_CURVE: Record<string, { tileId: string; temps: number[] }> = {
  'LOC-A': { tileId: 'tile-11', temps: [28.5, 29.8, 31.2, 33.0, 34.5, 35.2] },
  'LOC-B': { tileId: 'tile-12', temps: [29.1, 30.4, 32.0, 33.7, 35.1, 35.8] },
  'LOC-C': { tileId: 'tile-13', temps: [30.6, 32.1, 33.9, 35.8, 37.2, 37.9] },
};

/**
 * Build a synthetic multi-hour observation map for the three standard test
 * candidates (synchronous — no adapter, no provider path).
 */
export function buildEngineTestObservations(
  candidates: CandidateLocation[],
  timestamps: readonly string[] = ENGINE_TEST_TIMESTAMPS_6H,
): Map<string, NormalizedThermalObservation[]> {
  const obsMap = new Map<string, NormalizedThermalObservation[]>();
  candidates.forEach((cand, candIdx) => {
    const curve = TEST_CURVE[cand.locationId] ?? {
      tileId: `tile-test-${candIdx}`,
      temps: timestamps.map(() => 30 + candIdx),
    };
    const list = timestamps.map((ts, hourIdx) => {
      const temp = curve.temps[hourIdx] ?? curve.temps[curve.temps.length - 1];
      return {
        timestamp: ts,
        location: cand.location,
        selectedTileId: curve.tileId,
        sourceEndpoint: '/v1/heatmap',
        dataSource: 'FIXTURE' as const,
        metrics: {
          temperatureCelsius: temp,
          tileMinTemperatureCelsius: temp,
          tileMaxTemperatureCelsius: temp,
        },
        provenance: 'DERIVED' as const,
      };
    });
    obsMap.set(cand.locationId, list);
  });
  return obsMap;
}
