// Drives the installed desktop app (WebView2) over CDP: loads two tools, runs them on a generated PDF.
// Used only by .github/workflows/desktop.yml. Prints PASS/FAIL lines, exits 1 on any failure.
import { chromium } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { writeFile } from 'node:fs/promises';

const port = process.env.CDP_PORT || '9222';
let browser;
for (let i = 0; i < 40 && !browser; i++) {
  try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); } catch { await new Promise(r => setTimeout(r, 1000)); }
}
if (!browser) { console.log('FAIL could not attach to WebView2 on port ' + port); process.exit(1); }
const page = browser.contexts()[0].pages()[0];
const origin = new URL(page.url()).origin;
console.log('origin ' + origin + ' ua ' + (await page.evaluate(() => navigator.userAgent)));
const d = await PDFDocument.create();
const f = await d.embedFont(StandardFonts.Helvetica);
for (let i = 0; i < 3; i++) d.addPage([595, 842]).drawText('Page ' + (i + 1), { x: 60, y: 700, size: 30, font: f });
const bytes = Buffer.from(await d.save());
let failed = 0;
async function step(name, fn) {
  try { await fn(); console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + ': ' + String(e.message).split('\n')[0]); }
}
await step('pdf-rotate loads and runs', async () => {
  await page.goto(`${origin}/tools/pdf-rotate/`);
  await page.locator('input[type=file]').first().setInputFiles({ name: 'in.pdf', mimeType: 'application/pdf', buffer: bytes });
  await page.getByText('in.pdf').first().waitFor({ timeout: 15000 });
  const pending = page.waitForEvent('download', { timeout: 20000 });
  await page.getByRole('button', { name: 'Rotate pages', exact: true }).click();
  const dl = await pending;
  await dl.saveAs('rotated.pdf');
  const out = await PDFDocument.load(await (await import('node:fs/promises')).readFile('rotated.pdf'));
  if (out.getPageCount() !== 3 || out.getPage(0).getRotation().angle !== 90) throw new Error('bad output');
});
await step('service worker / IndexedDB / WASM available', async () => {
  const r = await page.evaluate(async () => ({ sw: 'serviceWorker' in navigator, idb: !!window.indexedDB, wasm: typeof WebAssembly === 'object', worker: typeof Worker === 'function' }));
  console.log(JSON.stringify(r));
  if (!r.idb || !r.wasm || !r.worker) throw new Error('missing API');
});
await step('pdf-ocr reads scanned text', async () => {
  await page.goto(`${origin}/tools/pdf-ocr/`);
  const url = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 595; c.height = 200; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 595, 200); x.fillStyle = '#000'; x.font = '48px sans-serif'; x.fillText('HELLO SCAN', 40, 110); return c.toDataURL('image/png'); });
  const scan = await PDFDocument.create();
  const img = await scan.embedPng(Buffer.from(url.split(',')[1], 'base64'));
  scan.addPage([595, 842]).drawImage(img, { x: 0, y: 442, width: 595, height: 200 });
  const sb = Buffer.from(await scan.save());
  await page.locator('input[type=file]').first().setInputFiles({ name: 'in.pdf', mimeType: 'application/pdf', buffer: sb });
  await page.getByText('in.pdf').first().waitFor({ timeout: 15000 });
  const pending = page.waitForEvent('download', { timeout: 120000 });
  await page.getByRole('button', { name: 'Make searchable', exact: true }).click();
  const dl = await pending;
  await dl.saveAs('ocr.pdf');
  console.log('ocr output saved');
});
await page.screenshot({ path: 'win-after.png' }).catch(() => {});
process.exit(failed ? 1 : 0);
