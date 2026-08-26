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
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 2000));

  const debug = await page.evaluate(() => {
    const map = window.__thermalMap;
    if (!map) return 'NO_MAP';

    const layers = map.getStyle().layers.map((l) => ({
      id: l.id,
      type: l.type,
      source: l.source,
      visibility: map.getLayoutProperty(l.id, 'visibility') ?? 'visible',
      paint: l.paint,
    }));

    const sources = {};
    for (const key of ['thermal-tiles', 'region-boundary', 'analysis-aoi', 'region-mask']) {
      const src = map.getSource(key);
      sources[key] = src ? src.serialize() : null;
    }

    return {
      sources,
      layers,
    };
  });

  console.log('MAP DEBUG:\n', JSON.stringify(debug, null, 2));
  await browser.close();
}

main().catch(console.error);
