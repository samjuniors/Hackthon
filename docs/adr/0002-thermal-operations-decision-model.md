# ADR 0002: Thermal Operations Decision Model & Scope Lock

**Status:** RECONCILED & HARDENED  
**Date:** 2026-08-20  
**Deciders:** Team / Lead Architect  

---

## 1. Context & Problem Statement

Following Milestone 1 API Reconnaissance, FortyGuard capabilities were confirmed (GeoJSON heatmap tiles, environmental parameters including wet-bulb and heat index, 12h forecasts). An adversarial decision-model review was conducted to harden the technical specifications, data provenance rules, exposure function contracts, and vertical slice boundaries prior to implementation (Milestone 3).

---

## 2. Key Architectural Decisions & Corrections

1. **Product Abstraction & Boundary:**
   - **Product Name:** Thermal Decision Engine.
   - **Product Abstraction:** Decision-intelligence system for *heat-exposed operations*.
   - **Demonstration Vertical:** Outdoor field operations (used as the primary demo scenario, NOT as the hard architectural boundary).
   - **Non-Claims:** The system explicitly does **NOT** claim medical safety, worker safety certification, heat injury prevention, or medical guarantees. All outputs represent *modeled thermal exposure* and relative operational burden.

2. **Data Provenance Rules:**
   - `OBSERVED`: Raw values obtained directly from an API response (e.g. point telemetry).
   - `DERIVED`: Values computed or aggregated from raw data (e.g. heatmap tile averages like `average_temperature`).
   - *Rule:* A derived tile aggregation must NEVER be labeled `OBSERVED`.

3. **Exposure Function Interface (`PROVISIONAL — MODEL TO BE DEFINED`):**
   - The mathematical formulation for exposure is explicitly marked `PROVISIONAL`.
   - The engine defines a pluggable deterministic interface: `evaluateExposure(observations, window, modelConfig)`.
   - No unverified composite formulas (TSI, wet-bulb approximations) are hardcoded into the domain model.

4. **Integration Dependency Resolution (`/v1/env_params`):**
   - `/v1/env_params` requires a `temperature` parameter input. Its semantic relationship to heatmap tile data remains `UNKNOWN — VERIFY`.
   - *Adapter Strategy:* The domain adapter makes `/v1/env_params` an optional enrichment layer rather than a blocking dependency for core decision ranking.
   - User-provided baseline measurement fallbacks are removed from the core architecture; MVP input must be 100% reproducible from verified API data.

5. **Scope & What-If Boundaries:**
   - **Removed:** Mitigation factors ($M$), shade/intervention simulation, satellite/streetview segmentation, PDF report generators, user accounts, DBs, Python services, Redis, queues, Kubernetes.
   - **Locked What-If Parameters:** Operation duration, permissible time-window bounds, selected location/zone.

6. **Slice 1 Focus (Temporal Decision on Single Location):**
   - Slice 1 optimizes across multiple candidate time windows for **ONE** selected location/AOI. Multi-location spatial optimization is deferred to Slice 2.

7. **API Credit Safety & Separation of Concerns:**
   - **Initial Data Acquisition:** Async FortyGuard API calls and bounded polling.
   - **Scenario Recalculation:** Local, deterministic, in-memory computation after data acquisition completes.

---

## 3. Status Summary

- **Product Direction:** `LOCKED`
- **MVP Boundary:** `LOCKED`
- **FortyGuard API Capabilities:** `VERIFIED`
- **Decision-Model Mathematical Formula:** `PROVISIONAL — MODEL TO BE DEFINED`
