import { FortyGuardAdapter } from "./src/lib/fortyguard/adapter.ts";
import {
  evaluateCandidateWindows,
  evaluateCandidateLocations,
  evaluateJointDecision,
  evaluateWhatIfScenarios,
} from "./src/lib/decision-engine/evaluator.ts";

process.env.FORTYGUARD_API_KEY = "a57426b8…[REDACTED]";
process.env.FORTYGUARD_API_BASE_URL = "https://api.fortyguard.com";

function generateLiveCandidates(center) {
  const dLat = 400 / 111320;
  return [
    {
      locationId: "SITE-N",
      name: "Site North (Upper Zone)",
      location: { latitude: center.latitude + dLat * 0.6, longitude: center.longitude },
    },
    {
      locationId: "SITE-CENTER",
      name: "Site Center (Selected Location)",
      location: { latitude: center.latitude, longitude: center.longitude },
    },
    {
      locationId: "SITE-S",
      name: "Site South (Lower Zone)",
      location: { latitude: center.latitude - dLat * 0.6, longitude: center.longitude },
    },
  ];
}

async function simulate(name, lat, lon) {
  console.log(`\n======================================================`);
  console.log(`SIMULATING DECISION PIPELINE FOR: ${name} (${lat}, ${lon})`);
  console.log(`======================================================`);

  const mode = "LIVE";
  const durationHours = 3;
  const location = { latitude: lat, longitude: lon };

  const adapter = new FortyGuardAdapter({ mode, apiKey: process.env.FORTYGUARD_API_KEY, baseUrl: process.env.FORTYGUARD_API_BASE_URL });
  const defaultWindow = adapter.getDefaultOperatingWindow(6);
  console.log(`Default Window:`, defaultWindow);

  const allowedStart = defaultWindow.allowedStart;
  const allowedEnd = defaultWindow.allowedEnd;

  const startMs = new Date(allowedStart).getTime();
  const endMs = new Date(allowedEnd).getTime();

  const hourlyTimestamps = [];
  for (let tMs = startMs; tMs < endMs; tMs += 3600 * 1000) {
    hourlyTimestamps.push(new Date(tMs).toISOString());
  }
  console.log(`Hourly timestamps to query:`, hourlyTimestamps);

  const candidatesToEvaluate = generateLiveCandidates(location);
  console.log(`Candidates:`, candidatesToEvaluate.map(c => `${c.locationId}: (${c.location.latitude}, ${c.location.longitude})`));

  console.log(`Fetching hourly snapshots via getHourlyHeatmapSnapshots...`);
  try {
    const snapshotsMap = await adapter.getHourlyHeatmapSnapshots(location, hourlyTimestamps);
    console.log(`Snapshots Map size:`, snapshotsMap.size);
    for (const [ts, aoi] of snapshotsMap.entries()) {
      console.log(`  - Timestamp: ${ts} | Features count: ${aoi?.features?.length}`);
    }

    const observationsByCandidate = new Map();
    for (const cand of candidatesToEvaluate) {
      const obsList = [];
      for (const timestamp of hourlyTimestamps) {
        const snapshotAoi = snapshotsMap.get(timestamp);
        if (!snapshotAoi) {
          console.log(`ERROR: Missing snapshot at ${timestamp} for cand ${cand.locationId}`);
        }
        const obs = adapter.normalizePointObservation(
          snapshotAoi,
          cand.location,
          timestamp,
          "/v1/heatmap",
          "DERIVED"
        );
        obsList.push(obs);
      }
      observationsByCandidate.set(cand.locationId, obsList);
    }
    console.log(`Normalized observations count per candidate:`, observationsByCandidate.get(candidatesToEvaluate[0].locationId)?.length);
    console.log(`Sample obs for primary candidate:`, JSON.stringify(observationsByCandidate.get(candidatesToEvaluate[0].locationId)?.[0]));

    const constraints = {
      allowedStart,
      allowedEnd,
      durationHours,
      dataResolutionHours: 1,
    };

    console.log(`Evaluating candidate windows...`);
    const decision = evaluateCandidateWindows(
      location,
      observationsByCandidate.get(candidatesToEvaluate[0].locationId),
      constraints,
      allowedStart
    );
    console.log(`Decision evaluated! Recommended Window:`, decision.recommendedWindow);

    console.log(`Evaluating candidate locations...`);
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
      hourlyTimestamps[0]
    );
    console.log(`Spatial Decision evaluated! Recommended Location:`, spatialDecision.recommendedLocation.name);

    console.log(`Evaluating joint decision...`);
    const jointDecision = evaluateJointDecision(
      candidatesToEvaluate,
      observationsByCandidate,
      constraints,
      allowedStart
    );
    console.log(`Joint Decision evaluated! Best Plan:`, jointDecision.recommendedPlan);

    console.log(`Evaluating What-If Scenarios...`);
    const whatIf = evaluateWhatIfScenarios(
      candidatesToEvaluate,
      observationsByCandidate,
      constraints,
      allowedStart
    );
    console.log(`What-If Scenarios count:`, whatIf.scenarios.length);
    console.log(`ALL SUCCEEDED FOR ${name}!`);
  } catch (err) {
    console.log(`CAUGHT ERROR: ${err.constructor.name}: ${err.message}`);
    console.log(err.stack);
  }
}

async function run() {
  await simulate("Los Angeles", 34.0522, -118.2437);
  await simulate("San Francisco", 37.7749, -122.4194);
}

run().catch(console.error);
