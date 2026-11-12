import { useEffect, useRef, useState } from 'react';
import { pdfjs, PageInfo } from './pdfjs';

function Thumb({
  pdfDoc,
  pageNum,
  viewW,
  active,
  onClick,
}: {
  pdfDoc: any;
  pageNum: number;
  viewW: number;
  active: boolean;
  onClick: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setInView(true)), {
      rootMargin: '300px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;
    let cancelled = false;
    (async () => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (cancelled) return;
        const scale = 96 / viewW;
        const vp = page.getViewport({ scale });
        const c = canvasRef.current;
        if (!c) return;
        c.width = Math.floor(vp.width);
        c.height = Math.floor(vp.height);
        const ctx = c.getContext('2d', { alpha: false })!;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
      } catch { /* ignore */ }
    })();
    return () => {
      cancelled = true;
    };
  }, [inView, pdfDoc, pageNum, viewW]);

  return (
    <button
      type="button"
      data-testid={`thumb-${pageNum}`}
      onClick={onClick}
      aria-label={`Go to page ${pageNum}`}
      aria-current={active}
      className={`block w-full border p-1 transition ${active ? 'border-accent bg-accent/10' : 'border-line hover:border-accent/60'}`}
    >
      <canvas ref={canvasRef} className="w-full bg-white" />
      <span className="mt-1 block text-center font-mono text-[9px] uppercase tracking-label text-muted">
        {pageNum}
      </span>
    </button>
  );
}

export default function Thumbs({
  pdfDoc,
  pages,
  current,
  onJump,
}: {
  pdfDoc: any;
  pages: PageInfo[];
  current: number;
  onJump: (i: number) => void;
}) {
  void pdfjs;
  return (
    <div className="hidden max-h-[75vh] w-28 shrink-0 flex-col gap-2 overflow-y-auto lg:flex" aria-label="Page thumbnails">
      {pages.map((p, i) => (
        <Thumb key={i} pdfDoc={pdfDoc} pageNum={i + 1} viewW={p.viewW} active={i === current} onClick={() => onJump(i)} />
      ))}
    </div>
  );
        }
