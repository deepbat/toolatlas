import { useEffect, useRef, useState } from "react";
import { Button, Field, Grid, Input, Panel, Note } from "../../components/ui";
import { downloadBlob } from "../../lib/utils";
import { bitmap, blob, canvas, cropInk } from "./helpers";
export default function Signature() {
  const cv = useRef<HTMLCanvasElement>(null),
    source = useRef<HTMLCanvasElement | null>(null),
    drawing = useRef(false),
    last = useRef({ x: 0, y: 0 });
  const [color, setColor] = useState("#102a43"),
    [width, setWidth] = useState(3),
    [threshold, setThreshold] = useState(210),
    [mode, setMode] = useState("draw"),
    [error, setError] = useState(""),
    [url, setUrl] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  useEffect(() => {
    if (mode !== "upload" || !source.current || !cv.current) return;
    const c = cv.current;
    c.width = source.current.width;
    c.height = source.current.height;
    const g = c.getContext("2d")!;
    g.drawImage(source.current, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height);
    const rgb = color.match(/\w\w/g)!.map((s) => parseInt(s, 16));
    for (let i = 0; i < d.data.length; i += 4) {
      const l =
        0.2126 * d.data[i] + 0.7152 * d.data[i + 1] + 0.0722 * d.data[i + 2];
      d.data[i + 3] =
        l >= threshold
          ? 0
          : Math.round(d.data[i + 3] * Math.min(1, (threshold - l) / 30));
      d.data[i] = rgb[0];
      d.data[i + 1] = rgb[1];
      d.data[i + 2] = rgb[2];
    }
    g.putImageData(d, 0, 0);
  }, [mode, threshold, color, revision]);
  const choose = async (file?: File) => {
    if (!file) return;
    try {
      setError("");
      const img = await bitmap(file);
      const scale = Math.min(1, 1600 / img.width, 800 / img.height);
      const c = canvas(
        Math.round(img.width * scale),
        Math.round(img.height * scale),
      );
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      img.close();
      source.current = c;
      setMode("upload");
      setRevision((n) => n + 1);
      setUrl("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = cv.current!,
      r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * c.width) / r.width,
      y: ((e.clientY - r.top) * c.height) / r.height,
    };
  };
  const reset = () => {
    setMode("draw");
    setUrl("");
    const c = cv.current!;
    c.width = 900;
    c.height = 300;
    source.current = null;
  };
  return (
    <div className="space-y-4">
      <Panel
        title="Draw or upload a signature"
        description="The checkerboard shows transparency. Your signature stays on this device."
      >
        <Grid>
          <Field label="Upload a signature scan">
            <Input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => void choose(e.target.files?.[0])}
            />
          </Field>
          <Field label="Ink colour">
            <Input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </Field>
          <Field label={"Pen thickness: " + width}>
            <Input
              type="range"
              min="1"
              max="12"
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
            />
          </Field>
          {mode === "upload" && (
            <Field label={"Paper threshold: " + threshold}>
              <Input
                type="range"
                min="50"
                max="255"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
              />
            </Field>
          )}
        </Grid>
        <canvas
          ref={cv}
          width="900"
          height="300"
          aria-label="Signature drawing canvas"
          data-testid="signature-canvas"
          className="my-4 w-full touch-none border border-line"
          style={{
            backgroundColor: "#fff",
            backgroundImage:
              "conic-gradient(#ddd 25%,transparent 0 50%,#ddd 0 75%,transparent 0)",
            backgroundSize: "16px 16px",
            aspectRatio: "3/1",
          }}
          onPointerDown={(e) => {
            if (mode !== "draw") return;
            e.currentTarget.setPointerCapture(e.pointerId);
            drawing.current = true;
            last.current = point(e);
            const g = cv.current!.getContext("2d")!;
            g.fillStyle = color;
            g.beginPath();
            g.arc(last.current.x, last.current.y, width / 2, 0, Math.PI * 2);
            g.fill();
          }}
          onPointerMove={(e) => {
            if (!drawing.current || mode !== "draw") return;
            const p = point(e),
              g = cv.current!.getContext("2d")!;
            g.strokeStyle = color;
            g.lineWidth = width;
            g.lineCap = "round";
            g.lineJoin = "round";
            g.beginPath();
            g.moveTo(last.current.x, last.current.y);
            g.lineTo(p.x, p.y);
            g.stroke();
            last.current = p;
            setUrl("");
          }}
          onPointerUp={() => (drawing.current = false)}
          onPointerCancel={() => (drawing.current = false)}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={reset}>
            Clear / Draw new
          </Button>
          <Button
            onClick={async () => {
              try {
                setError("");
                const b = await blob(cropInk(cv.current!));
                setUrl(URL.createObjectURL(b));
                downloadBlob("signature-transparent.png", b);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Download Transparent PNG
          </Button>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-danger">
            {error}
          </p>
        )}
      </Panel>
      {url && (
        <Panel title="Auto-cropped transparent signature">
          <img
            src={url}
            className="max-h-48 max-w-full border border-line bg-white p-4"
            alt="Cropped signature result"
          />
        </Panel>
      )}
      <Note>
        Upload JPG, PNG or WebP up to 20 MB / 24 megapixels. Background removal
        uses brightness, not AI. Shadows or coloured paper may need a higher
        threshold. This creates an image, not a certified digital signature.
      </Note>
    </div>
  );
}
