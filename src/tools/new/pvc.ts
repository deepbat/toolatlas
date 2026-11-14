// Pure helpers for the PVC Card Maker: card detection and A4 sheet layout.
export type Box = { x: number; y: number; w: number; h: number };
export const CR80 = { w: 85.6, h: 53.98 };
export const CARD_PX = { w: Math.round((CR80.w / 25.4) * 300), h: Math.round((CR80.h / 25.4) * 300) };

/** Find card-like regions on a page. `rgba` is image data; returns boxes in the same pixel space. */
export function findCardBoxes(rgba: Uint8ClampedArray, width: number, height: number): Box[] {
  const step = Math.max(1, Math.round(Math.max(width, height) / 360));
  const gw = Math.ceil(width / step), gh = Math.ceil(height / step);
  const mask = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++)
    for (let gx = 0; gx < gw; gx++) {
      const i = ((gy * step) * width + gx * step) * 4;
      const a = rgba[i + 3];
      if (a > 20 && (rgba[i] < 232 || rgba[i + 1] < 232 || rgba[i + 2] < 232)) mask[gy * gw + gx] = 1;
    }
  // dilate so text and photo inside a card join into one blob
  const r = Math.max(2, Math.round(gw / 60));
  const dil = new Uint8Array(gw * gh);
  const tmp = new Uint8Array(gw * gh);
  for (let y = 0; y < gh; y++) {
    let last = -1e9;
    for (let x = 0; x < gw; x++) { if (mask[y * gw + x]) last = x; if (x - last <= r) tmp[y * gw + x] = 1; }
    last = 1e9;
    for (let x = gw - 1; x >= 0; x--) { if (mask[y * gw + x]) last = x; if (last - x <= r) tmp[y * gw + x] = 1; }
  }
  for (let x = 0; x < gw; x++) {
    let last = -1e9;
    for (let y = 0; y < gh; y++) { if (tmp[y * gw + x]) last = y; if (y - last <= r) dil[y * gw + x] = 1; }
    last = 1e9;
    for (let y = gh - 1; y >= 0; y--) { if (tmp[y * gw + x]) last = y; if (last - y <= r) dil[y * gw + x] = 1; }
  }
  const seen = new Uint8Array(gw * gh);
  const out: Box[] = [];
  const stack: number[] = [];
  for (let s = 0; s < gw * gh; s++) {
    if (!dil[s] || seen[s]) continue;
    let x0 = gw, y0 = gh, x1 = -1, y1 = -1;
    stack.push(s); seen[s] = 1;
    while (stack.length) {
      const p = stack.pop()!, px = p % gw, py = (p / gw) | 0;
      if (mask[p]) { if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
      if (px > 0 && dil[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
      if (px < gw - 1 && dil[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
      if (py > 0 && dil[p - gw] && !seen[p - gw]) { seen[p - gw] = 1; stack.push(p - gw); }
      if (py < gh - 1 && dil[p + gw] && !seen[p + gw]) { seen[p + gw] = 1; stack.push(p + gw); }
    }
    if (x1 < 0) continue;
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w < gw * 0.18 || h < gh * 0.1 || w * h < gw * gh * 0.04) continue;
    const ratio = Math.max(w, h) / Math.min(w, h);
    if (ratio > 3) continue;
    out.push({ x: x0 * step, y: y0 * step, w: Math.min(width - x0 * step, w * step), h: Math.min(height - y0 * step, h * step) });
  }
  out.sort((a, b) => (Math.abs(a.y - b.y) > Math.min(a.h, b.h) * 0.5 ? a.y - b.y : a.x - b.x));
  return out;
}

export const LAYOUTS = { 2: 1, 4: 2, 10: 5 } as const;
export type PerSheet = keyof typeof LAYOUTS;
export const A4 = { w: 210, h: 297 };

/** Cell origins in mm for a sheet with `rows` rows of front|back pairs, centred on A4. */
export function sheetCells(rows: number, gap = 4) {
  const totalW = CR80.w * 2 + gap, totalH = CR80.h * rows + gap * (rows - 1);
  const x0 = (A4.w - totalW) / 2, y0 = (A4.h - totalH) / 2;
  const cells: { x: number; y: number; col: 0 | 1; row: number }[] = [];
  for (let r = 0; r < rows; r++)
    for (const c of [0, 1] as const) cells.push({ x: x0 + c * (CR80.w + gap), y: y0 + r * (CR80.h + gap), col: c, row: r });
  return cells;
       }
