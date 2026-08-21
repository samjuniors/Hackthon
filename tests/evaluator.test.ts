import { describe, it, expect } from 'vitest';
import {
  generateCandidateWindows,
  evaluateCandidateWindows,
  BaselineSpatialThermalEvaluator,
} from '@/lib/decision-engine/evaluator';
import type { DecisionConstraints, NormalizedThermalObservation } from '@/types/domain';
import {
  IncompleteTemporalCoverageError,
  InfeasibleConstraintsError,
} from '@/types/errors';

describe('Decision Engine Evaluator & Pipeline', () => {
  const baseTime = '2026-08-20T12:00:00.000Z';

  const sampleObs: NormalizedThermalObservation[] = [
    {
      timestamp: '2026-08-20T12:00:00.000Z',
      location: { latitude: 40.7128, longitude: -74.006 },
      selectedTileId: 'tile-101',
      sourceEndpoint: '/v1/heatmap',
      dataSource: 'FIXTURE',
      metrics: { temperatureCelsius: 34.0 },
      provenance: 'DERIVED',
    },
    {
      timestamp: '2026-08-20T13:00:00.000Z',
      location: { latitude: 40.7128, longitude: -74.006 },
      selectedTileId: 'tile-101',
      sourceEndpoint: '/v1/heatmap',
      dataSource: 'FIXTURE',
      metrics: { temperatureCelsius: 36.0 },
      provenance: 'PREDICTED',
    },
    {
      timestamp: '2026-08-20T14:00:00.000Z',
      location: { latitude: 40.7128, longitude: -74.006 },
      selectedTileId: 'tile-101',
      sourceEndpoint: '/v1/heatmap',
      dataSource: 'FIXTURE',
      metrics: { temperatureCelsius: 30.0 },
      provenance: 'PREDICTED',
    },
    {
      timestamp: '2026-08-20T15:00:00.000Z',
      location: { latitude: 40.7128, longitude: -74.006 },
      selectedTileId: 'tile-101',
      sourceEndpoint: '/v1/heatmap',
      dataSource: 'FIXTURE',
      metrics: { temperatureCelsius: 28.0 },
      provenance: 'PREDICTED',
    },
  ];


  it('generates sliding candidate windows correctly', () => {
    const constraints: DecisionConstraints = {
      allowedStart: '2026-08-20T12:00:00.000Z',
      allowedEnd: '2026-08-20T16:00:00.000Z',
      durationHours: 2,
      dataResolutionHours: 1,
    };
    const windows = generateCandidateWindows(constraints);
    expect(windows.length).toBe(3);
    expect(windows[0].startTime).toBe('2026-08-20T12:00:00.000Z');
    expect(windows[0].endTime).toBe('2026-08-20T14:00:00.000Z');
  });

  it('evaluates window exposure mean temperature deterministically', () => {
    const evaluator = new BaselineSpatialThermalEvaluator();
    const result = evaluator.evaluate(sampleObs, {
      windowId: 'w-001',
      startTime: '2026-08-20T12:00:00.000Z',
      endTime: '2026-08-20T14:00:00.000Z',
      durationHours: 2,
    });
    // (34.0 + 36.0) / 2 = 35.0
    expect(result.score).toBe(35.0);
  });

  it('ranks windows by lowest exposure score and breaks ties by earlier start time', () => {
    const constraints: DecisionConstraints = {
      allowedStart: '2026-08-20T12:00:00.000Z',
      allowedEnd: '2026-08-20T16:00:00.000Z',
      durationHours: 2,
      dataResolutionHours: 1,
    };

    const decision = evaluateCandidateWindows(
      { latitude: 40.7128, longitude: -74.006 },
      sampleObs,
      constraints,
      baseTime
    );

    expect(decision.recommendedWindow.exposureScore).toBe(29.0); // (30.0 + 28.0)/2
    expect(decision.recommendedWindow.startTime).toBe('2026-08-20T14:00:00.000Z');
  });

  it('throws IncompleteTemporalCoverageError if windows exceed +12h forecast limit', () => {
    const constraints: DecisionConstraints = {
      allowedStart: '2026-08-20T23:00:00.000Z',
      allowedEnd: '2026-08-21T03:00:00.000Z',
      durationHours: 2,
      dataResolutionHours: 1,
    };

    expect(() =>
      evaluateCandidateWindows(
        { latitude: 40.7128, longitude: -74.006 },
        sampleObs,
        constraints,
        baseTime
      )
    ).toThrow(IncompleteTemporalCoverageError);
  });

  it('throws InfeasibleConstraintsError if span is shorter than duration', () => {
    const constraints: DecisionConstraints = {
      allowedStart: '2026-08-20T12:00:00.000Z',
      allowedEnd: '2026-08-20T13:00:00.000Z',
      durationHours: 3,
      dataResolutionHours: 1,
    };

    expect(() =>
      evaluateCandidateWindows(
        { latitude: 40.7128, longitude: -74.006 },
        sampleObs,
        constraints,
        baseTime
      )
    ).toThrow(InfeasibleConstraintsError);
  });
});
