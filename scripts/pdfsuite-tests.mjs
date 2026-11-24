import {exerciseIndicConversion} from './fixtures/indic-browser.mjs';
import {exerciseCataloguePaths} from './fixtures/catalogue-browser.mjs';
import {makeTidyFixture,checkTidyDocument} from './fixtures/tidy-document.mjs';
import {makeRepairFixtures,checkRecovered} from './fixtures/malformed-repair.mjs';
import {makeBackgroundFixture,checkBackgroundPixels,chooseRedBackground} from './fixtures/visible-background.mjs';
import {makeOcrGeometryFixture,checkOcrGeometry} from './fixtures/ocr-visible-layer.mjs';
import {makeOverlayFixture,checkSignaturePixels,checkWatermarkGeometry,chooseOverlayMark,OVERLAY_X,OVERLAY_Y} from './fixtures/visible-overlays.mjs';
import {makeCropFixture,checkCropPixels,CROP_MARGINS} from './fixtures/visible-crop.mjs';
import {makeStampFixture,checkStampGeometry,STAMP_PLACES} from './fixtures/visible-stamps.mjs';
import { makeLayoutFixture, checkLayoutPixels } from './fixtures/page-layout.mjs';
import { CORNER_TABLES } from './fixtures/corner-border-table.mjs';
import { NUMERIC_TABLES } from './fixtures/borderless-numeric-table.mjs';
import { HORIZONTAL_TABLES } from './fixtures/horizontal-border-table.mjs';
// Browser checks for the PDF suite tools: upload, run, download, verify the result.
import { chromium } from '@playwright/test';
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { CI_OCR_TABLE } from './fixtures/ci-ocr-table.mjs';
import { MERGED_TABLE_PDF_B64 } from './fixtures/merged-table.mjs';
import { NESTED_TABLE_PDF_B64 } from './fixtures/nested-table.mjs';
import { SHARED_WRITER_PDF_B64, SHARED_CHROMIUM_PDF_B64 } from './fixtures/shared-border-table.mjs';
import { HEADLESS_SPACING_PDF_B64 } from './fixtures/headless-spacing.mjs';

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
  await exerciseCataloguePaths(page,{base,evidence:'/tmp/catalogue-browser',check:name=>{console.log('PASS catalogue '+name);n++;}});
  {
    const source=await makeTidyFixture();await page.goto(`${base}/tools/pdf-compress/`);
    await page.locator('input[type=file]').first().setInputFiles({name:'catalogue.pdf',mimeType:'application/pdf',buffer:source});await page.getByText('catalogue.pdf',{exact:true}).first().waitFor();
    await page.getByLabel('Method',{exact:true}).selectOption('tidy');await page.getByRole('button',{name:'Compress PDF',exact:true}).click();await page.getByRole('button',{name:'Download PDF',exact:true}).waitFor();
    const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download PDF',exact:true}).click();await(await pending).saveAs('/tmp/tidy-document.pdf');await checkTidyDocument(source,await readFile('/tmp/tidy-document.pdf'));console.log('PASS tidy preserves editable forms bookmarks attachments links and exact pixels');n++;
  }
  {
    const {good,cases}=await makeRepairFixtures();
    for(const {name,bytes}of cases){
      await page.goto(`${base}/tools/pdf-repair/`);await page.locator('input[type=file]').first().setInputFiles({name:'damaged.pdf',mimeType:'application/pdf',buffer:bytes});
      await page.getByText('damaged.pdf',{exact:true}).first().waitFor();
      const consent=page.getByRole('checkbox',{name:'Allow object recovery if the normal repair fails'});assert.equal(await consent.isChecked(),false);
      let unexpected=0;const track=()=>unexpected++;page.on('download',track);
      await page.getByRole('button',{name:'Repair PDF',exact:true}).click();await page.getByText(/after accepting the warning/).waitFor();assert.equal(unexpected,0,'Failed repair downloaded a file');page.off('download',track);
      await page.getByText('Damaged or unsupported objects may be lost',{exact:false}).waitFor();
      await consent.check();const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Repair PDF',exact:true}).click();
      const path=`/tmp/repair-${name}.pdf`;await(await pending).saveAs(path);await checkRecovered(good,await readFile(path));
      await page.getByRole('button',{name:/Remove/}).first().click();await page.locator('input[type=file]').first().setInputFiles({name:'again.pdf',mimeType:'application/pdf',buffer:bytes});
      await page.getByText('again.pdf',{exact:true}).first().waitFor();assert.equal(await consent.isChecked(),false);
      console.log('PASS consented repair '+name);n++;
    }
  }
  {
    const source=await makeBackgroundFixture();await page.goto(`${base}/tools/pdf-background/`);
    await page.locator('input[type=file]').first().setInputFiles({name:'background.pdf',mimeType:'application/pdf',buffer:source});
    await page.getByText('background.pdf',{exact:true}).first().waitFor();await chooseRedBackground(page);
    await page.getByRole('button',{name:/Apply to all pages/i}).click();
    await page.getByRole('button',{name:'Download PDF',exact:true}).waitFor();
    const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download PDF',exact:true}).click();
    const path='/tmp/visible-background.pdf';await(await pending).saveAs(path);await checkBackgroundPixels(source,await readFile(path));
    console.log('PASS background viewer geometry and blank page');n++;
  }
  for(const selected of [false,true]){
    const source=await makeOcrGeometryFixture();
    await run('pdf-ocr',source,async()=>{if(selected)await page.getByLabel('Pages',{exact:true}).fill('2');},async path=>{
      await checkOcrGeometry(source,await readFile(path),{selected});
      await copyFile(path,`/tmp/ocr-visible-${selected?'selected':'all'}.pdf`);
    },120000,true);
  }
  await exerciseIndicConversion(page,{base,path:'/tmp/indic-conversion-width.pdf'});console.log('PASS Indic converted-word selection covers painted words');n++;
  await run('pdf-delete-pages', bytes, () => page.getByPlaceholder('2,4-6').fill('2,4-6'), o => assert.equal(o.getPageCount(), 2));
  await run('pdf-crop', bytes, async () => { await page.locator('input[type=number]').nth(0).fill('10'); }, o => assert.ok(o.getPage(0).getHeight() < 842 - 20));
  for(const selected of[false,true]){
    const source=await makeCropFixture();
    await run('pdf-crop',source,async()=>{
      await page.getByText('Millimetres',{exact:true}).click();
      for(const [key,value]of Object.entries(CROP_MARGINS))await page.getByLabel(key[0].toUpperCase()+key.slice(1),{exact:true}).fill(String(value));
      if(selected)await page.getByLabel('Pages',{exact:true}).fill('2');
    },async path=>{
      await checkCropPixels(source,await readFile(path),selected);
      await mkdir('test-artifacts/pdfsuite',{recursive:true});
      await copyFile(path,`test-artifacts/pdfsuite/visible-crop-${selected?'selected':'all'}.pdf`);
    },60000,true);
  }
  await run('pdf-header-footer', bytes, null, o => assert.equal(o.getPageCount(), 6));
  await run('pdf-bates', bytes, null, o => assert.equal(o.getPageCount(), 6));
  for(const [slug,bates] of [['pdf-header-footer',false],['pdf-bates',true]])for(const place of STAMP_PLACES){
    await run(slug,await makeStampFixture(),async()=>{
      await page.getByLabel('Text',{exact:true}).fill(bates?'{bates}':'STAMP {n}/{total}');
      await page.getByLabel('Position',{exact:true}).selectOption(place);
      if(bates){await page.getByLabel('Prefix',{exact:true}).fill('CASE-');await page.getByLabel('Start at',{exact:true}).fill('7');await page.getByLabel('Digits',{exact:true}).fill('4');}
    },async path=>{
      await checkStampGeometry(await readFile(path),place,{bates});
      await mkdir('test-artifacts/pdfsuite',{recursive:true});
      await copyFile(path,`test-artifacts/pdfsuite/${slug}-${place}.pdf`);
    },60000,true);
  }
  await run('pdf-nup', bytes, null, o => assert.equal(o.getPageCount(), 3));
  await run('pdf-booklet', bytes, null, o => assert.equal(o.getPageCount(), 4));
  for (const [slug,kind] of [['pdf-nup','nup'],['pdf-booklet','booklet']]) {
    await run(slug,await makeLayoutFixture(),async()=>{
      const action=page.getByRole('button',{name:kind==='nup'?'Combine pages':'Make booklet',exact:true});
      assert.equal(await action.isEnabled(),false);
      await page.getByText('Convert cropped pages to images for this export',{exact:true}).click();
      assert.equal(await action.isEnabled(),true);
      await page.getByRole('button',{name:'Remove in.pdf',exact:true}).click();
      await page.locator('input[type=file]').first().setInputFiles({name:'in.pdf',mimeType:'application/pdf',buffer:await makeLayoutFixture()});
      await page.getByText('in.pdf').first().waitFor();
      assert.equal(await action.isEnabled(),false,'consent must reset when a file is replaced');
      await page.getByText('Convert cropped pages to images for this export',{exact:true}).click();
      await mkdir('test-artifacts/pdfsuite',{recursive:true});
      await page.screenshot({path:`test-artifacts/pdfsuite/${kind}-image-consent.png`,fullPage:true});
      await page.setViewportSize({width:393,height:852});
      const choice=page.getByText('Convert cropped pages to images for this export',{exact:true});
      await choice.scrollIntoViewIfNeeded();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Android consent layout overflows');
      await page.screenshot({path:`test-artifacts/pdfsuite/${kind}-android-consent.png`,fullPage:false});
      await action.scrollIntoViewIfNeeded();
      await action.waitFor({state:'visible'});
      assert.equal(await action.isEnabled(),true,'Android export control is enabled after consent');
      await page.screenshot({path:`test-artifacts/pdfsuite/${kind}-android-export.png`,fullPage:false});
      let downloaded=false;const onDownload=()=>{downloaded=true;};page.on('download',onDownload);
      await page.evaluate(()=>{window.__layoutBlob=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(cb){cb(null);};});
      await action.click();await page.getByText('Could not encode a cropped page. No file was saved.',{exact:true}).waitFor();
      assert.equal(downloaded,false,'image conversion failure must not download uncropped content');
      page.off('download',onDownload);await page.evaluate(()=>{HTMLCanvasElement.prototype.toBlob=window.__layoutBlob;delete window.__layoutBlob;});
      if(kind==='nup') {
      await page.getByLabel('Pages per sheet').selectOption('4');
      await page.getByText('Thin border around each page',{exact:true}).click();
      }
    },async path=>{
      await checkLayoutPixels(await readFile(path),kind);
      await page.setViewportSize({width:1200,height:900});
      await mkdir('test-artifacts/pdfsuite',{recursive:true});
      await copyFile(path,`test-artifacts/pdfsuite/rotated-crop-${kind}.pdf`);
    },60000,true);
  }
  {
    const large=await PDFDocument.create(),font=await large.embedFont(StandardFonts.Helvetica);
    const p=large.addPage([4200,2200]);p.setCropBox(100,100,4000,2000);
    p.drawText('Large page detail',{x:150,y:1900,size:12,font});
    await run('pdf-nup',Buffer.from(await large.save()),async()=>{
      await page.getByText('Convert cropped pages to images for this export',{exact:true}).click();
    },o=>{
      let imageCount=0;
      for(const[,obj]of o.context.enumerateIndirectObjects())if(obj.dict?.get(PDFName.of('Subtype'))===PDFName.of('Image')) {
        imageCount++;const w=Number(String(obj.dict.get(PDFName.of('Width')))),h=Number(String(obj.dict.get(PDFName.of('Height'))));
        assert.ok(w*h<=8006000,'canvas exceeds8MP allowance for integer rounding');
        assert.ok(w>3900&&h>1900,'large crop loses more resolution than the cap requires');
      }
      assert.equal(imageCount,1);
    });
  }
  await run('pdf-flatten', formBytes, null, o => assert.equal(o.getForm().getFields().length, 0));
  await run('pdf-rotate', bytes, null, o => { assert.equal(o.getPage(0).getRotation().angle, 90); assert.equal(o.getPageCount(), 6); });
  await run('pdf-watermark', bytes, null, o => assert.equal(o.getPageCount(), 6));
  await run('pdf-watermark',await makeOverlayFixture(),async()=>{
    await page.getByLabel('Watermark text',{exact:true}).fill('MARK');await page.getByLabel('Size (pt)',{exact:true}).fill('24');
  },async path=>{await checkWatermarkGeometry(await readFile(path));await copyFile(path,'/tmp/overlay-watermark.pdf');},60000,true);
  for(let n=1;n<=5;n++)for(const x of OVERLAY_X)for(const y of OVERLAY_Y){
    await run('pdf-sign',await makeOverlayFixture(),()=>chooseOverlayMark(page,n,x,y),async path=>{
      await checkSignaturePixels(await readFile(path),n,x,y);
      if(x==='right'&&y==='top')await copyFile(path,`/tmp/overlay-sign-${n}.pdf`);
    },60000,true);
  }
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
  // Preserve the exact external-attach source that lost one Hindi word boundary on raw Chromium.
  await run('pdf-to-word', Buffer.from(HEADLESS_SPACING_PDF_B64, 'base64'), () => page.getByLabel(/text cannot be read/).selectOption('auto'), async path => {
    const z = await (await import('jszip')).default.loadAsync(await readFile(path));
    const xml = await z.file('word/document.xml').async('string');
    const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.equal((text.match(/अनुच्छेद है जो/g) || []).length, 3, 'all3 source word boundaries');
    assert.ok(!text.includes('हैजो'), 'not a merged OCR word');
    assert.equal((xml.match(/<w:br w:type="page"\/>/g) || []).length, 1);
    const cells = [...xml.matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map(m => m[1].replace(/<[^>]+>/g, '').trim());
    assert.deepEqual(cells, ['Item', 'गणना', 'Apples', '42']);
    await mkdir('test-artifacts/pdfsuite', { recursive: true });
    await copyFile(path, 'test-artifacts/pdfsuite/headless-spacing-output.docx');
  }, 180000, true, '.docx');
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
  // Real Writer-produced PDF: inner grid belongs inside the top-right cell, not after the outer rows.
  await run('pdf-to-word', Buffer.from(NESTED_TABLE_PDF_B64, 'base64'), null, async (path) => {
    const z = await (await import('jszip')).default.loadAsync(await readFile(path));
    const xml = await z.file('word/document.xml').async('string');
    await mkdir('test-artifacts/pdfsuite', { recursive: true });
    await copyFile(path, 'test-artifacts/pdfsuite/nested-pdf-to-word.docx');
    await writeFile('test-artifacts/pdfsuite/nested-source.pdf', Buffer.from(NESTED_TABLE_PDF_B64, 'base64'));
    const structure = await page.evaluate(xml => {
      const d = new DOMParser().parseFromString(xml, 'application/xml');
      const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      const direct = (el, name) => Array.from(el.children).filter(e => e.namespaceURI === ns && e.localName === name);
      const body = d.getElementsByTagNameNS(ns, 'body')[0];
      const roots = direct(body, 'tbl');
      const rows = roots[0] ? direct(roots[0], 'tr') : [];
      const cells = rows[0] ? direct(rows[0], 'tc') : [];
      const child = cells[1] && direct(cells[1], 'tbl')[0];
      return { rootCount: roots.length, rows: rows.length, cells: cells.length,
        nested: d.getElementsByTagNameNS(ns, 'tbl').length,
        innerRows: child ? direct(child, 'tr').map(r => direct(r, 'tc').map(c => c.textContent)) : [],
        cellText: cells[1]?.textContent,
        childWidths: child ? Array.from(child.getElementsByTagNameNS(ns, 'gridCol')).map(e => Number(e.getAttributeNS(ns, 'w'))) : [],
        parentWidths: roots[0] ? Array.from(direct(roots[0], 'tblGrid')[0].children).map(e => Number(e.getAttributeNS(ns, 'w'))) : [],
        order: cells[1] ? Array.from(cells[1].children).map(e => e.localName) : [],
        secondRow: rows[1]?.textContent,
      };
    }, xml);
    assert.equal(structure.rootCount, 1);
    assert.equal(structure.nested, 2);
    assert.equal(structure.rows, 2);
    assert.equal(structure.cells, 2);
    assert.deepEqual(structure.innerRows, [['in1', 'in2'], ['inspan']]);
    assert.equal(structure.cellText, 'Before innerin1in2inspanAfter inner');
    assert.deepEqual(structure.order, ['tcPr', 'p', 'tbl', 'p', 'p']);
    assert.equal(structure.secondRow, 'Outer COuter D');
    assert.ok(structure.childWidths.reduce((a,b) => a+b, 0) < structure.parentWidths[1] * 0.7, 'inner table retains narrower source width');
    for (const word of ['in1', 'in2', 'inspan', 'Before inner', 'After inner']) assert.equal(xml.split(word).length - 1, 1, 'text exactly once: ' + word);
    assert.ok(xml.includes('<w:gridSpan w:val="2"/>'), 'inner merged row');
    assert.ok(xml.indexOf('Before the outer table') < xml.indexOf('<w:tbl>') && xml.indexOf('After the outer table') > xml.lastIndexOf('</w:tbl>'));
  }, 60000, true, '.docx');
  // Shared-side sources must retain real nesting as well as their wider inner-table geometry.
  for (const [label, fixture] of [['writer', SHARED_WRITER_PDF_B64], ['chromium', SHARED_CHROMIUM_PDF_B64]]) {
  await run('pdf-to-word', Buffer.from(fixture, 'base64'), null, async (path) => {
    const z = await (await import('jszip')).default.loadAsync(await readFile(path));
    const xml = await z.file('word/document.xml').async('string');
    await mkdir('test-artifacts/pdfsuite', { recursive: true });
    await copyFile(path, `test-artifacts/pdfsuite/shared-${label}-pdf-to-word.docx`);
    await writeFile(`test-artifacts/pdfsuite/shared-${label}-source.pdf`, Buffer.from(fixture, 'base64'));
    const structure = await page.evaluate(xml => {
      const d = new DOMParser().parseFromString(xml, 'application/xml');
      const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      const direct = (el, name) => Array.from(el.children).filter(e => e.namespaceURI === ns && e.localName === name);
      const body = d.getElementsByTagNameNS(ns, 'body')[0];
      const roots = direct(body, 'tbl');
      const rows = roots[0] ? direct(roots[0], 'tr') : [];
      const cells = rows[0] ? direct(rows[0], 'tc') : [];
      const child = cells[1] && direct(cells[1], 'tbl')[0];
      return { rootCount: roots.length, rows: rows.length, cells: cells.length,
        nested: d.getElementsByTagNameNS(ns, 'tbl').length,
        innerRows: child ? direct(child, 'tr').map(r => direct(r, 'tc').map(c => c.textContent)) : [],
        cellText: cells[1]?.textContent,
        childWidths: child ? Array.from(child.getElementsByTagNameNS(ns, 'gridCol')).map(e => Number(e.getAttributeNS(ns, 'w'))) : [],
        parentWidths: roots[0] ? Array.from(direct(roots[0], 'tblGrid')[0].children).map(e => Number(e.getAttributeNS(ns, 'w'))) : [],
        order: cells[1] ? Array.from(cells[1].children).map(e => e.localName) : [],
        secondRow: rows[1]?.textContent,
      };
    }, xml);
    assert.equal(structure.rootCount, 1);
    assert.equal(structure.nested, 2);
    assert.equal(structure.rows, 2);
    assert.equal(structure.cells, 2);
    assert.deepEqual(structure.innerRows, [['in1', 'in2'], ['inspan']]);
    assert.equal(structure.cellText, 'Before innerin1in2inspanAfter inner');
    assert.deepEqual(structure.order, ['tcPr', 'p', 'tbl', 'p', 'p']);
    assert.equal(structure.secondRow, 'Outer COuter D');
    assert.ok(structure.childWidths.reduce((a,b) => a+b, 0) > structure.parentWidths[1] * 0.85, 'shared-side child retains almost-full cell width');
    for (const word of ['in1', 'in2', 'inspan', 'Before inner', 'After inner']) assert.equal(xml.split(word).length - 1, 1, 'text exactly once: ' + word);
    assert.ok(xml.includes('<w:gridSpan w:val="2"/>'), 'inner merged row');
    assert.ok(xml.indexOf('Before the outer table') < xml.indexOf('<w:tbl>') && xml.indexOf('After the outer table') > xml.lastIndexOf('</w:tbl>'));
  }, 60000, true, '.docx');
  }
  for (const {label,bottom,pdf} of [...HORIZONTAL_TABLES,...CORNER_TABLES]) {
    await run('pdf-to-word',Buffer.from(pdf,'base64'),null,async path=>{
      const z=await(await import('jszip')).default.loadAsync(await readFile(path));
      const xml=await z.file('word/document.xml').async('string');
      await mkdir('test-artifacts/pdfsuite',{recursive:true});
      await copyFile(path,`test-artifacts/pdfsuite/horizontal-${label}-pdf-to-word.docx`);

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
    },60000,true,'.docx');
  }
  for(const {label,pdf}of NUMERIC_TABLES){
   await run('pdf-to-word',Buffer.from(pdf,'base64'),null,async path=>{
    const z=await(await import('jszip')).default.loadAsync(await readFile(path));const xml=await z.file('word/document.xml').async('string');
    await mkdir('test-artifacts/pdfsuite',{recursive:true});await copyFile(path,`test-artifacts/pdfsuite/numeric-${label}-pdf-to-word.docx`);

    const result=await page.evaluate(xml=>{
      const d=new DOMParser().parseFromString(xml,'application/xml');const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      const direct=(el,name)=>Array.from(el?.children??[]).filter(e=>e.namespaceURI===ns&&e.localName===name);
      const roots=direct(d.getElementsByTagNameNS(ns,'body')[0],'tbl');
      return {tables:roots.length,rows:direct(roots[0],'tr').map(r=>direct(r,'tc').map(c=>c.textContent))};
    },xml);
    const expected={tables:1,rows:[['Product','Units','Amount'],['Apples','7','12.50'],['Oranges','125','1234.00'],['Pears','23','85.75']]};
    if(JSON.stringify(result)!==JSON.stringify(expected))throw new Error(JSON.stringify(result));
    if((xml.match(/<w:jc w:val="right"\/>/g)||[]).length!==8)throw new Error('numeric alignment missing');
    if((xml.match(/w:val="nil"/g)||[]).length!==6)throw new Error('borderless numeric table gained borders');
    for(const text of ['Before sales table','After sales table','Apples','Oranges','Pears'])if(xml.split(text).length!==2)throw new Error('text duplication '+text);
    if(!(xml.indexOf('Before sales table')<xml.indexOf('<w:tbl>')&&xml.indexOf('After sales table')>xml.lastIndexOf('</w:tbl>')))throw new Error('borderless outside text order');
   },60000,true,'.docx');
  }
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
    // so this regression checks the spaces in all 3 occurrences.
    const docXml = await z.file('word/document.xml').async('string');
    assert.equal((docXml.match(/<w:br w:type="page"\/>/g) || []).length, 1, 'two source pages retain their boundary');
    const cells = [...docXml.matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
    await mkdir('test-artifacts/pdfsuite', { recursive: true });
    await writeFile('test-artifacts/pdfsuite/ocr-input-broken.pdf', broken);
    await copyFile('/tmp/word-to-pdf-print.pdf', 'test-artifacts/pdfsuite/word-to-pdf-print.pdf');
    await copyFile('/tmp/pdf-to-word-ocr.docx', 'test-artifacts/pdfsuite/pdf-to-word-ocr.docx');
    console.log('OCR docx tables=' + (docXml.match(/<w:tbl>/g) || []).length + ' cells=' + JSON.stringify(cells) + ' text=' + text);
    assert.deepEqual(cells, ['Item', 'गणना', 'Apples', '42'], 'OCR table cells: ' + JSON.stringify(cells));
    assert.ok(text.includes('ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ — ਦੂਜੇ ਸਫ਼ੇ ਦੀ ਸਮਗਰੀ'), 'Punjabi sentence exact: ' + text.slice(-200));
    assert.ok((text.match(/अनुच्छेद है जो/g) || []).length === 3, 'word spaces kept in all 3 Hindi lines: ' + text.slice(0, 400));
    // Keep the exact failing CI input, not only a regenerated local fixture. The source table is visible on page 1;
    // page 2 is prose and must not be turned into a false table from wide OCR word gaps.
    await page.goto(`${base}/tools/pdf-to-word/`);
    await page.locator('input[type=file]').first().setInputFiles({ name: 'ci.pdf', mimeType: 'application/pdf', buffer: Buffer.from(CI_OCR_TABLE, 'base64') });
    await page.getByText('ci.pdf').first().waitFor();
    await page.getByLabel(/text cannot be read/).selectOption('auto');
    const ciDlP = page.waitForEvent('download', { timeout: 150000 });
    await page.getByRole('button', { name: 'Convert to Word', exact: true }).click();
    await (await ciDlP).saveAs('/tmp/ci-ocr-regression.docx');
    const ciZ = await (await import('jszip')).default.loadAsync(await readFile('/tmp/ci-ocr-regression.docx'));
    const ciXml = await ciZ.file('word/document.xml').async('string');
    assert.equal((ciXml.match(/<w:br w:type="page"\/>/g) || []).length, 1, 'preserved CI input retains source page boundary');
    const ciCells = [...ciXml.matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map(m => m[1].replace(/<[^>]+>/g, '').trim());
    assert.deepEqual(ciCells, ['Item', 'गणना', 'Apples', '42']);
    assert.equal((ciXml.match(/<w:tbl>/g) || []).length, 1, 'only the actual ruled table, not Punjabi prose');
    const ciText = ciXml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.equal((ciText.match(/अनुच्छेद है जो/g) || []).length, 3, 'all 3 source spaces survive on the preserved CI input');
    console.log('PASS pdf-to-word Indic OCR fallback'); n++;
  }
  assert.deepEqual(errors, []);
  console.log(`${n} PDF suite checks passed`);
} finally {
  await browser.close(); server?.kill();
}
