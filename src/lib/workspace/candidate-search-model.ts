/**
 * Candidate-site search interaction model — PURE, testable rules.
 *
 * The candidate-site search is EXPLICIT and SEPARATE from the analysis-location
 * search (it only ever creates candidate state — it never moves the AOI, never
 * changes the analysis location, never calls FortyGuard; Generate is the only
 * trigger for the decision pipeline).
 *
 * This module owns the keyboard interaction contract:
 *   ArrowDown / ArrowUp → move the highlighted result (wrapping)
 *   Enter               → select the highlighted result, or the FIRST result
 *                         when nothing is highlighted
 *   Escape              → close the results without adding
 * Mouse/touch clicks select the clicked row — equivalent to Enter on the
 * highlighted row (mouse hovering highlights the row, so both paths run the
 * SAME selection code).
 */
import type { CandidateSite } from '@/hooks/use-candidate-sites';

export type SearchKeyAction =
  | { type: 'highlight'; index: number }
  | { type: 'select'; index: number }
  | { type: 'close' }
  | { type: 'noop' };

/**
 * Resolve a keydown on the candidate-search input into an interaction action.
 *
 * @param key          The `event.key` value.
 * @param activeIndex  Currently highlighted row (-1 = nothing highlighted).
 * @param resultsCount Number of displayed results.
 */
export function resolveSearchKeyAction(
  key: string,
  activeIndex: number,
  resultsCount: number,
): SearchKeyAction {
  if (resultsCount <= 0) {
    // Escape still closes an (empty) open dropdown; other keys do nothing.
    return key === 'Escape' ? { type: 'close' } : { type: 'noop' };
  }
  switch (key) {
    case 'ArrowDown':
      // From nothing-highlighted (-1), ArrowDown lands on the FIRST row.
      return { type: 'highlight', index: (activeIndex + 1) % resultsCount };
    case 'ArrowUp':
      // Wraps from the first row up to the LAST row.
      return { type: 'highlight', index: (activeIndex - 1 + resultsCount) % resultsCount };
    case 'Enter':
      // Nothing highlighted → the FIRST result. This is the contract: Enter
      // must always add an obvious result when results are displayed.
      return { type: 'select', index: activeIndex >= 0 ? activeIndex : 0 };
    case 'Escape':
      // Closes the results WITHOUT adding anything.
      return { type: 'close' };
    default:
      return { type: 'noop' };
  }
}

/**
 * True when a search result's EXACT coordinate already exists as a candidate.
 * Duplicate selection must highlight the existing candidate and never create a
 * second one at the same point.
 */
export function isDuplicateCandidateResult(
  sites: Pick<CandidateSite, 'location'>[],
  point: { latitude: number; longitude: number },
): boolean {
  return sites.some(
    (s) => s.location.latitude === point.latitude && s.location.longitude === point.longitude,
  );
}
