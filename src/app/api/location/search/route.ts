import { NextResponse } from 'next/server';
import { geocodeSearch, reverseGeocode } from '@/lib/location/geocode';
import { getPresetLocations } from '@/lib/location/search';
import { lookupTimezone } from '@/lib/location/timezone-lookup';

/**
 * Real location search — geocoding via Photon (primary) + Nominatim (fallback).
 *
 * PROVENANCE CONTRACT:
 *   - This endpoint NEVER calls FortyGuard. Search is credit-free.
 *   - Results are genuine geocoder results: state / city / neighborhood /
 *     street / address / POI / ZIP, each resolved to exact coordinates and an
 *     offline-derived IANA timezone.
 *   - If both geocoders are unreachable, the curated verified catalog is
 *     returned and the response marks `source: 'catalog-fallback'` so the UI
 *     can label it honestly (never fabricated coordinates).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  const mode = searchParams.get('mode');
  const latStr = searchParams.get('lat');
  const lonStr = searchParams.get('lon');

  // Reverse point resolution if lat & lon provided (GPS / map-click / drag naming)
  if (latStr && lonStr) {
    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    if (!isNaN(lat) && !isNaN(lon)) {
      const loc = await reverseGeocode(lat, lon);
      loc.timezone = loc.timezone || lookupTimezone(lat, lon);
      return NextResponse.json({ success: true, location: loc });
    }
  }

  // Presets if no query
  if (!q || !q.trim()) {
    const isFixture = mode === 'FIXTURE';
    const presets = getPresetLocations(isFixture);
    return NextResponse.json({ success: true, results: presets, source: 'presets' });
  }

  const { results, source } = await geocodeSearch(q.trim(), { limit: 6, timeoutMs: 6000 });

  return NextResponse.json({
    success: true,
    results,
    source,
  });
}
