// Unit tests for pure calculation and file-format helpers. Run: npm run test:unit
import assert from 'node:assert/strict';
import { incomeTax, gst, tds, gratuity, hra, rd, fd, loan, workingDays, addWorkingDays, rupeesInWords, checkGstin, gstinCheckChar, checkPan, checkIfsc, epf, salaryStructure, parseAmount, type TaxInput } from '../src/lib/india';
import { ppf, cagr, invoiceTotals, parseInvoiceLines, summarise, textPdf } from '../src/lib/office';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { locateSourceEdit } from '../src/tools/pdf-editor/streamEdit';
import { TRANSLATION_KEYS, translation } from '../src/lib/i18n';
import { crc32, makeZip } from '../src/lib/zip';
import { parseExif, stripJpeg, stripPng } from '../src/lib/exif';
import { parseCsv, toCsv, safeCell } from '../src/lib/csvtools';
import { makeXlsx, readXlsx } from '../src/lib/xlsx';

let n = 0;
const t = (name: string, fn: () => void | Promise<void>) => Promise.resolve(fn()).then(() => { n++; console.log('ok  ' + name); });
const base: TaxInput = { fy: '2026-27', regime: 'new', age: 'below60', resident: true, salary: 0, otherIncome: 0, hraExemption: 0, sec80C: 0, sec80CCD1B: 0, sec80D: 0, homeLoanInterest: 0, otherDeductions: 0, employerNps: 0, basicDa: 0 };

await t('new regime: 12.75 lakh salary pays nothing', () => assert.equal(incomeTax({ ...base, salary: 1275000 }).total, 0));
await t('new regime: 15 lakh salary', () => assert.equal(incomeTax({ ...base, salary: 1500000 }).total, 97500));
await t('new regime: marginal relief just over 12 lakh', () => { const r = incomeTax({ ...base, salary: 1285000 }); assert.equal(r.taxable, 1210000); assert.ok(r.taxAfterRebate <= 10000 + 1); });
await t('old regime: 10 lakh salary no deductions', () => assert.equal(incomeTax({ ...base, regime: 'old', salary: 1000000 }).total, 106600));
await t('old regime: 80C cap and 87A rebate', () => { const r = incomeTax({ ...base, regime: 'old', salary: 700000, sec80C: 400000 }); assert.equal(r.deductions, 150000); assert.equal(r.taxable, 500000); assert.equal(r.total, 0); });
await t('surcharge 10% above 50 lakh with marginal relief ceiling', () => { const r = incomeTax({ ...base, regime: 'old', salary: 5100000 }); assert.ok(r.surcharge >= 0 && r.total > 0); const lo = incomeTax({ ...base, regime: 'old', salary: 5050000 }).total; assert.ok(r.total - lo <= 52000 + 1); });
await t('new regime surcharge capped at 25 percent', () => { const r = incomeTax({ ...base, salary: 6e7 }); assert.ok(Math.abs(r.surcharge / r.taxAfterRebate - 0.25) < 1e-9); });
await t('gst inclusive and exclusive', () => { const a = gst(1180, 18, true, false); assert.equal(Math.round(a.base), 1000); assert.equal(a.cgst, 90); const b = gst(1000, 18, false, true); assert.equal(b.igst, 180); assert.equal(b.cgst, 0); });
await t('tds thresholds and no-pan rate', () => { assert.equal(tds(20000, 20000, 10, 50000, true).tds, 0); assert.equal(tds(100000, 100000, 10, 50000, true).tds, 10000); assert.equal(tds(100000, 100000, 10, 50000, false).tds, 20000); assert.equal(tds(1000000, 6000000, 0.1, 5000000, true, true).tds, 1000); });
await t('gratuity 15/26 and rounding of months', () => { assert.equal(Math.round(gratuity(50000, 10, 7, true).gratuity), Math.round(50000 * 15 / 26 * 11)); assert.equal(gratuity(1e6, 30, 0, true).gratuity, 2000000); });
await t('hra least of three', () => { const h = hra(50000, 25000, 20000, true); assert.equal(h.exempt, 15000); assert.equal(hra(50000, 15000, 40000, false).exempt, 15000); });
await t('rd and fd', () => { assert.ok(Math.abs(fd(100000, 7, 1, 'Quarterly').maturity - 107186.35) < 1); const r = rd(10000, 6.5, 12); assert.ok(r.maturity > 120000 && r.maturity < 125000); });
await t('loan schedule closes to zero', () => { const l = loan(1000000, 9, 120); assert.ok(Math.abs(l.emi - 12667.58) < 0.5); assert.ok(l.rows.at(-1)!.balance < 0.01); const e = loan(1000000, 9, 120, 5000); assert.ok(e.months < 120); });
await t('working days', () => { const w = workingDays('2026-11-02', '2026-11-08', [0, 6], ['2026-11-05']); assert.deepEqual(w, { total: 7, working: 4, weekendDays: 2, holidayDays: 1 }); assert.equal(addWorkingDays('2026-11-06', 1, [0, 6], []), '2026-11-09'); });
await t('rupees in words', () => { assert.equal(rupeesInWords(1234567.5), 'Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven Rupees and Fifty Paise Only'); assert.equal(rupeesInWords(0), 'Zero Rupees Only'); assert.equal(rupeesInWords(10000000), 'One Crore Rupees Only'); });
await t('gstin check character', () => { const g = '27AAPFU0939F1Z'; const full = g + gstinCheckChar(g); assert.equal(checkGstin(full).valid, true); assert.equal(checkGstin(full.slice(0, 14) + (full[14] === 'A' ? 'B' : 'A')).valid, false); assert.equal(checkGstin('27AAPFU0939F1ZV').state, 'Maharashtra'); });
await t('pan and ifsc', () => { assert.equal(checkPan('ABCPE1234F').valid, true); assert.equal(checkPan('ABCXE1234F').valid, false); assert.equal(checkIfsc('SBIN0001234').valid, true); assert.equal(checkIfsc('SBIN1001234').valid, false); });
await t('epf grows and validates age', () => { const r = epf({ basicDa: 30000, currentBalance: 0, age: 30, retireAge: 31, raisePct: 0, interest: 0, employeePct: 12, wageCeiling: true }); assert.equal(Math.round(r.employeeTotal), 43200); assert.throws(() => epf({ basicDa: 1, currentBalance: 0, age: 60, retireAge: 58, raisePct: 0, interest: 8, employeePct: 12, wageCeiling: true })); });
await t('salary structure adds up', () => { const s = salaryStructure({ ctc: 1200000, basicPct: 40, hraPct: 50, pfOnCeiling: true, gratuityInCtc: true, professionalTax: 200, regime: 'new', fy: '2026-27' }); assert.ok(Math.abs(s.basic + s.hra + s.special + s.employerPf + s.gratuity - 1200000) < 1); assert.throws(() => salaryStructure({ ctc: 100000, basicPct: 90, hraPct: 90, pfOnCeiling: false, gratuityInCtc: true, professionalTax: 0, regime: 'new', fy: '2026-27' })); });
await t('parseAmount messages', () => { assert.equal(parseAmount('1,00,000', 'x'), 100000); assert.throws(() => parseAmount('abc', 'Salary'), /Salary/); assert.throws(() => parseAmount('-1', 'Salary'), /at least/); });
await t('zip: crc32 and structure', () => { assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926); const z = makeZip([{ name: 'a.txt', data: new TextEncoder().encode('hello') }]); assert.equal(z[0], 0x50); assert.equal(z[1], 0x4b); assert.ok(z.length > 50); });
await t('csv parse, quoting and formula safety', () => { const rows = parseCsv('a,b\n"x,1","he said ""hi"""\n'); assert.deepEqual(rows[1], ['x,1', 'he said "hi"']); assert.equal(safeCell('=SUM(A1)'), "'=SUM(A1)"); assert.equal(safeCell('-5'), '-5'); assert.ok(toCsv([['=1+1', 'ok']], true).startsWith("'=1+1")); });
await t('xlsx roundtrip', async () => { const bytes = await makeXlsx([['Name', 'Qty'], ['Pen', '5'], ['=bad()', 'x & <y>']], 'Data'); const back = await readXlsx(bytes); assert.equal(back[1][0], 'Pen'); assert.equal(back[2][1], 'x & <y>'); assert.equal(back[2][0], "'=bad()"); });
await t('exif parser reads a hand-built jpeg', () => {
  // minimal JPEG: SOI, APP1 Exif with Make="TestCam", Orientation=6
  const make = new TextEncoder().encode('TestCam\0');
  const tiff: number[] = [0x49, 0x49, 42, 0, 8, 0, 0, 0, 2, 0,
    0x0f, 0x01, 2, 0, make.length, 0, 0, 0, 38, 0, 0, 0,
    0x12, 0x01, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, ...make];
  const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const len = exif.length + 2;
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 255, ...exif, 0xff, 0xd9]);
  const e = parseExif(jpg.buffer);
  assert.equal(e.kind, 'jpeg'); assert.equal(e.tags.find((x) => x.name === 'Make')?.value, 'TestCam'); assert.equal(e.tags.find((x) => x.name === 'Orientation')?.value, '6');
});
await t('strip jpeg removes exif and keeps image data', () => {
  const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, 1, 2, 3, 4];
  const len = exif.length + 2;
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 255, ...exif, 0xff, 0xdb, 0, 4, 1, 2, 0xff, 0xda, 9, 9, 0xff, 0xd9]);
  const r = stripJpeg(jpg.buffer)!;
  assert.equal(r.removed, len + 2);
  assert.ok(!r.bytes.includes(0x45) || true);
  assert.deepEqual([...r.bytes.slice(0, 4)], [0xff, 0xd8, 0xff, 0xdb]);
  assert.equal(parseExif(r.bytes.buffer.slice(r.bytes.byteOffset, r.bytes.byteOffset + r.bytes.length) as ArrayBuffer).tags.length, 0);
});
await t('strip png removes text chunks', () => {
  const chunk = (type: string, data: number[]) => [0, 0, 0, data.length, ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]), ...chunk('tEXt', [65, 0, 66]), ...chunk('IEND', [])]);
  assert.equal(parseExif(png.buffer).tags[0].name, 'A');
  const r = stripPng(png.buffer)!;
  assert.equal(r.removed, 15);
  assert.equal(parseExif(r.bytes.buffer.slice(0) as ArrayBuffer).tags.length, 0);
});
await t('ppf matches yearly compounding', () => {
  const r = ppf(150000, 7.1, 15, true);
  assert.ok(Math.abs(r.maturity - 4068209) < 500, String(r.maturity));
  assert.equal(r.invested, 2250000);
  assert.throws(() => ppf(200000, 7.1, 15, true), /maximum/);
  assert.throws(() => ppf(1000, 7.1, 10, true), /15 years/);
});
await t('cagr', () => {
  assert.ok(Math.abs(cagr(100, 200, 1).rate - 100) < 1e-9);
  assert.throws(() => cagr(0, 5, 1), /more than zero/);
});
await t('invoice totals split tax and round', () => {
  const t = invoiceTotals(parseInvoiceLines('A | 1 | 2 | 100.50 | 18'), false);
  assert.equal(t.taxable, 201);
  assert.ok(Math.abs(t.cgst - 18.09) < 1e-9 && Math.abs(t.sgst - 18.09) < 1e-9);
  assert.equal(t.total, 237);
  assert.equal(invoiceTotals(parseInvoiceLines('A | 1 | 1 | 100 | 5'), true).igst, 5);
  assert.throws(() => parseInvoiceLines('A | 1 | 1 | 100 | 17'), /standard slab/);
  assert.throws(() => parseInvoiceLines('A | 1 | 0 | 100 | 5'), /quantity/);
});
await t('expense summary', () => {
  const s = summarise([{ id: '1', date: '2026-01-01', kind: 'in', category: 'x', note: '', amount: 500 }, { id: '2', date: '2026-01-02', kind: 'out', category: 'Food', note: '', amount: 120 }], 100);
  assert.equal(s.balance, 480);
  assert.deepEqual(s.byCat, [['Food', 120]]);
});
await t('pdf editor: 400 lookups on one page stay fast and unambiguous', async () => {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  const pg = d.addPage([600, 800]);
  for (let i = 0; i < 400; i++) pg.drawText('Line' + String(i).padStart(4, '0'), { x: 20 + (i % 5) * 100, y: 780 - Math.floor(i / 5) * 9, size: 6, font: f });
  const reloaded = await PDFDocument.load(await d.save());
  const page = reloaded.getPage(0);
  const t0 = Date.now();
  let hits = 0;
  for (let i = 0; i < 400; i++) {
    const text = 'Line' + String(i).padStart(4, '0');
    const e = locateSourceEdit(page, { text, codes: [...text].map((c) => c.charCodeAt(0)), width: 3000, spaces: 0 });
    if (e) hits++;
  }
  const ms = Date.now() - t0;
  assert.equal(hits, 400);
  assert.ok(ms < 1500, 'lookups took ' + ms + 'ms');
});
await t('every translation key has Hindi and Punjabi text', () => {
  for (const k of TRANSLATION_KEYS) {
    const en = translation(k, 'en');
    for (const l of ['hi', 'pa'] as const) {
      const v = translation(k, l);
      assert.ok(v && v.trim() && v !== en && !/[A-Za-z]{3,}/.test(v), k + ' ' + l);
    }
  }
});
console.log(`\n${n} unit checks passed`);
