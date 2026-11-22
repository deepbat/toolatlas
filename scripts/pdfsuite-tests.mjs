// Browser checks for the PDF suite tools: upload, run, download, verify the result.
import { chromium } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173/toolatlas';
let server;
if (!process.env.E2E_BASE_URL) {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1'], { stdio: 'ignore' });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/')).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
}
const d = await PDFDocument.create();
const f = await d.embedFont(StandardFonts.Helvetica);
for (let i = 0; i < 6; i++) d.addPage([595, 842]).drawText('Page ' + (i + 1), { x: 60, y: 700, size: 30, font: f });
const bytes = Buffer.from(await d.save());
const form = await PDFDocument.create();
const fp = form.addPage([300, 300]);
const tf = form.getForm().createTextField('name'); tf.setText('Deepak'); tf.addToPage(fp, { x: 20, y: 200, width: 150, height: 24 });
const formBytes = Buffer.from(await form.save());

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
let n = 0;
const VERB = { 'pdf-delete-pages': 'Delete pages', 'pdf-crop': 'Crop PDF', 'pdf-header-footer': 'Add header or footer', 'pdf-bates': 'Add Bates numbers', 'pdf-nup': 'Combine pages', 'pdf-booklet': 'Make booklet', 'pdf-flatten': 'Flatten forms', 'pdf-rotate': 'Rotate pages', 'pdf-watermark': 'Add watermark', 'pdf-page-organiser': 'Reorder pages', 'pdf-sign': 'Sign PDF', 'pdf-ocr': 'Make searchable' };
async function run(id, data, setup, check, timeoutMs) {
  await page.goto(`${base}/tools/${id}/`);
  await page.locator('input[type=file]').first().setInputFiles({ name: 'in.pdf', mimeType: 'application/pdf', buffer: data });
  await page.getByText(/\d+ pages? ·/).first().waitFor();
  if (setup) await setup();
  const pending = page.waitForEvent('download', { timeout: timeoutMs ?? 30000 });
  await page.getByRole('button', { name: VERB[id], exact: true }).click();
  const dl = await pending;
  const path = `/tmp/suite-${id}.pdf`;
  await dl.saveAs(path);
  const out = await PDFDocument.load(await readFile(path));
  await check(out);
  console.log('PASS ' + id); n++;
}
try {
  await run('pdf-delete-pages', bytes, () => page.getByPlaceholder('2,4-6').fill('2,4-6'), o => assert.equal(o.getPageCount(), 2));
  await run('pdf-crop', bytes, async () => { await page.locator('input[type=number]').nth(0).fill('10'); }, o => assert.ok(o.getPage(0).getHeight() < 842 - 20));
  await run('pdf-header-footer', bytes, null, o => assert.equal(o.getPageCount(), 6));
  await run('pdf-bates', bytes, null, o => assert.equal(o.getPageCount(), 6));
  await run('pdf-nup', bytes, null, o => assert.equal(o.getPageCount(), 3));
  await run('pdf-booklet', bytes, null, o => assert.equal(o.getPageCount(), 4));
  await run('pdf-flatten', formBytes, null, o => assert.equal(o.getForm().getFields().length, 0));
  await run('pdf-rotate', bytes, null, o => { assert.equal(o.getPage(0).getRotation().angle, 90); assert.equal(o.getPageCount(), 6); });
  await run('pdf-watermark', bytes, null, o => assert.equal(o.getPageCount(), 6));
  await run('pdf-page-organiser', bytes, () => page.getByPlaceholder('3,1,2').fill('6,1,2,3,4,5'), o => assert.equal(o.getPageCount(), 6));
  await run('pdf-sign', bytes, async () => {
    await page.getByRole('button', { name: 'Create a signature' }).click();
    await page.getByRole('button', { name: 'Type', exact: true }).click();
    await page.getByLabel('Type your signature').fill('Deepak');
    await page.getByRole('button', { name: 'Use signature' }).click();
  }, o => assert.equal(o.getPageCount(), 6));
  // OCR: build an image-only "scanned" PDF (text baked into a PNG, no text layer) and read it back.
  const pngDataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 595; c.height = 200;
    const x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 595, 200);
    x.fillStyle = '#000000'; x.font = '48px sans-serif'; x.fillText('HELLO SCAN', 40, 110);
    return c.toDataURL('image/png');
  });
  const scan = await PDFDocument.create();
  const img = await scan.embedPng(Buffer.from(pngDataUrl.split(',')[1], 'base64'));
  scan.addPage([595, 842]).drawImage(img, { x: 0, y: 442, width: 595, height: 200 });
  const scanBytes = Buffer.from(await scan.save());
  await run('pdf-ocr', scanBytes, null, o => assert.equal(o.getPageCount(), 1), 180000);
  await page.getByText(/words read/).waitFor({ timeout: 10000 });
  assert.deepEqual(errors, []);
  console.log(`${n} PDF suite checks passed`);
} finally {
  await browser.close(); server?.kill();
}
