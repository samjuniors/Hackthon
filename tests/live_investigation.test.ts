import { describe, it, expect } from 'vitest';
import { FortyGuardAdapter } from '../src/lib/fortyguard/adapter';
import {
  evaluateCandidateWindows,
  evaluateCandidateLocations,
  evaluateJointDecision,
  evaluateWhatIfScenarios,
} from '../src/lib/decision-engine/evaluator';
import type { LocationPoint, CandidateLocation } from '../src/types/domain';

function generateLiveCandidates(center: LocationPoint): CandidateLocation[] {
  const dLat = 400 / 111320;
  return [
    {
      locationId: 'SITE-N',
      name: 'Site North (Upper Zone)',
      location: { latitude: center.latitude + dLat * 0.25, longitude: center.longitude },
    },
    {
      locationId: 'SITE-CENTER',
      name: 'Site Center (Selected Location)',
      location: { latitude: center.latitude, longitude: center.longitude },
    },
    {
      locationId: 'SITE-S',
      name: 'Site South (Lower Zone)',
      location: { latitude: center.latitude - dLat * 0.25, longitude: center.longitude },
    },
  ];
}

async function runLivePipeline(name: string, location: LocationPoint) {
  const API_KEY = 'a57426b8…[REDACTED]';
  const BASE_URL = 'https://api.fortyguard.com';

  const adapter = new FortyGuardAdapter({ mode: 'LIVE', apiKey: API_KEY, baseUrl: BASE_URL });
  const defaultWindow = adapter.getDefaultOperatingWindow(6);

  const allowedStart = defaultWindow.allowedStart;
  const allowedEnd = defaultWindow.allowedEnd;

  const startMs = new Date(allowedStart).getTime();
  const endMs = new Date(allowedEnd).getTime();

  const hourlyTimestamps: string[] = [];
  for (let tMs = startMs; tMs < endMs; tMs += 3600 * 1000) {
    hourlyTimestamps.push(new Date(tMs).toISOString());
  }

  const candidatesToEvaluate = generateLiveCandidates(location);
  const snapshotsMap = await adapter.getHourlyHeatmapSnapshots(location, hourlyTimestamps);

  const observationsByCandidate = new Map();
  for (const cand of candidatesToEvaluate) {
    const obsList = [];
    for (const timestamp of hourlyTimestamps) {
      const snapshotAoi = snapshotsMap.get(timestamp);
      if (!snapshotAoi) {
        throw new Error(`Missing snapshot at ${timestamp}`);
      }
      const obs = adapter.normalizePointObservation(
        snapshotAoi,
        cand.location,
        timestamp,
        '/v1/heatmap',
        'DERIVED'
      );
      obsList.push(obs);
    }
    observationsByCandidate.set(cand.locationId, obsList);
  }

  const constraints = {
    allowedStart,
    allowedEnd,
    durationHours: 3,
    dataResolutionHours: 1,
  };

  const decision = evaluateCandidateWindows(
    location,
    observationsByCandidate.get(candidatesToEvaluate[0].locationId),
    constraints,
    allowedStart
  );

  const activeWindow = {
    windowId: decision.recommendedWindow.windowId,
    startTime: decision.recommendedWindow.startTime,
    endTime: decision.recommendedWindow.endTime,
    durationHours: decision.recommendedWindow.durationHours,
  };

  const spatialDecision = evaluateCandidateLocations(
    candidatesToEvaluate,
    observationsByCandidate,
    activeWindow,
    { baseTimestamp: hourlyTimestamps[0] }
  );

  const jointDecision = evaluateJointDecision(
    candidatesToEvaluate,
    observationsByCandidate,
    constraints,
    { baseTimestamp: allowedStart }
  );

  const whatIf = evaluateWhatIfScenarios(
    candidatesToEvaluate,
    observationsByCandidate,
    constraints,
    { baseTimestamp: allowedStart }
  );

  return { decision, spatialDecision, jointDecision, whatIf, snapshotsMap };
}

describe('LIVE Runtime Bug Investigation Across Locations', () => {
  it('runs Los Angeles LIVE decision pipeline', async () => {
    const res = await runLivePipeline('Los Angeles', { latitude: 34.0522, longitude: -118.2437 });
    expect(res.jointDecision.recommendedPlan).toBeDefined();
    expect(res.snapshotsMap.size).toBe(6);
  }, 90000);

  it('runs San Francisco LIVE decision pipeline', async () => {
    const res = await runLivePipeline('San Francisco', { latitude: 37.7749, longitude: -122.4194 });
    expect(res.jointDecision.recommendedPlan).toBeDefined();
    expect(res.snapshotsMap.size).toBe(6);
  }, 90000);

  it('runs San Diego LIVE decision pipeline', async () => {
    const res = await runLivePipeline('San Diego', { latitude: 32.7157, longitude: -117.1611 });
    expect(res.jointDecision.recommendedPlan).toBeDefined();
    expect(res.snapshotsMap.size).toBe(6);
  }, 90000);
});
