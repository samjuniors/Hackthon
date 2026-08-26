/**
 * Location-selection behavior (Section 12 + 13) — pure, testable rules.
 *
 *   STATE/REGION result  → geographic CONTEXT ONLY. The analysis point does
 *                          NOT move to the state's center; camera fits the
 *                          region so the user can pick a city inside it.
 *   CITY/NEIGHBORHOOD    → camera fits AOI + context; AOI recenters at the
 *                          city coordinates.
 *   STREET/ADDRESS/POI   → camera zooms directly to the point.
 */
import type { NamedLocation } from '@/types/provider';

export type SelectionCameraBehavior = 'fit-aoi' | 'fit-region' | 'fit-point';

/** True when a selection is state/region-level (context-only selection). */
export function isStateLevelSelection(loc: NamedLocation | null | undefined): boolean {
  return loc?.resultType === 'state' || loc?.resultType === 'region';
}

/** Camera behavior for a selection's result type. */
export function cameraForResultType(t: NamedLocation['resultType']): SelectionCameraBehavior {
  if (t === 'state' || t === 'region') return 'fit-region';
  if (t === 'street' || t === 'address' || t === 'poi' || t === 'zip') return 'fit-point';
  return 'fit-aoi'; // city / neighborhood / undefined (curated catalog default)
}
