# FortyGuard API Integration & Verified Capability Matrix

**Status:** VERIFIED (Milestone 1 API Reconnaissance Completed)  
**Last Updated:** 2026-08-20  

---

## 1. Overview & Authentication

- **Base URL:** `https://api.fortyguard.com`
- **Documentation Portal:** `https://docs-api.fortyguard.com/docs/`
- **Authentication Scheme:** HTTP Header `api-key: <YOUR_API_KEY>` (No OAuth token exchange required).
- **Execution Architecture:** Asynchronous submission pattern. All analysis endpoints return an `activity_id` immediately with HTTP 200, followed by polling `GET /v1/status/{activity_id}` until status reaches `Completed` or `Failed`.

---

## 2. Account & Plan Specifications (Verified Live)

- **Subscription Tier:** `Hackathon`
- **Total Credit Allocation:** `2,000,000` credits per cycle
- **Billing Period:** 2026-08-20 to 2026-09-24
- **Observed Credit Costs:**
  - Heatmap Generation: ~`4,220` credits per 100m AOI query
  - Environmental Parameters Analysis: ~`2,900` credits per query
- **Usage Endpoint:** `POST /v1/system/fetch-api-key-usage` (Payload: `{ "api_key": "<KEY>" }`)

---

## 3. Verified Endpoints & Capabilities

### 3.1 `POST /v1/heatmap` — High-Resolution Thermal Maps
- **Purpose:** Generates spatial thermal polygon grids based on FortyGuard's Large Temperature Models (LTMs).
- **Supported Granularities:** `60`m, `80`m, `100`m resolution.
- **Temporal Horizons:** `2019-01-01` through `+12 hours` into the future (forecast).
- **Filter Types (`date_time.filter_type`):**
  - `1` (Single Hour) — requires `start_date` (`YYYY-MM-DD`), `start_time` (`HH:MM`).
  - `2` (Range of Hours, same day) — requires `start_date`, `start_time`, `end_time`.
  - `3` (Single Day) — requires `start_date` (covers full 24h).
  - `4` (Range of Days) — requires `start_date`, `end_date` ($\le$ 1 month).
- **Analytic Types (`analytic_type`):**
  - `tcm` (Default) — Temperature snapshot per tile in °C.
  - `time_of_measure` — Hour of day (0–23 UTC) at which peak temperature occurs.
  - `exceedance` — Number of hours temperature exceeds `threshold` (default 30°C, direction `above`/`below`).
  - `persistence` — Longest continuous run of hours past `threshold`.
- **Output Schema (`data.result`):**
  - `map_data`: GeoJSON `FeatureCollection` with polygon features containing `tile_id`, `average_temperature`, `min_temperature`, `max_temperature`.
  - `stats_data`: Aggregate summary (`temperature_stats` [min, max, mean, std], `overall_temperature_distribution`, `normal_temperature_distribution` [probability density curve], `temperature_frequency` [histogram bins]).

### 3.2 `POST /v1/env_params` — Multidimensional Environmental Parameters
- **Purpose:** Point-based environmental, thermal stress, air quality, and solar irradiance metrics.
- **Required Parameters:** `latitude` (number), `longitude` (number), `temperature` (number, °C), `date_time` object.
- **Available Output Metrics:**
  - **Thermal & Human Comfort:** `heat_index_celsius`, `apparent_temperature_celsius`, `wet_bulb_temperature_celsius`, `relative_humidity_percent`, `precipitation_mm`, `cloud_cover_octas`, `elevation` (meters).
  - **Air Quality (US AQI) & Atmospheric Gases:** `air_quality:idx`, `air_quality_pm2p5:idx`, `air_quality_pm10:idx`, `air_quality_no2:idx`, `aqi_us_co`, `air_quality_o3:idx`, `air_quality_so2:idx`, `methane_ppb`, `co2_ppm`.
  - **Solar Irradiance:** `solar_irradiance.clear_sky` with `ghi` (Global Horizontal Irradiance, W/m²), `dni` (Direct Normal Irradiance), `dhi` (Diffuse Horizontal Irradiance), and explanatory descriptions.

### 3.3 `POST /v1/satellite` — Satellite Land Cover Segmentation
- **Purpose:** Analyzes satellite imagery at coordinate location to classify urban surfaces, vegetation, and land cover.
- **Parameters:** `sat: { latitude, longitude }`, `date_time`, `granularity` (60/80/100).
- **Output:** Base64 source imagery (`orignal_image`), segmentation mask (`image_content`), RGB legend (`image_legend`), and class coverage percentages (`segments`).

### 3.4 `POST /v1/streetview` — Street-Level Urban Feature Segmentation
- **Purpose:** Ground-level camera perspective analysis for building facades, road surfaces, shade, and vegetation.
- **Parameters:** `latitude`, `longitude`, `vertical_angle`, `horizontal_angle`, `back_view` (boolean).
- **Output:** Base64 front camera image, segmented mask, RGB legend, class coverage ratios (`segments`).

### 3.5 `POST /v1/heat_intelligence` — Comprehensive Intelligence Report
- **Purpose:** Multi-dimensional PDF report generation covering 5 analytics categories (`geographic`, `environmental`, `urban`, `events`, `anthropogenic`).
- **Output:** Returns JSON status with `data.result.download_link` (temporary signed PDF URL).

### 3.6 `GET /v1/status/{activity_id}` — Unified Status & Result Polling
- **Status States:** `Processing`, `Completed`, `Failed`.
- **Response Format:**
```json
{
  "error": false,
  "status_code": 200,
  "message": "Completed",
  "data": {
    "activity_id": "UUID_STRING",
    "status": "Completed",
    "result": { ... }
  }
}
```

---

## 4. Live Verified Sample Payloads

### 4.1 Environmental Parameters Response (`c09a950a-9f3a-42a3-bf7d-ef9037018e9b`)
```json
{
  "error": false,
  "status_code": 200,
  "message": "Completed",
  "data": {
    "activity_id": "c09a950a-9f3a-42a3-bf7d-ef9037018e9b",
    "status": "Completed",
    "result": {
      "metadata": {
        "timezone": "GMT-5",
        "timezone_offset_hours": -5,
        "time_range": { "start": "2024-07-15T14:00:00-05:00", "end": "2024-07-15T14:00:00-05:00", "interval": "1h", "count": 1 },
        "timestamps": [ "2024-07-15T14:00:00-05:00" ]
      },
      "locations": [
        {
          "lat": 40.7128,
          "lon": -74.006,
          "elevation": 32,
          "temperature": 30,
          "parameters": {
            "heat_index_celsius": [ 31.9 ],
            "apparent_temperature_celsius": [ 38.4 ],
            "relative_humidity_percent": [ 55.3 ],
            "precipitation_mm": [ 0 ],
            "cloud_cover_octas": [ 31 ],
            "wet_bulb_temperature_celsius": [ 26.6 ],
            "air_quality:idx": [ 121.5 ],
            "air_quality_pm2p5:idx": [ 77.9 ],
            "air_quality_pm10:idx": [ 30.9 ],
            "air_quality_no2:idx": [ 3.5 ],
            "aqi_us_co": [ 2.9 ],
            "air_quality_o3:idx": [ 121.5 ],
            "air_quality_so2:idx": [ 5.1 ],
            "methane_ppb": [ null ],
            "co2_ppm": [ null ]
          },
          "solar_irradiance": {
            "clear_sky": { "ghi": 820.64, "dni": 808.81, "dhi": 131.41 },
            "description": "Clear-sky solar energy profile (GHI, DNI, DHI)"
          }
        }
      ]
    }
  }
}
```

### 4.2 Heatmap GeoJSON Response (`cd28725e-26e8-46f8-b65f-18b9ea586813`)
```json
{
  "error": false,
  "status_code": 200,
  "message": "Completed",
  "data": {
    "activity_id": "cd28725e-26e8-46f8-b65f-18b9ea586813",
    "status": "Completed",
    "result": {
      "map_data": {
        "type": "FeatureCollection",
        "features": [
          {
            "id": "0",
            "type": "Feature",
            "properties": {
              "tile_id": 0,
              "average_temperature": 31.9139,
              "min_temperature": 31.9139,
              "max_temperature": 31.9139
            },
            "geometry": {
              "type": "Polygon",
              "coordinates": [
                [
                  [ -74.01648, 40.70661 ],
                  [ -74.01529, 40.70660 ],
                  [ -74.01528, 40.70749 ],
                  [ -74.01647, 40.70750 ],
                  [ -74.01648, 40.70661 ]
                ]
              ]
            }
          }
        ]
      },
      "stats_data": {
        "temperature_stats": {
          "minimum": 31.87,
          "maximum": 33.15,
          "mean": 32.24,
          "standard_deviation": 0.31
        },
        "temperature_frequency": {
          "x_axis": [ 32, 33 ],
          "y_axis": [ 111, 39 ]
        }
      }
    }
  }
}
```

---

## 5. Architectural Implications & Product Value Opportunities

1. **Rich Thermal Stress Telemetry Available:** With verified `wet_bulb_temperature_celsius`, `heat_index_celsius`, `apparent_temperature_celsius`, `relative_humidity_percent`, and `solar_irradiance` (GHI/DNI/DHI), we have rigorous scientific basis for human and operational thermal risk modeling.
2. **Standard GeoJSON FeatureCollection:** Heatmap responses use clean GeoJSON polygon tiles with temperature attributes, allowing direct rendering via standard map renderers (e.g. MapLibre GL, Leaflet, or Mapbox) with zero conversion overhead.
3. **Multi-Horizon & Analytic Heatmaps:** FortyGuard natively provides `exceedance` (hours over threshold) and `persistence` (longest heat streak), providing immediate inputs for operational decision rules and time-window optimization.
4. **Asynchronous Polling Adapter Pattern:** The system adapter must implement a robust exponential-backoff polling mechanism for `/v1/status/{activity_id}` with caching to conserve API credits.
