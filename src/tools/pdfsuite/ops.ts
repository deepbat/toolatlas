// Pure, on-device PDF page operations built on pdf-lib. No DOM access, so
// every function is covered by scripts/pdfsuite-unit.ts.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/** "1-3,5,8-" style ranges to zero-based indexes. Blank means all pages. */
export function parsePageRanges(spec: string, total: number): number[] {
  const s = spec.trim();
  if (!s) return Array.from({ length: total }, (_, i) => i);
  const out: number[] = [];
  for (const part of s.split(',')) {
    const m = /^\s*(\d*)\s*(?:-\s*(\d*))?\s*$/.exec(part);
    if (!m || (m[1] === '' && m[2] === undefined) || (m[1] === '' && m[2] === '')) throw new Error(`Cannot read "${part.trim()}" as a page range.`);
    const a = m[1] === '' ? 1 : Number(m[1]);
    const dash = part.includes('-');
    const b = !dash ? a : m[2] === '' || m[2] === undefined ? total : Number(m[2]);
    if (a < 1 || b < 1 || a > total || b > total) throw new Error(`Page ${a > total || a < 1 ? a : b} is outside this ${total}-page document.`);
    if (a <= b) for (let p = a; p <= b; p++) out.push(p - 1);
    else for (let p = a; p >= b; p--) out.push(p - 1);
  }
  return out;
}

/** Remove the listed pages. Refuses to remove every page. */
export async function deletePages(bytes: Uint8Array, spec: string): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = doc.getPageCount();
  const drop = new Set(parsePageRanges(spec, total));
  if (!spec.trim()) throw new Error('Enter the pages to delete, for example 2,4-6.');
  if (drop.size >= total) throw new Error('That would delete every page.');
  [...drop].sort((a, b) => b - a).forEach((i) => doc.removePage(i));
  return doc.save();
}

export interface CropMargins { top: number; right: number; bottom: number; left: number } // points

/** Crop by trimming margins (points) from the visible box of the chosen pages. */
export async function cropPages(bytes: Uint8Array, margins: CropMargins, spec = ''): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  for (const i of parsePageRanges(spec, pages.length)) {
    const p = pages[i];
    const box = p.getCropBox();
    const x = box.x + margins.left, y = box.y + margins.bottom;
    const w = box.width - margins.left - margins.right, h = box.height - margins.top - margins.bottom;
    if (w < 10 || h < 10) throw new Error(`Page ${i + 1} would be smaller than 10 pt after cropping.`);
    p.setCropBox(x, y, w, h);
    p.setMediaBox(x, y, w, h);
  }
  return doc.save();
}

export type StampPlace = 'header-left' | 'header-center' | 'header-right' | 'footer-left' | 'footer-center' | 'footer-right';

export interface StampOptions {
  text: string; // tokens: {n} page number, {total} page count, {bates}
  place: StampPlace;
  size?: number;
  margin?: number;
  color?: [number, number, number];
  pages?: string;
  batesPrefix?: string;
  batesStart?: number;
  batesDigits?: number;
}

/** Header/footer text, page numbers and Bates numbers all go through here. */
export async function stampText(bytes: Uint8Array, o: StampOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const size = o.size ?? 10, margin = o.margin ?? 28;
  const [r, g, b] = o.color ?? [0, 0, 0];
  const pages = doc.getPages();
  const targets = parsePageRanges(o.pages ?? '', pages.length);
  targets.forEach((i, seq) => {
    const p = pages[i];
    const { width, height } = p.getSize();
    const bates = `${o.batesPrefix ?? ''}${String((o.batesStart ?? 1) + seq).padStart(o.batesDigits ?? 6, '0')}`;
    const text = o.text.replace(/\{n\}/g, String(i + 1)).replace(/\{total\}/g, String(pages.length)).replace(/\{bates\}/g, bates);
    const tw = font.widthOfTextAtSize(text, size);
    const x = o.place.endsWith('left') ? margin : o.place.endsWith('right') ? width - margin - tw : (width - tw) / 2;
    const y = o.place.startsWith('header') ? height - margin - size * 0.8 : margin;
    p.drawText(text, { x, y, size, font, color: rgb(r, g, b) });
  });
  return doc.save();
}

/** Put 2, 4, 6 or 9 source pages on each output sheet. */
export async function nUp(bytes: Uint8Array, perSheet: 2 | 4 | 6 | 9, opts: { landscape?: boolean; gap?: number; border?: boolean } = {}): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const cols = { 2: 2, 4: 2, 6: 3, 9: 3 }[perSheet], rows = perSheet / cols;
  const landscape = opts.landscape ?? perSheet === 2;
  const sw = landscape ? 841.89 : 595.28, sh = landscape ? 595.28 : 841.89;
  const gap = opts.gap ?? 12;
  const cw = (sw - gap * (cols + 1)) / cols, ch = (sh - gap * (rows + 1)) / rows;
  const embedded = await out.embedPdf(src, src.getPageIndices());
  for (let i = 0; i < embedded.length; i += perSheet) {
    const sheet = out.addPage([sw, sh]);
    for (let k = 0; k < perSheet && i + k < embedded.length; k++) {
      const e = embedded[i + k];
      const scale = Math.min(cw / e.width, ch / e.height);
      const col = k % cols, row = Math.floor(k / cols);
      const w = e.width * scale, h = e.height * scale;
      const x = gap + col * (cw + gap) + (cw - w) / 2;
      const y = sh - gap - (row + 1) * ch - row * gap + (ch - h) / 2;
      sheet.drawPage(e, { x, y, width: w, height: h });
      if (opts.border) sheet.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.5 });
    }
  }
  return out.save();
}

/** Page order for saddle-stitch printing: pad to a multiple of 4 with blanks (-1). */
export function bookletOrder(total: number): number[] {
  const n = Math.ceil(total / 4) * 4;
  const order: number[] = [];
  for (let s = 0; s < n / 4; s++) {
    const a = n - 1 - 2 * s, b = 2 * s, c = 2 * s + 1, d = n - 2 - 2 * s;
    for (const p of [a, b, c, d]) order.push(p < total ? p : -1);
  }
  return order;
}

/** Two pages per landscape sheet in booklet order; print double-sided, flip on short edge. */
export async function booklet(bytes: Uint8Array): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const emb = await out.embedPdf(src, src.getPageIndices());
  const sw = 841.89, sh = 595.28, hw = sw / 2;
  const order = bookletOrder(src.getPageCount());
  for (let i = 0; i < order.length; i += 2) {
    const sheet = out.addPage([sw, sh]);
    for (let k = 0; k < 2; k++) {
      const idx = order[i + k];
      if (idx < 0) continue;
      const e = emb[idx];
      const scale = Math.min(hw / e.width, sh / e.height);
      const w = e.width * scale, h = e.height * scale;
      sheet.drawPage(e, { x: k * hw + (hw - w) / 2, y: (sh - h) / 2, width: w, height: h });
    }
  }
  return out.save();
}

/** Bake form fields into the page so they can no longer be edited. */
export async function flattenForms(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  doc.getForm().flatten();
  return doc.save();
}
