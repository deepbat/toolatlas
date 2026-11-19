import { useEffect, useRef, useState } from 'react';
import { Button, Dropzone, Field, Panel } from '../../components/ui';
import { downloadBlob } from '../../lib/utils';


const BACKGROUNDS = [
  { id: 'paper', label: 'Warm Paper', a: '#f5f2eb', b: '#e8e2d5' },
  { id: 'slate', label: 'Studio Slate', a: '#1e242c', b: '#101419' },
  { id: 'sage', label: 'Soft Sage', a: '#dce7e0', b: '#c2d6ca' },
  { id: 'sunset', label: 'Signal Warm', a: '#f7d6c4', b: '#e89b79' },
  { id: 'white', label: 'Pure White', a: '#ffffff', b: '#f6f6f6' },
];


interface BlurBox {
  x: number;
  y: number;
  w: number;
  h: number;
}


export default function ScreenshotMockup() {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [bgId, setBgId] = useState('paper');
  const [padding, setPadding] = useState(56);
  const [radius, setRadius] = useState(14);
  const [shadow, setShadow] = useState(32);
  const [blurs, setBlurs] = useState<BlurBox[]>([]);
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);


  const loadImage = async (file: File) => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.src = url;
    await el.decode();
    URL.revokeObjectURL(url);
    setImg(el);
    setBlurs([]);
  };


  useEffect(() => {
    if (!img || !canvasRef.current) return;
    const bg = BACKGROUNDS.find((b) => b.id === bgId) ?? BACKGROUNDS[0];
    const c = canvasRef.current;
    const w = img.naturalWidth + padding * 2;
    const h = img.naturalHeight + padding * 2;
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;


    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, bg.a);
    grad.addColorStop(1, bg.b);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);


    // Shadowed rounded screenshot frame
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    ctx.shadowBlur = shadow;
    ctx.shadowOffsetY = Math.round(shadow * 0.45);
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.roundRect(padding, padding, img.naturalWidth, img.naturalHeight, radius);
    ctx.fill();
    ctx.restore();


    // Clipped screenshot + privacy pixelation boxes
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(padding, padding, img.naturalWidth, img.naturalHeight, radius);
    ctx.clip();
    ctx.drawImage(img, padding, padding);


    for (const box of blurs) {
      const bx = Math.round(padding + box.x * img.naturalWidth);
      const by = Math.round(padding + box.y * img.naturalHeight);
      const bw = Math.max(8, Math.round(box.w * img.naturalWidth));
      const bh = Math.max(8, Math.round(box.h * img.naturalHeight));
      const block = Math.max(10, Math.round(Math.min(bw, bh) / 3));
      const tiny = document.createElement('canvas');
      tiny.width = Math.max(2, Math.round(bw / block));
      tiny.height = Math.max(2, Math.round(bh / block));
      const tctx = tiny.getContext('2d')!;
      tctx.drawImage(c, bx, by, bw, bh, 0, 0, tiny.width, tiny.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tiny, 0, 0, tiny.width, tiny.height, bx, by, bw, bh);
      ctx.imageSmoothingEnabled = true;
    }
    ctx.restore();
  }, [img, bgId, padding, radius, shadow, blurs]);


  const relPosOnImage = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };


  const downloadPng = () => {
    const c = canvasRef.current;
    if (!c) return;
    c.toBlob((blob) => {
      if (blob) downloadBlob('toolatlas-framed-screenshot.png', blob);
    }, 'image/png');
  };


  return (
    <div className="space-y-4">
      <Panel title="1. Drop a screenshot">
        <Dropzone
          accept="image/png,image/jpeg,image/webp"
          multiple={false}
          onFiles={(files) => {
            if (files[0]) void loadImage(files[0]);
          }}
          title="Drop a screenshot here"
          hint="Add clean framing, shadow and optional click-and-drag pixelation"
        />


        <div className="mt-5 flex flex-wrap gap-2">
          {BACKGROUNDS.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setBgId(b.id)}
              className={[
                'inline-flex items-center gap-2 border px-3 py-1.5 text-xs font-medium transition',
                bgId === b.id ? 'border-accent text-accent' : 'border-line text-muted hover:text-fg',
              ].join(' ')}
            >
              <span
                className="h-3.5 w-3.5 border border-line"
                style={{ background: `linear-gradient(135deg, ${b.a}, ${b.b})` }}
              />
              {b.label}
            </button>
          ))}
        </div>


        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label={`Padding (${padding}px)`}>
            <input type="range" min={16} max={140} value={padding} onChange={(e) => setPadding(Number(e.target.value))} className="w-full" />
          </Field>
          <Field label={`Corner radius (${radius}px)`}>
            <input type="range" min={0} max={32} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="w-full" />
          </Field>
          <Field label={`Shadow (${shadow}px)`}>
            <input type="range" min={0} max={80} value={shadow} onChange={(e) => setShadow(Number(e.target.value))} className="w-full" />
          </Field>
        </div>
      </Panel>


      {img && (
        <Panel
          title="2. Preview & optional privacy blur"
          description="Drag directly on the preview to pixelate sensitive emails, names or numbers."
          actions={
            <div className="flex gap-2">
              {blurs.length > 0 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setBlurs([])}>
                  Clear blurs ({blurs.length})
                </Button>
              )}
              <Button type="button" size="sm" onClick={downloadPng}>
                Download PNG
              </Button>
            </div>
          }
        >
          <div
            className="relative mx-auto w-fit max-w-full cursor-crosshair select-none touch-none"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              const pt = relPosOnImage(e);
              setDraft({ x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y });
            }}
            onPointerMove={(e) => {
              if (!draft) return;
              const pt = relPosOnImage(e);
              setDraft((d) => (d ? { ...d, x1: pt.x, y1: pt.y } : null));
            }}
            onPointerUp={() => {
              if (!draft) return;
              const x = Math.min(draft.x0, draft.x1);
              const y = Math.min(draft.y0, draft.y1);
              const w = Math.abs(draft.x1 - draft.x0);
              const h = Math.abs(draft.y1 - draft.y0);
              if (w > 0.01 && h > 0.01) setBlurs((prev) => [...prev, { x, y, w, h }]);
              setDraft(null);
            }}
          >
            <canvas ref={canvasRef} className="block max-h-[70vh] max-w-full h-auto border border-line" />
            {draft && (
              <div
                style={{
                  left: `${Math.min(draft.x0, draft.x1) * 100}%`,
                  top: `${Math.min(draft.y0, draft.y1) * 100}%`,
                  width: `${Math.abs(draft.x1 - draft.x0) * 100}%`,
                  height: `${Math.abs(draft.y1 - draft.y0) * 100}%`,
                }}
                className="pointer-events-none absolute border-2 border-accent bg-accent/20"
              />
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}
