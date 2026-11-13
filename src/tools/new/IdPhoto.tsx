import { useEffect, useRef, useState } from "react";
import {
  Button,
  Field,
  Grid,
  Input,
  Note,
  Panel,
  Select,
  Toggle,
} from "../../components/ui";
import { downloadBlob } from "../../lib/utils";
import { bitmap, blob, canvas } from "./helpers";
const PRESETS = {
  standard: { w: 35, h: 45, label: "35 × 45 mm (UK / common ID format)" },
  us: { w: 50.8, h: 50.8, label: "2 × 2 inch (US format, 50.8 × 50.8 mm)" },
  custom: { w: 35, h: 45, label: "Custom dimensions" },
};
const px = (mm: number) => Math.round((mm / 25.4) * 300);
export default function IdPhoto() {
  const image = useRef<ImageBitmap | null>(null),
    cv = useRef<HTMLCanvasElement>(null),
    drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
      null,
    );
  const [loaded, setLoaded] = useState(0),
    [preset, setPreset] = useState("standard"),
    [w, setW] = useState("35"),
    [h, setH] = useState("45"),
    [zoom, setZoom] = useState(1),
    [off, setOff] = useState({ x: 0, y: 0 }),
    [paper, setPaper] = useState("4x6"),
    [guide, setGuide] = useState(true),
    [error, setError] = useState("");
  const p = PRESETS[preset as keyof typeof PRESETS],
    mmW = preset === "custom" ? Number(w) : p.w,
    mmH = preset === "custom" ? Number(h) : p.h;
  const valid =
    Number.isFinite(mmW) &&
    Number.isFinite(mmH) &&
    mmW >= 10 &&
    mmH >= 10 &&
    mmW <= 120 &&
    mmH <= 160;
  const W = paper === "a4" ? 210 : 101.6,
    H = paper === "a4" ? 297 : 152.4;
  const cols = valid ? Math.max(0, Math.floor((W - 10 + 2) / (mmW + 2))) : 0,
    rows = valid ? Math.max(0, Math.floor((H - 10 + 2) / (mmH + 2))) : 0;
  const draw = (
    c: HTMLCanvasElement,
    width: number,
    height: number,
    guides = false,
  ) => {
    const im = image.current;
    if (!im || !valid) return;
    c.width = width;
    c.height = height;
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, width, height);
    const k = Math.max(width / im.width, height / im.height) * zoom,
      iw = im.width * k,
      ih = im.height * k;
    g.drawImage(
      im,
      (width - iw) / 2 + off.x * width,
      (height - ih) / 2 + off.y * height,
      iw,
      ih,
    );
    if (guides) {
      g.strokeStyle = "#10a55a";
      g.lineWidth = 1;
      g.setLineDash([5, 4]);
      g.beginPath();
      g.moveTo(0, height * 0.4);
      g.lineTo(width, height * 0.4);
      g.moveTo(width / 2, 0);
      g.lineTo(width / 2, height);
      g.ellipse(
        width / 2,
        height * 0.43,
        width * 0.28,
        height * 0.31,
        0,
        0,
        Math.PI * 2,
      );
      g.stroke();
    }
  };
  useEffect(() => {
    if (cv.current && loaded && valid)
      draw(cv.current, Math.round((300 * mmW) / mmH), 300, guide);
  }, [loaded, valid, mmW, mmH, zoom, off, guide]);
  useEffect(() => () => image.current?.close(), []);
  const choose = async (f?: File) => {
    if (!f) return;
    try {
      setError("");
      const b = await bitmap(f);
      image.current?.close();
      image.current = b;
      setLoaded((n) => n + 1);
      setZoom(1);
      setOff({ x: 0, y: 0 });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const sheet = () => {
    if (!valid || !cols || !rows)
      throw Error(
        "The photo does not fit this sheet. Reduce its dimensions or use A4.",
      );
    const c = canvas(px(W), px(H)),
      g = c.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    const one = canvas(px(mmW), px(mmH));
    draw(one, one.width, one.height);
    const x0 = (W - (cols * mmW + (cols - 1) * 2)) / 2,
      y0 = (H - (rows * mmH + (rows - 1) * 2)) / 2;
    g.strokeStyle = "#999";
    g.lineWidth = 1;
    for (let r = 0; r < rows; r++)
      for (let q = 0; q < cols; q++) {
        const x = px(x0 + q * (mmW + 2)),
          y = px(y0 + r * (mmH + 2));
        g.drawImage(one, x, y);
        g.strokeRect(x, y, one.width, one.height);
      }
    return c;
  };
  const exportSheet = async (pdf: boolean) => {
    try {
      setError("");
      const c = sheet(),
        b = await blob(c, "image/jpeg");
      if (pdf) {
        const { PDFDocument } = await import("pdf-lib");
        const doc = await PDFDocument.create(),
          im = await doc.embedJpg(await b.arrayBuffer());
        doc
          .addPage([(W / 25.4) * 72, (H / 25.4) * 72])
          .drawImage(im, {
            x: 0,
            y: 0,
            width: (W / 25.4) * 72,
            height: (H / 25.4) * 72,
          });
        downloadBlob(
          "id-photo-sheet.pdf",
          new Blob([(await doc.save()) as BlobPart], {
            type: "application/pdf",
          }),
        );
      } else downloadBlob("id-photo-sheet-300ppi.jpg", b);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="space-y-4">
      <Panel title="Choose a portrait">
        <Input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Upload portrait"
          onChange={(e) => void choose(e.target.files?.[0])}
        />
        <Note>
          Dimensions are presets, not a guarantee of acceptance. India passport,
          visa and other ID requirements differ by application. Check the
          issuing authority's current size, face and background rules. The 35×45
          mm preset is not universal for India. No automatic background removal
          or face validation.
        </Note>
      </Panel>
      {loaded > 0 && (
        <Panel
          title="Crop & print layout"
          description="Drag to position. Use the sliders for keyboard-accessible positioning."
        >
          <Grid>
            <div>
              <canvas
                ref={cv}
                aria-label="ID photo crop preview"
                className="mx-auto max-h-96 max-w-full touch-none border border-line"
                data-testid="id-photo-canvas"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  drag.current = {
                    x: e.clientX,
                    y: e.clientY,
                    ox: off.x,
                    oy: off.y,
                  };
                }}
                onPointerMove={(e) => {
                  if (!drag.current) return;
                  const r = e.currentTarget.getBoundingClientRect();
                  setOff({
                    x: Math.max(
                      -1,
                      Math.min(
                        1,
                        drag.current.ox +
                          (e.clientX - drag.current.x) / r.width,
                      ),
                    ),
                    y: Math.max(
                      -1,
                      Math.min(
                        1,
                        drag.current.oy +
                          (e.clientY - drag.current.y) / r.height,
                      ),
                    ),
                  });
                }}
                onPointerUp={() => (drag.current = null)}
                onPointerCancel={() => (drag.current = null)}
              />
            </div>
            <div className="space-y-4">
              <Field label="Photo preset">
                <Select
                  value={preset}
                  onChange={(e) => {
                    setPreset(e.target.value);
                    setOff({ x: 0, y: 0 });
                  }}
                >
                  {Object.entries(PRESETS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </Select>
              </Field>
              {preset === "custom" && (
                <Grid>
                  <Field label="Width (mm)">
                    <Input
                      type="number"
                      value={w}
                      onChange={(e) => setW(e.target.value)}
                    />
                  </Field>
                  <Field label="Height (mm)">
                    <Input
                      type="number"
                      value={h}
                      onChange={(e) => setH(e.target.value)}
                    />
                  </Field>
                </Grid>
              )}
              {[
                ["Zoom", zoom, 1, 4, (v: number) => setZoom(v)],
                [
                  "Horizontal position",
                  off.x,
                  -1,
                  1,
                  (v: number) => setOff({ ...off, x: v }),
                ],
                [
                  "Vertical position",
                  off.y,
                  -1,
                  1,
                  (v: number) => setOff({ ...off, y: v }),
                ],
              ].map(([label, value, min, max, set]) => (
                <Field key={String(label)} label={String(label)}>
                  <Input
                    type="range"
                    step="0.01"
                    min={Number(min)}
                    max={Number(max)}
                    value={Number(value)}
                    onChange={(e) =>
                      (set as (v: number) => void)(Number(e.target.value))
                    }
                  />
                </Field>
              ))}
              <Toggle
                label="Face alignment guides (not exported)"
                checked={guide}
                onChange={setGuide}
              />
              <Field label="Print paper">
                <Select
                  value={paper}
                  onChange={(e) => setPaper(e.target.value)}
                >
                  <option value="4x6">4 × 6 inch</option>
                  <option value="a4">A4, 210 × 297 mm</option>
                </Select>
              </Field>
              <p className="text-xs text-muted">
                {valid
                  ? `${cols * rows} copies · ${px(mmW)} × ${px(mmH)} pixels per photo at 300 pixels/inch.`
                  : "Use width 10–120 mm and height 10–160 mm."}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!valid || !cols || !rows}
                  onClick={() => void exportSheet(false)}
                >
                  Download sheet JPG
                </Button>
                <Button
                  variant="secondary"
                  disabled={!valid || !cols || !rows}
                  onClick={() => void exportSheet(true)}
                >
                  Download sheet PDF
                </Button>
              </div>
            </div>
          </Grid>
          <p className="mt-4 text-xs text-muted">
            Print PDF at Actual Size / 100%, with no fit-to-page scaling. JPG
            pixel dimensions represent 300 pixels/inch but browser JPEG encoders
            may write 96 dpi metadata, so set the paper dimensions manually. PDF
            fixes physical size. Guides do not appear in exports. Max 20 MB / 24
            megapixels.
          </p>
        </Panel>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
