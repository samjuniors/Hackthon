# FortyGuard Integration & Reconnaissance Specifications

**Status:** VERIFIED & COMPLIANT  
**Last Updated:** 2026-08-20  
**Milestone:** M3.5 — Env Params Semantics & Exposure Model Evidence Gate  

---

## 1. Verified Account & Capability Matrix

- **Account Plan:** `Hackathon` (Active: Aug 20, 2026 – Sep 24, 2026)
- **Credit Allocation:** `2,000,000` total credits (Verified remaining: `1,986,880` credits after testing).
- **Authentication Scheme:** HTTP Header `api-key: <KEY>`.
- **Base URL:** `https://api.fortyguard.com`

---

## 2. Verified Endpoint Directory

| Endpoint | Method | Key Capabilities Verified | Credit Cost | Execution Pattern |
| :--- | :--- | :--- | :--- | :--- |
| `/v1/heatmap` | `POST` | GeoJSON polygon tiles (`60m`, `80m`, `100m`). Supports single-hour snapshot (`filter_type: 1`), multi-hour range (`filter_type: 2`), single-day (`filter_type: 3`), range of days (`filter_type: 4`). Analytic types: `tcm`, `time_of_measure`, `exceedance`, `persistence`. Forecast: Up to +12 hours past current time. | `2,000` / call | Async (`activity_id` $\to$ Polling) |
| `/v1/env_params` | `POST` | Point metrics: Wet-Bulb Temp (°C), Heat Index (°C), Apparent Temp (°C), Relative Humidity (%), US AQI (PM2.5, PM10, NO₂, CO, O₃, SO₂), Solar Irradiance (GHI, DNI, DHI W/m²). Accepts reference `temperature` anchor and forecast timestamp. | `2,000` / call | Async (`activity_id` $\to$ Polling) |
| `/v1/satellite` | `POST` | Satellite imagery land-cover & vegetation segmentation. | `2,000` / call | Async (`activity_id` $\to$ Polling) |
| `/v1/streetview` | `POST` | Ground-level street view segmentation (facades, road surface, shade, vegetation). | `2,000` / call | Async (`activity_id` $\to$ Polling) |
| `/v1/heat_intelligence` | `POST` | Comprehensive PDF intelligence reports. | `5,000` / call | Async (`activity_id` $\to$ Polling) |
| `/v1/status/{activity_id}` | `GET` | Universal status polling endpoint (`Processing`, `Completed`, `Failed`). | `0` | Synchronous polling |
| `/v1/system/fetch-api-key-usage` | `POST` | Credit usage, active plan status, and per-activity usage metrics. | `0` | Synchronous |

---

## 3. `/v1/env_params` Semantics & Verification (`VERIFIED LIVE`)

- **Reference Temperature Input:** The required `temperature` parameter serves as the reference thermal anchor for the specified coordinate (`latitude`, `longitude`) and timestamp (`start_date`, `start_time`).
- **Calculated Environmental Physics:** Based on the reference temperature and timestamp, FortyGuard computes non-linear environmental metrics:
  - `heat_index_celsius`
  - `apparent_temperature_celsius`
  - `wet_bulb_temperature_celsius`
  - `relative_humidity_percent`
  - `solar_irradiance` profile (`ghi`, `dni`, `dhi` in W/m²)
  - Air quality index breakdown (PM2.5, PM10, NO₂, CO, O₃, SO₂, Methane, CO₂).
- **Forecast Verification:** Verified live that `/v1/env_params` supports future forecast timestamps up to +12 hours from current UTC time.
- **Adapter Enrichment Boundary:** The FortyGuard adapter treats `/v1/env_params` as an **optional enrichment layer**. Core candidate window ranking operates on verified heatmap telemetry (`average_temperature` / `max_temperature` per tile) so the engine functions deterministically even if `/v1/env_params` is omitted or unavailable.

---

## 4. Hourly Forecast Retrieval Strategy

- **Single-Hour Forecast Snapshots (`filter_type: 1`):** Submits discrete 1-hour heatmap snapshot requests for each hour in the permissible operating period.
- **In-Memory Session Caching:** Hourly snapshots are downloaded once per session and stored in-memory by request parameter hash `(location, date, hour)`.
- **Local Scenario Recalculation:** Local what-if parameter changes (changing operation duration, shifting allowed bounds) re-evaluate candidate windows locally using cached hourly telemetry without repeating FortyGuard API submissions.
