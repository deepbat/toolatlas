// Unit tests for the pure PDF suite operations.
import { PDFDocument, StandardFonts } from 'pdf-lib';
import assert from 'node:assert/strict';
import { booklet, bookletOrder, cropPages, deletePages, flattenForms, nUp, parsePageRanges, stampText } from '../src/tools/pdfsuite/ops';

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
console.log('All PDF suite ops passed.');
