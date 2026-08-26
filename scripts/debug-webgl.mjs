import puppeteer from 'puppeteer-core';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 950 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE:', msg.text()));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 2000));

  const events = await page.evaluate(async () => {
    const map = window.__thermalMap;
    if (!map) return 'NO_MAP';

    const logs = [];
    map.on('error', (e) => logs.push({ type: 'error', error: e.error?.message || e.message }));
    map.on('sourcedata', (e) => logs.push({ type: 'sourcedata', sourceId: e.sourceId, isLoaded: e.isSourceLoaded, dataType: e.dataType }));

    // Push data to thermal-tiles
    const sample = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { average_temperature: 30 },
          geometry: {
            type: 'Polygon',
            coordinates: [[[-74.015, 40.708], [-74.002, 40.708], [-74.002, 40.716], [-74.015, 40.716], [-74.015, 40.708]]],
          },
        },
      ],
    };

    map.getSource('thermal-tiles').setData(sample);
    await new Promise((r) => setTimeout(r, 500));

    return {
      logs,
      isThermalLoaded: map.isSourceLoaded('thermal-tiles'),
    };
  });

  console.log('EVENT LOGS:', JSON.stringify(events, null, 2));
  await browser.close();
}

main().catch(console.error);
