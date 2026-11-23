// Desktop conversion checks in the installed app's WebView2 (CDP). Saves outputs to ./out for inspection.
// Used only by .github/workflows/desktop.yml against the test-only build.
import { chromium } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { mkdir, readFile } from 'node:fs/promises';

const port = process.env.CDP_PORT || '9222';
let browser;
for (let i = 0; i < 40 && !browser; i++) {
  try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); } catch { await new Promise(r => setTimeout(r, 1000)); }
}
if (!browser) { console.log('FAIL could not attach'); process.exit(1); }
const page = browser.contexts()[0].pages()[0];
const origin = new URL(page.url()).origin;
await mkdir('out', { recursive: true });
let failed = 0;
setTimeout(() => { console.log('FAIL watchdog: script stuck for 150s'); process.exit(2); }, 150000);
async function step(name, fn) {
  try { const r = await fn(); console.log('PASS ' + name + (r ? ' :: ' + r : '')); } catch (e) { failed++; console.log('FAIL ' + name + ': ' + String(e.message).split('\n')[0]); }
}
  const JSZip = (await import('jszip')).default;
  const XLSX = await import('xlsx');
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const para = (text, style = '') => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
  const docxZip = new JSZip();
  docxZip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
  docxZip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  docxZip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>');
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
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet([['Quarterly बिक्री', '', ''], ['Item', 'गणना', 'Amount'], ['Apples', 5, 125.5], ['कुल', 7, 200]]);
  ws1['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
  ws1['!cols'] = [{ wpx: 140 }, { wpx: 80 }, { wpx: 80 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'बिक्री Data');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Second', 'sheet']]), 'Second');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), 'Empty');
  const xlsxBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
async function convert(tool, file, mime, buf, out) {
  await page.goto(`${origin}/tools/${tool}/`);
  await page.locator('input[type=file]').first().setInputFiles({ name: file, mimeType: mime, buffer: buf });
  await page.getByText(file).first().waitFor({ timeout: 20000 });
  const p = page.waitForEvent('download', { timeout: 120000 });
  await page.getByRole('button', { name: 'Convert to PDF', exact: true }).click();
  const dl = await p;
  await dl.saveAs(out);
  const doc = await PDFDocument.load(await readFile(out));
  return `${dl.suggestedFilename()} ${doc.getPageCount()} pages`;
}
await step('word-to-pdf image PDF', () => convert('word-to-pdf', 'fixture.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', docxBuf, 'out/word-image.pdf'));
await step('excel-to-pdf image PDF', () => convert('excel-to-pdf', 'book.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xlsxBuf, 'out/excel-image.pdf'));
await step('pdf-to-word downloads a docx', async () => {
  const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica);
  d.addPage([595, 842]).drawText('Hello desktop', { x: 60, y: 700, size: 24, font: f });
  await page.goto(`${origin}/tools/pdf-to-word/`);
  await page.locator('input[type=file]').first().setInputFiles({ name: 'in.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await d.save()) });
  await page.getByText('in.pdf').first().waitFor({ timeout: 20000 });
  const p = page.waitForEvent('download', { timeout: 60000 });
  await page.getByRole('button', { name: 'Convert to Word', exact: true }).click();
  const dl = await p; await dl.saveAs('out/pdf-to-word.docx');
  const b = await readFile('out/pdf-to-word.docx');
  if (b[0] !== 0x50 || b[1] !== 0x4b) throw new Error('not a zip');
  return dl.suggestedFilename() + ' ' + b.length + ' bytes';
});
await step('word-to-pdf selectable print view starts printing (hidden frame fallback)', async () => {
  await page.evaluate(() => localStorage.setItem('toolatlas.nativePdfSave', '0')); // this step tests the print-dialog fallback
  await page.goto(`${origin}/tools/word-to-pdf/`);
  await page.locator('input[type=file]').first().setInputFiles({ name: 'fixture.docx', mimeType: 'application/octet-stream', buffer: docxBuf });
  await page.getByText('fixture.docx').first().waitFor({ timeout: 20000 });
  await page.locator('label', { hasText: 'Selectable text' }).click();
  await page.getByRole('button', { name: 'Convert to PDF', exact: true }).click();
  // window.print() opens a modal native dialog that blocks further page calls, so do not touch the page again.
  await new Promise(r => setTimeout(r, 6000));
  console.log('print step: clicked Convert with Selectable text; screen capture follows');
  console.log(failed ? 'done with failures' : 'done');
  process.exit(failed ? 1 : 0);
  return 'hidden print frame present with Devanagari text; screen capture follows';
});
console.log('done');
process.exit(failed ? 1 : 0);
