import { useRef, useState } from "react";
import { Button, Field, Grid, Input, Note, Panel, Select, Toggle } from "../../components/ui";
import { downloadBlob } from "../../lib/utils";
import { openPdfjs, renderPage } from "../../lib/pdfio";
import { bitmap, blob, canvas } from "./helpers";
import { A4, Box, CARD_PX, CR80, LAYOUTS, PerSheet, findCardBoxes, sheetCells } from "./pvc";

type Found = { id: number; src: HTMLCanvasElement; box: Box; role: "front" | "back" | "skip"; label: string };
const mmPx = (mm: number) => Math.round((mm / 25.4) * 300);

function cardCanvas(f: Found, trim: number, rotate: boolean) {
  const t = trim / 100, b = f.box;
  let sx = b.x + b.w * t, sy = b.y + b.h * t, sw = b.w * (1 - 2 * t), sh = b.h * (1 - 2 * t);
  const c = canvas(CARD_PX.w, CARD_PX.h), g = c.getContext("2d")!;
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  const portrait = sh > sw;
  if (portrait || rotate) {
    g.save(); g.translate(c.width / 2, c.height / 2); g.rotate(Math.PI / 2);
    const cw = c.height, ch = c.width;
    g.drawImage(f.src, sx, sy, sw, sh, -cw / 2, -ch / 2, cw, ch);
    g.restore();
  } else g.drawImage(f.src, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

export default function PvcCard() {
  const [cards, setCards] = useState<Found[]>([]);
  const [trim, setTrim] = useState(0);
  const [per, setPer] = useState<PerSheet>(10);
  const [copies, setCopies] = useState(1);
  const [guides, setGuides] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const seq = useRef(0);

  const load = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(""); setNote(""); setBusy(true);
    try {
      const found: Found[] = [];
      for (const file of Array.from(files)) {
        const pages: HTMLCanvasElement[] = [];
        if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
          const { doc } = await openPdfjs(file);
          for (let p = 1; p <= Math.min(doc.numPages, 6); p++) pages.push((await renderPage(doc, p, 300 / 72)).canvas);
        } else {
          const bm = await bitmap(file), c = canvas(bm.width, bm.height);
          c.getContext("2d")!.drawImage(bm, 0, 0); bm.close(); pages.push(c);
        }
        pages.forEach((src, pi) => {
          const data = src.getContext("2d")!.getImageData(0, 0, src.width, src.height);
          let boxes = findCardBoxes(data.data, src.width, src.height);
          if (!boxes.length) boxes = [{ x: 0, y: 0, w: src.width, h: src.height }];
          boxes.forEach((box, bi) => found.push({ id: ++seq.current, src, box, role: "skip", label: `${file.name}${pages.length > 1 ? ` p${pi + 1}` : ""} #${bi + 1}` }));
        });
      }
      found.slice(0, 1).forEach((f) => (f.role = "front"));
      found.slice(1, 2).forEach((f) => (f.role = "back"));
      setCards(found.slice(0, 24));
      setNote(`Found ${found.length} card area${found.length === 1 ? "" : "s"}. Check the roles below, then export.`);
    } catch (e) {
      setError((e as Error).message); setCards([]);
    } finally { setBusy(false); }
  };

  const front = cards.find((c) => c.role === "front"), back = cards.find((c) => c.role === "back");
  const render = (f: Found) => cardCanvas(f, trim, false);

  const single = async (f: Found, name: string) => {
    try { downloadBlob(name, await blob(render(f), "image/png")); } catch (e) { setError((e as Error).message); }
  };

  const sheet = async () => {
    try {
      setError("");
      if (!front) throw Error("Mark one card as Front first.");
      const rows = LAYOUTS[per], cells = sheetCells(rows);
      const fi = render(front), bi = back ? render(back) : null;
      const pages = Math.max(1, Math.min(20, copies));
      const { PDFDocument } = await import("pdf-lib");
      const doc = await PDFDocument.create();
      for (let p = 0; p < pages; p++) {
        const c = canvas(mmPx(A4.w), mmPx(A4.h)), g = c.getContext("2d")!;
        g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
        for (const cell of cells) {
          const img = cell.col === 1 && bi ? bi : fi;
          const x = mmPx(cell.x), y = mmPx(cell.y);
          g.drawImage(img, x, y, mmPx(CR80.w), mmPx(CR80.h));
          if (guides) { g.strokeStyle = "#999"; g.lineWidth = 1; g.strokeRect(x, y, mmPx(CR80.w), mmPx(CR80.h)); }
        }
        const jpg = await doc.embedJpg(await (await blob(c, "image/jpeg", 0.95)).arrayBuffer());
        doc.addPage([(A4.w / 25.4) * 72, (A4.h / 25.4) * 72]).drawImage(jpg, { x: 0, y: 0, width: (A4.w / 25.4) * 72, height: (A4.h / 25.4) * 72 });
      }
      downloadBlob("pvc-cards-a4-300dpi.pdf", new Blob([(await doc.save()) as BlobPart], { type: "application/pdf" }));
    } catch (e) { setError((e as Error).message); }
  };

  const setRole = (id: number, role: Found["role"]) =>
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, role } : role !== "skip" && c.role === role ? { ...c, role: "skip" } : c)));

  return (
    <div className="space-y-4">
      <Panel title="Upload ID card PDF or photos" description="Aadhaar, PAN, Ayushman, voter ID, driving licence. Front and back can be on the same page.">
        <Input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" aria-label="Upload card PDF or image" onChange={(e) => void load(e.target.files)} />
        {busy && <p role="status">Detecting cards...</p>}
        {note && <p role="status" data-testid="pvc-note">{note}</p>}
        {error && <Note tone="warning">{error}</Note>}
        <Note>Everything stays on your device. Password-protected PDFs (many e-Aadhaar files) cannot be opened here: remove the password in the app that made it, then upload again. Only print ID cards that belong to you or that you are authorised to print.</Note>
      </Panel>
      {cards.length > 0 && (
        <Panel title="Detected cards" description="Each area is cropped to CR80 size (85.6 × 54 mm) at 300 DPI. Portrait areas are rotated to landscape.">
          <div className="grid gap-3 sm:grid-cols-2" data-testid="pvc-cards">
            {cards.map((c) => (
              <div key={c.id} className="rounded border border-line p-2 space-y-2">
                <canvas
                  aria-label={`Preview of ${c.label}`}
                  className="mx-auto max-h-40 max-w-full"
                  ref={(el) => { if (el) { const r = cardCanvas(c, trim, false); el.width = r.width; el.height = r.height; el.getContext("2d")!.drawImage(r, 0, 0); } }}
                />
                <Field label={c.label}>
                  <Select value={c.role} onChange={(e) => setRole(c.id, e.target.value as Found["role"])} aria-label={`Role of ${c.label}`}>
                    <option value="front">Front</option><option value="back">Back</option><option value="skip">Skip</option>
                  </Select>
                </Field>
                <Button variant="secondary" size="sm" onClick={() => void single(c, "card-300dpi.png")}>Download PNG</Button>
              </div>
            ))}
          </div>
        </Panel>
      )}
      {cards.length > 0 && (
        <Panel title="A4 print sheet">
          <Grid>
            <Field label="Cards per sheet">
              <Select value={per} onChange={(e) => setPer(Number(e.target.value) as PerSheet)} aria-label="Cards per sheet">
                <option value={2}>2 (1 front + back pair)</option><option value={4}>4 (2 pairs)</option><option value={10}>10 (5 pairs)</option>
              </Select>
            </Field>
            <Field label={`Edge trim: ${trim}%`}>
              <input type="range" min={0} max={8} step={0.5} value={trim} aria-label="Edge trim percent" onChange={(e) => setTrim(Number(e.target.value))} />
            </Field>
            <Field label="Sheets">
              <Input type="number" min={1} max={20} value={copies} aria-label="Number of sheets" onChange={(e) => setCopies(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} />
            </Field>
            <Toggle checked={guides} onChange={setGuides} label="Cut guides" />
          </Grid>
          <Button onClick={() => void sheet()} disabled={!front}>Download A4 PDF (300 DPI)</Button>
          {!back && <Note>No back selected: the front is repeated in both columns.</Note>}
        </Panel>
      )}
    </div>
  );
}
