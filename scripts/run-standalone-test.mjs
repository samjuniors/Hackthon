import puppeteer from 'puppeteer-core';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ARTIFACT_DIR = 'C:\\Users\\STUDIO-1\\.gemini\\antigravity-ide\\brain\\69599f9a-3b67-4af8-925d-5337a1eb3d8c';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    defaultViewport: { width: 800, height: 600 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files'],
  });

  const page = await browser.newPage();
  const filePath = 'file:///' + path.resolve('scripts/test-standalone-maplibre.html').replace(/\\/g, '/');
  console.log('Navigating to:', filePath);
  await page.goto(filePath, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 2500));

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'test_standalone_screenshot.png') });
  await browser.close();
  console.log('Saved test_standalone_screenshot.png');
}

main().catch(console.error);
