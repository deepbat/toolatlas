// Pure, on-device PDF page operations built on pdf-lib. No DOM access, so
// every function is covered by scripts/pdfsuite-unit.ts.
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { InvisibleUnicodeFont, drawInvisibleWords, needsUnicode } from './unicodeLayer';

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

/** Rotate the chosen pages by 90, 180 or 270 degrees, adding to any rotation the page already has. */
export async function rotatePages(bytes: Uint8Array, angle: 90 | 180 | 270, spec = ''): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  for (const i of parsePageRanges(spec, pages.length)) {
    const p = pages[i];
    p.setRotation(degrees(((p.getRotation().angle + angle) % 360 + 360) % 360));
  }
  return doc.save();
}

export interface WatermarkOptions { text: string; size?: number; opacity?: number; pages?: string }

/** Faint diagonal label across the centre of each chosen page, drawn over the content. */
export async function watermark(bytes: Uint8Array, o: WatermarkOptions): Promise<Uint8Array> {
  const text = o.text.trim();
  if (!text) throw new Error('Enter the watermark text.');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const theta = Math.PI / 4, cos = Math.cos(theta), sin = Math.sin(theta);
  const pages = doc.getPages();
  for (const i of parsePageRanges(o.pages ?? '', pages.length)) {
    const p = pages[i];
    const { width, height } = p.getSize();
    let size = o.size ?? 48;
    let tw = font.widthOfTextAtSize(text, size);
    const maxTw = 0.95 * Math.hypot(width, height);
    if (tw > maxTw) { size = Math.max(8, size * maxTw / tw); tw = font.widthOfTextAtSize(text, size); }
    const x = width / 2 - (tw / 2) * cos + size * 0.35 * sin;
    const y = height / 2 - (tw / 2) * sin - size * 0.35 * cos;
    p.drawText(text, { x, y, size, font, color: rgb(0.45, 0.45, 0.45), opacity: o.opacity ?? 0.15, rotate: degrees(45) });
  }
  return doc.save();
}

/** Rebuild the document with the pages in the given 1-based order. Numbers may repeat; pages left out are dropped. */
export async function reorderPages(bytes: Uint8Array, spec: string): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = src.getPageCount();
  if (!spec.trim()) throw new Error('Enter the new page order, for example 3,1,2.');
  const order = spec.split(',').map((part) => {
    const n = Number(part.trim());
    if (!Number.isInteger(n) || n < 1 || n > total) throw new Error(`"${part.trim()}" is not a page number between 1 and ${total}.`);
    return n - 1;
  });
  const out = await PDFDocument.create();
  for (const p of await out.copyPages(src, order)) out.addPage(p);
  const title = src.getTitle(); if (title) out.setTitle(title);
  const author = src.getAuthor(); if (author) out.setAuthor(author);
  const subject = src.getSubject(); if (subject) out.setSubject(subject);
  return out.save();
}

export interface SignPlacement {
  page: number; // 1-based
  png: Uint8Array;
  width: number; // points
  height: number; // points
  x: 'left' | 'center' | 'right';
  y: 'top' | 'middle' | 'bottom';
  margin?: number;
}

/** Draw a signature image on one page. This is a visible mark, not a cryptographic signature. */
export async function signPdf(bytes: Uint8Array, p: SignPlacement): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const idx = p.page - 1;
  if (!Number.isInteger(p.page) || idx < 0 || idx >= pages.length) throw new Error(`Page ${p.page} is outside this ${pages.length}-page document.`);
  if (p.width < 10 || p.height < 10) throw new Error('The signature would be smaller than 10 pt.');
  const img = await doc.embedPng(p.png);
  const page = pages[idx];
  const { width, height } = page.getSize();
  const margin = p.margin ?? 36;
  const x = p.x === 'left' ? margin : p.x === 'right' ? width - margin - p.width : (width - p.width) / 2;
  const y = p.y === 'bottom' ? margin : p.y === 'top' ? height - margin - p.height : (height - p.height) / 2;
  page.drawImage(img, { x, y, width: p.width, height: p.height });
  return doc.save();
}

export interface OcrWord { text: string; x0: number; y0: number; x1: number; y1: number }
export interface OcrPageLayer { page: number; imgWidth: number; imgHeight: number; words: OcrWord[] }

/** Helvetica (WinAnsi) cannot encode everything OCR may emit; map common punctuation and drop the rest. */
export function toWinAnsi(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
}

/** Invisible text layer over scanned pages so the document can be searched and copied. */
export async function addTextLayer(bytes: Uint8Array, layers: OcrPageLayer[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  // Hindi, Punjabi and other scripts Helvetica cannot carry go through the Unicode-exact invisible layer.
  if (layers.some((l) => needsUnicode(l.words))) {
    const uf = new InvisibleUnicodeFont(doc);
    for (const layer of layers) {
      const page = pages[layer.page - 1];
      if (!page) throw new Error(`Page ${layer.page} is outside this ${pages.length}-page document.`);
      if (layer.imgWidth < 1 || layer.imgHeight < 1) throw new Error('The scan image has no size.');
      const { width, height } = page.getSize();
      const sx = width / layer.imgWidth, sy = height / layer.imgHeight;
      drawInvisibleWords(page, uf, layer.words.map((w) => ({ text: w.text, x: w.x0 * sx, y: height - w.y1 * sy, w: Math.max(1, (w.x1 - w.x0) * sx), h: Math.max(1, (w.y1 - w.y0) * sy) })));
    }
    uf.finish();
    return doc.save();
  }
  for (const layer of layers) {
    const page = pages[layer.page - 1];
    if (!page) throw new Error(`Page ${layer.page} is outside this ${pages.length}-page document.`);
    if (layer.imgWidth < 1 || layer.imgHeight < 1) throw new Error('The scan image has no size.');
    const { width, height } = page.getSize();
    const sx = width / layer.imgWidth, sy = height / layer.imgHeight;
    for (const w of layer.words) {
      const text = toWinAnsi(w.text);
      if (!text) continue;
      const bw = Math.max(1, (w.x1 - w.x0) * sx), bh = Math.max(1, (w.y1 - w.y0) * sy);
      let size = bh;
      const tw = font.widthOfTextAtSize(text, size);
      if (tw > bw) size = Math.max(1, size * (bw / tw));
      page.drawText(text, { x: w.x0 * sx, y: height - w.y1 * sy, size, font, opacity: 0 });
    }
  }
  return doc.save();
}

/** Bake form fields into the page so they can no longer be edited. */
export async function flattenForms(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  doc.getForm().flatten();
  return doc.save();
}
