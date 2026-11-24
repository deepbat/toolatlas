import { PDFDocument, PDFArray, rgb } from 'pdf-lib';

/** Add a vector underlay without rebuilding pages or changing their visible boxes. */
export async function addPdfBackground(bytes: Uint8Array, color: [number, number, number]) {
  const doc = await PDFDocument.load(bytes);
  for (const page of doc.getPages()) {
    const box = page.getMediaBox();
    // A newly loaded page gets a fresh content stream when drawn on. Move
    // that self-contained stream before the existing artwork, including on
    // blank pages. The original crop, rotation, forms and annotations stay.
    page.drawRectangle({ x: box.x, y: box.y, width: box.width, height: box.height, color: rgb(...color) });
    const contents = page.node.Contents() as PDFArray;
    const last = contents.size() - 1, stream = contents.get(last);
    contents.remove(last); contents.insert(0, stream);
  }
  return doc.save();
}
