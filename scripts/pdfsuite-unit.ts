// Unit tests for the pure PDF suite operations.
import { PDFDocument, StandardFonts } from 'pdf-lib';
import assert from 'node:assert/strict';
import { addTextLayer, booklet, bookletOrder, cropPages, deletePages, flattenForms, nUp, parsePageRanges, reorderPages, rotatePages, signPdf, stampText, toWinAnsi, watermark } from '../src/tools/pdfsuite/ops';
import { protectPdf, repairPdf, unlockPdf } from '../src/tools/pdfsuite/qpdf';
import { buildDocx, itemsToParagraphs } from '../src/tools/pdfsuite/docx';
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
