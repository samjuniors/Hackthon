import { describe, it, expect } from 'vitest';
import {
  validateTemporalWindow,
  classifyTemporalWindow,
  ENGINE_MAX_WINDOW_HOURS,
} from '@/lib/temporal/validation';
import { buildFixtureTemporalInput } from '@/lib/temporal/analysis-window';
import { localToUtcIso } from '@/lib/temporal/server-conversion';

/**
 * TEMPORAL CONTRACT TESTS — the documented FortyGuard window is
 * 2019-01-01 → now+12h; violations are HTTP 400 at the provider and never
 * charged. These tests pin the client+server pre-flight that blocks them
 * BEFORE submission (zero credits) and the honest classification
 * (historical / current / forecast) + UTC wire preview.
 */

const NOW = new Date('2026-08-28T15:00:00Z');

function input(patch: Partial<Parameters<typeof validateTemporalWindow>[0]>) {
  return {
    date: '2026-08-28',
    startTime: '10:00',
    endTime: '11:00',
    timeMode: 'single-hour' as const,
    ...patch,
  };
}

describe('temporal window classification (documented semantics)', () => {
  it('classifies a past date as historical', () => {
    const facts = classifyTemporalWindow(input({ date: '2026-08-14' }), 'UTC', NOW);
    expect(facts.classification).toBe('historical');
  });

  it('classifies today as current (even when the hour has passed)', () => {
    expect(classifyTemporalWindow(input({}), 'UTC', NOW).classification).toBe('current');
  });

  it('classifies a future date as forecast', () => {
    expect(classifyTemporalWindow(input({ date: '2026-08-29' }), 'UTC', NOW).classification).toBe('forecast');
  });

  it('previews the EXACT provider wire representation (UTC)', () => {
    // Los Angeles 04:00 PDT = 11:00 UTC — the wire preview must show UTC.
    const facts = classifyTemporalWindow(
      input({ date: '2026-08-28', startTime: '04:00', endTime: '05:00' }),
      'America/Los_Angeles',
      NOW,
    );
    expect(facts.startUtc).toBe(localToUtcIso('2026-08-28', '04:00', 'America/Los_Angeles'));
    expect(facts.wirePreview).toBe(`FortyGuard request: ${facts.startUtc.slice(0, 10)} ${facts.startUtc.slice(11, 16)} UTC`);
    expect(facts.startUtc.slice(11, 16)).toBe('11:00');
  });

  it('previews a RANGE as start–end UTC on one line', () => {
    const facts = classifyTemporalWindow(
      input({ startTime: '04:00', endTime: '07:00', timeMode: 'range-of-hours' }),
      'America/Los_Angeles',
      NOW,
    );
    // 04:00–07:00 PDT = 11:00–14:00 UTC — previewed as one UTC line.
    expect(facts.wirePreview).toBe('FortyGuard request: 2026-08-28 11:00 – 14:00 UTC');
  });
});

describe('documented provider temporal bounds (pre-flight, zero-credit blocks)', () => {
  it('accepts a historical date (2019 onward)', () => {
    const r = validateTemporalWindow(input({ date: '2019-06-15' }), 'UTC', NOW);
    expect(r.valid).toBe(true);
    expect(r.classification).toBe('historical');
  });

  it('rejects a date BEFORE the documented 2019-01-01 range start', () => {
    const r = validateTemporalWindow(input({ date: '2018-12-31' }), 'UTC', NOW);
    expect(r.valid).toBe(false);
    expect(r.code).toBe('TEMPORAL_BEFORE_PROVIDER_RANGE');
    expect(r.message).toContain('2019-01-01');
    expect(r.message).toContain('no credits consumed');
    expect(r.recovery).toContain('2019-01-01');
  });

  it('accepts a forecast window within the documented +12h horizon', () => {
    // NOW = 15:00Z; a window starting 23:00Z the same day is +8h — allowed.
    const r = validateTemporalWindow(
      input({ date: '2026-08-28', startTime: '23:00', endTime: '23:30' }),
      'UTC',
      NOW,
    );
    expect(r.valid).toBe(true);
    expect(r.classification).toBe('current'); // same UTC date = current
  });

  it('rejects a window starting MORE than +12h from now (documented forecast ceiling)', () => {
    // NOW = 15:00Z; 2026-08-29 06:00 UTC is +15h — blocked before submission.
    const r = validateTemporalWindow(
      input({ date: '2026-08-29', startTime: '06:00', endTime: '07:00' }),
      'UTC',
      NOW,
    );
    expect(r.valid).toBe(false);
    expect(r.code).toBe('TEMPORAL_BEYOND_FORECAST_HORIZON');
    expect(r.message).toContain('+12h');
    expect(r.message).toContain('no credits consumed');
  });

  it('rejects a range spanning more than the engine 12h evaluation horizon', () => {
    const r = validateTemporalWindow(
      input({ startTime: '00:00', endTime: '23:00', timeMode: 'range-of-hours' }),
      'UTC',
      NOW,
    );
    expect(r.valid).toBe(false);
    expect(r.code).toBe('TEMPORAL_RANGE_EXCEEDS_ENGINE_HORIZON');
    expect(ENGINE_MAX_WINDOW_HOURS).toBe(12);
  });

  it('accepts the DEMO fixture capture window (anchored, exempt, UTC)', () => {
    const fixtureInput = buildFixtureTemporalInput();
    const r = validateTemporalWindow(fixtureInput, 'UTC', NOW);
    expect(r.valid).toBe(true); // historical (2026-08-14) — inside documented range
    expect(r.classification).toBe('historical');
  });

  it('accepts today by default (defaultTemporalInput date == today in the location timezone)', () => {
    // "Today" is measured against the fixed NOW, not the wall clock — otherwise
    // this test breaks the moment the real calendar passes LA midnight of NOW.
    const nowLaDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
    }).format(NOW);
    const r = validateTemporalWindow(
      input({ date: nowLaDate, startTime: '05:00', endTime: '06:00' }),
      'America/Los_Angeles',
      NOW,
    );
    expect(r.valid).toBe(true);
  });
});
