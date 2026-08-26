/**
 * Build the DEMO thermal fixture from the REAL captured FortyGuard response.
 *
 * Source of truth (verbatim, never edited):
 *   tests/fixtures/heatmap_probe_candidate_aoi.json         — raw provider response
 *   tests/fixtures/heatmap_probe_candidate_aoi.request.json — the exact request + capture metadata
 *
 * Output:
 *   tests/fixtures/heatmap_captured_demo.json
 *
 * The normalization is DETERMINISTIC and LOSSLESS for provider observations:
 *   - The provider's `data.result.map_data` FeatureCollection is copied VERBATIM
 *     (every cell geometry, tile_id, temperature value — no subdivision, no
 *     re-temperature, no additional cells, no additional hours).
 *   - The single hourly snapshot is anchored at the UTC hour the capture's
 *     request asked for (`date_time.start_date` + `start_time`, filter_type 1).
 *   - Capture metadata (activity id, request body, capture wall-time, feature
 *     count) is preserved so the UI can display honest provenance.
 *
 * This script exists so the fixture's provenance is auditable: anyone can
 * re-run it and get byte-identical output from the raw capture.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rawPath = join(root, 'tests/fixtures/heatmap_probe_candidate_aoi.json');
const reqPath = join(root, 'tests/fixtures/heatmap_probe_candidate_aoi.request.json');
const outPath = join(root, 'tests/fixtures/heatmap_captured_demo.json');

const raw = JSON.parse(readFileSync(rawPath, 'utf8'));
const req = JSON.parse(readFileSync(reqPath, 'utf8'));

const mapData = raw?.data?.result?.map_data;
if (!mapData || mapData.type !== 'FeatureCollection' || !Array.isArray(mapData.features)) {
  throw new Error('Raw capture does not contain a FeatureCollection at data.result.map_data');
}
if (mapData.features.length === 0) {
  throw new Error('Raw capture contains zero cells — refusing to build an empty fixture');
}

const requestBody = req?.requestBody;
const dateTime = requestBody?.date_time;
if (!dateTime?.start_date || !dateTime?.start_time || dateTime.filter_type !== 1) {
  throw new Error('Capture request must be a single-hour filter_type 1 request with start_date + start_time');
}

// Anchor the snapshot at the exact UTC hour the capture requested.
const timestamp = `${dateTime.start_date}T${dateTime.start_time}:00.000Z`;
if (Number.isNaN(Date.parse(timestamp))) {
  throw new Error(`Cannot parse capture request hour: ${timestamp}`);
}

const granularity = requestBody?.granularity;
if (![60, 80, 100].includes(granularity)) {
  throw new Error(`Capture granularity must be 60/80/100 — got ${granularity}`);
}

const fixture = {
  description:
    'DEMO thermal snapshot — REAL captured FortyGuard /v1/heatmap response (Lower Manhattan AOI). ' +
    'Every cell is a verbatim provider observation; no subdivision, no synthetic temperatures, no fabricated hours.',
  source: 'FortyGuard Heatmap Engine (/v1/heatmap — captured response)',
  captureMetadata: {
    activityId: req.activityId,
    capturedAt: req.capturedAt,
    probeFile: 'heatmap_probe_candidate_aoi.json',
    requestFile: 'heatmap_probe_candidate_aoi.request.json',
    requestBody, // verbatim request body sent to the provider
    featureCount: mapData.features.length,
    responseStatsKeys: Object.keys(raw?.data?.result?.stats_data ?? {}),
  },
  granularity,
  hourlySnapshots: [
    {
      timestamp,
      aoi: mapData, // verbatim provider FeatureCollection
    },
  ],
};

writeFileSync(outPath, JSON.stringify(fixture, null, 2) + '\n', 'utf8');
console.log(`Wrote ${outPath}`);
console.log(`  granularity:  ${granularity}m`);
console.log(`  snapshots:    ${fixture.hourlySnapshots.length} (hour: ${timestamp})`);
console.log(`  cell count:   ${mapData.features.length}`);
console.log(`  activityId:   ${req.activityId}`);
console.log(`  capturedAt:   ${req.capturedAt}`);
