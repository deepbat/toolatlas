import { useEffect, useRef, useState } from 'react';
import { Button, Input, Tabs } from '../../components/ui';

// Signature maker: draw, type or upload. Produces a transparent PNG data URL.
export default function SignaturePad({
  onDone,
  onCancel,
}: {
  onDone: (dataUrl: string, w: number, h: number) => void;
  onCancel: () => void;
}) {
  const [tab, setTab] = useState<'draw' | 'type' | 'upload'>('draw');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (tab !== 'draw') return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#10243e';
    ctx.lineWidth = 3;
  }, [tab]);

  useEffect(() => {
    if (tab !== 'type') return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    if (!typed.trim()) return;
    ctx.fillStyle = '#10243e';
    let size = 72;
    do {
      ctx.font = `italic ${size}px "Segoe Script", "Bradley Hand", cursive`;
      size -= 4;
    } while (ctx.measureText(typed).width > c.width - 40 && size > 20);
    ctx.textBaseline = 'middle';
    ctx.fillText(typed, 20, c.height / 2 + 8);
  }, [typed, tab]);

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * c.width,
      y: ((e.clientY - r.top) / r.height) * c.height,
    };
  };

  const finishDraw = () => {
    const c = canvasRef.current;
    if (!c) return;
    if (tab === 'draw' && !hasInk.current) {
      setError('Draw your signature first.');
      return;
    }
    if (tab === 'type' && !typed.trim()) {
      setError('Type your name first.');
      return;
    }
    onDone(c.toDataURL('image/png'), 200, 70);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Create signature">
      <div className="w-full max-w-xl border border-line bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="label-strong text-accent">Create a signature</h3>
          <Tabs
            tabs={[
              { id: 'draw' as const, label: 'Draw' },
              { id: 'type' as const, label: 'Type' },
              { id: 'upload' as const, label: 'Upload' },
            ]}
            value={tab}
            onChange={(t) => {
              setTab(t);
              setError('');
            }}
          />
        </div>
        {tab === 'upload' ? (
          <Input
            type="file"
            accept="image/png,image/jpeg"
            aria-label="Signature image file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const img = new Image();
              img.onload = () => {
                const scale = Math.min(1, 600 / img.naturalWidth);
                const c = document.createElement('canvas');
                c.width = Math.round(img.naturalWidth * scale);
                c.height = Math.round(img.naturalHeight * scale);
                c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
                onDone(c.toDataURL('image/png'), 200, Math.max(30, Math.round((200 * c.height) / c.width)));
              };
              img.onerror = () => setError('Could not read that image.');
              img.src = URL.createObjectURL(f);
            }}
          />
        ) : (
          <canvas
            ref={canvasRef}
            width={560}
            height={200}
            data-testid="signature-canvas"
            className="w-full touch-none border border-line bg-white"
            onPointerDown={(e) => {
              if (tab !== 'draw') return;
              drawing.current = true;
              hasInk.current = true;
              canvasRef.current!.setPointerCapture(e.pointerId);
              const ctx = canvasRef.current!.getContext('2d')!;
              const p = pos(e);
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              setError('');
            }}
            onPointerMove={(e) => {
              if (tab !== 'draw' || !drawing.current) return;
              const ctx = canvasRef.current!.getContext('2d')!;
              const p = pos(e);
              ctx.lineTo(p.x, p.y);
              ctx.stroke();
            }}
            onPointerUp={() => {
              drawing.current = false;
            }}
          />
        )}
        {tab === 'type' && (
          <Input
            className="mt-3"
            aria-label="Type your signature"
            placeholder="Your name"
            value={typed}
            maxLength={40}
            onChange={(e) => setTyped(e.target.value)}
          />
        )}
        {error && (
          <p role="alert" className="mt-3 text-danger">
            {error}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          {tab === 'draw' && (
            <Button
              variant="ghost"
              onClick={() => {
                const c = canvasRef.current!;
                c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
                hasInk.current = false;
              }}
            >
              Clear
            </Button>
          )}
          {tab !== 'upload' && <Button onClick={finishDraw}>Use signature</Button>}
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
