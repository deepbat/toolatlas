import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Dropzone, Field, FileRow, Grid, Input, Note, Panel, Select, Toggle } from '../../components/ui';
import { downloadBlob, formatBytes } from '../../lib/utils';
import { canvasBlob, tick } from '../../lib/pdfio';
import { parseExif, stripJpeg, stripPng, type MetaResult } from '../../lib/exif';
import { zipBlob } from '../../lib/zip';
import { Busy, Failure, SendTo, loadBitmap, useHandoff } from './kit';

const stem = (n: string) => n.replace(/\.[^.]+$/, '');
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/avif': 'avif' };
const MAX_OUT_PIXELS = 50e6;
const checker = 'repeating-conic-gradient(#d9d9d9 0% 25%, #fff 0% 50%) 50% / 16px 16px';

function useSingleImage(toolId: string) {
  const [file, setFile] = useState<File | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async (files: File[]) => {
    setError('');
    try {
      const f = files[0];
      if (!f) return;
      const i = await loadBitmap(f);
      setImg((old) => { if (old) URL.revokeObjectURL(old.src); return i; });
      setFile(f);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open the image.'); }
  }, []);
  const from = useHandoff(toolId, 'image', (f) => void load(f));
  useEffect(() => () => { if (img) URL.revokeObjectURL(img.src); }, [img]);
  const clear = () => { setFile(null); setImg(null); };
  return { file, img, error, setError, load, from, clear };
}
function ImagePicker({ s, title = '1. Choose an image' }: { s: ReturnType<typeof useSingleImage>; title?: string }) {
  return (
    <Panel title={title} description="Processed on this device. Nothing is uploaded. JPG, PNG and WebP always work. AVIF and GIF open if your browser supports them.">
      {!s.file ? <Dropzone accept="image/*" multiple={false} onFiles={s.load} title="Drop an image or browse" hint="Up to 40 MB" /> : (
        <FileRow icon="Image" name={s.file.name} meta={`${s.img?.naturalWidth} × ${s.img?.naturalHeight} px · ${formatBytes(s.file.size)}${s.from ? ' · sent from another tool' : ''}`} onRemove={s.clear} />
      )}
      <div className="mt-3"><Failure error={s.error} /></div>
    </Panel>
  );
}
const toFile = (blob: Blob, name: string) => new File([blob], name, { type: blob.type });
const hexToRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/* Background removal */
function BgRemove() {
  const s = useSingleImage('image-bg-remove');
  const [tol, setTol] = useState(40);
  const [feather, setFeather] = useState(1);
  const [mode, setMode] = useState<'edge' | 'all'>('edge');
  const [key, setKey] = useState<[number, number, number] | null>(null);
  const [fill, setFill] = useState('transparent');
  const [fillColor, setFillColor] = useState('#ffffff');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ blob: Blob; cleared: number } | null>(null);
  const [resultUrl, setResultUrl] = useState('');
  const src = useRef<HTMLCanvasElement | null>(null);
  const pick = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!s.img) return;
    const sc = Math.min(1, 2400 / Math.max(s.img.naturalWidth, s.img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(s.img.naturalWidth * sc); c.height = Math.round(s.img.naturalHeight * sc);
    c.getContext('2d', { willReadFrequently: true })!.drawImage(s.img, 0, 0, c.width, c.height);
    src.current = c;
    const g = c.getContext('2d')!;
    const pts = [[0, 0], [c.width - 1, 0], [0, c.height - 1], [c.width - 1, c.height - 1]].map(([x, y]) => g.getImageData(x, y, 1, 1).data);
    setKey([0, 1, 2].map((i) => Math.round(pts.reduce((a, p) => a + p[i], 0) / 4)) as [number, number, number]);
    setResult(null);
    const pc = pick.current;
    if (pc) { pc.width = c.width; pc.height = c.height; pc.getContext('2d')!.drawImage(c, 0, 0); }
  }, [s.img]);
  useEffect(() => { if (!result) { setResultUrl(''); return; } const u = URL.createObjectURL(result.blob); setResultUrl(u); return () => URL.revokeObjectURL(u); }, [result]);

  const run = async () => {
    if (!src.current || !key) return;
    setBusy(true); s.setError('');
    await tick();
    try {
      const c = src.current, w = c.width, h = c.height;
      const data = c.getContext('2d')!.getImageData(0, 0, w, h);
      const d = data.data;
      const t2 = (tol * 4.4) ** 2;
      const near = (i: number) => { const dr = d[i] - key[0], dg = d[i + 1] - key[1], db = d[i + 2] - key[2]; return dr * dr + dg * dg + db * db <= t2; };
      const alpha = new Uint8Array(w * h).fill(255);
      if (mode === 'all') { for (let p = 0; p < w * h; p++) if (near(p * 4)) alpha[p] = 0; }
      else {
        const stack: number[] = [];
        const seen = new Uint8Array(w * h);
        const push = (x: number, y: number) => { const p = y * w + x; if (!seen[p] && near(p * 4)) { seen[p] = 1; stack.push(p); } };
        for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
        for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
        while (stack.length) {
          const p = stack.pop()!; alpha[p] = 0;
          const x = p % w, y = (p - x) / w;
          if (x > 0) push(x - 1, y);
          if (x < w - 1) push(x + 1, y);
          if (y > 0) push(x, y - 1);
          if (y < h - 1) push(x, y + 1);
        }
      }
      let cleared = 0;
      for (let p = 0; p < alpha.length; p++) if (!alpha[p]) cleared++;
      if (cleared === 0) throw Error('Nothing matched the background colour. Tap the background in the preview or raise the tolerance.');
      if (cleared === alpha.length) throw Error('The whole picture matched. Lower the tolerance or tap the real background.');
      let mask = alpha;
      for (let pass = 0; pass < feather; pass++) {
        const out = new Uint8Array(mask.length);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          let sum = 0, n = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) { sum += mask[yy * w + xx]; n++; } }
          out[y * w + x] = Math.round(sum / n);
        }
        mask = out;
      }
      const bg = fill === 'color' ? hexToRgb(fillColor) : null;
      for (let p = 0; p < mask.length; p++) {
        const a = mask[p] / 255;
        if (bg) { for (let k = 0; k < 3; k++) d[p * 4 + k] = Math.round(d[p * 4 + k] * a + bg[k] * (1 - a)); d[p * 4 + 3] = 255; }
        else d[p * 4 + 3] = mask[p];
      }
      const out = document.createElement('canvas'); out.width = w; out.height = h;
      out.getContext('2d')!.putImageData(data, 0, 0);
      setResult({ blob: await canvasBlob(out, bg ? 'image/jpeg' : 'image/png', 0.95), cleared: Math.round((cleared / alpha.length) * 100) });
    } catch (e) { s.setError(e instanceof Error ? e.message : 'Background removal failed.'); }
    finally { setBusy(false); }
  };
  const onPick = (e: RPointerEvent<HTMLCanvasElement>) => {
    const c = pick.current!; const r = c.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * c.width), y = Math.floor(((e.clientY - r.top) / r.height) * c.height);
    const px = c.getContext('2d', { willReadFrequently: true })!.getImageData(x, y, 1, 1).data;
    setKey([px[0], px[1], px[2]]); setResult(null);
  };
  const ext = fill === 'color' ? 'jpg' : 'png';
  return (
    <div className="space-y-4">
      <ImagePicker s={s} />
      {s.img && (
        <Panel title="2. Pick the background colour" description="Tap the background in the picture. This removes one colour range, so it works best on plain or studio backgrounds. It is not an AI cut-out.">
          <div className="space-y-4">
            <canvas ref={pick} onPointerDown={onPick} aria-label="Source image. Tap the background colour." className="max-h-80 w-full cursor-crosshair border border-line object-contain" style={{ background: checker }} />
            <Grid>
              <Field label="Background colour picked"><span className="inline-flex items-center gap-2 text-sm"><span className="inline-block h-6 w-10 border border-line" style={{ background: key ? `rgb(${key.join(',')})` : '#fff' }} />{key ? `rgb(${key.join(', ')})` : ''}</span></Field>
              <Field label={`Tolerance: ${tol}`} htmlFor="t-t"><input id="t-t" type="range" min={5} max={90} value={tol} onChange={(e) => setTol(Number(e.target.value))} className="w-full" /></Field>
              <Field label="Remove" htmlFor="t-m" hint="Edge-connected keeps matching colours inside the subject, such as a white shirt.">
                <Select id="t-m" value={mode} onChange={(e) => setMode(e.target.value as 'edge' | 'all')}><option value="edge">Only the background touching the edges</option><option value="all">Every pixel of this colour</option></Select>
              </Field>
              <Field label={`Edge softness: ${feather}`} htmlFor="t-f"><input id="t-f" type="range" min={0} max={4} value={feather} onChange={(e) => setFeather(Number(e.target.value))} className="w-full" /></Field>
              <Field label="Output background" htmlFor="t-b"><Select id="t-b" value={fill} onChange={(e) => setFill(e.target.value)}><option value="transparent">Transparent (PNG)</option><option value="color">Solid colour (JPEG)</option></Select></Field>
              {fill === 'color' && <Field label="Fill colour" htmlFor="t-c"><Input id="t-c" type="color" value={fillColor} onChange={(e) => setFillColor(e.target.value)} className="h-11 p-1" /></Field>}
            </Grid>
            <Button onClick={run} disabled={busy}>Remove background</Button>
            {busy && <Busy label="Working on the pixels" />}
          </div>
        </Panel>
      )}
      {result && (
        <Panel title="Result">
          <div className="border border-line p-2" style={{ background: fill === 'transparent' ? checker : '#fff' }}><img src={resultUrl} alt="Background removed preview" className="mx-auto max-h-96" /></div>
          <p className="mt-2 text-sm" data-testid="bg-summary">{result.cleared}% of the picture was removed · {formatBytes(result.blob.size)}</p>
          <div className="mt-3"><Button onClick={() => downloadBlob(`${stem(s.file!.name)}-no-bg.${ext}`, result.blob)}>Download {ext.toUpperCase()}</Button></div>
          <div className="mt-4"><SendTo from="image-bg-remove" kind="image" files={() => [toFile(result.blob, `${stem(s.file!.name)}-no-bg.${ext}`)]} /></div>
        </Panel>
      )}
    </div>
  );
}

/* Upscale */
function Upscale() {
  const s = useSingleImage('image-upscale');
  const [factor, setFactor] = useState(2);
  const [sharpen, setSharpen] = useState(40);
  const [fmt, setFmt] = useState('image/png');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ blob: Blob; w: number; h: number } | null>(null);
  const [url, setUrl] = useState('');
  useEffect(() => { if (!out) { setUrl(''); return; } const u = URL.createObjectURL(out.blob); setUrl(u); return () => URL.revokeObjectURL(u); }, [out]);
  const run = async () => {
    if (!s.img) return;
    s.setError(''); setOut(null);
    const W = s.img.naturalWidth * factor, H = s.img.naturalHeight * factor;
    if (W * H > MAX_OUT_PIXELS) return s.setError(`The result would be ${(W * H / 1e6).toFixed(0)} megapixels. The limit is ${MAX_OUT_PIXELS / 1e6}. Choose a smaller factor.`);
    setBusy(true); await tick();
    try {
      let cur: CanvasImageSource = s.img; let cw = s.img.naturalWidth, ch = s.img.naturalHeight;
      while (cw < W || ch < H) {
        const nw = Math.min(W, cw * 2), nh = Math.min(H, ch * 2);
        const c = document.createElement('canvas'); c.width = nw; c.height = nh;
        const g = c.getContext('2d')!; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(cur, 0, 0, nw, nh);
        cur = c; cw = nw; ch = nh;
      }
      const c = cur as HTMLCanvasElement; const g = c.getContext('2d', { willReadFrequently: true })!;
      if (sharpen > 0) {
        const img = g.getImageData(0, 0, cw, ch); const srcd = new Uint8ClampedArray(img.data); const amt = (sharpen / 100) * 1.2;
        for (let y = 1; y < ch - 1; y++) for (let x = 1; x < cw - 1; x++) {
          const i = (y * cw + x) * 4;
          for (let k = 0; k < 3; k++) {
            let sum = 0;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += srcd[((y + dy) * cw + x + dx) * 4 + k];
            img.data[i + k] = Math.max(0, Math.min(255, srcd[i + k] + amt * (srcd[i + k] - sum / 9)));
          }
        }
        g.putImageData(img, 0, 0);
      }
      setOut({ blob: await canvasBlob(c, fmt, 0.92), w: cw, h: ch });
    } catch (e) { s.setError(e instanceof Error ? e.message : 'Upscaling failed.'); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <ImagePicker s={s} />
      {s.img && (
        <Panel title="2. Enlarge" description="Smooth enlargement with light sharpening. It makes the picture bigger but cannot invent detail that was never captured, which AI upscalers pretend to do.">
          <div className="space-y-4">
            <Grid cols={3}>
              <Field label="Enlarge by" htmlFor="u-f"><Select id="u-f" value={factor} onChange={(e) => setFactor(Number(e.target.value))}>{[2, 3, 4].map((f) => <option key={f} value={f}>{f}× ({s.img!.naturalWidth * f} × {s.img!.naturalHeight * f})</option>)}</Select></Field>
              <Field label={`Sharpening: ${sharpen}%`} htmlFor="u-s"><input id="u-s" type="range" min={0} max={100} value={sharpen} onChange={(e) => setSharpen(Number(e.target.value))} className="w-full" /></Field>
              <Field label="Format" htmlFor="u-t"><Select id="u-t" value={fmt} onChange={(e) => setFmt(e.target.value)}><option value="image/png">PNG</option><option value="image/jpeg">JPEG</option><option value="image/webp">WebP</option></Select></Field>
            </Grid>
            <Button onClick={run} disabled={busy}>Enlarge image</Button>
            {busy && <Busy label="Enlarging" />}
          </div>
        </Panel>
      )}
      {out && (
        <Panel title="Result">
          <img src={url} alt="Enlarged preview" className="max-h-96 border border-line object-contain" />
          <p className="mt-2 text-sm" data-testid="upscale-summary">{out.w} × {out.h} px · {formatBytes(out.blob.size)}</p>
          <div className="mt-3"><Button onClick={() => downloadBlob(`${stem(s.file!.name)}-${factor}x.${EXT[out.blob.type] ?? 'png'}`, out.blob)}>Download</Button></div>
          <div className="mt-4"><SendTo from="image-upscale" kind="image" files={() => [toFile(out.blob, `${stem(s.file!.name)}-${factor}x.${EXT[out.blob.type] ?? 'png'}`)]} /></div>
        </Panel>
      )}
    </div>
  );
}

/* Bulk resize and convert */
async function canEncode(type: string): Promise<boolean> {
  const c = document.createElement('canvas'); c.width = c.height = 2;
  const b = await new Promise<Blob | null>((r) => c.toBlob(r, type, 0.8));
  return !!b && b.type === type;
}
function Bulk() {
  const [files, setFiles] = useState<File[]>([]);
  const [support, setSupport] = useState<Record<string, boolean>>({});
  const [fmt, setFmt] = useState('image/webp');
  const [quality, setQuality] = useState(80);
  const [mode, setMode] = useState<'none' | 'width' | 'fit' | 'percent'>('fit');
  const [maxW, setMaxW] = useState('1600');
  const [maxH, setMaxH] = useState('1600');
  const [pct, setPct] = useState('50');
  const [busy, setBusy] = useState<{ v: number; max: number } | null>(null);
  const [results, setResults] = useState<{ name: string; blob: Blob; from: number; w: number; h: number }[]>([]);
  const [fails, setFails] = useState<string[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { (async () => setSupport({ 'image/jpeg': await canEncode('image/jpeg'), 'image/png': true, 'image/webp': await canEncode('image/webp'), 'image/avif': await canEncode('image/avif') }))(); }, []);
  useHandoff('image-bulk-convert', 'image', (f) => setFiles((old) => [...old, ...f]));
  const add = (f: File[]) => { setError(''); const all = [...files, ...f]; if (all.length > 100) return setError('Choose up to 100 images per batch.'); setFiles(all); };
  const run = async () => {
    setError(''); setResults([]); setFails([]);
    try {
      const mw = Number(maxW), mh = Number(maxH), p = Number(pct);
      if (mode === 'width' && !(mw >= 16 && mw <= 12000)) throw Error('Width must be between 16 and 12000 px.');
      if (mode === 'fit' && !(mw >= 16 && mh >= 16 && mw <= 12000 && mh <= 12000)) throw Error('Width and height must be between 16 and 12000 px.');
      if (mode === 'percent' && !(p >= 5 && p <= 100)) throw Error('Percent must be between 5 and 100.');
      if (!support[fmt]) throw Error('This browser cannot save that format. Choose JPEG, PNG or WebP.');
      const out: typeof results = []; const bad: string[] = [];
      for (let i = 0; i < files.length; i++) {
        setBusy({ v: i + 1, max: files.length }); await tick();
        try {
          const img = await loadBitmap(files[i]);
          let w = img.naturalWidth, h = img.naturalHeight, k = 1;
          if (mode === 'width') k = Math.min(1, mw / w); else if (mode === 'fit') k = Math.min(1, mw / w, mh / h); else if (mode === 'percent') k = p / 100;
          w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          const g = c.getContext('2d')!;
          if (fmt === 'image/jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }
          g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(img.src);
          const blob = await canvasBlob(c, fmt, quality / 100);
          out.push({ name: `${stem(files[i].name)}.${EXT[fmt]}`, blob, from: files[i].size, w, h });
        } catch (e) { bad.push(e instanceof Error ? e.message : files[i].name); }
      }
      setResults(out); setFails(bad);
    } catch (e) { setError(e instanceof Error ? e.message : 'Conversion failed.'); }
    finally { setBusy(null); }
  };
  const totalFrom = results.reduce((a, r) => a + r.from, 0), totalTo = results.reduce((a, r) => a + r.blob.size, 0);
  return (
    <div className="space-y-4">
      <Panel title="1. Add images" description="Up to 100 images. Each one is processed on this device.">
        <Dropzone accept="image/*" onFiles={add} title="Drop images or browse" hint="JPG, PNG, WebP, AVIF if your browser opens it" />
        {files.length > 0 && (
          <div className="mt-3 space-y-2">
            {files.slice(0, 8).map((f, i) => <FileRow key={i} icon="Image" name={f.name} meta={formatBytes(f.size)} onRemove={() => setFiles(files.filter((_, k) => k !== i))} />)}
            {files.length > 8 && <p className="text-xs text-muted">and {files.length - 8} more</p>}
            <Button size="sm" variant="ghost" onClick={() => { setFiles([]); setResults([]); }}>Clear all</Button>
          </div>
        )}
        <div className="mt-3"><Failure error={error} /></div>
      </Panel>
      <Panel title="2. Settings">
        <div className="space-y-4">
          <Grid cols={3}>
            <Field label="Resize" htmlFor="k-m"><Select id="k-m" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}><option value="none">Keep original size</option><option value="width">Maximum width</option><option value="fit">Fit inside a box</option><option value="percent">Scale by percent</option></Select></Field>
            {(mode === 'width' || mode === 'fit') && <Field label={mode === 'fit' ? 'Max width (px)' : 'Width (px)'} htmlFor="k-w"><Input id="k-w" inputMode="numeric" value={maxW} onChange={(e) => setMaxW(e.target.value)} /></Field>}
            {mode === 'fit' && <Field label="Max height (px)" htmlFor="k-h"><Input id="k-h" inputMode="numeric" value={maxH} onChange={(e) => setMaxH(e.target.value)} /></Field>}
            {mode === 'percent' && <Field label="Percent of original" htmlFor="k-p"><Input id="k-p" inputMode="numeric" value={pct} onChange={(e) => setPct(e.target.value)} /></Field>}
            <Field label="Output format" htmlFor="k-f" hint="Formats this browser cannot save are disabled.">
              <Select id="k-f" value={fmt} onChange={(e) => setFmt(e.target.value)}>
                {[['image/jpeg', 'JPEG'], ['image/png', 'PNG'], ['image/webp', 'WebP'], ['image/avif', 'AVIF']].map(([v, l]) => <option key={v} value={v} disabled={support[v] === false}>{l}{support[v] === false ? ' (not supported here)' : ''}</option>)}
              </Select>
            </Field>
            {fmt !== 'image/png' && <Field label={`Quality: ${quality}%`} htmlFor="k-q"><input id="k-q" type="range" min={30} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="w-full" /></Field>}
          </Grid>
          <Note>WebP saving works in current browsers. AVIF saving works in Chrome and Edge; Safari and Firefox may open AVIF files but not save them. Transparent areas become white when saved as JPEG.</Note>
          <Button onClick={run} disabled={!files.length || !!busy}>Convert {files.length || ''} {files.length === 1 ? 'image' : 'images'}</Button>
          {busy && <Busy label="Converting" value={busy.v} max={busy.max} />}
        </div>
      </Panel>
      {(results.length > 0 || fails.length > 0) && (
        <Panel title={`${results.length} converted`} actions={results.length > 1 ? <Button size="sm" onClick={async () => downloadBlob('toolatlas-images.zip', zipBlob(await Promise.all(results.map(async (r) => ({ name: r.name, data: new Uint8Array(await r.blob.arrayBuffer()) })))))}>Download all as ZIP</Button> : undefined}>
          {results.length > 0 && <p className="mb-3 text-sm" data-testid="bulk-summary">{formatBytes(totalFrom)} to {formatBytes(totalTo)} in total ({totalFrom ? Math.round((1 - totalTo / totalFrom) * 100) : 0}% smaller)</p>}
          <ul className="space-y-2">{results.map((r) => <li key={r.name} className="flex flex-wrap items-center justify-between gap-2 border border-line px-3 py-2 text-sm"><span className="min-w-0 truncate">{r.name} <span className="text-muted">{r.w}×{r.h} · {formatBytes(r.from)} to {formatBytes(r.blob.size)}</span></span><Button size="sm" variant="ghost" onClick={() => downloadBlob(r.name, r.blob)}>Download</Button></li>)}</ul>
          {fails.length > 0 && <div className="mt-3"><Failure error={'Skipped: ' + fails.join(' ')} /></div>}
          {results.length > 0 && <div className="mt-4"><SendTo from="image-bulk-convert" kind="image" files={() => results.map((r) => toFile(r.blob, r.name))} /></div>}
        </Panel>
      )}
    </div>
  );
}

/* Passport photo */
const PRESETS: { id: string; label: string; mm: [number, number]; note: string }[] = [
  { id: 'in-passport', label: 'India passport photo, 35 × 45 mm', mm: [35, 45], note: 'Size on the Passport Seva photo guideline (4.5 cm × 3.5 cm). The face should fill about 80 to 85% of the height, on a plain white background.' },
  { id: 'in-pan', label: 'India PAN application photo, 25 × 35 mm', mm: [25, 35], note: 'Size on the NSDL PAN instructions (3.5 cm × 2.5 cm), colour photo.' },
  { id: 'sq-2in', label: 'Square 2 × 2 inch (51 × 51 mm)', mm: [51, 51], note: 'Common for OCI, US and some visa forms. Check the form you are filling.' },
  { id: 'custom', label: 'Custom size', mm: [35, 45], note: 'Enter any width and height in millimetres.' },
];
const PAPERS: Record<string, [number, number, string]> = { '4x6': [152.4, 101.6, '4 × 6 inch photo paper'], a4: [210, 297, 'A4 sheet'], '5x7': [177.8, 127, '5 × 7 inch photo paper'] };
function Passport() {
  const s = useSingleImage('passport-photo');
  const [preset, setPreset] = useState('in-passport');
  const [cw, setCw] = useState('35');
  const [chh, setChh] = useState('45');
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [bg, setBg] = useState('#ffffff');
  const [guide, setGuide] = useState(true);
  const [paper, setPaper] = useState('4x6');
  const [error, setError] = useState('');
  const cv = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pr = PRESETS.find((p) => p.id === preset)!;
  const mmW = preset === 'custom' ? Number(cw) : pr.mm[0];
  const mmH = preset === 'custom' ? Number(chh) : pr.mm[1];
  const valid = mmW >= 10 && mmH >= 10 && mmW <= 120 && mmH <= 160;
  const DPI = 300;
  const pxW = Math.round((mmW / 25.4) * DPI), pxH = Math.round((mmH / 25.4) * DPI);
  const draw = useCallback((target: HTMLCanvasElement, w: number, h: number, withGuide: boolean) => {
    if (!s.img) return;
    target.width = w; target.height = h;
    const g = target.getContext('2d')!;
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const k = Math.max(w / s.img.naturalWidth, h / s.img.naturalHeight) * zoom;
    const iw = s.img.naturalWidth * k, ih = s.img.naturalHeight * k;
    g.imageSmoothingQuality = 'high';
    g.drawImage(s.img, (w - iw) / 2 + off.x * w, (h - ih) / 2 + off.y * h, iw, ih);
    if (withGuide) {
      g.strokeStyle = 'rgba(40,200,120,.9)'; g.lineWidth = Math.max(1, w / 150); g.setLineDash([w / 40, w / 60]);
      g.beginPath(); g.ellipse(w / 2, h * 0.44, w * 0.3, h * 0.31, 0, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(0, h * 0.44); g.lineTo(w, h * 0.44); g.stroke();
    }
  }, [s.img, zoom, off, bg]);
  useEffect(() => { if (cv.current && valid) draw(cv.current, Math.round(pxW / 2), Math.round(pxH / 2), guide); }, [draw, valid, pxW, pxH, guide]);
  const down = (e: RPointerEvent<HTMLCanvasElement>) => { (e.target as Element).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y }; };
  const move = (e: RPointerEvent<HTMLCanvasElement>) => { if (!drag.current || !cv.current) return; const r = cv.current.getBoundingClientRect(); setOff({ x: drag.current.ox + (e.clientX - drag.current.x) / r.width, y: drag.current.oy + (e.clientY - drag.current.y) / r.height }); };
  const single = async () => { const c = document.createElement('canvas'); draw(c, pxW, pxH, false); return canvasBlob(c, 'image/jpeg', 0.95); };
  const layout = useMemo(() => {
    const [W, H] = PAPERS[paper]; const gap = 2, margin = 5;
    if (!valid) return { cols: 0, rows: 0, W, H, gap };
    return { cols: Math.max(0, Math.floor((W - 2 * margin + gap) / (mmW + gap))), rows: Math.max(0, Math.floor((H - 2 * margin + gap) / (mmH + gap))), W, H, gap };
  }, [paper, valid, mmW, mmH]);
  const sheet = async () => {
    const { cols, rows, W, H, gap } = layout;
    if (!cols || !rows) throw Error('The photo is larger than this paper. Choose a bigger paper size.');
    const px = (m: number) => Math.round((m / 25.4) * DPI);
    const c = document.createElement('canvas'); c.width = px(W); c.height = px(H);
    const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    const one = document.createElement('canvas'); draw(one, pxW, pxH, false);
    const x0 = (W - (cols * mmW + (cols - 1) * gap)) / 2, y0 = (H - (rows * mmH + (rows - 1) * gap)) / 2;
    g.strokeStyle = '#999'; g.lineWidth = 1;
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) { const x = px(x0 + q * (mmW + gap)), y = px(y0 + r * (mmH + gap)); g.drawImage(one, x, y, pxW, pxH); g.strokeRect(x, y, pxW, pxH); }
    return canvasBlob(c, 'image/jpeg', 0.95);
  };
  const count = layout.cols * layout.rows;
  return (
    <div className="space-y-4">
      <ImagePicker s={s} title="1. Choose a portrait" />
      {s.img && (
        <Panel title="2. Frame the photo" description="Drag the picture to move it. Use the zoom slider to size the face. The green guide is only a rough aid.">
          <div className="grid gap-5 md:grid-cols-[minmax(0,320px)_1fr]">
            <canvas ref={cv} onPointerDown={down} onPointerMove={move} onPointerUp={() => (drag.current = null)} aria-label="Photo preview. Drag to reposition." data-testid="passport-canvas" className="mx-auto w-full max-w-[320px] cursor-grab touch-none border border-line" style={{ aspectRatio: `${mmW}/${mmH}` }} />
            <div className="space-y-4">
              <Field label="Photo size" htmlFor="p-s"><Select id="p-s" value={preset} onChange={(e) => setPreset(e.target.value)}>{PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select></Field>
              {preset === 'custom' && <Grid><Field label="Width (mm)" htmlFor="p-w"><Input id="p-w" inputMode="decimal" value={cw} onChange={(e) => setCw(e.target.value)} /></Field><Field label="Height (mm)" htmlFor="p-h"><Input id="p-h" inputMode="decimal" value={chh} onChange={(e) => setChh(e.target.value)} /></Field></Grid>}
              <Note>{pr.note} Output is {pxW} × {pxH} px at {DPI} dpi. Rules change, so check the current guideline of the office or website you submit to.</Note>
              <Field label={`Zoom: ${zoom.toFixed(2)}×`} htmlFor="p-z"><input id="p-z" type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full" /></Field>
              <Grid><Field label="Background fill" htmlFor="p-b" hint="Shows only if the photo does not cover the frame."><Input id="p-b" type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="h-11 p-1" /></Field>
                <Field label="Print sheet" htmlFor="p-p"><Select id="p-p" value={paper} onChange={(e) => setPaper(e.target.value)}>{Object.entries(PAPERS).map(([k, v]) => <option key={k} value={k}>{v[2]}</option>)}</Select></Field></Grid>
              <Toggle checked={guide} onChange={setGuide} label="Show face guide" />
              {!valid && <Failure error="Enter a width of 10 to 120 mm and a height of 10 to 160 mm." />}
              <div className="flex flex-wrap gap-2">
                <Button disabled={!valid} onClick={async () => { try { setError(''); downloadBlob(`${stem(s.file!.name)}-${mmW}x${mmH}mm.jpg`, await single()); } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } }}>Download single photo</Button>
                <Button variant="secondary" disabled={!valid} onClick={async () => { try { setError(''); downloadBlob(`${stem(s.file!.name)}-print-sheet.jpg`, await sheet()); } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } }}>Download print sheet ({count} photos)</Button>
              </div>
              <Failure error={error} />
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}

/* Collage */
const LAYOUTS = [['grid', 'Even grid'], ['row', 'Single row'], ['column', 'Single column'], ['hero', 'One large, rest small']] as const;
const SIZES: Record<string, [number, number]> = { square: [2000, 2000], portrait: [1600, 2000], story: [1080, 1920], wide: [2400, 1350], a4: [2480, 3508] };
function Collage() {
  const [files, setFiles] = useState<File[]>([]);
  const [imgs, setImgs] = useState<HTMLImageElement[]>([]);
  const [layout, setLayout] = useState<(typeof LAYOUTS)[number][0]>('grid');
  const [size, setSize] = useState('square');
  const [gap, setGap] = useState(24);
  const [radius, setRadius] = useState(0);
  const [bg, setBg] = useState('#ffffff');
  const [error, setError] = useState('');
  const cv = useRef<HTMLCanvasElement>(null);
  const count = useRef(0);
  count.current = files.length;
  const addFiles = async (f: File[]) => {
    setError('');
    try {
      if (count.current + f.length > 12) throw Error('Use up to 12 images in one collage.');
      const loaded = await Promise.all(f.map((x) => loadBitmap(x, 30e6)));
      setFiles((o) => [...o, ...f]); setImgs((o) => [...o, ...loaded]);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not add images.'); }
  };
  useHandoff('image-collage', 'image', (f) => void addFiles(f));
  const draw = useCallback((c: HTMLCanvasElement, scale = 1) => {
    const [W0, H0] = SIZES[size]; const W = Math.round(W0 * scale), H = Math.round(H0 * scale), gp = gap * scale;
    c.width = W; c.height = H;
    const g = c.getContext('2d')!; g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const n = imgs.length; if (!n) return;
    let cells: [number, number, number, number][] = [];
    if (layout === 'row') { const w = (W - gp * (n + 1)) / n; cells = imgs.map((_, i) => [gp + i * (w + gp), gp, w, H - 2 * gp]); }
    else if (layout === 'column') { const h = (H - gp * (n + 1)) / n; cells = imgs.map((_, i) => [gp, gp + i * (h + gp), W - 2 * gp, h]); }
    else if (layout === 'hero' && n > 1) {
      const heroH = (H - 3 * gp) * 0.6; cells.push([gp, gp, W - 2 * gp, heroH]);
      const rest = n - 1, w = (W - gp * (rest + 1)) / rest, y = 2 * gp + heroH;
      for (let i = 0; i < rest; i++) cells.push([gp + i * (w + gp), y, w, H - y - gp]);
    } else {
      const cols = Math.ceil(Math.sqrt(n * (W / H))), rows = Math.ceil(n / cols);
      const w = (W - gp * (cols + 1)) / cols, h = (H - gp * (rows + 1)) / rows;
      cells = imgs.map((_, i) => { const r = Math.floor(i / cols), q = i % cols; return [gp + q * (w + gp), gp + r * (h + gp), w, h]; });
    }
    imgs.forEach((im, i) => {
      const [x, y, w, h] = cells[i]; const k = Math.max(w / im.naturalWidth, h / im.naturalHeight);
      const sw = w / k, sh = h / k;
      g.save(); g.beginPath();
      if (radius > 0) g.roundRect(x, y, w, h, radius * scale); else g.rect(x, y, w, h);
      g.clip(); g.imageSmoothingQuality = 'high';
      g.drawImage(im, (im.naturalWidth - sw) / 2, (im.naturalHeight - sh) / 2, sw, sh, x, y, w, h); g.restore();
    });
  }, [imgs, layout, size, gap, radius, bg]);
  useEffect(() => { if (cv.current) draw(cv.current, 0.3); }, [draw]);
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= imgs.length) return; const sw = <T,>(a: T[]) => { const b = [...a]; [b[i], b[j]] = [b[j], b[i]]; return b; }; setImgs(sw); setFiles(sw); };
  const save = async (type: string) => { const c = document.createElement('canvas'); draw(c, 1); downloadBlob(`collage.${EXT[type]}`, await canvasBlob(c, type, 0.92)); };
  return (
    <div className="space-y-4">
      <Panel title="1. Add pictures" description="Up to twelve images. Each is cropped to fill its cell.">
        <Dropzone accept="image/*" onFiles={(f) => void addFiles(f)} title="Drop images or browse" hint="Stays on this device" />
        {files.length > 0 && <ul className="mt-3 space-y-2">{files.map((f, i) => <li key={i} className="flex items-center gap-2"><div className="min-w-0 flex-1"><FileRow icon="Image" name={f.name} meta={`${imgs[i]?.naturalWidth}×${imgs[i]?.naturalHeight}`} onRemove={() => { setFiles(files.filter((_, k) => k !== i)); setImgs(imgs.filter((_, k) => k !== i)); }} /></div><Button size="sm" variant="ghost" aria-label={`Move ${f.name} earlier`} onClick={() => move(i, -1)}>Up</Button><Button size="sm" variant="ghost" aria-label={`Move ${f.name} later`} onClick={() => move(i, 1)}>Down</Button></li>)}</ul>}
        <div className="mt-3"><Failure error={error} /></div>
      </Panel>
      {imgs.length > 0 && (
        <Panel title="2. Layout">
          <div className="space-y-4">
            <Grid cols={3}>
              <Field label="Layout" htmlFor="c-l"><Select id="c-l" value={layout} onChange={(e) => setLayout(e.target.value as typeof layout)}>{LAYOUTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
              <Field label="Canvas" htmlFor="c-s"><Select id="c-s" value={size} onChange={(e) => setSize(e.target.value)}><option value="square">Square 2000 × 2000</option><option value="portrait">Portrait 4:5</option><option value="story">Story 9:16</option><option value="wide">Wide 16:9</option><option value="a4">A4 at 300 dpi</option></Select></Field>
              <Field label="Background" htmlFor="c-b"><Input id="c-b" type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="h-11 p-1" /></Field>
              <Field label={`Spacing: ${gap}px`} htmlFor="c-g"><input id="c-g" type="range" min={0} max={80} value={gap} onChange={(e) => setGap(Number(e.target.value))} className="w-full" /></Field>
              <Field label={`Rounded corners: ${radius}px`} htmlFor="c-r"><input id="c-r" type="range" min={0} max={120} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="w-full" /></Field>
            </Grid>
            <canvas ref={cv} aria-label="Collage preview" data-testid="collage-canvas" className="mx-auto max-h-[28rem] w-auto max-w-full border border-line" />
            <div className="flex flex-wrap gap-2"><Button onClick={() => void save('image/png')}>Download PNG</Button><Button variant="secondary" onClick={() => void save('image/jpeg')}>Download JPEG</Button></div>
          </div>
        </Panel>
      )}
    </div>
  );
}

/* Annotate and edit */
type Pt = [number, number];
type Shape =
  | { t: 'pen' | 'marker'; pts: Pt[]; c: string; w: number }
  | { t: 'rect' | 'arrow' | 'blur'; a: Pt; b: Pt; c: string; w: number }
  | { t: 'text'; a: Pt; text: string; c: string; w: number };
type Crop = { a: Pt; b: Pt } | null;
const TOOLS = [['pen', 'Pen'], ['marker', 'Highlighter'], ['arrow', 'Arrow'], ['rect', 'Box'], ['text', 'Text'], ['blur', 'Hide (pixelate)']] as const;
function Annotate() {
  const s = useSingleImage('image-annotate');
  const [tool, setTool] = useState<(typeof TOOLS)[number][0]>('arrow');
  const [color, setColor] = useState('#e63b63');
  const [width, setWidth] = useState(6);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [rot, setRot] = useState(0);
  const [flip, setFlip] = useState(false);
  const [bright, setBright] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [sat, setSat] = useState(100);
  const [text, setText] = useState('Note');
  const [crop, setCrop] = useState<Crop>(null);
  const cur = useRef<Shape | null>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const base = useMemo(() => {
    if (!s.img) return null;
    const sc = Math.min(1, 3000 / Math.max(s.img.naturalWidth, s.img.naturalHeight));
    const w = Math.round(s.img.naturalWidth * sc), h = Math.round(s.img.naturalHeight * sc);
    const swap = rot % 180 !== 0;
    const c = document.createElement('canvas'); c.width = swap ? h : w; c.height = swap ? w : h;
    const g = c.getContext('2d')!; g.translate(c.width / 2, c.height / 2); g.rotate((rot * Math.PI) / 180); if (flip) g.scale(-1, 1);
    g.filter = `brightness(${bright}%) contrast(${contrast}%) saturate(${sat}%)`;
    g.drawImage(s.img, -w / 2, -h / 2, w, h);
    return c;
  }, [s.img, rot, flip, bright, contrast, sat]);
  const paint = useCallback((target: HTMLCanvasElement, list: Shape[], withCrop = true) => {
    if (!base) return;
    target.width = base.width; target.height = base.height;
    const g = target.getContext('2d')!; g.drawImage(base, 0, 0);
    const all = cur.current ? [...list, cur.current] : list;
    const k = base.width / 1000;
    for (const sh of all) {
      g.save(); g.strokeStyle = sh.c; g.fillStyle = sh.c; g.lineWidth = sh.w * k; g.lineCap = 'round'; g.lineJoin = 'round';
      if (sh.t === 'pen' || sh.t === 'marker') { if (sh.t === 'marker') { g.globalAlpha = 0.35; g.lineWidth = sh.w * k * 3; } g.beginPath(); sh.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); }
      else if (sh.t === 'rect') g.strokeRect(sh.a[0], sh.a[1], sh.b[0] - sh.a[0], sh.b[1] - sh.a[1]);
      else if (sh.t === 'arrow') {
        const [x1, y1] = sh.a, [x2, y2] = sh.b, ang = Math.atan2(y2 - y1, x2 - x1), hl = Math.max(14, sh.w * 3.5) * k;
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
        g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - hl * Math.cos(ang - 0.45), y2 - hl * Math.sin(ang - 0.45)); g.lineTo(x2 - hl * Math.cos(ang + 0.45), y2 - hl * Math.sin(ang + 0.45)); g.closePath(); g.fill();
      } else if (sh.t === 'text') { g.font = `600 ${sh.w * 4 * k}px sans-serif`; g.textBaseline = 'top'; g.fillText(sh.text, sh.a[0], sh.a[1]); }
      else if (sh.t === 'blur') {
        const x = Math.min(sh.a[0], sh.b[0]), y = Math.min(sh.a[1], sh.b[1]), w = Math.abs(sh.b[0] - sh.a[0]), h = Math.abs(sh.b[1] - sh.a[1]);
        if (w > 2 && h > 2) { const bs = Math.max(6, Math.round(Math.min(w, h) / 8)); const t = document.createElement('canvas'); t.width = Math.max(1, Math.round(w / bs)); t.height = Math.max(1, Math.round(h / bs)); t.getContext('2d')!.drawImage(target, x, y, w, h, 0, 0, t.width, t.height); g.imageSmoothingEnabled = false; g.drawImage(t, 0, 0, t.width, t.height, x, y, w, h); }
      }
      g.restore();
    }
    if (withCrop && crop) {
      const x = Math.min(crop.a[0], crop.b[0]), y = Math.min(crop.a[1], crop.b[1]), w = Math.abs(crop.b[0] - crop.a[0]), h = Math.abs(crop.b[1] - crop.a[1]);
      const snap = document.createElement('canvas'); snap.width = target.width; snap.height = target.height; snap.getContext('2d')!.drawImage(target, 0, 0);
      g.save(); g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, 0, target.width, target.height); g.drawImage(snap, x, y, w, h, x, y, w, h); g.restore();
      g.strokeStyle = '#fff'; g.setLineDash([10, 8]); g.lineWidth = 2 * k; g.strokeRect(x, y, w, h);
    }
  }, [base, crop]);
  useEffect(() => { if (cv.current) paint(cv.current, shapes); }, [paint, shapes]);
  const pt = (e: RPointerEvent<HTMLCanvasElement>): Pt => { const c = cv.current!, r = c.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height]; };
  const down = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!base) return; (e.target as Element).setPointerCapture(e.pointerId); const p = pt(e);
    if (tool === 'text') { if (text.trim()) setShapes((l) => [...l, { t: 'text', a: p, text: text.slice(0, 200), c: color, w: width }]); return; }
    cur.current = tool === 'pen' || tool === 'marker' ? { t: tool, pts: [p], c: color, w: width } : { t: tool, a: p, b: p, c: color, w: width };
  };
  const move = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!cur.current || !cv.current) return; const p = pt(e);
    if ('pts' in cur.current) cur.current.pts.push(p); else if ('b' in cur.current) cur.current.b = p;
    paint(cv.current, shapes);
  };
  const up = () => { if (cur.current) { const c = cur.current; cur.current = null; setShapes((l) => [...l, c]); } };
  const exportBlob = async (type: string) => {
    const c = document.createElement('canvas'); paint(c, shapes, false);
    let out = c;
    if (crop) { const x = Math.round(Math.min(crop.a[0], crop.b[0])), y = Math.round(Math.min(crop.a[1], crop.b[1])), w = Math.round(Math.abs(crop.b[0] - crop.a[0])), h = Math.round(Math.abs(crop.b[1] - crop.a[1])); if (w > 4 && h > 4) { out = document.createElement('canvas'); out.width = w; out.height = h; out.getContext('2d')!.drawImage(c, x, y, w, h, 0, 0, w, h); } }
    return canvasBlob(out, type, 0.93);
  };
  const reset = () => { setShapes([]); setRot(0); setFlip(false); setBright(100); setContrast(100); setSat(100); setCrop(null); };
  return (
    <div className="space-y-4">
      <ImagePicker s={s} />
      {s.img && (
        <Panel title="2. Mark up and edit">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Drawing tools">
              {TOOLS.map(([id, l]) => <Button key={id} size="sm" variant={tool === id ? 'primary' : 'secondary'} aria-pressed={tool === id} onClick={() => setTool(id)}>{l}</Button>)}
              <Button size="sm" variant="ghost" onClick={() => setShapes((l) => l.slice(0, -1))} disabled={!shapes.length}>Undo</Button>
              <Button size="sm" variant="ghost" onClick={() => setShapes([])} disabled={!shapes.length}>Clear marks</Button>
            </div>
            <Grid cols={3}>
              <Field label="Colour" htmlFor="a-c"><Input id="a-c" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-11 p-1" /></Field>
              <Field label={`Size: ${width}`} htmlFor="a-w"><input id="a-w" type="range" min={2} max={24} value={width} onChange={(e) => setWidth(Number(e.target.value))} className="w-full" /></Field>
              {tool === 'text' && <Field label="Text to place" htmlFor="a-t"><Input id="a-t" value={text} onChange={(e) => setText(e.target.value)} maxLength={200} /></Field>}
            </Grid>
            <canvas ref={cv} onPointerDown={down} onPointerMove={move} onPointerUp={up} aria-label="Image canvas. Draw with the selected tool." data-testid="annotate-canvas" className="mx-auto max-h-[32rem] w-auto max-w-full cursor-crosshair touch-none border border-line" />
            <details className="border border-line p-3">
              <summary className="cursor-pointer text-sm font-medium">Basic edits: rotate, flip, light and crop</summary>
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => { setRot((r) => (r + 270) % 360); setShapes([]); setCrop(null); }}>Rotate left</Button><Button size="sm" variant="secondary" onClick={() => { setRot((r) => (r + 90) % 360); setShapes([]); setCrop(null); }}>Rotate right</Button><Button size="sm" variant="secondary" onClick={() => { setFlip((f) => !f); setShapes([]); }}>Flip</Button></div>
                <p className="text-xs text-muted">Rotating or flipping clears your marks so they do not end up in the wrong place.</p>
                <Grid cols={3}>
                  <Field label={`Brightness: ${bright}%`} htmlFor="a-b"><input id="a-b" type="range" min={50} max={150} value={bright} onChange={(e) => setBright(Number(e.target.value))} className="w-full" /></Field>
                  <Field label={`Contrast: ${contrast}%`} htmlFor="a-k"><input id="a-k" type="range" min={50} max={150} value={contrast} onChange={(e) => setContrast(Number(e.target.value))} className="w-full" /></Field>
                  <Field label={`Colour: ${sat}%`} htmlFor="a-s"><input id="a-s" type="range" min={0} max={200} value={sat} onChange={(e) => setSat(Number(e.target.value))} className="w-full" /></Field>
                </Grid>
                <CropControls base={base} setCrop={setCrop} />
              </div>
            </details>
            <div className="flex flex-wrap gap-2"><Button onClick={async () => downloadBlob(`${stem(s.file!.name)}-edited.png`, await exportBlob('image/png'))}>Download PNG</Button><Button variant="secondary" onClick={async () => downloadBlob(`${stem(s.file!.name)}-edited.jpg`, await exportBlob('image/jpeg'))}>Download JPEG</Button><Button variant="ghost" onClick={reset}>Reset everything</Button></div>
            <SendTo from="image-annotate" kind="image" files={async () => [toFile(await exportBlob('image/png'), `${stem(s.file!.name)}-edited.png`)]} />
          </div>
        </Panel>
      )}
    </div>
  );
}
function CropControls({ base, setCrop }: { base: HTMLCanvasElement | null; setCrop: (c: Crop) => void }) {
  const [m, setM] = useState({ l: 0, t: 0, r: 0, b: 0 });
  useEffect(() => {
    if (!base) return;
    const { l, t, r, b } = m;
    if (!l && !t && !r && !b) { setCrop(null); return; }
    setCrop({ a: [(l / 100) * base.width, (t / 100) * base.height], b: [base.width - (r / 100) * base.width, base.height - (b / 100) * base.height] });
  }, [m, base, setCrop]);
  return (
    <fieldset className="border border-line p-3"><legend className="px-1 text-xs text-muted">Crop: trim a percentage from each side</legend>
      <Grid cols={4}>{(['l', 't', 'r', 'b'] as const).map((k) => <Field key={k} label={`${{ l: 'Left', t: 'Top', r: 'Right', b: 'Bottom' }[k]}: ${m[k]}%`} htmlFor={`cr-${k}`}><input id={`cr-${k}`} type="range" min={0} max={45} value={m[k]} onChange={(e) => setM({ ...m, [k]: Number(e.target.value) })} className="w-full" /></Field>)}</Grid>
    </fieldset>
  );
}

/* Metadata */
function Metadata() {
  const s = useSingleImage('image-metadata');
  const [meta, setMeta] = useState<MetaResult | null>(null);
  const [out, setOut] = useState<{ blob: Blob; note: string } | null>(null);
  const [after, setAfter] = useState<MetaResult | null>(null);
  useEffect(() => {
    setOut(null); setAfter(null); setMeta(null);
    if (!s.file) return;
    s.file.arrayBuffer().then((b) => setMeta(parseExif(b))).catch(() => s.setError('The file could not be read.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.file]);
  const clean = async () => {
    if (!s.file || !s.img) return;
    s.setError('');
    try {
      const buf = await s.file.arrayBuffer();
      const orient = meta?.tags.find((t) => t.name === 'Orientation')?.value;
      let blob: Blob | null = null; let note = '';
      if (meta?.kind === 'jpeg' && (!orient || String(orient) === '1')) {
        const r = stripJpeg(buf);
        if (r) { blob = new Blob([r.bytes as BlobPart], { type: 'image/jpeg' }); note = 'Metadata blocks were removed without re-encoding, so the picture is pixel-for-pixel identical.'; }
      } else if (meta?.kind === 'png') {
        const r = stripPng(buf);
        if (r) { blob = new Blob([r.bytes as BlobPart], { type: 'image/png' }); note = 'Text and EXIF chunks were removed without re-encoding.'; }
      }
      if (!blob) {
        const c = document.createElement('canvas'); c.width = s.img.naturalWidth; c.height = s.img.naturalHeight;
        c.getContext('2d')!.drawImage(s.img, 0, 0);
        const type = meta?.kind === 'png' ? 'image/png' : meta?.kind === 'webp' ? 'image/webp' : 'image/jpeg';
        blob = await canvasBlob(c, type, 0.95);
        note = 'The picture was redrawn and saved again, which drops all metadata. Quality is set to 95%' + (orient && String(orient) !== '1' ? ', and the rotation is baked into the pixels.' : '.');
      }
      setOut({ blob, note });
      setAfter(parseExif(await blob.arrayBuffer()));
    } catch (e) { s.setError(e instanceof Error ? e.message : 'Could not clean the file.'); }
  };
  const sensitive = meta?.tags.filter((t) => t.sensitive) ?? [];
  const ext = out ? EXT[out.blob.type] ?? 'jpg' : 'jpg';
  return (
    <div className="space-y-4">
      <ImagePicker s={s} />
      {meta && (
        <Panel title="2. What this file reveals" description="Read on this device. Social apps often strip this, but email and cloud links usually keep it.">
          {meta.tags.length === 0 ? <Note tone="success">No camera, location or text metadata was found in this file.</Note> : (
            <>
              {sensitive.length > 0 && <div className="mb-3"><Note tone="warning"><strong>Privacy risk:</strong> this file contains {sensitive.map((t) => t.name).join(', ')}. Anyone who receives the original can read it.</Note></div>}
              <dl className="divide-y divide-line border border-line" data-testid="meta-list">
                {meta.tags.map((t, i) => <div key={i} className="flex flex-wrap justify-between gap-3 px-3 py-2 text-sm"><dt className="text-muted">{t.group}: {t.name}</dt><dd className={t.sensitive ? 'font-semibold text-danger' : ''}>{t.value}</dd></div>)}
              </dl>
            </>
          )}
          <div className="mt-4"><Button onClick={clean}>Remove metadata and save a clean copy</Button></div>
          <p className="mt-2 text-xs text-muted">Limits: this removes EXIF, GPS, XMP, IPTC and PNG text. It cannot remove what is visible in the picture, such as faces or street signs.</p>
        </Panel>
      )}
      {out && (
        <Panel title="Clean copy ready">
          <p className="text-sm" data-testid="meta-after">{(() => { const left = after?.tags.filter((t) => t.group !== 'Embedded').length ?? 0; const kept = (after?.tags.length ?? 0) - left; return left === 0 ? `Checked again: no personal metadata remains.${kept ? ' The colour profile was kept so colours look the same.' : ''}` : `${left} items remain.`; })()} {formatBytes(s.file!.size)} to {formatBytes(out.blob.size)}.</p>
          <div className="mt-3"><Note>{out.note}</Note></div>
          <div className="mt-3"><Button onClick={() => downloadBlob(`${stem(s.file!.name)}-clean.${ext}`, out.blob)}>Download clean copy</Button></div>
          <div className="mt-4"><SendTo from="image-metadata" kind="image" files={() => [toFile(out.blob, `${stem(s.file!.name)}-clean.${ext}`)]} /></div>
        </Panel>
      )}
    </div>
  );
}

const PARTS: Record<string, () => JSX.Element> = {
  'image-bg-remove': BgRemove,
  'image-upscale': Upscale,
  'image-bulk-convert': Bulk,
  'passport-photo': Passport,
  'image-collage': Collage,
  'image-annotate': Annotate,
  'image-metadata': Metadata,
};
export default function ImageStudio() {
  const { toolId } = useParams();
  const Part = PARTS[toolId ?? ''];
  return Part ? <Part /> : <Note tone="warning">This image tool was not found.</Note>;
}
