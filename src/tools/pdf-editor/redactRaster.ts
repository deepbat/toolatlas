// Whole-document raster rebuild. No original PDF objects are copied.
// Reuses the bounded renderer used by the dedicated True PDF Redactor.
import { PDFDocument } from 'pdf-lib';
import { pdfjs } from './pdfjs';
import { renderPage } from '../../lib/pdfio';
import type { AnnMap } from './model';

export async function rasterRedactedPdf(bytes: Uint8Array, annots: AnnMap): Promise<Uint8Array> {
  const source = await pdfjs().getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  try {
    const output = await PDFDocument.create();
    for (let n = 1; n <= source.numPages; n++) {
      const rendered = await renderPage(source, n, 2);
      try {
        // Apply masks last, after form appearances and every other annotation.
        const ctx = rendered.canvas.getContext('2d');
        if (!ctx) throw Error('Could not draw the redacted page. No file was saved.');
        ctx.fillStyle = '#000000';
        for (const a of annots[n - 1] ?? []) {
          if (a.kind !== 'rect' || a.mode !== 'redact') continue;
          const sx = rendered.canvas.width / rendered.widthPt;
          const sy = rendered.canvas.height / rendered.heightPt;
          const left = Math.floor(a.x * sx), top = Math.floor(a.y * sy);
          ctx.fillRect(left, top, Math.ceil((a.x + a.w) * sx) - left, Math.ceil((a.y + a.h) * sy) - top);
        }
        const blob = await new Promise<Blob>((resolve, reject) => rendered.canvas.toBlob(
          b => b ? resolve(b) : reject(Error('Could not encode the redacted page. No file was saved.')), 'image/png'
        ));
        const image = await output.embedPng(await blob.arrayBuffer());
        output.addPage([rendered.widthPt, rendered.heightPt]).drawImage(image, {
          x: 0, y: 0, width: rendered.widthPt, height: rendered.heightPt,
        });
      } finally {
        rendered.canvas.width = 0;
        rendered.canvas.height = 0;
      }
    }
    return await output.save();
  } finally {
    await source.destroy();
  }
}
