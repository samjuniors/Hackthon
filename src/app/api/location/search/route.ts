import { NextResponse } from 'next/server';
import { searchLocations, getPresetLocations, resolveLocationPoint } from '@/lib/location/search';

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
  if (!q) {
    const isFixture = mode === 'FIXTURE';
    const presets = getPresetLocations(isFixture);
    return NextResponse.json({ success: true, results: presets });
  }

  const results = searchLocations(q);
  return NextResponse.json({
    success: true,
    results,
  });
}
