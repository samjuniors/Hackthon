/**
 * Canonical Analysis-AOI validation (Section 6 — AOI VALIDATION WHILE DRAGGING).
 *
 * Validates the EXACT canonical geometry the user moved/created — never a
 * silently adjusted copy. Honest constraint families only, and NOTHING
 * invented:
 *
 *   1. GEOMETRY          — the AOI must be a usable polygon (finite coords).
 *   2. GEOGRAPHIC BOUNDS — coordinates must lie within valid geographic bounds
 *                          (|lat| ≤ 90, |lng| ≤ 180). No fabricated provider
 *                          coverage claims — just objective coordinate sanity.
 *   3. PROVIDER LIMIT    — the documented FortyGuard 150 mi² single-request
 *                          AOI limit (FORTYGUARD_AOI_LIMIT_MI2). Enforced,
 *                          never silently shrunk.
 *
 * DELIBERATELY ABSENT: state/region-boundary containment. The product's
 * region-boundary polygons are coarse geographic CONTEXT (rendered for
 * orientation + outside-dimming) whose edges cut through metro areas at AOI
 * scale — enforcing them would INVENT a restriction the provider does not
 * document and would falsely reject legitimate analyses (verified in-browser:
 * the simplified NY polygon excludes parts of Midtown Manhattan). No
 * geographic coverage claim is made for LIVE beyond the provider's own
 * documented limit: wherever FortyGuard responds, it responds honestly.
 *
 * The caller decides what to do with an invalid result: the geometry is
 * RETAINED visibly as invalid (never moved/clipped) and Generate is disabled.
 *
 * Pure geometry only — no zod, no fetch, no process.env. Safe for client import.
 */
import type { PolygonAOI } from '@/types/domain';
import {
  analyzeAoiAreaMi2,
  isAoiWithinLimit,
  FORTYGUARD_AOI_LIMIT_MI2,
} from './aoi';

/** Validation failure codes (stable identifiers surfaced in the UI + tests). */
export type AoiValidationCode =
  | 'AOI_GEOMETRY_INVALID'
  | 'AOI_OUTSIDE_GEOGRAPHIC_BOUNDS'
  | 'AOI_EXCEEDS_PROVIDER_LIMIT';

export interface AoiValidationResult {
  /** True when the AOI may be submitted to FortyGuard. */
  valid: boolean;
  /** Present only when invalid — stable machine-readable code. */
  code?: AoiValidationCode;
  /** Human explanation of WHY the geometry is invalid. */
  message: string;
  /** Human recovery instruction. */
  recovery: string;
}

export interface AoiValidationContext {
  /**
   * Reserved for future honest coverage constraints (currently unused — see
   * the DELIBERATELY ABSENT note above).
   */
  regionBoundary?: PolygonAOI | null;
  /** Display name of the active region (reserved — currently unused). */
  regionDisplayName?: string;
}

/** Valid geographic coordinate bounds (objective world limits). */
const MAX_LAT = 90;
const MAX_LNG = 180;

/**
 * Validate a canonical analysis AOI against every honest constraint the
 * product establishes. Returns a VALID result for geometries that may be
 * submitted; otherwise a typed reason with human recovery guidance.
 */
export function validateAnalysisAoi(
  aoi: PolygonAOI | null | undefined,
  _ctx: AoiValidationContext = {},
): AoiValidationResult {
  // ── 1. Geometry sanity ──
  const feat = aoi?.features?.[0];
  const geom = feat?.geometry as { type: string; coordinates: number[][][] } | undefined;
  const ring = geom?.coordinates?.[0];
  if (!aoi || !feat || !ring || ring.length < 4) {
    return {
      valid: false,
      code: 'AOI_GEOMETRY_INVALID',
      message: 'The analysis area geometry is incomplete.',
      recovery: 'Re-select a location or adjust the analysis-area size, then try again.',
    };
  }

  // ── 2. Geographic bounds (objective coordinate sanity) ──
  for (const [lng, lat] of ring) {
    if (
      !Number.isFinite(lng) || !Number.isFinite(lat) ||
      lat < -MAX_LAT || lat > MAX_LAT ||
      lng < -MAX_LNG || lng > MAX_LNG
    ) {
      return {
        valid: false,
        code: 'AOI_OUTSIDE_GEOGRAPHIC_BOUNDS',
        message: 'Analysis area outside supported coverage — the geometry extends beyond valid geographic bounds.',
        recovery: 'Drag the analysis area back inside the visible map, or press Reset to start over.',
      };
    }
  }

  // ── 3. Documented provider AOI limit ──
  if (!isAoiWithinLimit(aoi)) {
    const area = analyzeAoiAreaMi2(aoi);
    return {
      valid: false,
      code: 'AOI_EXCEEDS_PROVIDER_LIMIT',
      message: `Analysis area (${area.areaMi2.toFixed(1)} mi²) exceeds the documented FortyGuard ${FORTYGUARD_AOI_LIMIT_MI2} mi² AOI limit.`,
      recovery: 'Pick a smaller analysis-area size, then generate again.',
    };
  }

  return { valid: true, message: '', recovery: '' };
}
