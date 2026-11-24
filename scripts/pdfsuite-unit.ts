import {makeCropFixture,checkCropPixels,CROP_MARGINS} from './fixtures/visible-crop.mjs';
import {makeStampFixture,checkStampGeometry,STAMP_PLACES} from './fixtures/visible-stamps.mjs';
import { makeLayoutFixture, checkLayoutPixels } from './fixtures/page-layout.mjs';
import { readFile } from 'node:fs/promises';
import { indicWordSpacing } from '../src/tools/pdfsuite/ocrSpacing';
import joined from './fixtures/ocr-joined-word.json';
// Unit tests for the pure PDF suite operations.
import { PDFDocument, StandardFonts } from 'pdf-lib';
import assert from 'node:assert/strict';
import { addTextLayer, booklet, bookletOrder, cropPages, deletePages, flattenForms, nUp, parsePageRanges, reorderPages, rotatePages, signPdf, stampText, toWinAnsi, watermark } from '../src/tools/pdfsuite/ops';
import { protectPdf, repairPdf, unlockPdf } from '../src/tools/pdfsuite/qpdf';
import { buildDocx, itemsToParagraphs } from '../src/tools/pdfsuite/docx';
import { gridsFromLines, isOcrRuleBar } from '../src/tools/pdfsuite/rulings';
import { readZip } from '../src/lib/zip';
import { indexToCol, parseRange, sheetToTable, workbookToTables } from '../src/tools/pdfsuite/office2pdf';

async function make(n: number, size: [number, number] = [595, 842]) {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < n; i++) d.addPage(size).drawText(`Page ${i + 1}`, { x: 50, y: 700, size: 24, font: f });
  return d.save();
}
const count = async (b: Uint8Array) => (await PDFDocument.load(b)).getPageCount();

assert.deepEqual(parsePageRanges('1-3,5', 6), [0, 1, 2, 4]);
assert.deepEqual(parsePageRanges('4-', 6), [3, 4, 5]);
assert.deepEqual(parsePageRanges('', 3), [0, 1, 2]);
assert.deepEqual(parsePageRanges('3-1', 3), [2, 1, 0]);
assert.throws(() => parsePageRanges('9', 3));
assert.throws(() => parsePageRanges('x', 3));
console.log('PASS page ranges');

assert.equal(await count(await deletePages(await make(5), '2,4-5')), 2);
console.log('PASS delete pages');

{
  const out = await cropPages(await make(2), { top: 50, right: 20, bottom: 30, left: 10 }, '1');
  const d = await PDFDocument.load(out);
  const [p1, p2] = d.getPages();
  assert.equal(Math.round(p1.getWidth()), 565);
  assert.equal(Math.round(p1.getHeight()), 762);
  assert.equal(Math.round(p2.getWidth()), 595);
  console.log('PASS crop');
}

{
  const out = await stampText(await make(3), { text: 'Page {n} of {total} {bates}', place: 'footer-center', batesPrefix: 'ACME-', batesStart: 7, batesDigits: 4 });
  const d = await PDFDocument.load(out);
  assert.equal(d.getPageCount(), 3);
  const raw = Buffer.from(out).toString('latin1');
  assert.ok(raw.length > 0);
  console.log('PASS stamp text');
}

assert.deepEqual(bookletOrder(4), [3, 0, 1, 2]);
assert.deepEqual(bookletOrder(8), [7, 0, 1, 6, 5, 2, 3, 4]);

assert.equal(bookletOrder(5).filter((v) => v === -1).length, 3);
assert.equal(await count(await booklet(await make(6))), 4);
console.log('PASS booklet');

assert.equal(await count(await nUp(await make(5), 2)), 3);
assert.equal(await count(await nUp(await make(9), 9)), 1);
assert.equal(await count(await nUp(await make(10), 4)), 3);
console.log('PASS n-up');

{
  const d = await PDFDocument.create();
  const p = d.addPage([300, 300]);
  const f = d.getForm().createTextField('name');
  f.setText('Deepak');
  f.addToPage(p, { x: 20, y: 200, width: 150, height: 24 });
  const flat = await PDFDocument.load(await flattenForms(await d.save()));
  assert.equal(flat.getForm().getFields().length, 0);
  console.log('PASS flatten');
}
{
  const out = await rotatePages(await make(2), 90, '1');
  const d = await PDFDocument.load(out);
  assert.equal(d.getPage(0).getRotation().angle, 90);
  assert.equal(d.getPage(1).getRotation().angle, 0);
  const back = await PDFDocument.load(await rotatePages(out, 270, '1'));
  assert.equal(back.getPage(0).getRotation().angle, 0);
  console.log('PASS rotate pages');
}

{
  const out = await watermark(await make(2), { text: 'CONFIDENTIAL' });
  assert.equal(await count(out), 2);
  assert.ok(out.length > 0);
  await assert.rejects(watermark(await make(1), { text: '   ' }));
  console.log('PASS watermark');
}

{
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  [595, 600, 605, 610].forEach((w, i) => d.addPage([w, 842]).drawText(`Page ${i + 1}`, { x: 50, y: 700, size: 24, font: f }));
  d.setTitle('Order check');
  const sized = await d.save();
  const out = await PDFDocument.load(await reorderPages(sized, '3,1,1'));
  assert.deepEqual(out.getPages().map((p) => p.getWidth()), [605, 595, 595]);
  assert.equal(out.getTitle(), 'Order check');
  await assert.rejects(reorderPages(sized, '9'));
  await assert.rejects(reorderPages(sized, '  '));
  await assert.rejects(reorderPages(sized, '2,x'));
  console.log('PASS reorder pages');
}
{
  const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
  const input = await make(2);
  const out = await signPdf(input, { page: 2, png, width: 140, height: 60, x: 'right', y: 'bottom' });
  assert.equal(await count(out), 2);
  assert.ok(out.length > input.length);
  await assert.rejects(signPdf(input, { page: 9, png, width: 140, height: 60, x: 'left', y: 'top' }));
  await assert.rejects(signPdf(input, { page: 1, png, width: 4, height: 4, x: 'left', y: 'top' }));
  console.log('PASS sign pdf');
}
{
  assert.equal(toWinAnsi('“Hello” — naïve 日本'), '"Hello" - nave');
  const input = await make(2);
  const out = await addTextLayer(input, [{ page: 1, imgWidth: 1190, imgHeight: 1684, words: [
    { text: 'Hello', x0: 100, y0: 100, x1: 220, y1: 148 },
    { text: 'wörld', x0: 230, y0: 100, x1: 350, y1: 148 },
  ] }]);
  assert.equal(await count(out), 2);
  assert.ok(out.length > input.length);
  await assert.rejects(addTextLayer(input, [{ page: 9, imgWidth: 100, imgHeight: 100, words: [] }]));
  await assert.rejects(addTextLayer(input, [{ page: 1, imgWidth: 0, imgHeight: 100, words: [] }]));
  console.log('PASS ocr text layer');
}
{
  const wasm = new URL('../node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.wasm', import.meta.url).pathname;
  const input = await make(2);
  const locked = await protectPdf(input, 's3cret', wasm);
  await assert.rejects(PDFDocument.load(locked));
  const back = await unlockPdf(locked, 's3cret', wasm);
  assert.equal(await count(back), 2);
  await assert.rejects(unlockPdf(locked, 'wr0ng', wasm), /password/i);
  await assert.rejects(protectPdf(input, '', wasm));
  assert.equal(await count(await repairPdf(input, wasm)), 2);
  console.log('PASS protect/unlock/repair');
}
{
  const paras = itemsToParagraphs([
    { text: 'Annual', size: 24, bold: false, italic: false, y: 100, x: 50 },
    { text: 'Report', size: 24, bold: false, italic: false, y: 100, x: 150 },
    { text: 'First line of body', size: 12, bold: false, italic: false, y: 70, x: 50 },
    { text: 'second line', size: 12, bold: true, italic: false, y: 56, x: 50 },
    { text: 'continues', size: 12, bold: true, italic: false, y: 56, x: 200 },
  ]);
  assert.equal(paras.length, 2);
  assert.equal(paras[0].level, 1);
  assert.equal(paras[1].level, 0);
  assert.match(paras[0].runs[0].text, /Annual Report/);
  const zip = await readZip(buildDocx(paras));
  for (const name of ['[Content_Types].xml', '_rels/.rels', 'word/_rels/document.xml.rels', 'word/document.xml', 'word/styles.xml']) assert.ok(zip.has(name), name);
  const xml = new TextDecoder().decode(zip.get('word/document.xml'));
  assert.ok(xml.includes('<w:pStyle w:val="Heading1"/>'));
  assert.ok(xml.includes('First line of body'));
  assert.ok(xml.includes('second line continues'));
  console.log('PASS pdf to word docx');
}
{
  // Indic scripts survive the PDF-to-Word path byte for byte (Unicode end to end).
  const paras = itemsToParagraphs([
    { text: 'नमस्ते दुनिया', size: 12, bold: false, italic: false, y: 100, x: 50 },
    { text: 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ', size: 12, bold: false, italic: false, y: 86, x: 50 },
    { text: 'क्षत्रिय और ज्ञान', size: 12, bold: false, italic: false, y: 72, x: 50 },
    { text: 'Hello world', size: 12, bold: false, italic: false, y: 58, x: 50 },
  ]);
  const xml = new TextDecoder().decode((await readZip(buildDocx(paras))).get('word/document.xml'));
  for (const t of ['नमस्ते दुनिया', 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ', 'क्षत्रिय और ज्ञान', 'Hello world']) assert.ok(xml.includes(t), t);
  console.log('PASS pdf to word Indic scripts');
}
{
  // Simple text-aligned tables become real Word tables; ragged lines and plain prose do not.
  const it = (text: string, x: number, y: number, w = 60) => ({ text, size: 12, bold: false, italic: false, y, x, w });
  const paras = itemsToParagraphs([
    it('Intro paragraph before the table', 50, 200, 200),
    it('Item', 50, 170), it('Qty', 200, 170), it('Price', 350, 170),
    it('Pen', 50, 156), it('4', 200, 156), it('12.50', 350, 156),
    it('बिक्री', 50, 142), it('10', 200, 142), it('99.00', 351, 142),
    it('Closing note after the table', 50, 100, 200),
  ]);
  const tbl = paras.filter((p) => p.table);
  assert.equal(tbl.length, 1, 'one table found');
  assert.deepEqual(tbl[0].table, [['Item', 'Qty', 'Price'], ['Pen', '4', '12.50'], ['बिक्री', '10', '99.00']]);
  assert.equal(paras.filter((p) => !p.table).length, 2, 'text before and after stay paragraphs');
  const xml = new TextDecoder().decode((await readZip(buildDocx(paras))).get('word/document.xml'));
  assert.ok(xml.includes('<w:tbl>') && xml.includes('बिक्री') && (xml.match(/<w:tr>/g) || []).length === 3);
  // Misaligned columns: not a table.
  const ragged = itemsToParagraphs([it('A', 50, 170), it('B', 200, 170), it('C', 50, 156), it('D', 330, 156)]);
  assert.equal(ragged.filter((p) => p.table).length, 0, 'misaligned lines are not a table');
  // A line with one gap and no second aligned row stays text.
  const one = itemsToParagraphs([it('Left', 50, 170), it('Right', 400, 170)]);
  assert.equal(one.filter((p) => p.table).length, 0, 'single row is not a table');
  console.log('PASS pdf to word simple tables');
}
{
  // Layout cases taken from real PDFs (LibreOffice and reportlab output): two prose columns, lists, and prose that is not a table.
  const mk = (t: string, x: number, y: number, w: number, size = 11) => ({ text: t, size, bold: false, italic: false, x, y, w });
  const items = [mk('Heading', 56, 800, 120, 20)];
  for (let r = 0; r < 6; r++) {
    items.push(mk(`left line ${r} has enough words to be prose`, 56, 770 - r * 14, 200), mk(`right line ${r} has enough words to be prose`, 310, 770 - r * 14, 200));
  }
  const cols = itemsToParagraphs(items);
  assert.equal(cols.filter((p) => p.table).length, 0, 'two prose columns are not a table');
  const text = cols.map((p) => p.runs.map((r) => r.text).join('')).join('\n');
  assert.ok(text.indexOf('left line 5') < text.indexOf('right line 0'), 'left column is read in full before the right column');
  const list = itemsToParagraphs([mk('•', 70, 540, 4), mk('milk', 90, 540, 20), mk('•', 70, 524, 4), mk('bread', 90, 524, 24), mk('•', 70, 508, 4), mk('eggs', 90, 508, 20)]);
  assert.equal(list.filter((p) => p.table).length, 0, 'a bullet list is not a table');
  assert.equal(list.length, 3, 'each list item is its own paragraph');
  // Coordinates below are from LibreOffice and reportlab PDFs (see the real-PDF fixtures check in pdfsuite-tests).
  // Wrapped cell, text vertically centred: the note's two lines sit above and below the name.
  const wrapped = itemsToParagraphs([mk('Name', 61.5, 570.8, 30, 12), mk('Notes', 292.6, 570.8, 28, 12), mk('This note is long enough that it will wrap', 99.1, 536.7, 300, 12), mk('Asha', 59.8, 529.8, 24, 12), mk('yes', 99.1, 522.9, 16, 12), mk('Ravi', 59.8, 488.8, 22, 12), mk('Short', 99.1, 488.8, 28, 12)]);
  const wt = wrapped.find((p) => p.table);
  assert.ok(wt, 'wrapped-cell table is rebuilt');
  assert.deepEqual(wt!.table![1], ['Asha', 'This note is long enough that it will wrap yes'], 'wrapped cell text stays in order in its own cell');
  // Ordinary table whose cells are long single-line sentences stays a table.
  const longCells = itemsToParagraphs([
    mk('Situation', 70.7, 798, 46, 12), mk('Required action by the responsible team', 193.3, 798, 206, 12),
    mk('Server outage', 59.8, 764, 66, 12), mk('Notify the on-call engineer and open an incident ticket right away', 134.3, 764, 315, 12),
    mk('Data request', 59.8, 730, 60, 12), mk('Verify the identity of the requester before sharing any records', 134.3, 730, 300, 12),
    mk('Late invoice', 59.8, 696, 60, 12), mk('Send a reminder after seven days and escalate after thirty days', 134.3, 696, 300, 12),
  ]);
  assert.equal(longCells.filter((p) => p.table).length, 1, 'long-text cells still form a table');
  // Short two-column prose (3 lines a side) is read left column first, not interleaved and not a table.
  const short = itemsToParagraphs([mk('Town news', 56, 800, 55), mk('The council met on Tuesday and', 56, 770, 150), mk('discussed the new parking rules', 56, 756, 160), mk('for the town centre, which many', 56, 742, 165), mk('Meanwhile the library announced', 310, 770, 160), mk('longer opening hours from March,', 310, 756, 165), mk('with evening sessions for', 310, 742, 130)]);
  assert.equal(short.filter((p) => p.table).length, 0, 'short columns are not a table');
  const st = short.map((p) => p.runs.map((r) => r.text).join('')).join('|');
  assert.ok(st.indexOf('many') < st.indexOf('Meanwhile'), 'short columns are not interleaved');
  console.log('PASS pdf to word columns and lists');
}
{
  // Real LibreOffice output: a table whose first-column cell "East" spans two rows and sits between them, plus a ruled-only table.
  const mk = (t: string, x: number, y: number, w: number) => ({ text: t, size: 11, bold: false, italic: false, x, y, w });
  const items = [
    mk('Quarterly summary', 59.8, 760, 90),
    mk('Region', 59.8, 733.7, 33), mk('Sales', 102.1, 733.7, 24), mk('Target', 136.9, 733.7, 30),
    mk('North', 59.8, 717.3, 27), mk('120', 102.1, 717.3, 18), mk('100', 136.9, 717.3, 18),
    mk('South', 59.8, 700.9, 28.7), mk('95', 102.1, 700.9, 12.2), mk('110', 136.9, 700.9, 18.3),
    mk('70', 102.1, 668.1, 12.2), mk('60', 136.9, 668.1, 12.2),
    mk('East', 59.8, 651.7, 22),
    mk('80', 102.1, 635.2, 12.2), mk('75', 136.9, 635.2, 12.2),
    mk('Text after the table to check it is not swallowed.', 56.8, 604.7, 230),
  ];
  const ps = itemsToParagraphs(items);
  const tb = ps.filter((p) => p.table);
  assert.equal(tb.length, 1, 'one table');
  const rows = tb[0].table!;
  assert.deepEqual(rows.map((r) => r.join('|')), ['Region|Sales|Target', 'North|120|100', 'South|95|110', 'East|70|60', '|80|75'], 'rowspan text stays with its rows, in order');
  assert.ok(ps[ps.length - 1].runs.map((r) => r.text).join('').startsWith('Text after'), 'text after the table is a paragraph');
  console.log('PASS pdf to word row-spanning first-column cell');
}
{
  // Hindi, Punjabi and astral text goes through the Unicode-exact invisible layer; pdf.js must read it back unchanged.
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const d = await PDFDocument.create(); d.addPage([595, 842]);
  const rows: [string, number][] = [['नमस्ते', 50], ['दुनिया,', 230], ['क्षत्रिय', 420], ['ਸਤਿ', 50], ['ਸ੍ਰੀ', 120], ['Hello', 50], ['😀x', 200]];
  const words = rows.map(([text, x0], i) => ({ text, x0, y0: 50 + Math.floor(i / 3) * 100, x1: x0 + 100, y1: 90 + Math.floor(i / 3) * 100 }));
  const out = await addTextLayer(await d.save(), [{ page: 1, imgWidth: 595, imgHeight: 842, words }]);
  const doc = await getDocument({ data: new Uint8Array(out), verbosity: 0 }).promise;
  const tc = await (await doc.getPage(1)).getTextContent();
  const got = tc.items.map((i: any) => i.str).join('');
  assert.equal(got.replace(/\s+/g, ''), rows.map((r) => r[0]).join(''), 'Unicode text read back exactly: ' + got);
  console.log('PASS unicode invisible text layer');
}
{
  assert.deepEqual(parseRange('B2:D4'), { s: { r: 1, c: 1 }, e: { r: 3, c: 3 } });
  assert.equal(indexToCol(0), 'A');
  assert.equal(indexToCol(27), 'AB');
  const ws = {
    '!ref': 'A1:C3',
    '!merges': [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }],
    '!cols': [{ wpx: 120 }, {}, {}],
    A1: { v: 'Quarterly बिक्री', w: 'Quarterly बिक्री' },
    A2: { v: 'Item' }, B2: { v: 'गणना' }, A3: { v: 'Total <b>' },
  };
  const html = sheetToTable(ws);
  assert.ok(html.includes('colspan="3"'), 'merge keeps colspan');
  assert.ok(html.includes('<col style="width:120px">'), 'column width kept');
  assert.ok(html.includes('गणना'), 'Devanagari cell text kept');
  assert.ok(html.includes('Total &lt;b&gt;'), 'cell text is escaped');
  assert.ok(!html.includes('rowspan'), 'no phantom rowspan');
  const empty = sheetToTable({});
  assert.ok(empty.includes('empty'), 'empty sheet handled');
  const tables = workbookToTables(['S1', 'S2'], { S1: ws, S2: {} });
  assert.equal(tables.length, 1, 'an empty worksheet adds no page');
  assert.equal(tables[0].name, 'S1');
  assert.equal(workbookToTables(['A', 'B'], { A: ws, B: ws }).length, 2, 'every worksheet with cells keeps its own table');
  assert.throws(() => workbookToTables(['E1', 'E2'], { E1: {}, E2: {} }), /empty/, 'all-empty workbook is an error');
  console.log('PASS xlsx sheet to table');
}
console.log('All PDF suite ops passed.');

{
  const rule = [{ at: 456, a: 575, b: 607 }];
  assert.equal(isOcrRuleBar('|', { x0: 455.8, x1: 456.3, y0: 580, y1: 600 }, rule), true);
  assert.equal(isOcrRuleBar('|', { x0: 445.8, x1: 446.3, y0: 580, y1: 600 }, rule), false, 'legitimate bar away from a border');
  assert.equal(isOcrRuleBar('|', { x0: 455.8, x1: 456.3, y0: 545, y1: 555 }, rule), false, 'bar above/below a border');
  assert.equal(isOcrRuleBar('।', { x0: 455.8, x1: 456.3, y0: 580, y1: 600 }, rule), false, 'do not replace punctuation');
  console.log('PASS geometric OCR border-bar rejection preserves real text');
    }

{
  const rectangleGrid = (xs: number[], ys: number[]) => ({
    h: ys.map(at => ({ at, a: xs[0], b: xs[xs.length - 1] })),
    v: xs.map(at => ({ at, a: ys[ys.length - 1], b: ys[0] })),
  });
  const outer = rectangleGrid([0, 100, 250], [300, 100, 0]);
  const inner = rectangleGrid([115, 170, 235], [240, 200, 160]);
  const lines = { h: [...outer.h, ...inner.h], v: [...outer.v, ...inner.v] };
  const text = (text: string, x: number, y: number) => ({ text, x, y, w: 20, size: 10, bold: false, italic: false });
  const items = [text('A', 10, 270), text('Before', 120, 270), text('in1', 125, 220), text('in2', 185, 220), text('in3', 125, 180), text('in4', 185, 180), text('After', 120, 120), text('C', 10, 50), text('D', 120, 50), text('outside', 10, -20)];
  for (const l of [lines, { h: [...lines.h].reverse(), v: [...lines.v].reverse() }]) {
    const result = gridsFromLines(l, items);
    assert.equal(result.grids.length, 1, 'inner table is not a sibling');
    assert.deepEqual(result.rest.map(x => x.text), ['outside']);
    const cell = result.grids[0].rows[0][1];
    assert.equal(cell.text, 'Before After');
    assert.ok(cell.blocks && cell.blocks.length === 3);
    assert.deepEqual(cell.blocks!.filter(b => 'text' in b).map(b => 'text' in b && b.text), ['Before', 'After']);
    const child = cell.blocks!.find(b => 'grid' in b)!;
    assert.ok('grid' in child);
    if ('grid' in child) assert.deepEqual(child.grid.rows.map(r => r.map(c => c.text)), [['in1','in2'],['in3','in4']]);
    const xml = new TextDecoder().decode((await readZip(buildDocx([{ runs: [], level: 0, grid: result.grids[0] }]))).get('word/document.xml'));
    assert.equal((xml.match(/<w:tbl>/g) || []).length, 2);
    assert.equal((xml.match(/in1/g) || []).length, 1);
    assert.ok(xml.indexOf('Before') < xml.lastIndexOf('<w:tbl>') && xml.lastIndexOf('</w:tbl>') > xml.indexOf('After'));
    assert.ok(xml.indexOf('in4') < xml.indexOf('After') && xml.indexOf('After') < xml.indexOf('>C</w:t>'));
  }
  const sibling = rectangleGrid([300, 350, 400], [240, 200, 160]);
  assert.equal(gridsFromLines({ h: [...outer.h, ...sibling.h], v: [...outer.v, ...sibling.v] }, [], true).grids.length, 2, 'separate tables remain siblings');
  const emptyParent = gridsFromLines(lines, items.filter(it => it.text.startsWith('in')));
  assert.equal(emptyParent.grids.length, 1, 'parent with text only inside child is retained');
  assert.equal(emptyParent.grids[0].rows[0][1].blocks?.length, 1);
  // Intersecting rules that form nonrectangular merged regions must not invent a nested table.
  const crossing = rectangleGrid([80, 120, 160], [240, 200, 160]);
  assert.equal(gridsFromLines({ h: [...outer.h, ...crossing.h], v: [...outer.v, ...crossing.v] }, [], true).grids.length, 0);
  console.log('PASS nested table containment, order, unique text and sibling distinction');
}

{
  const word = joined.word, line = joined.line;
  const pixels = Array.from({ length: word.bbox.x1-word.bbox.x0 }, (_,i) => i >= 24 && i < 34);
  assert.equal(indicWordSpacing(word, line, pixels), 'है जो', 'space follows independent pixel gap and grapheme boundary');
  assert.equal(indicWordSpacing(word, line, pixels.map(() => false)), 'हैजो', 'no split without white strip');
  assert.equal(indicWordSpacing(word, line.slice(-2), pixels), 'हैजो', 'no split without independent gap samples');
  assert.equal(indicWordSpacing({ ...word, symbols: [] }, line, pixels), 'हैजो', 'no split without matching symbols');
  assert.equal(indicWordSpacing({ ...word, text: 'क्ष', symbols: [{ text: 'क्ष', bbox: word.bbox }] }, line, pixels), 'क्ष', 'never split a conjunct grapheme');
  assert.equal(indicWordSpacing({ ...word, text: 'hello' }, line, pixels), 'hello', 'no Latin word changes');
  assert.equal(indicWordSpacing({ ...word, text: 'है।' }, line, pixels), 'है।', 'no punctuation changes');
  assert.equal(indicWordSpacing(word, line, pixels.map((_,i) => i >=24 && i<27)), 'हैजो', 'small within-word gap is not a word space');
  console.log('PASS pixel-backed Indic OCR word spacing without text substitution');
    }

{
  // Both production-save and native-real checks evaluate the shared fixture-construction section.
  // It must remain self-contained and must not inherit printpdf's file-system imports.
  const src = await readFile('scripts/desktop-printpdf.mjs', 'utf8');
  const begin = src.indexOf('  const JSZip'), last = src.indexOf('const xlsxBuf');
  const end = src.indexOf('\n', last);
  assert.ok(begin >= 0 && last > begin && end > last);
  for (const caller of ['scripts/desktop-prodsave.mjs', 'scripts/desktop-nativereal.mjs']) {
    const callerSrc = await readFile(caller, 'utf8');
    assert.ok(callerSrc.includes('src.slice(a, bEnd)'), 'fixture extraction contract: ' + caller);
  }
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const fixture = await new AsyncFunction(src.slice(begin, end) + '\nreturn { docxBuf, xlsxBuf };')();
  assert.ok(fixture.docxBuf.length > 1000 && fixture.xlsxBuf.length > 1000);
  const zip = await readZip(fixture.docxBuf);
  const xml = new TextDecoder().decode(zip.get('word/document.xml'));
  assert.equal((xml.match(/अनुच्छेद है जो/g) || []).length, 3);
  assert.ok(xml.includes('Item') && xml.includes('Apples'));
  console.log('PASS desktop shared fixture extraction without external imports');
      }

{
  const outer = { h: [300,100,0].map(at => ({at,a:0,b:250})), v: [0,100,250].map(at=>({at,a:0,b:300})) };
  const inner = { h: [240,200,160].map(at=>({at,a:115,b:250})), v: [{at:115,a:160,b:240},{at:180,a:200,b:240}] };
  const txt = (text: string,x: number,y: number) => ({text,x,y,w:15,size:10,bold:false,italic:false});
  const items = [txt('A',10,270),txt('Before',120,270),txt('in1',125,220),txt('in2',200,220),txt('span',125,180),txt('After',120,120),txt('C',10,50),txt('D',120,50)];
  for (const mirror of [false,true]) {
    const lines = {h:[...outer.h,...inner.h],v:[...outer.v,...inner.v]};
    const l = mirror ? {h:lines.h.map(s=>({at:s.at,a:250-s.b,b:250-s.a})),v:lines.v.map(s=>({...s,at:250-s.at}))} : lines;
    const t = mirror ? items.map(it=>({...it,x:250-it.x-it.w})) : items;
    const r = gridsFromLines(l,t);
    assert.equal(r.grids.length,1,'shared-side outer grid retained');
    const cell = r.grids[0].rows[0][mirror?0:1];
    assert.equal(cell.text,'Before After');
    const child = cell.blocks?.find(b=>'grid' in b);
    assert.ok(child && 'grid' in child);
    if (child && 'grid' in child) { assert.equal(child.grid.rows.length,2);assert.equal(child.grid.rows[1][0].colspan,2); }
    const xml=new TextDecoder().decode((await readZip(buildDocx([{runs:[],level:0,grid:r.grids[0]}]))).get('word/document.xml'));
    assert.equal((xml.match(/<w:tbl>/g)||[]).length,2);
    for(const text of ['Before','After','in1','in2','span']) assert.equal((xml.match(new RegExp('>'+text+'<','g'))||[]).length,1);
  }
  const partial = {h:[...outer.h,...inner.h.filter(s=>s.at!==160)],v:[...outer.v,...inner.v]};
  assert.equal(gridsFromLines(partial,[],true).grids.length,0,'missing child bottom remains unsupported');
  const crossing = {h:[...outer.h,...inner.h.map(s=>({...s,a:80}))],v:[...outer.v,{at:80,a:160,b:240},{at:180,a:200,b:240}]};
  assert.equal(gridsFromLines(crossing,[],true).grids.length,0,'grid crossing parent cells is not nested');
  const fragmented = {h:[...outer.h,...inner.h].flatMap(s=>[{...s,b:(s.a+s.b)/2},{...s,a:(s.a+s.b)/2}]).reverse(), v:[...outer.v,...inner.v].flatMap(s=>[{...s,b:(s.a+s.b)/2},{...s,a:(s.a+s.b)/2}]).reverse()};
  assert.equal(gridsFromLines(fragmented,items).grids[0].rows[0][1].blocks?.filter(b=>'grid' in b).length,1,'fragmented shuffled rules retain nesting');
  const bothSides = {h:[...outer.h,...inner.h.map(s=>({...s,a:100}))],v:[...outer.v,{at:180,a:200,b:240}]};
  const bothResult = gridsFromLines(bothSides,[],true);
  assert.equal(bothResult.grids.length,1,'both-side rules still form a valid flat grid');
  assert.ok(bothResult.grids[0].rows.every(r=>r.every(c=>!c.blocks)),'ambiguous both-side grid must not invent nesting');
  const ordinary = gridsFromLines(outer,items,true);
  assert.equal(ordinary.grids.length,1);
  assert.ok(ordinary.grids[0].rows.every(r=>r.every(c=>!c.blocks)),'ordinary grids never become nested');
  console.log('PASS closed one-side-shared nested grid and partial/crossing negatives');
}

{
  // Top/bottom are axis-swapped side cases. Reconstruct in the original axes so a colspan becomes a rowspan.
  const side = { h: [300,100,0].map(at=>({at,a:0,b:250})), v: [0,100,250].map(at=>({at,a:0,b:300})) };
  const inner = { h: [240,200,160].map(at=>({at,a:115,b:250})), v: [{at:115,a:160,b:240},{at:180,a:200,b:240}] };
  const swap = (r: typeof side) => ({h:r.v.map(s=>({...s})),v:r.h.map(s=>({...s}))});
  for (const mirror of [false,true]) {
    const raw = swap({h:[...side.h,...inner.h],v:[...side.v,...inner.v]});
    const lines = mirror ? {h:raw.h.map(s=>({...s,at:250-s.at})),v:raw.v.map(s=>({at:s.at,a:250-s.b,b:250-s.a}))} : raw;
    const r = gridsFromLines(lines,[],true);
    assert.equal(r.grids.length,1);
    const nested = r.grids[0].rows.flat().flatMap(c=>c.blocks??[]).filter(b=>'grid' in b);
    assert.equal(nested.length,1);
    const child = nested[0];
    if ('grid' in child) { assert.equal(child.grid.rows.length,2);assert.ok(child.grid.rows.flat().some(c=>c.rowspan===2)); }
    const partial = {...lines,h:lines.h.filter(s=>!(Math.abs(s.at-(mirror?135:115))<1 && s.a===160 && s.b===240))};
    assert.ok(gridsFromLines(partial,[],true).grids.every(g=>g.rows.flat().every(c=>!c.blocks)), 'partial horizontal-shared perimeter must not invent nesting');
  }
  const crossed = swap({h:[...side.h,...inner.h.map(s=>({...s,a:80}))],v:[...side.v,{at:80,a:160,b:240},{at:180,a:200,b:240}]});
  assert.ok(gridsFromLines(crossed,[],true).grids.every(g=>g.rows.flat().every(c=>!c.blocks)), 'crossing horizontal rules do not invent nesting');
  const both = swap({h:[...side.h,...inner.h.map(s=>({...s,a:100}))],v:[...side.v,{at:180,a:200,b:240}]});
  assert.ok(gridsFromLines(both,[],true).grids.every(g=>g.rows.flat().every(c=>!c.blocks)), 'both horizontal sides remain flat');
  console.log('PASS top/bottom-shared nested grids preserve merged axes and reject partial perimeters');
}

{
  const item=(text:string,x:number,y:number,w:number)=>({text,x,y,w,size:10,bold:false,italic:false});
  const head=[item('Product',10,200,35),item('Units',120,200,25),item('Amount',210,200,35)];
  const row=(label:string,units:string,amount:string,y:number,shift=0)=>[item(label,10,y,35),item(units,145-units.length*5+shift,y,units.length*5),item(amount,245-amount.length*5+shift,y,amount.length*5)];
  const table=[...head,...row('Apples','7','12.50',180),...row('Oranges','125','1234.00',160),...row('Pears','23','85.75',140),item('After sales table',10,120,80)];
  const out=itemsToParagraphs(table);
  assert.equal(out.filter(p=>p.table).length,1);
  assert.deepEqual(out[0].table,[['Product','Units','Amount'],['Apples','7','12.50'],['Oranges','125','1234.00'],['Pears','23','85.75']]);
  assert.equal(out[1].runs[0].text,'After sales table');
  const lone=itemsToParagraphs([...row('Pears','23','85.75',140),item('After sales table',10,120,80)]);
  assert.ok(lone.every(p=>!p.table),'one full row plus trailing prose is not a table');
  const shifted=itemsToParagraphs([...head,...row('Apples','7','12.50',180),...row('Oranges','125','1234.00',160,20)]);
  assert.ok(shifted.every(p=>!p.table),'numeric ends must independently agree');
  const one=itemsToParagraphs([...head,...row('Apples','7','12.50',180)]);
  assert.ok(one.every(p=>!p.table),'two body rows required for numeric alignment inference');
  const ocr=itemsToParagraphs(table.map(i=>({...i,ocr:true})));
  assert.ok(ocr.every(p=>!p.table),'OCR words are not used as typographic alignment evidence');
  const prose=itemsToParagraphs([item('Left column prose starts here',10,200,100),item('Right column prose begins here',180,200,120),item('and continues on another line',10,180,110),item('and continues without a table',180,180,120),item('before its final complete sentence.',10,160,130),item('before its final complete sentence.',180,160,130)]);
  assert.ok(prose.every(p=>!p.table),'running prose is not a numeric table');
  const far=itemsToParagraphs([...head,...row('Apples','7','12.50',150),...row('Oranges','125','1234.00',100)]);
  assert.ok(far.every(p=>!p.table),'widely separated labels are not numeric table evidence');
  const styled=itemsToParagraphs(table,true);
  assert.deepEqual(styled[0].tableStyle,{rightColumns:[false,true,true],borderless:true});
  const styledXml=new TextDecoder().decode((await readZip(buildDocx(styled))).get('word/document.xml'));
  assert.equal((styledXml.match(/<w:jc w:val="right"\/>/g)||[]).length,8,'numeric columns including header right aligned');
  assert.equal((styledXml.match(/w:val="nil"/g)||[]).length,6,'no table borders when independently no rules');
  const unproven=itemsToParagraphs(table);
  assert.equal(unproven[0].tableStyle?.borderless,false,'unknown or ruled page retains borders');
  const unprovenXml=new TextDecoder().decode((await readZip(buildDocx(unproven))).get('word/document.xml'));
  assert.ok(unprovenXml.includes('w:color="BFBFBF"'));
  const ordinaryXml=new TextDecoder().decode((await readZip(buildDocx([{runs:[],level:0,table:[['Label','Value'],['A','B']]}]))).get('word/document.xml'));
  assert.ok(ordinaryXml.includes('w:color="BFBFBF"')&&!ordinaryXml.includes('<w:jc'),'ordinary table styling unchanged');
  console.log('PASS right-edge numeric borderless tables and trailing prose negatives');
}

{
  const outer = { h: [300,100,0].map(at => ({at,a:0,b:250})), v: [0,100,250].map(at=>({at,a:0,b:300})) };
  const inner = { h: [300,260,220].map(at=>({at,a:100,b:220})), v: [{at:100,a:220,b:300},{at:160,a:260,b:300},{at:220,a:220,b:300}] };
  const lines={h:[...outer.h,...inner.h],v:[...outer.v,...inner.v]};
  for(const mx of [false,true])for(const my of [false,true]){
    const l={h:lines.h.map(s=>({at:my?300-s.at:s.at,a:mx?250-s.b:s.a,b:mx?250-s.a:s.b})),v:lines.v.map(s=>({at:mx?250-s.at:s.at,a:my?300-s.b:s.a,b:my?300-s.a:s.b}))};
    const r=gridsFromLines(l,[],true);assert.equal(r.grids.length,1);
    const children=r.grids[0].rows.flat().flatMap(c=>c.blocks??[]).filter(b=>'grid'in b);
    assert.equal(children.length,1,'unique corner child');
    if('grid'in children[0])assert.equal(children[0].grid.rows.flat().filter(c=>c.colspan===2).length,1,'child colspan retained');
    for(const axis of ['h','v'] as const)for(const i of [l[axis].length-1]){
      const partial={...l,[axis]:l[axis].filter((_,j)=>j!==i)};
      const x=gridsFromLines(partial,[],true);
      assert.ok(x.grids.every(g=>g.rows.flat().every(c=>!c.blocks)),'missing child perimeter cannot invent nesting');
    }
  }
  const fragmented={h:lines.h.flatMap(s=>[{...s,b:(s.a+s.b)/2},{...s,a:(s.a+s.b)/2}]).reverse(),v:lines.v.flatMap(s=>[{...s,b:(s.a+s.b)/2},{...s,a:(s.a+s.b)/2}]).reverse()};
  assert.equal(gridsFromLines(fragmented,[],true).grids[0].rows.flat().flatMap(c=>c.blocks??[]).filter(b=>'grid'in b).length,1,'fragmented corner retains unique nesting');
  const crossing={h:[...outer.h,...inner.h.map(s=>({...s,a:80}))],v:[...outer.v,{at:80,a:220,b:300},...inner.v.slice(1)]};
  assert.ok(gridsFromLines(crossing,[],true).grids.every(g=>g.rows.flat().every(c=>!c.blocks)),'corner crossing parent boundary not nested');
  console.log('PASS unique two-adjacent-edge corner nesting and partial-rule negatives');
}

{
  const fixture = await makeLayoutFixture(false);
  const awaitCrop = await makeLayoutFixture();
  await assert.rejects(() => nUp(awaitCrop,4), /image preparation/);
  await checkLayoutPixels(await nUp(fixture, 4, { border: false }), 'nup',false);
  await checkLayoutPixels(await booklet(fixture), 'booklet',false);
  console.log('PASS n-up/booklet preserve four rotations, CropBox, vector text and blank pages');
}

{
  const b=await makeStampFixture();
  for(const place of STAMP_PLACES){
    await checkStampGeometry(await stampText(b,{text:'STAMP {n}/{total}',place}),place);
    await checkStampGeometry(await stampText(b,{text:'{bates}',place,batesPrefix:'CASE-',batesStart:7,batesDigits:4}),place,{bates:true});
  }
  await checkStampGeometry(await stampText(b,{text:'STAMP {n}/{total}',place:'header-left',pages:'2'}),'header-left',{selected:true});
  console.log('PASS visible stamps all six positions/four rotations/nonzero boxes, Bates and selected pages');
}

{
 const b=await makeCropFixture();await checkCropPixels(b,await cropPages(b,CROP_MARGINS));
 await checkCropPixels(b,await cropPages(b,CROP_MARGINS,'2'),true);
 await assert.rejects(()=>cropPages(b,{...CROP_MARGINS,left:-1}),/non-negative/);
 console.log('PASS crop follows four viewer rotations and selected pages with asymmetric margins');
}
