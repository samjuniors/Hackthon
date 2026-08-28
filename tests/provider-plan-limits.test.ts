import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FORTYGUARD_DOCUMENTED_PLAN_LIMITS_MI2,
  FORTYGUARD_DOCUMENTED_DATE_RANGE_START,
  FORTYGUARD_FORECAST_HORIZON_HOURS,
  FORTYGUARD_FILTER2_MAX_RANGE_HOURS,
  FORTYGUARD_DOCUMENTED_COVERAGE,
  FORTYGUARD_AOI_LIMIT_MI2,
  resolveApplicableAoiLimit,
  formatAoiLimitLabel,
  isWithinDocumentedCoverage,
} from '@/lib/fortyguard/plan-limits';
import {
  DEFAULT_PROVIDER_CAPABILITY,
  FORTYGUARD_AOI_LIMITS_DOCUMENTED_MI2,
} from '@/types/fortyguard-capability';
import { createAoiFromSpan, isAoiWithinLimit } from '@/lib/spatial/aoi';

/**
 * FORTYGUARD PLAN-LIMIT CONTRACT TESTS — the documented provider limits are
 * AUTHORITATIVE (official docs, verified live 2026-08-28) and the stale
 * 150 mi² assumption must never resurface anywhere as an active limit.
 */

describe('documented provider plan limits (official docs, verified 2026-08-28)', () => {
  it('documents Basic 10 / Premium 50 / Startup 10 mi² heatmap area limits', () => {
    expect(FORTYGUARD_DOCUMENTED_PLAN_LIMITS_MI2).toEqual({ basic: 10, premium: 50, startup: 10 });
    expect(FORTYGUARD_AOI_LIMITS_DOCUMENTED_MI2).toEqual({ basic: 10, premium: 50, startup: 10 });
  });

  it('documents the temporal contract: 2019-01-01 floor, +12h forecast ceiling, 23h filter_type-2 max', () => {
    expect(FORTYGUARD_DOCUMENTED_DATE_RANGE_START).toBe('2019-01-01');
    expect(FORTYGUARD_FORECAST_HORIZON_HOURS).toBe(12);
    expect(FORTYGUARD_FILTER2_MAX_RANGE_HOURS).toBe(23);
  });

  it('documents United States-only regional coverage', () => {
    expect(FORTYGUARD_DOCUMENTED_COVERAGE).toBe('United States');
    // Manhattan is inside the documented coverage; London and Tokyo are not.
    expect(isWithinDocumentedCoverage(40.712, -74.008)).toBe(true);
    expect(isWithinDocumentedCoverage(51.5074, -0.1278)).toBe(false);
    expect(isWithinDocumentedCoverage(35.6762, 139.6503)).toBe(false);
  });
});

describe('applicable-limit resolution (documented vs account capability)', () => {
  it('resolves Premium plans to the documented 50 mi² limit', () => {
    const r = resolveApplicableAoiLimit('API Premium');
    expect(r.limitMi2).toBe(50);
    expect(r.planLabel).toBe('Premium');
    expect(r.confidence).toBe('documented');
    expect(formatAoiLimitLabel(r)).toBe('FortyGuard Premium limit: 50 mi²');
  });

  it('resolves Basic and Startup plans to the documented 10 mi² limit', () => {
    expect(resolveApplicableAoiLimit('API Basic').limitMi2).toBe(10);
    expect(resolveApplicableAoiLimit('API Basic').planLabel).toBe('Basic');
    expect(resolveApplicableAoiLimit('Startup').limitMi2).toBe(10);
    expect(resolveApplicableAoiLimit('Startup').planLabel).toBe('Startup');
  });

  it('resolves the Hackathon account (no exposed area limit) to the CONSERVATIVE documented Basic limit', () => {
    const r = resolveApplicableAoiLimit('Hackathon');
    expect(r.limitMi2).toBe(10);
    expect(r.planLabel).toBe('Basic');
    expect(r.confidence).toBe('documented');
    expect(r.note).toContain('does not expose a heatmap area limit');
  });

  it('resolves unknown/undefined plans to the conservative Basic limit too', () => {
    expect(resolveApplicableAoiLimit(undefined).limitMi2).toBe(10);
    expect(resolveApplicableAoiLimit(null).limitMi2).toBe(10);
    expect(resolveApplicableAoiLimit('Some Custom Plan').limitMi2).toBe(10);
  });

  it('NEVER resolves to the stale 150 mi² value for any plan name', () => {
    for (const name of ['Hackathon', 'Basic', 'Premium', 'Startup', 'Enterprise', '', undefined, null]) {
      expect(resolveApplicableAoiLimit(name as string | undefined | null).limitMi2).not.toBe(150);
    }
  });
});

describe('the active enforced limit in this application', () => {
  it('enforces the documented Basic limit (10 mi²) by default', () => {
    expect(FORTYGUARD_AOI_LIMIT_MI2).toBe(10);
    // A 5 km square (≈9.66 mi²) is within; a 6 km square (≈13.9 mi²) exceeds.
    expect(isAoiWithinLimit(createAoiFromSpan({ latitude: 40.712, longitude: -74.008 }, 5000, 'polygon'))).toBe(true);
    const oversized = createAoiFromSpan({ latitude: 40.712, longitude: -74.008 }, 6000, 'polygon');
    expect(isAoiWithinLimit(oversized)).toBe(false);
    expect(isAoiWithinLimit(oversized, 50)).toBe(true); // documented Premium limit would allow it
  });

  it('defaults the capability model to the documented limits — never 150', () => {
    expect(DEFAULT_PROVIDER_CAPABILITY.applicableAoiLimit.limitMi2).toBe(10);
    expect(DEFAULT_PROVIDER_CAPABILITY.applicableAoiLimit.planLabel).toBe('Basic');
    expect(DEFAULT_PROVIDER_CAPABILITY.aoiLimitsDocumentedMi2).toEqual({ basic: 10, premium: 50, startup: 10 });
  });
});

describe('150 mi² is permanently retired (source-level guard)', () => {
  const LIMIT_BEARING_FILES = [
    'src/lib/spatial/aoi.ts',
    'src/lib/spatial/aoi-validation.ts',
    'src/types/fortyguard-capability.ts',
    'src/lib/fortyguard/capability.ts',
    'src/lib/fortyguard/plan-limits.ts',
    'src/lib/user-preferences.ts',
  ];

  /** Strip block + line comments so only EXECUTABLE code remains. */
  function stripComments(src: string): string {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
  }

  it('no limit-bearing source file contains 150 in EXECUTABLE code (comments may only document its retirement)', () => {
    for (const file of LIMIT_BEARING_FILES) {
      const raw = readFileSync(resolve(process.cwd(), file), 'utf8');
      const code = stripComments(raw);
      expect(
        code.includes('150'),
        `${file}: "150" remains in executable code — the stale limit must not stay active anywhere`
      ).toBe(false);
    }
  });
});
