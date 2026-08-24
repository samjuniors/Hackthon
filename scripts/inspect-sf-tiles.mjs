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

// Point in polygon
function pointInPolygon(point, geometry) {
  if (!geometry || !geometry.coordinates) return false;
  const rings = geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates[0];
  if (!rings || !rings[0]) return false;
  const ring = rings[0];
  const x = point.longitude;
  const y = point.latitude;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

async function inspectSF() {
  const sfCenter = { latitude: 37.7749, longitude: -122.4194 };
  const dLat = 400 / 111320;
  const candidates = [
    { id: "SITE-N", pt: { latitude: sfCenter.latitude + dLat * 0.6, longitude: sfCenter.longitude } },
    { id: "SITE-CENTER", pt: { latitude: sfCenter.latitude, longitude: sfCenter.longitude } },
    { id: "SITE-S", pt: { latitude: sfCenter.latitude - dLat * 0.6, longitude: sfCenter.longitude } },
  ];

  const aoi = createBoundingAOI(sfCenter, 400);
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const hourStr = `${String(now.getUTCHours()).padStart(2, "0")}:00`;

  console.log(`Submitting SF heatmap query for ${dateStr} ${hourStr}...`);
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

  const result = pollData.data?.result;
  const mapData = result?.map_data || result;
  console.log(`SF Completed with ${mapData?.features?.length} features.`);

  // Check candidates against all tile features
  for (const cand of candidates) {
    let matchedTile = null;
    for (const f of mapData.features) {
      if (pointInPolygon(cand.pt, f.geometry)) {
        matchedTile = f;
        break;
      }
    }
    console.log(`Candidate ${cand.id} (${cand.pt.latitude.toFixed(4)}, ${cand.pt.longitude.toFixed(4)}): matched tile = ${matchedTile ? matchedTile.properties?.tile_id : "NONE (OUTSIDE TILES)"}`);
  }

  // Find bounding box of all returned tile polygons
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  for (const f of mapData.features) {
    const ring = f.geometry.coordinates[0];
    for (const pt of ring) {
      if (pt[1] < minLat) minLat = pt[1];
      if (pt[1] > maxLat) maxLat = pt[1];
      if (pt[0] < minLon) minLon = pt[0];
      if (pt[0] > maxLon) maxLon = pt[0];
    }
  }
  console.log(`Returned tiles bounding box: Lat [${minLat.toFixed(4)}, ${maxLat.toFixed(4)}], Lon [${minLon.toFixed(4)}, ${maxLon.toFixed(4)}]`);
  console.log(`Requested AOI bounding box: Lat [${(sfCenter.latitude - dLat).toFixed(4)}, ${(sfCenter.latitude + dLat).toFixed(4)}], Lon [${(sfCenter.longitude - 400/(111320*Math.cos(sfCenter.latitude*Math.PI/180))).toFixed(4)}, ${(sfCenter.longitude + 400/(111320*Math.cos(sfCenter.latitude*Math.PI/180))).toFixed(4)}]`);
}

inspectSF().catch(console.error);
