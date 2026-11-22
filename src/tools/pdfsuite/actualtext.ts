// pdf.js ignores /ActualText, the PDF way to say what a run of glyphs really spells. Chromium and Skia write it for
// Indic conjuncts and reordered matras, and their ToUnicode map points those glyphs at U+0000 or at the wrong order.
// This module reads the spans from the page content and swaps them in for the glyphs pdf.js decoded. It only acts when
// the span count in the content matches the span markers in pdf.js's operator list and every glyph lines up with the
// extracted text; otherwise it changes nothing and the caller's unreadable-character check still applies.
import { PDFArray, PDFDict, PDFName, PDFRawStream, PDFRef, decodePDFRawStream, type PDFDocument } from 'pdf-lib';

function hexToText(hex: string): string {
  const h = hex.replace(/\s+/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < h.length; i += 2) bytes.push(parseInt(h.slice(i, i + 2).padEnd(2, '0'), 16));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    return out;
  }
  return String.fromCharCode(...bytes);
}

/** ActualText strings of every `/Span <</ActualText ...>> BDC`, in content order, for one page. */
export function pageActualTexts(lib: PDFDocument, pageIndex: number): string[] {
  const page = lib.getPage(pageIndex);
  const ctx = lib.context;
  const raw = page.node.Contents();
  const streams: Uint8Array[] = [];
  const add = (o: unknown) => {
    const obj = o instanceof PDFRef ? ctx.lookup(o) : o;
    if (obj instanceof PDFRawStream) streams.push(decodePDFRawStream(obj).decode());
  };
  if (raw instanceof PDFArray) for (let i = 0; i < raw.size(); i++) add(raw.get(i));
  else if (raw) add(raw);
  let text = '';
  for (const s of streams) { for (let i = 0; i < s.length; i++) text += String.fromCharCode(s[i]); text += '\n'; }
  const out: string[] = [];
  const re = /\/Span\s*<<[^>]*?\/ActualText\s*(?:<([0-9A-Fa-f\s]*)>|\(((?:\\.|[^\\)])*)\))[^>]*>>\s*BDC/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[1] !== undefined ? hexToText(m[1]) : (m[2] ?? '').replace(/\\(.)/g, '$1'));
  return out;
}

/**
 * Returns the item strings with ActualText applied, or null when the page cannot be matched safely.
 * `lib` is pdfjs-dist, `page` a pdf.js page, `strs` the `str` of each text item in order.
 */
export async function applyActualText(lib: any, page: any, strs: string[], actual: string[]): Promise<string[] | null> {
  if (!actual.length) return null;
  const OPS = lib.OPS;
  const ol = await page.getOperatorList();
  // Walk marked content: glyph unicode strings per ActualText span, in order.
  const spans: { glyphs: string[] }[] = [];
  const glyphStream: { u: string; span: number }[] = [];
  const stack: (number | null)[] = [];
  let spanCount = 0;
  for (let i = 0; i < ol.fnArray.length; i++) {
    const f = ol.fnArray[i], a = ol.argsArray[i];
    if (f === OPS.beginMarkedContentProps || f === OPS.beginMarkedContent) {
      if (f === OPS.beginMarkedContentProps && a?.[0] === 'Span' && (a[1] === null || a[1] === undefined)) {
        stack.push(spanCount); spans.push({ glyphs: [] }); spanCount++;
      } else stack.push(null);
    } else if (f === OPS.endMarkedContent) {
      stack.pop();
    } else if (f === OPS.showText || f === OPS.showSpacedText) {
      const arr: any[] = f === OPS.showText ? a[0] : a[0];
      const cur = [...stack].reverse().find((x) => x !== null) ?? -1;
      for (const g of arr) if (g && typeof g === 'object' && 'unicode' in g) glyphStream.push({ u: String(g.unicode ?? ''), span: cur as number });
    }
  }
  if (spanCount !== actual.length) return null;
  // Align glyphs to the flattened item text, then replace each span's range.
  const offs: number[] = []; let flat = '';
  for (const s of strs) { offs.push(flat.length); flat += s; }
  let j = 0;
  const ranges: { start: number; end: number; text: string }[] = [];
  let open: { start: number; end: number; span: number } | null = null;
  for (const g of glyphStream) {
    let guard = 0;
    while (g.u && !flat.startsWith(g.u, j) && flat[j] === ' ' && guard++ < 4) {
      // pdf.js adds a space where glyph advances leave a gap. Next to a substituted span that gap is a ligature or reordering artefact.
      if (open || g.span >= 0) ranges.push({ start: j, end: j + 1, text: '' });
      j++;
    }
    if (g.u.trim() === '' && !flat.startsWith(g.u, j)) continue; // a space pdf.js left out of the text items
    if (g.u && !flat.startsWith(g.u, j)) { return null; }
    const start = j; j += g.u.length;
    if (g.span >= 0) {
      if (open && open.span === g.span) open.end = j;
      else { if (open) ranges.push({ start: open.start, end: open.end, text: actual[open.span] }); open = { start, end: j, span: g.span }; }
    } else if (open) { ranges.push({ start: open.start, end: open.end, text: actual[open.span] }); open = null; }
  }
  if (open) ranges.push({ start: open.start, end: open.end, text: actual[open.span] });
  // Apply from the end so earlier offsets stay valid.
  const chars = strs.map((s) => s.split(''));
  const itemOf = (pos: number) => { let k = offs.length - 1; while (k > 0 && offs[k] > pos) k--; return k; };
  for (const r of ranges.sort((x, y) => y.start - x.start)) {
    const k0 = itemOf(r.start);
    for (let p = r.end - 1; p >= r.start; p--) {
      const k = itemOf(p); chars[k][p - offs[k]] = p === r.start ? r.text : '';
    }
    void k0;
  }
  return chars.map((c) => c.join(''));
}
