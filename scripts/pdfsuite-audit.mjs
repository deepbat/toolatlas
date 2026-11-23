// Functional audit: upload, run, download and verify output for the PDF tools not covered elsewhere.
import { chromium } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import JSZip from 'jszip';
import { PNG } from 'pngjs';
import { spawn } from 'node:child_process';
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
// Reader: the app's own pdf.js, loaded in a separate browser page, so the audit needs no system PDF tools.
const rp = await browser.newPage();
await rp.route('**/__pdfjs/**', async route => { const f = route.request().url().split('/__pdfjs/')[1]; await route.fulfill({ body: await readFile('node_modules/pdfjs-dist/build/' + f), contentType: 'text/javascript' }); });
await rp.goto(base + '/404-reader-page/').catch(() => {});
const readerReady = rp.evaluate(async u => { const m = await import(u + '/__pdfjs/pdf.min.mjs'); window.pdfjsWorker = await import(u + '/__pdfjs/pdf.worker.min.mjs'); window.__pdfjs = m; }, base);
async function openPdf(path) { await readerReady; return rp.evaluate(async b64 => { const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); window.__doc = await window.__pdfjs.getDocument({ data: bin }).promise; return window.__doc.numPages; }, (await readFile(path)).toString('base64')); }
const pageText = async (path, n) => { await openPdf(path); return rp.evaluate(async n => { const pg = await window.__doc.getPage(n); const c = await pg.getTextContent(); return c.items.map(i => i.str).join(' '); }, n); };
const text = async path => { const k = await openPdf(path); let o = ''; for (let i = 1; i <= k; i++) o += (await pageText(path, i)) + '\n'; return o; };
const colourStats = async (path, n, scale) => { await openPdf(path); return rp.evaluate(async ([n, scale]) => { const pg = await window.__doc.getPage(n); const vp = pg.getViewport({ scale }); const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height); const ctx = cv.getContext('2d'); await pg.render({ canvasContext: ctx, viewport: vp }).promise; const d = ctx.getImageData(0, 0, cv.width, cv.height).data; let colour = 0, dark = 0; for (let i = 0; i < d.length; i += 4) { if (Math.abs(d[i] - d[i + 1]) > 12 || Math.abs(d[i + 1] - d[i + 2]) > 12) colour++; if (d[i] < 100 && d[i + 1] < 100 && d[i + 2] < 100) dark++; } return { colour, dark, w: cv.width, h: cv.height }; }, [n, scale]); };

await t('pdf-merge joins two PDFs in order', async () => {
  await go('pdf-merge'); await up(A, 'a.pdf');
  await page.locator('input[type=file]').first().setInputFiles({ name: 'b.pdf', mimeType: 'application/pdf', buffer: B });
  await page.getByText('b.pdf').first().waitFor();
  const r = await dl(/^Merge \d+ files?$/i);
  const o = await PDFDocument.load(r.buf); assert.equal(o.getPageCount(), 7);
  const tx = await text(r.path); assert.ok(tx.indexOf('Alpha page 1') < tx.indexOf('Alpha page 4') && tx.indexOf('Alpha page 4') < tx.indexOf('Beta page 1'), 'order');
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
  assert.ok((await text(r.path)).includes('Alpha page 3'));
});
await t('pdf-compress smallest file gives image pages', async () => {
  await go('pdf-compress'); await up(A);
  const r = await dl2('Compress PDF', 'Download PDF'); const o = await PDFDocument.load(r.buf); assert.equal(o.getPageCount(), 4);
  const st = await colourStats(r.path, 1, 0.5); assert.ok(st.dark > 30, 'rendered text pixels ' + st.dark);
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
await t('pdf-form-filler fills text, checkbox and dropdown, then flattens', async () => {
  const fd = await PDFDocument.create(); const pg = fd.addPage([400, 400]); const fm = fd.getForm();
  fm.createTextField('fullname').addToPage(pg, { x: 20, y: 330, width: 200, height: 24 });
  fm.createCheckBox('agree').addToPage(pg, { x: 20, y: 290, width: 16, height: 16 });
  const dd = fm.createDropdown('city'); dd.addOptions(['Delhi', 'Mumbai']); dd.addToPage(pg, { x: 20, y: 240, width: 150, height: 24 });
  await go('pdf-form-filler'); await up(Buffer.from(await fd.save()));
  await page.getByLabel('fullname').fill('Deepak Batra');
  await page.getByLabel('agree').check();
  await page.getByLabel('city').selectOption('Mumbai');
  await page.getByRole('button', { name: 'Save filled PDF' }).click();
  const r = await dl('Download filled PDF'); const o = await PDFDocument.load(r.buf); const f2 = o.getForm();
  assert.equal(f2.getTextField('fullname').getText(), 'Deepak Batra'); assert.ok(f2.getCheckBox('agree').isChecked()); assert.deepEqual(f2.getDropdown('city').getSelected(), ['Mumbai']);
  await go('pdf-form-filler'); await up(Buffer.from(await fd.save()));
  await page.getByLabel('fullname').fill('Flat Text'); await page.getByText('Flatten after filling').click();
  await page.getByRole('button', { name: 'Save filled PDF' }).click();
  const r2 = await dl('Download filled PDF'); const o2 = await PDFDocument.load(r2.buf);
  assert.equal(o2.getForm().getFields().length, 0, 'flattened'); assert.ok((await text(r2.path)).includes('Flat Text'));
});
await t('pdf-background greyscale output has no colour', async () => {
  const cd = await PDFDocument.create(); const cp = cd.addPage([300, 300]); cp.drawRectangle({ x: 20, y: 20, width: 200, height: 200, color: (await import('pdf-lib')).rgb(0.9, 0.1, 0.1) });
  const srcBytes = Buffer.from(await cd.save()); await writeFile('/tmp/audit-colour-src.pdf', srcBytes);
  assert.ok((await colourStats('/tmp/audit-colour-src.pdf', 1, 0.6)).colour > 1000, 'control: source is coloured');
  await go('pdf-background'); await up(srcBytes);
  await page.locator('main select').first().selectOption('gray');
  const r = await dl2(/Apply to all pages/i, 'Download PDF');
  const st = await colourStats(r.path, 1, 0.6); assert.ok(st.w > 100); assert.equal(st.colour, 0, st.colour + ' coloured pixels');
});
await t('pdf-compress shrinks an image-heavy PDF and reports sizes', async () => {
  const W = 1400, H = 1400, png = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; png.data[i] = (x * 255 / W + Math.sin(y / 9) * 40) & 255; png.data[i + 1] = (y * 255 / H + Math.sin(x / 7) * 40) & 255; png.data[i + 2] = ((x + y) * 0.2 + Math.sin(x * y / 4000) * 60) & 255; png.data[i + 3] = 255; }
  const cd = await PDFDocument.create(); const im = await cd.embedPng(PNG.sync.write(png, { colorType: 2 })); cd.addPage([595, 842]).drawImage(im, { x: 20, y: 100, width: 555, height: 555 });
  const big = Buffer.from(await cd.save());
  await go('pdf-compress'); await up(big);
  const r = await dl2('Compress PDF', 'Download PDF'); const o = await PDFDocument.load(r.buf);
  assert.equal(o.getPageCount(), 1); assert.ok(r.buf.length < big.length * 0.6, `size ${big.length} -> ${r.buf.length}`);
  console.log('  compress ' + big.length + ' -> ' + r.buf.length + ' bytes');
});
await t('page organiser extracts pages 3 and 1 in that order (the extract-pages route)', async () => {
  await go('pdf-page-organiser'); await up(A);
  await page.getByLabel(/New page order/i).fill('3,1'); const r = await dl('Reorder pages');
  assert.equal((await PDFDocument.load(r.buf)).getPageCount(), 2);
  const tx = await text(r.path); assert.ok(tx.indexOf('Alpha page 3') >= 0 && tx.indexOf('Alpha page 3') < tx.indexOf('Alpha page 1'), tx);
});
await t('header and footer default stamps Page n of total on each page', async () => {
  await go('pdf-header-footer'); await up(A);
  const r = await dl('Add header or footer');
  for (let i = 1; i <= 4; i++) { const one = await pageText(r.path, i); assert.ok(one.includes(`Page ${i} of 4`), 'page ' + i + ': ' + JSON.stringify(one)); }
});
await t('pdf-split custom range gives only the requested pages', async () => {
  await go('pdf-split'); await up(A);
  await page.locator('main select').first().selectOption('ranges');
  await page.getByLabel(/ranges/i).first().fill('2-3');
  const r = await dl2('Split PDF', 'Download this file');
  const pdf = r.name.endsWith('.zip') ? await (async () => { const z = await JSZip.loadAsync(r.buf); const k = Object.keys(z.files).filter(x => x.endsWith('.pdf')); assert.equal(k.length, 1); return z.files[k[0]].async('nodebuffer'); })() : r.buf;
  const o = await PDFDocument.load(pdf); assert.equal(o.getPageCount(), 2);
});
await t('every tool linked from the guides page opens a real tool', async () => {
  await page.goto(`${base}/guides/`); await page.locator('main a[href*="/tools/"]').first().waitFor();
  const hrefs = await page.$$eval('main a[href*="/tools/"]', a => [...new Set(a.map(x => x.getAttribute('href')))]);
  assert.ok(hrefs.length >= 5, 'links ' + hrefs.length); const dead = [];
  for (const h of hrefs) { await page.goto(new URL(h, page.url()).href); await page.locator('h1, main').first().waitFor(); if (await page.getByText('uncharted').count()) dead.push(h); }
  console.log('DEAD', dead.join(' ')); assert.deepEqual(dead, []);
});
console.log(`${n} passed, ${fails.length} failed`, errors.length ? 'pageerrors: ' + errors.join(' | ') : '');
await browser.close(); server?.kill();
process.exit(fails.length ? 1 : 0);
