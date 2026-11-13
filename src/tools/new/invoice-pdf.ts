import { PDFDocument } from "pdf-lib";
export type InvoiceRow = {
  name: string;
  quantity: string;
  price: string;
  tax: string;
};
export type InvoiceData = {
  type: string;
  seller: string;
  buyer: string;
  number: string;
  date: string;
  currency: string;
  notes: string;
  rows: InvoiceRow[];
  logo: string;
};
export const rowAmounts = (r: InvoiceRow) => {
  const net = Math.round(Number(r.quantity) * Number(r.price) * 100);
  const tax = Math.round((net * Number(r.tax)) / 100);
  return { net, tax, total: net + tax };
};
export const invoiceTotals = (rows: InvoiceRow[]) =>
  rows.reduce(
    (s, r) => {
      const a = rowAmounts(r);
      return {
        net: s.net + a.net,
        tax: s.tax + a.tax,
        total: s.total + a.total,
      };
    },
    { net: 0, tax: 0, total: 0 },
  );
export async function invoicePDF(d: InvoiceData): Promise<Blob> {
  await document.fonts.ready;
  const doc = await PDFDocument.create();
  const W = 794,
    H = 1123,
    S = 200 / 96;
  let c!: HTMLCanvasElement,
    g!: CanvasRenderingContext2D,
    y = 0;
  const pages: HTMLCanvasElement[] = [];
  const newPage = () => {
    c = document.createElement("canvas");
    c.width = Math.round(W * S);
    c.height = Math.round(H * S);
    g = c.getContext("2d")!;
    g.scale(S, S);
    g.fillStyle = "#fff";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#102a43";
    g.font = 'bold 26px "DM Sans", sans-serif';
    g.fillText(d.type.toUpperCase(), 48, 65);
    g.font = '12px "DM Sans", sans-serif';
    g.fillText(`${d.number} · ${d.date}`, 48, 88, W - 270);
    g.strokeStyle = "#d9e2ec";
    g.beginPath();
    g.moveTo(48, 105);
    g.lineTo(W - 48, 105);
    g.stroke();
    y = 135;
    pages.push(c);
  };
  const lines = (text: string, max: number, size = 12) => {
    g.font = `${size}px "DM Sans", sans-serif`;
    const out: string[] = [];
    for (const paragraph of text.split("\n")) {
      let line = "";
      for (const char of paragraph) {
        if (g.measureText(line + char).width > max && line) {
          out.push(line);
          line = "";
        }
        line += char;
      }
      out.push(line);
    }
    return out;
  };
  const write = (
    text: string,
    x: number,
    width: number,
    size = 12,
    bold = false,
  ) => {
    const ls = lines(text, width, size);
    g.fillStyle = "#102a43";
    g.font = `${bold ? "bold " : ""}${size}px "DM Sans", sans-serif`;
    ls.forEach((line, i) => g.fillText(line, x, y + i * (size + 6)));
    return ls.length * (size + 6);
  };
  const need = (height: number) => {
    if (y + height > H - 65) newPage();
  };
  newPage();
  if (d.logo) {
    const im = new Image();
    im.src = d.logo;
    await im.decode();
    const k = Math.min(140 / im.width, 65 / im.height);
    g.drawImage(im, W - 48 - im.width * k, 36, im.width * k, im.height * k);
  }
  if (lines(d.seller, 310).length > 35 || lines(d.buyer, 310).length > 35)
    throw Error(
      "Business or client details are too long for an invoice header. Use fewer than 35 lines.",
    );
  g.font = 'bold 11px "DM Sans", sans-serif';
  g.fillText("FROM", 48, y);
  g.fillText(
    d.type === "Quotation" ? "PREPARED FOR" : "BILL TO",
    W / 2 + 15,
    y,
  );
  y += 23;
  const lh = write(d.seller, 48, 310),
    rh = write(d.buyer, W / 2 + 15, 310);
  y += Math.max(lh, rh) + 28;
  const header = () => {
    g.fillStyle = "#eef3f7";
    g.fillRect(48, y - 16, W - 96, 30);
    g.fillStyle = "#102a43";
    g.font = 'bold 11px "DM Sans", sans-serif';
    for (const [t, x] of [
      ["Description", 56],
      ["Qty", 397],
      ["Rate", 455],
      ["Tax %", 560],
      ["Total", 642],
    ] as [string, number][])
      g.fillText(t, x, y + 3);
    y += 35;
  };
  header();
  for (const r of d.rows) {
    const desc = lines(r.name, 316, 12),
      height = Math.max(38, desc.length * 18 + 12);
    if (y + height > H - 80) {
      newPage();
      header();
    }
    g.fillStyle = "#102a43";
    g.font = '12px "DM Sans", sans-serif';
    desc.forEach((l, i) => g.fillText(l, 56, y + i * 18));
    const a = rowAmounts(r);
    g.fillText(r.quantity, 397, y, 48);
    g.fillText(Number(r.price).toFixed(2), 455, y, 95);
    g.fillText(r.tax, 560, y);
    g.fillText((a.total / 100).toFixed(2), 642, y, 100);
    y += height;
    g.strokeStyle = "#d9e2ec";
    g.beginPath();
    g.moveTo(48, y - 12);
    g.lineTo(W - 48, y - 12);
    g.stroke();
  }
  const totals = invoiceTotals(d.rows);
  need(130);
  y += 15;
  for (const [label, value] of [
    ["Subtotal", totals.net],
    ["Tax", totals.tax],
    ["Total", totals.total],
  ] as [string, number][]) {
    g.fillStyle = "#102a43";
    g.font =
      label === "Total"
        ? 'bold 18px "DM Sans", sans-serif'
        : '13px "DM Sans", sans-serif';
    g.fillText(label, 460, y);
    g.textAlign = "right";
    g.fillText(d.currency + " " + (value / 100).toFixed(2), W - 48, y);
    g.textAlign = "left";
    y += 29;
  }
  if (d.notes) {
    need(60);
    y += 20;
    g.font = 'bold 11px "DM Sans", sans-serif';
    g.fillText("NOTES / TERMS", 48, y);
    y += 24;
    const ls = lines(d.notes, W - 96, 12);
    for (const l of ls) {
      need(24);
      g.fillStyle = "#102a43";
      g.font = '12px "DM Sans", sans-serif';
      g.fillText(l, 48, y);
      y += 18;
    }
  }
  for (let i = 0; i < pages.length; i++) {
    const cv = pages[i],
      ctx = cv.getContext("2d")!;
    ctx.save();
    ctx.setTransform(S, 0, 0, S, 0, 0);
    ctx.fillStyle = "#627d98";
    ctx.font = '10px "DM Sans", sans-serif';
    ctx.fillText(
      `Page ${i + 1} of ${pages.length} · ${d.type} ${d.number}`,
      48,
      H - 30,
    );
    ctx.restore();
    const png = await doc.embedPng(cv.toDataURL("image/png"));
    doc
      .addPage([595.28, 841.89])
      .drawImage(png, { x: 0, y: 0, width: 595.28, height: 841.89 });
  }
  return new Blob([(await doc.save()) as BlobPart], {
    type: "application/pdf",
  });
}
