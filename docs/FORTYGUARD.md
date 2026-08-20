# FortyGuard Integration & Reconnaissance Specifications

**Status:** VERIFIED & COMPLIANT  
**Last Updated:** 2026-08-20  
**Milestone:** M3 Approval — Hourly Forecast Retrieval Verification  

---

## 1. Verified Account & Capability Matrix

- **Account Plan:** `Hackathon` (Active: Aug 20, 2026 – Sep 24, 2026)
- **Credit Allocation:** `2,000,000` total credits (Verified remaining: `1,988,880` credits after reconnaissance testing).
- **Authentication Scheme:** HTTP Header `api-key: <KEY>` (No OAuth token exchange needed).
- **Base URL:** `https://api.fortyguard.com`

---

## 2. Verified Endpoint Directory

| Endpoint | Method | Key Capabilities Verified | Credit Cost | Execution Pattern |
| :--- | :--- | :--- | :--- | :--- |
| `/v1/heatmap` | `POST` | GeoJSON polygon tiles (`60m`, `80m`, `100m`). Supports single-hour snapshot (`filter_type: 1`), multi-hour range (`filter_type: 2`), single-day (`filter_type: 3`), range of days (`filter_type: 4`). Analytic types: `tcm`, `time_of_measure`, `exceedance`, `persistence`. Forecast: Up to +12 hours past current time. | `2,000` / call | Async (`activity_id` $\to$ Polling) |
| `/v1/env_params` | `POST` | Point metrics: Wet-Bulb Temp (°C), Heat Index (°C), Apparent Temp (°C), Relative Humidity (%), US AQI (PM2.5, PM10, NO₂, CO, O₃, SO₂), Solar Irradiance (GHI, DNI, DHI W/m²). | `2,000` / call | Async (`activity_id` $\to$ Polling) |
| `/v1/satellite` | `POST` | Satellite imagery land-cover & vegetation segmentation. | `2,000` / call | Async (`activity_id` $\to$ Polling) |
| `/v1/streetview` | `POST` | Ground-level street view segmentation (facades, road surface, shade, vegetation). | `2,000` / call | Async (`activity_id` $\to$ Polling) |
| `/v1/heat_intelligence` | `POST` | Comprehensive PDF intelligence reports. | `5,000` / call | Async (`activity_id` $\to$ Polling) |
| `/v1/status/{activity_id}` | `GET` | Universal status polling endpoint (`Processing`, `Completed`, `Failed`). | `0` | Synchronous polling |
| `/v1/system/fetch-api-key-usage` | `POST` | Credit usage, active plan status, and per-activity usage metrics. | `0` | Synchronous |

---

## 3. Hourly Forecast Retrieval Contract (`VERIFIED LIVE`)

### 3.1 Single-Hour Forecast Snapshots (`filter_type: 1`)
- **Request Parameters:**
  ```json
  {
    "polygon_aoi": { ... },
    "date_time": {
      "start_date": "2026-08-20",
      "start_time": "10:00",
      "filter_type": 1
    },
    "granularity": 100
  }
  ```
- **Behavior:** Submits an async request for a single discrete forecast hour. Returns a GeoJSON `FeatureCollection` where every tile feature contains `average_temperature`, `min_temperature`, and `max_temperature` in °C for that specific 1-hour snapshot.
- **Lead Time Limit:** Requests up to +12 hours from current UTC time succeed. Dates $>12$ hours into the future fail validation with HTTP 400.

### 3.2 Range of Hours Forecast Requests (`filter_type: 2`)
- **Request Parameters:**
  ```json
  {
    "polygon_aoi": { ... },
    "date_time": {
      "start_date": "2026-08-20",
      "start_time": "10:00",
      "end_time": "13:00",
      "filter_type": 2
    },
    "granularity": 100
  }
  ```
- **Behavior:** Evaluates thermal metrics across the specified multi-hour range in a single submission. Returns a single GeoJSON `FeatureCollection` containing tile-level aggregate metrics over the range (`min_temperature`, `max_temperature`, `average_temperature`).
- **Credit Efficiency:**
  - Option A (Range Request): **1 API call** (2,000 credits) evaluates an entire 3-hour operation window.
  - Option B (Discrete Hourly Snapshots): **3 API calls** (6,000 credits) retrieve individual 1-hour snapshots for discrete hourly evaluation.

---

## 4. Verified Data Provenance Rules

- `OBSERVED`: Raw point API telemetry (e.g. `/v1/env_params` point readings).
- `DERIVED`: Tile aggregations computed from heatmap telemetry (e.g. `average_temperature`). Derived metrics are **NEVER** labeled `OBSERVED`.
- `PREDICTED`: FortyGuard forecast intervals (+12h horizon).
- `ASSUMED`: User scenario input parameters (duration, bounds).
- `AI_GENERATED_EXPLANATION`: Grounded LLM narrative outputs.
