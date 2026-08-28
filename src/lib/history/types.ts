/**
 * ANALYSIS HISTORY — typed record schema (browser-local IndexedDB persistence).
 *
 * A history record is a COMPLETE, reproducible thermal analysis: the thermal
 * FeatureCollection is AUTHORITATIVE for the restored analysis (Phase 10) —
 * restoring never re-queries FortyGuard, never recalculates thermal cells,
 * and never fabricates candidates.
 *
 * PROVENANCE RULES (Phase 8):
 *   - LIVE records are labelled "FortyGuard" — fresh provider data at
 *     analysis time.
 *   - DEMO records are labelled "Captured FortyGuard" — a verbatim replay of
 *     a captured response. A replay is NEVER implied to be fresh provider
 *     data.
 *   - No API keys, tokens, or secrets are ever stored (structural guarantee:
 *     the record builder only copies the fields below — nothing else).
 */
import type {
  PolygonAOI,
  CandidateLocation,
  DecisionResult,
  SpatialDecisionResult,
  JointDecisionResult,
  ScenarioAnalysisResult,
} from '@/types/domain';
import type { DecisionExplanation } from '@/types/explanation';
import type { DataSourceMode } from '@/types/provenance';
import type { AnalysisTemporalInput } from '@/lib/temporal/analysis-window';
import type { AnalysisAreaShape } from '@/lib/spatial/aoi';

/** Record schema version — bump on breaking changes with a migration. */
export const HISTORY_RECORD_VERSION = 1 as const;

/** Client-side cap for completed analyses (Phase 9). Oldest evicted first. */
export const HISTORY_MAX_RECORDS = 20 as const;

/** Temporal provenance echoed from the decision API response. */
export interface HistoryTemporalProvenance {
  input: AnalysisTemporalInput;
  allowedStartUtc?: string;
  allowedEndUtc?: string;
  durationHours?: number;
  timezone?: string;
  isFixtureCapture?: boolean;
  providerRequests?: {
    strategy?: string;
    filterType?: number | null;
    hourlyRequestCount?: number;
    description?: string;
  };
}

export interface HistoryProvenance {
  /** LIVE | FIXTURE — the data source mode the analysis ran in. */
  dataSource: DataSourceMode;
  /** "FortyGuard" (LIVE) | "Captured FortyGuard" (DEMO) — never ambiguous. */
  providerLabel: string;
  /** FortyGuard activity ID when available (LIVE: last completed /v1/heatmap activity; DEMO: the original capture activity). */
  activityId: string | null;
  /** DEMO only — when the underlying capture was taken (null for LIVE). */
  capturedAt: string | null;
  /** When THIS analysis completed (=== record.createdAt). */
  analyzedAt: string;
  /** Echo of the API response's temporal provenance (wire honesty record). */
  temporalProvenance: HistoryTemporalProvenance | null;
  /** One-line human description of where the thermal data came from. */
  description: string;
}

/** Where the analysis ran (subset of NamedLocation — persisted shape). */
export interface HistoryLocation {
  name: string;
  latitude: number;
  longitude: number;
  timezone: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

export interface HistorySpatialFieldMetadata {
  baseTimestamp: string;
  coverageType: string;
  description: string;
  totalEvaluatedHours: number;
}

/** A completed analysis snapshot — everything needed to restore it verbatim. */
export interface HistoryRecord {
  id: string;
  version: typeof HISTORY_RECORD_VERSION;
  /** ISO timestamp when the analysis COMPLETED (not when Generate started). */
  createdAt: string;
  /** Where the analysis ran. */
  location: HistoryLocation;
  /** The EXACT analysis AOI geometry (rendered == submitted == restored). */
  aoiGeometry: PolygonAOI;
  /** 'polygon' | 'circle'. */
  aoiShape: AnalysisAreaShape;
  /** AOI size in metres (span for LIVE; capture width for DEMO). */
  aoiSpanMetres: number | null;
  /** Human size label, e.g. "1km × 1km" or "2.4km × 2.4km captured area". */
  aoiSizeLabel: string;
  /** Explicit WHEN inputs the analysis ran with. */
  temporalInput: AnalysisTemporalInput;
  /** IANA timezone the analysis ran in. */
  timezone: string;
  /** LIVE | FIXTURE. */
  dataSourceMode: DataSourceMode;
  /** FortyGuard activity ID when available. */
  providerActivityId: string | null;
  /** Thermal cell resolution the analysis ran with (60 | 80 | 100). */
  granularity: number;
  /** The AUTHORITATIVE thermal FeatureCollection (verbatim provider cells). */
  thermalField: PolygonAOI | null;
  /** Feature count of thermalField (fast list rendering without hydrating). */
  thermalCellCount: number;
  /** Snapshot metadata from the API response. */
  spatialFieldMetadata: HistorySpatialFieldMetadata | null;
  /** Candidate sites the analysis evaluated. */
  candidates: CandidateLocation[];
  /** Full decision results (verbatim from the completed analysis). */
  decision: DecisionResult | null;
  spatialDecision: SpatialDecisionResult | null;
  jointDecision: JointDecisionResult | null;
  scenarioAnalysis: ScenarioAnalysisResult | null;
  /** AI/deterministic explanation (upserted when it arrives after save). */
  explanation: DecisionExplanation | null;
  /** Provenance metadata (Phase 8 — makes the data source obvious). */
  provenance: HistoryProvenance;
}

/** Everything the record builder needs from the completed analysis. */
export interface CompletedAnalysisInput {
  createdAt?: string;
  location: HistoryLocation;
  aoiGeometry: PolygonAOI;
  aoiShape: AnalysisAreaShape;
  aoiSpanMetres: number | null;
  aoiSizeLabel: string;
  temporalInput: AnalysisTemporalInput;
  timezone: string;
  dataSourceMode: DataSourceMode;
  providerActivityId: string | null;
  granularity: number;
  thermalField: PolygonAOI | null;
  spatialFieldMetadata: HistorySpatialFieldMetadata | null;
  candidates: CandidateLocation[];
  decision: DecisionResult | null;
  spatialDecision: SpatialDecisionResult | null;
  jointDecision: JointDecisionResult | null;
  scenarioAnalysis: ScenarioAnalysisResult | null;
  explanation: DecisionExplanation | null;
  temporalProvenance: HistoryTemporalProvenance | null;
  /** DEMO only — ISO timestamp of the underlying capture. */
  capturedAt?: string | null;
}
