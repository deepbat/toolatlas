import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

/* Pointer-driven 3D tilt wrapper. Adds a gentle rotateX/rotateY + float to its
   child on fine-pointer devices; a no-op under reduced motion or touch. */
export default function Tilt({
  children,
  className = '',
  max = 7,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;

    let raf = 0;
    let targetX = 0;
    let targetY = 0;
    let curX = 0;
    let curY = 0;
    let hover = false;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      curX += (targetX - curX) * 0.12;
      curY += (targetY - curY) * 0.12;
      const lift = hover ? 6 : 0;
      el.style.transform = `perspective(900px) rotateX(${curX.toFixed(3)}deg) rotateY(${curY.toFixed(3)}deg) translateY(-${lift * Math.min(1, Math.abs(curX) / max + Math.abs(curY) / max + (hover ? 0.4 : 0))}px)`;
      if (!hover && Math.abs(curX) < 0.02 && Math.abs(curY) < 0.02) {
        el.style.transform = '';
      }
    };

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      targetY = px * max;
      targetX = -py * max;
      hover = true;
    };
    const onLeave = () => {
      targetX = 0;
      targetY = 0;
      hover = false;
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [max]);

  const style: CSSProperties = { transformStyle: 'preserve-3d', willChange: 'transform' };
  return (
    <div ref={ref} className={`tilt ${className}`} style={style}>
      {children}
    </div>
  );
}
