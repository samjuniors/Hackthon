import type {
  CandidateWindow,
  DecisionConstraints,
  DecisionResult,
  EvidenceBundle,
  ExposureResult,
  ExposureModel,
  LocationPoint,
  NormalizedThermalObservation,
} from '@/types/domain';
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

  const evidenceBundle: EvidenceBundle = {
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
