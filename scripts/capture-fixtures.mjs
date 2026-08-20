#!/usr/bin/env node
/**
 * FortyGuard raw fixture capture — evidence gate tooling (M4 / Phase 1).
 *
 * Zero runtime dependencies (Node >= 18 native fetch + fs).
 *
 * PURPOSE
 *   Capture *raw, unmodified* FortyGuard API responses to tests/fixtures/ so the
 *   decision engine can be built against observed schemas rather than assumed
 *   ones. Every capture writes two files:
 *
 *     <name>.json          the raw response body, verbatim, no wrapper
 *     <name>.request.json  the request we sent + timing/status metadata
 *
 * CREDENTIALS
 *   Read from the environment only. Never hardcoded, never written to a fixture,
 *   never printed. The API key is redacted from all output including error text.
 *
 *     FORTYGUARD_API_KEY        (required)
 *     FORTYGUARD_API_BASE_URL   (optional, defaults to https://api.fortyguard.com)
 *
 *   The script loads .env.local then .env if the vars are not already set.
 *
 * USAGE
 *   node scripts/capture-fixtures.mjs usage
 *   node scripts/capture-fixtures.mjs heatmap-ft1
 *   node scripts/capture-fixtures.mjs heatmap-ft2
 *   node scripts/capture-fixtures.mjs env-params
 *   node scripts/capture-fixtures.mjs gate3-sweep
 *   node scripts/capture-fixtures.mjs all
 *
 * CREDIT COST
 *   /v1/heatmap and /v1/env_params cost 2,000 credits per call.
 *   /v1/status and /v1/system/fetch-api-key-usage are free.
 *   `all` performs 5 billable calls (~10,000 credits).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = resolve(ROOT, "tests/fixtures");

/* ------------------------------------------------------------------ env ---- */

function loadEnvFile(name) {
  const path = resolve(ROOT, name);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const [, key, rawValue] = m;
    if (process.env[key]) continue;
    const value = rawValue.replace(/^(['"])(.*)\1$/, "$2");
    if (value) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const API_KEY = process.env.FORTYGUARD_API_KEY;
const BASE_URL = (process.env.FORTYGUARD_API_BASE_URL || "https://api.fortyguard.com").replace(/\/+$/, "");

if (!API_KEY) {
  console.error("FORTYGUARD_API_KEY is not set. Add it to .env.local or export it.");
  process.exit(1);
}

/** Strip the credential from anything we are about to print. */
function redact(text) {
  return String(text).split(API_KEY).join("<REDACTED_API_KEY>");
}

/* ---------------------------------------------------------------- helpers -- */

const log = (...args) => console.log(...args.map(redact));

function pad(n) {
  return String(n).padStart(2, "0");
}

/** Next whole UTC hour, offset by `plusHours`. */
function utcHour(plusHours = 0) {
  const d = new Date();
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(d.getUTCHours() + plusHours);
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    time: `${pad(d.getUTCHours())}:00`,
    iso: d.toISOString(),
  };
}

/**
 * Square-ish AOI polygon around a centre point.
 * GeoJSON ring order is [longitude, latitude] and the ring must be closed.
 */
function squareAoi(latitude, longitude, halfSideMetres) {
  const dLat = halfSideMetres / 111_320;
  const dLon = halfSideMetres / (111_320 * Math.cos((latitude * Math.PI) / 180));
  const ring = [
    [longitude - dLon, latitude - dLat],
    [longitude + dLon, latitude - dLat],
    [longitude + dLon, latitude + dLat],
    [longitude - dLon, latitude + dLat],
    [longitude - dLon, latitude - dLat],
  ];
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }],
  };
}

function save(name, raw, meta) {
  mkdirSync(FIXTURES, { recursive: true });
  // Raw response body, verbatim — no wrapper, so the observed shape is preserved.
  writeFileSync(resolve(FIXTURES, `${name}.json`), JSON.stringify(raw, null, 2) + "\n", "utf8");
  writeFileSync(resolve(FIXTURES, `${name}.request.json`), JSON.stringify(meta, null, 2) + "\n", "utf8");
  log(`  saved tests/fixtures/${name}.json  (+ .request.json)`);
}

async function call(method, path, body) {
  const url = `${BASE_URL}${path}`;
  const startedAt = Date.now();
  const res = await fetch(url, {
    method,
    headers: {
      "api-key": API_KEY,
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { __nonJsonBody: text.slice(0, 4000) };
  }
  return { status: res.status, ok: res.ok, body: parsed, elapsedMs: Date.now() - startedAt };
}

/** Submit → poll /v1/status/{activity_id} until terminal. Returns both stages. */
async function submitAndPoll(path, requestBody, { maxAttempts = 120, intervalMs = 3000 } = {}) {
  log(`  POST ${path}`);
  const submit = await call("POST", path, requestBody);
  if (!submit.ok) {
    log(`  submit failed: HTTP ${submit.status} ${JSON.stringify(submit.body).slice(0, 400)}`);
    return { submit, polls: [], final: null };
  }

  const activityId =
    submit.body?.data?.activity_id ?? submit.body?.activity_id ?? submit.body?.data?.activityId ?? null;
  log(`  activity_id: ${activityId ?? "(none returned)"}`);
  if (!activityId) return { submit, polls: [], final: null };

  const polls = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const poll = await call("GET", `/v1/status/${activityId}`);
    const status = poll.body?.data?.status ?? poll.body?.status ?? "(unknown)";
    polls.push({ attempt, httpStatus: poll.status, status, elapsedMs: poll.elapsedMs });
    log(`  poll ${attempt}: ${status}`);
    if (status === "Completed" || status === "Failed") {
      return { submit, polls, final: poll, activityId };
    }
  }
  log(`  gave up after ${maxAttempts} polls`);
  return { submit, polls, final: null, activityId };
}

/* ------------------------------------------------------------------ AOI ---- */

// New York City. This centre point is the one already proven to return data in
// the pre-existing tests/fixtures/env_params_sample.json.
const CENTRE = { latitude: 40.7128, longitude: -74.006 };
const AOI = squareAoi(CENTRE.latitude, CENTRE.longitude, 400); // ~800m x 800m

/* --------------------------------------------------------------- captures -- */

async function captureUsage() {
  log("\n[usage] /v1/system/fetch-api-key-usage (free)");
  // Observed 2026-08-20: this endpoint requires the key in the BODY as `api_key`
  // in addition to the `api-key` header. Header alone returns HTTP 422
  // "Field 'api_key' is required."
  const res = await call("POST", "/v1/system/fetch-api-key-usage", { api_key: API_KEY });
  save("system_api_key_usage", res.body, {
    endpoint: "/v1/system/fetch-api-key-usage",
    method: "POST",
    requestBody: { api_key: "<REDACTED>" },
    httpStatus: res.status,
    capturedAt: new Date().toISOString(),
  });
  return res;
}

async function captureHeatmapFt1() {
  log("\n[heatmap-ft1] single-hour snapshot (filter_type 1) — 2,000 credits");
  const hour = utcHour(2);
  const request = {
    polygon_aoi: AOI,
    date_time: { start_date: hour.date, start_time: hour.time, filter_type: 1 },
    granularity: 60,
  };
  const result = await submitAndPoll("/v1/heatmap", request);
  save("heatmap_ft1_raw", result.final?.body ?? { __submitOnly: result.submit.body }, {
    endpoint: "/v1/heatmap",
    gate: "baseline single-hour",
    requestBody: request,
    intendedUtcHour: hour.iso,
    activityId: result.activityId ?? null,
    submitHttpStatus: result.submit.status,
    polls: result.polls,
    capturedAt: new Date().toISOString(),
  });
  return result;
}

async function captureHeatmapFt2() {
  log("\n[heatmap-ft2] GATE 1 — multi-hour range (filter_type 2) — 2,000 credits");
  const start = utcHour(2);
  const end = utcHour(8);
  const request = {
    polygon_aoi: AOI,
    date_time: {
      start_date: start.date,
      start_time: start.time,
      end_date: end.date,
      end_time: end.time,
      filter_type: 2,
    },
    granularity: 60,
  };
  const result = await submitAndPoll("/v1/heatmap", request);
  save("heatmap_ft2_raw", result.final?.body ?? { __submitOnly: result.submit.body }, {
    endpoint: "/v1/heatmap",
    gate: "GATE 1 — does filter_type 2 return per-timestamp tile values?",
    requestBody: request,
    intendedUtcRange: { start: start.iso, end: end.iso },
    activityId: result.activityId ?? null,
    submitHttpStatus: result.submit.status,
    polls: result.polls,
    capturedAt: new Date().toISOString(),
  });
  return result;
}

async function captureEnvParams() {
  log("\n[env-params] point enrichment — 2,000 credits");
  const hour = utcHour(2);
  const request = {
    latitude: CENTRE.latitude,
    longitude: CENTRE.longitude,
    temperature: 32,
    date_time: { start_date: hour.date, start_time: hour.time, filter_type: 1 },
    analysis: [
      "heat_index_celsius",
      "apparent_temperature_celsius",
      "wet_bulb_temperature_celsius",
      "relative_humidity_percent",
      "solar_irradiance",
    ],
  };
  const result = await submitAndPoll("/v1/env_params", request);
  save("env_params_raw", result.final?.body ?? { __submitOnly: result.submit.body }, {
    endpoint: "/v1/env_params",
    gate: "baseline env_params at a known reference temperature",
    requestBody: request,
    intendedUtcHour: hour.iso,
    activityId: result.activityId ?? null,
    submitHttpStatus: result.submit.status,
    polls: result.polls,
    capturedAt: new Date().toISOString(),
  });
  return result;
}

/**
 * GATE 3 — is `temperature` a true reference anchor?
 *
 * Hold latitude/longitude/timestamp fixed and vary ONLY `temperature`. If the
 * returned wet-bulb / heat-index / apparent-temperature values move with the
 * input, the parameter genuinely drives the physics. If they do not move, the
 * input is ignored or merely advisory and a per-tile "wet-bulb field" built by
 * feeding tile temperatures into this endpoint would be fabricated.
 */
async function captureGate3Sweep(temperatures = [24, 38]) {
  log("\n[gate3-sweep] GATE 3 — temperature sensitivity — 2,000 credits per probe");
  const hour = utcHour(2);
  const probes = [];
  for (const temperature of temperatures) {
    log(`  probe temperature=${temperature}`);
    const request = {
      latitude: CENTRE.latitude,
      longitude: CENTRE.longitude,
      temperature,
      date_time: { start_date: hour.date, start_time: hour.time, filter_type: 1 },
      analysis: [
        "heat_index_celsius",
        "apparent_temperature_celsius",
        "wet_bulb_temperature_celsius",
        "relative_humidity_percent",
      ],
    };
    const result = await submitAndPoll("/v1/env_params", request);
    const name = `env_params_gate3_t${temperature}`;
    save(name, result.final?.body ?? { __submitOnly: result.submit.body }, {
      endpoint: "/v1/env_params",
      gate: "GATE 3 — vary temperature only, hold location+time fixed",
      requestBody: request,
      intendedUtcHour: hour.iso,
      activityId: result.activityId ?? null,
      submitHttpStatus: result.submit.status,
      polls: result.polls,
      capturedAt: new Date().toISOString(),
    });
    probes.push({ temperature, fixture: name, body: result.final?.body ?? null });
  }
  return probes;
}

/* ------------------------------------------------------------------ main --- */

const COMMANDS = {
  usage: captureUsage,
  "heatmap-ft1": captureHeatmapFt1,
  "heatmap-ft2": captureHeatmapFt2,
  "env-params": captureEnvParams,
  "gate3-sweep": captureGate3Sweep,
  async status() {
    const activityId = process.argv[3];
    if (!activityId) {
      console.error("Usage: node scripts/capture-fixtures.mjs status <activity_id>");
      process.exit(1);
    }
    log(`\n[status] polling /v1/status/${activityId}`);
    const poll = await call("GET", `/v1/status/${activityId}`);
    log(`HTTP ${poll.status} - Status: ${poll.body?.data?.status ?? poll.body?.status}`);
    log(JSON.stringify(poll.body, null, 2));
    if (poll.body?.data?.status === "Completed") {
      save(`activity_${activityId}_completed`, poll.body, { activityId, polledAt: new Date().toISOString() });
    }
    return poll;
  },
  async all() {
    await captureUsage();
    await captureHeatmapFt2();
    await captureHeatmapFt1();
    await captureEnvParams();
    await captureGate3Sweep();
    await captureUsage();
  },
};

const command = process.argv[2];
if (!command || !COMMANDS[command]) {
  console.error(`Usage: node scripts/capture-fixtures.mjs <${Object.keys(COMMANDS).join("|")}>`);
  process.exit(1);
}

log(`FortyGuard capture — base URL ${BASE_URL}, key <REDACTED ${API_KEY.length} chars>`);

try {
  await COMMANDS[command]();
  log("\ndone.");
} catch (error) {
  console.error(redact(error?.stack || error?.message || error));
  process.exit(1);
}
