'use client';

/**
 * Candidate-site management hook (Section 8).
 *
 * REAL sites only — the user explicitly adds each candidate by:
 *   - clicking the map inside the analysis area, or
 *   - searching a site/address.
 * Nothing is auto-generated. Geographic offsets are never invented sites.
 *
 * Lifecycle: ADD → MOVE → REMOVE. A MOVE that would drop the site OUTSIDE
 * the canonical AOI is REJECTED (Section 7) — the site stays at its last
 * valid position; it is never silently clamped or moved to a valid spot.
 *
 * Containment (Section 9): a candidate outside the analysis AOI is flagged
 * `outsideAoi` — surfaced as an error, never silently moved or clamped.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import type { CandidateLocation, LocationPoint, PolygonAOI } from '@/types/domain';
import { isPointInAoi } from '@/lib/spatial/aoi';

export interface CandidateSite extends CandidateLocation {
  /** True when the site falls outside the current AOI (validation flag). */
  outsideAoi?: boolean;
  /** How the site was added — provenance label in the UI. */
  origin: 'map-click' | 'search' | 'demo-captured';
}

/**
 * Pure candidate-move application (testable without React).
 *
 * Moving a candidate to a point OUTSIDE the canonical AOI is REJECTED:
 * the returned list is unchanged and `accepted` is false — the candidate
 * remains at its last valid position. Moving inside the AOI updates the
 * coordinates and clears any stale `outsideAoi` flag.
 */
export function applyCandidateMove<T extends CandidateLocation & { outsideAoi?: boolean }>(
  sites: T[],
  locationId: string,
  point: LocationPoint,
  aoi: PolygonAOI | null | undefined,
): { sites: T[]; accepted: boolean; reason?: 'NOT_FOUND' | 'OUTSIDE_AOI' } {
  const site = sites.find((s) => s.locationId === locationId);
  if (!site) return { sites, accepted: false, reason: 'NOT_FOUND' };
  if (aoi && !isPointInAoi(point, aoi)) {
    // REJECTED — never silently moved, never clamped (Section 7).
    return { sites, accepted: false, reason: 'OUTSIDE_AOI' };
  }
  return {
    sites: sites.map((s) =>
      s.locationId === locationId
        ? {
            ...s,
            location: {
              latitude: Number(point.latitude.toFixed(6)),
              longitude: Number(point.longitude.toFixed(6)),
            },
            outsideAoi: false,
          }
        : s
    ),
    accepted: true,
  };
}

export function useCandidateSites() {
  const [sites, setSites] = useState<CandidateSite[]>([]);
  const nextIdRef = useRef(1);
  const sitesRef = useRef<CandidateSite[]>([]);
  useEffect(() => {
    sitesRef.current = sites;
  }, [sites]);

  const addSiteAt = useCallback((lat: number, lng: number, name?: string, origin: CandidateSite['origin'] = 'map-click'): CandidateSite => {
    const id = `SITE-${String(nextIdRef.current++).padStart(2, '0')}`;
    const site: CandidateSite = {
      locationId: id,
      name: name || `Map point ${nextIdRef.current - 1}`,
      location: { latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)) },
      origin,
    };
    setSites((prev) => [...prev, site]);
    return site;
  }, []);

  const removeSite = useCallback((locationId: string) => {
    setSites((prev) => prev.filter((s) => s.locationId !== locationId));
  }, []);

  const renameSite = useCallback((locationId: string, name: string) => {
    setSites((prev) => prev.map((s) => (s.locationId === locationId ? { ...s, name } : s)));
  }, []);

  /**
   * Move a candidate to a new point (drag commit). When an AOI is provided
   * and the point lies OUTSIDE it, the move is REJECTED and the candidate
   * stays at its last valid position (returns false).
   */
  const moveSite = useCallback((locationId: string, lat: number, lng: number, aoi?: PolygonAOI | null): boolean => {
    const result = applyCandidateMove(
      sitesRef.current,
      locationId,
      { latitude: lat, longitude: lng },
      aoi,
    );
    if (!result.accepted) return false;
    setSites(result.sites as CandidateSite[]);
    return true;
  }, []);

  const clearSites = useCallback(() => {
    setSites([]);
  }, []);

  /**
   * Replace the entire site list with the given candidates, preserving their
   * ORIGINAL locationIds (used by History restoration — the saved decision
   * results reference the original ids, so the map highlight contract
   * `recommendedLocationId === candidate.locationId` must keep holding).
   */
  const replaceSites = useCallback((sites: CandidateLocation[]) => {
    setSites(sites.map((s) => ({
      locationId: s.locationId,
      name: s.name,
      location: s.location,
      origin: 'search' as const,
      outsideAoi: false,
    })));
    // Keep the id counter past any restored SITE-nn id to avoid collisions.
    for (const s of sites) {
      const m = /^SITE-(\d+)$/.exec(s.locationId);
      if (m) {
        const n = Number(m[1]) + 1;
        if (n > nextIdRef.current) nextIdRef.current = n;
      }
    }
  }, []);

  /** Re-validate every site against the current AOI (flags outsideAoi only if changed). */
  const validateAgainstAoi = useCallback((aoi: PolygonAOI | null) => {
    if (!aoi) return;
    setSites((prev) => {
      let changed = false;
      const next = prev.map((s) => {
        const outside = !isPointInAoi(s.location, aoi);
        if (s.outsideAoi !== outside) {
          changed = true;
          return { ...s, outsideAoi: outside };
        }
        return s;
      });
      return changed ? next : prev;
    });
  }, []);

  return { sites, addSiteAt, removeSite, renameSite, moveSite, clearSites, replaceSites, validateAgainstAoi };
}
