// Pull the pictures out of one PDF page (pdf.js operator list) so PDF to Word can place them in the document.
// Only pictures drawn as images are found. Vector drawings, charts built from lines, masks and 1-bit images are not.

export interface PageImage { png: Uint8Array; top: number; left: number; w: number; h: number } // points, PDF coordinates (y up)

type Mat = [number, number, number, number, number, number];
const mul = (m: Mat, n: Mat): Mat => [
  n[0] * m[0] + n[1] * m[2], n[0] * m[1] + n[1] * m[3],
  n[2] * m[0] + n[3] * m[2], n[2] * m[1] + n[3] * m[3],
  n[4] * m[0] + n[5] * m[2] + m[4], n[4] * m[1] + n[5] * m[3] + m[5],
];

async function toPng(img: any): Promise<Uint8Array | null> {
  const w = img.width, h = img.height;
  if (!w || !h || w * h > 36_000_000) return null;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  if (img.bitmap) ctx.drawImage(img.bitmap, 0, 0);
  else if (img.data && (img.kind === 2 || img.kind === 3)) {
    const out = ctx.createImageData(w, h);
    if (img.kind === 3) out.data.set(img.data.subarray(0, w * h * 4));
    else for (let i = 0, j = 0; i < w * h; i++, j += 3) { out.data[i * 4] = img.data[j]; out.data[i * 4 + 1] = img.data[j + 1]; out.data[i * 4 + 2] = img.data[j + 2]; out.data[i * 4 + 3] = 255; }
    ctx.putImageData(out, 0, 0);
  } else return null;
  const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}

/** Pictures on a page, skipping tiny ones and page-sized ones (a scan under a text layer would just repeat the text). */
export async function pageImages(pdfjs: any, page: any): Promise<PageImage[]> {
  const OPS = pdfjs.OPS;
  const ops = await page.getOperatorList();
  const [vx0, vy0, vx1, vy1] = page.view as number[];
  const pageArea = (vx1 - vx0) * (vy1 - vy0);
  const found: PageImage[] = [];
  const stack: Mat[] = [];
  let ctm: Mat = [1, 0, 0, 1, 0, 0];
  for (let i = 0; i < ops.fnArray.length && found.length < 40; i++) {
    const fn = ops.fnArray[i], args = ops.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = mul(ctm, args as Mat);
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
      const w = Math.hypot(ctm[0], ctm[1]), h = Math.hypot(ctm[2], ctm[3]);
      if (w < 24 || h < 24 || (w * h) / pageArea > 0.85) continue;
      let img: any = null;
      try {
        if (fn === OPS.paintInlineImageXObject) img = args[0];
        else img = await new Promise((res) => { try { page.objs.get(args[0], res); } catch { res(null); } });
      } catch { img = null; }
      if (!img) continue;
      const png = await toPng(img).catch(() => null);
      if (!png) continue;
      // The unit square maps to the picture: its lower-left corner is (e, f), and d > 0 means it is upright.
      const top = ctm[3] >= 0 ? ctm[5] + h : ctm[5];
      found.push({ png, top, left: ctm[4], w, h });
    }
  }
  return found;
}
