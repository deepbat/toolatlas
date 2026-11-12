import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/* PPF: yearly compounding. Deposit made on or before the 5th of April earns the whole year's interest. */
export function ppf(yearly: number, ratePct: number, years: number, earlyDeposit: boolean) {
  if (yearly < 500) throw Error('Yearly deposit: the minimum is ₹500.');
  if (yearly > 150000) throw Error('Yearly deposit: the maximum is ₹1,50,000 a year.');
  if (years < 15 || years > 50) throw Error('Years: PPF runs for 15 years and can be extended in blocks of 5, up to 50.');
  let bal = 0, invested = 0;
  const rows: { year: number; deposit: number; interest: number; balance: number }[] = [];
  for (let y = 1; y <= years; y++) {
    const interest = earlyDeposit ? ((bal + yearly) * ratePct) / 100 : (bal * ratePct) / 100;
    bal = bal + yearly + interest;
    invested += yearly;
    rows.push({ year: y, deposit: yearly, interest, balance: bal });
  }
  return { maturity: bal, invested, interest: bal - invested, rows };
}

export function cagr(start: number, end: number, years: number) {
  if (start <= 0) throw Error('Starting value: must be more than zero.');
  if (end < 0) throw Error('Ending value: cannot be negative.');
  if (years <= 0) throw Error('Years: must be more than zero.');
  const rate = (Math.pow(end / start, 1 / years) - 1) * 100;
  return { rate, absolute: ((end - start) / start) * 100 };
}

export interface InvoiceLine { desc: string; hsn: string; qty: number; price: number; rate: number }
export function invoiceTotals(lines: InvoiceLine[], interState: boolean) {
  if (lines.length === 0) throw Error('Add at least one item.');
  const out = lines.map((l) => {
    const taxable = Math.round(l.qty * l.price * 100) / 100;
    const tax = Math.round(taxable * l.rate) / 100;
    return { ...l, taxable, tax, cgst: interState ? 0 : tax / 2, sgst: interState ? 0 : tax / 2, igst: interState ? tax : 0 };
  });
  const sum = (k: 'taxable' | 'cgst' | 'sgst' | 'igst') => out.reduce((s, l) => s + l[k], 0);
  const taxable = sum('taxable'), cgst = sum('cgst'), sgst = sum('sgst'), igst = sum('igst');
  const exact = taxable + cgst + sgst + igst;
  const total = Math.round(exact);
  return { lines: out, taxable, cgst, sgst, igst, roundOff: total - exact, total };
}

export function parseInvoiceLines(text: string): InvoiceLine[] {
  const lines: InvoiceLine[] = [];
  text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).forEach((row, i) => {
    const p = row.split('|').map((s) => s.trim());
    if (p.length < 5) throw Error(`Item line ${i + 1}: use description | HSN | quantity | price | GST rate.`);
    const [desc, hsn, q, pr, r] = p;
    const qty = Number(q), price = Number(pr.replace(/,/g, '')), rate = Number(r.replace('%', ''));
    if (!desc) throw Error(`Item line ${i + 1}: description is empty.`);
    if (!Number.isFinite(qty) || qty <= 0) throw Error(`Item line ${i + 1}: quantity must be more than zero.`);
    if (!Number.isFinite(price) || price < 0) throw Error(`Item line ${i + 1}: price is not a valid number.`);
    if (![0, 0.25, 3, 5, 12, 18, 28, 40].includes(rate)) throw Error(`Item line ${i + 1}: GST rate ${r} is not a standard slab. Use 0, 5, 18, 40 and so on, and check the rate for your item.`);
    lines.push({ desc, hsn, qty, price, rate });
  });
  return lines;
}

/** Strip characters the built-in PDF font cannot draw. */
const clean = (s: string) => s.replace(/₹/g, 'Rs. ').replace(/[^\x20-\x7E]/g, '?');

/** Plain text PDF. Each page is a list of lines, bold when the line starts with "# ". */
export async function textPdf(pages: string[][], title: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const lines of pages) {
    const page = doc.addPage([595.28, 841.89]);
    let y = 800;
    for (const raw of lines) {
      const isBold = raw.startsWith('# ');
      const text = clean(isBold ? raw.slice(2) : raw);
      const size = isBold ? 13 : 10.5;
      const f = isBold ? bold : font;
      const maxW = 495;
      const words = text.split(' ');
      let cur = '';
      const flush = () => { page.drawText(cur, { x: 50, y, size, font: f, color: rgb(0.1, 0.1, 0.1) }); y -= size + 6; cur = ''; };
      if (text === '') { y -= 8; continue; }
      for (const w of words) {
        const next = cur ? cur + ' ' + w : w;
        if (f.widthOfTextAtSize(next, size) > maxW && cur) { flush(); cur = w; } else cur = next;
      }
      if (cur) flush();
      if (y < 50) break;
    }
  }
  return doc.save();
}

export interface Entry { id: string; date: string; kind: 'in' | 'out'; category: string; note: string; amount: number }
export function summarise(entries: Entry[], opening: number) {
  const inflow = entries.filter((e) => e.kind === 'in').reduce((s, e) => s + e.amount, 0);
  const outflow = entries.filter((e) => e.kind === 'out').reduce((s, e) => s + e.amount, 0);
  const byCat = new Map<string, number>();
  entries.filter((e) => e.kind === 'out').forEach((e) => byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount));
  return { inflow, outflow, balance: opening + inflow - outflow, byCat: [...byCat.entries()].sort((a, b) => b[1] - a[1]) };
}
