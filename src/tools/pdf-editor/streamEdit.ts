// Position-aware text-show surgery for the PDF editor.
//
// The tapped pdf.js text item is mapped to a rectangle in PDF user space.
// Page content streams (and the Form XObjects they invoke) are parsed with
// full graphics/text state tracking, so every text-showing operator gets a
// computed bounding box. Operators whose boxes fall inside the target
// rectangle are replaced with an advance-preserving no-op, which removes the
// original glyphs from the page AND from the text layer. Text that cannot be
// located this way (shared streams, unreadable encodings, partial coverage)
// stays in the file and the caller falls back to a visual cover.
import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  decodePDFRawStream,
} from 'pdf-lib';

export interface SourceEdit {
  obj: number; // content stream object number
  start: number; // offset of the show operator's first operand
  end: number; // offset just past the operator token
  replacement: string; // advance-preserving no-op
}
export interface PdfRect { x: number; y: number; w: number; h: number }

interface Token { start: number; end: number; raw: string; bytes?: number[] }

function tokenize(s: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < s.length) {
    if (/\s|\0/.test(s[i])) { i++; continue; }
    if (s[i] === '%') { while (i < s.length && !/[\r\n]/.test(s[i])) i++; continue; }
    const start = i;
    let bytes: number[] | undefined;
    if (s[i] === '(') {
      bytes = []; i++; let depth = 1;
      while (i < s.length && depth) {
        let c = s.charCodeAt(i++);
        if (c === 92) {
          const e = s[i++];
          if (e === '\r' || e === '\n') { if (e === '\r' && s[i] === '\n') i++; continue; }
          if (/[0-7]/.test(e || 'x')) {
            let oct = e;
            for (let n = 0; n < 2 && /[0-7]/.test(s[i] || 'x'); n++) oct += s[i++];
            c = parseInt(oct, 8) & 255;
          } else c = ({ n: 10, r: 13, t: 9, b: 8, f: 12 } as Record<string, number>)[e] ?? e?.charCodeAt(0);
        } else if (c === 40) depth++;
        else if (c === 41 && --depth === 0) break;
        if (Number.isFinite(c)) bytes.push(c);
      }
      if (depth) throw Error('Unclosed PDF string');
    } else if (s[i] === '<' && s[i + 1] !== '<') {
      i++;
      const hs = i;
      while (i < s.length && s[i] !== '>') i++;
      if (i >= s.length) throw Error('Unclosed hex string');
      let hex = s.slice(hs, i).replace(/[\s\0]/g, '');
      i++;
      if (!/^[0-9a-f]*$/i.test(hex)) throw Error('Invalid PDF hex string');
      if (hex.length % 2) hex += '0';
      bytes = hex.match(/../g)?.map((h) => parseInt(h, 16)) ?? [];
    } else if ('[]<>'.includes(s[i])) {
      i++;
      if ((s[start] === '<' || s[start] === '>') && s[i] === s[start]) i++;
    } else if (s[i] === '/') {
      i++;
      while (i < s.length && !/[\s\[\]()<>/%]/.test(s[i])) i++;
    } else {
      while (i < s.length && !/[\s\[\]()<>/%]/.test(s[i])) i++;
      if (i === start) i++;
    }
    const raw = s.slice(start, i);
    if (raw === 'BI') {
      // Inline image: skip ID keyword and its data so parsing can continue.
      const idm = /\bID[\x09\x0a\x0c\x0d ]/.exec(s.slice(i));
      if (!idm) return out;
      let p = i + idm.index + idm[0].length;
      const eim = /[\x09\x0a\x0c\x0d \x00]EI[\x09\x0a\x0c\x0d \x00\]>(\[/%]/g;
      eim.lastIndex = p;
      const m = eim.exec(s);
      if (!m) return out;
      i = m.index + m[0].length;
      continue;
    }
    out.push({ start, end: i, raw, bytes });
  }
  return out;
}

export function pageStreams(page: any): PDFRawStream[] {
  const contents = page.node.lookup(PDFName.of('Contents'));
  if (contents instanceof PDFRawStream) return [contents];
  if (contents instanceof PDFArray) return contents.asArray().map((ref: any) => page.doc.context.lookup(ref)).filter((s: any) => s instanceof PDFRawStream);
  return [];
}
export function streamText(stream: PDFRawStream): string {
  return Array.from(decodePDFRawStream(stream).decode(), (n) => String.fromCharCode(n)).join('');
}

/* ------------------------------------------------------------- matrices */

type Mat = [number, number, number, number, number, number];
const IDENT: Mat = [1, 0, 0, 1, 0, 0];
// Row-vector convention: apply(m, p) = p * m; mult(a, b) applies a then b.
function mult(m1: Mat, m2: Mat): Mat {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ];
}
const apply = (m: Mat, x: number, y: number): [number, number] => [x * m[0] + y * m[2] + m[4], x * m[1] + y * m[3] + m[5]];

/* ---------------------------------------------------------- font metrics */

interface FontMetric {
  width: (code: number) => number; // 1/1000 em
  bytesPerCode: 1 | 2;
  ascent: number; // 1/1000 em
  descent: number; // negative, 1/1000 em
}
const FONT_CACHE = new WeakMap<object, FontMetric | undefined>();

function num(dict: PDFDict | undefined, key: string): number | undefined {
  const v = dict?.lookupMaybe(PDFName.of(key), PDFNumber);
  return v ? v.asNumber() : undefined;
}

function loadFont(resources: PDFDict | undefined, name: string): FontMetric | undefined {
  const fontDict = resources?.lookupMaybe(PDFName.of('Font'), PDFDict)?.lookupMaybe(PDFName.of(name), PDFDict);
  if (!fontDict) return undefined;
  const hit = FONT_CACHE.get(fontDict);
  if (hit !== undefined || FONT_CACHE.has(fontDict)) return hit;
  let metric: FontMetric | undefined;
  try {
    const subtype = String(fontDict.lookupMaybe(PDFName.of('Subtype'), PDFName)?.asString() ?? '');
    const fd = fontDict.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict);
    let ascent = num(fd, 'Ascent');
    let descent = num(fd, 'Descent');
    if (subtype.includes('Type0')) {
      const desc = fontDict.lookupMaybe(PDFName.of('DescendantFonts'), PDFArray)?.lookupMaybe(0, PDFDict);
      const dfd = desc?.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict);
      ascent = ascent ?? num(dfd, 'Ascent');
      descent = descent ?? num(dfd, 'Descent');
      const dw = num(desc, 'DW') ?? 1000;
      const widths = new Map<number, number>();
      const w = desc?.lookupMaybe(PDFName.of('W'), PDFArray)?.asArray() ?? [];
      for (let i = 0; i < w.length;) {
        const c = (w[i] as PDFNumber)?.asNumber?.();
        if (c == null || Number.isNaN(c)) break;
        const next: any = w[i + 1];
        if (next instanceof PDFArray) {
          next.asArray().forEach((v: any, k: number) => widths.set(c + k, (v as PDFNumber).asNumber()));
          i += 2;
        } else {
          const c2 = (next as PDFNumber)?.asNumber?.();
          const ww = (w[i + 2] as PDFNumber)?.asNumber?.() ?? dw;
          for (let k = c; k <= c2; k++) widths.set(k, ww);
          i += 3;
        }
      }
      metric = { width: (c) => widths.get(c) ?? dw, bytesPerCode: 2, ascent: ascent ?? 800, descent: descent ?? -200 };
    } else {
      const first = num(fontDict, 'FirstChar') ?? 0;
      const widthsArr = fontDict.lookupMaybe(PDFName.of('Widths'), PDFArray)?.asArray().map((v: any) => (v as PDFNumber).asNumber()) ?? [];
      let scale = 1;
      if (subtype.includes('Type3')) {
        const fm = fontDict.lookupMaybe(PDFName.of('FontMatrix'), PDFArray)?.asArray().map((v: any) => (v as PDFNumber).asNumber());
        if (fm && fm[0]) scale = fm[0] * 1000;
      }
      const missing = (num(fd, 'MissingWidth') ?? 600) * scale;
      metric = {
        width: (c) => (widthsArr[c - first] ?? missing / scale) * scale,
        bytesPerCode: 1,
        ascent: (ascent ?? 800) * scale,
        descent: (descent ?? -200) * scale,
      };
    }
  } catch {
    metric = undefined;
  }
  FONT_CACHE.set(fontDict, metric);
  return metric;
}

/* ------------------------------------------------------- stream traversal */

interface ShowOpGeo {
  obj: number;
  start: number;
  end: number;
  replacement: string;
  x0: number; y0: number; x1: number; y1: number;
}
interface PageOps { ops: ShowOpGeo[]; usages: number[] }

function pageResources(page: any): PDFDict | undefined {
  let node: any = page.node;
  while (node instanceof PDFDict) {
    const r = node.lookupMaybe(PDFName.of('Resources'), PDFDict);
    if (r) return r;
    node = node.lookupMaybe(PDFName.of('Parent'), PDFDict);
  }
  return undefined;
}

function walkStream(
  stream: PDFRawStream,
  objNum: number,
  resources: PDFDict | undefined,
  ctm0: Mat,
  doc: any,
  out: ShowOpGeo[],
  usages: number[],
  xobjStack: Set<number>,
): void {
  let tokens: Token[];
  try {
    tokens = tokenize(streamText(stream));
  } catch {
    return;
  }
  let ctm = ctm0;
  let tm: Mat = IDENT, tlm: Mat = IDENT;
  let tl = 0, tc = 0, tw = 0, tz = 100, fontSize = 0;
  let font: FontMetric | undefined;
  const stack: [Mat, Mat, Mat, number, number, number, number, number, FontMetric | undefined][] = [];
  let operands: Token[] = [];
  let arrayDepth = 0, dictDepth = 0;
  for (const t of tokens) {
    if (t.raw === '[') arrayDepth++;
    if (t.raw === '<<') dictDepth++;
    const isOp = !arrayDepth && !dictDepth && !t.bytes && /^[A-Za-z*'"]+$/.test(t.raw);
    if (!isOp) {
      operands.push(t);
      if (t.raw === ']') arrayDepth--;
      if (t.raw === '>>') dictDepth--;
      continue;
    }
    const nums = operands.map((o) => Number(o.raw));
    switch (t.raw) {
      case 'q': stack.push([ctm, tm, tlm, tl, tc, tw, tz, fontSize, font]); break;
      case 'Q': if (stack.length) [ctm, tm, tlm, tl, tc, tw, tz, fontSize, font] = stack.pop()!; break;
      case 'cm': if (nums.length >= 6) ctm = mult([nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]], ctm); break;
      case 'BT': tm = IDENT; tlm = IDENT; break;
      case 'Tc': tc = nums[0] || 0; break;
      case 'Tw': tw = nums[0] || 0; break;
      case 'Tz': tz = nums[0] || 100; break;
      case 'TL': tl = nums[0] || 0; break;
      case 'Tf': {
        fontSize = nums[1] || 0;
        const name = operands[0]?.raw.startsWith('/') ? operands[0].raw.slice(1) : '';
        font = name ? loadFont(resources, name) : undefined;
        break;
      }
      case 'Td': tlm = mult([1, 0, 0, 1, nums[0] || 0, nums[1] || 0], tlm); tm = tlm; break;
      case 'TD': tl = -(nums[1] || 0); tlm = mult([1, 0, 0, 1, nums[0] || 0, nums[1] || 0], tlm); tm = tlm; break;
      case 'Tm': if (nums.length >= 6) { tm = [nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]]; tlm = tm; } break;
      case 'T*': tlm = mult([1, 0, 0, 1, 0, -tl], tlm); tm = tlm; break;
      case 'Do': {
        const name = operands[0]?.raw.startsWith('/') ? operands[0].raw.slice(1) : '';
        let xobj: any;
        try {
          xobj = name ? resources?.lookupMaybe(PDFName.of('XObject'), PDFDict)?.lookup(PDFName.of(name)) : undefined;
        } catch {
          xobj = undefined;
        }
        if (xobj instanceof PDFRawStream) {
          const subtype = String(xobj.dict.lookupMaybe(PDFName.of('Subtype'), PDFName)?.asString() ?? '');
          const ref = doc.context.getObjectRef(xobj) as PDFRef | undefined;
          if (ref) usages.push(ref.objectNumber);
          if (subtype.includes('Form') && ref && !xobjStack.has(ref.objectNumber)) {
            const m = xobj.dict.lookupMaybe(PDFName.of('Matrix'), PDFArray)?.asArray().map((v: any) => (v as PDFNumber).asNumber());
            const res2 = xobj.dict.lookupMaybe(PDFName.of('Resources'), PDFDict) ?? resources;
            xobjStack.add(ref.objectNumber);
            walkStream(xobj, ref.objectNumber, res2, m && m.length === 6 ? mult([m[0], m[1], m[2], m[3], m[4], m[5]], ctm) : ctm, doc, out, usages, xobjStack);
            xobjStack.delete(ref.objectNumber);
          }
        }
        break;
      }
      case 'Tj':
      case 'TJ':
      case "'":
      case '"': {
        if (!font || !fontSize || objNum < 0) break;
        // ' and " move to the next line before showing; " also sets Tw/Tc.
        if (t.raw === "'") { tlm = mult([1, 0, 0, 1, 0, -tl], tlm); tm = tlm; }
        if (t.raw === '"') { tw = nums[0] || 0; tc = nums[1] || 0; tlm = mult([1, 0, 0, 1, 0, -tl], tlm); tm = tlm; }
        const strOperands = operands.filter((o) => o.bytes);
        const codes: number[] = [];
        for (const o of strOperands) {
          const b = o.bytes!;
          if (font.bytesPerCode === 2) {
            for (let k = 0; k + 1 < b.length; k += 2) codes.push((b[k] << 8) | b[k + 1]);
          } else codes.push(...b);
        }
        if (!codes.length) break;
        const tjNums = t.raw === 'TJ' ? operands.filter((o) => !o.bytes && /^[-+.\d]+$/.test(o.raw)).map((o) => Number(o.raw)) : [];
        const sumNums = tjNums.reduce((n, v) => n + v, 0);
        const sumW = codes.reduce((n, c) => n + font!.width(c), 0);
        const spaces = font.bytesPerCode === 1 ? codes.filter((c) => c === 32).length : 0;
        let prefix = '';
        if (t.raw === '"') { prefix = `${nums[0]} Tw ${nums[1]} Tc T* `; }
        if (t.raw === "'") prefix = 'T* ';
        const advance1000 = sumW + ((codes.length * tc + spaces * tw) * 1000) / fontSize - sumNums;
        const advX = ((sumW * fontSize) / 1000 + codes.length * tc + spaces * tw - (sumNums * fontSize) / 1000) * (tz / 100);
        const ascY = (font.ascent * fontSize) / 1000;
        const descY = (font.descent * fontSize) / 1000;
        const rm = mult(tm, ctm);
        const pts = [apply(rm, 0, descY), apply(rm, advX, descY), apply(rm, advX, ascY), apply(rm, 0, ascY)];
        const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
        out.push({
          obj: objNum,
          start: operands[0].start,
          end: t.end,
          replacement: `${prefix}[${(-advance1000).toFixed(2)}] TJ`,
          x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys),
        });
        break;
      }
    }
    operands = [];
    if (t.raw === ']') arrayDepth--;
    if (t.raw === '>>') dictDepth--;
  }
}

const PAGE_CACHE = new WeakMap<object, PageOps>();
function collectPageOps(page: any): PageOps {
  const hit = PAGE_CACHE.get(page);
  if (hit) return hit;
  const ops: ShowOpGeo[] = [];
  const usages: number[] = [];
  for (const s of pageStreams(page)) {
    const ref = page.doc.context.getObjectRef(s) as PDFRef | undefined;
    const objNum = ref ? ref.objectNumber : -1;
    if (ref) usages.push(objNum);
    walkStream(s, objNum, pageResources(page), IDENT, page.doc, ops, usages, new Set());
  }
  const result: PageOps = { ops, usages };
  PAGE_CACHE.set(page, result);
  return result;
}

// How many times each stream object is drawn across the whole document.
// Streams drawn more than once are never mutated: removing text from them
// would erase it from places the user did not select.
const DOC_COUNTS = new WeakMap<object, Map<number, number>>();
function docStreamCounts(doc: any): Map<number, number> {
  const hit = DOC_COUNTS.get(doc);
  if (hit) return hit;
  const counts = new Map<number, number>();
  for (const page of doc.getPages()) for (const u of collectPageOps(page).usages) counts.set(u, (counts.get(u) ?? 0) + 1);
  DOC_COUNTS.set(doc, counts);
  return counts;
}

/* --------------------------------------------------------- removal planning */

// Plan removal of every text-show operator whose glyphs fall inside the
// target rectangle (PDF user space). Returns undefined when the text cannot
// be removed cleanly; the caller then uses the visual cover instead.
export function planTextRemoval(page: any, rect: PdfRect): SourceEdit[] | undefined {
  const { ops } = collectPageOps(page);
  if (!ops.length) return undefined;
  const counts = docStreamCounts(page.doc);
  const matched = ops.filter((o) => {
    if (o.obj < 0 || counts.get(o.obj) !== 1) return false;
    const area = Math.max(0.01, (o.x1 - o.x0) * (o.y1 - o.y0));
    const ix = Math.max(0, Math.min(o.x1, rect.x + rect.w) - Math.max(o.x0, rect.x));
    const iy = Math.max(0, Math.min(o.y1, rect.y + rect.h) - Math.max(o.y0, rect.y));
    if ((ix * iy) / area > 0.5) return true;
    const ocx = (o.x0 + o.x1) / 2, ocy = (o.y0 + o.y1) / 2;
    return ocx >= rect.x && ocx <= rect.x + rect.w && ocy >= rect.y && ocy <= rect.y + rect.h;
  });
  if (!matched.length) return undefined;
  // Require the matched operators to actually cover the target, so a stray
  // neighbour never stands in for text we failed to locate.
  let covered = 0;
  for (const o of matched) {
    const ix = Math.max(0, Math.min(o.x1, rect.x + rect.w) - Math.max(o.x0, rect.x));
    const iy = Math.max(0, Math.min(o.y1, rect.y + rect.h) - Math.max(o.y0, rect.y));
    covered += ix * iy;
  }
  if (covered < 0.5 * rect.w * rect.h) return undefined;
  return matched.map((o) => ({ obj: o.obj, start: o.start, end: o.end, replacement: o.replacement }));
}

// Apply planned removals. Returns the set of stream object numbers that were
// rewritten, so the caller can fall back to a visual cover for the rest.
export function removeSourceTexts(page: any, edits: SourceEdit[]): Set<number> {
  const done = new Set<number>();
  const byObj = new Map<number, SourceEdit[]>();
  for (const e of edits) {
    const list = byObj.get(e.obj) ?? [];
    list.push(e);
    byObj.set(e.obj, list);
  }
  for (const [objNum, list] of byObj) {
    const obj = page.doc.context.lookup(PDFRef.of(objNum));
    if (!(obj instanceof PDFRawStream)) continue;
    let text: string;
    try {
      text = streamText(obj);
    } catch {
      continue;
    }
    const sorted = [...list].sort((a, b) => b.start - a.start);
    let ok = true;
    for (const e of sorted) {
      if (e.start < 0 || e.end > text.length || e.start >= e.end) { ok = false; break; }
      text = text.slice(0, e.start) + e.replacement + text.slice(e.end);
    }
    if (!ok) continue;
    try {
      const updated = page.doc.context.flateStream(Uint8Array.from(text, (c) => c.charCodeAt(0)));
      page.doc.context.assign(PDFRef.of(objNum), updated);
      done.add(objNum);
    } catch { /* leave stream untouched */ }
  }
  return done;
                                            }
