import { type DataProvenance } from './provenance';

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
  recommendedWindow: CandidateWindow & { exposureScore: number };
  rankedWindows: Array<CandidateWindow & { exposureScore: number; rank: number; isFeasible: boolean }>;
  rejectedWindows: Array<CandidateWindow & { reason: string }>;
  evidenceBundle: EvidenceBundle;
  modelVersion: 'v1.0.0-spatial-thermal-baseline';
}
