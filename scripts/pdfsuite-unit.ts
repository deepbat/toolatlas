// Unit tests for the pure PDF suite operations.
import { PDFDocument, StandardFonts } from 'pdf-lib';
import assert from 'node:assert/strict';
import { addTextLayer, booklet, bookletOrder, cropPages, deletePages, flattenForms, nUp, parsePageRanges, reorderPages, rotatePages, signPdf, stampText, toWinAnsi, watermark } from '../src/tools/pdfsuite/ops';

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
console.log('All PDF suite ops passed.');
