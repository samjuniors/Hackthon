# FortyGuard Integration & Reconnaissance Specifications

**Status:** VERIFIED LIVE & EVIDENCE GATE LOCKED  
**Last Updated:** 2026-08-29  
**Milestone:** M4 — Evidence Gates & Vertical Slice 1  

---

## 0. Provider Contract — Three Layers (NEVER conflated)

Any AOI/temporal limit the product enforces is resolved against these three
DISTINCT layers, in this order:

### Layer 1 — DOCUMENTED PROVIDER LIMIT (official docs — the baseline)

Verified live on **2026-08-28** against the official API documentation
(`https://docs-api.fortyguard.com/docs/create-heatmap` and
`/docs/limitations`):

| Constraint | Documented value |
| :--- | :--- |
| Heatmap max area | **API Basic = 10 mi² · API Premium = 50 mi² · API Startup = 10 mi²** |
| Granularity | 60m / 80m / 100m |
| filter_type | 1 (Single Hour) · 2 (Range of Hours, same day, **max 23h**, end_time required) · 3 (Single Day) |
| Date range | **2019-01-01 through now + 12h** (earlier / further → HTTP 400, not charged) |
| Forecast | up to **+12 hours** past the current time |
| Regional coverage | **United States only** (current release, all plans) |
| polygon_aoi | GeoJSON FeatureCollection with a closed Polygon |
| Credits | deducted only on Completed activities; constraint violations (400) are never charged |

The stale **150 mi²** assumption is permanently retired — tests
(`tests/provider-plan-limits.test.ts`) guard that it never resurfaces as an
active limit in executable code.

### Layer 2 — EMPIRICALLY VERIFIED ACCOUNT CAPABILITY (this repo's evidence)

See §1–§3 below: the Hackathon account's wire behavior (async
activity polling, filter_type-1 hourly requests, env_params `analysis`
requirement). The account's key-usage endpoint does **NOT** expose an AOI area
limit — verified live.

### Layer 3 — CURRENT LIVE ACCOUNT STATE (runtime probe)

`probeProviderCapability()` (free `POST /v1/system/fetch-api-key-usage`)
surfaces the ACTIVE plan name + credit ledger. The APPLICABLE AOI limit is
resolved from the live plan name against Layer 1
(`resolveApplicableAoiLimit()` in `src/lib/fortyguard/plan-limits.ts`):

- Plan contains “premium” → documented Premium limit (50 mi²).
- Plan contains “basic” / “startup” → documented limit (10 mi²).
- Anything else — including **“Hackathon”** — → the plan's own area limit is
  **UNKNOWN**; the CONSERVATIVE documented ceiling (**10 mi²**, the smallest
  documented plan limit) is enforced and labelled `conservative` — the account
  is never silently represented as “Basic”.

The UI (rail pre-flight, Settings drawer) shows the resolved limit with an
honest label — for the Hackathon account: "Conservative documented FortyGuard
limit: 10 mi² (this plan's own area limit is UNKNOWN)" — never a fabricated
`confirmed` claim and never a misleading "Basic" account claim.

---

## 1. Verified Account & Capability Matrix

- **Account Plan:** `Hackathon` (Active: Aug 20, 2026 – Sep 24, 2026)
- **Credit Allocation:** `2,000,000` total credits (Verified live authentication via `/v1/system/fetch-api-key-usage`).
- **Authentication Scheme:** HTTP Header `api-key: <KEY>`.
- **Base URL:** `https://api.fortyguard.com`

**Current live account state (probed 2026-08-29 via the zero-credit
`fetch-api-key-usage` endpoint):** the key configured in this environment is
**credit-exhausted** — `6,994,120` cycle credits used against the `2,000,000`
allocation (remaining `-4,994,120`), billed across `1,656` heatmap activities
plus `2` env_params activities. Every `/v1/heatmap` request returns HTTP 402
verbatim: *"Insufficient credits: this request costs 4220 credits and 0 remain
on your API key."* The application surfaces this as
`FORTYGUARD_CREDITS_EXHAUSTED` with the provider text quoted — never a silent
DEMO fallback, and the failed analysis is never saved to history. (The
production deployment's key — a separate credited key observed 2026-08-28 —
verified the LIVE pipeline end-to-end: 1 km AOI @ 60 m → 187 cells; 2 km span
→ 905 cells.)

Per-call credit costs are **empirical, not documented**: the provider docs
state only that credits are deducted on Completed activities. Observed:
heatmap `4,220` per completed call (consistent across three AOI sizes; the
ledger average `6,988,320 / 1,656 = 4,220.6` agrees); env_params `2,900` per
call (`5,800` across 2 calls). The earlier `2,000`-per-call figure was an
unverified assumption and is retired.

---

## 2. Evidence Gate Results (Empirical Verification)

### GATE 1 — `filter_type 2` Schema & Strategy
- **Observed Behavior:** Multi-hour range queries (`filter_type: 2`) perform asynchronous multi-hour surface aggregation.
- **Decision:** For candidate-window sliding evaluation (which requires hour-by-hour temporal resolution), every evaluated hour is its own single-hour request (`filter_type: 1`, UTC date/hour — the verified wire contract; the default time mode is single-hour, i.e. exactly one heatmap request per Generate). Repeat requests are served from the session-level deterministic request-identity cache (`buildHeatmapCacheKey` in `src/lib/fortyguard/adapter.ts` — AOI geometry + date/time + filter_type + granularity + analytic parameters) instead of creating another billable activity.

### GATE 2 — `average_temperature` Semantics (Reconciled & Gated)
- **Property in Payload:** `average_temperature` (accompanied by `min_temperature` and `max_temperature`) in GeoJSON feature properties.
- **Observed Definition:** Represents FortyGuard modeled mean thermal temperature (°C) for the GeoJSON polygon tile.
- **Semantic Classification:** `UNKNOWN — VERIFY` (Physical measurement level). The API payload metadata does not specify sensor height or physical surface level. The FortyGuard Participant Handbook describes FortyGuard LTMs as predicting ambient air temperature at human/pedestrian height (~2m), whereas prior assumptions asserted land surface skin temperature (LST).
- **Rule:** The system treats `average_temperature` as a relative tile-level thermal baseline without asserting medical safety or unverified physical sensor heights. Derived tile statistics must strictly carry provenance `DERIVED` or `PREDICTED`, never `OBSERVED`.

### GATE 3 — `/v1/env_params` Parameters & Temperature Composition
- **Required Field:** Empirical testing revealed `/v1/env_params` requires the `analysis` array parameter (e.g., `["heat_index_celsius", "apparent_temperature_celsius", "wet_bulb_temperature_celsius", "relative_humidity_percent"]`). Without `analysis`, requests transition immediately to `Failed`.
- **Physics Solver Boundary:** Temperature inputs out of physical boundary for target timestamp/location are rejected by the solver. `/v1/env_params` functions as optional point enrichment rather than a spatial wet-bulb generator.

---

## 3. Verified Endpoint Directory

| Endpoint | Method | Key Capabilities Verified | Credit Cost | Execution Pattern |
| :--- | :--- | :--- | :--- | :--- |
| `/v1/heatmap` | `POST` | GeoJSON polygon tiles (`60m`, `80m`, `100m`). Supports single-hour snapshot (`filter_type: 1`), multi-hour range (`filter_type: 2`). Analytic types: `tcm`, `time_of_measure`, `exceedance`, `persistence`. Forecast: Up to +12 hours. | `4,220` / completed call *(empirical — see §1)* | Async (`activity_id` $\to$ Polling) |
| `/v1/env_params` | `POST` | Point metrics: Wet-Bulb Temp (°C), Heat Index (°C), Apparent Temp (°C), Relative Humidity (%), US AQI, Solar Irradiance. Requires `analysis` array. | `2,900` / call *(empirical — see §1)* | Async (`activity_id` $\to$ Polling) |
| `/v1/status/{activity_id}` | `GET` | Universal status polling endpoint (`Processing`, `Completed`, `Failed`). | `0` | Synchronous polling |
| `/v1/system/fetch-api-key-usage` | `POST` | Credit usage, active plan status, and per-activity usage metrics. Requires `api_key` in request body. | `0` | Synchronous |

Credit costs in this table are **empirically observed** (ledger totals ÷ call
counts; the verbatim 402 message quotes `4220`), **not documented** — the
provider docs specify only that credits are deducted on Completed activities
and that constraint violations (400) are never charged.
