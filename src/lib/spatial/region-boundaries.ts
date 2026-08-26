/**
 * Accurate GeoJSON boundary geometries for Municipalities, Urban Boroughs & Territories.
 * Used to render the geographical boundary polygon (e.g. Manhattan Island, Lower Manhattan,
 * Los Angeles Urban Core, San Francisco Peninsula, Chicago Loop, London, etc.).
 */
import type { PolygonAOI } from '@/types/domain';

// Manhattan Island full borough coastline boundary
export const MANHATTAN_BOROUGH_BOUNDARY: [number, number][] = [
  [-74.0175, 40.7005], // Battery Park South Tip
  [-74.0182, 40.7065], // Battery Park City
  [-74.0150, 40.7180], // Tribeca Hudson River
  [-74.0115, 40.7310], // West Village
  [-74.0090, 40.7480], // Chelsea Piers
  [-74.0020, 40.7620], // Midtown West / Hell's Kitchen
  [-73.9920, 40.7760], // Upper West Side South
  [-73.9780, 40.8010], // Riverside Park / Columbia
  [-73.9530, 40.8350], // Washington Heights
  [-73.9280, 40.8690], // Inwood Hill Park North Tip
  [-73.9160, 40.8730], // Spuyten Duyvil
  [-73.9210, 40.8620], // Harlem River Drive
  [-73.9330, 40.8380], // Highbridge
  [-73.9310, 40.8080], // Harlem River
  [-73.9360, 40.7850], // East Harlem
  [-73.9430, 40.7680], // Upper East Side East River
  [-73.9610, 40.7480], // Midtown East / UN
  [-73.9720, 40.7310], // Stuyvesant Cove
  [-73.9740, 40.7130], // East River Park / Corlears Hook
  [-73.9870, 40.7070], // Manhattan Bridge Anchor
  [-74.0030, 40.7020], // Wall Street Waterfront
  [-74.0120, 40.6995], // Staten Island Ferry Terminal
  [-74.0175, 40.7005], // Close at Battery Park
];

// Lower Manhattan & Midtown Urban Corridor Boundary (Downtown Manhattan Focus)
export const LOWER_MANHATTAN_BOUNDARY: [number, number][] = [
  [-74.0175, 40.7005], // Battery Park South Tip
  [-74.0182, 40.7065], // Battery Park City
  [-74.0150, 40.7180], // Tribeca
  [-74.0115, 40.7310], // West Village / Houston St
  [-74.0050, 40.7450], // Chelsea South / 14th-23rd St
  [-73.9780, 40.7450], // Midtown East / 23rd St East River
  [-73.9720, 40.7310], // Stuyvesant Cove
  [-73.9740, 40.7130], // East River Park / Corlears Hook
  [-73.9870, 40.7070], // Manhattan Bridge Anchor
  [-74.0030, 40.7020], // Wall Street Waterfront
  [-74.0120, 40.6995], // Staten Island Ferry
  [-74.0175, 40.7005],
];

// Downtown & Core Los Angeles Territory Boundary
export const LOS_ANGELES_CORE_BOUNDARY: [number, number][] = [
  [-118.2950, 34.0750], // Koreatown / Westlake North
  [-118.2300, 34.0750], // Chinatown / Dodger Stadium
  [-118.2150, 34.0500], // Arts District East / LA River
  [-118.2250, 34.0250], // Industrial District South
  [-118.2750, 34.0250], // USC / Expo Park
  [-118.2950, 34.0500], // Pico-Union
  [-118.2950, 34.0750], // Close loop
];

// San Francisco Peninsula City Boundary
export const SAN_FRANCISCO_PENINSULA_BOUNDARY: [number, number][] = [
  [-122.5150, 37.7780], // Ocean Beach / Cliff House
  [-122.4780, 37.8100], // Presidio / Golden Gate Bridge South
  [-122.4100, 37.8080], // Fisherman's Wharf
  [-122.3900, 37.7980], // Embarcadero / Ferry Building
  [-122.3850, 37.7700], // Mission Bay
  [-122.3800, 37.7300], // Hunters Point
  [-122.4000, 37.7080], // SF South Border (Geneva Ave)
  [-122.5050, 37.7080], // Lake Merced / Pacific
  [-122.5150, 37.7780], // Close at Ocean Beach
];

// Chicago Loop & Central Business District Boundary
export const CHICAGO_LOOP_BOUNDARY: [number, number][] = [
  [-87.6550, 41.9050], // Near North / River North
  [-87.6150, 41.9050], // Navy Pier / Lake Shore
  [-87.6100, 41.8600], // Museum Campus / Northerly Island
  [-87.6400, 41.8600], // South Loop / Canal St
  [-87.6550, 41.8800], // West Loop
  [-87.6550, 41.9050], // Close loop
];

// Central London / Greater London Core Boundary
export const LONDON_CENTRAL_BOUNDARY: [number, number][] = [
  [-0.1900, 51.5250], // Regent's Park / Marylebone
  [-0.0700, 51.5250], // Shoreditch / City North
  [-0.0500, 51.5050], // Tower Bridge / Wapping
  [-0.0700, 51.4850], // Southwark / Bermondsey
  [-0.1400, 51.4850], // Vauxhall / Westminster South
  [-0.1900, 51.5000], // Kensington / Hyde Park
  [-0.1900, 51.5250], // Close loop
];

// Austin Downtown & Lady Bird Lake Corridor Boundary
export const AUSTIN_CORE_BOUNDARY: [number, number][] = [
  [-97.7700, 30.2900], // West Campus / Clarksville
  [-97.7200, 30.2900], // East Austin North
  [-97.7150, 30.2500], // East Riverside
  [-97.7650, 30.2500], // South Congress / Zilker
  [-97.7700, 30.2900],
];

// Miami Downtown & Brickell Coastal Boundary
export const MIAMI_CORE_BOUNDARY: [number, number][] = [
  [-80.2150, 25.7950], // Wynwood / Edgewater
  [-80.1750, 25.7950], // Venetian Causeway / PortMiami
  [-80.1750, 25.7500], // Brickell Key / Biscayne Bay
  [-80.2150, 25.7500], // Little Havana / Coral Way
  [-80.2150, 25.7950],
];

// Houston Downtown & Inner Loop Boundary
export const HOUSTON_CORE_BOUNDARY: [number, number][] = [
  [-95.4000, 29.7850], // Houston Heights / Washington Ave
  [-95.3450, 29.7850], // East Downtown North
  [-95.3450, 29.7350], // EDo South / University of Houston
  [-95.4000, 29.7350], // Montrose / Midtown South
  [-95.4000, 29.7850],
];

// Dubai Downtown & Coastal Urban Corridor Boundary
export const DUBAI_CORE_BOUNDARY: [number, number][] = [
  [55.2300, 25.2200], // Jumeirah North
  [55.3000, 25.2200], // Deira / Creek
  [55.3000, 25.1700], // Business Bay / Downtown East
  [55.2300, 25.1700], // Safa / Jumeirah South
  [55.2300, 25.2200],
];

// Tokyo Central Urban Core Boundary
export const TOKYO_CORE_BOUNDARY: [number, number][] = [
  [139.7200, 35.7100], // Shinjuku / Bunkyo North
  [139.7900, 35.7100], // Asakusa / Ueno East
  [139.7900, 35.6500], // Tokyo Bay / Minato Waterfront
  [139.7200, 35.6500], // Shibuya / Roppongi
  [139.7200, 35.7100],
];

// Map of municipal/state/city keys to boundary coordinates
const REGION_BOUNDARIES: Record<string, [number, number][]> = {
  // Manhattan & NYC
  MANHATTAN: MANHATTAN_BOROUGH_BOUNDARY,
  NYC: MANHATTAN_BOROUGH_BOUNDARY,
  'NEW YORK': MANHATTAN_BOROUGH_BOUNDARY,
  NY: MANHATTAN_BOROUGH_BOUNDARY,
  'DEMO-NYC-A': MANHATTAN_BOROUGH_BOUNDARY,
  'DEMO-NYC-B': MANHATTAN_BOROUGH_BOUNDARY,
  'DEMO-NYC-C': MANHATTAN_BOROUGH_BOUNDARY,
  'BATTERY PARK': MANHATTAN_BOROUGH_BOUNDARY,
  'CITY HALL': MANHATTAN_BOROUGH_BOUNDARY,
  CHINATOWN: MANHATTAN_BOROUGH_BOUNDARY,

  // Los Angeles
  LA: LOS_ANGELES_CORE_BOUNDARY,
  'LOS ANGELES': LOS_ANGELES_CORE_BOUNDARY,
  CA: LOS_ANGELES_CORE_BOUNDARY,
  'US-LAX': LOS_ANGELES_CORE_BOUNDARY,

  // San Francisco
  SF: SAN_FRANCISCO_PENINSULA_BOUNDARY,
  'SAN FRANCISCO': SAN_FRANCISCO_PENINSULA_BOUNDARY,
  'US-SFO': SAN_FRANCISCO_PENINSULA_BOUNDARY,

  // Chicago
  CHI: CHICAGO_LOOP_BOUNDARY,
  CHICAGO: CHICAGO_LOOP_BOUNDARY,
  IL: CHICAGO_LOOP_BOUNDARY,
  'US-CHI': CHICAGO_LOOP_BOUNDARY,

  // London / UK
  UK: LONDON_CENTRAL_BOUNDARY,
  GB: LONDON_CENTRAL_BOUNDARY,
  LONDON: LONDON_CENTRAL_BOUNDARY,
  'UNITED KINGDOM': LONDON_CENTRAL_BOUNDARY,

  // Austin
  ATX: AUSTIN_CORE_BOUNDARY,
  AUSTIN: AUSTIN_CORE_BOUNDARY,
  TX: AUSTIN_CORE_BOUNDARY,
  'US-AUS': AUSTIN_CORE_BOUNDARY,

  // Miami
  MIA: MIAMI_CORE_BOUNDARY,
  MIAMI: MIAMI_CORE_BOUNDARY,
  FL: MIAMI_CORE_BOUNDARY,
  'US-MIA': MIAMI_CORE_BOUNDARY,

  // Houston
  HOU: HOUSTON_CORE_BOUNDARY,
  HOUSTON: HOUSTON_CORE_BOUNDARY,
  'US-HOU': HOUSTON_CORE_BOUNDARY,

  // Dubai / UAE
  UAE: DUBAI_CORE_BOUNDARY,
  DUBAI: DUBAI_CORE_BOUNDARY,
  'ABU DHABI': DUBAI_CORE_BOUNDARY,

  // Tokyo / Japan
  JP: TOKYO_CORE_BOUNDARY,
  JAPAN: TOKYO_CORE_BOUNDARY,
  TOKYO: TOKYO_CORE_BOUNDARY,
};

/**
 * Get GeoJSON FeatureCollection representing the geographical/municipal boundary polygon
 * for the selected location (e.g. Manhattan Island for NYC, Downtown LA for LA, SF Peninsula for SF).
 */
export function getRegionBoundaryPolygon(
  stateOrCode?: string,
  cityName?: string,
  centerLat?: number,
  centerLon?: number,
): PolygonAOI | null {
  const normState = (stateOrCode || '').toUpperCase().trim();
  const normCity = (cityName || '').toUpperCase().trim();

  let rawCoords: [number, number][] | undefined;

  // 1. Direct key match
  if (REGION_BOUNDARIES[normCity]) {
    rawCoords = REGION_BOUNDARIES[normCity];
  } else if (REGION_BOUNDARIES[normState]) {
    rawCoords = REGION_BOUNDARIES[normState];
  } else {
    // 2. Partial substring search
    for (const [key, coords] of Object.entries(REGION_BOUNDARIES)) {
      if (normCity.includes(key) || normState.includes(key)) {
        rawCoords = coords;
        break;
      }
    }
  }

  // 3. Proximity detection to known hubs
  if (!rawCoords && Number.isFinite(centerLat) && Number.isFinite(centerLon)) {
    const lat = centerLat as number;
    const lon = centerLon as number;
    if (Math.abs(lat - 40.712) < 0.15 && Math.abs(lon - (-74.008)) < 0.15) {
      rawCoords = MANHATTAN_BOROUGH_BOUNDARY;
    } else if (Math.abs(lat - 34.052) < 0.15 && Math.abs(lon - (-118.243)) < 0.15) {
      rawCoords = LOS_ANGELES_CORE_BOUNDARY;
    } else if (Math.abs(lat - 37.774) < 0.15 && Math.abs(lon - (-122.419)) < 0.15) {
      rawCoords = SAN_FRANCISCO_PENINSULA_BOUNDARY;
    } else if (Math.abs(lat - 41.878) < 0.15 && Math.abs(lon - (-87.629)) < 0.15) {
      rawCoords = CHICAGO_LOOP_BOUNDARY;
    } else if (Math.abs(lat - 51.507) < 0.15 && Math.abs(lon - (-0.127)) < 0.15) {
      rawCoords = LONDON_CENTRAL_BOUNDARY;
    } else {
      // Clean 4km contextual municipal bounding box
      const spanLat = 0.040;
      const spanLon = 0.050;
      rawCoords = [
        [lon - spanLon, lat - spanLat],
        [lon + spanLon, lat - spanLat],
        [lon + spanLon, lat + spanLat],
        [lon - spanLon, lat + spanLat],
        [lon - spanLon, lat - spanLat],
      ];
    }
  }

  if (rawCoords && rawCoords.length > 0) {
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            name: `${cityName || stateOrCode || 'Regional'} Territory Boundary`,
            state: stateOrCode,
            city: cityName,
            isRegionBoundary: true,
          },
          geometry: {
            type: 'Polygon',
            coordinates: [rawCoords],
          },
        },
      ],
    };
  }

  return null;
}

/**
 * Creates an inverted mask polygon (Donut polygon) that covers the entire world EXCEPT
 * the specified region polygon. Used to dim / darken the outer map and spotlight
 * only the selected municipal territory.
 */
export function getInvertedMaskPolygon(innerBoundary: PolygonAOI | null): PolygonAOI | null {
  if (!innerBoundary || innerBoundary.features.length === 0) return null;
  const geom = innerBoundary.features[0].geometry as { type: string; coordinates: number[][][] };
  if (!geom || !geom.coordinates || geom.coordinates.length === 0) return null;

  const worldOuterRing: [number, number][] = [
    [-180, -85],
    [180, -85],
    [180, 85],
    [-180, 85],
    [-180, -85],
  ];

  const holeRing = geom.coordinates[0];

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { isMask: true },
        geometry: {
          type: 'Polygon',
          coordinates: [worldOuterRing, holeRing],
        },
      },
    ],
  };
}
