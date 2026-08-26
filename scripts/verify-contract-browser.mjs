/**
 * Browser-level verification of the P0/P1/P2 contract corrections against the
 * running dev server (http://localhost:3000). Run with:
 *   node scripts/verify-contract-browser.mjs
 */
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch({
  executablePath: '/home/z/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    const url = msg.location()?.url || '';
    // Filter benign missing-favicon resource errors.
    if (url.includes('favicon')) return;
    consoleErrors.push(`${msg.text().slice(0, 160)} (${url.slice(0, 80)})`);
  }
});
page.on('pageerror', (err) => consoleErrors.push(`PAGEERROR: ${err.message.slice(0, 200)}`));

await page.goto(BASE, { waitUntil: 'domcontentloaded' });

// 1. DEMO pipeline auto-runs and completes with the REAL capture.
const cellCount = page.getByTestId('thermal-cell-count');
await cellCount.waitFor({ state: 'visible', timeout: 30000 });
check('DEMO renders 425 real provider cells', (await cellCount.textContent()) === '425 thermal cells',
  await cellCount.textContent());

// 2. Recommended plan appears (deterministic engine ran on real data).
await page.getByText('Recommended Plan').waitFor({ state: 'visible', timeout: 20000 });
check('Recommended Plan renders from the real captured field', true);

// 3. Thermal-cell granularity label shows the capture's ACTUAL 100m.
const mapProvenance = page.getByTestId('map-temporal-provenance');
const provText = (await mapProvenance.textContent()) || '';
check('Map provenance shows 100m granularity', provText.includes('100m'),
  provText.slice(0, 160));
check('Map provenance window is UTC-labeled (capture-anchored)', provText.includes('UTC') && !provText.includes('EDT'));

// 4. DEMO notice states the truthful capture facts.
const notice = page.getByTestId('demo-capture-notice');
const noticeText = (await notice.textContent()) || '';
check('DEMO notice: DEMO · Captured FortyGuard', noticeText.includes('DEMO · Captured FortyGuard'));
check('DEMO notice: 100m cell resolution', noticeText.includes('100m cell resolution'));
check('DEMO notice: model hour 2026-08-14 12:00 UTC', noticeText.includes('2026-08-14') && noticeText.includes('12:00 UTC'));
check('DEMO notice: captured 2026-08-21 06:17 UTC', noticeText.includes('2026-08-21') && noticeText.includes('06:17 UTC'));
check('DEMO notice: 425 provider cells · 1-hour snapshot', noticeText.includes('425 provider cells') && noticeText.includes('1-hour snapshot'));

// 5. Evaluation Window: exactly Single hour + Time range (no Single Day).
check('Evaluation Window label present', await page.getByText('Evaluation Window').count() > 0);
check('Single hour option present', await page.getByTestId('evaluation-window-single-hour').count() > 0);
check('Time range option present', await page.getByTestId('evaluation-window-range-of-hours').count() > 0);
const bodyText = await page.locator('body').textContent();
check('"Single Day" is NOT offered', !(bodyText || '').includes('Single Day'));
check('Range semantics disclosed (hourly requests)', (bodyText || '').includes('sequence of hourly FortyGuard requests'));

// 6. DEMO CANDIDATES labelling (not "captured sites").
const candSection = page.getByTestId('candidate-sites-section');
const candText = (await candSection.textContent()) || '';
check('Candidate section labelled DEMO CANDIDATES', candText.includes('DEMO CANDIDATES'));
check('Candidates labelled "demo candidate" (never "captured demo sites")',
  candText.includes('demo candidate') && !candText.includes('captured demo sites'));

// 7. WHEN inputs anchored to the capture (read-only, UTC).
const whenSection = page.getByTestId('when-section');
const whenText = (await whenSection.textContent()) || '';
const dateValue = await whenSection.locator('input[type="date"]').inputValue();
check('WHEN date input = captured date 2026-08-14', dateValue === '2026-08-14', dateValue);
const hourValue = await whenSection.locator('input[type="time"]').first().inputValue();
check('WHEN hour input = captured hour 12:00', hourValue === '12:00', hourValue);
check('WHEN preview shows UTC (capture-anchored, not EDT)', whenText.includes('UTC') && !whenText.includes('EDT'));

// 8. Map canvas renders (MapLibre).
await page.waitForTimeout(2500);
const canvasVisible = await page.locator('canvas').first().isVisible();
check('MapLibre canvas visible', canvasVisible);

// 9. Sticky-footer / layout sanity: main is flex-col min-h-screen.
const mainClass = await page.locator('main').getAttribute('class');
check('Root layout uses min-h-screen flex column', (mainClass || '').includes('min-h-screen') && (mainClass || '').includes('flex-col'));

// 10. No console/page errors during DEMO load.
check('No console/page errors during DEMO load', consoleErrors.length === 0,
  consoleErrors.slice(0, 3).join(' | ') || 'clean');

// 11. The DEMO captured-field extent layer exists on the map (dashed outline).
const hasCaptureLayer = await page.evaluate(() => {
  const map = window.__thermalMap;
  return !!(map && typeof map.getLayer === 'function' && map.getLayer('capture-extent-outline'));
});
check('Map renders the captured-field extent layer (DEMO)', hasCaptureLayer);

// 12. Mobile viewport sanity — layout holds, no horizontal overflow.
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(1200);
const overflow = await page.evaluate(() =>
  document.documentElement.scrollWidth - document.documentElement.clientWidth
);
check('Mobile viewport: no horizontal overflow', overflow <= 1, `overflow=${overflow}px`);
const mobileCanvas = await page.locator('canvas').first().isVisible();
check('Mobile viewport: map canvas visible', mobileCanvas);

// Summary
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
await browser.close();
process.exit(failed.length > 0 ? 1 : 0);
