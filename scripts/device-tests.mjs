// Browser checks for the Device & Sensor category. The Nov 2026 curated
// redesign keeps exactly one device tool (Screen Ruler); these checks cover
// it and lock in the retirement of the other sensors. Run: npm run build && npm run test:device
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173/toolatlas';
let server;
if (!process.env.E2E_BASE_URL) {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1'], { stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + '/')).ok) break; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
}
const browser = await chromium.launch();
await mkdir('test-artifacts/device', { recursive: true });
let n = 0;
const check = (name, ok) => { assert.ok(ok, name); n++; console.log('ok  ' + name); };

const RETIRED = ['sound-meter','metronome','tuner','tone-generator','text-to-speech','compass','spirit-level','gps-speedometer','morse-code','qr-barcode-scanner'];

try {
  const page = await browser.newPage();

  await page.goto(`${base}/tools/screen-ruler/`);
  await page.getByRole('heading', { name: 'Screen Ruler', exact: true, level: 1 }).waitFor();
  check('screen-ruler renders its page and title', true);

  // Static prerender must carry the route's SEO shell.
  const html = await (await fetch(`${base}/tools/screen-ruler/`)).text();
  check('screen-ruler static HTML has canonical title', html.includes("<title>Screen Ruler | Deepak's Tool</title>"));
  check('screen-ruler static HTML has schema', html.includes('WebApplication'));
  const catHtml = await (await fetch(`${base}/category/device/`)).text();
  check('device category page lists Screen Ruler', catHtml.includes('Screen Ruler'));
  check('device category page lists no retired sensors', !catHtml.includes('Sound Level Meter') && !catHtml.includes('Metronome'));

  // Screen ruler: calibration changes the reported scale.
  const scale = page.getByTestId('ruler-scale');
  const before = await scale.textContent();
  await page.getByLabel('Calibration width').fill('428');
  await page.getByRole('button', { name: 'Apply calibration' }).click();
  const after = await scale.textContent();
  check(`ruler calibration updates scale (${before} -> ${after})`, before !== after && after.includes('= 50 px'));

  // Retired device tools render the not-found page.
  for (const id of RETIRED) {
    await page.goto(`${base}/tools/${id}/`);
    await page.locator('h1').first().waitFor();
    const text = await page.locator('main').innerText();
    check(`${id} is retired and 404s`, /not found|does not exist|404/i.test(text));
  }

  // No horizontal overflow on phone and desktop.
  for (const width of [360, 393, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`${base}/tools/screen-ruler/`);
    await page.getByRole('heading', { name: 'Screen Ruler', exact: true, level: 1 }).waitFor();
    check(`screen-ruler fits ${width}px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await page.screenshot({ path: 'test-artifacts/device/screen-ruler.png' });
} finally {
  await browser.close();
  server?.kill();
}
console.log(`${n} device checks passed`);
