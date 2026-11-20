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

const RETIRED = ['screen-ruler','sound-meter','metronome','tuner','tone-generator','text-to-speech','compass','spirit-level','gps-speedometer','morse-code','qr-barcode-scanner'];

try {
  const page = await browser.newPage();

  // Every device-section tool (incl. screen-ruler, retired in the Nov 2026 trim) 404s.
  for (const id of RETIRED) {
    await page.goto(`${base}/tools/${id}/`);
    await page.locator('h1').first().waitFor();
    const text = await page.locator('main').innerText();
    check(`${id} is retired and 404s`, /not found|does not exist|404/i.test(text));
  }

  // The homepage still fits on phone and desktop.
  for (const width of [360, 393, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`${base}/`);
    await page.locator('h1').first().waitFor();
    check(`home fits ${width}px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
} finally {
  await browser.close();
  server?.kill();
}
console.log(`${n} device checks passed`);
