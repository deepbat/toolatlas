// Cropped pages must be rendered before embedding: vector Form clipping can
// expose boundary pixels from artwork outside CropBox in independent readers.
import { PDFDocument } from 'pdf-lib';
import { renderPage } from '../../lib/pdfio';
import { pdfjs } from '../pdf-editor/pdfjs';
import { croppedLayoutPages } from './ops';

export async function prepareLayoutPdf(bytes: Uint8Array): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes);
  const cropped = new Set(croppedLayoutPages(src));
  if (!cropped.size) return bytes;
  const reader = await pdfjs().getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  try {
    const out = await PDFDocument.create();
    for (let i = 0; i < src.getPageCount(); i++) {
      if (!cropped.has(i)) {
        const [p] = await out.copyPages(src, [i]); out.addPage(p); continue;
      }
      const r = await renderPage(reader, i + 1, 2);
      try {
        const blob = await new Promise<Blob>((resolve, reject) => r.canvas.toBlob(b => b ? resolve(b) : reject(Error('Could not encode a cropped page. No file was saved.')), 'image/png'));
        const image = await out.embedPng(await blob.arrayBuffer());
        out.addPage([r.widthPt, r.heightPt]).drawImage(image, { x:0, y:0, width:r.widthPt, height:r.heightPt });
      } finally { r.canvas.width = 0; r.canvas.height = 0; }
    }
    return await out.save();
  } finally { await reader.destroy(); }
}
