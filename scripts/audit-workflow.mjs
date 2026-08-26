import puppeteer from 'puppeteer-core';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ARTIFACT_DIR = 'C:\\Users\\STUDIO-1\\.gemini\\antigravity-ide\\brain\\69599f9a-3b67-4af8-925d-5337a1eb3d8c';

async function audit() {
  console.log('=== RUNNING COMPREHENSIVE HUMAN-VISIBLE SPATIAL WORKFLOW AUDIT ===');
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 950 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  console.log('1. Loading application at http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2000));

  // A. Initial State Screenshot (New York fixture)
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_A_initial_state.png') });
  console.log('Saved audit_A_initial_state.png');

  // B. Select Los Angeles (Polygon mode, Dark)
  console.log('2. Selecting Los Angeles...');
  await page.evaluate(() => {
    const chip = document.querySelector('button[data-testid="preset-chip-US-LAX"]') ||
      Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Los Angeles'));
    if (chip) chip.click();
  });
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_B_los_angeles_polygon.png') });
  console.log('Saved audit_B_los_angeles_polygon.png');

  // C. Switch to Circle Mode in Los Angeles
  console.log('3. Switching to Circle AOI mode in Los Angeles...');
  await page.evaluate(() => {
    const circleBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Circle'));
    if (circleBtn) circleBtn.click();
  });
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_C_los_angeles_circle.png') });
  console.log('Saved audit_C_los_angeles_circle.png');

  // D. Select San Francisco
  console.log('4. Selecting San Francisco...');
  await page.evaluate(() => {
    const chip = document.querySelector('button[data-testid="preset-chip-US-SFO"]') ||
      Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('San Francisco'));
    if (chip) chip.click();
  });
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_D_san_francisco.png') });
  console.log('Saved audit_D_san_francisco.png');

  // E. Select Chicago (Illinois)
  console.log('5. Selecting Chicago...');
  await page.evaluate(() => {
    const chip = document.querySelector('button[data-testid="preset-chip-US-CHI"]') ||
      Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Chicago'));
    if (chip) chip.click();
  });
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_E_chicago.png') });
  console.log('Saved audit_E_chicago.png');

  // F. Select Austin (Texas)
  console.log('6. Selecting Austin...');
  await page.evaluate(() => {
    const chip = document.querySelector('button[data-testid="preset-chip-US-AUS"]') ||
      Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Austin'));
    if (chip) chip.click();
  });
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_F_austin_texas.png') });
  console.log('Saved audit_F_austin_texas.png');

  // G. Select Miami (Florida)
  console.log('7. Selecting Miami...');
  await page.evaluate(() => {
    const chip = document.querySelector('button[data-testid="preset-chip-US-MIA"]') ||
      Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Miami'));
    if (chip) chip.click();
  });
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_G_miami_florida.png') });
  console.log('Saved audit_G_miami_florida.png');

  // H. Test Light Mode in Los Angeles
  console.log('8. Switching back to Los Angeles and toggling Light Mode...');
  await page.evaluate(() => {
    const chip = document.querySelector('button[data-testid="preset-chip-US-LAX"]') ||
      Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Los Angeles'));
    if (chip) chip.click();
  });
  await new Promise((r) => setTimeout(r, 2000));

  const themeToggle = await page.$('button[title*="Light Mode"], button[title*="Dark Mode"]');
  if (themeToggle) {
    await themeToggle.click();
    await new Promise((r) => setTimeout(r, 1500));
  }
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_H_los_angeles_light.png') });
  console.log('Saved audit_H_los_angeles_light.png');

  await browser.close();
  console.log('=== AUDIT COMPLETE ===');
}

audit().catch((e) => {
  console.error(e);
  process.exit(1);
});
