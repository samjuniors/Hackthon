import puppeteer from 'puppeteer-core';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ARTIFACT_DIR = 'C:\\Users\\STUDIO-1\\.gemini\\antigravity-ide\\brain\\69599f9a-3b67-4af8-925d-5337a1eb3d8c';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 950 },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-gl=angle',
    ],
  });

  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 2000));

  // Check WebGL vendor and renderer
  const glInfo = await page.evaluate(() => {
    const canvas = document.querySelector('canvas.maplibregl-canvas');
    if (!canvas) return 'NO_CANVAS';
    const gl = canvas.getContext('webgl') || canvas.getContext('webgl2') || canvas.getContext('experimental-webgl');
    if (!gl) return 'NO_GL_CONTEXT';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      maplibreVersion: window.__thermalMap?.version,
      renderedFeaturesCount: window.__thermalMap?.queryRenderedFeatures()?.length ?? 0,
    };
  });

  console.log('GL INFO:', JSON.stringify(glInfo, null, 2));

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'test_gl_flags_screenshot.png') });
  await browser.close();
  console.log('Saved test_gl_flags_screenshot.png');
}

main().catch(console.error);
