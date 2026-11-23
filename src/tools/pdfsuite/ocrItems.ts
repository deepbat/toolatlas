// Read one PDF page from its picture (Tesseract, on this device) and return text items for PDF to Word.
// Used only for pages whose own text cannot be read back; recognition is a guess, so callers keep real text where it exists.
import { renderPage } from '../../lib/pdfio';
import type { TextItem } from './docx';

const TESS = `${(import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'}tesseract`;
let worker: { recognize: (c: unknown, o: unknown, out: unknown) => Promise<any>; terminate: () => Promise<unknown> } | null = null;
let workerLang = '';

export async function ocrPageItems(doc: any, pageNo: number, lang: string): Promise<TextItem[] | null> {
  const { createWorker, OEM } = await import('tesseract.js');
  if (worker && workerLang !== lang) { await worker.terminate(); worker = null; }
  if (!worker) {
    workerLang = lang;
    worker = (await createWorker(lang.split('+'), OEM.LSTM_ONLY, { workerPath: `${TESS}/worker.min.js`, corePath: TESS, langPath: TESS })) as never;
  }
  const scale = 2;
  const { canvas } = await renderPage(doc, pageNo, scale);
  const { data } = await (worker as NonNullable<typeof worker>).recognize(canvas, {}, { blocks: true });
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
  if (worker) { await worker.terminate(); worker = null; }
}
