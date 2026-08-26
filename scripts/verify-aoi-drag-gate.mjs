/**
 * Browser verification: dragging the DEMO AOI outside the captured FortyGuard
 * field shows the honest AOI_OUTSIDE_DEMO_CAPTURE gate — no provider call,
 * no synthetic data, no silent fallback.
 *
 * Run: node scripts/verify-aoi-drag-gate.mjs  (dev server on :3000)
 */
import { chromium } from '@playwright/test';

const browser = await chromium.launch({
  executablePath: '/home/z/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

let decisionCalls = 0;
page.on('request', (req) => {
  if (req.url().includes('/api/decision')) decisionCalls++;
});

await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
await page.getByTestId('thermal-cell-count').waitFor({ state: 'visible', timeout: 30000 });
await page.waitForTimeout(1500);

// Select City Hall (a DEMO site whose marker does NOT cover the AOI handle —
// the winner marker at Battery Park overlays the default handle position).
const searchInput = page.locator('input[placeholder*="earch"], input[placeholder*="location"]').first();
await searchInput.click();
await page.waitForTimeout(600);
const cityHallOption = page.getByTestId('location-option-DEMO-NYC-B');
await cityHallOption.waitFor({ state: 'visible', timeout: 10000 });
await cityHallOption.click({ force: true });
await page.waitForTimeout(2500);
await page.getByTestId('thermal-cell-count').waitFor({ state: 'visible', timeout: 30000 });
const callsBeforeDrag = decisionCalls;

// Locate the AOI drag handle.
const handle = page.locator('.aoi-drag-handle');
await handle.waitFor({ state: 'visible', timeout: 15000 });
const box = await handle.boundingBox();
const startX = box.x + box.width / 2;
const startY = box.y + box.height / 2;
console.log('handle at:', Math.round(startX), Math.round(startY));

// Compute meters-per-pixel from the live map to size the drag exactly.
const mapInfo = await page.evaluate(() => {
  const map = window.__thermalMap;
  return {
    zoom: map.getZoom(),
    center: map.getCenter(),
    bounds: map.getBounds(),
  };
});
const mpp = (156543.03392 * Math.cos((mapInfo.center.lat * Math.PI) / 180)) / Math.pow(2, mapInfo.zoom);
console.log('zoom:', mapInfo.zoom.toFixed(2), 'm/px:', mpp.toFixed(2));

// Capture extent edges (mirrored from the real capture).
const CAPTURE = { minLng: -74.01039553344097, maxLng: -73.98386966890105, minLat: 40.70093245304909, maxLat: 40.722643933843884 };
const metersWest = (mapInfo.center.lng - CAPTURE.minLng) * 111320 * Math.cos((40.71 * Math.PI) / 180) + 250; // +250m margin
const metersNorth = (CAPTURE.maxLat - mapInfo.center.lat) * 110574 + 250;
console.log('need ~', Math.round(metersWest), 'm west or', Math.round(metersNorth), 'm north to exit the capture');

// Drag WEST iteratively until the AOI exits the captured field (max 4 passes).
// Release each drag with a vertical offset from the marker center — MapLibre's
// dragend needs the map's mouseup (not swallowed by the marker element).
let gateShown = false;
for (let pass = 1; pass <= 4 && !gateShown; pass++) {
  const hb = await handle.boundingBox();
  const hx = hb.x + hb.width / 2;
  const hy = hb.y + hb.height / 2;
  const dx = -Math.min(340, hx - 500); // stay inside the map container
  console.log(`pass ${pass}: dragging ${Math.round(-dx)}px west from`, Math.round(hx), Math.round(hy));
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  const steps = 20;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(hx + (dx * i) / steps, hy - 28, { steps: 2 });
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
  await page.waitForTimeout(2200);
  const bodyText = await page.locator('body').textContent();
  gateShown = bodyText.includes('outside the captured DEMO dataset');
}

// Verify the honest gate.
const text = await page.locator('body').textContent();
gateShown = gateShown && text.includes('outside the captured DEMO dataset');
const coords = await page.getByTestId('active-analysis-location-coords').textContent();
console.log('AOI center now:', coords.trim().slice(0, 44));
console.log('gate message shown:', gateShown);

// Once the AOI is OUTSIDE the capture, NO further provider/decision call may
// happen (the client gate blocks before any fetch).
const callsAtGate = decisionCalls;
await page.waitForTimeout(2500);
const callsAfterWait = decisionCalls;
console.log('decision calls total:', callsAfterWait, '| after gate shown:', callsAtGate,
  '(no call for the outside AOI:', callsAfterWait === callsAtGate, ')');

await page.screenshot({ path: 'screenshots/P0-aoi-outside-capture.png' });
console.log('screenshot: screenshots/P0-aoi-outside-capture.png');
await browser.close();

if (!gateShown) {
  console.error('FAIL: the AOI-outside-capture gate did not appear');
  process.exit(1);
}
if (callsAfterWait !== callsAtGate) {
  console.error('FAIL: a decision call was made even though the AOI is outside the capture');
  process.exit(1);
}
console.log('PASS: drag-outside gate works — honest message, zero calls for the outside AOI');
