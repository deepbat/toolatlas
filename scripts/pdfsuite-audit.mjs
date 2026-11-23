// Functional audit: upload, run, download and verify output for the PDF tools not covered elsewhere.
import { chromium } from '@playwright/test';
import { HIN_SCAN, PAN_SCAN } from './fixtures/indic-scans.mjs';
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
async function t(name, fn) { if (process.env.AUDIT_ONLY && !new RegExp(process.env.AUDIT_ONLY).test(name)) return; try { await fn(); console.log('PASS ' + name); n++; } catch (e) { fails.push(name); console.log('FAIL ' + name + ': ' + String(e.message).slice(0, 300)); } }
const go = async id => { await page.goto(`${base}/tools/${id}/`); await page.locator('input[type=file]').first().waitFor({ state: 'attached' }); };
const up = async (buf, name = 'in.pdf', mime = 'application/pdf') => { await page.locator('input[type=file]').first().setInputFiles({ name, mimeType: mime, buffer: buf }); await page.getByText(name).first().waitFor(); };
const dl = async (btn, ms = 60000) => { const p = page.waitForEvent('download', { timeout: ms }); await page.getByRole('button', { name: btn }).click(); const d = await p; const path = '/tmp/audit-' + Date.now() + '-' + d.suggestedFilename(); await d.saveAs(path); return { path, name: d.suggestedFilename(), buf: await readFile(path) }; };
const dl2 = async (run, get, ms = 90000) => { await page.getByRole('button', { name: run }).click(); await page.getByRole('button', { name: get }).first().waitFor({ timeout: ms }); return dl(get); };
// Reader: the app's own pdf.js, loaded in a separate browser page, so the audit needs no system PDF tools.
const rp = await browser.newPage();
await rp.route('**/__pdfjs/**', async route => { const f = route.request().url().split('/__pdfjs/')[1]; await route.fulfill({ body: await readFile('node_modules/pdfjs-dist/build/' + f), contentType: 'text/javascript' }); });
await rp.goto(base + '/404-reader-page/').catch(() => {});
const readerReady = rp.evaluate(async u => { const m = await import(u + '/__pdfjs/pdf.min.mjs'); window.pdfjsWorker = await import(u + '/__pdfjs/pdf.worker.min.mjs'); window.__pdfjs = m; }, base);
async function openPdf(path, password) { await readerReady; return rp.evaluate(async ([b64, pw]) => { const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); window.__doc = await window.__pdfjs.getDocument({ data: bin, password: pw }).promise; return window.__doc.numPages; }, [(await readFile(path)).toString('base64'), password]); }
const pageText = async (path, n, pw) => { await openPdf(path, pw); return rp.evaluate(async n => { const pg = await window.__doc.getPage(n); const c = await pg.getTextContent(); return c.items.map(i => i.str).join(' '); }, n); };
const halves = async (path, n) => { await openPdf(path); return rp.evaluate(async n => { const pg = await window.__doc.getPage(n); const w = pg.view[2]; const c = await pg.getTextContent(); const L = [], R = []; for (const i of c.items) (i.transform[4] < w / 2 ? L : R).push(i.str); return [L.join(' ').replace(/Six page /g, 'p').trim(), R.join(' ').replace(/Six page /g, 'p').trim()]; }, n); };
const renderData = async (path, n, scale) => { await openPdf(path); return rp.evaluate(async ([n, scale]) => { const pg = await window.__doc.getPage(n); const vp = pg.getViewport({ scale }); const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height); const ctx = cv.getContext('2d'); await pg.render({ canvasContext: ctx, viewport: vp }).promise; return { w: cv.width, h: cv.height, d: Array.from(ctx.getImageData(0, 0, cv.width, cv.height).data) }; }, [n, scale]); };
const diffBox = async (pa, pb, n, scale) => { const A0 = await renderData(pa, n, scale), B0 = await renderData(pb, n, scale); let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, cnt = 0; for (let i = 0; i < A0.d.length; i += 4) { if (Math.abs(A0.d[i] - B0.d[i]) + Math.abs(A0.d[i + 1] - B0.d[i + 1]) + Math.abs(A0.d[i + 2] - B0.d[i + 2]) > 60) { const px = (i / 4) % A0.w, py = Math.floor(i / 4 / A0.w); x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); cnt++; } } return { x0, y0, x1, y1, cnt, w: A0.w, h: A0.h }; };
const text = async (path, pw) => { const k = await openPdf(path, pw); let o = ''; for (let i = 1; i <= k; i++) o += (await pageText(path, i, pw)) + '\n'; return o; };
const colourStats = async (path, n, scale) => { await openPdf(path); return rp.evaluate(async ([n, scale]) => { const pg = await window.__doc.getPage(n); const vp = pg.getViewport({ scale }); const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height); const ctx = cv.getContext('2d'); await pg.render({ canvasContext: ctx, viewport: vp }).promise; const d = ctx.getImageData(0, 0, cv.width, cv.height).data; let colour = 0, dark = 0, ink = 0; for (let i = 0; i < d.length; i += 4) { if (Math.abs(d[i] - d[i + 1]) > 12 || Math.abs(d[i + 1] - d[i + 2]) > 12) colour++; if (d[i] < 100 && d[i + 1] < 100 && d[i + 2] < 100) dark++; if (d[i] < 200 || d[i + 1] < 200 || d[i + 2] < 200) ink++; } return { colour, dark, ink, w: cv.width, h: cv.height }; }, [n, scale]); };

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
await t('every tool link on the guides, home and PDF pages (footer included) opens a real tool', async () => {
  const seen = new Set(); const dead = [];
  for (const src of ['/guides/', '/', '/pdf/']) {
    await page.goto(base + src); await page.locator('a[href*="/tools/"]').first().waitFor();
    for (const h of await page.$$eval('a[href*="/tools/"]', a => a.map(x => x.getAttribute('href')))) seen.add(new URL(h, page.url()).pathname);
  }
  assert.ok(seen.size >= 15, 'links ' + seen.size);
  for (const h of seen) { await page.goto(base.replace(/\/toolatlas$/, '') + h); await page.locator('h1, main').first().waitFor(); if (await page.getByText('uncharted').count()) dead.push(h); }
  console.log('  checked ' + seen.size + ' tool links; dead: ' + (dead.join(' ') || 'none')); assert.deepEqual(dead, []);
});
const six = await mk(6, 'Six');
const VERB = { 'pdf-delete-pages': 'Delete pages', 'pdf-crop': 'Crop PDF', 'pdf-bates': 'Add Bates numbers', 'pdf-nup': 'Combine pages', 'pdf-booklet': 'Make booklet', 'pdf-rotate': 'Rotate pages', 'pdf-watermark': 'Add watermark', 'pdf-protect': 'Protect PDF', 'pdf-unlock': 'Unlock PDF', 'pdf-repair': 'Repair PDF', 'pdf-sign': 'Sign PDF', 'pdf-ocr': 'Make searchable' };
const suite = async (id, data, setup) => { await go(id); await up(data); if (setup) await setup(); return dl(VERB[id]); };
const pagesText = async path => { const k = await openPdf(path); const o = []; for (let i = 1; i <= k; i++) o.push(await pageText(path, i)); return o; };
await t('delete pages 2,4-6 keeps exactly pages 1 and 3', async () => {
  const r = await suite('pdf-delete-pages', six, () => page.getByPlaceholder('2,4-6').fill('2,4-6'));
  const pt = await pagesText(r.path); assert.equal(pt.length, 2); assert.ok(pt[0].includes('Six page 1') && pt[1].includes('Six page 3'), JSON.stringify(pt));
});
await t('bates numbers are stamped sequentially on every page', async () => {
  const r = await suite('pdf-bates', six, null); const pt = await pagesText(r.path);
  assert.equal(pt.length, 6); const nums = pt.map(x => (x.match(/(\d{4,})\s*$/) || x.match(/(\d{4,})/) || [])[1]);
  assert.ok(nums.every(Boolean), JSON.stringify(pt)); for (let i = 1; i < nums.length; i++) assert.equal(Number(nums[i]), Number(nums[i - 1]) + 1, JSON.stringify(nums));
});
await t('n-up puts two source pages on each sheet', async () => {
  const r = await suite('pdf-nup', six, null); const pt = await pagesText(r.path); assert.equal(pt.length, 3);
  assert.ok(pt[0].includes('Six page 1') && pt[0].includes('Six page 2') && pt[2].includes('Six page 5') && pt[2].includes('Six page 6'), JSON.stringify(pt));
});
await t('booklet imposes the exact saddle-stitch order, left and right of each sheet', async () => {
  const r = await suite('pdf-booklet', six, null); const pt = await pagesText(r.path); const all = pt.join(' ');
  for (let i = 1; i <= 6; i++) assert.equal((all.match(new RegExp('Six page ' + i + '(?!\\d)', 'g')) || []).length, 1, 'page ' + i + ' ' + JSON.stringify(pt));
  const sheets = []; for (let i = 1; i <= pt.length; i++) sheets.push(await halves(r.path, i));
  assert.deepEqual(sheets, [['', 'p1'], ['p2', ''], ['p6', 'p3'], ['p4', 'p5']], 'imposed order (left|right) ' + JSON.stringify(sheets));
});
await t('watermark adds text on every page and keeps the original', async () => {
  const r = await suite('pdf-watermark', A, null); const pt = await pagesText(r.path); assert.equal(pt.length, 4);
  for (let i = 0; i < 4; i++) { assert.ok(pt[i].includes('Alpha page ' + (i + 1)), pt[i]); assert.ok(pt[i].replace('Alpha page ' + (i + 1), '').trim().length > 2, 'no extra text on page ' + (i + 1)); }
});
await t('rotate turns every page, text stays', async () => {
  const r = await suite('pdf-rotate', A, null); const o = await PDFDocument.load(r.buf);
  for (const pg of o.getPages()) assert.equal(pg.getRotation().angle, 90); assert.ok((await text(r.path)).includes('Alpha page 4'));
});
await t('crop shrinks the page and keeps the text', async () => {
  const r = await suite('pdf-crop', A, async () => { await page.locator('input[type=number]').nth(0).fill('10'); });
  const o = await PDFDocument.load(r.buf); assert.ok(o.getPage(0).getHeight() < 842 - 20 && o.getPageCount() === 4); assert.ok((await text(r.path)).includes('Alpha page 2'));
});
await t('protect needs the password, unlock removes it, text survives', async () => {
  const pr = await suite('pdf-protect', A, async () => { await page.getByPlaceholder('Password', { exact: true }).fill('s3cret'); await page.getByPlaceholder('Repeat password').fill('s3cret'); });
  await assert.rejects(openPdf(pr.path), /password/i);
  assert.ok((await text(pr.path, 's3cret')).includes('Alpha page 2'));
  const un = await suite('pdf-unlock', pr.buf, () => page.getByPlaceholder('Password (if any)').fill('s3cret'));
  assert.ok((await text(un.path)).includes('Alpha page 4'));
});
await t('repair returns a readable PDF with the same text', async () => {
  const r = await suite('pdf-repair', A, null); assert.ok((await text(r.path)).includes('Alpha page 3'));
});
await t('sign places the signature image at bottom right of the last page with the right shape', async () => {
  await writeFile('/tmp/audit-before-sign.pdf', A);
  const r = await suite('pdf-sign', A, async () => {
    await page.getByRole('button', { name: 'Create a signature' }).click(); await page.getByRole('button', { name: 'Type', exact: true }).click();
    await page.getByLabel('Type your signature').fill('Deepak'); await page.getByRole('button', { name: 'Use signature' }).click();
    await page.getByAltText('Your signature').waitFor();
  });
  const sigPx = await page.evaluate(async () => { const im = document.querySelector('img[alt="Your signature"]'); await im.decode(); const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let a = 1e9, b = 1e9, e = -1, f = -1; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 40 && (d[i] < 200 || d[i + 1] < 200 || d[i + 2] < 200)) { const px = (i / 4) % c.width, py = Math.floor(i / 4 / c.width); a = Math.min(a, px); e = Math.max(e, px); b = Math.min(b, py); f = Math.max(f, py); } } return { w: e - a + 1, h: f - b + 1, nw: c.width, nh: c.height }; });
  const bx = await diffBox('/tmp/audit-before-sign.pdf', r.path, 4, 1); assert.ok(bx.cnt > 200, 'no stamp found on last page');
  const bw = bx.x1 - bx.x0 + 1, bh = bx.y1 - bx.y0 + 1;
  assert.ok(bx.x0 > bx.w / 2 && bx.y0 > bx.h / 2, 'not in the bottom-right quadrant: ' + JSON.stringify(bx));
  assert.ok(bx.x1 < bx.w && bx.y1 < bx.h, 'runs off the page');
  const wantW = 140 * sigPx.w / sigPx.nw; assert.ok(Math.abs(bw - wantW) / wantW < 0.2, `stamp ink width ${bw}pt vs expected ${wantW.toFixed(0)}pt (140pt image, ink ${sigPx.w}/${sigPx.nw}px)`);
  const want = sigPx.w / sigPx.h, got = bw / bh; assert.ok(Math.abs(got - want) / want < 0.2, `aspect ${got.toFixed(2)} vs signature ${want.toFixed(2)}`);
  const other = await diffBox('/tmp/audit-before-sign.pdf', r.path, 1, 1); assert.equal(other.cnt, 0, 'page 1 changed');
  console.log(`  sign stamp box ${bw}x${bh}pt at (${bx.x0},${bx.y0}) on ${bx.w}x${bx.h}; signature aspect ${want.toFixed(2)}, stamp ${got.toFixed(2)}`);
});
await t('OCR adds a searchable text layer that matches the scanned words and keeps the picture', async () => {
  await go('pdf-ocr');
  const dataUrl = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 595; c.height = 200; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 595, 200); x.fillStyle = '#000'; x.font = '48px sans-serif'; x.fillText('HELLO SCAN', 40, 110); return c.toDataURL('image/png'); });
  const sd = await PDFDocument.create(); const im = await sd.embedPng(Buffer.from(dataUrl.split(',')[1], 'base64')); sd.addPage([595, 842]).drawImage(im, { x: 0, y: 442, width: 595, height: 200 });
  const src = Buffer.from(await sd.save()); await writeFile('/tmp/audit-scan-src.pdf', src);
  assert.equal((await text('/tmp/audit-scan-src.pdf')).trim(), '', 'control: source has no text layer');
  await up(src); const p = page.waitForEvent('download', { timeout: 180000 }); await page.getByRole('button', { name: 'Make searchable' }).click(); const d = await p; const path = '/tmp/audit-ocr-out.pdf'; await d.saveAs(path);
  const tx = (await text(path)).toUpperCase(); assert.ok(tx.includes('HELLO') && tx.includes('SCAN'), 'text layer: ' + JSON.stringify(tx));
  const same = await diffBox('/tmp/audit-scan-src.pdf', path, 1, 1); assert.equal(same.cnt, 0, 'page picture changed: ' + same.cnt + ' px');
});
for (const [label, lang, b64, wants, size] of [
  ['Hindi', 'hin+eng', HIN_SCAN, ['Quarterly Report', 'नमस्ते दुनिया क्षत्रिय ज्ञान'], [620, 112]],
  ['Punjabi', 'pan+eng', PAN_SCAN, ['Page two starts here', 'ਅਕਾਲ', 'ਦੂਜੇ ਸਫ਼ੇ ਦੀ ਸਮਗਰੀ'], [946, 160]],
  // Per-page script choice: each scan must be read with its own script, never with the other one's letters.
  ['Hindi (auto)', 'auto', HIN_SCAN, ['Quarterly Report', 'नमस्ते दुनिया क्षत्रिय ज्ञान'], [620, 112]],
  ['Punjabi (auto)', 'auto', PAN_SCAN, ['Page two starts here', 'ਅਕਾਲ', 'ਦੂਜੇ ਸਫ਼ੇ ਦੀ ਸਮਗਰੀ'], [946, 160]],
]) {
  const fileTag = `${lang}-${label.split(' ')[0]}`;
  await t(`OCR reads ${label} script, writes exact Unicode text, and keeps the picture`, async () => {
    await go('pdf-ocr');
    const sd = await PDFDocument.create(); const im = await sd.embedPng(Buffer.from(b64, 'base64'));
    sd.addPage([595, 842]).drawImage(im, { x: 0, y: 600, width: 595, height: 595 * size[1] / size[0] });
    const src = Buffer.from(await sd.save()); await writeFile(`/tmp/audit-scan-${fileTag}.pdf`, src);
    assert.equal((await text(`/tmp/audit-scan-${fileTag}.pdf`)).trim(), '', 'control: source has no text layer');
    await up(src);
    await page.locator('select').filter({ hasText: label.split(' ')[0] }).selectOption(lang);
    const p = page.waitForEvent('download', { timeout: 240000 }); await page.getByRole('button', { name: 'Make searchable' }).click(); const d = await p;
    const path = `/tmp/audit-ocr-${fileTag}.pdf`; await d.saveAs(path);
    const tx = (await text(path)).normalize('NFC').replace(/\s+/g, ' ');
    for (const w of wants) assert.ok(tx.includes(w.normalize('NFC')), `${label} text layer missing "${w}": ` + JSON.stringify(tx));
    const same = await diffBox(`/tmp/audit-scan-${fileTag}.pdf`, path, 1, 1); assert.equal(same.cnt, 0, 'page picture changed: ' + same.cnt + ' px');
  });
}
console.log(`${n} passed, ${fails.length} failed`, errors.length ? 'pageerrors: ' + errors.join(' | ') : '');
await browser.close(); server?.kill();
process.exit(fails.length ? 1 : 0);
