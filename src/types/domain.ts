import { DataProvenance } from './provenance';

export interface LocationPoint {
  latitude: number;
  longitude: number;
}

export interface PolygonAOI {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: Record<string, unknown>;
    geometry: {
      type: 'Polygon';
      coordinates: number[][][];
    };
  }>;
}

export type TargetArea = LocationPoint | PolygonAOI;

export interface NormalizedThermalObservation {
  timestamp: string; // ISO 8601 UTC
  location: LocationPoint;
  sourceEndpoint: string;
  metrics: {
    temperatureCelsius?: number;
    tileAverageTemperatureCelsius?: number;
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
  dataResolutionHours: number; // CandidateWindowStep = DATA_RESOLUTION
}

export interface ExposureResult {
  score: number; // Modeled thermal exposure score (lower is better)
  metricBreakdown: Record<string, number>;
  modelVersion: string;
  evidenceReferences: string[];
}

export interface ExposureModel {
  readonly modelVersion: string;
  readonly requiredInputs: readonly string[];
  evaluate(observations: NormalizedThermalObservation[], window: CandidateWindow): ExposureResult;
}

export interface EvidenceBundle {
  sourceEndpoint: string;
  requestLocation: TargetArea;
  requestTimeRange: { start: string; end: string; timezone: string };
  observationTimestamp: string;
  units: { temperature: 'celsius'; duration: 'hours' };
  observedValues: Record<string, number | null>;
  derivedValues: Record<string, number | null>;
  modelVersion: string;
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
  modelVersion: string;
}
