import { HORIZONTAL_TABLES } from './fixtures/horizontal-border-table.mjs';
// Desktop check of the newer conversion paths in the installed app's WebView2 (CDP): Word to PDF image output with its
// invisible Unicode text layer, Hindi/Punjabi per-page OCR fallback in PDF to Word, and merged-cell output in PDF to Word.
// Inputs for the OCR and merged-cell steps are PDFs produced by the app's own WebView2 print engine. Saves everything to ./out.
// Used by desktop.yml first against production through external attach, then against TESTONLY. Evidence is fixture-scoped.
import { chromium } from '@playwright/test';
import { PDFDocument, PDFName, PDFDict } from 'pdf-lib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { NESTED_TABLE_PDF_B64 } from './fixtures/nested-table.mjs';
import { SHARED_WRITER_PDF_B64, SHARED_CHROMIUM_PDF_B64 } from './fixtures/shared-border-table.mjs';

const port = process.env.CDP_PORT || '9222';
let browser;
for (let i = 0; i < 40 && !browser; i++) {
  try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); } catch { await new Promise(r => setTimeout(r, 1000)); }
}
if (!browser) { console.log('FAIL could not attach'); process.exit(1); }
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const origin = new URL(page.url()).origin;
const base = process.env.BASE || "";
const evidencePrefix = process.env.EVIDENCE_PREFIX || "final";
await mkdir('out', { recursive: true });
let failed = 0;
setTimeout(() => { console.log('FAIL watchdog'); process.exit(2); }, 420000);
async function step(name, fn) {
  try { const r = await fn(); console.log('PASS ' + name + (r ? ' :: ' + r : '')); } catch (e) { failed++; console.log('FAIL ' + name + ': ' + String(e.message).split('\n')[0]); }
}
const JSZip = (await import('jszip')).default;
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const pdfText = async (buf) => {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: false }).promise;
  const out = [];
  for (let n = 1; n <= doc.numPages; n++) out.push((await (await doc.getPage(n)).getTextContent()).items.map(i => i.str).join(' '));
  return out;
};
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const para = (t) => `<w:p><w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`;
const mk = async () => {
  const z = new JSZip();
  z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  z.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>');
  z.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    para('Quarterly Report') + para('नमस्ते दुनिया क्षत्रिय ज्ञान') +
    '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' + para('Page two starts here') + para('ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ') + para('Closing notes in English after the break.') +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>');
  return z.generateAsync({ type: 'nodebuffer' });
};
async function openTool(slug, file, mime, buf, label) {
  await page.goto(`${origin}${base}/tools/${slug}/`);
  await page.locator('input[type=file]').first().setInputFiles({ name: file, mimeType: mime, buffer: buf });
  await page.getByText(file).first().waitFor({ timeout: 20000 });
}

// 1. Word to PDF, picture output with the invisible Unicode layer: text must read back and search by phrase.
await step('word-to-pdf image PDF text layer', async () => {
  await openTool('word-to-pdf', 'fixture.docx', 'application/octet-stream', await mk());
  const p = page.waitForEvent('download', { timeout: 90000 });
  await page.getByRole('button', { name: 'Convert to PDF', exact: true }).click();
  const d = await p; await d.saveAs(`out/${evidencePrefix}-word-to-pdf-image.pdf`);
  const pages = await pdfText(await readFile(`out/${evidencePrefix}-word-to-pdf-image.pdf`));
  const txt = pages.join(' ').replace(/\s+/g, ' ');
  for (const t of ['Quarterly Report', 'नमस्ते दुनिया क्षत्रिय ज्ञान', 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ', 'Closing notes']) if (!txt.includes(t)) throw new Error('missing ' + t + ' in ' + txt.slice(0, 200));
  if (pages.length !== 2) throw new Error('pages ' + pages.length);
  // The layer must equal the visible content of the fixture built above, page by page, not just contain expected strings.
  const norm = (x) => x.replace(/\s+/g, ' ').trim();
  if (norm(pages[0]) !== 'Quarterly Report नमस्ते दुनिया क्षत्रिय ज्ञान') throw new Error('page 1 layer: ' + norm(pages[0]));
  if (norm(pages[1]) !== 'Page two starts here ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ Closing notes in English after the break.') throw new Error('page 2 layer: ' + norm(pages[1]));
  return 'pages=' + pages.length;
});

// 2. PDF to Word OCR fallback with per-page script choice, from a print PDF saved by this app's WebView2 with ToUnicode maps removed.
await step('pdf-to-word Hindi/Punjabi per-page OCR', async () => {
  const bd = await PDFDocument.load(await readFile('out/word-print-webview2.pdf'));
  for (const [, o] of bd.context.enumerateIndirectObjects()) if (o instanceof PDFDict && o.has(PDFName.of('ToUnicode'))) o.delete(PDFName.of('ToUnicode'));
  const broken = Buffer.from(await bd.save());
  await writeFile(`out/${evidencePrefix}-ocr-input-broken.pdf`, broken);
  await openTool('pdf-to-word', 'in.pdf', 'application/pdf', broken);
  await page.getByRole('button', { name: 'Convert to Word', exact: true }).click();
  await page.getByText(/could not be read back as text/).waitFor({ timeout: 40000 });
  await page.getByLabel(/text cannot be read/).selectOption('auto');
  const p = page.waitForEvent('download', { timeout: 300000 });
  await page.getByRole('button', { name: 'Convert to Word', exact: true }).click();
  const d = await p; await d.saveAs(`out/${evidencePrefix}-ocr-pdf-to-word.docx`);
  const z = await JSZip.loadAsync(await readFile(`out/${evidencePrefix}-ocr-pdf-to-word.docx`));
  const text = (await z.file('word/document.xml').async('string')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const want = ['Quarterly', 'नमस्ते दुनिया', 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ', 'Closing notes'];
  const dx = await z.file('word/document.xml').async('string');
  if ((dx.match(/<w:br w:type="page"\/>/g) || []).length !== 1) throw new Error('source page boundary not retained');
  const cells = [...dx.matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map(m => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
  console.log('OCR table cells: ' + JSON.stringify(cells));
  if (JSON.stringify(cells) !== JSON.stringify(['Item', 'गणना', 'Apples', '42'])) throw new Error('table cells ' + JSON.stringify(cells));
  const sourceSpacing = JSON.parse(await readFile('out/ocr-source-expectations.json', 'utf8'));
  if (sourceSpacing.expected !== 3 || sourceSpacing.printViewCount !== 3 || sourceSpacing.phrase !== 'अनुच्छेद है जो') throw new Error('source spacing evidence invalid');
  const spacedCount = (text.match(/अनुच्छेद है जो/g) || []).length;
  await writeFile(`out/${evidencePrefix}-ocr-spacing-result.json`, JSON.stringify({ ...sourceSpacing, outputCount: spacedCount }));
  console.log('OCR spaced phrase count (3 in source): ' + spacedCount);
  if (spacedCount !== 3) throw new Error('OCR word spacing: expected all 3 source occurrences, got ' + spacedCount);
  if (/<w:t[^>]*>\s*[|¦]+\s*<\/w:t>/.test(dx)) throw new Error('standalone border artifact in this fixture');
  const miss = want.filter(t => !text.includes(t));
  console.log('OCR docx text: ' + text.slice(0, 400));
  if (miss.length) throw new Error('missing ' + miss.join(' | '));
});

// 3. PDF to Word merged cells from a table PDF printed by this app's WebView2 (a different producer from LibreOffice).
await step('pdf-to-word merged cells from WebView2-printed table', async () => {
  await page.goto(`${origin}${base}/`);
  await page.evaluate(() => {
    document.body.innerHTML = '<style>table{border-collapse:collapse;font:16px Arial}td,th{border:1.5px solid #000;padding:8px 14px}</style><table><tr><th colspan="3">Quarterly sales</th></tr><tr><th>Region</th><th>Q1</th><th>Q2</th></tr><tr><td rowspan="2">North</td><td>100</td><td>110</td></tr><tr><td>120</td><td>130</td></tr><tr><td>South</td><td>90</td><td>95</td></tr></table>';
  });
  const cdp = await ctx.newCDPSession(page);
  const r = await cdp.send('Page.printToPDF', { printBackground: true });
  await writeFile(`out/${evidencePrefix}-merged-source.pdf`, Buffer.from(r.data, 'base64'));
  await openTool('pdf-to-word', 'table.pdf', 'application/pdf', Buffer.from(r.data, 'base64'));
  const p = page.waitForEvent('download', { timeout: 90000 });
  await page.getByRole('button', { name: 'Convert to Word', exact: true }).click();
  const d = await p; await d.saveAs(`out/${evidencePrefix}-merged-pdf-to-word.docx`);
  const z = await JSZip.loadAsync(await readFile(`out/${evidencePrefix}-merged-pdf-to-word.docx`));
  const xml = await z.file('word/document.xml').async('string');
  const span = (xml.match(/<w:gridSpan w:val="3"\/>/g) || []).length, vm = (xml.match(/<w:vMerge/g) || []).length;
  console.log(`merged docx: gridSpan3=${span} vMerge=${vm} text=` + xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 200));
  if (!span) throw new Error('no column span for the title row');
  if (!vm) throw new Error('no row span for North');
  const mc = [...xml.matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map(m => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
  console.log('merged cells: ' + JSON.stringify(mc));
  if (JSON.stringify(mc) !== JSON.stringify(['Quarterly sales', 'Region', 'Q1', 'Q2', 'North', '100', '110', '', '120', '130', 'South', '90', '95'])) throw new Error('cells ' + JSON.stringify(mc));
});

// 4. Real LibreOffice-produced nested-table PDF, shared with the web regression.
await step('pdf-to-word inset nested table', async () => {
  await openTool('pdf-to-word', 'nested.pdf', 'application/pdf', Buffer.from(NESTED_TABLE_PDF_B64, 'base64'));
  const pending = page.waitForEvent('download', { timeout: 90000 });
  await page.getByRole('button', { name: 'Convert to Word', exact: true }).click();
  const d = await pending; await d.saveAs(`out/${evidencePrefix}-nested-pdf-to-word.docx`);
  const z = await JSZip.loadAsync(await readFile(`out/${evidencePrefix}-nested-pdf-to-word.docx`));
  const xml = await z.file('word/document.xml').async('string');
  const result = await page.evaluate(xml => {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const direct = (el, name) => Array.from(el.children).filter(e => e.namespaceURI === ns && e.localName === name);
    const roots = direct(doc.getElementsByTagNameNS(ns, 'body')[0], 'tbl');
    const rows = roots[0] ? direct(roots[0], 'tr') : [];
    const cell = rows[0] && direct(rows[0], 'tc')[1];
    const nested = cell && direct(cell, 'tbl');
    return { roots: roots.length, total: doc.getElementsByTagNameNS(ns, 'tbl').length, rows: rows.length,
      nested: nested?.length, text: cell?.textContent, after: rows[1]?.textContent,
      inner: nested?.[0] ? direct(nested[0], 'tr').map(r => direct(r, 'tc').map(c => c.textContent)) : [] };
  }, xml);
  if (JSON.stringify(result) !== JSON.stringify({ roots: 1, total: 2, rows: 2, nested: 1, text: 'Before innerin1in2inspanAfter inner', after: 'Outer COuter D', inner: [['in1','in2'],['inspan']] })) throw new Error(JSON.stringify(result));
  for (const text of ['Before inner', 'in1', 'in2', 'inspan', 'After inner']) if (xml.split(text).length !== 2) throw new Error('text duplication: ' + text);
  if (!xml.includes('<w:gridSpan w:val="2"/>')) throw new Error('nested colspan missing');
});

// Shared-border fixtures use the same installed production conversion path.
for (const [label, fixture] of [['writer', SHARED_WRITER_PDF_B64], ['chromium', SHARED_CHROMIUM_PDF_B64]]) {
await step(`pdf-to-word shared-side nested table ${label}`, async () => {
  await openTool('pdf-to-word', 'nested.pdf', 'application/pdf', Buffer.from(fixture, 'base64'));
  const pending = page.waitForEvent('download', { timeout: 90000 });
  await page.getByRole('button', { name: 'Convert to Word', exact: true }).click();
  const d = await pending; await d.saveAs(`out/${evidencePrefix}-shared-${label}-pdf-to-word.docx`);
  const z = await JSZip.loadAsync(await readFile(`out/${evidencePrefix}-shared-${label}-pdf-to-word.docx`));
  const xml = await z.file('word/document.xml').async('string');
  const result = await page.evaluate(xml => {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const direct = (el, name) => Array.from(el.children).filter(e => e.namespaceURI === ns && e.localName === name);
    const roots = direct(doc.getElementsByTagNameNS(ns, 'body')[0], 'tbl');
    const rows = roots[0] ? direct(roots[0], 'tr') : [];
    const cell = rows[0] && direct(rows[0], 'tc')[1];
    const nested = cell && direct(cell, 'tbl');
    return { roots: roots.length, total: doc.getElementsByTagNameNS(ns, 'tbl').length, rows: rows.length,
      nested: nested?.length, text: cell?.textContent, after: rows[1]?.textContent,
      inner: nested?.[0] ? direct(nested[0], 'tr').map(r => direct(r, 'tc').map(c => c.textContent)) : [] };
  }, xml);
  if (JSON.stringify(result) !== JSON.stringify({ roots: 1, total: 2, rows: 2, nested: 1, text: 'Before innerin1in2inspanAfter inner', after: 'Outer COuter D', inner: [['in1','in2'],['inspan']] })) throw new Error(JSON.stringify(result));
  for (const text of ['Before inner', 'in1', 'in2', 'inspan', 'After inner']) if (xml.split(text).length !== 2) throw new Error('text duplication: ' + text);
  if (!xml.includes('<w:gridSpan w:val="2"/>')) throw new Error('nested colspan missing');
});

}

for (const {label,bottom,pdf} of HORIZONTAL_TABLES) {
 await step(`pdf-to-word horizontal-shared nested table ${label}`,async()=>{
  await openTool('pdf-to-word','horizontal.pdf','application/pdf',Buffer.from(pdf,'base64'));
  const pending=page.waitForEvent('download',{timeout:90000});
  await page.getByRole('button',{name:'Convert to Word',exact:true}).click();
  const path=`out/${evidencePrefix}-horizontal-${label}-pdf-to-word.docx`;
  await(await pending).saveAs(path);
  const z=await JSZip.loadAsync(await readFile(path));const xml=await z.file('word/document.xml').async('string');

    const result = await page.evaluate(({xml,bottom}) => {
      const d=new DOMParser().parseFromString(xml,'application/xml');
      const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      const direct=(el,name)=>Array.from(el?.children??[]).filter(e=>e.namespaceURI===ns&&e.localName===name);
      const roots=direct(d.getElementsByTagNameNS(ns,'body')[0],'tbl');
      const rows=direct(roots[0],'tr');
      const cell=direct(rows[bottom?1:0],'tc')[1];
      const nested=direct(cell,'tbl');
      return {roots:roots.length,total:d.getElementsByTagNameNS(ns,'tbl').length,rows:rows.length,
        cells:rows.map(r=>direct(r,'tc').length),inner:direct(nested[0],'tr').map(r=>direct(r,'tc').map(c=>c.textContent)),
        text:cell?.textContent,other:rows[bottom?0:1]?.textContent};
    },{xml,bottom});
    const expected={roots:1,total:2,rows:2,cells:[2,2],inner:[['in1','in2'],['inspan']],
      text:bottom?'Before innerin1in2inspan':'in1in2inspanAfter inner',other:bottom?'Outer AOuter B':'Outer COuter D'};
    if(JSON.stringify(result)!==JSON.stringify(expected))throw new Error(JSON.stringify(result));
    for(const text of ['in1','in2','inspan',bottom?'Before inner':'After inner'])if(xml.split(text).length!==2)throw new Error('text duplication: '+text);
    if(!xml.includes('<w:gridSpan w:val="2"/>'))throw new Error('horizontal nested colspan missing');
    if(!(xml.indexOf('Before outer')<xml.indexOf('<w:tbl>')&&xml.indexOf('After outer')>xml.lastIndexOf('</w:tbl>')))throw new Error('outer text order');
 });
}

console.log(failed ? 'FAILED ' + failed : 'ALL PASS');
process.exit(failed ? 1 : 0);
