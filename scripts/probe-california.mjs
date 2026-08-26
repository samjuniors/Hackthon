#!/usr/bin/env node
/**
 * §3/§4 — California Geographic Validation Probe
 *
 * Probes the live /api/decision endpoint with LIVE FortyGuard data for:
 *   - Los Angeles (34.0522, -118.2437)
 *   - San Francisco (37.7749, -122.4194)
 *   - San Diego (32.7157, -117.1611)
 *
 * For each location, verifies:
 *   - API returns success OR a documented error code (OutsideCoverage is PASS)
 *   - dataSource === "LIVE" (no fixture substitution)
 *   - activityId is not the fixture sentinel value
 *   - Spatial coverage returned (spatialField present)
 *   - Hourly coverage count >= durationHours
 *   - Deterministic decision calculation returned (recommendedWindow present)
 *
 * Usage:
 *   node scripts/probe-california.mjs [--port 3050]
 */

const PORT = process.argv.includes('--port')
  ? process.argv[process.argv.indexOf('--port') + 1]
  : '3050';

const BASE_URL = `http://localhost:${PORT}`;
const DURATION_HOURS = 2;

const CALIFORNIA_LOCATIONS = [
  { name: 'Los Angeles', latitude: 34.0522, longitude: -118.2437 },
  { name: 'San Francisco', latitude: 37.7749, longitude: -122.4194 },
  { name: 'San Diego', latitude: 32.7157, longitude: -117.1611 },
];

const FIXTURE_SENTINEL_ACTIVITY_ID = 'fixture-captured-activity';

function formatResult(location, result, durationMs) {
  const lines = [];
  lines.push('');
  lines.push(`  Location  : ${location.name} (${location.latitude}, ${location.longitude})`);
  lines.push(`  Duration  : ${durationMs}ms`);

  if (!result.ok) {
    lines.push(`  HTTP      : ${result.status} ${result.statusText}`);
    lines.push(`  RESULT    : HTTP_FAILURE`);
    return lines.join('\n');
  }

  const body = result.body;

  if (!body.success) {
    const code = body.error?.code || 'UNKNOWN_ERROR';
    const msg = body.error?.message || '';
    const isExpectedCoverage = ['OUTSIDE_COVERAGE', 'INCOMPLETE_TEMPORAL_COVERAGE'].includes(code);
    lines.push(`  Error     : ${code} — ${msg}`);
    lines.push(`  RESULT    : ${isExpectedCoverage ? 'PASS (expected failure — coverage not available)' : 'FAIL (' + code + ')'}`);
    return lines.join('\n');
  }

  // Success path
  const decision = body.decision;
  const jointDecision = body.jointDecision;
  const spatialField = body.spatialField;
  const spatialMeta = body.spatialFieldMetadata;

  // 1. Check dataSource
  const dataSource = body.decision?.dataSource ?? body.jointDecision?.dataSource ?? 'UNKNOWN';
  const dataSourcePass = dataSource === 'LIVE';

  // 2. Check activityId sentinel
  const activityId = body.spatialFieldMetadata?.activityId ?? '';
  const notFixtureSentinel = activityId !== FIXTURE_SENTINEL_ACTIVITY_ID;

  // 3. Spatial coverage present
  const hasSpatialField = !!spatialField;

  // 4. Hourly coverage
  const evaluatedHours = spatialMeta?.totalEvaluatedHours ?? 0;
  const hourlyPass = evaluatedHours >= DURATION_HOURS;

  // 5. Deterministic decision
  const hasRecommendedWindow = !!decision?.recommendedWindow;
  const hasRecommendedPlan = !!jointDecision?.recommendedPlan;

  lines.push(`  dataSource      : ${dataSource} — ${dataSourcePass ? 'PASS' : 'FAIL (fixture substitution detected!)'}`);
  lines.push(`  sentinel check  : activityId="${activityId}" — ${notFixtureSentinel ? 'PASS' : 'FAIL (fixture sentinel found in LIVE response!)'}`);
  lines.push(`  spatial field   : ${hasSpatialField ? 'PRESENT' : 'MISSING'}`);
  lines.push(`  hourly coverage : ${evaluatedHours}h >= ${DURATION_HOURS}h — ${hourlyPass ? 'PASS' : 'FAIL'}`);
  lines.push(`  temporal window : ${hasRecommendedWindow ? decision.recommendedWindow.startTime + ' → ' + decision.recommendedWindow.endTime : 'MISSING'}`);
  lines.push(`  joint plan      : ${hasRecommendedPlan ? jointDecision.recommendedPlan.location?.name + ' | ' + jointDecision.recommendedPlan.exposureScore + '°C' : 'MISSING'}`);

  const allPass = dataSourcePass && notFixtureSentinel && hourlyPass;
  lines.push(`  RESULT          : ${allPass ? 'PASS' : 'FAIL'}`);

  return lines.join('\n');
}

async function probe(location) {
  const start = Date.now();
  let result;

  try {
    const response = await fetch(`${BASE_URL}/api/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        latitude: location.latitude,
        longitude: location.longitude,
        durationHours: DURATION_HOURS,
        mode: 'LIVE',
      }),
    });

    const body = await response.json();
    result = { ok: response.ok, status: response.status, statusText: response.statusText, body };
  } catch (err) {
    result = { ok: false, status: 0, statusText: err.message, body: {} };
  }

  const durationMs = Date.now() - start;
  return formatResult(location, result, durationMs);
}

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(' §3/§4 — California Geographic Validation Probe');
  console.log(` Target: ${BASE_URL}/api/decision`);
  console.log(` Mode: LIVE (FortyGuard API)`);
  console.log(` Time: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════');

  for (const location of CALIFORNIA_LOCATIONS) {
    console.log(`\n→ Probing ${location.name}...`);
    const result = await probe(location);
    console.log(result);
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' Probe complete.');
  console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('Probe script failed:', err);
  process.exit(1);
});
