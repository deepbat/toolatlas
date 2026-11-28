// DOM-to-PDF painter for docx-preview output.
// Paints rendered DOM into a vector PDF: exact text extraction is guaranteed
// by wrapping every line's glyphs in /Span<</ActualText ...>> marked content.
// Glyph positions come from DOM measurement; glyph shapes from fontkit using
// the same TTF files the browser used for layout.
import PDFDocument from 'pdfkit';
import type { PainterFontFiles, PainterMeta } from './officePainterTypes';
import { zlibSync } from 'fflate';

export const PX2PT: number = 72 / 96;
const SCRIPT_FONTS: { re: RegExp; key: string }[] = [
  { re: /[\u0900-\u097F]/, key: 'noto-devanagari' },
  { re: /[\u0A00-\u0A7F]/, key: 'noto-gurmukhi' },
];

export class Painter {
  fontFiles: PainterFontFiles;
  embedded = new Map<string, any>();
  warnings: string[] = [];
  doc: any;
  uniFont: any;
  pageBase = 0;
  scale = 1;
  cids: any;
  curPage: any;
  forcePage: any;
  order: any;
  ref: any;
  sec: any;
  shiftPx: any;

  constructor(fontFiles: any) {
    this.fontFiles = fontFiles; // key -> {regular|bold|italic|boldItalic: {bytes, fk}}
    this.embedded = new Map();  // 'key|variant' -> EmbeddedFont
    this.warnings = [];
  }

  pickFontKey(cssFamily: any, scriptFontKey: any) {
    if (scriptFontKey && scriptFontKey !== 'latin') return scriptFontKey;
    const f = (cssFamily || '').toLowerCase();
    if (/calibri|carlito/.test(f)) return 'carlito';
    if (/cambria|caladea/.test(f)) return 'caladea';
    if (/serif/.test(f) && !/sans/.test(f)) return 'noto-serif';
    return 'noto-sans';
  }

  variantOf(cs: any) {
    const w = parseInt(cs.fontWeight, 10);
    const bold = (Number.isFinite(w) && w >= 600) || cs.fontWeight === 'bold';
    const italic = cs.fontStyle === 'italic' || cs.fontStyle === 'oblique';
    return bold && italic ? 'boldItalic' : bold ? 'bold' : italic ? 'italic' : 'regular';
  }

  selectFont(key: any, variant: any) {
    const set = this.fontFiles[key]!;
    if (!set || !set.regular) throw new Error(`no bundled font for ${key}`);
    let v = variant;
    if (!set[v]) { this.warnings.push(`missing ${key}/${variant}; using regular`); v = 'regular'; }
    const id = key + '|' + v;
    let ef = this.embedded.get(id);
    if (!ef) {
      this.doc.font(set[v]!.bytes);
      ef = this.doc._font;
      this.embedded.set(id, ef);
    }
    this.doc._font = ef;
    if (this.doc.page.fonts[ef.id] == null) this.doc.page.fonts[ef.id] = ef.ref();
    return ef;
  }

  async paint(container: any, meta: any = {}) {
    this.doc = new PDFDocument({ autoFirstPage: false, bufferPages: true, margin: 0, info: meta, font: null });
    this.uniFont = null;
    const chunks: Uint8Array[] = [];
    this.doc.on('data', (c: Uint8Array) => chunks.push(c));
    const done = new Promise(r => this.doc.on('end', r));
    const sections = container.querySelectorAll('section.docx');
    if (!sections.length) throw new Error('no rendered sections found');
    this.pageBase = 0;
    for (const section of sections) {
      const sr = section.getBoundingClientRect();
      // Page geometry comes from the section's inline style: docx-preview
      // pins width and min-height to the DOCX page size. A section taller
      // than one page (documents never saved by Word, so without rendered
      // page-break hints) is paginated here, and header/footer subtrees
      // repeat on every page.
      const style = section.getAttribute('style') || '';
      const wPt = parseFloat((style.match(/width:\s*([\d.]+)pt/) || [])[1]);
      const hPt = parseFloat((style.match(/min-height:\s*([\d.]+)pt/) || [])[1]);
      const pageWPx = Number.isFinite(wPt) ? wPt * 96 / 72 : sr.width;
      const pageHPx = Number.isFinite(hPt) ? hPt * 96 / 72 : sr.height;
      // Count pages by content extent, not the section's border-box: the
      // section carries min-height = one page plus vertical padding, which
      // would otherwise invent a trailing blank page.
      let maxBottom = 0;
      const extentWalker = document.createTreeWalker(section, NodeFilter.SHOW_ELEMENT);
      let ext: Node | null;
      while ((ext = extentWalker.nextNode())) {
        const elx = ext as HTMLElement;
        if (elx.closest('header, footer')) continue;
        const b = elx.getBoundingClientRect().bottom;
        if (b > maxBottom) maxBottom = b;
      }
      const nPages = Math.max(1, Math.ceil(Math.max(maxBottom - sr.top, 1) / pageHPx - 1e-6));
      for (let p = 0; p < nPages; p++) {
        this.doc.addPage({ size: [+(pageWPx * PX2PT).toFixed(2), +(pageHPx * PX2PT).toFixed(2)], margin: 0 });
      }
      this.sec = { left: sr.left, top: sr.top, hPx: sr.height, pageHPx, nPages, base: this.pageBase };
      this.pageBase += nPages;
      this.forcePage = null; this.shiftPx = 0;
      for (const hf of section.querySelectorAll(':scope > header, :scope > footer')) {
        const isFooter = hf.tagName === 'FOOTER';
        for (let p = 0; p < nPages; p++) {
          this.forcePage = p;
          this.shiftPx = isFooter ? (sr.height - pageHPx) : 0;
          this.paintDecorations(hf);
          await this.paintImages(hf);
          this.paintText(hf);
        }
        this.forcePage = null; this.shiftPx = 0;
      }
      this.paintDecorations(section);
      await this.paintImages(section);
      this.paintText(section);
    }
    if (this.uniFont) this.uniFont.finish();
    this.doc.end();
    await done;
    const total = chunks.reduce((a, c) => a + c.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
  }

  // Absolute DOM px -> { page, xPt, yPt-on-page }. Honors forcePage/shiftPx
  // used when repeating headers/footers on every page.
  locate(absTop: any) {
    const relPx = absTop - this.sec.top - this.shiftPx;
    const page = this.forcePage != null ? this.forcePage
      : Math.min(this.sec.nPages - 1, Math.max(0, Math.floor(relPx / this.sec.pageHPx)));
    return { page, yPt: (relPx - page * this.sec.pageHPx) * PX2PT };
  }

  switchPage(page: any) {
    if (this.curPage !== page) { this.doc.switchToPage(this.sec.base + page); this.curPage = page; }
  }

  paintDecorations(root: any) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let eln: Node | null;
    while ((eln = walker.nextNode())) {
      const el = eln as HTMLElement;
      // Header/footer subtrees are painted by the repeat pass, not here.
      const hf = el.closest('header, footer');
      if (hf && hf !== root) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const bg = cs.backgroundColor;
      const hasBg = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
      const borders: Record<string, { bw: number; col: number[] }> = {};
      for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
        const bw = parseFloat((cs as any)['border' + side + 'Width']);
        const bs = (cs as any)['border' + side + 'Style'];
        if (bw && bs !== 'none' && bs !== 'hidden') borders[side] = { bw, col: rgbOf((cs as any)['border' + side + 'Color']) };
      }
      if (!hasBg && !Object.keys(borders).length) continue;
      const relTop = rect.top - this.sec.top - this.shiftPx;
      const relBot = relTop + rect.height;
      const pages = this.forcePage != null ? [this.forcePage] : (() => {
        const p0 = Math.max(0, Math.floor(relTop / this.sec.pageHPx));
        const p1 = Math.min(this.sec.nPages - 1, Math.floor((relBot - 1e-6) / this.sec.pageHPx));
        const out = []; for (let p = p0; p <= p1; p++) out.push(p); return out;
      })();
      const xPt = (rect.left - this.sec.left) * PX2PT;
      const wPt = rect.width * PX2PT;
      for (const p of pages) {
        const sliceTop = Math.max(relTop, p * this.sec.pageHPx);
        const sliceBot = Math.min(relBot, (p + 1) * this.sec.pageHPx);
        if (sliceBot - sliceTop <= 0.5) continue;
        this.switchPage(p);
        const yPt = (sliceTop - p * this.sec.pageHPx) * PX2PT;
        const hPt = (sliceBot - sliceTop) * PX2PT;
        if (hasBg) {
          this.doc.save().fillColor([rgbOf(bg)[0] * 255, rgbOf(bg)[1] * 255, rgbOf(bg)[2] * 255]).rect(xPt, yPt, wPt, hPt).fill().restore();
        }
        for (const [side, { bw, col }] of Object.entries(borders) as [string, { bw: number; col: number[] }][]) {
          // Top/bottom borders only on the slice containing that edge;
          // left/right borders run on every slice.
          if (side === 'Top' && sliceTop !== relTop) continue;
          if (side === 'Bottom' && sliceBot !== relBot) continue;
          this.doc.save().lineWidth(Math.max(bw * PX2PT, 0.25)).strokeColor([col[0] * 255, col[1] * 255, col[2] * 255]);
          const off = (bw * PX2PT) / 2;
          if (side === 'Top') this.doc.moveTo(xPt, yPt + off).lineTo(xPt + wPt, yPt + off).stroke();
          if (side === 'Bottom') this.doc.moveTo(xPt, yPt + hPt - off).lineTo(xPt + wPt, yPt + hPt - off).stroke();
          if (side === 'Left') this.doc.moveTo(xPt + off, yPt).lineTo(xPt + off, yPt + hPt).stroke();
          if (side === 'Right') this.doc.moveTo(xPt + wPt - off, yPt).lineTo(xPt + wPt - off, yPt + hPt).stroke();
          this.doc.restore();
        }
      }
    }
  }

  async paintImages(root: any) {
    for (const img of root.querySelectorAll('img')) {
      const hf = img.closest('header, footer');
      if (hf && hf !== root) continue;
      const rect = img.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      try {
        const res = await fetch(img.src);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes.length < 8) throw new Error('empty image');
        const relTop = rect.top - this.sec.top - this.shiftPx;
        const relBot = relTop + rect.height;
        const pages = this.forcePage != null ? [this.forcePage] : (() => {
          const p0 = Math.max(0, Math.floor(relTop / this.sec.pageHPx));
          const p1 = Math.min(this.sec.nPages - 1, Math.floor((relBot - 1e-6) / this.sec.pageHPx));
          const out = []; for (let p = p0; p <= p1; p++) out.push(p); return out;
        })();
        const xPt = (rect.left - this.sec.left) * PX2PT;
        for (const p of pages) {
          const sliceTop = Math.max(relTop, p * this.sec.pageHPx);
          const sliceBot = Math.min(relBot, (p + 1) * this.sec.pageHPx);
          if (sliceBot - sliceTop <= 0.5) continue;
          this.switchPage(p);
          // clip to the page slice, draw the whole image at its page offset
          this.doc.save();
          this.doc.rect(xPt, (sliceTop - p * this.sec.pageHPx) * PX2PT, rect.width * PX2PT, (sliceBot - sliceTop) * PX2PT).clip();
          this.doc.image(bytes, xPt, (relTop - p * this.sec.pageHPx) * PX2PT, { width: rect.width * PX2PT, height: rect.height * PX2PT });
          this.doc.restore();
        }
      } catch (e) {
        this.warnings.push('image skipped: ' + (e as Error).message);
      }
    }
  }

  paintText(root: any) {
    const measurer = makeMeasurer();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue;
      if (!text || !text.trim()) continue;
      const parent = node.parentElement;
      if (!parent || !root.contains(parent)) continue;
      const hf = parent.closest('header, footer');
      if (hf && hf !== root) continue;
      const cs = getComputedStyle(parent);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      for (const line of lineBoxes(node)) {
        const loc = this.locate(line.top);
        this.switchPage(loc.page);
        this.paintLine(node, line, cs, measurer, loc);
      }
    }
  }

  paintLine(node: any, line: any, cs: any, measurer: any, loc: any) {
    const sizePx = parseFloat(cs.fontSize);
    const size = sizePx * PX2PT;
    const [cr, cg, cb] = rgbOf(cs.color || 'rgb(0, 0, 0)');
    const fontCSS = `${cs.fontStyle} normal ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const ascentPx = measurer(fontCSS, line.text);
    const baseY = loc.yPt + ascentPx * PX2PT;
    const lineLeftPx = line.left - this.sec.left;

    // char index (within line.text) -> grapheme cluster left in px (absolute DOM)
    const cLeft = clusterLefts(node, line.start, line.text);
    // char index -> grapheme cluster id
    const cClust = clusterIds(line.text);

    const ops = ['BT', `/Span << /ActualText ${pdfString(line.text)} >> BDC`, `${cr} ${cg} ${cb} rg`];
    let curFontId = null, curX = null;
    let segCharBase = 0;

    for (const seg of splitScripts(line.text)) {
      const scriptKey = seg.script ? SCRIPT_FONTS.find(s => s.key === seg.script)?.key || null : null;
      const key = this.pickFontKey(cs.fontFamily, seg.script);
      const ef = this.selectFont(key, this.variantOf(cs));
      const run = ef.layoutRun(seg.text);
      const glyphs = run.glyphs, positions = run.positions;
      const n = glyphs.length;
      if (!n) { segCharBase += [...seg.text].length; continue; }

      // glyph -> char index of its first code point within segment (tiling match)
      const segCps = [...seg.text].map(c => c.codePointAt(0));
      const usedC = new Array(segCps.length).fill(false);
      const gChar = glyphs.map((gl: any) => {
        const gcp = gl.codePoints;
        for (let s = 0; s + gcp.length <= segCps.length; s++) {
          if (usedC[s]) continue;
          let ok = true;
          for (let k = 0; k < gcp.length; k++) if (usedC[s + k] || segCps[s + k] !== gcp[k]) { ok = false; break; }
          if (ok) { for (let k = 0; k < gcp.length; k++) usedC[s + k] = true; return s; }
        }
        throw new Error('glyph span not found: ' + JSON.stringify(gl.codePoints));
      });
      // glyph -> grapheme cluster id (absolute within line)
      const gCluster = gChar.map((ci: number) => cClust[segCharBase + ci]);
      // intra-cluster advance: cumulative advances of preceding same-cluster glyphs
      const intra = new Array(n).fill(0);
      for (let i = 1; i < n; i++) {
        if (gCluster[i] === gCluster[i - 1]) intra[i] = intra[i - 1] + positions[i - 1].xAdvance;
      }
      // Register glyphs in the subset with correct ToUnicode + widths.
      const hexes = new Array(n);
      for (let i = 0; i < n; i++) {
        const gid = ef.subset.includeGlyph(glyphs[i].id);
        if (ef.widths[gid] == null) ef.widths[gid] = glyphs[i].advanceWidth * ef.scale;
        if (ef.unicode[gid] == null) ef.unicode[gid] = glyphs[i].codePoints;
        hexes[i] = ('0000' + gid.toString(16)).slice(-4);
      }
      const absXPt = new Array(n);
      for (let i = 0; i < n; i++) {
        const lineCharIdx = segCharBase + gChar[i];
        const clusterLeftPx = cLeft[lineCharIdx] - this.sec.left;
        absXPt[i] = (clusterLeftPx + (intra[i] + positions[i].xOffset) * (sizePx / 1000)) * PX2PT;
      }
      const logicalOrder = [...Array(n).keys()].sort((a, b) => gChar[a] - gChar[b]);
      const reordered = logicalOrder.some((v, idx) => v !== idx);
      // Indic runs always take the vector-path + invisible-layer route, even
      // when shaping kept logical order: extraction from a shaped subset is
      // not stable across readers (fake spaces, split words), while the
      // exact-text layer is exact by construction.
      const isIndic = SCRIPT_FONTS.some((sf) => sf.key === seg.script);
      if (!reordered && !isIndic) {
        // Normal visible text: visual order is logical order.
        if (curFontId !== ef.id) { ops.push(`/${ef.id} ${size.toFixed(3)} Tf`); curFontId = ef.id; curX = null; }
        for (let i = 0; i < n; i++) {
          const xPt = absXPt[i];
          if (curX === null) ops.push(`1 0 0 -1 ${xPt.toFixed(3)} ${baseY.toFixed(3)} Tm <${hexes[i]}> Tj`);
          else ops.push(`${(xPt - curX).toFixed(3)} 0 Td <${hexes[i]}> Tj`);
          curX = xPt;
        }
      } else {
        // Reordered script (e.g. Indic matras): draw visible glyphs as vector
        // paths, and add an invisible (Tr 3) logical-order text layer with
        // monotonic zero-advance positions so PDF.js, Poppler and MuPDF all
        // extract the exact source string.
        for (let i = 0; i < n; i++) {
          const glyph = glyphs[i];
          const svg = glyph.path.toSVG();
          if (!svg || !svg.trim()) continue; // space-like glyphs have no outline
          const s = size / ef.font.unitsPerEm;
          const xOff = positions[i].xOffset * (size / 1000);
          const yOff = positions[i].yOffset * (size / 1000);
          this.doc.save()
            .translate(absXPt[i] + xOff, baseY - yOff)
            .scale(s, -s)
            .path(svg)
            .fill([cr * 255, cg * 255, cb * 255])
            .restore();
        }
        // invisible exact-text layer: blank composite font, one CID per code
        // point, exact ToUnicode. No shaping in this layer, so no reader can
        // reorder it; spaces are real characters with real advance.
        if (!this.uniFont) this.uniFont = new BlankUnicodeFont(this.doc);
        if (this.doc.page.fonts['FUni'] == null) this.doc.page.fonts['FUni'] = this.uniFont.ref;
        const segLeftPt = (cLeft[segCharBase] - this.sec.left) * PX2PT;
        const uniHex = this.uniFont.encode(seg.text);
        // Base characters advance 1000 units in the blank font and combining
        // marks zero; fit the run to the painted segment box with Tz (same
        // trick as unicodeLayer.ts) or readers invent spaces and split words
        // at larger sizes.
        const segCpsAll = [...seg.text].map((c) => c.codePointAt(0));
        const advCount = Math.max(1, segCpsAll.filter((cp) => !zeroAdvanceCp(cp) && !(cp < 0x20 && cp !== 0x09) && cp !== 0x7f).length);
        const segLen = segCpsAll.length;
        const segEndChar = segCharBase + segLen;
        const lastG = n - 1;
        const lastRightPx = cLeft[segCharBase + gChar[lastG]] + (intra[lastG] + positions[lastG].xOffset + positions[lastG].xAdvance) * (sizePx / 1000);
        const segRightPx = segEndChar < cLeft.length ? cLeft[segEndChar] : lastRightPx;
        const segWidthPt = Math.max(0.5, (segRightPx - cLeft[segCharBase]) * PX2PT);
        const tz = Math.max(1, Math.min(10000, (segWidthPt / (advCount * size)) * 100));
        ops.push(`/FUni ${size.toFixed(3)} Tf`, '3 Tr', `${tz.toFixed(2)} Tz`);
        ops.push(`1 0 0 -1 ${segLeftPt.toFixed(3)} ${baseY.toFixed(3)} Tm <${uniHex}> Tj`);
        ops.push('100 Tz', '0 Tr');
        curFontId = 'FUni'; curX = segLeftPt;
      }
      segCharBase += [...seg.text].length;
    }
    ops.push('EMC', 'ET');
    this.doc.addContent(ops.join('\n'));
  }
}


// ---- Blank Unicode font for invisible exact-text layers ----
// Ported from src/tools/pdfsuite/unicodeLayer.ts (fixture-proven there).
// Each Unicode code point gets its own CID with an exact ToUnicode entry;
// blank outlines, render mode 3. No shaping means nothing can reorder.
const BLANK_FONT_B64 = 'AAEAAAAKAIAAAwAgT1MvMkVhSIUAAAEoAAAAYGNtYXAF0v3eAAABlAAAADxnbHlmAAAAAAAAAdgAAAABaGVhZFdhoeAAAACsAAAANmhoZWEDIgMkAAAA5AAAACRobXR4B9AAAAAAAYgAAAAMbG9jYQAAAAAAAAHQAAAACG1heHAABAACAAABCAAAACBuYW1lAoNfFQAAAdwAAADAcG9zdGqgMgUAAAKcAAAALgABAAAAAQAAcDmjEF8PPPUAAwPoAAAAAHwlsIAAAAAAfCWwgAAAAAAAAAAAAAAAAwACAAAAAAAAAAEAAAMg/zgAAAPoAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAADAAEAAAADAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAwPoAZAABQAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABBAAAAAAAAAAAAAAAAPz8/PwAAAEEDAQMg/zgAAAMgAMgAAAAAAAAAAAAAAAAAAAAgAAAD6AAAA+gAAAAAAAAAAAACAAAAAwAAABQAAwABAAAAFAAEACgAAAAGAAQAAQACAEEDAf//AAAAQQMB////wP0BAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAH4AAQAAAAAAAQAPAAAAAQAAAAAAAgAHAA8AAQAAAAAAAwAPAAAAAQAAAAAABAAPAAAAAQAAAAAABgAPAAAAAwABBAkAAQAeABYAAwABBAkAAgAOADQAAwABBAkAAwAeABYAAwABBAkABAAeABYAAwABBAkABgAeABZEZWVwYWtJbnZpc2libGVSZWd1bGFyAEQAZQBlAHAAYQBrAEkAbgB2AGkAcwBpAGIAbABlAFIAZQBnAHUAbABhAHIAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAABAgEDAmcxAmcyAAA=';
const zeroAdvanceCp = (cp: number) => /[\p{Mn}\p{Cf}]/u.test(String.fromCodePoint(cp));
const hex4u = (n: number) => n.toString(16).toUpperCase().padStart(4, '0');
function utf16HexCp(cp: any) {
  if (cp < 0x10000) return hex4u(cp);
  const v = cp - 0x10000;
  return hex4u(0xd800 + (v >> 10)) + hex4u(0xdc00 + (v & 0x3ff));
}
function b64ToBytes(b64: any) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

class BlankUnicodeFont {
  doc: any;
  cids = new Map<number, number>();
  order: number[] = [];
  ref: any;
  constructor(doc: any) {
    this.doc = doc;
    this.cids = new Map();
    this.order = [];
    this.ref = doc.ref(); // assigned in finish()
  }
  encode(text: any) {
    let hex = '';
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      if ((cp < 0x20 && cp !== 0x09) || cp === 0x7f) continue;
      let id = this.cids.get(cp);
      if (id === undefined) { id = this.order.length + 1; this.cids.set(cp, id); this.order.push(cp); }
      hex += hex4u(id);
    }
    return hex;
  }
  finish() {
    const doc = this.doc;
    const parts = [];
    for (let i = 0; i < this.order.length; i += 100) {
      const chunk = this.order.slice(i, i + 100);
      parts.push(`${chunk.length} beginbfchar\n${chunk.map((cp, k) => `<${hex4u(i + k + 1)}> <${utf16HexCp(cp)}>`).join('\n')}\nendbfchar`);
    }
    const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${parts.join('\n')}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
    const toUni = doc.ref(); toUni.write(cmap); toUni.end();
    const fontBytes = b64ToBytes(BLANK_FONT_B64);
    const compressed = zlibSync(fontBytes);
    const fontFile = doc.ref({ Filter: 'FlateDecode', Length1: fontBytes.length });
    fontFile.write(compressed); fontFile.end();
    const glyphMap = new Uint8Array((this.order.length + 1) * 2);
    this.order.forEach((cp, i) => { glyphMap[(i + 1) * 2 + 1] = zeroAdvanceCp(cp) ? 2 : 1; });
    const glyphMapRef = doc.ref({ Filter: 'FlateDecode' });
    glyphMapRef.write(zlibSync(glyphMap)); glyphMapRef.end();
    const desc = doc.ref({
      Type: 'FontDescriptor', FontName: 'DeepakInvisible', FontFile2: fontFile,
      Flags: 4, FontBBox: [0, -200, 1000, 800], ItalicAngle: 0, Ascent: 800, Descent: -200, CapHeight: 700, StemV: 80,
    });
    desc.end();
    const sysInfo = doc.ref({ Registry: new String('Adobe'), Ordering: new String('Identity'), Supplement: 0 }); sysInfo.end();
    const cid = doc.ref({
      Type: 'Font', Subtype: 'CIDFontType2', BaseFont: 'DeepakInvisible', CIDSystemInfo: sysInfo,
      FontDescriptor: desc, DW: 1000,
      W: this.order.flatMap((cp, i) => zeroAdvanceCp(cp) ? [i + 1, [0]] : []),
      CIDToGIDMap: glyphMapRef,
    });
    cid.end();
    this.ref.data = {
      Type: 'Font', Subtype: 'Type0', BaseFont: 'DeepakInvisible', Encoding: 'Identity-H',
      DescendantFonts: [cid], ToUnicode: toUni,
    };
    this.ref.end();
  }
}

// ---- helpers ----

function rgbOf(css: any) {
  const m = String(css).match(/rgba?\(([^)]+)\)/);
  if (m) { const p = m[1].split(',').map(x => parseFloat(x)); return [p[0] / 255, p[1] / 255, p[2] / 255].map(v => +v.toFixed(4)); }
  const h = String(css).replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map(v => +v.toFixed(4));
}

function pdfString(s: any) {
  const bytes = [0xFE, 0xFF];
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp > 0xFFFF) { const u = cp - 0x10000; bytes.push(0xD8 | (u >> 18), (u >> 10) & 255, 0xDC | ((u >> 8) & 3), u & 255); }
    else bytes.push(cp >> 8, cp & 255);
  }
  return '<' + bytes.map(b => b.toString(16).padStart(2, '0')).join('') + '>';
}

function splitScripts(text: any) {
  const segs = [];
  let cur = null;
  for (const ch of text) {
    let script = null;
    for (const s of SCRIPT_FONTS) if (s.re.test(ch)) { script = s.key; break; }
    // Latin letters always break back to a Latin segment: the Google Fonts
    // Noto script faces carry no Latin glyphs, so inheriting the Indic kind
    // across them paints tofu. Only spaces, digits and neutral punctuation
    // stay with the surrounding segment so word gaps and numbers inside
    // Indic text live in the same invisible text layer.
    if (!script && /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/.test(ch)) script = 'latin';
    const kind: string = script || (cur ? cur.kind : 'latin');
    if (cur && cur.kind === kind) cur.text += ch;
    else { cur = { kind, script, text: ch }; segs.push(cur); }
  }
  return segs;
}

const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('und', { granularity: 'grapheme' }) : null;

function clusterIds(text: any) {
  const ids = new Array([...text].length);
  if (!segmenter) { for (let i = 0; i < ids.length; i++) ids[i] = i; return ids; }
  // map code-point index (as used by [...text]) — build char offset table
  const cps = [...text];
  const utf16ToCp = new Array(text.length);
  let cp = 0;
  for (let i = 0; i < text.length; i++) { utf16ToCp[i] = cp; if (text.charCodeAt(i) >= 0xD800 && text.charCodeAt(i) < 0xDC00) i++, utf16ToCp[i] = cp; cp++; }
  let cid = 0;
  for (const { index } of segmenter.segment(text)) {
    const cpStart = utf16ToCp[index];
    ids.fill(cid, cpStart); // placeholder; corrected below
    cid++;
  }
  // robust: recompute properly
  cid = 0;
  let prevCp = 0;
  const bounds = [];
  for (const { index } of segmenter.segment(text)) bounds.push(utf16ToCp[index]);
  bounds.push(cps.length);
  const out = new Array(cps.length);
  for (let b = 0; b < bounds.length - 1; b++) for (let i = bounds[b]; i < bounds[b + 1]; i++) out[i] = b;
  return out;
}

function clusterLefts(node: any, lineStart: any, lineText: any) {
  const range = document.createRange();
  const lefts = new Array([...lineText].length);
  const cps = [...lineText];
  const ids = clusterIds(lineText);
  // utf16 offsets for cp indices
  const cpToUtf16 = [];
  {
    let cp = 0;
    for (let i = 0; i < lineText.length && cp < cps.length; i++) {
      cpToUtf16[cp] = i;
      if (lineText.charCodeAt(i) >= 0xD800 && lineText.charCodeAt(i) < 0xDC00) i++;
      cp++;
    }
  }
  let i = 0;
  while (i < cps.length) {
    const cid = ids[i];
    let j = i;
    while (j < cps.length && ids[j] === cid) j++;
    range.setStart(node, lineStart + cpToUtf16[i]);
    range.setEnd(node, lineStart + (cpToUtf16[j - 1] + (lineText.length > cpToUtf16[j - 1] && lineText.charCodeAt(cpToUtf16[j - 1]) >= 0xD800 && lineText.charCodeAt(cpToUtf16[j - 1]) < 0xDC00 ? 2 : 1)));
    const left = range.getBoundingClientRect().left;
    for (let k = i; k < j; k++) lefts[k] = left;
    i = j;
  }
  return lefts;
}

function lineBoxes(node: any) {
  const text = node.nodeValue;
  const range = document.createRange();
  const lines = [];
  let cur = null;
  for (let i = 0; i < text.length; i++) {
    range.setStart(node, i);
    range.setEnd(node, i + 1);
    const r = range.getBoundingClientRect();
    if (!cur) { cur = { start: i, end: i + 1, top: r.top, left: r.left, bottom: r.bottom }; lines.push(cur); continue; }
    if (r.width === 0 || Math.abs(r.top - cur.top) <= 1) {
      cur.end = i + 1;
      cur.bottom = Math.max(cur.bottom, r.bottom);
    } else {
      cur = { start: i, end: i + 1, top: r.top, left: r.left, bottom: r.bottom };
      lines.push(cur);
    }
  }
  return lines
    .filter(l => text.slice(l.start, l.end).trim())
    .map(l => ({ start: l.start, end: l.end, text: text.slice(l.start, l.end), left: l.left, top: l.top, bottom: l.bottom }));
}

function makeMeasurer(): (fontCSS: string, text: string) => number {
  const ctx = document.createElement('canvas').getContext('2d')!;
  return (fontCSS: string, text: string) => {
    ctx.font = fontCSS;
    const m = ctx.measureText(text || 'Mg');
    if (m.fontBoundingBoxAscent) return m.fontBoundingBoxAscent;
    const px = parseFloat((fontCSS.match(/(\d+(?:\.\d+)?)px/) || [0, '16'])[1]);
    return px * 0.8;
  };
}
