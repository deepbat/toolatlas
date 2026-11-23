// Functional audit: upload, run, download and verify output for the PDF tools not covered elsewhere.
import { chromium } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import JSZip from 'jszip';
import { PNG } from 'pngjs';
import { spawn, execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173/toolatlas';
let server;
if (!process.env.E2E_BASE_URL) {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1'], { stdio: 'ignore' });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/')).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
}
async function mk(n, tag) {
  const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < n; i++) d.addPage([595, 842]).drawText(`${tag} page ${i + 1}`, { x: 60, y: 700, size: 30, font: f });
  return Buffer.from(await d.save());
}
const A = await mk(4, 'Alpha'), B = await mk(3, 'Beta');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
const errors = []; page.on('pageerror', e => errors.push(e.message));
let n = 0; const fails = [];
async function t(name, fn) { try { await fn(); console.log('PASS ' + name); n++; } catch (e) { fails.push(name); console.log('FAIL ' + name + ': ' + String(e.message).slice(0, 300)); } }
const go = async id => { await page.goto(`${base}/tools/${id}/`); await page.locator('input[type=file]').first().waitFor({ state: 'attached' }); };
const up = async (buf, name = 'in.pdf', mime = 'application/pdf') => { await page.locator('input[type=file]').first().setInputFiles({ name, mimeType: mime, buffer: buf }); await page.getByText(name).first().waitFor(); };
const dl = async (btn, ms = 60000) => { const p = page.waitForEvent('download', { timeout: ms }); await page.getByRole('button', { name: btn }).click(); const d = await p; const path = '/tmp/audit-' + Date.now() + '-' + d.suggestedFilename(); await d.saveAs(path); return { path, name: d.suggestedFilename(), buf: await readFile(path) }; };
const dl2 = async (run, get, ms = 90000) => { await page.getByRole('button', { name: run }).click(); await page.getByRole('button', { name: get }).first().waitFor({ timeout: ms }); return dl(get); };
const text = path => execFileSync('pdftotext', [path, '-']).toString();

await t('pdf-merge joins two PDFs in order', async () => {
  await go('pdf-merge'); await up(A, 'a.pdf');
  await page.locator('input[type=file]').first().setInputFiles({ name: 'b.pdf', mimeType: 'application/pdf', buffer: B });
  await page.getByText('b.pdf').first().waitFor();
  const r = await dl(/^Merge \d+ files?$/i);
  const o = await PDFDocument.load(r.buf); assert.equal(o.getPageCount(), 7);
  const tx = text(r.path); assert.ok(tx.indexOf('Alpha page 1') < tx.indexOf('Alpha page 4') && tx.indexOf('Alpha page 4') < tx.indexOf('Beta page 1'), 'order');
});
await t('pdf-split every page gives one file per page', async () => {
  await go('pdf-split'); await up(A);
  const r = await dl2('Split PDF', 'Download all as ZIP'); const z = await JSZip.loadAsync(r.buf);
  const names = Object.keys(z.files).filter(k => k.endsWith('.pdf')); assert.equal(names.length, 4, names.join());
  const first = await PDFDocument.load(await z.files[names.sort()[0]].async('nodebuffer')); assert.equal(first.getPageCount(), 1);
});
await t('pdf-compress keep text stays valid and selectable', async () => {
  await go('pdf-compress'); await up(A);
  await page.locator('main select').first().selectOption('tidy');
  const r = await dl2('Compress PDF', 'Download PDF'); const o = await PDFDocument.load(r.buf); assert.equal(o.getPageCount(), 4);
  assert.ok(text(r.path).includes('Alpha page 3'));
});
await t('pdf-compress smallest file gives image pages', async () => {
  await go('pdf-compress'); await up(A);
  const r = await dl2('Compress PDF', 'Download PDF'); const o = await PDFDocument.load(r.buf); assert.equal(o.getPageCount(), 4);
  const px = execFileSync('pdftoppm', ['-r', '30', '-png', '-f', '1', '-l', '1', r.path, r.path + '-p']);
});
await t('pdf-to-images makes a PNG per page', async () => {
  await go('pdf-to-images'); await up(A);
  const r = await dl2('Convert pages', 'Download all as ZIP'); const z = await JSZip.loadAsync(r.buf);
  const names = Object.keys(z.files).filter(k => /\.png$/i.test(k)); assert.equal(names.length, 4, Object.keys(z.files).join());
  const png = PNG.sync.read(await z.files[names[0]].async('nodebuffer')); assert.ok(png.width > 500 && png.height > 700);
  let dark = 0; for (let i = 0; i < png.data.length; i += 4) if (png.data[i] < 100) dark++; assert.ok(dark > 200, 'text rendered');
});
await t('pdf-to-images page range 2-3', async () => {
  await go('pdf-to-images'); await up(A);
  await page.getByLabel(/^Pages/i).first().fill('2-3');
  const r = await dl2('Convert pages', 'Download all as ZIP'); const z = await JSZip.loadAsync(r.buf);
  assert.equal(Object.keys(z.files).filter(k => /\.png$/i.test(k)).length, 2);
});
await t('pdf-extract-text returns the page text', async () => {
  await go('pdf-extract-text'); await up(A);
  await page.getByRole('button', { name: 'Extract text' }).click();
  await page.getByText('Alpha page 3').first().waitFor({ timeout: 20000 });
});
await t('pdf-background greyscale keeps pages', async () => {
  await go('pdf-background'); await up(A);
  await page.locator('main select').first().selectOption('gray');
  const r = await dl2(/Apply to all pages/i, 'Download PDF'); const o = await PDFDocument.load(r.buf); assert.equal(o.getPageCount(), 4);
});
await t('image-to-pdf makes a one-page PDF from a PNG', async () => {
  await go('image-to-pdf');
  const png = new PNG({ width: 120, height: 80 }); for (let i = 0; i < png.data.length; i += 4) { png.data[i] = 200; png.data[i + 1] = 30; png.data[i + 2] = 30; png.data[i + 3] = 255; }
  await page.locator('input[type=file]').first().setInputFiles({ name: 'x.png', mimeType: 'image/png', buffer: PNG.sync.write(png) });
  await page.getByText('x.png').first().waitFor();
  const r = await dl(/Create PDF/i); const o = await PDFDocument.load(r.buf); assert.equal(o.getPageCount(), 1);
});
console.log(`${n} passed, ${fails.length} failed`, errors.length ? 'pageerrors: ' + errors.join(' | ') : '');
await browser.close(); server?.kill();
process.exit(fails.length ? 1 : 0);
