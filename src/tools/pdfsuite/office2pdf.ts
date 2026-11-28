// Office to PDF conversion, fully on-device.
//
// DOCX is rendered by docx-preview (Apache-2.0) to real styled HTML: fonts,
// tables, images, lists, headers and footers. XLSX is read with SheetJS CE
// (Apache-2.0) into per-sheet tables that keep sheet structure, merged cells
// and column widths.
//
// Two outputs, and the tool asks which one before converting:
//  - Image PDF: each rendered page is captured as a high-resolution image.
//    The browser's own text engine shapes complex scripts (Devanagari,
//    Gurmukhi) correctly, so the pages look exactly as rendered, but the
//    text inside the PDF is not selectable.
//  - Print view: the styled document opens in a print window so the
//    browser's "Save as PDF" keeps text selectable. Page breaks may shift,
//    because only Word/LibreOffice reproduce Word's own pagination.
// Page breaks stored in the .docx are honoured in both outputs.

import { sanitizePrintHtml } from './printSanitize';
import DOMPurify from 'dompurify';

export interface RenderedDoc {
  /** One element per page (docx-preview section), or the body as a single page. */
  pages: HTMLElement[];
  /** The rendered markup, for the print view. */
  bodyHtml: string;
  /** The stylesheet markup the renderer produced, for the print view. */
  cssHtml: string;
  /** Remove the offscreen host from the document. */
  dispose: () => void;
}

/** Render a .docx into offscreen styled HTML pages. */
export async function renderDocx(data: Uint8Array): Promise<RenderedDoc> {
  const docx = await import('docx-preview');
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;';
  host.setAttribute('aria-hidden', 'true');
  const styles = document.createElement('div');
  const body = document.createElement('div');
  host.append(styles, body);
  document.body.appendChild(host);
  try {
    await docx.renderAsync(data, body, styles, {
      breakPages: true,
      useBase64URL: true,
      inWrapper: true,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
    });
  } catch (e) {
    host.remove();
    throw e instanceof Error && e.message ? e : Error('This file could not be read as a Word document. Only modern .docx files are supported.');
  }
  const found = Array.from(body.querySelectorAll('section.docx')) as HTMLElement[];
  return {
    pages: found.length ? found : [body],
    bodyHtml: body.innerHTML,
    cssHtml: styles.innerHTML,
    dispose: () => host.remove(),
  };
}

/* ---- XLSX to HTML tables (pure, unit-tested without a DOM) ---- */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function colToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export interface CellRef { r: number; c: number }
export function parseRef(ref: string): CellRef {
  const m = /^([A-Za-z]+)(\d+)$/.exec(ref);
  if (!m) throw Error(`Bad cell reference: ${ref}`);
  return { r: Number(m[2]) - 1, c: colToIndex(m[1]) };
}
export function parseRange(ref: string): { s: CellRef; e: CellRef } {
  const [a, b] = ref.split(':');
  const s = parseRef(a);
  const e = b ? parseRef(b) : { ...s };
  return { s, e };
}

export function indexToCol(i: number): string {
  let n = i + 1;
  let out = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    out = String.fromCharCode(65 + m) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export interface SheetLike {
  '!ref'?: string;
  '!merges'?: { s: CellRef; e: CellRef }[];
  '!cols'?: { wpx?: number; wch?: number }[];
  [cell: string]: unknown;
}
export interface CellLike { v?: unknown; w?: string }

export interface SheetTable { name: string; html: string }

/**
 * One worksheet to one HTML table. Sheet structure, merged cells and column
 * widths survive; formatted values (dates, currencies) use the workbook's
 * stored display text. Charts and images are not part of the output.
 */
export function sheetToTable(ws: SheetLike): string {
  const ref = ws['!ref'];
  if (!ref) return '<p class="sheet-empty">This sheet is empty.</p>';
  const { s, e } = parseRange(ref);
  const covered = new Set<string>();
  const anchor = new Map<string, { rowspan: number; colspan: number }>();
  for (const m of ws['!merges'] ?? []) {
    const rowspan = m.e.r - m.s.r + 1;
    const colspan = m.e.c - m.s.c + 1;
    anchor.set(`${m.s.r},${m.s.c}`, { rowspan, colspan });
    for (let r = m.s.r; r <= m.e.r; r++) for (let c = m.s.c; c <= m.e.c; c++) if (r !== m.s.r || c !== m.s.c) covered.add(`${r},${c}`);
  }
  const colWidths: string[] = [];
  for (let c = s.c; c <= e.c; c++) {
    const col = (ws['!cols'] ?? [])[c];
    const px = col?.wpx ?? (col?.wch ? Math.round(col.wch * 7.5) : 0);
    colWidths.push(px ? `<col style="width:${px}px">` : '<col>');
  }
  const rows: string[] = [];
  for (let r = s.r; r <= e.r; r++) {
    const cells: string[] = [];
    for (let c = s.c; c <= e.c; c++) {
      if (covered.has(`${r},${c}`)) continue;
      const raw = ws[`${indexToCol(c)}${r + 1}`] as CellLike | undefined;
      const text = raw?.w ?? (raw?.v == null ? '' : String(raw.v));
      const mrg = anchor.get(`${r},${c}`);
      const span = mrg ? `${mrg.rowspan > 1 ? ` rowspan="${mrg.rowspan}"` : ''}${mrg.colspan > 1 ? ` colspan="${mrg.colspan}"` : ''}` : '';
      cells.push(`<td${span}>${esc(text)}</td>`);
    }
    rows.push(`<tr>${cells.join('')}</tr>`);
  }
  return `<table class="sheet"><colgroup>${colWidths.join('')}</colgroup>${rows.join('')}</table>`;
}

/**
 * One table per worksheet that has cells. A worksheet with no cells is left out rather than printed as a page of
 * invented text; if every worksheet is empty there is nothing to print and this throws.
 */
export function workbookToTables(names: string[], sheets: Record<string, SheetLike>): SheetTable[] {
  const filled = names.filter((name) => Boolean((sheets[name] ?? {})['!ref']));
  if (names.length && !filled.length) throw new Error('Every worksheet in this workbook is empty, so there is nothing to convert.');
  return filled.map((name) => ({ name, html: sheetToTable(sheets[name] ?? {}) }));
}

/** Styles used by both the raster route and the print view for spreadsheets. */
export const SHEET_CSS = `
section.sheetpage{font-family:Calibri,Arial,sans-serif;background:#fff;color:#111;padding:24px;box-sizing:border-box;}
section.sheetpage h2{font-size:14px;margin:0 0 8px;font-weight:600;}
table.sheet{border-collapse:collapse;table-layout:fixed;}
table.sheet td{border:1px solid #bbb;padding:2px 6px;font-size:11px;vertical-align:top;overflow:hidden;white-space:pre-wrap;}
p.sheet-empty{color:#666;font-size:12px;}
`.trim();

/** Wrap spreadsheet tables in page sections for rendering or printing. */
export function tablesToSections(tables: SheetTable[], host: HTMLElement): HTMLElement[] {
  // Cell text and sheet names are already escaped; sanitise again in depth.
  host.innerHTML = DOMPurify.sanitize(
    tables.map((t) => `<section class="sheetpage"><h2>${esc(t.name)}</h2>${t.html}</section>`).join(''),
  );
  const style = document.createElement('style');
  style.textContent = SHEET_CSS;
  host.appendChild(style);
  return Array.from(host.querySelectorAll('section.sheetpage')) as HTMLElement[];
}

/* ---- Shared outputs ---- */

/** Rasterise one rendered page element through an SVG foreignObject, so the
 * browser's own layout engine does the wrapping and script shaping — the
 * pixels match what the page shows. Everything is inlined (base64 assets),
 * so the canvas stays clean. */
let lastWords: DomWord[] = [];

/** Word boxes measured in a bare frame holding the same markup the picture is drawn from, so boxes and pixels line up. */
async function measureWords(container: HTMLElement, copy: HTMLElement, w: number, h: number): Promise<DomWord[]> {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = `position:fixed;left:-99999px;top:0;width:${w}px;height:${h}px;border:0;visibility:hidden`;
  document.body.appendChild(frame);
  try {
    const d = frame.contentDocument;
    if (!d) return [];
    d.open();
    d.write('<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0}</style></head><body></body></html>');
    d.close();
    d.body.appendChild(d.importNode(container, true));
    const idx = Array.from(container.querySelectorAll('*')).indexOf(copy);
    const mirror = idx >= 0 ? (d.body.firstElementChild as HTMLElement).querySelectorAll('*')[idx] as HTMLElement : null;
    await new Promise((r) => setTimeout(r, 30));
    return mirror ? wordsOfElement(mirror) : [];
  } finally {
    frame.remove();
  }
}

async function rasterise(el: HTMLElement, cssHtml: string, scale: number): Promise<HTMLCanvasElement> {
  const w = Math.max(1, el.offsetWidth);
  const h = Math.max(1, el.offsetHeight);
  // foreignObject content must be well-formed XML: build it as DOM and let
  // XMLSerializer close void elements and escape text, which outerHTML does not.
  const container = document.createElement('div');
  if (cssHtml) {
    const t = document.createElement('template');
    t.innerHTML = cssHtml;
    container.appendChild(t.content.cloneNode(true));
  }
  const content = el.classList.contains('docx')
    ? Object.assign(document.createElement('div'), { className: 'docx-wrapper' })
    : container;
  if (content !== container) content.style.cssText = 'background:#fff;padding:0';
  if (content !== container) container.appendChild(content);
  const copy = el.cloneNode(true) as HTMLElement;
  // The preview stylesheet draws a drop shadow and a bottom margin around each page; neither belongs in the exported page image.
  copy.style.boxShadow = 'none';
  copy.style.marginBottom = '0';
  content.appendChild(copy);
  const xhtml = new XMLSerializer().serializeToString(container);
  lastWords = await measureWords(container, copy, w, h);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<foreignObject width="100%" height="100%">${xhtml}</foreignObject></svg>`;
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(Error('The page could not be rendered. Try the selectable-text option instead.'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('Canvas is unavailable in this browser.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0);
  return canvas;
}

export interface DomWord { text: string; left: number; bottom: number; width: number; height: number }

/**
 * Every word of the rendered page with its box, in CSS pixels relative to the page element. A word split
 * over two lines is cut at the line break, with the letters shared out by box width.
 */
export function wordsOfElement(el: HTMLElement): DomWord[] {
  const base = el.getBoundingClientRect();
  const out: DomWord[] = [];
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent ?? '';
    if (!text.trim()) continue;
    const parent = (n as Text).parentElement;
    if (parent && el.ownerDocument.defaultView!.getComputedStyle(parent).visibility === 'hidden') continue;
    for (const m of text.matchAll(/\S+/g)) {
      const range = el.ownerDocument.createRange();
      range.setStart(n, m.index as number);
      range.setEnd(n, (m.index as number) + m[0].length);
      const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
      if (!rects.length) continue;
      const chars = Array.from(m[0]);
      const total = rects.reduce((a, r) => a + r.width, 0);
      let used = 0;
      rects.forEach((r, i) => {
        const take = i === rects.length - 1 ? chars.length - used : Math.max(1, Math.round((chars.length * r.width) / total));
        const piece = chars.slice(used, used + take).join('');
        used += take;
        if (piece) out.push({ text: piece, left: r.left - base.left, bottom: r.bottom - base.top, width: r.width, height: r.height });
      });
    }
  }
  return out;
}

/** Capture rendered page elements into a PDF of page images at high DPI, with an exact invisible text layer. */
export async function sectionsToPdf(sections: HTMLElement[], cssHtml: string, scale = 2): Promise<Uint8Array> {
  if (!sections.length) throw Error('Nothing to convert: the document rendered no pages.');
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const { InvisibleUnicodeFont, drawInvisibleWords } = await import('./unicodeLayer');
  const uf = new InvisibleUnicodeFont(doc);
  for (const el of sections) {
    const canvas = await rasterise(el, cssHtml, scale);
    const words = lastWords;
    const png = await doc.embedPng(canvas.toDataURL('image/png'));
    const w = Math.max(72, (el.offsetWidth * 72) / 96);
    const h = Math.max(72, (el.offsetHeight * 72) / 96);
    // Spreadsheet sections are only as big as their content: give each sheet at least an A4 page,
    // content anchored top-left, so the PDF is printable instead of a postage-stamp page.
    const sheet = el.classList.contains('sheetpage');
    const pw = sheet ? Math.max(w, 595) : w;
    const ph = sheet ? Math.max(h, 842) : h;
    const page = doc.addPage([pw, ph]);
    page.drawImage(png, { x: 0, y: ph - h, width: w, height: h });
    // Text sits invisibly over the picture so the page can be searched and copied; each character maps back exactly.
    drawInvisibleWords(page, uf, words.map((k) => ({ text: k.text, x: k.left * 0.75, y: ph - k.bottom * 0.75, w: Math.max(1, k.width * 0.75), h: Math.max(1, k.height * 0.75) })));
  }
  uf.finish();
  return doc.save();
}

/** Print-view styles: strip the on-screen wrapper chrome and give every page room. */
export const PRINT_CSS =
  'body{margin:0;background:#fff}' +
  '.docx-wrapper{background:#fff!important;padding:0!important;display:block!important}' +
  '.docx-wrapper>section.docx{margin:0 auto 24px!important;box-shadow:none!important;overflow:visible!important}' +
  'section.sheetpage{box-sizing:border-box;max-width:100%}' +
  'table.sheet{max-width:100%}' +
  '@media print{' +
  // Full-page-height sections would spill a blank page after every real page.
  '.docx-wrapper>section.docx{margin:0 auto!important;height:auto!important;min-height:0!important;page-break-after:always}' +
  '.docx-wrapper>section.docx:last-child{page-break-after:auto}' +
  'section.sheetpage{page-break-after:always}' +
  'section.sheetpage:last-child{page-break-after:auto}}' +
  '@page{margin:12mm}';

/**
 * Open the styled document for printing; "Save as PDF" in the print dialog keeps text selectable.
 * Uses a print window when the browser allows one. Desktop webviews and popup blockers refuse
 * window.open, so fall back to printing from a hidden frame inside the page.
 */
/** True in the desktop app when the native save command is in use (not opted out). */
export function nativePdfSaveActive(): boolean {
  const internals = (window as unknown as { __TAURI_INTERNALS__?: { invoke?: unknown } }).__TAURI_INTERNALS__;
  return !!internals?.invoke && localStorage.getItem('toolatlas.nativePdfSave') !== '0';
}

export function openPrintView(title: string, cssHtml: string, bodyHtml: string): Promise<string | null> {
  const doc = (script: string) =>
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>${cssHtml}` +
    `<style>${PRINT_CSS}</style></head><body>` + bodyHtml + script + '</body></html>';
  // Desktop app: save through the native PDF command. localStorage 'toolatlas.nativePdfSave' = '0' opts out (falls back to the print dialog path).
  const internals = (window as unknown as { __TAURI_INTERNALS__?: { invoke?: (c: string, a: unknown) => Promise<string> } }).__TAURI_INTERNALS__;
  if (internals?.invoke && localStorage.getItem('toolatlas.nativePdfSave') !== '0') {
    const w = window as unknown as { __nativePdfSave?: { ok: boolean; path?: string; error?: string } };
    delete w.__nativePdfSave;
    const name = title.replace(/\.[^.]+$/, '') || 'document';
    // Resolves with the saved file path (the command writes to the Downloads folder, with no save dialog).
    return internals.invoke('save_print_pdf', { html: sanitizePrintHtml(doc('')), name }).then(
      path => { w.__nativePdfSave = { ok: true, path }; return path; },
      err => { w.__nativePdfSave = { ok: false, error: String(err) }; throw new Error('The PDF could not be saved: ' + String(err)); },
    );
  }
  const w = window.open('', '_blank');
  if (w) {
    w.document.write(doc('<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},250);});<\/script>'));
    w.document.close();
    return Promise.resolve(null);
  }
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('data-print-frame', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  const d = frame.contentDocument;
  const cw = frame.contentWindow;
  if (!d || !cw) { frame.remove(); throw Error('Could not open a print view in this window.'); }
  d.open();
  d.write(doc(''));
  d.close();
  setTimeout(() => {
    cw.focus();
    cw.print();
    setTimeout(() => frame.remove(), 120000);
  }, 500);
  return Promise.resolve(null);
                                 }

/* ---- Spreadsheet painter route: print areas, formulas, header/footer ----
   Built for the painter engine (officePainter.ts). Beyond the basic table
   route above, this keeps the sheet's print area (defined names), evaluates
   simple arithmetic formulas (SheetJS CE has no calc engine and drops
   uncached results), and reads header/footer strings from the sheet XML,
   which SheetJS CE does not parse. Charts, cell fills/fonts and orientation
   remain out of scope. */

const colToIdx2 = (letters: string): number => { let n = 0; for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
const idxToCol2 = (i: number): string => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; } return s; };
const parseCellRef2 = (ref: string): { c: number; r: number } | null => { const m = /^([A-Z]+)(\d+)$/.exec(ref.replace(/\$/g, '')); return m ? { c: colToIdx2(m[1]), r: +m[2] - 1 } : null; };
const parseAreaRef = (ref: string): { s: { c: number; r: number }; e: { c: number; r: number } } | null => {
  const [a, b] = (ref.split('!').pop() ?? '').replace(/'/g, '').split(':');
  const s = parseCellRef2(a);
  const e = b ? parseCellRef2(b) : s;
  return s && e ? { s, e } : null;
};

interface FormulaEvaluator {
  valueOf: (ref: string, depth: number) => number | null;
  evalFormula: (f: string, depth: number) => number | null;
}

/* Tiny evaluator for the common spreadsheet formulas: cell refs, numbers,
   + - * / % and parentheses. Anything else stays blank (documented limit);
   formulas are parsed token by token, never eval'd. */
function makeEvaluator(ws: Record<string, any>): FormulaEvaluator {
  const cache = new Map<string, number | null>();
  const valueOf = (ref: string, depth: number): number | null => {
    if (depth > 20) return null;
    if (cache.has(ref)) return cache.get(ref) ?? null;
    const cell = ws[ref];
    if (!cell) { cache.set(ref, 0); return 0; }
    if (typeof cell.v === 'number') { cache.set(ref, cell.v); return cell.v; }
    if (cell.f) { const v = evalFormula(cell.f, depth + 1); cache.set(ref, v); return v; }
    const n = parseFloat(cell.v);
    const v = Number.isFinite(n) ? n : 0;
    cache.set(ref, v); return v;
  };
  const evalFormula = (f: string, depth: number): number | null => {
    const tokens = String(f).replace(/^=/, '').match(/([A-Z]+\d+|\d+(?:\.\d+)?|[+\-*/()%])/g);
    if (!tokens || tokens.join('').length !== String(f).replace(/^=/, '').replace(/\s/g, '').length) return null;
    let pos = 0;
    const peek = (): string | undefined => tokens[pos];
    const primary = (): number => {
      const t = tokens[pos++] ?? '';
      if (t === '(') { const v = expr(); if (peek() === ')') pos++; return v; }
      if (t === '-') return -primary();
      if (/^[A-Z]+\d+$/.test(t)) { const v = valueOf(t, depth); return v == null ? 0 : v; }
      const n = parseFloat(t); return Number.isFinite(n) ? n : 0;
    };
    const term = (): number => { let v = primary(); while (peek() === '*' || peek() === '/' || peek() === '%') { const op = tokens[pos++]; const r = primary(); v = op === '*' ? v * r : op === '/' ? v / r : v % r; } return v; };
    const expr = (): number => { let v = term(); while (peek() === '+' || peek() === '-') { const op = tokens[pos++]; const r = term(); v = op === '+' ? v + r : v - r; } return v; };
    const out = expr();
    return Number.isFinite(out) ? out : null;
  };
  return { valueOf, evalFormula };
}

const fmtNum = (n: number): string => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1e10) / 1e10));

function cellText2(ws: Record<string, any>, ev: FormulaEvaluator, ref: string): string {
  const cell = ws[ref];
  if (!cell) return '';
  if (cell.f && (cell.t === 'z' || cell.v === undefined || cell.v === 0)) {
    const v = ev.evalFormula(cell.f, 0);
    return v == null ? '' : fmtNum(v);
  }
  if (cell.w != null) return String(cell.w);
  if (cell.v != null) return String(cell.v);
  return '';
}

/* Header/footer strings live in the sheet XML, which SheetJS CE does not
   parse; read them from the zip directly. &C/&L/&R sections, &P page, &N pages. */
async function readSheetHeaderFooter(buf: Uint8Array, sheetIndex: number): Promise<{ header?: string; footer?: string }> {
  try {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file(`xl/worksheets/sheet${sheetIndex + 1}.xml`)?.async('string');
    if (!xml) return {};
    const hf = /<headerFooter[^>]*>([\s\S]*?)<\/headerFooter>/.exec(xml);
    if (!hf) return {};
    const grab = (tag: string): string => {
      const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`).exec(hf[1]);
      if (!m) return '';
      // Field markers arrive entity-escaped (&amp;C for the center section):
      // unescape first, then split sections and substitute page fields.
      const body = m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      const sec = (re: RegExp): string => { const mm = re.exec(body); return mm ? mm[1] : ''; };
      const text = sec(/&C(.*?)(?=&[LR]|$)/s) || sec(/&L(.*?)(?=&[LR]|$)/s) || sec(/&R(.*?)(?=&[LR]|$)/s) || (/&[LR]/.test(body) ? '' : body);
      return text.replace(/&P/g, '1').replace(/&N/g, '1').replace(/&"[^"]*"/g, '').replace(/&\d+/g, '').trim();
    };
    return { header: grab('oddHeader'), footer: grab('oddFooter') };
  } catch { return {}; }
}

/* Styles for the painter spreadsheet route: layout is carried inline on the
   section; this covers table chrome only. */
export const SHEET_PAINT_CSS = `
section.sheetpaint{font-family:Calibri,Arial,sans-serif;background:#fff;color:#111;}
section.sheetpaint table{border-collapse:collapse;}
section.sheetpaint td{padding:1pt 6pt 1pt 0;font-size:10pt;}
section.sheetpaint h2{font-size:14pt;margin:0 0 6pt;font-weight:600;}
section.sheetpaint p.sheet-hf{text-align:center;font-size:9pt;color:#444;margin:4pt 0;}
`.trim();

/**
 * One section.docx element's worth of HTML per workbook, for the painter
 * route: values, merged cells, column widths, Indic text, the sheet's print
 * area, header/footer strings and simple arithmetic formulas. Throws when
 * every sheet is empty. The section carries an explicit page size in its
 * inline style, which the painter reads for its page geometry.
 */
export async function workbookToPaintHtml(wb: any, bytes: Uint8Array): Promise<string> {
  const parts: string[] = [];
  const names: string[] = wb.SheetNames ?? [];
  for (let si = 0; si < names.length; si++) {
    const name = names[si];
    const ws = wb.Sheets[name] as Record<string, any>;
    if (!ws || !ws['!ref']) continue;
    // Print area: a defined name _xlnm.Print_Area scoped to this sheet.
    let range = null as { s: { c: number; r: number }; e: { c: number; r: number } } | null;
    for (const dn of ((wb.Workbook && wb.Workbook.Names) || []) as { Sheet?: number; Name?: string; Ref?: string }[]) {
      if (dn.Sheet === si && /Print_Area/.test(dn.Name ?? '')) { range = parseAreaRef(dn.Ref ?? ''); break; }
    }
    if (!range) {
      range = parseAreaRef(String(ws['!ref']));
      if (!range) continue;
    }
    const ev = makeEvaluator(ws);
    const colWidths: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const col = ((ws['!cols'] ?? []) as { wpx?: number; wch?: number }[])[c];
      const px = col?.wpx ?? (col?.wch ? Math.round(col.wch * 7.5) : 0);
      colWidths.push(px ? `<col style="width:${px}px">` : '<col>');
    }
    const merges = ((ws['!merges'] || []) as { s: { r: number; c: number }; e: { r: number; c: number } }[]).filter(
      (m) => m.s.r <= range!.e.r && m.e.r >= range!.s.r && m.s.c <= range!.e.c && m.e.c >= range!.s.c,
    );
    const covered = new Set<string>();
    const spanAt = new Map<string, { rs: number; cs: number }>();
    for (const m of merges) {
      spanAt.set(`${m.s.r},${m.s.c}`, { rs: m.e.r - m.s.r + 1, cs: m.e.c - m.s.c + 1 });
      for (let r = m.s.r; r <= m.e.r; r++) for (let c = m.s.c; c <= m.e.c; c++) if (r !== m.s.r || c !== m.s.c) covered.add(`${r},${c}`);
    }
    const rows: string[] = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
      const cells: string[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        if (covered.has(`${r},${c}`)) continue;
        const sp = spanAt.get(`${r},${c}`);
        const text = cellText2(ws, ev, idxToCol2(c) + (r + 1));
        const attrs = sp ? `${sp.cs > 1 ? ` colspan="${sp.cs}"` : ''}${sp.rs > 1 ? ` rowspan="${sp.rs}"` : ''}` : '';
        cells.push(`<td${attrs}>${esc(text)}</td>`);
      }
      rows.push(`<tr>${cells.join('')}</tr>`);
    }
    const hf = await readSheetHeaderFooter(bytes, si);
    const head = hf.header ? `<p class="sheet-hf">${esc(hf.header)}</p>` : '';
    const foot = hf.footer ? `<p class="sheet-hf">${esc(hf.footer)}</p>` : '';
    parts.push(`${head}<h2>${esc(name)}</h2><table><colgroup>${colWidths.join('')}</colgroup>${rows.join('')}</table>${foot}`);
  }
  if (!parts.length) throw new Error('Every worksheet in this workbook is empty, so there is nothing to convert.');
  // One section per worksheet: the painter paginates by section, so every
  // sheet starts on a fresh page, matching spreadsheet print behaviour.
  return parts
    .map((part) => `<section class="docx sheetpaint" style="width:732pt;min-height:540pt;padding:36pt;box-sizing:border-box;"><div class="docx-wrapper">${part}</div></section>`)
    .join('');
}
