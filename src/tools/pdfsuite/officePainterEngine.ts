// On-device Office painter engine: turns rendered Office DOM (docx-preview
// sections, or spreadsheet tables) into a vector PDF whose text extracts
// exactly, in every tested reader (poppler, MuPDF, pdf.js), for Latin and
// Indic scripts alike.
//
// The painter (officePainter.ts) draws with the same TTF files the browser
// used for layout; they are bundled under public/office-engine/alt/fonts and
// injected here as @font-face aliases (Calibri -> Carlito and friends) so
// DOM measurement and embedded glyph shapes come from the same files.
import { Painter } from './officePainter';
import type { PainterFontFiles, PainterFontVariant, PainterMeta } from './officePainterTypes';

const FONT_FILES: Record<string, Partial<Record<'regular' | 'bold' | 'italic' | 'boldItalic', string>>> = {
  carlito: { regular: 'Carlito-Regular.ttf', bold: 'Carlito-Bold.ttf', italic: 'Carlito-Italic.ttf', boldItalic: 'Carlito-BoldItalic.ttf' },
  caladea: { regular: 'Caladea-Regular.ttf', bold: 'Caladea-Bold.ttf', italic: 'Caladea-Italic.ttf', boldItalic: 'Caladea-BoldItalic.ttf' },
  tinos: { regular: 'Tinos-Regular.ttf', bold: 'Tinos-Bold.ttf', italic: 'Tinos-Italic.ttf', boldItalic: 'Tinos-BoldItalic.ttf' },
  'noto-serif': { regular: 'NotoSerif-Regular.ttf', bold: 'NotoSerif-Bold.ttf' },
  'noto-sans': { regular: 'NotoSans-Regular.ttf', bold: 'NotoSans-Bold.ttf' },
  'noto-devanagari': { regular: 'NotoSansDevanagari-Regular.ttf', bold: 'NotoSansDevanagari-Bold.ttf' },
  'noto-gurmukhi': { regular: 'NotoSansGurmukhi-Regular.ttf', bold: 'NotoSansGurmukhi-Bold.ttf' },
};

// DOCX family -> the metric-compatible bundled face we inject for it.
const ALIASES: { families: string[]; key: string }[] = [
  { families: ['Calibri'], key: 'carlito' },
  { families: ['Cambria'], key: 'caladea' },
  { families: ['Times New Roman', 'Times'], key: 'tinos' },
];
const INDIC = [
  { range: 'U+0900-097F', key: 'noto-devanagari' },
  { range: 'U+0A00-0A7F', key: 'noto-gurmukhi' },
];
const LATIN_RANGE = 'U+0020-02FF, U+2000-206F, U+20A0-20BF';

function fontBase(): string {
  const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return base + 'office-engine/alt/fonts/';
}

function faceCss(alias: string, variant: string, weight: string, style: string, range: string): string {
  return `@font-face{font-family:'${alias}';src:url('${fontBase()}${variant}');font-weight:${weight};font-style:${style};${range ? `unicode-range:${range};` : ''}}`;
}

let fontsInjected = false;

/** Inject the bundled faces once and wait until they are usable for layout. */
export async function ensurePainterFonts(): Promise<void> {
  if (fontsInjected) return;
  fontsInjected = true;
  const rules: string[] = [];
  for (const a of ALIASES) {
    const set = FONT_FILES[a.key] ?? {};
    for (const fam of a.families) {
      if (set.regular) rules.push(faceCss(fam, set.regular, '400', 'normal', LATIN_RANGE));
      if (set.bold) rules.push(faceCss(fam, set.bold, '700', 'normal', LATIN_RANGE));
      if (set.italic) rules.push(faceCss(fam, set.italic, '400', 'italic', LATIN_RANGE));
      if (set.boldItalic) rules.push(faceCss(fam, set.boldItalic, '700', 'italic', LATIN_RANGE));
      for (const ind of INDIC) {
        const iset = FONT_FILES[ind.key] ?? {};
        if (iset.regular) rules.push(faceCss(fam, iset.regular, '400', 'normal', ind.range));
        if (iset.bold) rules.push(faceCss(fam, iset.bold, '700', 'normal', ind.range));
        if (iset.regular) rules.push(faceCss(fam, iset.regular, '400', 'italic', ind.range));
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

let fontBytesPromise: Promise<PainterFontFiles> | null = null;

function loadPainterFontBytes(): Promise<PainterFontFiles> {
  if (!fontBytesPromise) {
    fontBytesPromise = (async () => {
      const out: PainterFontFiles = {};
      for (const [key, variants] of Object.entries(FONT_FILES)) {
        out[key] = {};
        for (const [v, file] of Object.entries(variants)) {
          const res = await fetch(fontBase() + file);
          if (!res.ok) throw new Error(`The bundled font ${file} could not be loaded (${res.status}).`);
          const variant: PainterFontVariant = { bytes: new Uint8Array(await res.arrayBuffer()), fk: null };
          out[key][v] = variant;
        }
      }
      return out;
    })();
    fontBytesPromise.catch(() => { fontBytesPromise = null; });
  }
  return fontBytesPromise;
}

function cssUnescape(s: string): string {
  return s.replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16))).replace(/\\(.)/g, '$1');
}

// docx-preview renders list markers as ::before pseudo-elements (Symbol-font
// bullets, CSS counters for numbers), which the painter's text walk cannot
// see. Materialize each marker as a real inline span, resolving counters the
// same way docx-preview's stylesheet does (all counters reset at the wrapper,
// one counter per num-id/level class). Symbol-font private-use bullet U+F0B7
// is substituted by U+2022 in the paragraph font, which the bundled fonts
// carry.
function materializeListMarkers(container: HTMLElement): void {
  const counters = new Map<string, number>();
  for (const p of Array.from(container.querySelectorAll<HTMLElement>('p[class*="docx-num-"]'))) {
    const m = p.className.match(/docx-num-(\d+)-(\d+)/);
    if (!m) continue;
    const counterName = `docx-num-${m[1]}-${m[2]}`;
    const val = (counters.get(counterName) || 0) + 1;
    counters.set(counterName, val);
    const content = getComputedStyle(p, '::before').content;
    if (!content || content === 'none' || content === 'normal') continue;
    let marker: string | undefined;
    if (content.includes('counter(')) {
      const suf = (content.match(/counter\([^)]*\)\s*"((?:[^"\\]|\\.)*)"/) || [null, ''])[1];
      marker = String(val) + cssUnescape(suf ?? '');
    } else {
      const lit = (content.match(/^"((?:[^"\\]|\\.)*)"$/) || [null, ''])[1];
      marker = cssUnescape(lit ?? '');
    }
    if (!marker) continue;
    // Tabs shape to .notdef in the bundled fonts (visible tofu box). A nbsp
    // has an empty outline and extracts cleanly; the following text is
    // positioned from DOM measurement, so the narrower gap is harmless.
    marker = marker.replace(/\t/g, '\u00A0');
    // Symbol-font PUA bullet -> standard bullet in the paragraph font.
    const beforeFont = getComputedStyle(p, '::before').fontFamily || '';
    if (/symbol/i.test(beforeFont)) marker = marker.replace(/[\uF000-\uF8FF]/g, '\u2022');
    const span = document.createElement('span');
    span.textContent = marker;
    p.insertBefore(span, p.firstChild);
  }
}

export interface PaintedPdf {
  bytes: Uint8Array;
  warnings: string[];
}

/**
 * Paint already-rendered Office sections (section.docx / section.sheetpage
 * elements, laid out anywhere in this document) into a vector PDF. The
 * sections are moved into an offscreen container for painting and removed
 * with it afterwards; callers keep any markup they captured beforehand.
 */
export async function paintSections(sections: HTMLElement[], meta: PainterMeta = {}): Promise<PaintedPdf> {
  if (!sections.length) throw Error('Nothing to convert: the document rendered no pages.');
  await ensurePainterFonts();
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-100000px;top:0;';
  container.setAttribute('aria-hidden', 'true');
  for (const s of sections) container.appendChild(s);
  document.body.appendChild(container);
  try {
    materializeListMarkers(container);
    const fontFiles = await loadPainterFontBytes();
    const painter = new Painter(fontFiles);
    const bytes = await painter.paint(container, meta);
    return { bytes, warnings: painter.warnings as string[] };
  } finally {
    container.remove();
  }
}
