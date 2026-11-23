// Read one PDF page from its picture (Tesseract, on this device) and return text items for PDF to Word.
// Used only for pages whose own text cannot be read back; recognition is a guess, so callers keep real text where it exists.
import { renderPage } from '../../lib/pdfio';
import { pdfjs } from '../pdf-editor/pdfjs';
import { pageLines, gridsFromLines, isOcrRuleBar, cellBounds } from './rulings';
import type { TextItem } from './docx';
import type { PageGrid } from './rulings';

const TESS = `${(import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'}tesseract`;
type W = { setParameters: (p: Record<string, string>) => Promise<unknown>; recognize: (c: unknown, o: unknown, out: unknown) => Promise<any>; terminate: () => Promise<unknown> };
const workers = new Map<string, W>();

async function workerFor(lang: string): Promise<W> {
  const have = workers.get(lang);
  if (have) return have;
  const { createWorker, OEM } = await import('tesseract.js');
  const w = (await createWorker(lang.split('+'), OEM.LSTM_ONLY, { workerPath: `${TESS}/worker.min.js`, corePath: TESS, langPath: TESS })) as unknown as W;
  // tesseract.js defaults to one-block page layout, which dropped the last row of a ruled table on a test page; ask for automatic layout.
  await w.setParameters({ tessedit_pageseg_mode: '3' });
  workers.set(lang, w);
  return w;
}

/**
 * 'auto' reads the page once with Hindi+English and once with Punjabi+English and keeps the reading Tesseract is more
 * sure of. One combined Hindi+Punjabi model mixes the scripts (it read Punjabi letters as Devanagari on a test page),
 * so the choice is made per page. A page that really mixes both scripts is read in whichever fits better.
 */
export async function readPage(canvas: HTMLCanvasElement, lang: string): Promise<any> {
  if (lang !== 'auto') return (await (await workerFor(lang)).recognize(canvas, {}, { blocks: true })).data;
  const hin = (await (await workerFor('hin+eng')).recognize(canvas, {}, { blocks: true })).data;
  const pan = (await (await workerFor('pan+eng')).recognize(canvas, {}, { blocks: true })).data;
  return pan.confidence > hin.confidence ? { ...pan, recognitionLang: 'pan+eng' } : { ...hin, recognitionLang: 'hin+eng' };
}

export async function ocrPageItems(doc: any, pageNo: number, lang: string): Promise<TextItem[] | null> {
  const scale = 4;
  const { canvas } = await renderPage(doc, pageNo, scale);
  const data = await readPage(canvas, lang);
  const page = await doc.getPage(pageNo);
  const vp = page.getViewport({ scale: 1 });
  const sx = canvas.width / vp.width, sy = canvas.height / vp.height;
  const hPt = vp.height;
  const lines = await pageLines(pdfjs(), page);
  const items: TextItem[] = [];
  // Words of one OCR line share the line's baseline and height: per-word boxes differ (marks above or below the letters)
  // and would otherwise split a line into several, scrambling the reading order.
  for (const b of data.blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) {
    const lineH = Math.max(6, (l.bbox.y1 - l.bbox.y0) / sy);
    const ys = l.words.map((w: any) => w.bbox.y1).sort((a: number, c: number) => a - c);
    const base = ys.length ? ys[Math.floor(ys.length / 2)] : l.bbox.y1;
    const ws = l.words.filter((w: any) => w.text.trim() && !isOcrRuleBar(w.text, { x0: w.bbox.x0 / sx, x1: w.bbox.x1 / sx, y0: hPt - w.bbox.y1 / sy, y1: hPt - w.bbox.y0 / sy }, lines.v));
    ws.forEach((w: any, wi: number) => {
      // OCR words are already separate: keep the space between them (the gap rule is tuned for text-layer fragments).
      items.push({ ocr: true, text: wi < ws.length - 1 ? w.text.trim() + ' ' : w.text.trim(), size: lineH, bold: false, italic: false, x: w.bbox.x0 / sx, y: hPt - base / sy, w: (w.bbox.x1 - w.bbox.x0) / sx });
    });
  }
  // Full-page segmentation can omit an entire ruled table. Read each geometrically bounded cell separately,
  // without its border, rather than inventing missing values or treating a blank OCR result as an empty source cell.
  const flatten = (g: PageGrid): PageGrid[] => [g, ...g.rows.flatMap(row => row.flatMap(cell => (cell.blocks ?? []).flatMap(b => 'grid' in b ? flatten(b.grid) : [])))];
  const grids = gridsFromLines(lines, [], true).grids.flatMap(flatten);
  for (const grid of grids) {
    const selected = data.recognitionLang ?? lang;
    const worker = await workerFor(selected);
    await worker.setParameters({ tessedit_pageseg_mode: '6' });
    try {
      const replacements: TextItem[] = [];
      const replaced: ReturnType<typeof cellBounds>[] = [];
      let top = grid.top;
      for (let ri = 0; ri < grid.rows.length; ri++) {
        let left = grid.left;
        for (let ci = 0; ci < grid.rows[ri].length; ci++) {
          const cell = grid.rows[ri][ci];
          // A parent cell with an inner grid is not one OCR block. Leave its surrounding words
          // from full-page OCR in place, and read the nested leaf cells separately.
          if (cell.kind === 'cell' && !cell.blocks?.some(b => 'grid' in b)) {
            replaced.push(cellBounds(grid, cell));
            const width = grid.widths.slice(ci, ci + cell.colspan).reduce((a, b) => a + b, 0);
            const height = grid.heights.slice(ri, ri + cell.rowspan).reduce((a, b) => a + b, 0);
            const crop = document.createElement('canvas');
            const inset = 0.75;
            crop.width = Math.max(1, Math.round((width - 2 * inset) * sx));
            crop.height = Math.max(1, Math.round((height - 2 * inset) * sy));
            crop.getContext('2d')!.drawImage(canvas, (left + inset) * sx, (hPt - top + inset) * sy, crop.width, crop.height, 0, 0, crop.width, crop.height);
            const padded = document.createElement('canvas');
            padded.width = crop.width + 30; padded.height = crop.height + 30;
            const pc = padded.getContext('2d')!; pc.fillStyle = '#fff'; pc.fillRect(0, 0, padded.width, padded.height); pc.drawImage(crop, 15, 15);
            const result = (await worker.recognize(padded, {}, { blocks: true })).data;
            const text = result.text.trim();
            if (text) replacements.push({ ocr: true, text, size: Math.min(12, height * 0.55), bold: false, italic: false, x: left + inset, y: top - height * 0.65, w: width - 2 * inset });
          }
          left += grid.widths[ci];
        }
        top -= grid.heights[ri];
      }
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i], cx = it.x + (it.w ?? 0) / 2, cy = it.y + it.size * 0.3;
        if (replaced.some(b => cx >= b.left && cx <= b.right && cy >= b.bottom && cy <= b.top)) items.splice(i, 1);
      }
      items.push(...replacements);
    } finally { await worker.setParameters({ tessedit_pageseg_mode: '3' }); }
  }
  return items.length ? items : null;
}

export async function ocrDone() {
  for (const w of workers.values()) await w.terminate();
  workers.clear();
                                                                          }
