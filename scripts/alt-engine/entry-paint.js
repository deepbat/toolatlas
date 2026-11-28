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
  return `@font-face{font-family:'${alias}';src:url('/fonts/${variant}');font-weight:${weight};font-style:${style};${range ? `unicode-range:${range};` : ''}}`;
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
      const res = await fetch('/fonts/' + file);
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
  // base64
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(bin);
};
