import { PDFDocument } from 'pdf-lib';
import { bitmap, blob, canvas } from '../new/helpers';
import { openPdfjs, renderPage, tick } from '../../lib/pdfio';

export type PageSource = { file: File; page: number; width: number; height: number };
export type FitResult = { blob: Blob; width?: number; height?: number; note: string; previews: Blob[] };
export const LIMITS = { files: 12, pages: 24, bytes: 80_000_000 };
export function ceiling(kb: string) {
  const n = Number(kb);
  if (!kb.trim() || !Number.isFinite(n) || n < 5 || n > 20000) throw Error('Enter a limit from 5 to 20,000 KB.');
  return Math.floor(n * 1000) - 1; // strictly below decimal KB, also safe for KiB-based forms
}
export function validateFiles(files: File[], pdf: boolean) {
  if (!files.length) throw Error('Choose a file first.');
  if (files.length > (pdf ? LIMITS.files : 1)) throw Error(pdf ? 'Use at most 12 files at a time.' : 'Choose one photo or signature.');
  if (files.reduce((s, f) => s + f.size, 0) > LIMITS.bytes) throw Error('Choose files totalling under 80 MB.');
  for (const f of files) {
    if (!f.size) throw Error(`${f.name} is empty.`);
    if (!/\.(jpe?g|png|webp)$/i.test(f.name) && !(pdf && /\.pdf$/i.test(f.name))) throw Error('Use JPG, PNG or WebP images, or PDFs in PDF mode.');
  }
}
export const isPdf = (f: File) => /\.pdf$/i.test(f.name);
const sizeCanvas = (source: CanvasImageSource, w: number, h: number) => {
  const c = canvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h))), g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingQuality = 'high';
  g.drawImage(source, 0, 0, c.width, c.height); return c;
};

/** Local bright-paper estimates remove uneven grey shadows, not just a global threshold. */
export function whitenPaper(data: Uint8ClampedArray, w: number, h: number, strength: number) {
  const cell = 32, cols = Math.ceil(w / cell), rows = Math.ceil(h / cell), bg = new Float32Array(cols * rows);
  const lum = (i: number) => .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const idx = Math.floor(y / cell) * cols + Math.floor(x / cell);
    bg[idx] = Math.max(bg[idx], lum((y * w + x) * 4));
  }
  const at = (x: number, y: number) => bg[Math.max(0, Math.min(rows - 1, y)) * cols + Math.max(0, Math.min(cols - 1, x))];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const fx = x / cell - .5, fy = y / cell - .5, ix = Math.floor(fx), iy = Math.floor(fy), dx = fx - ix, dy = fy - iy;
    const paper = Math.max(30, at(ix, iy) * (1-dx) * (1-dy) + at(ix+1, iy) * dx * (1-dy) + at(ix, iy+1) * (1-dx) * dy + at(ix+1, iy+1) * dx * dy);
    const i = (y * w + x) * 4, relative = lum(i) / paper;
    const ink = Math.min(1, Math.max(0, (1 - strength / 100 - relative) / .32));
    data[i] = Math.round(255 - 237 * ink); data[i+1] = Math.round(255 - 210 * ink); data[i+2] = Math.round(255 - 180 * ink); data[i+3] = 255;
  }
}
export async function imageSource(file: File, clean: boolean, strength: number, resize = true) {
  const b = await bitmap(file);
  if (!resize && b.width * b.height > 6_000_000) { b.close(); throw Error('This image exceeds the 6-megapixel working limit. Allow smaller dimensions or choose a smaller image.'); }
  const scale = Math.min(1, Math.sqrt(6_000_000 / (b.width * b.height)));
  const c = sizeCanvas(b, b.width * scale, b.height * scale); b.close();
  if (clean) {
    const g = c.getContext('2d')!, d = g.getImageData(0, 0, c.width, c.height);
    whitenPaper(d.data, c.width, c.height, strength); g.putImageData(d, 0, 0);
  }
  return c;
}

/** Prefer resolution, then the highest tested JPEG quality that stays strictly under the cap. */
export async function fitImage(file: File, cap: number, clean: boolean, strength: number, resize: boolean, status: (s: string) => void): Promise<FitResult> {
  const source = await imageSource(file, clean, strength, resize);
  try {
    for (let pass = 0; pass < (resize ? 16 : 1); pass++) {
      const factor = Math.pow(.83, pass);
      if (pass && Math.max(source.width, source.height) * factor < 160) break;
      const c = sizeCanvas(source, source.width * factor, source.height * factor);
      status(`Finding a fit at ${c.width} x ${c.height} pixels`); await tick();
      let best = await blob(c, 'image/jpeg', .96);
      if (best.size > cap) {
        best = await blob(c, 'image/jpeg', .35);
        if (best.size > cap) { c.width = c.height = 0; continue; }
        let low = .35, high = .96;
        for (let i = 0; i < 7; i++) {
          const mid = (low + high) / 2, candidate = await blob(c, 'image/jpeg', mid);
          if (candidate.size <= cap) { best = candidate; low = mid; } else high = mid;
        }
      }
      const width = c.width, height = c.height; c.width = c.height = 0;
      return { blob: best, width, height, previews: [best], note: `${clean ? 'Paper cleanup applied. Faint strokes can disappear: compare with the original. ' : ''}JPEG output, white background, aspect ratio kept. Working images are capped at 6 megapixels. ${pass ? 'Pixel dimensions were reduced to meet the limit. ' : ''}${scaleWarning(source, width, height)}` };
    }
    throw Error('This limit cannot be reached with these settings. Allow smaller dimensions or use a larger KB limit.');
  } finally { source.width = source.height = 0; }
}
function scaleWarning(source: HTMLCanvasElement, w: number, h: number) {
  return w < source.width || h < source.height ? 'Check the form\'s minimum pixel dimensions as well as file size.' : 'Check the form\'s required pixel dimensions before uploading.';
}

export async function fitPdf(files: File[], cap: number, flatten: boolean, status: (s: string) => void): Promise<FitResult> {
  const opened: { file: File; doc?: Awaited<ReturnType<typeof openPdfjs>>['doc']; bitmap?: ImageBitmap }[] = [];
  let count = 0;
  try {
    // Open once; never retain full-page canvases across passes.
    for (const file of files) {
      status(`Opening ${file.name}`); await tick();
      if (isPdf(file)) {
        const { doc } = await openPdfjs(file); opened.push({ file, doc }); count += doc.numPages;
      } else { const b = await bitmap(file); opened.push({ file, bitmap: b }); count++; }
      if (count > LIMITS.pages) throw Error('Use at most 24 pages in one run. No pages have been dropped.');
    }
    if (files.every(isPdf)) {
      const merged = await PDFDocument.create();
      for (const f of files) {
        const src = await PDFDocument.load(await f.arrayBuffer());
        for (const page of await merged.copyPages(src, src.getPageIndices())) merged.addPage(page);
      }
      const b = new Blob([await merged.save() as BlobPart], { type: 'application/pdf' });
      if (b.size <= cap) return { blob: b, previews: [], note: `${count} pages combined without rasterising. Check page order in the downloaded PDF. Digital signatures, if any, are not preserved by merging.` };
    }
    if (files.some(isPdf) && !flatten) throw Error('The merged PDF is above the limit. Enable page-image conversion below to try a smaller file, or raise the KB limit.');
    const encode = async (dpi: number, quality: number, preview = false) => {
      const dst = await PDFDocument.create(), previews: Blob[] = [];
      let pageNo = 0;
      for (const item of opened) {
        const n = item.doc ? item.doc.numPages : 1;
        for (let i = 1; i <= n; i++) {
          status(`Trying ${dpi} dpi: page ${++pageNo} of ${count}`); await tick();
          let c: HTMLCanvasElement, w: number, h: number;
          if (item.doc) { const r = await renderPage(item.doc, i, dpi / 72); c = r.canvas; w = r.widthPt; h = r.heightPt; }
          else {
            const b = item.bitmap!, a4 = b.width > b.height ? [842, 595] : [595, 842];
            [w, h] = a4;
            const factor = Math.min(1, Math.max(w, h) * dpi / 72 / Math.max(b.width, b.height));
            c = sizeCanvas(b, b.width * factor, b.height * factor);
          }
          try {
            const jpg = await blob(c, 'image/jpeg', quality), img = await dst.embedJpg(await jpg.arrayBuffer());
            const p = dst.addPage([w, h]);
            const s = Math.min(w / c.width, h / c.height), pw = c.width * s, ph = c.height * s;
            p.drawImage(img, { x: (w-pw)/2, y: (h-ph)/2, width: pw, height: ph });
            if (preview) previews.push(jpg);
          } finally { c.width = c.height = 0; }
        }
      }
      return { blob: new Blob([await dst.save() as BlobPart], { type: 'application/pdf' }), previews };
    };
    let smallest = Infinity;
    for (const dpi of [144, 115, 92, 74, 59, 47]) {
      let best = await encode(dpi, .92), q = .92;
      if (best.blob.size > cap) {
        best = await encode(dpi, .38); q = .38; smallest = Math.min(smallest, best.blob.size);
        if (best.blob.size > cap) continue;
        let lo = .38, hi = .92;
        for (let k = 0; k < 5; k++) {
          const mid = (lo+hi)/2, next = await encode(dpi, mid);
          if (next.blob.size <= cap) { best = next; lo = mid; q = mid; } else hi = mid;
        }
      }
      const result = await encode(dpi, q, true);
      if (result.blob.size > cap) continue; // always verify final PDF, including its container overhead
      return { ...result, note: `${count} pages, ${dpi} dpi. ${dpi < 92 ? 'Low resolution: small writing may be hard to read. ' : ''}Pages are images. Searchable text, links, forms and digital signatures are not kept. Inspect every page before submitting.` };
    }
    throw Error(`Could not fit all ${count} pages without going below 47 dpi. Smallest attempt: ${(smallest/1000).toFixed(1)} KB. Use a higher limit or fewer pages. Nothing has been dropped.`);
  } finally {
    for (const item of opened) { item.bitmap?.close(); if (item.doc) await item.doc.destroy(); }
  }
          }
