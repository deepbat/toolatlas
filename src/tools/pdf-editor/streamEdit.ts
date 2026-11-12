// Conservative text-show surgery. Only exact, unique matches in page content
// streams are rewritten. Form XObjects, inline images and ambiguous matches
// deliberately fall back to visual replacement. Never a security redaction API.
import { PDFArray, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';

export interface TextRun {
  text: string;
  codes: number[];
  width: number; // sum of glyph widths, in 1/1000 em
  spaces: number;
}
export interface SourceEdit {
  stream: number;
  start: number;
  end: number;
  replacement: string;
}
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
      i++; let hex = '';
      while (i < s.length && s[i] !== '>') hex += s[i++];
      if (s[i++] !== '>') throw Error('Unclosed PDF hex string');
      hex = hex.replace(/\s/g, '');
      if (!/^[0-9a-f]*$/i.test(hex)) throw Error('Invalid PDF hex string');
      if (hex.length % 2) hex += '0';
      bytes = hex.match(/../g)?.map(h => parseInt(h, 16)) ?? [];
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
    if (raw === 'BI' || raw === 'ID') throw Error('Inline image stream');
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
  return Array.from(decodePDFRawStream(stream).decode(), n => String.fromCharCode(n)).join('');
}

interface ShowOp { stream: number; start: number; end: number; op: string; fontSize: number; cs: number; ws: number; nums: number[]; kern: number }
interface PageIndex { byCodes: Map<string, ShowOp[]>; shared: Map<number, boolean> }
const INDEXES = new WeakMap<object, PageIndex>();

// Tokenise each content stream once per page and index the show operators by
// their encoded bytes, so each lookup is a Map read instead of a full re-parse.
function indexPage(page: any): PageIndex {
  const hit = INDEXES.get(page);
  if (hit) return hit;
  const byCodes = new Map<string, ShowOp[]>();
  let fontSize = 0, charSpace = 0, wordSpace = 0;
  const stack: number[][] = [];
  pageStreams(page).forEach((stream, streamIndex) => {
    let tokens: Token[];
    try { tokens = tokenize(streamText(stream)); } catch { return; }
    let operands: Token[] = [];
    let arrayDepth = 0, dictDepth = 0;
    for (const t of tokens) {
      if (t.raw === '[') arrayDepth++;
      if (t.raw === '<<') dictDepth++;
      const isOp = !arrayDepth && !dictDepth && !t.bytes && /^[A-Za-z*'"]+$/.test(t.raw);
      if (isOp) {
        const nums = operands.map(o => Number(o.raw));
        if (t.raw === 'q') stack.push([fontSize, charSpace, wordSpace]);
        if (t.raw === 'Q' && stack.length) [fontSize, charSpace, wordSpace] = stack.pop()!;
        if (t.raw === 'Tf') fontSize = nums[1];
        if (t.raw === 'Tc') charSpace = nums[0];
        if (t.raw === 'Tw') wordSpace = nums[0];
        if (['Tj', 'TJ', "'", '"'].includes(t.raw) && fontSize > 0) {
          const encoded = operands.flatMap(o => o.bytes ?? []);
          if (encoded.length) {
            const kern = t.raw === 'TJ' ? operands.filter(o => !o.bytes && /^[-+.\d]+$/.test(o.raw)).reduce((n, o) => n + Number(o.raw), 0) : 0;
            const key = encoded.join(',');
            const list = byCodes.get(key) ?? [];
            list.push({ stream: streamIndex, start: operands[0].start, end: t.end, op: t.raw, fontSize, cs: charSpace, ws: wordSpace, nums, kern });
            byCodes.set(key, list);
          }
          if (t.raw === '"') { wordSpace = nums[0]; charSpace = nums[1]; }
        }
        operands = [];
      } else operands.push(t);
      if (t.raw === ']') arrayDepth--;
      if (t.raw === '>>') dictDepth--;
    }
  });
  const idx: PageIndex = { byCodes, shared: new Map() };
  INDEXES.set(page, idx);
  return idx;
}

// A selected PDF.js item is removable only if it maps to one complete show
// operator and exactly one source operator contains those encoded glyphs.
export function locateSourceEdit(page: any, run: TextRun): SourceEdit | undefined {
  const idx = indexPage(page);
  const found = new Set<ShowOp>();
  for (const codes of [run.codes, run.codes.flatMap(n => [n >> 8, n & 255])]) {
    if (!codes.length) continue;
    (idx.byCodes.get(codes.join(',')) ?? []).forEach(o => found.add(o));
  }
  if (found.size !== 1) return undefined;
  const o = [...found][0];
  let cs = o.cs, ws = o.ws, prefix = '';
  if (o.op === '"') { ws = o.nums[0]; cs = o.nums[1]; prefix = `${ws} Tw ${cs} Tc T* `; }
  if (o.op === "'") prefix = 'T* ';
  const advance = run.width + (run.codes.length * cs + run.spaces * ws) * 1000 / o.fontSize - o.kern;
  const selected: SourceEdit = { stream: o.stream, start: o.start, end: o.end, replacement: `${prefix}[${(-advance).toFixed(6)}] TJ` };
  const target = pageStreams(page)[selected.stream];
  // Never mutate a shared stream used by another page.
  if (!idx.shared.has(selected.stream)) idx.shared.set(selected.stream, page.doc.getPages().filter((p: any) => pageStreams(p).includes(target)).length !== 1);
  return idx.shared.get(selected.stream) ? undefined : selected;
}

export function removeSourceTexts(page: any, edits: SourceEdit[]): void {
  const streams = pageStreams(page);
  streams.forEach((s, index) => {
    const local = edits.filter(e => e.stream === index).sort((a, b) => b.start - a.start);
    if (!local.length) return;
    let text = streamText(s);
    let lastStart = Infinity;
    for (const e of local) {
      if (e.end > lastStart) throw Error('Overlapping text edits. Undo the duplicate edit and try again.');
      text = text.slice(0, e.start) + e.replacement + text.slice(e.end);
      lastStart = e.start;
    }
    const updated = page.doc.context.flateStream(Uint8Array.from(text, c => c.charCodeAt(0)));
    const ref = page.doc.context.getObjectRef(s);
    if (!ref) throw Error('This PDF uses an unsupported direct content stream.');
    // Replace the object itself, rather than leave its old bytes orphaned in
    // the saved file. Other PDF metadata/revisions are outside this API.
    page.doc.context.assign(ref, updated);
  });
}
