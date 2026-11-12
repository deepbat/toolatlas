// Shared PDF input validation and rendering helpers (browser only).
import { PDFDocument } from 'pdf-lib';
import { pdfjs } from '../tools/pdf-editor/pdfjs';

export const MAX_PDF_BYTES = 150 * 1024 * 1024;
export const MAX_CANVAS_PIXELS = 8_000_000; // keeps phones from running out of memory

export async function checkPdfFile(file: File): Promise<ArrayBuffer> {
  if (file.size === 0) throw Error(`"${file.name}" is empty.`);
  if (file.size > MAX_PDF_BYTES) throw Error(`"${file.name}" is ${(file.size / 1048576).toFixed(0)} MB. Choose a PDF under 150 MB.`);
  const buf = await file.arrayBuffer();
  const head = new TextDecoder('latin1').decode(new Uint8Array(buf, 0, Math.min(1024, buf.byteLength)));
  if (!head.includes('%PDF-')) throw Error(`"${file.name}" does not look like a PDF. Check the file type.`);
  return buf;
}
export function friendlyPdfError(e: unknown, name = 'This PDF'): Error {
  const msg = e instanceof Error ? e.message : String(e);
  const named = e && typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : '';
  if (/encrypt|password/i.test(msg) || named === 'PasswordException') return Error(`${name} is password protected. Remove the password in the app that created it, then try again. ToolAtlas never asks for or stores passwords.`);
  if (/Invalid PDF|Failed to parse|No PDF header|Missing PDF|InvalidPDF|bad XRef|xref/i.test(msg) || named === 'InvalidPDFException') return Error(`${name} is damaged or not a standard PDF, so it could not be read.`);
  if (/memory|allocation|Array buffer/i.test(msg)) return Error('The browser ran out of memory. Close other tabs, or try fewer pages or a lower resolution.');
  return e instanceof Error ? e : Error(msg);
}
export async function openPdfjs(file: File) {
  const buf = await checkPdfFile(file);
  try {
    const task = pdfjs().getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false });
    const doc = await task.promise;
    return { doc, buf };
  } catch (e) {
    throw friendlyPdfError(e, `"${file.name}"`);
  }
}
export async function openPdfLib(file: File) {
  const buf = await checkPdfFile(file);
  try {
    return await PDFDocument.load(buf, { ignoreEncryption: false, updateMetadata: false });
  } catch (e) {
    throw friendlyPdfError(e, `"${file.name}"`);
  }
}
/** Render a page to a canvas. `scale` is capped so the canvas never exceeds MAX_CANVAS_PIXELS. */
export async function renderPage(doc: any, pageNo: number, scale: number, background = '#ffffff') {
  const page = await doc.getPage(pageNo);
  let vp = page.getViewport({ scale });
  const px = vp.width * vp.height;
  let capped = false;
  if (px > MAX_CANVAS_PIXELS) {
    vp = page.getViewport({ scale: scale * Math.sqrt(MAX_CANVAS_PIXELS / px) });
    capped = true;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(vp.width);
  canvas.height = Math.ceil(vp.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  page.cleanup();
  return { canvas, capped, widthPt: page.getViewport({ scale: 1 }).width, heightPt: page.getViewport({ scale: 1 }).height };
}
export const canvasBlob = (c: HTMLCanvasElement, type: string, q?: number) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(Error('The browser could not encode this image type.'))), type, q));
export const tick = () => new Promise<void>((r) => setTimeout(r, 0));
/** "1-3,5,8-" style page selection. Returns zero-based indexes in ascending order without duplicates. */
export function parsePages(input: string, total: number): number[] {
  const s = input.trim();
  if (!s) return Array.from({ length: total }, (_, i) => i);
  const set = new Set<number>();
  for (const part of s.split(',')) {
    const m = /^\s*(\d+)?\s*(-)?\s*(\d+)?\s*$/.exec(part);
    if (!m || (!m[1] && !m[3])) throw Error(`"${part.trim()}" is not a page range. Use something like 1-3,5,8-.`);
    const a = m[1] ? Number(m[1]) : 1;
    const b = m[2] ? (m[3] ? Number(m[3]) : total) : a;
    if (a < 1 || b < a || b > total) throw Error(`Pages must be between 1 and ${total}, and ranges must go upwards (got "${part.trim()}").`);
    for (let p = a; p <= b; p++) set.add(p - 1);
  }
  return [...set].sort((x, y) => x - y);
}
