'use client';

/**
 * Candidate-site management hook (Section 8).
 *
 * REAL sites only — the user explicitly adds each candidate by:
 *   - clicking the map inside the analysis area, or
 *   - searching a site/address.
 * Nothing is auto-generated. Geographic offsets are never invented sites.
 *
 * Containment (Section 9): a candidate outside the analysis AOI is flagged
 * `outsideAoi` — surfaced as an error, never silently moved or clamped.
 */
import { useState, useCallback, useRef } from 'react';
import type { CandidateLocation, LocationPoint, PolygonAOI } from '@/types/domain';
import { isPointInAoi } from '@/lib/spatial/aoi';

export interface CandidateSite extends CandidateLocation {
  /** True when the site falls outside the current AOI (validation flag). */
  outsideAoi?: boolean;
  /** How the site was added — provenance label in the UI. */
  origin: 'map-click' | 'search' | 'demo-captured';
}

export function useCandidateSites() {
  const [sites, setSites] = useState<CandidateSite[]>([]);
  const nextIdRef = useRef(1);

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

  const clearSites = useCallback(() => {
    setSites([]);
  }, []);

  /** Re-validate every site against the current AOI (flags outsideAoi). */
  const validateAgainstAoi = useCallback((aoi: PolygonAOI | null) => {
    if (!aoi) return;
    setSites((prev) => prev.map((s) => ({ ...s, outsideAoi: !isPointInAoi(s.location, aoi) })));
  }, []);

  return { sites, addSiteAt, removeSite, renameSite, clearSites, validateAgainstAoi };
}
