import * as docx from 'docx-preview';
import { Painter } from './painter.js';

const FONT_FILES = {
  'carlito':        { regular: 'Carlito-Regular.ttf', bold: 'Carlito-Bold.ttf', italic: 'Carlito-Italic.ttf', boldItalic: 'Carlito-BoldItalic.ttf' },
  'caladea':        { regular: 'Caladea-Regular.ttf', bold: 'Caladea-Bold.ttf', italic: 'Caladea-Italic.ttf', boldItalic: 'Caladea-BoldItalic.ttf' },
  'tinos':          { regular: 'Tinos-Regular.ttf', bold: 'Tinos-Bold.ttf', italic: 'Tinos-Italic.ttf', boldItalic: 'Tinos-BoldItalic.ttf' },
  'noto-serif':     { regular: 'NotoSerif-Regular.ttf', bold: 'NotoSerif-Bold.ttf' },
  'noto-sans':      { regular: 'NotoSans-Regular.ttf', bold: 'NotoSans-Bold.ttf' },
  'noto-devanagari':{ regular: 'NotoSansDevanagari-Regular.ttf', bold: 'NotoSansDevanagari-Bold.ttf' },
  'noto-gurmukhi':  { regular: 'NotoSansGurmukhi-Regular.ttf', bold: 'NotoSansGurmukhi-Bold.ttf' },
};

// family aliases: DOCX family -> @font-face family name we inject
const ALIASES = [
  { families: ['Calibri'], key: 'carlito' },
  { families: ['Cambria'], key: 'caladea' },
  { families: ['Times New Roman', 'Times'], key: 'tinos' },
];
const INDIC = [
  { range: 'U+0900-097F', key: 'noto-devanagari' },
  { range: 'U+0A00-0A7F', key: 'noto-gurmukhi' },
];
const LATIN_RANGE = 'U+0020-02FF, U+2000-206F, U+20A0-20BF';

function faceCss(alias, variant, weight, style, range) {
  return `@font-face{font-family:'${alias}';src:url('fonts/${variant}');font-weight:${weight};font-style:${style};${range ? `unicode-range:${range};` : ''}}`;
}

async function injectFonts() {
  const rules = [];
  for (const a of ALIASES) {
    const set = FONT_FILES[a.key];
    for (const fam of a.families) {
      if (set.regular) rules.push(faceCss(fam, set.regular, '400', 'normal', LATIN_RANGE));
      if (set.bold) rules.push(faceCss(fam, set.bold, '700', 'normal', LATIN_RANGE));
      if (set.italic) rules.push(faceCss(fam, set.italic, '400', 'italic', LATIN_RANGE));
      if (set.boldItalic) rules.push(faceCss(fam, set.boldItalic, '700', 'italic', LATIN_RANGE));
      for (const ind of INDIC) {
        const iset = FONT_FILES[ind.key];
        if (iset.regular) rules.push(faceCss(fam, iset.regular, '400', 'normal', ind.range));
        if (iset.bold) rules.push(faceCss(fam, iset.bold, '700', 'normal', ind.range));
        if (iset.italic) rules.push(faceCss(fam, iset.regular, '400', 'italic', ind.range));
        if (iset.bold) rules.push(faceCss(fam, iset.bold, '700', 'italic', ind.range));
      }
    }
  }
  const style = document.createElement('style');
  style.textContent = rules.join('\n');
  document.head.appendChild(style);
  await document.fonts.load('12px Calibri');
  await document.fonts.load('bold 12px Calibri');
  await document.fonts.ready;
}

async function loadFontBytes() {
  const out = {};
  for (const [key, variants] of Object.entries(FONT_FILES)) {
    out[key] = {};
    for (const [v, file] of Object.entries(variants)) {
      const res = await fetch('fonts/' + file);
      out[key][v] = { bytes: new Uint8Array(await res.arrayBuffer()) };
    }
  }
  return out;
}

// docx-preview renders list markers as ::before pseudo-elements (Symbol-font
// bullets, CSS counters for numbers), which the painter's text walk cannot
// see. Materialize each marker as a real inline span, resolving counters the
// same way docx-preview's stylesheet does (all counters reset at the wrapper,
// one counter per num-id/level class). Symbol-font private-use bullet U+F0B7
// is substituted by U+2022 in the paragraph font, which the bundled fonts
// carry.
function materializeListMarkers(container) {
  const counters = new Map();
  for (const p of container.querySelectorAll('p[class*="docx-num-"]')) {
    const m = p.className.match(/docx-num-(\d+)-(\d+)/);
    if (!m) continue;
    const counterName = `docx-num-${m[1]}-${m[2]}`;
    const val = (counters.get(counterName) || 0) + 1;
    counters.set(counterName, val);
    const content = getComputedStyle(p, '::before').content;
    if (!content || content === 'none' || content === 'normal') continue;
    let marker;
    if (content.includes('counter(')) {
      // pattern: "" counter(name) "<suffix with css escapes>"
      const suf = (content.match(/counter\([^)]*\)\s*"((?:[^"\\]|\\.)*)"/) || [null, ''])[1];
      marker = String(val) + cssUnescape(suf);
    } else {
      const lit = (content.match(/^"((?:[^"\\]|\\.)*)"$/) || [null, ''])[1];
      marker = cssUnescape(lit);
    }
    if (!marker) continue;
    // Tabs shape to .notdef in the bundled fonts (visible tofu box). A nbsp
    // has an empty outline and extracts cleanly; the following text is
    // positioned from DOM measurement, so the narrower gap is harmless.
    marker = marker.replace(/\t/g, '\u00A0');
    // Symbol-font PUA bullet -> standard bullet in the paragraph font
    const beforeFont = getComputedStyle(p, '::before').fontFamily || '';
    if (/symbol/i.test(beforeFont)) marker = marker.replace(/[-]/g, '\u2022');
    const span = document.createElement('span');
    span.textContent = marker;
    p.insertBefore(span, p.firstChild);
  }
}

function cssUnescape(s) {
  return s.replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
          .replace(/\\(.)/g, '$1');
}

window.convertDocx = async (buf) => {
  await injectFonts();
  const container = document.getElementById('container');
  container.innerHTML = '';
  await docx.renderAsync(buf, container, null, {
    className: 'docx', inWrapper: true, ignoreWidth: false, ignoreHeight: false,
    renderHeaders: true, renderFooters: true, renderFootnotes: true, renderEndnotes: true,
    useBase64URL: true, breakPages: true,
  });
  await document.fonts.ready;
  materializeListMarkers(container);
  const fontFiles = await loadFontBytes();
  const painter = new Painter(fontFiles);
  const bytes = await painter.paint(container, { Title: 'converted' });
  window.__warnings = painter.warnings;
  return bytes;
};

/* ---- XLSX: SheetJS CE -> HTML tables, painted like any other DOM ----
   Keeps values, merged cells, column widths, Indic text, the sheet's print
   area, header/footer strings, and simple arithmetic formulas (evaluated
   here because SheetJS CE has no calc engine and drops uncached results).
   Charts, cell fills/fonts and orientation are out of scope for this route. */
import * as XLSX from 'xlsx';

const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const colToIdx = letters => { let n = 0; for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
const idxToCol = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; } return s; };
const parseCellRef = ref => { const m = /^([A-Z]+)(\d+)$/.exec(ref.replace(/\$/g, '')); return m ? { c: colToIdx(m[1]), r: +m[2] - 1 } : null; };
const parseRangeRef = ref => {
  const [a, b] = ref.split('!').pop().replace(/'/g, '').split(':');
  const s = parseCellRef(a), e = b ? parseCellRef(b) : s;
  return s && e ? { s, e } : null;
};

/* Tiny evaluator for the common spreadsheet formulas: cell refs, numbers,
   + - * / % and parentheses. Anything else stays blank (documented limit);
   formulas are parsed token by token, never eval'd. */
function makeEvaluator(ws) {
  const cache = new Map();
  const valueOf = (ref, depth) => {
    if (depth > 20) return null;
    if (cache.has(ref)) return cache.get(ref);
    const cell = ws[ref];
    if (!cell) { cache.set(ref, 0); return 0; }
    if (typeof cell.v === 'number') { cache.set(ref, cell.v); return cell.v; }
    if (cell.f) { const v = evalFormula(cell.f, depth + 1); cache.set(ref, v); return v; }
    const n = parseFloat(cell.v);
    const v = Number.isFinite(n) ? n : 0;
    cache.set(ref, v); return v;
  };
  const evalFormula = (f, depth) => {
    const tokens = f.replace(/^=/, '').match(/([A-Z]+\d+|\d+(?:\.\d+)?|[+\-*/()%])/g);
    if (!tokens || tokens.join('').length !== f.replace(/^=/, '').replace(/\s/g, '').length) return null;
    let pos = 0;
    const peek = () => tokens[pos];
    const primary = () => {
      const t = tokens[pos++];
      if (t === '(') { const v = expr(); if (peek() === ')') pos++; return v; }
      if (t === '-') return -primary();
      if (/^[A-Z]+\d+$/.test(t)) { const v = valueOf(t, depth); return v == null ? 0 : v; }
      const n = parseFloat(t); return Number.isFinite(n) ? n : 0;
    };
    const term = () => { let v = primary(); while (peek() === '*' || peek() === '/' || peek() === '%') { const op = tokens[pos++]; const r = primary(); v = op === '*' ? v * r : op === '/' ? v / r : v % r; } return v; };
    const expr = () => { let v = term(); while (peek() === '+' || peek() === '-') { const op = tokens[pos++]; const r = term(); v = op === '+' ? v + r : v - r; } return v; };
    const out = expr();
    return Number.isFinite(out) ? out : null;
  };
  return { valueOf, evalFormula };
}

const fmtNum = n => {
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1e10) / 1e10);
};

function cellText(ws, ev, ref) {
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
async function readHeaderFooter(buf, sheetIndex) {
  try {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file(`xl/worksheets/sheet${sheetIndex + 1}.xml`)?.async('string');
    if (!xml) return {};
    const hf = /<headerFooter[^>]*>([\s\S]*?)<\/headerFooter>/.exec(xml);
    if (!hf) return {};
    const grab = tag => {
      const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`).exec(hf[1]);
      if (!m) return '';
      // Field markers arrive entity-escaped (&amp;C for the center section):
      // unescape first, then split sections and substitute page fields.
      const body = m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      const sec = re => { const mm = re.exec(body); return mm ? mm[1] : ''; };
      const text = sec(/&C(.*?)(?=&[LR]|$)/s) || sec(/&L(.*?)(?=&[LR]|$)/s) || sec(/&R(.*?)(?=&[LR]|$)/s) || (/&[LR]/.test(body) ? '' : body);
      return text.replace(/&P/g, '1').replace(/&N/g, '1').replace(/&"[^"]*"/g, '').replace(/&\d+/g, '').trim();
    };
    return { header: grab('oddHeader'), footer: grab('oddFooter') };
  } catch { return {}; }
}

async function xlsxToSections(buf) {
  const wb = XLSX.read(buf, { type: 'array', cellFormula: true, sheetStubs: true });
  const parts = [];
  for (let si = 0; si < wb.SheetNames.length; si++) {
    const name = wb.SheetNames[si];
    const ws = wb.Sheets[name];
    if (!ws || !ws['!ref']) continue;
    // Print area: a defined name _xlnm.Print_Area scoped to this sheet.
    let range = null;
    for (const dn of (wb.Workbook && wb.Workbook.Names) || []) {
      if (dn.Sheet === si && /Print_Area/.test(dn.Name)) { range = parseRangeRef(dn.Ref); break; }
    }
    if (!range) {
      const full = parseRangeRef(ws['!ref']);
      if (!full) continue;
      range = full;
    }
    const ev = makeEvaluator(ws);
    const merges = (ws['!merges'] || []).filter(m => m.s.r <= range.e.r && m.e.r >= range.s.r && m.s.c <= range.e.c && m.e.c >= range.s.c);
    const covered = new Set();
    const spanAt = new Map();
    for (const m of merges) {
      spanAt.set(`${m.s.r},${m.s.c}`, { rs: m.e.r - m.s.r + 1, cs: m.e.c - m.s.c + 1 });
      for (let r = m.s.r; r <= m.e.r; r++) for (let c = m.s.c; c <= m.e.c; c++) if (r !== m.s.r || c !== m.s.c) covered.add(`${r},${c}`);
    }
    const rows = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
      const cells = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        if (covered.has(`${r},${c}`)) continue;
        const sp = spanAt.get(`${r},${c}`);
        const text = cellText(ws, ev, idxToCol(c) + (r + 1));
        const attrs = sp ? `${sp.cs > 1 ? ` colspan="${sp.cs}"` : ''}${sp.rs > 1 ? ` rowspan="${sp.rs}"` : ''}` : '';
        cells.push(`<td${attrs} style="padding:1pt 6pt 1pt 0;">${escHtml(text)}</td>`);
      }
      rows.push('<tr>' + cells.join('') + '</tr>');
    }
    const hf = await readHeaderFooter(buf, si);
    const head = hf.header ? `<p style="text-align:center;font-size:9pt;color:#444;">${escHtml(hf.header)}</p>` : '';
    const foot = hf.footer ? `<p style="text-align:center;font-size:9pt;color:#444;">${escHtml(hf.footer)}</p>` : '';
    parts.push(`${head}<h2 style="font-size:14pt;">${escHtml(name)}</h2><table style="font-size:10pt;">${rows.join('')}</table>${foot}`);
  }
  if (!parts.length) throw new Error('The workbook has no sheets with content.');
  return `<section class="docx" style="width:732pt;min-height:540pt;padding:36pt;box-sizing:border-box;"><div class="docx-wrapper">${parts.join('')}</div></section>`;
}

window.convertXlsx = async (buf) => {
  await injectFonts();
  const container = document.getElementById('container');
  container.innerHTML = await xlsxToSections(buf);
  await document.fonts.ready;
  const fontFiles = await loadFontBytes();
  const painter = new Painter(fontFiles);
  const bytes = await painter.paint(container, { Title: 'converted' });
  window.__warnings = painter.warnings;
  return bytes;
};
/* Isolation: the shared office-engine service worker scopes this page's
   network access to its own allowlisted files (no document leaves the
   device, enforced here as well as promised in the copy). The page works
   without it (file:// and SW-less browsers), so registration is best-effort
   and never blocks conversion. */
const isolationReady = (async () => {
  try {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.register('../isolation-sw.js', { scope: './' });
    if (reg.active) return;
    await new Promise((resolve) => {
      const done = () => (reg.active ? resolve() : undefined);
      reg.addEventListener('updatefound', () => {
        reg.installing?.addEventListener('statechange', () => { if (reg.active) resolve(); });
      });
      done();
      setTimeout(resolve, 3000);
    });
  } catch { /* best effort: conversion must not fail because isolation did */ }
})();

/* ---- Converter window protocol (same channel contract as the WASM engine) ---- */
const status = document.getElementById('status');
const token = location.hash.slice(1);
if (!/^[a-f0-9]{64}$/.test(token)) throw Error('Missing conversion session');
const channel = new BroadcastChannel('deepak-office-' + token);
let started = false, finished = false, phaseTimer;
const phase = (message, timeout = 45000) => {
  if (status) status.textContent = message;
  clearTimeout(phaseTimer);
  phaseTimer = setTimeout(() => fail('The local converter stopped responding. Close this window and try again.'), timeout);
};
window.addEventListener('pagehide', () => { try { channel.postMessage({ type: 'cancelled' }); } catch {} });
const fail = message => {
  if (finished) return;
  finished = true;
  clearTimeout(phaseTimer); clearInterval(ready);
  if (status) status.textContent = message;
  channel.postMessage({ type: 'failed', message });
};
window.addEventListener('error', () => fail('The local converter could not start. Your original document has not changed.'));
window.addEventListener('unhandledrejection', () => fail('The local converter could not start. Your original document has not changed.'));

channel.onmessage = async ({ data }) => {
  if (data?.type === 'cancel') { finished = true; clearTimeout(phaseTimer); channel.close(); window.close(); return; }
  if (data?.type === 'received') { finished = true; clearTimeout(phaseTimer); channel.close(); window.close(); return; }
  if (started || data?.type !== 'convert' || !(data.bytes instanceof ArrayBuffer) || !['docx', 'xlsx'].includes(data.extension) || data.bytes.byteLength > 100 * 1024 * 1024) return;
  started = true; clearInterval(ready); clearTimeout(orphan);
  try {
    phase('Converting your document locally...', 120000);
    // Fonts load over the network next; wait for the isolation worker so
    // those fetches are covered too. Best-effort, never fatal.
    await isolationReady;
    const bytes = data.extension === 'docx'
      ? await window.convertDocx(new Uint8Array(data.bytes))
      : await window.convertXlsx(new Uint8Array(data.bytes));
    if (finished) return;
    clearTimeout(phaseTimer);
    finished = true;
    const out = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    channel.postMessage({ type: 'converted', engine: 'painter', bytes: out.slice().buffer });
    if (status) status.textContent = 'Done. The PDF is returning to the original window.';
    setTimeout(() => { channel.close(); window.close(); }, 5000);
  } catch (e) {
    fail(e && e.message ? 'The document could not be converted: ' + e.message : 'The document could not be converted.');
  }
};
const orphan = setTimeout(() => { channel.close(); window.close(); }, 300000);
const ready = setInterval(() => channel.postMessage({ type: 'ready' }), 500);
