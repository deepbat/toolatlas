// Read one PDF page from its picture (Tesseract, on this device) and return text items for PDF to Word.
// Used only for pages whose own text cannot be read back; recognition is a guess, so callers keep real text where it exists.
import { renderPage } from '../../lib/pdfio';
import type { TextItem } from './docx';

const TESS = `${(import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'}tesseract`;
type W = { recognize: (c: unknown, o: unknown, out: unknown) => Promise<any>; terminate: () => Promise<unknown> };
const workers = new Map<string, W>();

async function workerFor(lang: string): Promise<W> {
  const have = workers.get(lang);
  if (have) return have;
  const { createWorker, OEM } = await import('tesseract.js');
  const w = (await createWorker(lang.split('+'), OEM.LSTM_ONLY, { workerPath: `${TESS}/worker.min.js`, corePath: TESS, langPath: TESS })) as unknown as W;
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
  return pan.confidence > hin.confidence ? pan : hin;
}

export async function ocrPageItems(doc: any, pageNo: number, lang: string): Promise<TextItem[] | null> {
  const scale = 2;
  const { canvas } = await renderPage(doc, pageNo, scale);
  const data = await readPage(canvas, lang);
  const hPt = canvas.height / scale;
  const items: TextItem[] = [];
  // Words of one OCR line share the line's baseline and height: per-word boxes differ (marks above or below the letters)
  // and would otherwise split a line into several, scrambling the reading order.
  for (const b of data.blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) {
    const lineH = Math.max(6, (l.bbox.y1 - l.bbox.y0) / scale);
    const ys = l.words.map((w: any) => w.bbox.y1).sort((a: number, c: number) => a - c);
    const base = ys.length ? ys[Math.floor(ys.length / 2)] : l.bbox.y1;
    const ws = l.words.filter((w: any) => w.text.trim());
    ws.forEach((w: any, wi: number) => {
      // OCR words are already separate: keep the space between them (the gap rule is tuned for text-layer fragments).
      items.push({ text: wi < ws.length - 1 ? w.text.trim() + ' ' : w.text.trim(), size: lineH, bold: false, italic: false, x: w.bbox.x0 / scale, y: hPt - base / scale, w: (w.bbox.x1 - w.bbox.x0) / scale });
    });
  }
  return items.length ? items : null;
}

export async function ocrDone() {
  for (const w of workers.values()) await w.terminate();
  workers.clear();
}
