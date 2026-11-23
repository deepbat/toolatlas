// Browser checks for the PDF suite tools: upload, run, download, verify the result.
import { chromium } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MERGED_TABLE_PDF_B64 } from './fixtures/merged-table.mjs';

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
const VERB = { 'pdf-delete-pages': 'Delete pages', 'pdf-crop': 'Crop PDF', 'pdf-header-footer': 'Add header or footer', 'pdf-bates': 'Add Bates numbers', 'pdf-nup': 'Combine pages', 'pdf-booklet': 'Make booklet', 'pdf-flatten': 'Flatten forms', 'pdf-rotate': 'Rotate pages', 'pdf-watermark': 'Add watermark', 'pdf-page-organiser': 'Reorder pages', 'pdf-sign': 'Sign PDF', 'pdf-ocr': 'Make searchable', 'pdf-protect': 'Protect PDF', 'pdf-unlock': 'Unlock PDF', 'pdf-repair': 'Repair PDF', 'pdf-to-word': 'Convert to Word' };
async function run(id, data, setup, check, timeoutMs, raw, keepName) {
  await page.goto(`${base}/tools/${id}/`);
  await page.locator('input[type=file]').first().setInputFiles({ name: 'in.pdf', mimeType: 'application/pdf', buffer: data });
  await page.getByText('in.pdf').first().waitFor();
  if (setup) await setup();
  const pending = page.waitForEvent('download', { timeout: timeoutMs ?? 30000 });
  await page.getByRole('button', { name: VERB[id], exact: true }).click();
  const dl = await pending;
  const path = `/tmp/suite-${id}.pdf`;
  await dl.saveAs(path);
  if (keepName) assert.ok(dl.suggestedFilename().endsWith(keepName), dl.suggestedFilename());
  if (raw) { await check(path); } else { const out = await PDFDocument.load(await readFile(path)); await check(out); }
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
  // PDF to Word: a real LibreOffice table with a column-spanning title and a row-spanning cell keeps its merges.
  await run('pdf-to-word', Buffer.from(MERGED_TABLE_PDF_B64, 'base64'), null, async (path) => {
    const z = await (await import('jszip')).default.loadAsync(await readFile(path));
    const xml = await z.file('word/document.xml').async('string');
    assert.equal((xml.match(/<w:tbl>/g) || []).length, 1, 'one table');
    assert.ok(/<w:gridSpan w:val="3"\/>/.test(xml), 'title row spans three columns');
    assert.equal((xml.match(/<w:vMerge w:val="restart"\/>/g) || []).length, 1, 'one row-spanning cell');
    assert.equal((xml.match(/<w:vMerge\/>/g) || []).length, 1, 'its continuation cell');
    const rows = xml.slice(xml.indexOf('<w:tbl>'), xml.indexOf('</w:tbl>')).split('<w:tr>').slice(1).map((r) => (r.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')));
    assert.deepEqual(rows, [['Q1 Results'], ['Region', 'Units', 'Revenue'], ['North', '10', '100'], ['20', '200'], ['South', '30', '300']]);
    assert.ok(xml.indexOf('Sales summary') < xml.indexOf('<w:tbl>') && xml.indexOf('<w:tbl>') < xml.indexOf('After the table.'), 'table sits between the two paragraphs');
  }, 60000, true, '.docx');
  // PDF to Word with a picture between two paragraphs: the picture must come out as a real image, in place, with its pixels.
  {
    const dataUrl = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 120; c.height = 60; const x = c.getContext('2d');
      x.fillStyle = '#d02020'; x.fillRect(0, 0, 60, 60); x.fillStyle = '#2040d0'; x.fillRect(60, 0, 60, 60);
      return c.toDataURL('image/png');
    });
    const pd = await PDFDocument.create();
    const f = await pd.embedFont(StandardFonts.Helvetica);
    const pgi = pd.addPage([595, 842]);
    pgi.drawText('Paragraph before the picture', { x: 56, y: 780, size: 12, font: f });
    pgi.drawImage(await pd.embedPng(Buffer.from(dataUrl.split(',')[1], 'base64')), { x: 56, y: 640, width: 240, height: 120 });
    pgi.drawText('Paragraph after the picture', { x: 56, y: 600, size: 12, font: f });
    await run('pdf-to-word', Buffer.from(await pd.save()), null, async (path) => {
      const z = await (await import('jszip')).default.loadAsync(await readFile(path));
      const xml = await z.file('word/document.xml').async('string');
      await (await import('node:fs/promises')).copyFile(path, '/tmp/pdf-to-word-image.docx');
      const media = Object.keys(z.files).filter((n) => n.startsWith('word/media/'));
      assert.equal(media.length, 1, 'one picture carried over: ' + media.join());
      assert.ok(xml.indexOf('before the picture') < xml.indexOf('<w:drawing>') && xml.indexOf('<w:drawing>') < xml.indexOf('after the picture'), 'picture sits between the two paragraphs');
      const b64 = await z.file(media[0]).async('base64');
      const px = await page.evaluate(async (b) => {
        const img = new Image(); img.src = 'data:image/png;base64,' + b; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
        return { w: img.width, h: img.height, l: [...x.getImageData(10, 30, 1, 1).data], r: [...x.getImageData(img.width - 10, 30, 1, 1).data] };
      }, b64);
      assert.deepEqual([px.w, px.h], [120, 60]);
      assert.ok(px.l[0] > 180 && px.l[2] < 80 && px.r[2] > 160 && px.r[0] < 80, 'left red, right blue: ' + JSON.stringify(px));
    }, 60000, true, '.docx');
  }
  await run('pdf-protect', bytes, async () => {
    await page.getByPlaceholder('Password', { exact: true }).fill('s3cret');
    await page.getByPlaceholder('Repeat password').fill('s3cret');
  }, async (path) => { await assert.rejects(PDFDocument.load(await readFile(path))); }, 60000, true);
  await run('pdf-unlock', await readFile('/tmp/suite-pdf-protect.pdf'), () => page.getByPlaceholder('Password (if any)').fill('s3cret'), o => assert.equal(o.getPageCount(), 6), 60000);
  await run('pdf-repair', bytes, null, o => assert.equal(o.getPageCount(), 6), 60000);
  await run('pdf-to-word', bytes, null, async (path) => {
    const buf = await readFile(path);
    assert.ok(buf[0] === 0x50 && buf[1] === 0x4b, 'docx should be a zip');
  }, 60000, true, '.docx');
  const JSZipLayout = (await import('jszip')).default;
  // PDF to Word layout on a generated PDF: a text-aligned table with a wrapped cell, then two prose columns and a list.
  {
    const lay = await PDFDocument.create();
    const font = await lay.embedFont(StandardFonts.Helvetica);
    const pg = lay.addPage([595, 842]);
    const t = (text, x, y) => pg.drawText(text, { x, y, size: 11, font });
    t('Situation', 56, 800); t('Required action', 200, 800);
    t('Server outage', 56, 780); t('Notify the on-call engineer', 200, 780);
    t('Data request', 56, 760); t('Verify the requester first', 200, 760);
    t('Late invoice', 56, 740); t('Send a reminder after a week', 200, 740);
    const left = ['The council met on Tuesday and', 'discussed the new parking rules', 'for the town centre, which many'];
    const right = ['Meanwhile the library announced', 'longer opening hours from March,', 'with evening sessions for'];
    left.forEach((l, i) => t(l, 56, 640 - i * 14)); right.forEach((l, i) => t(l, 310, 640 - i * 14));
    t('1. First step', 70, 560); t('2. Second step', 70, 546);
    await run('pdf-to-word', Buffer.from(await lay.save()), null, async (path) => {
      const z = await JSZipLayout.loadAsync(await readFile(path));
      const xml = await z.file('word/document.xml').async('string');
      assert.equal((xml.match(/<w:tbl>/g) || []).length, 1, 'one table rebuilt, columns and list are not tables');
      assert.ok(xml.indexOf('which many') < xml.indexOf('Meanwhile the library'), 'left column is read before the right column');
      assert.ok(xml.indexOf('First step') > 0 && xml.indexOf('</w:p><w:p>', xml.indexOf('First step')) > 0, 'list items are separate paragraphs');
    }, 60000, true, '.docx');
  }
  // Office to PDF: .docx/.xlsx inputs, image-PDF output, and the selectable-text print view.
  const JSZip = (await import('jszip')).default;
  const XLSX = await import('xlsx');
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const para = (text, style = '') => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
  const docxZip = new JSZip();
  docxZip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
  docxZip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  docxZip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  docxZip.file('word/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style></w:styles>');
  const longMixed = 'The quarter closed strongly across every region. नमस्ते दुनिया, यह एक लंबा अनुच्छेद है जो कई पंक्तियों में लिपटना चाहिए। '.repeat(3) + 'क्षत्रिय ज्ञान अंत तक पहुँचना चाहिए बिना कटे।';
  const borders = '<w:tblPr><w:tblBorders><w:top w:val="single" w:sz="8" w:space="0" w:color="1F2937"/><w:left w:val="single" w:sz="8" w:space="0" w:color="1F2937"/><w:bottom w:val="single" w:sz="8" w:space="0" w:color="1F2937"/><w:right w:val="single" w:sz="8" w:space="0" w:color="1F2937"/><w:insideH w:val="single" w:sz="8" w:space="0" w:color="1F2937"/><w:insideV w:val="single" w:sz="8" w:space="0" w:color="1F2937"/></w:tblBorders></w:tblPr>';
  docxZip.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    para('Quarterly Report', 'Heading1') +
    para('नमस्ते दुनिया क्षत्रिय ज्ञान') +
    para(longMixed) +
    `<w:tbl>${borders}<w:tr><w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr>${para('Item')}</w:tc><w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr>${para('गणना')}</w:tc></w:tr><w:tr><w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr>${para('Apples')}</w:tc><w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr>${para('42')}</w:tc></w:tr></w:tbl>` +
    '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' +
    para('Page two starts here') +
    para('ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ — ਦੂਜੇ ਸਫ਼ੇ ਦੀ ਸਮਗਰੀ। ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ।') +
    para('Closing notes in English after the break.') +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>');
  const docxBuf = await docxZip.generateAsync({ type: 'nodebuffer' });

  await page.goto(`${base}/tools/word-to-pdf/`);
  await page.locator('input[type=file]').first().setInputFiles({ name: 'fixture.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: docxBuf });
  await page.getByText('fixture.docx').first().waitFor();
  const dlwP = page.waitForEvent('download', { timeout: 90000 });
  await page.getByRole('button', { name: 'Convert to PDF', exact: true }).click();
  const dlw = await dlwP;
  await dlw.saveAs('/tmp/suite-word-to-pdf.pdf');
  assert.ok(dlw.suggestedFilename().endsWith('.pdf'), dlw.suggestedFilename());
  const wordOut = await PDFDocument.load(await readFile('/tmp/suite-word-to-pdf.pdf'));
  assert.equal(wordOut.getPageCount(), 2, 'image PDF keeps the stored page break');
  assert.ok(wordOut.getPage(0).getWidth() > 100);
  {
    // The image PDF carries an exact invisible text layer: Indic text must read back letter for letter.
    // pdf.js reads the saved file in a separate page (no system PDF tools needed).
    const rp = await (await browser.newContext()).newPage();
    await rp.route('**/__pdfjs/**', async (route) => { const f = route.request().url().split('/__pdfjs/')[1]; await route.fulfill({ body: await readFile('node_modules/pdfjs-dist/build/' + f), contentType: 'text/javascript' }); });
    await rp.goto(base + '/');
    const pages = await rp.evaluate(async ([u, b64]) => {
      const m = await import(u + '/__pdfjs/pdf.min.mjs'); window.pdfjsWorker = await import(u + '/__pdfjs/pdf.worker.min.mjs');
      const doc = await m.getDocument({ data: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) }).promise;
      const out = [];
      for (let n = 1; n <= doc.numPages; n++) { const c = await (await doc.getPage(n)).getTextContent(); out.push(c.items.map((i) => i.str).join(' ')); }
      return out;
    }, [base, (await readFile('/tmp/suite-word-to-pdf.pdf')).toString('base64')]);
    await rp.close();
    const txt = pages.join(' ').replace(/\s+/g, ' ');
    for (const t of ['Quarterly Report', 'नमस्ते दुनिया क्षत्रिय ज्ञान', 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ', 'गणना', 'Closing notes']) assert.ok(txt.includes(t), 'text layer has ' + t + ' got: ' + txt.slice(0, 400));
    assert.ok(pages[1].includes('Page two starts here') && !pages[0].includes('Page two starts here'), 'text layer keeps the page split');
  }
  console.log('PASS word-to-pdf image PDF'); n++;
  {
    const popP = page.waitForEvent('popup', { timeout: 30000 });
    await page.locator('label', { hasText: 'Selectable text' }).click();
    await page.getByRole('button', { name: 'Convert to PDF', exact: true }).click();
    const pop = await popP;
    await pop.waitForLoadState();
    const bodyText = await pop.locator('body').innerText();
    const headW = await pop.evaluate(() => { const e = [...document.querySelectorAll('span')].find((x) => x.textContent === 'Quarterly Report'); return e ? Number(getComputedStyle(e).fontWeight) : 0; });
    assert.ok(headW >= 600, 'Heading 1 style is applied (bold) in the print view, got weight ' + headW);
    for (const t of ['नमस्ते दुनिया', 'क्षत्रिय', 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ', 'Quarterly Report', 'गणना', 'Page two starts here']) assert.ok(bodyText.includes(t), t);
    // What the browser's Save as PDF actually produces (headless Chromium print):
    await pop.pdf({ path: '/tmp/word-to-pdf-print.pdf' });
    await pop.screenshot({ path: '/tmp/word-to-pdf-print.png', fullPage: true });
    await pop.close();
    const printOut = await PDFDocument.load(await readFile('/tmp/word-to-pdf-print.pdf'));
    assert.ok(printOut.getPageCount() >= 2, 'print PDF paginates across pages');
    console.log('PASS word-to-pdf print view'); n++;
  }
  {
    // Desktop webviews and popup blockers refuse window.open: the print view must fall back to a hidden frame.
    await page.goto(`${base}/tools/word-to-pdf/`);
    await page.evaluate(() => { window.open = () => null; window.__printed = 0; });
    await page.locator('input[type=file]').first().setInputFiles({ name: 'fixture.docx', mimeType: 'application/octet-stream', buffer: docxBuf });
    await page.getByText('fixture.docx').first().waitFor();
    await page.locator('label', { hasText: 'Selectable text' }).click();
    await page.evaluate(() => { const orig = HTMLIFrameElement.prototype; const d = Object.getOwnPropertyDescriptor(orig, 'contentWindow'); Object.defineProperty(orig, 'contentWindow', { get() { const w = d.get.call(this); if (w && !w.__hooked) { w.__hooked = true; w.print = () => { window.__printed++; }; } return w; }, configurable: true }); });
    await page.getByRole('button', { name: 'Convert to PDF', exact: true }).click();
    await page.waitForFunction(() => window.__printed === 1, null, { timeout: 15000 });
    const frameText = await page.evaluate(() => document.querySelector('iframe[data-print-frame]')?.contentDocument?.body?.innerText || '');
    for (const t of ['नमस्ते दुनिया', 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ', 'Quarterly Report']) assert.ok(frameText.includes(t), t);
    assert.equal(await page.getByText('blocked the print window').count(), 0);
    console.log('PASS word-to-pdf print view falls back to a hidden frame when popups are blocked'); n++;
  }

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet([['Quarterly बिक्री', '', ''], ['Item', 'गणना', 'Amount'], ['Apples', 5, 125.5], ['कुल', 7, 200]]);
  ws1['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
  ws1['!cols'] = [{ wpx: 140 }, { wpx: 80 }, { wpx: 80 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'बिक्री Data');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Second', 'sheet']]), 'Second');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), 'Blank');
  const xlsxBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  await page.goto(`${base}/tools/excel-to-pdf/`);
  await page.locator('input[type=file]').first().setInputFiles({ name: 'book.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: xlsxBuf });
  await page.getByText('book.xlsx').first().waitFor();
  const dlxP = page.waitForEvent('download', { timeout: 90000 });
  await page.getByRole('button', { name: 'Convert to PDF', exact: true }).click();
  const dlx = await dlxP;
  await dlx.saveAs('/tmp/suite-excel-to-pdf.pdf');
  assert.ok(dlx.suggestedFilename().endsWith('.pdf'), dlx.suggestedFilename());
  const xlsOut = await PDFDocument.load(await readFile('/tmp/suite-excel-to-pdf.pdf'));
  assert.equal(xlsOut.getPageCount(), 2, 'one PDF page per worksheet with cells; the blank worksheet adds none');
  console.log('PASS excel-to-pdf image PDF'); n++;
  {
    const popP = page.waitForEvent('popup', { timeout: 30000 });
    await page.locator('label', { hasText: 'Selectable text' }).click();
    await page.getByRole('button', { name: 'Convert to PDF', exact: true }).click();
    const pop = await popP;
    await pop.waitForLoadState();
    const bodyText = await pop.locator('body').innerText();
    for (const t of ['बिक्री Data', 'गणना', 'कुल', 'Second']) assert.ok(bodyText.includes(t), t);
    for (const t of ['Blank', 'This sheet is empty.']) assert.ok(!bodyText.includes(t), 'empty worksheet adds no text: ' + t);
    await pop.pdf({ path: '/tmp/excel-to-pdf-print.pdf' });
    await pop.screenshot({ path: '/tmp/excel-to-pdf-print.png', fullPage: true });
    await pop.close();
    const xlsPrint = await PDFDocument.load(await readFile('/tmp/excel-to-pdf-print.pdf'));
    assert.ok(xlsPrint.getPageCount() >= 2, 'print PDF keeps sheets on separate pages');
    console.log('PASS excel-to-pdf print view'); n++;
  }
  {
    // A PDF whose Indic text cannot be read back (Chromium print output): refused by default, and with OCR chosen only that
    // page is read from its picture. Pages are mixed here: page one is Latin plus Hindi, page two is Punjabi.
    // Strip the ToUnicode maps from the real Chromium print PDF: the glyphs stay, but pdf.js can no longer map them to text.
    const { PDFName, PDFDict } = await import('pdf-lib');
    const bd = await PDFDocument.load(await readFile('/tmp/word-to-pdf-print.pdf'));
    for (const [, o] of bd.context.enumerateIndirectObjects()) if (o instanceof PDFDict && o.has(PDFName.of('ToUnicode'))) o.delete(PDFName.of('ToUnicode'));
    const broken = Buffer.from(await bd.save());
    await page.goto(`${base}/tools/pdf-to-word/`);
    await page.locator('input[type=file]').first().setInputFiles({ name: 'in.pdf', mimeType: 'application/pdf', buffer: broken });
    await page.getByText('in.pdf').first().waitFor();
    await page.getByRole('button', { name: 'Convert to Word', exact: true }).click();
    await page.getByText(/could not be read back as text/).waitFor({ timeout: 30000 });
    await page.getByLabel(/text cannot be read/).selectOption('auto');
    const dlP = page.waitForEvent('download', { timeout: 150000 });
    await page.getByRole('button', { name: 'Convert to Word', exact: true }).click();
    const dl = await dlP;
    await dl.saveAs('/tmp/pdf-to-word-ocr.docx');
    const z = await (await import('jszip')).default.loadAsync(await readFile('/tmp/pdf-to-word-ocr.docx'));
    const text = (await z.file('word/document.xml').async('string')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    for (const t of ['Quarterly', 'Report', 'नमस्ते दुनिया', 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ', 'ਸਮਗਰੀ', 'Closing notes']) assert.ok(text.includes(t), 'OCR fallback text has ' + t + ': ' + text.slice(0, 300));
    // Every table cell, exactly and in order (an earlier build dropped the last row and read a Hindi cell as Latin), and the
    // Punjabi sentence exactly. Recognition is still a guess: the Hindi paragraph can merge two words ("है जो" read as one),
    // so word spacing is checked as a floor of 2 of the 3 occurrences, not as exact text.
    const docXml = await z.file('word/document.xml').async('string');
    const cells = [...docXml.matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
    assert.deepEqual(cells, ['Item', 'गणना', 'Apples', '42'], 'OCR table cells: ' + JSON.stringify(cells));
    assert.ok(text.includes('ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ — ਦੂਜੇ ਸਫ਼ੇ ਦੀ ਸਮਗਰੀ'), 'Punjabi sentence exact: ' + text.slice(-200));
    assert.ok((text.match(/अनुच्छेद है जो/g) || []).length >= 2, 'word spaces kept in at least 2 of 3 Hindi lines: ' + text.slice(0, 400));
    console.log('PASS pdf-to-word Indic OCR fallback'); n++;
  }
  assert.deepEqual(errors, []);
  console.log(`${n} PDF suite checks passed`);
} finally {
  await browser.close(); server?.kill();
}
