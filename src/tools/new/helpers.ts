export async function bitmap(file: File) {
  if (file.size > 20 * 1024 * 1024) throw Error("Choose an image under 20 MB.");
  let b: ImageBitmap;
  try {
    b = await createImageBitmap(file);
  } catch {
    throw Error(
      "This image could not be decoded. Use a browser-supported JPG, PNG or WebP.",
    );
  }
  if (b.width * b.height > 24e6) {
    b.close();
    throw Error("Use an image under 24 megapixels.");
  }
  return b;
}
export const blob = (c: HTMLCanvasElement, type = "image/png", q = 0.95) =>
  new Promise<Blob>((ok, no) =>
    c.toBlob(
      (b) => (b ? ok(b) : no(Error("Could not export this image."))),
      type,
      q,
    ),
  );
export const canvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};
export function cropInk(source: HTMLCanvasElement) {
  const g = source.getContext("2d")!,
    d = g.getImageData(0, 0, source.width, source.height);
  let x0 = source.width,
    y0 = source.height,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < source.height; y++)
    for (let x = 0; x < source.width; x++) {
      if (d.data[(y * source.width + x) * 4 + 3] > 8) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    }
  if (x1 < 0)
    throw Error(
      "No visible ink found. Draw a signature or increase the threshold.",
    );
  const pad = 8,
    x = Math.max(0, x0 - pad),
    y = Math.max(0, y0 - pad),
    c = canvas(
      Math.min(source.width, x1 + pad + 1) - x,
      Math.min(source.height, y1 + pad + 1) - y,
    );
  c.getContext("2d")!.drawImage(
    source,
    x,
    y,
    c.width,
    c.height,
    0,
    0,
    c.width,
    c.height,
  );
  return c;
}
