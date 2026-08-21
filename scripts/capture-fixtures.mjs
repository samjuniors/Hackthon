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

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
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

/** A specific UTC hour on a date `daysBack` before today. */
function pastDayHour(daysBack, utcHourOfDay) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysBack);
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(utcHourOfDay);
  return {
    start_date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    start_time: `${pad(utcHourOfDay)}:00`,
    filter_type: 1,
  };
}

/** Noon UTC on a date `daysBack` before today. */
function pastDayNoon(daysBack) {
  return pastDayHour(daysBack, 12);
}

/**
 * Rectangular AOI polygon around a centre point, with independent half-extents.
 * The candidate sites span ~1.7 km of longitude but share one latitude, so a
 * rectangle covers them with far fewer tiles than the enclosing square.
 */
function rectAoi(latitude, longitude, halfLonMetres, halfLatMetres) {
  const dLat = halfLatMetres / 111320;
  const dLon = halfLonMetres / (111320 * Math.cos((latitude * Math.PI) / 180));
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

/**
 * GATE 4 — why does a Completed /v1/heatmap return `n_cells: 0`?
 *
 * The baseline capture (heatmap_ft1_raw.json) reached status `Completed` and
 * still returned `map_data.features: []` with `stats_data.n_cells: 0`. A
 * Completed-but-empty result narrows the cause to how the request describes the
 * area, not to auth, timing, or coverage. Each variant below changes exactly one
 * thing so the responsible parameter is identifiable from the response alone.
 *
 * Each probe is a billable call (~4,200 credits observed). Variants are ordered
 * cheapest-hypothesis-first; stop as soon as one returns cells.
 */
function bareGeometry(latitude, longitude, halfSideMetres) {
  return squareAoi(latitude, longitude, halfSideMetres).features[0].geometry;
}

function singleFeature(latitude, longitude, halfSideMetres) {
  return squareAoi(latitude, longitude, halfSideMetres).features[0];
}

const HEATMAP_PROBES = {
  // H1: is `polygon_aoi` expected to be a bare Polygon geometry rather than a
  // FeatureCollection? A misread wrapper would intersect zero cells.
  "bare-geometry": {
    hypothesis: "polygon_aoi must be a bare GeoJSON Polygon geometry, not a FeatureCollection",
    aoi: () => bareGeometry(CENTRE.latitude, CENTRE.longitude, 400),
    granularity: 60,
  },
  // H2: is a single Feature accepted where a FeatureCollection is not?
  "single-feature": {
    hypothesis: "polygon_aoi must be a single GeoJSON Feature",
    aoi: () => singleFeature(CENTRE.latitude, CENTRE.longitude, 400),
    granularity: 60,
  },
  // H3: is the 800m AOI simply below the minimum area that yields a cell at
  // granularity 60? Same wrapper as the baseline, larger area only.
  "large-aoi-60": {
    hypothesis: "800m AOI is below the minimum area for granularity 60",
    aoi: () => squareAoi(CENTRE.latitude, CENTRE.longitude, 3000),
    granularity: 60,
  },
  // H4: does the coarsest granularity produce cells where 60 does not?
  "large-aoi-100": {
    hypothesis: "granularity 60 is unsupported for this AOI; 100 is the coarsest documented value",
    aoi: () => squareAoi(CENTRE.latitude, CENTRE.longitude, 3000),
    granularity: 100,
  },
  // H5: combined — larger area AND bare geometry.
  "large-bare-100": {
    hypothesis: "both the wrapper shape and the area were wrong",
    aoi: () => bareGeometry(CENTRE.latitude, CENTRE.longitude, 3000),
    granularity: 100,
  },
  // H6: docs/FORTYGUARD.md records an `analytic_type` parameter (tcm,
  // time_of_measure, exceedance, persistence) that no request has ever sent.
  // A solver with no analytic selected may legitimately emit zero cells.
  "tcm-analytic": {
    hypothesis: "analytic_type is required to select a solver; omitting it yields zero cells",
    aoi: () => squareAoi(CENTRE.latitude, CENTRE.longitude, 3000),
    granularity: 100,
    analyticType: "tcm",
  },
  // H7: is New York simply outside FortyGuard's modeled coverage? Probe a
  // different metropolitan area with an otherwise identical request. If cells
  // return here but not for NYC, the constraint is geographic, not structural.
  "coverage-auh": {
    hypothesis: "NYC is outside modeled coverage; the request itself is well-formed",
    aoi: () => squareAoi(24.4539, 54.3773, 3000), // Abu Dhabi
    granularity: 100,
    analyticType: "tcm",
  },
  "coverage-dxb": {
    hypothesis: "confirm coverage finding at a second metropolitan area",
    aoi: () => squareAoi(25.2048, 55.2708, 3000), // Dubai
    granularity: 100,
    analyticType: "tcm",
  },
  // H8: every probe so far requested a FUTURE hour (+2h). If the tile surface is
  // produced from completed model runs, a forecast hour may legitimately have no
  // cells while a past hour does. Vary ONLY the timestamp.
  "past-hour": {
    hypothesis: "future timestamps have no completed model run; a past hour does",
    aoi: () => squareAoi(CENTRE.latitude, CENTRE.longitude, 3000),
    granularity: 100,
    dateTime: () => {
      const h = utcHour(-6);
      return { start_date: h.date, start_time: h.time, filter_type: 1 };
    },
  },
  "past-week": {
    hypothesis: "only well-settled historical dates have tile surfaces",
    aoi: () => squareAoi(CENTRE.latitude, CENTRE.longitude, 3000),
    granularity: 100,
    dateTime: () => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 7);
      d.setUTCMinutes(0, 0, 0);
      d.setUTCHours(12);
      return {
        start_date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
        start_time: "12:00",
        filter_type: 1,
      };
    },
  },
  // GATE 5 — "past-week" proved tile surfaces exist for settled historical dates.
  // These probes bound the two parameters the adapter actually hardcodes:
  // how recent a date still returns cells, and whether granularity 60 works at all.
  // stopOnSuccess:false so the sweep maps the whole boundary instead of short-circuiting.
  "g60-past": {
    hypothesis: "granularity 60 (hardcoded by the LIVE adapter) also returns cells on a settled date",
    aoi: () => squareAoi(CENTRE.latitude, CENTRE.longitude, 3000),
    granularity: 60,
    dateTime: () => pastDayNoon(7),
    stopOnSuccess: false,
  },
  "g80-past": {
    hypothesis: "granularity 80 also returns cells on a settled date",
    aoi: () => squareAoi(CENTRE.latitude, CENTRE.longitude, 3000),
    granularity: 80,
    dateTime: () => pastDayNoon(7),
    stopOnSuccess: false,
  },
  "back-1d": {
    hypothesis: "data is available 1 day back",
    aoi: () => squareAoi(CENTRE.latitude, CENTRE.longitude, 3000),
    granularity: 100,
    dateTime: () => pastDayNoon(1),
    stopOnSuccess: false,
  },
  "back-2d": {
    hypothesis: "data is available 2 days back",
    aoi: () => squareAoi(CENTRE.latitude, CENTRE.longitude, 3000),
    granularity: 100,
    dateTime: () => pastDayNoon(2),
    stopOnSuccess: false,
  },
  "back-3d": {
    hypothesis: "data is available 3 days back",
    aoi: () => squareAoi(CENTRE.latitude, CENTRE.longitude, 3000),
    granularity: 100,
    dateTime: () => pastDayNoon(3),
    stopOnSuccess: false,
  },
  // GATE 6 — the AOI the product actually needs: one polygon containing ALL THREE
  // candidate locations (LOC-A -74.0080, LOC-B -73.9980, LOC-C -73.9880 @ 40.7120),
  // small enough that a 12-hour fixture stays a reasonable size.
  "candidate-aoi": {
    hypothesis: "a 1200m half-side AOI centred on LOC-B returns cells and contains all three candidates",
    aoi: () => squareAoi(40.712, -73.998, 1200),
    granularity: 100,
    dateTime: () => pastDayNoon(7),
    stopOnSuccess: false,
  },
  "candidate-rect": {
    hypothesis: "a 2200m x 800m rectangular AOI still contains all three candidates with ~1/3 the tiles",
    aoi: () => rectAoi(40.712, -73.998, 1100, 400),
    granularity: 100,
    dateTime: () => pastDayNoon(7),
    stopOnSuccess: false,
  },
  // H9: filter_type 1 may not be the shape that emits tiles at all. The only
  // other verified-submittable variant is the multi-hour range.
  "range-past": {
    hypothesis: "tile surfaces are only emitted for multi-hour ranges (filter_type 2)",
    aoi: () => squareAoi(CENTRE.latitude, CENTRE.longitude, 3000),
    granularity: 100,
    dateTime: () => {
      const start = utcHour(-6);
      const end = utcHour(-2);
      return {
        start_date: start.date,
        start_time: start.time,
        end_date: end.date,
        end_time: end.time,
        filter_type: 2,
      };
    },
  },
};

/** Count tiles in whatever shape the response returns them. */
function summarizeHeatmapResult(body) {
  const result = body?.data?.result ?? {};
  const mapData = result.map_data ?? result;
  const features = Array.isArray(mapData?.features) ? mapData.features : [];
  const stats = result.stats_data ?? {};
  const sampleProps = features[0]?.properties ?? null;
  return {
    featureCount: features.length,
    nCells: stats.n_cells ?? null,
    statsKeys: Object.keys(stats),
    samplePropertyKeys: sampleProps ? Object.keys(sampleProps) : [],
    sampleProperties: sampleProps,
    sampleGeometryType: features[0]?.geometry?.type ?? null,
    sampleRing: features[0]?.geometry?.coordinates?.[0] ?? null,
  };
}

async function captureHeatmapProbe() {
  const requested = process.argv.slice(3);
  const names = requested.length > 0 ? requested : Object.keys(HEATMAP_PROBES);

  log("\n[heatmap-probe] GATE 4 — diagnosing Completed-but-empty heatmap responses");
  const summaries = [];

  for (const name of names) {
    const probe = HEATMAP_PROBES[name];
    if (!probe) {
      console.error(`unknown probe "${name}". known: ${Object.keys(HEATMAP_PROBES).join(", ")}`);
      process.exit(1);
    }

    log(`\n  --- probe ${name} — ${probe.hypothesis}`);
    const hour = utcHour(2);
    const request = {
      polygon_aoi: probe.aoi(),
      date_time: probe.dateTime
        ? probe.dateTime()
        : { start_date: hour.date, start_time: hour.time, filter_type: 1 },
      granularity: probe.granularity,
      ...(probe.analyticType ? { analytic_type: probe.analyticType } : {}),
    };

    const result = await submitAndPoll("/v1/heatmap", request);
    const body = result.final?.body ?? { __submitOnly: result.submit.body };
    const summary = summarizeHeatmapResult(body);

    save(`heatmap_probe_${name.replace(/-/g, "_")}`, body, {
      endpoint: "/v1/heatmap",
      gate: `GATE 4 — ${probe.hypothesis}`,
      probe: name,
      requestBody: request,
      intendedUtcHour: hour.iso,
      activityId: result.activityId ?? null,
      submitHttpStatus: result.submit.status,
      polls: result.polls,
      responseSummary: summary,
      capturedAt: new Date().toISOString(),
    });

    log(`      features: ${summary.featureCount}  n_cells: ${summary.nCells}`);
    if (summary.samplePropertyKeys.length > 0) {
      log(`      tile properties: ${summary.samplePropertyKeys.join(", ")}`);
      log(`      first tile: ${JSON.stringify(summary.sampleProperties)}`);
    }

    summaries.push({ name, ...summary });

    if (summary.featureCount > 0 && probe.stopOnSuccess !== false) {
      log(`\n  ✅ probe "${name}" returned ${summary.featureCount} tiles — hypothesis confirmed, stopping sweep.`);
      break;
    }
  }

  log("\n  probe summary:");
  for (const s of summaries) {
    log(`    ${s.name.padEnd(18)} features=${String(s.featureCount).padEnd(5)} n_cells=${s.nCells}`);
  }
  return summaries;
}

/* ------------------------------------------------------------------ main --- */

/**
 * GATE 6 — capture the canonical multi-hour thermal surface used by FIXTURE mode.
 *
 * Empirically established constraints this configuration satisfies:
 *  - `/v1/heatmap` returns cells ONLY for settled historical dates. Future hours and
 *    the most recent ~12-24h return `features: []`. The date below is therefore fixed.
 *  - `granularity` is the tile edge length in metres (verified: 60 -> ~60.6m,
 *    80 -> ~80.6m, 100 -> ~101.0m).
 *  - The rectangular AOI contains all three evaluated candidate sites, so no candidate
 *    is ever mapped outside coverage.
 *
 * Every `aoi` written to the fixture is the VERBATIM `map_data` FeatureCollection from
 * the API response. No value is computed, smoothed, interpolated or substituted.
 */
const HOURLY_SURFACE = {
  date: "2026-08-14",
  hours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
  granularity: 100,
  centre: { latitude: 40.712, longitude: -73.998 },
  halfLonMetres: 1100,
  halfLatMetres: 400,
};

async function captureHourlySurface() {
  const { date, hours, granularity, centre, halfLonMetres, halfLatMetres } = HOURLY_SURFACE;
  const aoi = rectAoi(centre.latitude, centre.longitude, halfLonMetres, halfLatMetres);

  log(`\n[hourly-surface] capturing ${hours.length} real hourly tile surfaces for ${date} (granularity ${granularity}m)`);

  const snapshots = [];
  for (const h of hours) {
    const time = `${pad(h)}:00`;
    const timestamp = `${date}T${time}:00.000Z`;
    const request = {
      polygon_aoi: aoi,
      date_time: { start_date: date, start_time: time, filter_type: 1 },
      granularity,
    };

    log(`\n  --- ${timestamp}`);
    const result = await submitAndPoll("/v1/heatmap", request);
    const body = result.final?.body;
    const mapData = body?.data?.result?.map_data;
    const stats = body?.data?.result?.stats_data ?? null;
    const featureCount = Array.isArray(mapData?.features) ? mapData.features.length : 0;

    if (featureCount === 0) {
      console.error(
        `\n  ABORT: ${timestamp} returned 0 tiles. A fixture hour will NOT be fabricated.\n` +
          `  Re-run with a different date/hour, or shorten the hour list. Nothing was written.`
      );
      process.exit(1);
    }

    log(`      tiles: ${featureCount}  activity: ${result.activityId}`);

    snapshots.push({
      timestamp,
      aoi: mapData,
      statsData: stats,
      capture: {
        endpoint: "/v1/heatmap",
        requestBody: request,
        activityId: result.activityId ?? null,
        submitHttpStatus: result.submit.status,
        polls: result.polls,
        responseStatus: body?.data?.status ?? null,
        responseMessage: body?.message ?? null,
        tileCount: featureCount,
        capturedAt: new Date().toISOString(),
      },
    });
  }

  const fixture = {
    description:
      `Captured FortyGuard /v1/heatmap tile surfaces — ${hours.length} consecutive UTC hours ` +
      `on ${date} over a ${halfLonMetres * 2}m x ${halfLatMetres * 2}m AOI centred at ` +
      `${centre.latitude}, ${centre.longitude}. Each hourly 'aoi' is the verbatim map_data ` +
      `FeatureCollection returned by the API.`,
    provenance: "CAPTURED_FROM_LIVE_API",
    source: "FortyGuard /v1/heatmap (async activity_id + /v1/status polling)",
    captureScript: "scripts/capture-fixtures.mjs hourly-surface",
    capturedAt: new Date().toISOString(),
    granularityMetres: granularity,
    tilePropertyKeys: ["tile_id", "average_temperature", "min_temperature", "max_temperature"],
    aoiRequested: aoi,
    hourlySnapshots: snapshots,
  };

  const outPath = resolve(FIXTURES, "heatmap_hourly_captured.json");
  mkdirSync(FIXTURES, { recursive: true });
  writeFileSync(outPath, JSON.stringify(fixture, null, 2) + "\n", "utf8");
  log(`\n  saved tests/fixtures/heatmap_hourly_captured.json`);
  log(`  ${snapshots.length} hours, ${snapshots[0].aoi.features.length} tiles/hour, ${(statSync(outPath).size / 1048576).toFixed(2)} MB`);
  return fixture;
}

const COMMANDS = {
  usage: captureUsage,
  "heatmap-ft1": captureHeatmapFt1,
  "heatmap-ft2": captureHeatmapFt2,
  "heatmap-probe": captureHeatmapProbe,
  "hourly-surface": captureHourlySurface,
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
