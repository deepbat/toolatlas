// PDF text-layer to DOCX conversion, built on the in-house ZIP writer: no new
// dependency. The output is honest about fidelity: real editable paragraphs,
// headings and bold/italic runs, text-aligned tables, bordered tables with merged cells (from ruling lines) and pictures drawn as images, but no vector drawings or exact fonts.

import { makeZip } from '../../lib/zip';
import type { GridCell } from './rulings';

export interface TextItem { text: string; size: number; bold: boolean; italic: boolean; y: number; x: number; w?: number; ocr?: boolean }
export interface ParaRun { text: string; bold: boolean; italic: boolean }
export interface DocImage { png: Uint8Array; w: number; h: number } // size in points
export interface Para { pageBreak?: boolean; runs: ParaRun[]; level: 0 | 1 | 2 | 3; table?: string[][]; tableStyle?: { rightColumns: boolean[]; borderless: boolean }; y?: number; image?: DocImage; grid?: { widths: number[]; rows: GridCell[][] } } // 0 = body, 1-3 = heading; table = rebuilt from aligned text columns

/** Split one line into cells where a wide gap separates the fragments. */
function lineCells(line: TextItem[]): { x: number; end: number; text: string }[] {
  const items = [...line].sort((a, b) => a.x - b.x);
  const cells: { x: number; text: string; end: number }[] = [];
  for (const it of items) {
    const end = it.x + (it.w ?? it.text.length * it.size * 0.5);
    const last = cells[cells.length - 1];
    if (last && it.x - last.end <= it.size * 0.6) { last.text += (it.x - last.end > it.size * 0.18 && !last.text.endsWith(' ') ? ' ' : '') + it.text; last.end = end; }
    else cells.push({ x: it.x, text: it.text, end });
  }
  return cells.map((c) => ({ x: c.x, end: c.end, text: c.text.trim() })).filter((c) => c.text);
}

/** True when the rows read as running prose cut into lines (each cell continues in the cell below) rather than independent cells. */
function flowsLikeProse(rows: string[][]): boolean {
  let pairs = 0, flows = 0;
  for (let r = 0; r + 1 < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const a = rows[r][c], b = rows[r + 1][c] ?? '';
      if (a.split(/\s+/).length < 4) continue;
      pairs++;
      if (!/[.!?:;]$/.test(a) && /^[a-z]/.test(b)) flows++;
    }
  }
  return pairs > 0 && flows * 2 >= pairs;
}

/** A narrow borderless numeric table: left-aligned labels, right-aligned numeric body columns.
 * Two complete body rows must independently agree on both edge sets. Header text is kept as-is.
 */
function rightAlignedTable(lines: TextItem[][], start: number): { rows: string[][]; end: number } | null {
  if (lines[start].some(i => i.w === undefined)) return null;
  const header = lineCells(lines[start]);
  if (header.length < 2 || header.length > 8) return null;
  const size = lines[start][0].size, tol = Math.max(3, size * 0.5);
  const numeric = (s: string) => /^[($€£₹+-]?\s*\d[\d,.]*(?:\s*%|\))?$/.test(s);
  if (header.slice(1).some(c => numeric(c.text))) return null; // header must be labels, not an arbitrary data row
  const rows: string[][] = [header.map(c => c.text)];
  let edges: ReturnType<typeof lineCells> | undefined, previousY = lines[start][0].y, end = start + 1;
  for (; end < lines.length; end++) {
    const line = lines[end], cells = lineCells(line), gap = previousY - line[0].y;
    if (line.some(i => i.w === undefined)) break;
    if (Math.abs(line[0].size - size) > 1.5 || gap <= 0 || gap > size * 3 || cells.length !== header.length || !cells.slice(1).every(c => numeric(c.text)) || numeric(cells[0].text)) break;
    if (!edges) {
      if (Math.abs(cells[0].x - header[0].x) > tol || cells.some((c,i) => i > 0 && (header[i].x < cells[i-1].end + size || header[i].end > c.end + tol))) break;
      edges = cells;
    } else if (Math.abs(cells[0].x - edges[0].x) > tol || cells.some((c,i) => i > 0 && Math.abs(c.end - edges![i].end) > tol)) break;
    if (cells.some((c,i) => i > 0 && c.x - cells[i-1].end < size)) break;
    rows.push(cells.map(c => c.text)); previousY = line[0].y;
  }
  return rows.length >= 3 ? { rows, end } : null;
}

/**
 * Find a table starting at lines[start]. The first line gives the column positions. Following lines are assigned to the
 * nearest column on the left; a line that fills only some columns and sits close above or below the previous one is
 * treated as another line of the same row (wrapped or vertically offset cell text). Ruling lines, merged cells and
 * images are not recovered.
 */
function findTable(lines: TextItem[][], start: number): { rows: string[][]; end: number } | null {
  const first = lineCells(lines[start]);
  if (first.length < 2) return null;
  const size = lines[start][0].size;
  const tol = Math.max(3, size * 0.8);
  // Column edges come from the body lines (headers are often centred or right-aligned); fall back to the first line.
  let colX = first.map((c) => c.x);
  for (const K of [6, 4, 3, 2]) {
    const xs: number[] = [];
    for (let k = start + 1; k < Math.min(lines.length, start + 1 + K); k++) { if (Math.abs(lines[k][0].size - size) > 1.5) break; for (const c of lineCells(lines[k])) xs.push(c.x); }
    xs.sort((a, b) => a - b);
    const cl: number[] = [];
    for (const x of xs) { if (cl.length && x - cl[cl.length - 1] <= tol) continue; cl.push(x); }
    if (cl.length === first.length) { colX = cl; break; }
  }
  const place = (cells: { x: number; text: string }[]): (string | undefined)[] | null => {
    const out: (string | undefined)[] = new Array(colX.length).fill(undefined);
    for (const c of cells) {
      let k = -1;
      for (let i = 0; i < colX.length; i++) if (c.x >= colX[i] - tol) k = i;
      if (k < 0 || Math.abs(c.x - colX[k]) > tol) return null; // does not start at a column edge
      out[k] = out[k] === undefined ? c.text : out[k] + ' ' + c.text;
    }
    return out;
  };
  type Grp = { cells: string[]; lastY: number; hasFirst: boolean; full: boolean; cont?: boolean };
  const groups: Grp[] = [];
  let end = start;
  for (; end < lines.length; end++) {
    const ln = lines[end];
    if (Math.abs(ln[0].size - size) > 1.5) break;
    const cells = end === start ? first : lineCells(ln);
    if (cells.length < 1) break;
    const pl = end === start ? first.map((c) => c.text) as (string | undefined)[] : place(cells);
    if (!pl) break;
    const filled = pl.filter((x) => x !== undefined).length;
    const g = groups[groups.length - 1];
    const close = g && Math.abs(g.lastY - ln[0].y) < size * 1.3;
    const startsNew = !g || !close || (filled === colX.length && g.hasFirst) || (pl[0] !== undefined && g.hasFirst);
    if (end === start || startsNew) {
      groups.push({ cells: pl.map((x) => x ?? ''), lastY: ln[0].y, hasFirst: pl[0] !== undefined, full: filled === colX.length });
    } else {
      pl.forEach((x, i) => { if (x !== undefined) g.cells[i] = g.cells[i] ? g.cells[i] + ' ' + x : x; });
      g.hasFirst = g.hasFirst || pl[0] !== undefined; g.lastY = ln[0].y;
    }
  }
  // A first-column cell that spans two rows is usually vertically centred: its line sits between a row without a first cell
  // and the next one. Put its text on the first of the two rows and keep the second as a continuation row.
  for (let i = 1; i + 2 < groups.length + 1; i++) {
    const a = groups[i], b = groups[i + 1], c = groups[i + 2];
    if (!a || !b || !c) break;
    if (!a.hasFirst && b.hasFirst && b.cells.slice(1).every((x) => !x) && !c.hasFirst && b.lastY < a.lastY && b.lastY > c.lastY) {
      a.cells[0] = b.cells[0]; a.hasFirst = true; a.full = a.cells.every((x) => x); c.cont = true;
      groups.splice(i + 1, 1);
    }
  }
  // Trailing rows that are not full-width are ordinary text after the table, not table rows.
  while (groups.length > 1 && groups[groups.length - 1].cells.some((c) => !c) && !groups[groups.length - 1].cont) { groups.pop(); end--; }
  const headerAligned = first.every((c, i) => Math.abs(c.x - colX[i]) <= tol);
  if (groups.length < (headerAligned ? 2 : 3) || !groups[0].full) return null; // an offset header needs two body rows to confirm the columns
  const rows = groups.map((g) => g.cells);
  if (rows.every((r) => /^([•\-–—·*▪◦●]|\(?[0-9a-zA-Z]{1,3}[.)])$/.test(r[0]))) return null; // a list
  if (flowsLikeProse(rows) || rows.flat().some((c) => c.length > 200)) return null;
  return { rows, end };
}

/**
 * Two-column pages: find a vertical gutter that few lines cross, then treat each run of consecutive lines that do not
 * cross it, with prose (6+ words) on both sides for 4+ lines, as a column block read left column first. Lines that
 * cross the gutter stay in normal order. Deliberately strict; anything unclear is laid out as before.
 */
function splitColumns(items: TextItem[]): { items: TextItem[]; cols: number | null }[] | null {
  const real = items.filter((i) => i.text.trim() && i.w !== undefined && i.w > 0);
  if (real.length < 6) return null;
  const sizes = real.map((i) => i.size).sort((a, b) => a - b);
  const body = sizes[Math.floor(sizes.length / 2)] || 12;
  const rows: TextItem[][] = [];
  for (const it of [...real].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last[0].y - it.y) < Math.max(2, it.size * 0.35)) last.push(it); else rows.push([it]);
  }
  const minX = Math.min(...real.map((i) => i.x)), maxX = Math.max(...real.map((i) => i.x + (i.w as number)));
  const bins = Math.max(1, Math.floor((maxX - minX) / 2));
  const cover = new Array(bins).fill(0);
  for (const r of rows) {
    const hit = new Set<number>();
    for (const i of r) for (let x = Math.floor((i.x - minX) / 2); x <= Math.floor((i.x + (i.w as number) - minX) / 2) && x < bins; x++) hit.add(x);
    hit.forEach((x) => cover[x]++);
  }
  const lo = Math.floor(bins * 0.2), hi = Math.ceil(bins * 0.8);
  const cands: { best: number; len: number }[] = [];
  for (let x = lo; x < hi; ) {
    if (cover[x] <= rows.length * 0.5) {
      let e = x; while (e < hi && cover[e] <= rows.length * 0.5) e++;
      if (e - x >= (body * 1.2) / 2) cands.push({ best: x, len: e - x });
      x = e;
    } else x++;
  }
  cands.sort((a, b) => b.len - a.len);
  for (const cand of cands.slice(0, 4)) {
    const segs = trySplit(minX + (cand.best + cand.len / 2) * 2);
    if (segs) return segs;
  }
  return null;
  function trySplit(gx: number): { items: TextItem[]; cols: number | null }[] | null {
  const kind = (r: TextItem[]) => {
    const l = r.filter((i) => i.x + (i.w as number) <= gx + 1), rt = r.filter((i) => i.x >= gx - 1);
    if (l.length + rt.length < r.length) return 'cross';
    const words = (g: TextItem[]) => g.map((i) => i.text).join(' ').trim().split(/\s+/).filter(Boolean).length;
    return { l: l.length ? words(l) : 0, r: rt.length ? words(rt) : 0 };
  };
  const segs: { items: TextItem[]; cols: number | null }[] = [];
  let run: TextItem[][] = [];
  const flush = () => {
    if (!run.length) return;
    const ks = run.map(kind) as { l: number; r: number }[];
    const first = ks.findIndex((k) => k.r > 0), last = ks.length - 1 - [...ks].reverse().findIndex((k) => k.r > 0);
    const band = run.slice(Math.max(first, 0), last + 1), bk = ks.slice(Math.max(first, 0), last + 1);
    const prose = (side: 'l' | 'r') => bk.filter((k) => k[side] >= 4).length;
    const sideText = (rowsIn: TextItem[][], left: boolean) => rowsIn.map((r) => r.filter((i) => (i.x < gx) === left).map((i) => i.text).join(' ').trim()).filter(Boolean);
    const flowing = (txt: string[]) => { let n = 0, f = 0; for (let i = 0; i + 1 < txt.length; i++) { n++; if (!/[.!?:;]$/.test(txt[i]) && /^[a-z]/.test(txt[i + 1])) f++; } return n > 0 && f * 2 >= n; };
    if (first >= 0 && prose('l') >= 3 && prose('r') >= 3 && flowing(sideText(band, true)) && flowing(sideText(band, false))) {
      const flat = band.flat();
      const before = run.slice(0, first).flat(), after = run.slice(last + 1).flat();
      if (before.length) segs.push({ items: before, cols: null });
      segs.push({ items: flat.filter((i) => i.x < gx), cols: 1 }, { items: flat.filter((i) => i.x >= gx), cols: 2 });
      if (after.length) segs.push({ items: after, cols: null });
    } else segs.push({ items: run.flat(), cols: null });
    run = [];
  };
  for (const r of rows) {
    const k = kind(r);
    if (k === 'cross') { flush(); segs.push({ items: r, cols: null }); } else run.push(r);
  }
  flush();
  return segs.some((x) => x.cols) ? segs : null;
  }
}

/** Group raw pdf.js text items (one page, reading order) into paragraphs. */
function layoutLines(items: TextItem[], bodyOverride?: number, noRules = false): Para[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  if (!sorted.length) return [];
  const sizes = sorted.map((i) => i.size).sort((a, b) => a - b);
  const body = bodyOverride ?? (sizes[Math.floor(sizes.length / 2)] || 12);
  const lines: TextItem[][] = [];
  for (const item of sorted) {
    if (!item.text.trim()) continue;
    const last = lines[lines.length - 1];
    if (last && Math.abs(last[0].y - item.y) < Math.max(2, item.size * 0.35)) last.push(item);
    else lines.push([item]);
  }
  const paras: Para[] = [];
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    // OCR word boxes are not typographic fragments. Wide spacing in a sentence is not evidence of table columns.
    // Ruled OCR tables are reconstructed separately from the actual page borders.
    const numeric = line.every((i) => i.ocr) ? null : rightAlignedTable(lines, li);
    const tbl = numeric ?? (line.every((i) => i.ocr) ? null : findTable(lines, li));
    if (tbl) {
      paras.push({ runs: [], level: 0, table: tbl.rows, y: line[0].y,
        ...(numeric ? { tableStyle: { rightColumns: tbl.rows[0].map((_, i) => i > 0), borderless: noRules } } : {}) });
      li = tbl.end - 1; continue;
    }
    const size = line[0].size;
    const level = size >= body * 1.8 ? 1 : size >= body * 1.4 ? 2 : size >= body * 1.18 ? 3 : 0;
    const runs: ParaRun[] = line.map((i) => ({ text: i.text, bold: i.bold || level > 0, italic: i.italic }));
    // Merge runs with identical styling and join fragments with spaces where needed.
    const merged: ParaRun[] = [];
    for (let ri = 0; ri < runs.length; ri++) {
      const r = runs[ri];
      const prev = merged[merged.length - 1];
      // With item widths, add a space only where a real gap separates the fragments; pdf.js often splits one word
      // into pieces (Indic clusters, kerning), and gluing a space into those would break the word.
      const before = ri > 0 ? line[ri - 1] : undefined;
      const gapOk = before && before.w !== undefined ? line[ri].x - (before.x + before.w) > Math.max(1, line[ri].size * 0.18) : true;
      const needsSpace = prev && gapOk && !prev.text.endsWith(' ') && !r.text.startsWith(' ') && !/^[,.;:!?%\)\]]/.test(r.text) && !/[\(\[]$/.test(prev.text);
      if (prev && prev.bold === r.bold && prev.italic === r.italic) prev.text += (needsSpace ? ' ' : '') + r.text;
      else merged.push({ ...r });
    }
    // A new paragraph starts when the line is a heading or follows a large vertical gap;
    // otherwise continuation lines join the previous paragraph with a space.
    const gap = paras.length ? Math.abs(line[0].y - (lines[lines.indexOf(line) - 1]?.[0]?.y ?? line[0].y)) : 0;
    const prev = paras[paras.length - 1];
    const startsItem = /^([•·●▪◦\-–]|\d{1,3}[.)])(\s|$)/.test(merged[0]?.text ?? '');
    if (prev && !prev.table && level === 0 && prev.level === 0 && gap < body * 1.9 && !startsItem) {
      const lastRun = prev.runs[prev.runs.length - 1];
      if (lastRun && merged[0] && lastRun.bold === merged[0].bold && lastRun.italic === merged[0].italic) lastRun.text += ' ' + merged[0].text;
      else prev.runs.push({ ...merged[0], text: ' ' + merged[0].text });
      for (const r of merged.slice(1)) prev.runs.push(r);
    } else {
      paras.push({ runs: merged, level, y: line[0].y });
    }
  }
  return paras;
}

const esc = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function tableXml(rows: string[][], style?: Para['tableStyle']): string {
  const b = '<w:top w:val="single" w:sz="4" w:color="BFBFBF"/><w:left w:val="single" w:sz="4" w:color="BFBFBF"/><w:bottom w:val="single" w:sz="4" w:color="BFBFBF"/><w:right w:val="single" w:sz="4" w:color="BFBFBF"/><w:insideH w:val="single" w:sz="4" w:color="BFBFBF"/><w:insideV w:val="single" w:sz="4" w:color="BFBFBF"/>';
  // Column widths follow the longest text in each column (capped), over the 9000-twip text width; the PDF's own widths are not read.
  const weights = rows[0].map((_, c) => Math.min(60, Math.max(6, ...rows.map((r) => (r[c] ?? '').length))));
  const wsum = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => Math.round((w / wsum) * 9000));
  const borders = style?.borderless ? ['top','left','bottom','right','insideH','insideV'].map(edge => `<w:${edge} w:val="nil"/>`).join('') : b;
  const grid = widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('');
  const trs = rows.map((r) => `<w:tr>${r.map((c, ci) => `<w:tc><w:tcPr><w:tcW w:w="${widths[ci]}" w:type="dxa"/></w:tcPr><w:p>${style?.rightColumns[ci] ? '<w:pPr><w:jc w:val="right"/></w:pPr>' : ''}<w:r><w:t xml:space="preserve">${esc(c)}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${borders}</w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${trs}</w:tbl><w:p/>`;
}

/** A bordered table with merged cells: widths follow the ruling lines in the PDF. */
function gridXml(g: { widths: number[]; rows: GridCell[][] }, available = 9000): string {
  const b = '<w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/><w:insideH w:val="single" w:sz="4" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:color="000000"/>';
  const total = g.widths.reduce((a, c) => a + c, 0) || 1;
  const tw = g.widths.map((w) => Math.max(1, Math.round((w / total) * available)));
  const grid = tw.map((w) => `<w:gridCol w:w="${w}"/>`).join('');
  const trs = g.rows.map((row, i) => {
    const tcs = row.map((c, j) => {
      if (c.kind === 'covered') {
        const a = c.anchor as { i: number; j: number };
        if (a.j !== j) return ''; // swallowed by a column span: no cell of its own
        const span = g.rows[a.i][a.j].colspan;
        return `<w:tc><w:tcPr><w:tcW w:w="${tw.slice(j, j + span).reduce((x, y) => x + y, 0)}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}<w:vMerge/></w:tcPr><w:p/></w:tc>`;
      }
      const width = tw.slice(j, j + c.colspan).reduce((x, y) => x + y, 0);
      const para = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
      // Word requires a paragraph after a nested table; gridXml already supplies it.
      const content = c.blocks?.map(block => 'grid' in block ? gridXml(block.grid, Math.max(1, Math.round(width * (block.grid.right - block.grid.left) / g.widths.slice(j, j + c.colspan).reduce((x, y) => x + y, 0)))) : para(block.text)).join('') || para(c.text);
      return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${c.colspan > 1 ? `<w:gridSpan w:val="${c.colspan}"/>` : ''}${c.rowspan > 1 ? '<w:vMerge w:val="restart"/>' : ''}</w:tcPr>${content}</w:tc>`;
    }).join('');
    void i;
    return `<w:tr>${tcs}</w:tr>`;
  }).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${b}</w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${trs}</w:tbl><w:p/>`;
}

function imageXml(img: DocImage, n: number): string {
  // Fit the text width (6 inches) and keep the shape; EMU = points x 12700.
  const maxW = 432;
  const k = Math.min(1, maxW / img.w);
  const cx = Math.round(img.w * k * 12700), cy = Math.round(img.h * k * 12700);
  return `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Picture ${n}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="image${n}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg${n}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

function paraXml(p: Para): string {
  if (p.pageBreak) return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  if (p.grid) return gridXml(p.grid);
  if (p.table) return tableXml(p.table, p.tableStyle);
  const style = p.level > 0 ? `<w:pPr><w:pStyle w:val="Heading${p.level}"/></w:pPr>` : '';
  const runs = p.runs
    .filter((r) => r.text.trim())
    .map((r) => `<w:r><w:rPr>${r.bold ? '<w:b/>' : ''}${r.italic ? '<w:i/>' : ''}</w:rPr><w:t xml:space="preserve">${esc(r.text)}</w:t></w:r>`)
    .join('');
  return `<w:p>${style}${runs}</w:p>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
</w:styles>`;

/** Build a valid .docx from paragraphs. */
export function buildDocx(paras: Para[]): Uint8Array {
  const images = paras.filter((p) => p.image);
  let imgNo = 0;
  const body = paras.map((p) => (p.image ? imageXml(p.image, ++imgNo) : paraXml(p))).join('');
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const enc = new TextEncoder();
  return makeZip([
    { name: '[Content_Types].xml', data: enc.encode(CONTENT_TYPES) },
    { name: '_rels/.rels', data: enc.encode(RELS) },
    { name: 'word/_rels/document.xml.rels', data: enc.encode(DOC_RELS.replace('</Relationships>', images.map((_, i) => `<Relationship Id="rIdImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${i + 1}.png"/>`).join('') + '</Relationships>')) },
    { name: 'word/document.xml', data: enc.encode(document) },
    { name: 'word/styles.xml', data: enc.encode(STYLES) },
    ...images.map((p, i) => ({ name: `word/media/image${i + 1}.png`, data: (p.image as DocImage).png })),
  ]);
    }

/** Group raw pdf.js text items (one page) into paragraphs; two-column pages are read left column first, then right. */
export function itemsToParagraphs(items: TextItem[], noRules = false): Para[] {
  const segs = splitColumns(items);
  if (!segs) return layoutLines(items, undefined, noRules);
  // Neighbouring full-width segments are laid out together so tables spanning several rows are still found.
  const merged: typeof segs = [];
  for (const sg of segs) { const l = merged[merged.length - 1]; if (l && l.cols === null && sg.cols === null) l.items = [...l.items, ...sg.items]; else merged.push({ ...sg }); }
  const out: Para[] = [];
  const sz = items.filter((i) => i.text.trim()).map((i) => i.size).sort((a, b) => a - b);
  const body = sz[Math.floor(sz.length / 2)] || 12;
  for (const sg of merged) out.push(...layoutLines(sg.items, body, noRules));
  return out;
                                       }
