import type {
  CandidateLocation,
  CandidatePlan,
  CandidateWindow,
  DecisionConstraints,
  DecisionResult,
  EvidenceBundle,
  ExposureResult,
  ExposureModel,
  HourlyTileTemperature,
  JointDecisionResult,
  LocationPoint,
  NormalizedThermalObservation,
  RankedLocationResult,
  SpatialDecisionResult,
} from '@/types/domain';
import type { DataSourceMode } from '@/types/provenance';
import {
  IncompleteTemporalCoverageError,
  InfeasibleConstraintsError,
  ValidationError,
} from '@/types/errors';



export const BASELINE_MODEL_VERSION = 'v1.0.0-spatial-thermal-baseline';

export class BaselineSpatialThermalEvaluator implements ExposureModel {
  readonly modelVersion = BASELINE_MODEL_VERSION;
  readonly requiredInputs = ['temperatureCelsius'] as const;

  /**
   * Calculates mean thermal exposure score for a single candidate window over observations.
   */
  evaluate(
    observations: NormalizedThermalObservation[],
    window: CandidateWindow
  ): ExposureResult {
    const windowStartMs = new Date(window.startTime).getTime();
    const windowEndMs = new Date(window.endTime).getTime();

    const inWindowObs = observations.filter((obs) => {
      const obsMs = new Date(obs.timestamp).getTime();
      return obsMs >= windowStartMs && obsMs < windowEndMs;
    });

    if (inWindowObs.length === 0) {
      throw new ValidationError(
        `No observations found for candidate window ${window.windowId} (${window.startTime} to ${window.endTime})`
      );
    }

    const totalTemp = inWindowObs.reduce(
      (sum, obs) => sum + obs.metrics.temperatureCelsius,
      0
    );
    const meanTemp = totalTemp / inWindowObs.length;

    return {
      score: Number(meanTemp.toFixed(2)),
      metricBreakdown: {
        meanTemperatureCelsius: Number(meanTemp.toFixed(2)),
        hourCount: inWindowObs.length,
      },
      modelVersion: BASELINE_MODEL_VERSION,
      evidenceReferences: inWindowObs.map(
        (obs) => `${obs.timestamp}:${obs.selectedTileId}`
      ),
    };
  }
}

/**
 * Generate candidate operating windows from allowed bounds and duration.
 */
export function generateCandidateWindows(
  constraints: DecisionConstraints
): CandidateWindow[] {
  const allowedStartMs = new Date(constraints.allowedStart).getTime();
  const allowedEndMs = new Date(constraints.allowedEnd).getTime();
  const durationMs = constraints.durationHours * 3600 * 1000;
  const stepMs = (constraints.dataResolutionHours || 1) * 3600 * 1000;

  if (isNaN(allowedStartMs) || isNaN(allowedEndMs)) {
    throw new ValidationError('Invalid allowedStart or allowedEnd timestamp format');
  }

  if (allowedEndMs - allowedStartMs < durationMs) {
    throw new InfeasibleConstraintsError(
      `Allowed window span (${(allowedEndMs - allowedStartMs) / 3600000}h) is shorter than required duration (${constraints.durationHours}h)`
    );
  }

  const windows: CandidateWindow[] = [];
  let index = 1;

  for (
    let startMs = allowedStartMs;
    startMs + durationMs <= allowedEndMs;
    startMs += stepMs
  ) {
    const endMs = startMs + durationMs;
    const startTimeStr = new Date(startMs).toISOString();
    const endTimeStr = new Date(endMs).toISOString();

    windows.push({
      windowId: `w-${String(index).padStart(3, '0')}`,
      startTime: startTimeStr,
      endTime: endTimeStr,
      durationHours: constraints.durationHours,
    });
    index++;
  }

  if (windows.length === 0) {
    throw new InfeasibleConstraintsError();
  }

  return windows;
}

/**
 * Execute full deterministic candidate decision pipeline for a target location.
 */
export function evaluateCandidateWindows(
  location: LocationPoint,
  observations: NormalizedThermalObservation[],
  constraints: DecisionConstraints,
  baseObservationTime: string
): DecisionResult {
  const evaluator = new BaselineSpatialThermalEvaluator();
  const windows = generateCandidateWindows(constraints);

  // Validate +12h forecast lead time boundary from base observation time
  const baseTimeMs = new Date(baseObservationTime).getTime();
  const maxAllowedForecastMs = baseTimeMs + 12 * 3600 * 1000;

  const obsMap = new Map<string, NormalizedThermalObservation>();
  for (const obs of observations) {
    obsMap.set(obs.timestamp, obs);
  }

  const evaluatedWindows: Array<{
    window: CandidateWindow;
    score: number;
    isFeasible: boolean;
    rejectReason?: string;
  }> = [];

  for (const window of windows) {
    const windowEndMs = new Date(window.endTime).getTime();

    if (windowEndMs > maxAllowedForecastMs) {
      evaluatedWindows.push({
        window,
        score: Infinity,
        isFeasible: false,
        rejectReason: 'Exceeds FortyGuard +12h forecast horizon',
      });
      continue;
    }

    try {
      const result = evaluator.evaluate(observations, window);
      evaluatedWindows.push({
        window,
        score: result.score,
        isFeasible: true,
      });
    } catch (err) {
      evaluatedWindows.push({
        window,
        score: Infinity,
        isFeasible: false,
        rejectReason: err instanceof Error ? err.message : 'Incomplete observations',
      });
    }
  }

  const feasible = evaluatedWindows.filter((w) => w.isFeasible);
  const rejected = evaluatedWindows.filter((w) => !w.isFeasible);

  if (feasible.length === 0) {
    if (rejected.some((r) => r.rejectReason?.includes('+12h'))) {
      throw new IncompleteTemporalCoverageError();
    }
    throw new InfeasibleConstraintsError();
  }

  // Sort feasible windows by score ASC (lowest exposure), then by startTime ASC
  feasible.sort((a, b) => {
    if (a.score !== b.score) {
      return a.score - b.score;
    }
    return new Date(a.window.startTime).getTime() - new Date(b.window.startTime).getTime();
  });

  const rankedWindows = feasible.map((item, idx) => ({
    ...item.window,
    exposureScore: item.score,
    rank: idx + 1,
    isFeasible: true,
  }));

  const best = rankedWindows[0];

  const firstObs = observations[0];
  const selectedTileId = firstObs ? firstObs.selectedTileId : 'unknown';
  const dataSource = firstObs ? firstObs.dataSource : 'FIXTURE';

  const evidenceBundle: EvidenceBundle = {
    dataSource,
    sourceEndpoint: firstObs ? firstObs.sourceEndpoint : '/v1/heatmap',
    requestLocation: location,
    selectedTileId,
    requestTimeRange: {
      start: constraints.allowedStart,
      end: constraints.allowedEnd,
      timezone: 'UTC',
    },
    observationTimestamp: baseObservationTime,
    units: { temperature: 'celsius', duration: 'hours' },
    observedValues: {
      averageTemperatureCelsius: firstObs ? firstObs.metrics.temperatureCelsius : null,
      tileMinTemperatureCelsius: firstObs?.metrics.tileMinTemperatureCelsius ?? null,
      tileMaxTemperatureCelsius: firstObs?.metrics.tileMaxTemperatureCelsius ?? null,
    },
    derivedValues: {
      recommendedWindowScore: best.exposureScore,
      candidateWindowCount: windows.length,
      feasibleWindowCount: feasible.length,
    },
    modelVersion: BASELINE_MODEL_VERSION,
    candidateWindows: rankedWindows.map((rw) => ({
      windowId: rw.windowId,
      startTime: rw.startTime,
      endTime: rw.endTime,
      exposureScore: rw.exposureScore,
      rank: rw.rank,
      isFeasible: rw.isFeasible,
    })),
    recommendation: {
      recommendedWindowId: best.windowId,
      startTime: best.startTime,
      endTime: best.endTime,
      exposureScore: best.exposureScore,
    },
  };

  return {
    dataSource,
    recommendedWindow: {
      windowId: best.windowId,
      startTime: best.startTime,
      endTime: best.endTime,
      durationHours: best.durationHours,
      exposureScore: best.exposureScore,
    },
    rankedWindows,
    rejectedWindows: rejected.map((r) => ({
      windowId: r.window.windowId,
      startTime: r.window.startTime,
      endTime: r.window.endTime,
      durationHours: r.window.durationHours,
      reason: r.rejectReason || 'Infeasible',
    })),
    evidenceBundle,
    modelVersion: BASELINE_MODEL_VERSION,
  };
}

/**
 * Execute deterministic spatial decision ranking across candidate locations for a chosen operating window.
 * Mathematically ranks candidate locations by modeled thermal exposure without baseObservationTime bias.
 */
export function evaluateCandidateLocations(
  candidates: CandidateLocation[],
  observationsByLocation: Map<string, NormalizedThermalObservation[]>,
  window: CandidateWindow,
  options?: {
    dataSource?: DataSourceMode;
    baseTimestamp?: string;
    totalEvaluatedHours?: number;
  }
): SpatialDecisionResult {
  if (!candidates || candidates.length === 0) {
    throw new ValidationError('At least one candidate location is required for spatial decision evaluation');
  }

  // Reject duplicate locationIds
  const seenIds = new Set<string>();
  for (const cand of candidates) {
    if (seenIds.has(cand.locationId)) {
      throw new ValidationError(`Duplicate candidate locationId: ${cand.locationId}`);
    }
    seenIds.add(cand.locationId);
  }

  const evaluator = new BaselineSpatialThermalEvaluator();
  const evaluatedResults: Array<{
    candidate: CandidateLocation;
    score: number;
    tileId: string | number;
    thermalValues: HourlyTileTemperature[];
  }> = [];

  let detectedDataSource: DataSourceMode = options?.dataSource || 'FIXTURE';
  let firstEndpoint = '/v1/heatmap';

  for (const cand of candidates) {
    const obsList = observationsByLocation.get(cand.locationId);
    if (!obsList || obsList.length === 0) {
      throw new IncompleteTemporalCoverageError(`No thermal observations provided for candidate ${cand.locationId}`);
    }

    if (obsList[0]) {
      detectedDataSource = obsList[0].dataSource;
      firstEndpoint = obsList[0].sourceEndpoint;
    }

    const evalResult = evaluator.evaluate(obsList, window);

    const thermalValues: HourlyTileTemperature[] = obsList.map((obs) => ({
      timestamp: obs.timestamp,
      temperatureCelsius: obs.metrics.temperatureCelsius,
      provenance: 'DERIVED',
      tileId: obs.selectedTileId,
      evidenceReference: obs.sourceEndpoint,
    }));

    evaluatedResults.push({
      candidate: cand,
      score: evalResult.score,
      tileId: obsList[0]?.selectedTileId || 'unknown',
      thermalValues,
    });
  }

  // Deterministic tie-breaking:
  // 1. Lowest exposureScore ascending
  // 2. Stable locationId ascending (lexicographical)
  evaluatedResults.sort((a, b) => {
    if (a.score !== b.score) {
      return a.score - b.score;
    }
    return a.candidate.locationId.localeCompare(b.candidate.locationId);
  });

  const bestScore = evaluatedResults[0].score;

  const rankedLocations: RankedLocationResult[] = evaluatedResults.map((item, idx) => ({
    rank: idx + 1,
    locationId: item.candidate.locationId,
    name: item.candidate.name,
    location: item.candidate.location,
    tileId: item.tileId,
    exposureScore: item.score,
    deltaVsBest: Number((item.score - bestScore).toFixed(2)),
    status: 'Feasible',
    thermalValues: item.thermalValues,
  }));

  const baseTimestamp = options?.baseTimestamp || window.startTime;
  const totalEvaluatedHours = options?.totalEvaluatedHours || window.durationHours;

  return {
    decisionType: 'SPATIAL_LOCATION_CHOICE',
    recommendedLocation: rankedLocations[0],
    rankedLocations,
    timeWindow: {
      startTime: window.startTime,
      endTime: window.endTime,
      durationHours: window.durationHours,
    },
    dataSource: detectedDataSource,
    modelVersion: BASELINE_MODEL_VERSION,
    spatialFieldMetadata: {
      baseTimestamp,
      coverageType: 'BASE_TIMESTAMP_SNAPSHOT',
      totalEvaluatedHours,
      description: 'Spatial thermal surface represents the initial observation snapshot (t₀)',
    },
    evidenceBundle: {
      candidateCount: candidates.length,
      sourceEndpoint: firstEndpoint,
      dataSource: detectedDataSource,
      provenance: 'DERIVED',
      evaluatedWindow: window,
    },
  };
}

/**
 * Execute joint discrete spatial-temporal decision optimization over CandidateLocation × CandidateWindow.
 * Exhaustively evaluates every feasible plan and ranks them using strict 3-tier deterministic ordering:
 * 1. Lower exposureScore
 * 2. Earlier startTime
 * 3. Stable locationId
 */
export function evaluateJointDecision(
  candidates: CandidateLocation[],
  observationsByLocation: Map<string, NormalizedThermalObservation[]>,
  constraints: DecisionConstraints,
  options?: {
    dataSource?: DataSourceMode;
    baseTimestamp?: string;
  }
): JointDecisionResult {
  if (!candidates || candidates.length === 0) {
    throw new ValidationError('At least one candidate location is required for joint decision evaluation');
  }

  // Reject duplicate candidate IDs
  const seenIds = new Set<string>();
  for (const cand of candidates) {
    if (seenIds.has(cand.locationId)) {
      throw new ValidationError(`Duplicate candidate locationId: ${cand.locationId}`);
    }
    seenIds.add(cand.locationId);
  }

  // Generate feasible candidate sliding windows
  const windows = generateCandidateWindows(constraints);

  // Validate +12h forecast lead time boundary from base observation time
  const baseTimestamp = options?.baseTimestamp || constraints.allowedStart;
  const baseTimeMs = new Date(baseTimestamp).getTime();
  const maxAllowedForecastMs = baseTimeMs + 12 * 3600 * 1000;

  for (const win of windows) {
    const endMs = new Date(win.endTime).getTime();
    if (endMs > maxAllowedForecastMs) {
      throw new IncompleteTemporalCoverageError(
        `Candidate window ${win.windowId} end time (${win.endTime}) exceeds +12h verified forecast limit from base time (${baseTimestamp})`
      );
    }
  }

  const evaluator = new BaselineSpatialThermalEvaluator();
  const evaluatedPlans: Array<{
    location: CandidateLocation;
    window: CandidateWindow;
    score: number;
    tileId: string | number;
    thermalValues: HourlyTileTemperature[];
  }> = [];

  let detectedDataSource: DataSourceMode = options?.dataSource || 'FIXTURE';
  let firstEndpoint = '/v1/heatmap';

  // Evaluate Cartesian product: CandidateLocation × CandidateWindow
  for (const cand of candidates) {
    const allLocObs = observationsByLocation.get(cand.locationId);
    if (!allLocObs || allLocObs.length === 0) {
      throw new IncompleteTemporalCoverageError(`No thermal observations provided for candidate ${cand.locationId}`);
    }

    if (allLocObs[0]) {
      detectedDataSource = allLocObs[0].dataSource;
      firstEndpoint = allLocObs[0].sourceEndpoint;
    }

    for (const win of windows) {
      const winStartMs = new Date(win.startTime).getTime();
      const winEndMs = new Date(win.endTime).getTime();

      const inWinObs = allLocObs.filter((obs) => {
        const obsMs = new Date(obs.timestamp).getTime();
        return obsMs >= winStartMs && obsMs < winEndMs;
      });

      if (inWinObs.length === 0) {
        throw new IncompleteTemporalCoverageError(
          `Missing hourly observations for candidate ${cand.locationId} in window ${win.windowId} (${win.startTime} to ${win.endTime})`
        );
      }

      const evalResult = evaluator.evaluate(inWinObs, win);

      const thermalValues: HourlyTileTemperature[] = inWinObs.map((obs) => ({
        timestamp: obs.timestamp,
        temperatureCelsius: obs.metrics.temperatureCelsius,
        provenance: 'DERIVED',
        tileId: obs.selectedTileId,
        evidenceReference: obs.sourceEndpoint,
      }));

      evaluatedPlans.push({
        location: cand,
        window: win,
        score: evalResult.score,
        tileId: inWinObs[0]?.selectedTileId || 'unknown',
        thermalValues,
      });
    }
  }

  // Strict 3-tier deterministic ordering:
  // 1. Lower exposureScore
  // 2. Earlier startTime
  // 3. Stable locationId
  evaluatedPlans.sort((a, b) => {
    // 1. Exposure score (ascending)
    if (a.score !== b.score) {
      return a.score - b.score;
    }

    // 2. Start time (chronological ascending)
    const timeDiff = new Date(a.window.startTime).getTime() - new Date(b.window.startTime).getTime();
    if (timeDiff !== 0) {
      return timeDiff;
    }

    // 3. Stable locationId (alphabetical ascending)
    return a.location.locationId.localeCompare(b.location.locationId);
  });

  const bestScore = evaluatedPlans[0].score;

  const rankedPlans: CandidatePlan[] = evaluatedPlans.map((item, idx) => ({
    planId: `plan-${String(idx + 1).padStart(3, '0')}`,
    rank: idx + 1,
    location: item.location,
    window: item.window,
    tileId: item.tileId,
    exposureScore: item.score,
    deltaVsBest: Number((item.score - bestScore).toFixed(2)),
    status: idx === 0 ? 'Optimal' : 'Feasible',
    thermalValues: item.thermalValues,
  }));

  const totalEvaluatedHours = windows.length + constraints.durationHours - 1;

  return {
    decisionType: 'JOINT_SPATIAL_TEMPORAL_PLAN',
    recommendedPlan: rankedPlans[0],
    rankedPlans,
    searchSpace: {
      locationCount: candidates.length,
      windowCount: windows.length,
      totalEvaluatedPlans: rankedPlans.length,
    },
    dataSource: detectedDataSource,
    modelVersion: BASELINE_MODEL_VERSION,
    spatialFieldMetadata: {
      baseTimestamp,
      coverageType: 'BASE_TIMESTAMP_SNAPSHOT',
      totalEvaluatedHours,
      description: 'Spatial thermal surface represents the initial observation snapshot (t₀)',
    },
    evidenceBundle: {
      candidateCount: candidates.length,
      windowCount: windows.length,
      sourceEndpoint: firstEndpoint,
      dataSource: detectedDataSource,
      provenance: 'DERIVED',
    },
  };
}



