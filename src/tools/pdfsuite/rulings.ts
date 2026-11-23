// Bordered tables with merged cells: read the table's ruling lines from the PDF page (pdf.js operator list), work out which
// grid cells are joined (a border line is missing between them), and give each cell its text. Only tables drawn with
// ruling lines are found; tables made of aligned text alone go through the text-based table finder.
import type { TextItem } from './docx';

export interface GridCell { text: string; colspan: number; rowspan: number; kind: 'cell' | 'covered'; anchor?: { i: number; j: number }; blocks?: Array<{ text: string } | { grid: PageGrid }> } // covered = swallowed by a merge of the anchor cell
export interface PageGrid { top: number; bottom: number; left: number; right: number; widths: number[]; heights: number[]; rows: GridCell[][] }

interface Seg { a: number; b: number; at: number } // a..b along the line, at = the fixed coordinate
type Mat = [number, number, number, number, number, number];
const mul = (m: Mat, n: Mat): Mat => [
  n[0] * m[0] + n[1] * m[2], n[0] * m[1] + n[1] * m[3],
  n[2] * m[0] + n[3] * m[2], n[2] * m[1] + n[3] * m[3],
  n[4] * m[0] + n[5] * m[2] + m[4], n[4] * m[1] + n[5] * m[3] + m[5],
];
const apply = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const TOL = 1.5;

/** Horizontal and vertical line segments drawn on the page (strokes of straight lines and thin filled rectangles). */
export async function pageLines(pdfjs: any, page: any): Promise<{ h: Seg[]; v: Seg[] }> {
  const O = pdfjs.OPS;
  const ol = await page.getOperatorList();
  const h: Seg[] = [], v: Seg[] = [];
  const stack: Mat[] = [];
  let ctm: Mat = [1, 0, 0, 1, 0, 0];
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const [ax, ay] = apply(ctm, x0, y0), [bx, by] = apply(ctm, x1, y1);
    if (Math.abs(ay - by) < 0.6 && Math.abs(ax - bx) > 4) h.push({ at: (ay + by) / 2, a: Math.min(ax, bx), b: Math.max(ax, bx) });
    else if (Math.abs(ax - bx) < 0.6 && Math.abs(ay - by) > 4) v.push({ at: (ax + bx) / 2, a: Math.min(ay, by), b: Math.max(ay, by) });
  };
  let pending: Array<() => void> = [];
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i], args = ol.argsArray[i];
    if (fn === O.save) stack.push(ctm);
    else if (fn === O.restore) ctm = stack.pop() ?? ctm;
    else if (fn === O.transform) ctm = mul(ctm, args as Mat);
    else if (fn === O.constructPath) {
      const codes: number[] = args[0], c: number[] = args[1];
      let k = 0, cx = 0, cy = 0;
      pending = [];
      for (const code of codes) {
        if (code === O.moveTo) { cx = c[k++]; cy = c[k++]; }
        else if (code === O.lineTo) { const nx = c[k++], ny = c[k++]; const x0 = cx, y0 = cy; pending.push(() => add(x0, y0, nx, ny)); cx = nx; cy = ny; }
        else if (code === O.rectangle) {
          const x = c[k++], y = c[k++], w = c[k++], hh = c[k++];
          // A rectangle thinner than a line is a drawn border; a bigger one is a shaded cell and not a line.
          const [pw, ph] = [Math.hypot(ctm[0] * w, ctm[1] * w), Math.hypot(ctm[2] * hh, ctm[3] * hh)];
          if (ph < 2.5 && pw > 4) pending.push(() => add(x, y + hh / 2, x + w, y + hh / 2));
          else if (pw < 2.5 && ph > 4) pending.push(() => add(x + w / 2, y, x + w / 2, y + hh));
        } else if (code === O.curveTo) k += 6;
        else if (code === O.curveTo2 || code === O.curveTo3) k += 4;
      }
    } else if (fn === O.stroke || fn === O.closeStroke || fn === O.fill || fn === O.eoFill || fn === O.fillStroke || fn === O.eoFillStroke || fn === O.closeFillStroke || fn === O.closeEOFillStroke) {
      for (const p of pending) p();
      pending = [];
    } else if (fn === O.endPath) pending = [];
  }
  return { h, v };
}

function cluster(vals: number[]): number[] {
  const s = [...vals].sort((a, b) => a - b);
  const out: number[] = [];
  let group: number[] = [];
  for (const x of s) {
    if (group.length && x - group[group.length - 1] > TOL) { out.push(group.reduce((a, b) => a + b, 0) / group.length); group = []; }
    group.push(x);
  }
  if (group.length) out.push(group.reduce((a, b) => a + b, 0) / group.length);
  return out;
}

/** Fraction of [lo, hi] covered by segments at coordinate `at`. */
function covered(segs: Seg[], at: number, lo: number, hi: number): number {
  const parts = segs.filter((s) => Math.abs(s.at - at) <= TOL + 0.5).map((s) => [Math.max(lo, s.a - TOL), Math.min(hi, s.b + TOL)]).filter((p) => p[1] > p[0]).sort((a, b) => a[0] - b[0]);
  let cov = 0, end = lo;
  for (const [a, b] of parts) { const from = Math.max(a, end); if (b > from) { cov += b - from; end = b; } }
  return cov / Math.max(1e-6, hi - lo);
}

/** Group segments that touch into separate tables (a page can hold several, plus stray rules). */
function components(h: Seg[], v: Seg[]): Array<{ h: Seg[]; v: Seg[] }> {
  const all = [...h.map((s) => ({ s, k: 'h' as const })), ...v.map((s) => ({ s, k: 'v' as const }))];
  const parent = all.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const touch = (p: { s: Seg; k: 'h' | 'v' }, q: { s: Seg; k: 'h' | 'v' }) => {
    if (p.k === q.k) return Math.abs(p.s.at - q.s.at) <= TOL && p.s.a <= q.s.b + TOL && q.s.a <= p.s.b + TOL;
    const hs = p.k === 'h' ? p.s : q.s, vs = p.k === 'h' ? q.s : p.s;
    return vs.at >= hs.a - TOL && vs.at <= hs.b + TOL && hs.at >= vs.a - TOL && hs.at <= vs.b + TOL;
  };
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (touch(all[i], all[j])) parent[find(i)] = find(j);
  const groups = new Map<number, { h: Seg[]; v: Seg[] }>();
  all.forEach((p, i) => { const r = find(i); const g = groups.get(r) ?? { h: [], v: [] }; (p.k === 'h' ? g.h : g.v).push(p.s); groups.set(r, g); });
  return [...groups.values()];
}

function cellText(items: TextItem[]): string {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: TextItem[][] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last[0].y - it.y) < Math.max(2, it.size * 0.35)) last.push(it); else lines.push([it]);
  }
  return lines.map((l) => {
    let out = '';
    l.sort((a, b) => a.x - b.x).forEach((it, i) => {
      const before = l[i - 1];
      const gap = before && before.w !== undefined ? it.x - (before.x + before.w) > Math.max(1, it.size * 0.18) : !!before;
      out += (i > 0 && gap && !out.endsWith(' ') && !it.text.startsWith(' ') ? ' ' : '') + it.text;
    });
    return out.trim();
  }).filter(Boolean).join(' ');
}

type RuleSet = { h: Seg[]; v: Seg[] };
function componentGrid(comp: RuleSet): PageGrid | undefined {
  if (comp.h.length < 2 || comp.v.length < 2) return undefined;
  const xs = cluster(comp.v.map((s) => s.at));
  const ys = cluster(comp.h.map((s) => s.at)).reverse(); // top to bottom
  if (xs.length < 2 || ys.length < 2) return undefined;
  const R = ys.length - 1, C = xs.length - 1;
  if (R < 2 && C < 2) return undefined;
  // Which cells are joined: no border line over the shared edge.
  const parent = Array.from({ length: R * C }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const U = (a: number, b: number) => { parent[find(a)] = find(b); };
  for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
    if (j + 1 < C && covered(comp.v, xs[j + 1], ys[i + 1], ys[i]) < 0.6) U(i * C + j, i * C + j + 1);
    if (i + 1 < R && covered(comp.h, ys[i + 1], xs[j], xs[j + 1]) < 0.6) U(i * C + j, (i + 1) * C + j);
  }
  const members = new Map<number, number[]>();
  for (let k = 0; k < R * C; k++) { const r = find(k); members.set(r, [...(members.get(r) ?? []), k]); }
  let ok = true;
  const rows: GridCell[][] = Array.from({ length: R }, () => Array.from({ length: C }, () => ({ text: '', colspan: 1, rowspan: 1, kind: 'covered' as const })));
  for (const cells of members.values()) {
    const is = cells.map((k) => Math.floor(k / C)), js = cells.map((k) => k % C);
    const i0 = Math.min(...is), i1 = Math.max(...is), j0 = Math.min(...js), j1 = Math.max(...js);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) !== cells.length) { ok = false; break; } // not a rectangle
    rows[i0][j0] = { text: '', colspan: j1 - j0 + 1, rowspan: i1 - i0 + 1, kind: 'cell' };
    for (const k of cells) { if (k !== i0 * C + j0) rows[Math.floor(k / C)][k % C].anchor = { i: i0, j: j0 }; }
  }
  if (!ok) return undefined;
  const left = xs[0], right = xs[xs.length - 1], top = ys[0], bottom = ys[ys.length - 1];
  return { top, bottom, left, right, widths: xs.slice(1).map((x, q) => x - xs[q]), heights: ys.slice(1).map((y, q) => ys[q] - y), rows };
}

// A narrow supported case: an otherwise closed inner grid shares only the parent's left or right rule.
// Its other vertical side must begin/end at the inner horizontal rules, not continue as a parent column.
function sharedSideGrids(comp: RuleSet): PageGrid[] | undefined {
  if (comp.h.length > 80 || comp.v.length > 80) return undefined;
  const joined = (segments: Seg[]) => {
    const result: Seg[] = [];
    for (const at of cluster(segments.map(s => s.at))) {
      const parts = segments.filter(s => Math.abs(s.at - at) <= TOL).sort((a,b) => a.a - b.a);
      let last: Seg | undefined;
      for (const part of parts) {
        if (last && part.a <= last.b + TOL) last.b = Math.max(last.b, part.b);
        else { last = { at, a: part.a, b: part.b }; result.push(last); }
      }
    }
    return result;
  };
  comp = { h: joined(comp.h), v: joined(comp.v) };
  const minX = Math.min(...comp.v.map(s => s.at)), maxX = Math.max(...comp.v.map(s => s.at));
  const near = (a: number, b: number) => Math.abs(a - b) <= TOL;
  const candidates: PageGrid[][] = [];
  for (const first of comp.h) for (const last of comp.h) {
    if (first.at <= last.at + 4 || !near(first.a, last.a) || !near(first.b, last.b)) continue;
    const left = (first.a + last.a) / 2, right = (first.b + last.b) / 2;
    const leftShared = near(left, minX), rightShared = near(right, maxX);
    if (leftShared === rightShared) continue;
    const free = leftShared ? right : left, top = first.at, bottom = last.at;
    if (!comp.v.some(s => near(s.at, free) && near(s.a, bottom) && near(s.b, top))) continue;
    if (comp.v.some(s => near(s.at, free) && (s.a < bottom - TOL || s.b > top + TOL))) continue;
    const insideH = (s: Seg) => s.at <= top + TOL && s.at >= bottom - TOL && s.a >= left - TOL && s.b <= right + TOL;
    const insideV = (s: Seg) => s.at > left + TOL && s.at < right - TOL && s.a >= bottom - TOL && s.b <= top + TOL;
    const freeV = (s: Seg) => near(s.at, free) && s.a >= bottom - TOL && s.b <= top + TOL;
    const childRules = { h: comp.h.filter(insideH), v: comp.v.filter(s => insideV(s) || freeV(s) || near(s.at, leftShared ? left : right)).map(s => ({ ...s, a: Math.max(s.a, bottom), b: Math.min(s.b, top) })).filter(s => s.b > s.a) };
    // All four child edges must actually be drawn. Partial borders must not become new tables.
    if (covered(childRules.h, top, left, right) < 0.95 || covered(childRules.h, bottom, left, right) < 0.95 ||
        covered(childRules.v, left, bottom, top) < 0.95 || covered(childRules.v, right, bottom, top) < 0.95) continue;
    const parentRules = { h: comp.h.filter(s => !insideH(s)), v: comp.v.filter(s => !insideV(s) && !freeV(s)) };
    const parent = componentGrid(parentRules), child = componentGrid(childRules);
    if (!parent || !child) continue;
    if (covered(parentRules.h, parent.top, parent.left, parent.right) < 0.95 || covered(parentRules.h, parent.bottom, parent.left, parent.right) < 0.95 ||
        covered(parentRules.v, parent.left, parent.bottom, parent.top) < 0.95 || covered(parentRules.v, parent.right, parent.bottom, parent.top) < 0.95) continue;
    // Require a proper inset in the other three directions inside exactly one real parent cell.
    const owners = parent.rows.flat().filter(cell => {
      if (cell.kind !== 'cell') return false;
      const b = cellBounds(parent, cell);
      return child.top < b.top - TOL && child.bottom > b.bottom + TOL &&
        (leftShared ? near(child.left, b.left) && child.right < b.right - TOL : near(child.right, b.right) && child.left > b.left + TOL);
    });
    if (owners.length === 1) candidates.push([parent, child]);
  }
  return candidates.length === 1 ? candidates[0] : undefined;
}

/**
 * Bordered tables on a page, with merged cells. Returns the tables and the text items they did not use.
 * A table is only accepted when its merged cells are rectangles, so a stray or partly drawn grid is left to the text finder.
 */
export function gridsFromLines(lines: { h: Seg[]; v: Seg[] }, items: TextItem[], includeEmpty = false): { grids: PageGrid[]; rest: TextItem[] } {
  const grids: PageGrid[] = [];
  for (const comp of components(lines.h, lines.v)) {
    const grid = componentGrid(comp);
    if (grid) grids.push(grid);
    else grids.push(...(sharedSideGrids(comp) ?? []));
  }
  // A disconnected grid may be a table inside one parent cell. Choose the smallest containing cell,
  // never just the enclosing table rectangle (a child spanning several cells is not a nested table).
  const children = new Map<GridCell, PageGrid[]>();
  const nested = new Set<PageGrid>();
  for (const child of grids) {
    let owner: GridCell | undefined, area = Infinity;
    for (const outer of grids) {
      if (outer === child) continue;
      for (const row of outer.rows) for (const cell of row) {
        if (cell.kind !== 'cell') continue;
        const b = cellBounds(outer, cell);
        const a = (b.right - b.left) * (b.top - b.bottom);
        if (a < area && child.left >= b.left - TOL && child.right <= b.right + TOL && (child.left > b.left + TOL || child.right < b.right - TOL) && child.bottom > b.bottom + TOL && child.top < b.top - TOL) { owner = cell; area = a; }
      }
    }
    if (owner) { children.set(owner, [...(children.get(owner) ?? []), child]); nested.add(child); }
  }
  const contains = (g: { left: number; right: number; top: number; bottom: number }, it: TextItem) => {
    const cx = it.x + (it.w ?? it.size * it.text.length * 0.5) / 2, cy = it.y + it.size * 0.3;
    return cx >= g.left && cx <= g.right && cy >= g.bottom && cy <= g.top;
  };
  for (const grid of grids) for (const row of grid.rows) for (const cell of row) {
    if (cell.kind !== 'cell') continue;
    const bounds = cellBounds(grid, cell);
    const inner = (children.get(cell) ?? []).sort((a, b) => b.top - a.top || a.left - b.left);
    const own = items.filter(it => contains(bounds, it) && !inner.some(g => contains(g, it)));
    cell.text = cellText(own);
    if (inner.length) {
      cell.blocks = [];
      let remaining = own;
      for (const child of inner) {
        const before = remaining.filter(it => it.y + it.size * 0.3 > child.top);
        const text = cellText(before);
        if (text) cell.blocks.push({ text });
        cell.blocks.push({ grid: child });
        remaining = remaining.filter(it => !before.includes(it));
      }
      const after = cellText(remaining);
      if (after) cell.blocks.push({ text: after });
    }
  }
  const hasText = (g: PageGrid): boolean => g.rows.some(r => r.some(c => c.text || c.blocks?.some(b => 'grid' in b && hasText(b.grid))));
  const roots = grids.filter(g => !nested.has(g) && (includeEmpty || hasText(g)));
  return { grids: roots, rest: items.filter(it => !roots.some(g => contains(g, it))) };
}

/** Bounds of an anchor cell, including its full row/column span. */
export function cellBounds(grid: PageGrid, cell: GridCell) {
  const i = grid.rows.findIndex(row => row.includes(cell)), j = grid.rows[i].indexOf(cell);
  const left = grid.left + grid.widths.slice(0, j).reduce((a, b) => a + b, 0);
  const top = grid.top - grid.heights.slice(0, i).reduce((a, b) => a + b, 0);
  return { left, top, right: left + grid.widths.slice(j, j + cell.colspan).reduce((a, b) => a + b, 0), bottom: top - grid.heights.slice(i, i + cell.rowspan).reduce((a, b) => a + b, 0) };
}

/** Reject only a narrow OCR bar whose box lies on a known drawn vertical rule. Ordinary bars elsewhere are text. */
export function isOcrRuleBar(text: string, box: { x0: number; x1: number; y0: number; y1: number }, vertical: Seg[]): boolean {
  if (!/^[|¦]+$/.test(text.trim()) || box.x1 - box.x0 > 1.5 || box.y1 <= box.y0) return false;
  const x = (box.x0 + box.x1) / 2;
  return vertical.some(s => Math.abs(s.at - x) < 0.8 && Math.max(0, Math.min(s.b, box.y1) - Math.max(s.a, box.y0)) / (box.y1 - box.y0) > 0.8);
  }
