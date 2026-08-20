# FortyGuard Integration & Reconnaissance Specifications

**Status:** VERIFIED LIVE & EVIDENCE GATE LOCKED  
**Last Updated:** 2026-08-20  
**Milestone:** M4 — Evidence Gates & Vertical Slice 1  

---

## 1. Verified Account & Capability Matrix

- **Account Plan:** `Hackathon` (Active: Aug 20, 2026 – Sep 24, 2026)
- **Credit Allocation:** `2,000,000` total credits (Verified live authentication via `/v1/system/fetch-api-key-usage`).
- **Authentication Scheme:** HTTP Header `api-key: <KEY>`.
- **Base URL:** `https://api.fortyguard.com`

---

## 2. Evidence Gate Results (Empirical Verification)

### GATE 1 — `filter_type 2` Schema & Strategy
- **Observed Behavior:** Multi-hour range queries (`filter_type: 2`) perform asynchronous multi-hour surface aggregation.
- **Decision:** For candidate-window sliding evaluation (which requires hour-by-hour temporal resolution), single-hour snapshots (`filter_type: 1`) are retained and cached in-memory by `(location, date, hour)` hash.

### GATE 2 — `average_temperature` Semantics
- **Observed Definition:** Represents FortyGuard modeled mean surface thermal temperature (°C) for the GeoJSON polygon tile.
- **Strict Boundary:** It is explicitly NOT raw station temperature, ambient air temperature, or LST satellite surface temperature.

### GATE 3 — `/v1/env_params` Parameters & Temperature Composition
- **Required Field:** Empirical testing revealed `/v1/env_params` requires the `analysis` array parameter (e.g., `["heat_index_celsius", "apparent_temperature_celsius", "wet_bulb_temperature_celsius", "relative_humidity_percent"]`). Without `analysis`, requests transition immediately to `Failed`.
- **Physics Solver Boundary:** Temperature inputs out of physical boundary for target timestamp/location are rejected by the solver. `/v1/env_params` functions as optional point enrichment rather than a spatial wet-bulb generator.

---

## 3. Verified Endpoint Directory

| Endpoint | Method | Key Capabilities Verified | Credit Cost | Execution Pattern |
| :--- | :--- | :--- | :--- | :--- |
| `/v1/heatmap` | `POST` | GeoJSON polygon tiles (`60m`, `80m`, `100m`). Supports single-hour snapshot (`filter_type: 1`), multi-hour range (`filter_type: 2`). Analytic types: `tcm`, `time_of_measure`, `exceedance`, `persistence`. Forecast: Up to +12 hours. | `2,000` / call | Async (`activity_id` $\to$ Polling) |
| `/v1/env_params` | `POST` | Point metrics: Wet-Bulb Temp (°C), Heat Index (°C), Apparent Temp (°C), Relative Humidity (%), US AQI, Solar Irradiance. Requires `analysis` array. | `2,000` / call | Async (`activity_id` $\to$ Polling) |
| `/v1/status/{activity_id}` | `GET` | Universal status polling endpoint (`Processing`, `Completed`, `Failed`). | `0` | Synchronous polling |
| `/v1/system/fetch-api-key-usage` | `POST` | Credit usage, active plan status, and per-activity usage metrics. Requires `api_key` in request body. | `0` | Synchronous |
