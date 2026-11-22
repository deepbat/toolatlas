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
  // Office to PDF: .docx/.xlsx inputs, image-PDF output, and the selectable-text print view.
  const JSZip = (await import('jszip')).default;
  const XLSX = await import('xlsx');
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const para = (text, style = '') => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
  const docxZip = new JSZip();
  docxZip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
  docxZip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  docxZip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>');
  docxZip.file('word/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style></w:styles>');
  docxZip.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    para('Quarterly Report', 'Heading1') +
    para('नमस्ते दुनिया क्षत्रिय ज्ञान') +
    para('ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ') +
    para('English body text.') +
    `<w:tbl><w:tr><w:tc>${para('Item')}</w:tc><w:tc>${para('गणना')}</w:tc></w:tr><w:tr><w:tc>${para('Apples')}</w:tc><w:tc>${para('42')}</w:tc></w:tr></w:tbl>` +
    '<w:sectPr/></w:body></w:document>');
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
  assert.ok(wordOut.getPageCount() >= 1);
  assert.ok(wordOut.getPage(0).getWidth() > 100);
  console.log('PASS word-to-pdf image PDF'); n++;
  {
    const popP = page.waitForEvent('popup', { timeout: 30000 });
    await page.locator('label', { hasText: 'Selectable text' }).click();
    await page.getByRole('button', { name: 'Convert to PDF', exact: true }).click();
    const pop = await popP;
    await pop.waitForLoadState();
    const bodyText = await pop.locator('body').innerText();
    for (const t of ['नमस्ते दुनिया क्षत्रिय ज्ञान', 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ', 'Quarterly Report', 'गणना']) assert.ok(bodyText.includes(t), t);
    await pop.screenshot({ path: '/tmp/word-to-pdf-print.png', fullPage: true });
    await pop.close();
    console.log('PASS word-to-pdf print view'); n++;
  }

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet([['Quarterly बिक्री', '', ''], ['Item', 'गणना', 'Amount'], ['Apples', 5, 125.5], ['कुल', 7, 200]]);
  ws1['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
  ws1['!cols'] = [{ wpx: 140 }, { wpx: 80 }, { wpx: 80 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'बिक्री Data');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), 'Empty');
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
  assert.equal(xlsOut.getPageCount(), 2, 'one PDF page per sheet');
  console.log('PASS excel-to-pdf image PDF'); n++;
  {
    const popP = page.waitForEvent('popup', { timeout: 30000 });
    await page.locator('label', { hasText: 'Selectable text' }).click();
    await page.getByRole('button', { name: 'Convert to PDF', exact: true }).click();
    const pop = await popP;
    await pop.waitForLoadState();
    const bodyText = await pop.locator('body').innerText();
    for (const t of ['बिक्री Data', 'गणना', 'कुल', 'Empty', 'This sheet is empty.']) assert.ok(bodyText.includes(t), t);
    await pop.screenshot({ path: '/tmp/excel-to-pdf-print.png', fullPage: true });
    await pop.close();
    console.log('PASS excel-to-pdf print view'); n++;
  }
  assert.deepEqual(errors, []);
  console.log(`${n} PDF suite checks passed`);
} finally {
  await browser.close(); server?.kill();
}
