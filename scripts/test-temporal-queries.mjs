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

async function testQuery(name, dateStr, hourStr, filterType) {
  const aoi = createBoundingAOI({ latitude: 34.0522, longitude: -118.2437 }, 400);
  const reqBody = {
    polygon_aoi: aoi,
    date_time: {
      start_date: dateStr,
      start_time: hourStr,
      filter_type: filterType,
    },
    granularity: 60,
  };

  console.log(`\nTesting ${name}: ${dateStr} ${hourStr} with filter_type=${filterType}`);
  const submitRes = await fetch(`${BASE_URL}/v1/heatmap`, {
    method: "POST",
    headers: {
      "api-key": API_KEY,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(reqBody),
  });

  const submitJson = await submitRes.json();
  console.log(`  Submit response:`, JSON.stringify(submitJson));
  const activityId = submitJson.data?.activity_id;
  if (!activityId) return;

  for (let i = 1; i <= 10; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const pollRes = await fetch(`${BASE_URL}/v1/status/${activityId}`, {
      headers: { "api-key": API_KEY, accept: "application/json" },
    });
    const pollJson = await pollRes.json();
    const st = pollJson.data?.status;
    console.log(`  Poll #${i}: ${st}`);
    if (st === "Completed") {
      const result = pollJson.data?.result;
      const featCount = result?.map_data?.features?.length || (result?.type === "FeatureCollection" ? result.features?.length : 0);
      console.log(`  COMPLETED! Features: ${featCount}`);
      if (featCount > 0) {
        console.log(`  Sample prop:`, JSON.stringify((result.map_data || result).features[0].properties));
      } else {
        console.log(`  Full result:`, JSON.stringify(result));
      }
      return;
    }
    if (st === "Failed") {
      console.log(`  FAILED! Full response:`, JSON.stringify(pollJson));
      return;
    }
  }
}

async function run() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const currentHour = now.getUTCHours();
  const currentHourStr = `${String(currentHour).padStart(2, "0")}:00`;
  const futureHourStr = `${String((currentHour + 2) % 24).padStart(2, "0")}:00`;
  const pastHourStr = `${String((currentHour - 2 + 24) % 24).padStart(2, "0")}:00`;

  console.log(`Current UTC: ${now.toISOString()}`);
  console.log(`Testing past hour (${pastHourStr}), current hour (${currentHourStr}), future hour (${futureHourStr})`);

  await testQuery("Current Hour (filter_type: 1)", dateStr, currentHourStr, 1);
  await testQuery("Future Hour +2h (filter_type: 1)", dateStr, futureHourStr, 1);
  await testQuery("Past Hour -2h (filter_type: 1)", dateStr, pastHourStr, 1);
}

run().catch(console.error);
