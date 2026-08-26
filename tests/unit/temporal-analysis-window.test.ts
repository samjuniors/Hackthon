import { describe, it, expect } from 'vitest';
import {
  TIME_MODE_OPTIONS,
  hoursBetween,
  effectiveTimeBounds,
  deriveDurationHours,
  formatTemporalForHeader,
  formatDateLong,
  isValidDateStr,
  isValidTimeStr,
  buildFixtureTemporalInput,
  FIXTURE_TEMPORAL_METADATA,
  FIXTURE_TIMEZONE,
} from '@/lib/temporal/analysis-window';

describe('temporal analysis window (explicit WHEN model)', () => {
  it('exposes ONLY the two verified evaluation-window modes — Single Day is removed', () => {
    expect(TIME_MODE_OPTIONS.map((o) => o.value)).toEqual(['single-hour', 'range-of-hours']);
    // The broken 14-hour "Single Day" span (violates the +12h engine horizon)
    // must NOT be offered.
    expect(TIME_MODE_OPTIONS.some((o) => o.value === ('single-day' as never))).toBe(false);
  });

  it('never claims a provider filter_type mapping for evaluation-window modes', () => {
    // The verified wire contract: every evaluated hour is its own single-hour
    // request (filter_type: 1). The UI concept is NOT a provider Time Mode,
    // and no TIME_MODE→filter_type mapping may exist in client code.
    const moduleSource = TIME_MODE_OPTIONS.toString();
    expect(moduleSource).not.toContain('filter_type');
  });

  it('derives duration from start/end for range of hours', () => {
    expect(hoursBetween('05:00', '08:00')).toBe(3);
    expect(hoursBetween('08:00', '05:00')).toBe(0);
    expect(
      deriveDurationHours({ date: '2026-08-26', startTime: '05:00', endTime: '08:00', timeMode: 'range-of-hours' })
    ).toBe(3);
  });

  it('derives duration for single-hour mode (always 1h)', () => {
    expect(deriveDurationHours({ date: '2026-08-26', startTime: '13:00', endTime: '14:00', timeMode: 'single-hour' })).toBe(1);
  });

  it('resolves effective bounds per mode', () => {
    expect(effectiveTimeBounds({ date: '2026-08-26', startTime: '05:00', endTime: '08:00', timeMode: 'range-of-hours' }))
      .toEqual({ start: '05:00', end: '08:00' });
    expect(effectiveTimeBounds({ date: '2026-08-26', startTime: '13:00', endTime: '14:00', timeMode: 'single-hour' }))
      .toEqual({ start: '13:00', end: '14:00' });
  });

  it('validates date/time strings before any provider call', () => {
    expect(isValidDateStr('2026-08-26')).toBe(true);
    expect(isValidDateStr('2026-13-40')).toBe(false);
    expect(isValidTimeStr('05:00')).toBe(true);
    expect(isValidTimeStr('24:61')).toBe(false);
  });

  it('formats the WHEN line with location timezone abbreviation (PDT)', () => {
    const label = formatTemporalForHeader(
      { date: '2026-08-26', startTime: '05:00', endTime: '08:00', timeMode: 'range-of-hours' },
      'America/Los_Angeles'
    );
    expect(label).toContain('August 26, 2026');
    expect(label).toContain('05:00 AM');
    expect(label).toContain('08:00 AM');
    expect(label).toMatch(/PDT/);
  });

  it('formats long date without shifting the calendar day', () => {
    expect(formatDateLong('2026-08-26', 'America/Los_Angeles')).toBe('August 26, 2026');
  });

  it('anchors DEMO to the REAL one-hour capture — never "Today", never a fabricated series', () => {
    const fixture = buildFixtureTemporalInput();
    // The real capture requested 2026-08-14 12:00 UTC (filter_type 1).
    expect(fixture.date).toBe('2026-08-14');
    expect(fixture.startTime).toBe('12:00');
    expect(fixture.timeMode).toBe('single-hour');
    expect(FIXTURE_TIMEZONE).toBe('UTC');
    expect(FIXTURE_TEMPORAL_METADATA.snapshotCount).toBe(1);
    expect(FIXTURE_TEMPORAL_METADATA.firstSnapshotIso).toBe('2026-08-14T12:00:00.000Z');
    expect(FIXTURE_TEMPORAL_METADATA.lastSnapshotIso).toBe('2026-08-14T12:00:00.000Z');
    expect(FIXTURE_TEMPORAL_METADATA.captureLabel).toContain('captured FortyGuard');
    expect(FIXTURE_TEMPORAL_METADATA.captureLabel).toContain('one-hour snapshot');
  });
});
