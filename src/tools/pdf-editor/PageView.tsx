import { useEffect, useRef, useState } from 'react';
import { pdfjs, PageInfo } from './pdfjs';
import { Ann, FormFieldInfo, TextItemRect, annBBox, uid } from './model';
import type { ToolId } from './Toolbar';
import type { ShapeKind } from './model';

const cssFont = (family?: string) => family === 'Times' ? '"Times New Roman", serif' : family === 'Courier' ? '"Courier New", monospace' : 'Helvetica, Arial, sans-serif';

interface PendingImage {
  dataUrl: string;
  w: number;
  h: number;
}

interface PageViewProps {
  pdfDoc: any;
  pageIndex: number;
  info: PageInfo;
  scale: number;
  tool: ToolId;
  color: string;
  textColor: string;
  fontSize: number;
  bold: boolean;
  strokeW: number;
  shape: ShapeKind;
  annots: Ann[];
  selected: string | null;
  formFields: FormFieldInfo[];
  formValues: Record<string, string | boolean>;
  onFormValue: (name: string, v: string | boolean) => void;
  findFlashKey: number;
  findFlashRect: { x: number; y: number; w: number; h: number } | null;
  pendingImage: PendingImage | null;
  onPlaceImage: (page: number, x: number, y: number) => void;
  onAddAnns: (page: number, anns: Ann[], selectId?: string) => void;
  onSelect: (id: string | null) => void;
  onDragBegin: () => void;
  onLiveChange: (page: number, id: string, fn: (a: Ann) => Ann) => void;
  onDragEnd: () => void;
  onTextFocus: () => void;
  onTextChange: (page: number, id: string, text: string) => void;
  onTextBlur: (page: number, id: string) => void;
  onRequestLink: (page: number, rect: { x: number; y: number; w: number; h: number }) => void;
  getTextItems: (page: number) => Promise<TextItemRect[]>;
}

type Drag =
  | { kind: 'marquee'; x0: number; y0: number }
  | { kind: 'pen'; pts: number[] }
  | { kind: 'move'; id: string; x0: number; y0: number; ox: number; oy: number }
  | { kind: 'resize'; id: string; x0: number; y0: number; ow: number; oh: number };

let sharedMeasure: CanvasRenderingContext2D | null = null;
const measureCtx = () => (sharedMeasure ??= document.createElement('canvas').getContext('2d')!);

export default function PageView(props: PageViewProps) {
  const { pdfDoc, pageIndex, info, scale, tool } = props;
  // Re-render the bitmap 250 ms after zoom settles; the old canvas is CSS-stretched meanwhile.
  const [renderScale, setRenderScale] = useState(scale);
  useEffect(() => { const t = setTimeout(() => setRenderScale(scale), 250); return () => clearTimeout(t); }, [scale]);
  const containerRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [inView, setInView] = useState(false);
  const [rendered, setRendered] = useState(false);
  const dragRef = useRef<Drag | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [penPts, setPenPts] = useState<number[] | null>(null);

  // Render the page when it scrolls near the viewport.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setInView(true)),
      { rootMargin: '600px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!inView || !pdfDoc) return;
    let cancelled = false;
    let task: any = null;
    (async () => {
      try {
        const lib = pdfjs();
        const page = await pdfDoc.getPage(pageIndex + 1);
        if (cancelled) return;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const cap = Math.sqrt(8_000_000 / Math.max(1, info.viewW * info.viewH));
        const vp = page.getViewport({ scale: Math.min(renderScale * dpr, cap) });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        const ctx = canvas.getContext('2d', { alpha: false })!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        task = page.render({ canvasContext: ctx, viewport: vp });
        await task.promise;
        if (!cancelled) setRendered(true);
      } catch {
        /* render cancelled or failed; page stays blank */
      }
    })();
    return () => {
      cancelled = true;
      try {
        task?.cancel();
      } catch { /* noop */ }
    };
  }, [inView, pdfDoc, pageIndex, renderScale, info.viewW, info.viewH]);

  const toView = (e: React.PointerEvent) => {
    const r = containerRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };

  const hitTest = (x: number, y: number): Ann | null => {
    const tol = 8 / scale;
    for (let i = props.annots.length - 1; i >= 0; i--) {
      const b = annBBox(props.annots[i]);
      if (x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol)
        return props.annots[i];
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    // prevent the browser's default mousedown focus change: a textarea created
    // synchronously here would otherwise blur immediately and self-remove
    e.preventDefault();
    const { x, y } = toView(e);
    layerRef.current!.setPointerCapture(e.pointerId);

    if (props.pendingImage) {
      props.onPlaceImage(pageIndex, x, y);
      return;
    }

    if (tool === 'select') {
      const hit = hitTest(x, y);
      props.onSelect(hit ? hit.id : null);
      if (hit) {
        const b = annBBox(hit);
        dragRef.current = { kind: 'move', id: hit.id, x0: x, y0: y, ox: b.x, oy: b.y };
        props.onDragBegin();
      }
      return;
    }

    if (tool === 'text') {
      const ann: Ann = {
        kind: 'text', id: uid(), x, y: y - props.fontSize * 0.8, text: '',
        size: props.fontSize, color: props.textColor, bold: props.bold,
      };
      props.onAddAnns(pageIndex, [ann], ann.id);
      return;
    }

    if (tool === 'edit') {
      const existing = hitTest(x, y);
      if (existing?.kind === 'text') { props.onSelect(existing.id); return; }
      void (async () => {
        const items = await props.getTextItems(pageIndex);
        const item = items.filter(it => x >= it.x - 2 && x <= it.x + it.w + 2 && y >= it.y - 2 && y <= it.y + it.h + 2)
          .sort((a, b) => a.w * a.h - b.w * b.h)[0];
        if (!item || !item.editable) return;
        const previous = props.annots.find(a => a.kind === 'text' && a.source?.key === item.key);
        if (previous) { props.onSelect(previous.id); return; }
        // Sample the modal colour just outside the ink. This preserves the
        // paper colour on receipts instead of introducing a white sticker.
        let background = '#ffffff';
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d')!;
          const ratio = canvas.width / info.viewW;
          const counts = new Map<string, number>();
          // Two one-pixel strips (above and below the text) instead of ~80 single reads.
          const sx0 = Math.min(canvas.width - 1, Math.max(0, Math.floor(item.x * ratio)));
          const sw = Math.max(1, Math.min(canvas.width - sx0, Math.ceil(item.w * ratio)));
          for (const py of [item.y - 0.7, item.y + item.h + 0.7]) {
            const sy = Math.min(canvas.height - 1, Math.max(0, Math.round(py * ratio)));
            const row = ctx.getImageData(sx0, sy, sw, 1).data;
            for (let i = 0; i < sw; i += Math.max(1, Math.floor(sw / 40))) {
              const hex = '#' + [row[i * 4], row[i * 4 + 1], row[i * 4 + 2]].map(n => n.toString(16).padStart(2, '0')).join('');
              counts.set(hex, (counts.get(hex) ?? 0) + 1);
            }
          }
          background = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? background;
        }
        const text: Ann = {
          kind: 'text', id: uid(), x: item.x, y: item.baseline - item.size * 0.78,
          text: item.str, size: item.size, color: item.color, bold: item.bold,
          italic: item.italic, fontFamily: item.fontFamily,
          source: { key: item.key, x: item.x - 0.4, y: item.y - 0.3, w: item.w + 0.8, h: item.h + 0.6, background, edit: item.edit },
        };
        props.onAddAnns(pageIndex, [text], text.id);
      })();
      return;
    }

    if (tool === 'pen') {
      dragRef.current = { kind: 'pen', pts: [x, y] };
      setPenPts([x, y]);
      return;
    }

    if (['highlight', 'underline', 'strike', 'whiteout', 'redact', 'shape', 'link'].includes(tool)) {
      dragRef.current = { kind: 'marquee', x0: x, y0: y };
      setMarquee({ x, y, w: 0, h: 0 });
      return;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const { x, y } = toView(e);
    if (d.kind === 'marquee') {
      setMarquee({
        x: Math.min(d.x0, x), y: Math.min(d.y0, y),
        w: Math.abs(x - d.x0), h: Math.abs(y - d.y0),
      });
    } else if (d.kind === 'pen') {
      const pts = d.pts;
      const lx = pts[pts.length - 2], ly = pts[pts.length - 1];
      if (Math.hypot(x - lx, y - ly) < 1.5) return;
      pts.push(x, y);
      setPenPts(pts.slice());
    } else if (d.kind === 'move') {
      props.onLiveChange(pageIndex, d.id, (a) => {
        if (a.kind === 'pen') {
          const dx = x - d.x0, dy = y - d.y0;
          const b = annBBox(a);
          const ndx = d.ox + dx - b.x, ndy = d.oy + dy - b.y;
          const pts = a.pts.slice();
          for (let i = 0; i < pts.length; i += 2) { pts[i] += ndx; pts[i + 1] += ndy; }
          return { ...a, pts };
        }
        return { ...a, x: d.ox + (x - d.x0), y: d.oy + (y - d.y0) };
      });
    } else if (d.kind === 'resize') {
      props.onLiveChange(pageIndex, d.id, (a) => {
        if (a.kind === 'rect' || a.kind === 'shape' || a.kind === 'link')
          return { ...a, w: Math.max(6, d.ow + (x - d.x0)), h: Math.max(6, d.oh + (y - d.y0)) };
        if (a.kind === 'image') {
          const ratio = d.oh / d.ow || 1;
          const w = Math.max(20, d.ow + (x - d.x0));
          return { ...a, w, h: w * ratio };
        }
        return a;
      });
    }
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;

    if (d.kind === 'move' || d.kind === 'resize') {
      props.onDragEnd();
      return;
    }
    if (d.kind === 'pen') {
      setPenPts(null);
      if (d.pts.length >= 4) {
        props.onAddAnns(pageIndex, [
          { kind: 'pen', id: uid(), color: props.color, width: props.strokeW, pts: d.pts },
        ]);
      }
      return;
    }
    // marquee tools
    const m = marquee;
    setMarquee(null);
    if (!m) return;
    if (tool === 'link') {
      if (m.w > 6 && m.h > 6) props.onRequestLink(pageIndex, m);
      return;
    }
    if (tool === 'shape') {
      if (m.w > 4 || m.h > 4)
        props.onAddAnns(pageIndex, [
          { kind: 'shape', id: uid(), shape: props.shape, x: m.x, y: m.y, w: m.w, h: m.h, color: props.color, width: props.strokeW },
        ]);
      return;
    }
    // highlight / underline / strike / whiteout / redact
    if (m.w < 3 && m.h < 3) return;
    const mode = tool as 'highlight' | 'underline' | 'strike' | 'whiteout' | 'redact';
    const color = mode === 'whiteout' ? '#ffffff' : mode === 'redact' ? '#000000' : props.color;
    void (async () => {
      let anns: Ann[] = [];
      if (mode === 'highlight' || mode === 'underline' || mode === 'strike') {
        const items = await props.getTextItems(pageIndex);
        anns = items
          .filter((it) => it.x < m.x + m.w && it.x + it.w > m.x && it.y < m.y + m.h && it.y + it.h > m.y)
          .map((it) => ({
            kind: 'rect' as const, id: uid(), mode,
            x: it.x, y: it.y + 0.5, w: it.w, h: it.h - 1, color,
          }));
      }
      if (!anns.length) anns = [{ kind: 'rect', id: uid(), mode, x: m.x, y: m.y, w: m.w, h: m.h, color }];
      props.onAddAnns(pageIndex, anns);
    })();
  };

  const sel = props.selected ? props.annots.find((a) => a.id === props.selected) : null;
  const selBBox = sel ? annBBox(sel) : null;
  const resizable = sel && ['rect', 'shape', 'image', 'link'].includes(sel.kind);

  const cursor =
    props.pendingImage ? 'copy'
    : tool === 'select' ? 'default'
    : tool === 'text' || tool === 'edit' ? 'text'
    : 'crosshair';

  return (
    <div
      ref={containerRef}
      data-testid={`page-${pageIndex + 1}`}
      className="relative mx-auto bg-white shadow-soft"
      style={{ width: info.viewW * scale, height: info.viewH * scale, maxWidth: 'none' }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label={`Page ${pageIndex + 1}`} />
      {!rendered && <div className="absolute inset-0 animate-pulse bg-raised/40" />}

      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox={`0 0 ${info.viewW} ${info.viewH}`}
        aria-hidden="true"
      >
        {props.annots.map((a) => {
          if (a.kind === 'text' && a.source) {
            const r = a.source;
            return <rect key={a.id} data-kind="replacement-cover" x={r.x} y={r.y} width={r.w} height={r.h} fill={r.background} />;
          }
          if (a.kind === 'rect') {
            if (a.mode === 'underline' || a.mode === 'strike') {
              const y = a.mode === 'underline' ? a.y + a.h - Math.max(1.5, a.h * 0.08) : a.y + a.h / 2;
              return (
                <line data-testid={`ann-${a.id}`} data-kind={a.mode} key={a.id} x1={a.x} y1={y} x2={a.x + a.w} y2={y}
                  stroke={a.color} strokeWidth={Math.max(0.8, a.h * 0.06)} />
              );
            }
            return (
              <rect data-testid={`ann-${a.id}`} data-kind={a.mode} key={a.id} x={a.x} y={a.y} width={a.w} height={a.h}
                fill={a.mode === 'whiteout' ? '#ffffff' : a.mode === 'redact' ? '#000000' : a.color}
                fillOpacity={a.mode === 'highlight' ? 0.4 : 1} />
            );
          }
          if (a.kind === 'pen') {
            const pts: string[] = [];
            for (let i = 0; i < a.pts.length; i += 2) pts.push(`${a.pts[i]},${a.pts[i + 1]}`);
            return (
              <polyline data-testid={`ann-${a.id}`} data-kind="pen" key={a.id} points={pts.join(' ')} fill="none"
                stroke={a.color} strokeWidth={a.width} strokeLinecap="round" strokeLinejoin="round" />
            );
          }
          if (a.kind === 'shape') {
            if (a.shape === 'rect')
              return <rect data-testid={`ann-${a.id}`} data-kind="shape" key={a.id} x={a.x} y={a.y} width={a.w} height={a.h} fill="none" stroke={a.color} strokeWidth={a.width} />;
            if (a.shape === 'ellipse')
              return <ellipse data-testid={`ann-${a.id}`} data-kind="shape" key={a.id} cx={a.x + a.w / 2} cy={a.y + a.h / 2} rx={a.w / 2} ry={a.h / 2} fill="none" stroke={a.color} strokeWidth={a.width} />;
            const x2 = a.x + a.w, y2 = a.y + a.h;
            const ang = Math.atan2(y2 - a.y, x2 - a.x);
            const len = Math.max(8, a.width * 4);
            const head = a.shape === 'arrow'
              ? [150, -150].map((dg) => {
                  const a2 = ang + (dg * Math.PI) / 180;
                  return `L ${x2 + len * Math.cos(a2)} ${y2 + len * Math.sin(a2)} M ${x2} ${y2}`;
                }).join(' ')
              : '';
            return <path data-testid={`ann-${a.id}`} data-kind="shape" key={a.id} d={`M ${a.x} ${a.y} L ${x2} ${y2} ${head}`} fill="none" stroke={a.color} strokeWidth={a.width} strokeLinecap="round" />;
          }
          if (a.kind === 'link')
            return (
              <rect data-testid={`ann-${a.id}`} data-kind="link" key={a.id} x={a.x} y={a.y} width={a.w} height={a.h}
                fill="#3b82f6" fillOpacity={0.12} stroke="#3b82f6" strokeOpacity={0.5} strokeWidth={1} strokeDasharray="4 3" />
            );
          return null;
        })}
        {marquee && (
          <rect data-testid="marquee" x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h}
            fill="#6fe7ff" fillOpacity={0.15} stroke="#6fe7ff" strokeWidth={1} strokeDasharray="5 4" />
        )}
        {penPts && penPts.length >= 4 && (
          <polyline
            points={penPts.reduce<string[]>((acc, v, i) => (i % 2 ? acc : [...acc, `${v},${penPts[i + 1]}`]), []).join(' ')}
            fill="none" stroke={props.color} strokeWidth={props.strokeW} strokeLinecap="round" strokeLinejoin="round" />
        )}
        {props.findFlashRect && (
          <rect data-testid="find-flash" key={props.findFlashKey}
            x={props.findFlashRect.x} y={props.findFlashRect.y}
            width={props.findFlashRect.w} height={props.findFlashRect.h}
            fill="none" stroke="#007d92" strokeWidth={2.5}>
            <animate attributeName="stroke-opacity" values="1;0.2;1" dur="0.9s" repeatCount="3" />
          </rect>
        )}
        {sel && selBBox && sel.kind !== 'text' && sel.kind !== 'image' && (
          <rect x={selBBox.x - 2} y={selBBox.y - 2} width={selBBox.w + 4} height={selBBox.h + 4}
            fill="none" stroke="#6fe7ff" strokeWidth={1.5} strokeDasharray="6 4" />
        )}
      </svg>

      {/* text annotations (HTML for editing) */}
      {props.annots.filter((a) => a.kind === 'text').map((a) => {
        if (a.kind !== 'text') return null;
        const isSel = props.selected === a.id;
        const style: React.CSSProperties = {
          left: a.x * scale, top: a.y * scale,
          fontSize: a.size * scale, lineHeight: 1.2,
          fontStyle: a.italic ? 'italic' : 'normal',
          padding: 0, border: 0,
          color: a.color, fontWeight: a.bold ? 700 : 400,
          fontFamily: cssFont(a.fontFamily),
          transform: a.source ? 'translateY(-0.14em)' : undefined,
        };
        const measure = measureCtx();
        measure.font = `${a.italic ? 'italic ' : ''}${a.bold ? 'bold ' : ''}${a.size * scale}px ${cssFont(a.fontFamily)}`;
        const width = Math.max(20 * scale, ...a.text.split('\n').map(line => measure.measureText(line).width + 8 * scale));
        return isSel ? (
          <textarea
            key={a.id}
            data-testid={`ann-${a.id}`}
            autoFocus
            wrap="off"
            rows={Math.max(1, a.text.split('\n').length)}
            className="absolute z-20 resize-none overflow-hidden border border-dashed border-accent-2 bg-white/60 px-0.5 outline-none"
            style={{ ...style, width, minWidth: 20 * scale, background: a.source?.background ?? 'rgba(255,255,255,.6)', outline: '1px dashed #007d92', borderRadius: 0 }}
            value={a.text}
            onFocus={(e) => { props.onTextFocus(); e.currentTarget.select(); }}
            onChange={(e) => props.onTextChange(pageIndex, a.id, e.target.value)}
            onBlur={() => props.onTextBlur(pageIndex, a.id)}
          />
        ) : (
          <div
            key={a.id}
            data-testid={`ann-${a.id}`}
            className="pointer-events-none absolute whitespace-pre px-0.5"
            style={style}
          >
            {a.text}
          </div>
        );
      })}

      {/* image annotations */}
      {props.annots.filter((a) => a.kind === 'image').map((a) => {
        if (a.kind !== 'image') return null;
        const isSel = props.selected === a.id;
        return (
          <img
            key={a.id}
            data-testid={`ann-${a.id}`}
            src={a.dataUrl}
            alt={a.label}
            draggable={false}
            className={`pointer-events-none absolute ${isSel ? 'outline outline-2 outline-dashed outline-accent-2' : ''}`}
            style={{ left: a.x * scale, top: a.y * scale, width: a.w * scale, height: a.h * scale }}
          />
        );
      })}

      {/* resize handle */}
      {resizable && selBBox && (
        <div
          data-testid="resize-handle"
          className="absolute z-30 h-4 w-4 cursor-nwse-resize border border-line bg-accent"
          style={{ left: (selBBox.x + selBBox.w) * scale - 8, top: (selBBox.y + selBBox.h) * scale - 8 }}
          onPointerDown={(e) => {
            e.stopPropagation();
            layerRef.current!.setPointerCapture(e.pointerId);
            dragRef.current = { kind: 'resize', id: sel!.id, x0: e.clientX / scale, y0: e.clientY / scale, ow: selBBox.w, oh: selBBox.h };
            props.onDragBegin();
          }}
        />
      )}

      {/* form field overlays */}
      {props.formFields.map((f) => {
        const common: React.CSSProperties = {
          left: f.x * scale, top: f.y * scale, width: f.w * scale, height: f.h * scale,
          fontSize: Math.max(10, f.h * scale * 0.55),
        };
        if (f.type === 'radio') {
          const val = f.options[0]?.value ?? 'On';
          return (
            <input
              key={f.name + f.page + f.x}
              data-testid={`form-${f.name}`}
              type="checkbox"
              aria-label={`${f.name}: ${val}`}
              checked={props.formValues[f.name] === val}
              onChange={(e) => props.onFormValue(f.name, e.target.checked ? val : '')}
              className="absolute z-20 cursor-pointer appearance-none rounded-full border border-line bg-white/70 checked:bg-accent-2"
              style={common}
            />
          );
        }
        if (f.type === 'checkbox')
          return (
            <input
              key={f.name + f.page + f.x}
              data-testid={`form-${f.name}`}
              type="checkbox"
              aria-label={f.name}
              checked={Boolean(props.formValues[f.name])}
              onChange={(e) => props.onFormValue(f.name, e.target.checked)}
              className="absolute z-20 cursor-pointer appearance-none border border-line bg-white/70 checked:bg-accent-2"
              style={common}
            />
          );
        if (f.type === 'choice')
          return (
            <select
              key={f.name + f.page + f.x}
              data-testid={`form-${f.name}`}
              aria-label={f.name}
              value={String(props.formValues[f.name] ?? '')}
              onChange={(e) => props.onFormValue(f.name, e.target.value)}
              className="absolute z-20 border border-line bg-white/80 text-black"
              style={common}
            >
              <option value="" />
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          );
        return (
          <input
            key={f.name + f.page + f.x}
            data-testid={`form-${f.name}`}
            type="text"
            aria-label={f.name}
            value={String(props.formValues[f.name] ?? '')}
            onChange={(e) => props.onFormValue(f.name, e.target.value)}
            className="absolute z-20 border border-line bg-white/60 px-1 text-black focus:border-accent-2 focus:bg-white"
            style={common}
          />
        );
      })}

      {/* interaction layer */}
      <div
        ref={layerRef}
        data-testid={`overlay-${pageIndex + 1}`}
        className="absolute inset-0 z-10 touch-none"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
    </div>
  );
              }
