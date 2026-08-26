import { type DataProvenance, type DataSourceMode } from './provenance';

export interface LocationPoint {
  latitude: number;
  longitude: number;
}

export interface PolygonAOI {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: {
      tile_id?: number | string;
      average_temperature?: number;
      min_temperature?: number;
      max_temperature?: number;
      [key: string]: unknown;
    };
    geometry: {
      type: 'Polygon' | 'MultiPolygon';
      coordinates: number[][][] | number[][][][];
    };
  }>;
}

export type TargetArea = LocationPoint | PolygonAOI;

export interface TileFeature {
  tileId: string | number;
  averageTemperatureCelsius: number;
  minTemperatureCelsius: number;
  maxTemperatureCelsius: number;
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
}

export interface NormalizedThermalObservation {
  timestamp: string; // ISO 8601 UTC
  location: LocationPoint;
  selectedTileId: string | number;
  sourceEndpoint: string;
  dataSource: DataSourceMode;
  metrics: {
    temperatureCelsius: number; // Location-specific average_temperature
    tileMinTemperatureCelsius?: number;
    tileMaxTemperatureCelsius?: number;
    wetBulbTemperatureCelsius?: number;
    apparentTemperatureCelsius?: number;
    heatIndexCelsius?: number;
    relativeHumidityPercent?: number;
    solarGhiWattsPerSqM?: number;
    solarDniWattsPerSqM?: number;
    solarDhiWattsPerSqM?: number;
  };
  provenance: DataProvenance;
}

export interface CandidateWindow {
  windowId: string;
  startTime: string; // ISO 8601 UTC
  endTime: string;   // ISO 8601 UTC
  durationHours: number;
}

export interface DecisionConstraints {
  allowedStart: string; // ISO 8601 UTC
  allowedEnd: string;   // ISO 8601 UTC
  durationHours: number;
  dataResolutionHours: number; // CandidateWindowStep = DATA_RESOLUTION (1h)
}

export interface ExposureResult {
  score: number; // Mean temperature for selected tile across candidate window (°C)
  metricBreakdown: {
    meanTemperatureCelsius: number;
    hourCount: number;
  };
  modelVersion: 'v1.0.0-spatial-thermal-baseline';
  evidenceReferences: string[];
}

export interface ExposureModel {
  readonly modelVersion: 'v1.0.0-spatial-thermal-baseline';
  readonly requiredInputs: readonly string[];
  evaluate(observations: NormalizedThermalObservation[], window: CandidateWindow): ExposureResult;
}

export interface EvidenceBundle {
  dataSource: DataSourceMode;
  sourceEndpoint: string;
  requestLocation: LocationPoint;
  selectedTileId: string | number;
  requestTimeRange: { start: string; end: string; timezone: string };
  observationTimestamp: string;
  units: { temperature: 'celsius'; duration: 'hours' };
  observedValues: Record<string, number | null>;
  derivedValues: Record<string, number | null>;
  modelVersion: 'v1.0.0-spatial-thermal-baseline';
  candidateWindows: Array<{
    windowId: string;
    startTime: string;
    endTime: string;
    exposureScore: number;
    rank: number;
    isFeasible: boolean;
  }>;
  recommendation: {
    recommendedWindowId: string;
    startTime: string;
    endTime: string;
    exposureScore: number;
  };
}

export interface DecisionResult {
  dataSource: DataSourceMode;
  recommendedWindow: CandidateWindow & { exposureScore: number };
  rankedWindows: Array<CandidateWindow & { exposureScore: number; rank: number; isFeasible: boolean }>;
  rejectedWindows: Array<CandidateWindow & { reason: string }>;
  evidenceBundle: EvidenceBundle;
  modelVersion: 'v1.0.0-spatial-thermal-baseline';
}

// ==========================================
// Milestone 5: Spatial Decision Domain Types
// ==========================================

export interface CandidateLocation {
  locationId: string;
  name: string;
  location: LocationPoint;
}

export interface HourlyTileTemperature {
  timestamp: string; // ISO 8601 UTC
  temperatureCelsius: number;
  provenance: 'DERIVED';
  tileId: string | number;
  evidenceReference?: string;
}

export interface RankedLocationResult {
  rank: number;
  locationId: string;
  name: string;
  location: LocationPoint;
  tileId: string | number;
  exposureScore: number;
  deltaVsBest: number;
  status: 'Feasible' | 'Infeasible';
  thermalValues: HourlyTileTemperature[];
}

export interface SpatialDecisionResult {
  decisionType: 'SPATIAL_LOCATION_CHOICE';
  recommendedLocation: RankedLocationResult;
  rankedLocations: RankedLocationResult[];
  timeWindow: {
    startTime: string; // ISO 8601 UTC
    endTime: string;   // ISO 8601 UTC
    durationHours: number;
  };
  dataSource: DataSourceMode;
  modelVersion: 'v1.0.0-spatial-thermal-baseline';
  spatialFieldMetadata: {
    baseTimestamp: string;
    coverageType: 'BASE_TIMESTAMP_SNAPSHOT';
    totalEvaluatedHours: number;
    description: string;
  };
  evidenceBundle: {
    candidateCount: number;
    sourceEndpoint: string;
    dataSource: DataSourceMode;
    provenance: 'DERIVED';
    evaluatedWindow: CandidateWindow;
  };
}

// ==========================================
// Milestone 6: Joint Decision Domain Types
// ==========================================

export interface CandidatePlan {
  planId: string;
  rank: number;
  location: CandidateLocation;
  window: CandidateWindow;
  tileId: string | number;
  exposureScore: number;
  deltaVsBest: number;
  status: 'Optimal' | 'Feasible' | 'Infeasible';
  thermalValues: HourlyTileTemperature[];
}

export interface JointDecisionResult {
  decisionType: 'JOINT_SPATIAL_TEMPORAL_PLAN';
  recommendedPlan: CandidatePlan;
  rankedPlans: CandidatePlan[];
  searchSpace: {
    locationCount: number;
    windowCount: number;
    totalEvaluatedPlans: number;
  };
  dataSource: DataSourceMode;
  modelVersion: 'v1.0.0-spatial-thermal-baseline';
  spatialFieldMetadata: {
    baseTimestamp: string;
    coverageType: 'BASE_TIMESTAMP_SNAPSHOT';
    totalEvaluatedHours: number;
    description: string;
  };
  evidenceBundle: {
    candidateCount: number;
    windowCount: number;
    sourceEndpoint: string;
    dataSource: DataSourceMode;
    provenance: 'DERIVED';
  };
}

// ==========================================
// Milestone 7: What-If Scenario Domain Types
// ==========================================

export type ScenarioConstraintType = 'TEMPORAL_SHIFT' | 'LOCATION_LOCK' | 'DURATION_EXPANSION';
export type ScenarioStatus = 'FEASIBLE' | 'INFEASIBLE';

export interface WhatIfScenarioResult {
  scenarioId: string;
  scenarioName: string;
  constraintType: ScenarioConstraintType;
  constraintDescription: string;
  baselinePlan: CandidatePlan;
  constrainedPlan: CandidatePlan | null;
  costOfConstraintCelsius: number | null; // E(P') - E(P0)
  locationShifted: boolean;
  windowShifted: boolean;
  durationChanged: boolean;
  status: ScenarioStatus;
  infeasibleReason?: string;
}

export interface ScenarioAnalysisResult {
  baselinePlan: CandidatePlan;
  scenarios: WhatIfScenarioResult[];
  dataSource: DataSourceMode;
  modelVersion: 'v1.0.0-spatial-thermal-baseline';
}




