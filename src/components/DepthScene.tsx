import { useEffect, useRef, useState } from 'react';

/* Hero depth scene: a static layered "drafting paper" backdrop that is always
   there (and is the whole experience under prefers-reduced-motion or without
   WebGL), upgraded after first paint to the interactive WebGL drawer cabinet. */
export default function DepthScene() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    let idle = 0;

    const boot = () => {
      if (cancelled) return;
      import('../lib/scene3d')
        .then((mod) => {
          if (cancelled || !canvasRef.current) return;
          const cleanup = mod.startScene(canvasRef.current);
          if (cleanup) {
            stop = cleanup;
            setLive(true);
          }
        })
        .catch(() => {
          /* no WebGL module: the static scene remains */
        });
    };

    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        io.disconnect();
        idle = window.requestIdleCallback ? window.requestIdleCallback(boot, { timeout: 1200 }) : window.setTimeout(boot, 250);
      }
    });
    io.observe(host);

    return () => {
      cancelled = true;
      io.disconnect();
      if (idle) {
        if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
        else window.clearTimeout(idle);
      }
      stop?.();
    };
  }, []);

  return (
    <div ref={hostRef} className="depth-scene" aria-hidden="true">
      {/* Static isometric backdrop (always rendered; the WebGL canvas fades over it) */}
      <div className="depth-static">
        <span className="iso iso-a" />
        <span className="iso iso-b" />
        <span className="iso iso-c" />
        <span className="iso-grid" />
      </div>
      <canvas ref={canvasRef} className={live ? 'depth-canvas is-live' : 'depth-canvas'} />
      {/* Legibility scrim: keeps text readable over the scene on the left/bottom. */}
      <div className="depth-scrim" />
    </div>
  );
}
