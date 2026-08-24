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

async function testLocation(name, lat, lon) {
  console.log(`\n======================================================`);
  console.log(`DIAGNOSTIC TEST FOR: ${name} (${lat}, ${lon})`);
  console.log(`======================================================`);

  const now = new Date();
  const currentUtcIso = now.toISOString();
  console.log(`Current UTC Timestamp: ${currentUtcIso}`);

  // Model default window
  const nowZeroMin = new Date(now);
  nowZeroMin.setUTCMinutes(0, 0, 0);
  const allowedStart = nowZeroMin.toISOString();
  const spanHours = 6;
  const durationHours = 3;
  const allowedEnd = new Date(nowZeroMin.getTime() + spanHours * 3600 * 1000).toISOString();

  console.log(`Requested Start Timestamp: ${allowedStart}`);
  console.log(`Requested End Timestamp: ${allowedEnd}`);
  console.log(`Requested durationHours: ${durationHours}`);

  const startMs = new Date(allowedStart).getTime();
  const endMs = new Date(allowedEnd).getTime();

  const hourlyTimestamps = [];
  for (let tMs = startMs; tMs < endMs; tMs += 3600 * 1000) {
    hourlyTimestamps.push(new Date(tMs).toISOString());
  }
  console.log(`Timestamps Expected by Evaluator (${hourlyTimestamps.length} hours):`);
  hourlyTimestamps.forEach(ts => console.log(`  - ${ts}`));

  const aoi = createBoundingAOI({ latitude: lat, longitude: lon }, 400);
  console.log(`Bounding Box coordinates:`, JSON.stringify(aoi.features[0].geometry.coordinates[0]));

  // Test FortyGuard API for each timestamp
  for (const timestamp of hourlyTimestamps) {
    const d = new Date(timestamp);
    const dateStr = d.toISOString().slice(0, 10);
    const hourStr = `${String(d.getUTCHours()).padStart(2, "0")}:00`;

    const reqBody = {
      polygon_aoi: aoi,
      date_time: {
        start_date: dateStr,
        start_time: hourStr,
        filter_type: 1,
      },
      granularity: 60,
    };

    console.log(`\n--> Submitting /v1/heatmap for ${dateStr} ${hourStr} UTC (timestamp: ${timestamp})`);
    console.log(`    Request Body date_time:`, JSON.stringify(reqBody.date_time));

    const submitRes = await fetch(`${BASE_URL}/v1/heatmap`, {
      method: "POST",
      headers: {
        "api-key": API_KEY,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(reqBody),
    });

    console.log(`    Submit HTTP Status: ${submitRes.status} ${submitRes.statusText}`);
    const submitJson = await submitRes.json();
    console.log(`    Submit Response:`, JSON.stringify(submitJson));

    const activityId = submitJson.data?.activity_id;
    if (!activityId) {
      console.log(`    ERROR: No activity_id returned!`);
      continue;
    }

    console.log(`    FortyGuard activity_id: ${activityId}`);

    // Poll for completion
    let pollCount = 0;
    let status = "Processing";
    let pollData = null;
    while (pollCount < 15 && status !== "Completed" && status !== "Failed") {
      pollCount++;
      await new Promise(r => setTimeout(r, 2000));
      const pollRes = await fetch(`${BASE_URL}/v1/status/${activityId}`, {
        headers: {
          "api-key": API_KEY,
          accept: "application/json",
        },
      });
      pollData = await pollRes.json();
      status = pollData.data?.status;
      console.log(`    Poll #${pollCount} (status: ${status})`);
    }

    console.log(`    Final Polling Status: ${status}`);
    const result = pollData?.data?.result;
    console.log(`    Result Keys:`, result ? Object.keys(result) : "null");
    
    let returnedAoi = null;
    if (result && typeof result === "object" && "map_data" in result && result.map_data?.type === "FeatureCollection") {
      returnedAoi = result.map_data;
    } else if (result && typeof result === "object" && "type" in result && result.type === "FeatureCollection") {
      returnedAoi = result;
    }

    const featureCount = returnedAoi?.features?.length || 0;
    console.log(`    Returned Feature Count: ${featureCount}`);
    if (featureCount > 0) {
      console.log(`    First Feature Properties:`, JSON.stringify(returnedAoi.features[0].properties));
      console.log(`    First Feature Geometry Type:`, returnedAoi.features[0].geometry.type);
    } else {
      console.log(`    WARNING: Feature count is 0 or result empty!`);
      console.log(`    Full result payload:`, JSON.stringify(result));
    }

    // Test 1 hour
    break;
  }
}

async function run() {
  await testLocation("Los Angeles", 34.0522, -118.2437);
  await testLocation("San Francisco", 37.7749, -122.4194);
}

run().catch(console.error);
