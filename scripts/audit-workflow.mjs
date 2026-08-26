import puppeteer from 'puppeteer-core';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ARTIFACT_DIR = 'C:\\Users\\STUDIO-1\\.gemini\\antigravity-ide\\brain\\69599f9a-3b67-4af8-925d-5337a1eb3d8c';

async function audit() {
  console.log('=== RUNNING FINAL VERIFIED PROVENANCE & SPATIAL WORKFLOW AUDIT ===');
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 950 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  // 1. DEMO Manhattan Polygon Dark
  console.log('1. Loading DEMO Manhattan Polygon (Dark)...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_1_demo_manhattan_polygon_dark.png') });
  console.log('Saved audit_1_demo_manhattan_polygon_dark.png');

  // 2. DEMO Manhattan Circle Dark (City Hall)
  console.log('2. Switching to City Hall and Circle AOI...');
  await page.evaluate(() => {
    const chip = document.querySelector('button[data-testid="preset-chip-DEMO-NYC-B"]') ||
      Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('City Hall'));
    if (chip) chip.click();
  });
  await new Promise((r) => setTimeout(r, 1000));
  await page.evaluate(() => {
    const circleBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Circle'));
    if (circleBtn) circleBtn.click();
  });
  await new Promise((r) => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_2_demo_manhattan_circle_dark.png') });
  console.log('Saved audit_2_demo_manhattan_circle_dark.png');

  // 3. DEMO Manhattan Light Mode
  console.log('3. Toggling Light Mode in DEMO Manhattan...');
  const themeToggle = await page.$('button[title*="Light Mode"], button[title*="Dark Mode"]');
  if (themeToggle) {
    await themeToggle.click();
    await new Promise((r) => setTimeout(r, 1500));
  }
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_3_demo_manhattan_light.png') });
  console.log('Saved audit_3_demo_manhattan_light.png');

  // 4. Region State View
  console.log('4. Zooming to State View...');
  await page.evaluate(() => {
    const stateBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('State View'));
    if (stateBtn) stateBtn.click();
  });
  await new Promise((r) => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_4_state_region_view.png') });
  console.log('Saved audit_4_state_region_view.png');

  // 5. Switch back to Dark Theme and Local Fit
  console.log('5. Restoring local view and Dark mode...');
  const darkThemeToggle = await page.$('button[title*="Dark Mode"], button[title*="Light Mode"]');
  if (darkThemeToggle) {
    await darkThemeToggle.click();
    await new Promise((r) => setTimeout(r, 1000));
  }
  await page.evaluate(() => {
    const fitBtn = Array.from(document.querySelectorAll('button')).find((b) => b.title?.includes('Fit Viewport'));
    if (fitBtn) fitBtn.click();
  });
  await new Promise((r) => setTimeout(r, 1500));

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_5_demo_final_verified.png') });
  console.log('Saved audit_5_demo_final_verified.png');

  await browser.close();
  console.log('=== AUDIT SCRIPTS COMPLETE ===');
}

audit().catch((e) => {
  console.error(e);
  process.exit(1);
});
