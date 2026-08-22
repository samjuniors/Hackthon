import { NextResponse } from 'next/server';
import { searchLocations, getPresetLocations, resolveLocationPoint } from '@/lib/location/search';
import type { NamedLocation } from '@/types/provider';

interface NominatimResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  type?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  const mode = searchParams.get('mode');
  const latStr = searchParams.get('lat');
  const lonStr = searchParams.get('lon');

  // Reverse point resolution if lat & lon provided
  if (latStr && lonStr) {
    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    if (!isNaN(lat) && !isNaN(lon)) {
      const loc = resolveLocationPoint(lat, lon);
      return NextResponse.json({ success: true, location: loc });
    }
  }

  // Presets if no query
  if (!q || !q.trim()) {
    const isFixture = mode === 'FIXTURE';
    const presets = getPresetLocations(isFixture);
    return NextResponse.json({ success: true, results: presets });
  }

  const query = q.trim();
  const localResults = searchLocations(query);

  // If local catalog gave strong matches (>= 3), return immediately
  if (localResults.length >= 3) {
    return NextResponse.json({
      success: true,
      results: localResults,
    });
  }

  // Fallback to open geocoding for arbitrary addresses, landmarks, or international cities
  const combinedResults: NamedLocation[] = [...localResults];
  const seenKeys = new Set(localResults.map((l) => `${l.latitude.toFixed(2)},${l.longitude.toFixed(2)}`));

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);

    const geoUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=6`;
    const res = await fetch(geoUrl, {
      headers: {
        'User-Agent': 'ThermalDecisionEngine/1.0 (Hackathon MVP)',
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = (await res.json()) as NominatimResult[];
      for (const item of data) {
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        if (isNaN(lat) || isNaN(lon)) continue;

        const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);

        const shortName = item.name || item.display_name.split(',')[0].trim();
        const cityOrTown = item.address?.city || item.address?.town || item.address?.village || item.address?.county || '';
        const stateOrCountry = item.address?.state || item.address?.country || '';
        const subtitle = [cityOrTown, stateOrCountry].filter(Boolean).join(', ') || item.display_name;

        combinedResults.push({
          id: `GEO-${item.place_id}`,
          name: shortName,
          displayName: item.display_name,
          category: 'Custom Location',
          latitude: lat,
          longitude: lon,
          city: cityOrTown,
          state: item.address?.state,
          country: item.address?.country,
          zipCode: item.address?.postcode,
          isDemoOnly: false,
          description: subtitle,
        });

        if (combinedResults.length >= 8) break;
      }
    }
  } catch {
    // Gracefully ignore network timeout; return localResults
  }

  return NextResponse.json({
    success: true,
    results: combinedResults,
  });
}
