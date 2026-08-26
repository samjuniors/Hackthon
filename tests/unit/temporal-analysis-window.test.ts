import { describe, it, expect } from 'vitest';
import {
  TIME_MODE_FILTER_TYPE,
  hoursBetween,
  effectiveTimeBounds,
  deriveDurationHours,
  formatTemporalForHeader,
  formatDateLong,
  isValidDateStr,
  isValidTimeStr,
  buildFixtureTemporalInput,
  FIXTURE_TEMPORAL_METADATA,
} from '@/lib/temporal/analysis-window';

describe('temporal analysis window (explicit WHEN model)', () => {
  it('maps time modes to verified FortyGuard filter_type semantics', () => {
    expect(TIME_MODE_FILTER_TYPE['single-hour']).toBe(1);
    expect(TIME_MODE_FILTER_TYPE['range-of-hours']).toBe(2);
    expect(TIME_MODE_FILTER_TYPE['single-day']).toBe(3);
  });

  it('derives duration from start/end for range of hours', () => {
    expect(hoursBetween('05:00', '08:00')).toBe(3);
    expect(hoursBetween('08:00', '05:00')).toBe(0);
    expect(
      deriveDurationHours({ date: '2026-08-26', startTime: '05:00', endTime: '08:00', timeMode: 'range-of-hours' })
    ).toBe(3);
  });

  it('derives duration for single-hour and single-day modes', () => {
    expect(deriveDurationHours({ date: '2026-08-26', startTime: '13:00', endTime: '14:00', timeMode: 'single-hour' })).toBe(1);
    expect(
      deriveDurationHours({ date: '2026-08-26', startTime: '06:00', endTime: '20:00', timeMode: 'single-day', dayWindowHours: 4 })
    ).toBe(4);
  });

  it('resolves effective bounds per mode', () => {
    expect(effectiveTimeBounds({ date: '2026-08-26', startTime: '05:00', endTime: '08:00', timeMode: 'range-of-hours' }))
      .toEqual({ start: '05:00', end: '08:00' });
    expect(effectiveTimeBounds({ date: '2026-08-26', startTime: '13:00', endTime: '14:00', timeMode: 'single-hour' }))
      .toEqual({ start: '13:00', end: '14:00' });
    expect(effectiveTimeBounds({ date: '2026-08-26', startTime: '01:00', endTime: '02:00', timeMode: 'single-day' }))
      .toEqual({ start: '06:00', end: '20:00' });
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

  it('anchors DEMO to the fixture capture — never "Today"', () => {
    const fixture = buildFixtureTemporalInput();
    expect(fixture.date).toBe('2026-08-21');
    expect(fixture.timeMode).toBe('range-of-hours');
    expect(FIXTURE_TEMPORAL_METADATA.captureLabel).toContain('captured FortyGuard');
  });
});
