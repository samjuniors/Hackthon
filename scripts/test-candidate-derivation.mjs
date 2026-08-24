const API_KEY = "a57426b8…[REDACTED]";
const BASE_URL = "https://api.fortyguard.com";

function createBoundingAOI(center, halfSideMetres = 400) {
  const dLat = halfSideMetres / 111320;
  const dLon = halfSideMetres / (111320 * Math.cos((center.latitude * Math.PI) / 180));
  const ring = [
    [center.longitude - dLon, center.latitude - dLat],
    [center.longitude + dLon, center.latitude - dLat],
    [center.longitude + dLon, center.latitude + dLat],
    [center.longitude - dLon, center.latitude + dLat],
    [center.longitude - dLon, center.latitude - dLat],
  ];

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [ring],
        },
      },
    ],
  };
}

function getPolygonCentroid(geometry) {
  const ring = geometry.type === "Polygon" ? geometry.coordinates[0] : geometry.coordinates[0][0];
  let sumLat = 0, sumLon = 0, count = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    sumLon += ring[i][0];
    sumLat += ring[i][1];
    count++;
  }
  return { latitude: sumLat / count, longitude: sumLon / count };
}

function deriveLiveCandidatesFromAOI(center, aoi) {
  // 1. SITE-CENTER is the user location
  // 2. Find northernmost tile centroid
  // 3. Find southernmost tile centroid
  const tilesWithCentroids = aoi.features.map((f, idx) => ({
    tileId: f.properties?.tile_id ?? idx,
    centroid: getPolygonCentroid(f.geometry),
    feature: f,
  }));

  // Sort by latitude
  tilesWithCentroids.sort((a, b) => b.centroid.latitude - a.centroid.latitude);

  const northTile = tilesWithCentroids[0];
  const southTile = tilesWithCentroids[tilesWithCentroids.length - 1];

  return [
    {
      locationId: "SITE-N",
      name: "Site North (Upper Zone)",
      location: northTile.centroid,
    },
    {
      locationId: "SITE-CENTER",
      name: "Site Center (Selected Location)",
      location: center,
    },
    {
      locationId: "SITE-S",
      name: "Site South (Lower Zone)",
      location: southTile.centroid,
    },
  ];
}

async function testCity(name, lat, lon) {
  const center = { latitude: lat, longitude: lon };
  const aoi = createBoundingAOI(center, 400);
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const hourStr = `${String(now.getUTCHours()).padStart(2, "0")}:00`;

  const res = await fetch(`${BASE_URL}/v1/heatmap`, {
    method: "POST",
    headers: { "api-key": API_KEY, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ polygon_aoi: aoi, date_time: { start_date: dateStr, start_time: hourStr, filter_type: 1 }, granularity: 60 }),
  });
  const json = await res.json();
  const actId = json.data?.activity_id;

  let pollData = null;
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const p = await fetch(`${BASE_URL}/v1/status/${actId}`, { headers: { "api-key": API_KEY, accept: "application/json" } });
    pollData = await p.json();
    if (pollData.data?.status === "Completed") break;
  }

  const mapData = pollData.data?.result?.map_data || pollData.data?.result;
  console.log(`\n${name} (${lat}, ${lon}): returned ${mapData?.features?.length} tiles.`);

  const candidates = deriveLiveCandidatesFromAOI(center, mapData);
  console.log(`Derived Candidates:`);
  for (const c of candidates) {
    console.log(`  ${c.locationId} (${c.name}): lat=${c.location.latitude.toFixed(4)}, lon=${c.location.longitude.toFixed(4)}`);
  }
}

async function run() {
  await testCity("Los Angeles", 34.0522, -118.2437);
  await testCity("San Francisco", 37.7749, -122.4194);
  await testCity("San Diego", 32.7157, -117.1611);
}

run().catch(console.error);
