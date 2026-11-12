import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PDFDocument, PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField, rgb } from 'pdf-lib';
import { Button, Dropzone, Field, FileRow, Grid, Input, Note, Panel, Select, Toggle } from '../../components/ui';
import { downloadBlob, formatBytes } from '../../lib/utils';
import { canvasBlob, friendlyPdfError, openPdfLib, openPdfjs, parsePages, renderPage, tick } from '../../lib/pdfio';
import { zipBlob } from '../../lib/zip';
import { Busy, Failure, SendTo, useBlobUrl, useHandoff } from './kit';

const baseName = (f: File) => f.name.replace(/\.pdf$/i, '');
const pdfFile = (bytes: Uint8Array, name: string) => new File([bytes as BlobPart], name, { type: 'application/pdf' });

function usePdfInput(toolId: string) {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState(0);
  const [error, setError] = useState('');
  const load = async (files: File[]) => {
    setError('');
    try {
      const f = files[0];
      if (!f) return;
      const pdf = await openPdfLib(f);
      setFile(f);
      setPages(pdf.getPageCount());
    } catch (e) {
      setFile(null);
      setPages(0);
      setError(e instanceof Error ? e.message : 'Could not open the PDF.');
    }
  };
  const from = useHandoff(toolId, 'pdf', (f) => void load(f));
  return { file, pages, error, setError, load, from, clear: () => { setFile(null); setPages(0); } };
}

function PdfPicker({ io, hint }: { io: ReturnType<typeof usePdfInput>; hint?: string }) {
  return (
    <Panel title="1. Choose a PDF" description={hint ?? 'The file is opened on this device and is never uploaded.'}>
      {!io.file ? (
        <Dropzone accept="application/pdf,.pdf" multiple={false} onFiles={io.load} title="Drop a PDF or browse" hint="PDF files up to 150 MB" />
      ) : (
        <FileRow name={io.file.name} meta={`${io.pages} ${io.pages === 1 ? 'page' : 'pages'} · ${formatBytes(io.file.size)}${io.from ? ' · sent from another tool' : ''}`} onRemove={io.clear} />
      )}
      <div className="mt-3"><Failure error={io.error} /></div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ Compress */

function Compress() {
  const io = usePdfInput('pdf-compress');
  const [mode, setMode] = useState<'raster' | 'tidy'>('raster');
  const [quality, setQuality] = useState(60);
  const [dpi, setDpi] = useState(110);
  const [targetKb, setTargetKb] = useState('');
  const [busy, setBusy] = useState<{ label: string; v?: number; max?: number } | null>(null);
  const [out, setOut] = useState<{ blob: Blob; q: number; note: string } | null>(null);
  const [error, setError] = useState('');
  const run = async () => {
    if (!io.file) return;
    setError(''); setOut(null);
    try {
      const target = targetKb.trim() ? Number(targetKb) * 1024 : 0;
      if (targetKb.trim() && (!Number.isFinite(target) || target < 10 * 1024)) throw Error('Target size must be at least 10 KB.');
      if (mode === 'tidy') {
        setBusy({ label: 'Rewriting the PDF structure' });
        await tick();
        const src = await openPdfLib(io.file);
        const dst = await PDFDocument.create();
        const copied = await dst.copyPages(src, src.getPageIndices());
        copied.forEach((p) => dst.addPage(p));
        const bytes = await dst.save({ useObjectStreams: true });
        setOut({ blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }), q: 100, note: 'Text, links and vector artwork are kept. Savings are usually small, and large for files with unused objects.' });
        return;
      }
      const { doc } = await openPdfjs(io.file);
      const total = doc.numPages;
      const qualities = target ? [quality, 50, 35, 25, 15].filter((q, i, a) => q <= quality && a.indexOf(q) === i) : [quality];
      let best: Blob | null = null; let usedQ = quality; let capped = false;
      for (const q of qualities) {
        const dst = await PDFDocument.create();
        for (let p = 1; p <= total; p++) {
          setBusy({ label: `Compressing at quality ${q}`, v: p, max: total });
          await tick();
          const r = await renderPage(doc, p, dpi / 72);
          capped ||= r.capped;
          const jpg = await canvasBlob(r.canvas, 'image/jpeg', q / 100);
          const img = await dst.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
          const page = dst.addPage([r.widthPt, r.heightPt]);
          page.drawImage(img, { x: 0, y: 0, width: r.widthPt, height: r.heightPt });
          r.canvas.width = r.canvas.height = 0;
        }
        best = new Blob([(await dst.save({ useObjectStreams: true })) as BlobPart], { type: 'application/pdf' });
        usedQ = q;
        if (!target || best.size <= target) break;
      }
      const met = !target || (best && best.size <= target);
      setOut({ blob: best!, q: usedQ, note: (target && !met ? 'The target size could not be reached even at the lowest quality. Try a lower resolution. ' : '') + (capped ? 'Very large pages were rendered at a reduced resolution to protect memory. ' : '') + 'Pages are now images, so text cannot be selected or searched. Keep the original if you need that.' });
    } catch (e) {
      setError(friendlyPdfError(e).message);
    } finally { setBusy(null); }
  };
  const saved = out && io.file ? Math.round((1 - out.blob.size / io.file.size) * 100) : 0;
  return (
    <div className="space-y-4">
      <PdfPicker io={io} />
      <Panel title="2. Choose how to shrink it">
        <div className="space-y-4">
          <Grid>
            <Field label="Method" htmlFor="c-mode">
              <Select id="c-mode" value={mode} onChange={(e) => setMode(e.target.value as 'raster' | 'tidy')}>
                <option value="raster">Smallest file (pages become images)</option>
                <option value="tidy">Keep text (tidy structure only)</option>
              </Select>
            </Field>
            {mode === 'raster' && (
              <Field label={`Image quality: ${quality}%`} htmlFor="c-q" hint="Lower is smaller and blurrier.">
                <input id="c-q" type="range" min={20} max={90} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="w-full" />
              </Field>
            )}
            {mode === 'raster' && (
              <Field label="Resolution" htmlFor="c-dpi" hint="150 suits reading on screen and standard print. 72 to 100 is for email.">
                <Select id="c-dpi" value={dpi} onChange={(e) => setDpi(Number(e.target.value))}>
                  {[72, 100, 110, 150, 200].map((d) => <option key={d} value={d}>{d} dpi</option>)}
                </Select>
              </Field>
            )}
            {mode === 'raster' && (
              <Field label="Target size in KB (optional)" htmlFor="c-t" hint="Tries lower quality until the file fits. Leave blank to use the slider only.">
                <Input id="c-t" inputMode="numeric" value={targetKb} onChange={(e) => setTargetKb(e.target.value)} placeholder="for example 500" />
              </Field>
            )}
          </Grid>
          <Button onClick={run} disabled={!io.file || !!busy}>Compress PDF</Button>
          {busy && <Busy label={busy.label} value={busy.v} max={busy.max} />}
          <Failure error={error} />
        </div>
      </Panel>
      {out && io.file && (
        <Panel title="Result">
          <p className="text-sm" data-testid="compress-summary">
            {formatBytes(io.file.size)} to <strong>{formatBytes(out.blob.size)}</strong>{saved > 0 ? ` (${saved}% smaller)` : ' (not smaller)'}
            {mode === 'raster' ? ` at quality ${out.q}%` : ''}.
          </p>
          {saved <= 0 && <div className="mt-3"><Note tone="warning">This file did not get smaller. It may already be compressed. Try a lower quality or resolution, or keep the original.</Note></div>}
          <div className="mt-3"><Note>{out.note}</Note></div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => downloadBlob(`${baseName(io.file!)}-compressed.pdf`, out.blob)}>Download PDF</Button>
          </div>
          <div className="mt-4"><SendTo from="pdf-compress" kind="pdf" files={() => [new File([out.blob], `${baseName(io.file!)}-compressed.pdf`, { type: 'application/pdf' })]} /></div>
        </Panel>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ PDF to images */

interface Shot { name: string; blob: Blob; w: number; h: number }
function ToImages() {
  const io = usePdfInput('pdf-to-images');
  const [range, setRange] = useState('');
  const [format, setFormat] = useState('image/png');
  const [scale, setScale] = useState(2);
  const [busy, setBusy] = useState<{ v: number; max: number } | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const urls = useMemo(() => shots.map((s) => URL.createObjectURL(s.blob)), [shots]);
  useEffect(() => () => urls.forEach(URL.revokeObjectURL), [urls]);
  const ext = format === 'image/png' ? 'png' : format === 'image/jpeg' ? 'jpg' : 'webp';
  const run = async () => {
    if (!io.file) return;
    setError(''); setShots([]); setNote('');
    try {
      const idx = parsePages(range, io.pages);
      if (idx.length > 200) throw Error('Choose 200 pages or fewer at a time.');
      const { doc } = await openPdfjs(io.file);
      const list: Shot[] = [];
      let capped = false;
      for (let i = 0; i < idx.length; i++) {
        setBusy({ v: i + 1, max: idx.length });
        await tick();
        const r = await renderPage(doc, idx[i] + 1, scale);
        capped ||= r.capped;
        const blob = await canvasBlob(r.canvas, format, format === 'image/png' ? undefined : 0.92);
        if (blob.type !== format) throw Error('This browser cannot save that image type. Choose PNG or JPEG.');
        list.push({ name: `${baseName(io.file)}-page-${String(idx[i] + 1).padStart(3, '0')}.${ext}`, blob, w: r.canvas.width, h: r.canvas.height });
        r.canvas.width = r.canvas.height = 0;
      }
      setShots(list);
      if (capped) setNote('Some pages were larger than the memory limit and were rendered at a reduced size.');
    } catch (e) {
      setError(friendlyPdfError(e).message);
    } finally { setBusy(null); }
  };
  const zip = async () => downloadBlob(`${baseName(io.file!)}-images.zip`, zipBlob(await Promise.all(shots.map(async (s) => ({ name: s.name, data: new Uint8Array(await s.blob.arrayBuffer()) })))));
  return (
    <div className="space-y-4">
      <PdfPicker io={io} />
      <Panel title="2. Settings">
        <div className="space-y-4">
          <Grid cols={3}>
            <Field label="Pages" htmlFor="i-r" hint="Blank means all pages. Example: 1-3,5">
              <Input id="i-r" value={range} onChange={(e) => setRange(e.target.value)} placeholder="all pages" />
            </Field>
            <Field label="Format" htmlFor="i-f">
              <Select id="i-f" value={format} onChange={(e) => setFormat(e.target.value)}>
                <option value="image/png">PNG (sharp, larger)</option>
                <option value="image/jpeg">JPEG (smaller)</option>
                <option value="image/webp">WebP (smaller, newer)</option>
              </Select>
            </Field>
            <Field label="Resolution" htmlFor="i-s">
              <Select id="i-s" value={scale} onChange={(e) => setScale(Number(e.target.value))}>
                <option value={1}>72 dpi (small)</option>
                <option value={1.5}>108 dpi</option>
                <option value={2}>144 dpi (default)</option>
                <option value={3}>216 dpi</option>
                <option value={4.17}>300 dpi (print)</option>
              </Select>
            </Field>
          </Grid>
          <Button onClick={run} disabled={!io.file || !!busy}>Convert pages</Button>
          {busy && <Busy label="Rendering pages" value={busy.v} max={busy.max} />}
          <Failure error={error} />
        </div>
      </Panel>
      {shots.length > 0 && (
        <Panel title={`${shots.length} ${shots.length === 1 ? 'image' : 'images'} ready`} actions={shots.length > 1 ? <Button size="sm" onClick={zip}>Download all as ZIP</Button> : undefined}>
          {note && <div className="mb-3"><Note tone="warning">{note}</Note></div>}
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shots.map((s, i) => (
              <li key={s.name} className="border border-line bg-surface p-2">
                <img src={urls[i]} alt={`Preview of ${s.name}`} className="h-44 w-full bg-white object-contain" />
                <p className="mt-2 truncate text-xs text-muted">{s.name}</p>
                <p className="text-[11px] text-muted">{s.w} × {s.h} px · {formatBytes(s.blob.size)}</p>
                <Button size="sm" variant="secondary" className="mt-2" onClick={() => downloadBlob(s.name, s.blob)}>Download</Button>
              </li>
            ))}
          </ul>
          <div className="mt-4"><SendTo from="pdf-to-images" kind="image" files={() => shots.map((s) => new File([s.blob], s.name, { type: s.blob.type }))} /></div>
        </Panel>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Background and colour */

function Background() {
  const io = usePdfInput('pdf-background');
  const [mode, setMode] = useState<'bg' | 'gray' | 'bw' | 'invert' | 'adjust'>('bg');
  const [color, setColor] = useState('#fff8e1');
  const [bright, setBright] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [threshold, setThreshold] = useState(160);
  const [busy, setBusy] = useState<{ v?: number; max?: number } | null>(null);
  const [out, setOut] = useState<Blob | null>(null);
  const [error, setError] = useState('');
  const run = async () => {
    if (!io.file) return;
    setError(''); setOut(null);
    try {
      if (mode === 'bg') {
        setBusy({});
        await tick();
        const src = await openPdfLib(io.file);
        const dst = await PDFDocument.create();
        const hex = color.replace('#', '');
        const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
        for (let i = 0; i < src.getPageCount(); i++) {
          const sp = src.getPage(i);
          const { width, height } = sp.getSize();
          const emb = await dst.embedPage(sp);
          const page = dst.addPage([width, height]);
          page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(r, g, b) });
          page.drawPage(emb, { x: 0, y: 0, width, height });
        }
        setOut(new Blob([(await dst.save()) as BlobPart], { type: 'application/pdf' }));
        return;
      }
      const { doc } = await openPdfjs(io.file);
      const dst = await PDFDocument.create();
      for (let p = 1; p <= doc.numPages; p++) {
        setBusy({ v: p, max: doc.numPages });
        await tick();
        const r = await renderPage(doc, p, 2);
        const ctx = r.canvas.getContext('2d')!;
        const img = ctx.getImageData(0, 0, r.canvas.width, r.canvas.height);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          let lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          if (mode === 'gray') d[i] = d[i + 1] = d[i + 2] = lum;
          else if (mode === 'bw') d[i] = d[i + 1] = d[i + 2] = lum >= threshold ? 255 : 0;
          else if (mode === 'invert') { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; }
          else for (let k = 0; k < 3; k++) d[i + k] = Math.max(0, Math.min(255, ((d[i + k] * bright) / 100 - 128) * (contrast / 100) + 128));
          void lum;
        }
        ctx.putImageData(img, 0, 0);
        const jpg = await canvasBlob(r.canvas, 'image/jpeg', 0.9);
        const emb = await dst.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
        dst.addPage([r.widthPt, r.heightPt]).drawImage(emb, { x: 0, y: 0, width: r.widthPt, height: r.heightPt });
        r.canvas.width = r.canvas.height = 0;
      }
      setOut(new Blob([(await dst.save()) as BlobPart], { type: 'application/pdf' }));
    } catch (e) {
      setError(friendlyPdfError(e).message);
    } finally { setBusy(null); }
  };
  const url = useBlobUrl(out);
  return (
    <div className="space-y-4">
      <PdfPicker io={io} />
      <Panel title="2. Choose an adjustment">
        <div className="space-y-4">
          <Grid>
            <Field label="Adjustment" htmlFor="b-m">
              <Select id="b-m" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
                <option value="bg">Page background colour (keeps text)</option>
                <option value="gray">Greyscale</option>
                <option value="bw">Black and white (for scans)</option>
                <option value="invert">Invert colours</option>
                <option value="adjust">Brightness and contrast</option>
              </Select>
            </Field>
            {mode === 'bg' && (
              <Field label="Background colour" htmlFor="b-c" hint="Painted behind the page. White areas change colour; images stay as they are.">
                <Input id="b-c" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-11 p-1" />
              </Field>
            )}
            {mode === 'bw' && (
              <Field label={`Threshold: ${threshold}`} htmlFor="b-t" hint="Pixels lighter than this become white.">
                <input id="b-t" type="range" min={60} max={220} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-full" />
              </Field>
            )}
            {mode === 'adjust' && (
              <>
                <Field label={`Brightness: ${bright}%`} htmlFor="b-b"><input id="b-b" type="range" min={50} max={170} value={bright} onChange={(e) => setBright(Number(e.target.value))} className="w-full" /></Field>
                <Field label={`Contrast: ${contrast}%`} htmlFor="b-k"><input id="b-k" type="range" min={50} max={200} value={contrast} onChange={(e) => setContrast(Number(e.target.value))} className="w-full" /></Field>
              </>
            )}
          </Grid>
          {mode !== 'bg' && <Note tone="warning">This option turns each page into an image, so text can no longer be selected. Only the background colour option keeps the original text.</Note>}
          <Button onClick={run} disabled={!io.file || !!busy}>Apply to all pages</Button>
          {busy && <Busy label="Processing pages" value={busy.v} max={busy.max} />}
          <Failure error={error} />
        </div>
      </Panel>
      {out && (
        <Panel title="Result">
          <p className="text-sm">{formatBytes(out.size)} · <a className="text-accent underline" href={url} target="_blank" rel="noreferrer">Preview in a new tab</a></p>
          <div className="mt-4"><Button onClick={() => downloadBlob(`${baseName(io.file!)}-adjusted.pdf`, out)}>Download PDF</Button></div>
          <div className="mt-4"><SendTo from="pdf-background" kind="pdf" files={() => [new File([out], `${baseName(io.file!)}-adjusted.pdf`, { type: 'application/pdf' })]} /></div>
        </Panel>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Compare */

interface PageDiff { page: number; pct: number | null; a?: string; b?: string; d?: string; textChanged: boolean; added: string[]; removed: string[] }
async function pageText(doc: any, n: number): Promise<string> {
  const page = await doc.getPage(n);
  const tc = await page.getTextContent();
  return tc.items.map((i: any) => ('str' in i ? i.str + (i.hasEOL ? '\n' : ' ') : '')).join('').replace(/[ \t]+/g, ' ').trim();
}
function wordDiff(a: string, b: string) {
  const wa = a.split(/\s+/).filter(Boolean), wb = b.split(/\s+/).filter(Boolean);
  const cap = 2500;
  if (wa.length > cap || wb.length > cap) return { added: [], removed: [], skipped: true };
  const dp = Array.from({ length: wa.length + 1 }, () => new Uint16Array(wb.length + 1));
  for (let i = wa.length - 1; i >= 0; i--) for (let j = wb.length - 1; j >= 0; j--) dp[i][j] = wa[i] === wb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const added: string[] = [], removed: string[] = [];
  let i = 0, j = 0;
  while (i < wa.length && j < wb.length) {
    if (wa[i] === wb[j]) { i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) removed.push(wa[i++]); else added.push(wb[j++]);
  }
  while (i < wa.length) removed.push(wa[i++]);
  while (j < wb.length) added.push(wb[j++]);
  return { added, removed, skipped: false };
}
function Compare() {
  const [fa, setFa] = useState<File | null>(null);
  const [fb, setFb] = useState<File | null>(null);
  const [busy, setBusy] = useState<{ v: number; max: number } | null>(null);
  const [diffs, setDiffs] = useState<PageDiff[] | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const run = async () => {
    if (!fa || !fb) return;
    setError(''); setDiffs(null); setInfo('');
    try {
      const [A, B] = await Promise.all([openPdfjs(fa), openPdfjs(fb)]);
      const na = A.doc.numPages, nb = B.doc.numPages;
      const max = Math.max(na, nb);
      if (max > 60) throw Error('Compare up to 60 pages at a time. Split the files first.');
      setInfo(na === nb ? '' : `Page counts differ: ${fa.name} has ${na}, ${fb.name} has ${nb}. Extra pages count as fully different.`);
      const out: PageDiff[] = [];
      for (let p = 1; p <= max; p++) {
        setBusy({ v: p, max });
        await tick();
        const ra = p <= na ? await renderPage(A.doc, p, 1) : null;
        const rb = p <= nb ? await renderPage(B.doc, p, 1) : null;
        const ta = p <= na ? await pageText(A.doc, p) : '';
        const tb = p <= nb ? await pageText(B.doc, p) : '';
        const wd = wordDiff(ta, tb);
        if (ra && rb) {
          const w = Math.max(ra.canvas.width, rb.canvas.width), h = Math.max(ra.canvas.height, rb.canvas.height);
          const mk = (c: HTMLCanvasElement) => { const x = document.createElement('canvas'); x.width = w; x.height = h; const g = x.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(c, 0, 0); return g.getImageData(0, 0, w, h); };
          const ia = mk(ra.canvas), ib = mk(rb.canvas);
          const dc = document.createElement('canvas'); dc.width = w; dc.height = h;
          const dg = dc.getContext('2d')!; const di = dg.createImageData(w, h);
          let changed = 0;
          for (let i = 0; i < ia.data.length; i += 4) {
            const delta = Math.abs(ia.data[i] - ib.data[i]) + Math.abs(ia.data[i + 1] - ib.data[i + 1]) + Math.abs(ia.data[i + 2] - ib.data[i + 2]);
            if (delta > 48) { changed++; di.data[i] = 230; di.data[i + 1] = 40; di.data[i + 2] = 80; di.data[i + 3] = 255; }
            else { const g = 255 - Math.round((255 - (ia.data[i] + ia.data[i + 1] + ia.data[i + 2]) / 3) * 0.35); di.data[i] = di.data[i + 1] = di.data[i + 2] = g; di.data[i + 3] = 255; }
          }
          dg.putImageData(di, 0, 0);
          out.push({ page: p, pct: (changed / (w * h)) * 100, a: ra.canvas.toDataURL('image/jpeg', 0.7), b: rb.canvas.toDataURL('image/jpeg', 0.7), d: dc.toDataURL('image/png'), textChanged: wd.added.length + wd.removed.length > 0, added: wd.added.slice(0, 40), removed: wd.removed.slice(0, 40) });
        } else out.push({ page: p, pct: null, a: ra?.canvas.toDataURL('image/jpeg', 0.7), b: rb?.canvas.toDataURL('image/jpeg', 0.7), textChanged: true, added: wd.added.slice(0, 40), removed: wd.removed.slice(0, 40) });
      }
      setDiffs(out);
    } catch (e) {
      setError(friendlyPdfError(e).message);
    } finally { setBusy(null); }
  };
  const differing = diffs?.filter((d) => d.pct === null || d.pct > 0.02 || d.textChanged) ?? [];
  const pick = (setter: (f: File | null) => void, f: File | null, label: string) => (
    <Panel title={label}>
      {f ? <FileRow name={f.name} meta={formatBytes(f.size)} onRemove={() => setter(null)} /> : <Dropzone accept="application/pdf,.pdf" multiple={false} onFiles={(fs) => setter(fs[0])} title="Drop a PDF" hint="Stays on this device" />}
    </Panel>
  );
  return (
    <div className="space-y-4">
      <Grid>{pick(setFa, fa, 'Original')}{pick(setFb, fb, 'Changed version')}</Grid>
      <div className="flex flex-wrap items-center gap-3"><Button onClick={run} disabled={!fa || !fb || !!busy}>Compare PDFs</Button></div>
      {busy && <Busy label="Comparing pages" value={busy.v} max={busy.max} />}
      <Failure error={error} />
      {info && <Note tone="warning">{info}</Note>}
      {diffs && (
        <Panel title="Result">
          <p className="text-sm" data-testid="compare-summary">{differing.length === 0 ? 'No differences found. Both files look identical on every page.' : `${differing.length} of ${diffs.length} pages differ.`}</p>
          <div className="mt-4 space-y-5">
            {differing.map((d) => (
              <article key={d.page} className="border border-line p-3">
                <h3 className="font-display text-sm font-semibold">Page {d.page} {d.pct === null ? '(only in one file)' : `· ${d.pct.toFixed(2)}% of pixels changed`}</h3>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {[['Original', d.a], ['Changed', d.b], ['Differences in red', d.d]].map(([l, s]) => (
                    <figure key={l}>{s ? <img src={s} alt={`${l}, page ${d.page}`} className="w-full border border-line bg-white" /> : <div className="flex h-24 items-center justify-center border border-dashed border-line text-xs text-muted">No page</div>}<figcaption className="mt-1 text-[11px] text-muted">{l}</figcaption></figure>
                  ))}
                </div>
                {d.textChanged && (
                  <div className="mt-3 text-xs leading-relaxed">
                    {d.removed.length > 0 && <p><span className="font-semibold text-danger">Removed words:</span> {d.removed.join(' ')}</p>}
                    {d.added.length > 0 && <p className="mt-1"><span className="font-semibold text-accent-2">Added words:</span> {d.added.join(' ')}</p>}
                  </div>
                )}
              </article>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Split */

function Split() {
  const io = usePdfInput('pdf-split');
  const [mode, setMode] = useState<'each' | 'every' | 'ranges'>('every');
  const [every, setEvery] = useState('1');
  const [ranges, setRanges] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<{ v: number; max: number } | null>(null);
  const [parts, setParts] = useState<{ name: string; bytes: Uint8Array }[]>([]);
  const run = async () => {
    if (!io.file) return;
    setError(''); setParts([]);
    try {
      const src = await openPdfLib(io.file);
      const total = src.getPageCount();
      let groups: number[][] = [];
      if (mode === 'ranges') {
        if (!ranges.trim()) throw Error('Enter ranges such as 1-3, 4-6, 7-.');
        groups = ranges.split(',').map((r) => parsePages(r, total));
      } else {
        const n = mode === 'each' ? 1 : Number(every);
        if (!Number.isInteger(n) || n < 1) throw Error('Pages per file must be a whole number of 1 or more.');
        for (let i = 0; i < total; i += n) groups.push(Array.from({ length: Math.min(n, total - i) }, (_, k) => i + k));
      }
      if (groups.length > 200) throw Error('That would make more than 200 files. Use a larger number of pages per file.');
      const out: typeof parts = [];
      for (let g = 0; g < groups.length; g++) {
        setBusy({ v: g + 1, max: groups.length });
        await tick();
        const dst = await PDFDocument.create();
        (await dst.copyPages(src, groups[g])).forEach((p) => dst.addPage(p));
        const first = groups[g][0] + 1, last = groups[g][groups[g].length - 1] + 1;
        out.push({ name: `${baseName(io.file)}-part-${g + 1}-pages-${first}${last !== first ? '-' + last : ''}.pdf`, bytes: await dst.save() });
      }
      setParts(out);
    } catch (e) {
      setError(friendlyPdfError(e).message);
    } finally { setBusy(null); }
  };
  return (
    <div className="space-y-4">
      <PdfPicker io={io} />
      <Panel title="2. How to split">
        <div className="space-y-4">
          <Grid>
            <Field label="Split by" htmlFor="s-m">
              <Select id="s-m" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
                <option value="each">Every page into its own file</option>
                <option value="every">A fixed number of pages per file</option>
                <option value="ranges">Custom ranges</option>
              </Select>
            </Field>
            {mode === 'every' && <Field label="Pages per file" htmlFor="s-n"><Input id="s-n" inputMode="numeric" value={every} onChange={(e) => setEvery(e.target.value)} /></Field>}
            {mode === 'ranges' && <Field label="Ranges, one file each" htmlFor="s-r" hint="Example: 1-3, 4-6, 7-"><Input id="s-r" value={ranges} onChange={(e) => setRanges(e.target.value)} placeholder="1-3, 4-6" /></Field>}
          </Grid>
          <Button onClick={run} disabled={!io.file || !!busy}>Split PDF</Button>
          {busy && <Busy label="Creating files" value={busy.v} max={busy.max} />}
          <Failure error={error} />
        </div>
      </Panel>
      {parts.length > 0 && (
        <Panel title={`${parts.length} files ready`} actions={<Button size="sm" onClick={() => downloadBlob(`${baseName(io.file!)}-split.zip`, zipBlob(parts.map((p) => ({ name: p.name, data: p.bytes }))))}>Download all as ZIP</Button>}>
          <ul className="space-y-2">{parts.map((p) => <li key={p.name}><FileRow name={p.name} meta={formatBytes(p.bytes.length)} /><Button size="sm" variant="ghost" onClick={() => downloadBlob(p.name, new Blob([p.bytes as BlobPart], { type: 'application/pdf' }))}>Download this file</Button></li>)}</ul>
        </Panel>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Extract text */

function ExtractText() {
  const io = usePdfInput('pdf-extract-text');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<{ v: number; max: number } | null>(null);
  const [error, setError] = useState('');
  const run = async () => {
    if (!io.file) return;
    setError(''); setText('');
    try {
      const { doc } = await openPdfjs(io.file);
      const parts: string[] = [];
      for (let p = 1; p <= doc.numPages; p++) {
        setBusy({ v: p, max: doc.numPages });
        await tick();
        parts.push(`--- Page ${p} ---\n${await pageText(doc, p)}`);
      }
      const all = parts.join('\n\n');
      if (!all.replace(/--- Page \d+ ---/g, '').trim()) throw Error('No text found. This looks like a scanned PDF made of images. ToolAtlas does not include OCR yet.');
      setText(all);
    } catch (e) {
      setError(friendlyPdfError(e).message);
    } finally { setBusy(null); }
  };
  return (
    <div className="space-y-4">
      <PdfPicker io={io} />
      <Panel title="2. Extract">
        <div className="space-y-4">
          <Button onClick={run} disabled={!io.file || !!busy}>Extract text</Button>
          {busy && <Busy label="Reading pages" value={busy.v} max={busy.max} />}
          <Failure error={error} />
          {text && (
            <>
              <label className="label block text-muted" htmlFor="x-t">Extracted text</label>
              <textarea id="x-t" readOnly value={text} className="min-h-64 w-full border border-line bg-raised/70 p-3 font-mono text-[13px]" />
              <div className="flex gap-2"><Button size="sm" onClick={() => downloadBlob(`${baseName(io.file!)}.txt`, new Blob([text], { type: 'text/plain;charset=utf-8' }))}>Download .txt</Button><Button size="sm" variant="secondary" onClick={() => void navigator.clipboard?.writeText(text)}>Copy</Button></div>
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ Form filler */

interface FieldDef { name: string; kind: 'text' | 'check' | 'choice' | 'radio' | 'unsupported'; options?: string[]; value: string | boolean; multiline?: boolean }
function FormFiller() {
  const io = usePdfInput('pdf-form-filler');
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [flatten, setFlatten] = useState(false);
  const [error, setError] = useState('');
  const [out, setOut] = useState<Blob | null>(null);
  const [signed, setSigned] = useState(false);
  const bytes = useRef<ArrayBuffer | null>(null);
  useEffect(() => {
    setOut(null); setFields([]); setSigned(false);
    if (!io.file) return;
    (async () => {
      try {
        const pdf = await openPdfLib(io.file!);
        bytes.current = await io.file!.arrayBuffer();
        const form = pdf.getForm();
        const defs: FieldDef[] = form.getFields().map((f) => {
          const name = f.getName();
          if (f instanceof PDFTextField) return { name, kind: 'text', value: f.getText() ?? '', multiline: f.isMultiline() };
          if (f instanceof PDFCheckBox) return { name, kind: 'check', value: f.isChecked() };
          if (f instanceof PDFDropdown) return { name, kind: 'choice', options: f.getOptions(), value: f.getSelected()[0] ?? '' };
          if (f instanceof PDFOptionList) return { name, kind: 'choice', options: f.getOptions(), value: f.getSelected()[0] ?? '' };
          if (f instanceof PDFRadioGroup) return { name, kind: 'radio', options: f.getOptions(), value: f.getSelected() ?? '' };
          return { name, kind: 'unsupported', value: '' };
        });
        setFields(defs);
        setSigned(/\/ByteRange|\/Sig\b/.test(new TextDecoder('latin1').decode(new Uint8Array(bytes.current!))));
      } catch (e) { setError(friendlyPdfError(e).message); }
    })();
  }, [io.file]);
  const set = (i: number, v: string | boolean) => setFields((fs) => fs.map((f, k) => (k === i ? { ...f, value: v } : f)));
  const save = async () => {
    setError('');
    try {
      const pdf = await openPdfLib(io.file!);
      const form = pdf.getForm();
      for (const f of fields) {
        if (f.kind === 'unsupported') continue;
        const field = form.getField(f.name);
        if (field instanceof PDFTextField) field.setText(String(f.value) || undefined);
        else if (field instanceof PDFCheckBox) f.value ? field.check() : field.uncheck();
        else if (field instanceof PDFDropdown) { if (f.value) field.select(String(f.value)); }
        else if (field instanceof PDFOptionList) { if (f.value) field.select(String(f.value)); }
        else if (field instanceof PDFRadioGroup) { if (f.value) field.select(String(f.value)); }
      }
      if (flatten) form.flatten();
      setOut(new Blob([(await pdf.save()) as BlobPart], { type: 'application/pdf' }));
    } catch (e) { setError(friendlyPdfError(e).message); }
  };
  return (
    <div className="space-y-4">
      <PdfPicker io={io} hint="Works with PDFs that have real form fields (AcroForms). Scanned forms and flat PDFs have none: use the PDF Editor to type on top of them." />
      {io.file && fields.length === 0 && !io.error && !error && <Note tone="warning">No fillable fields found. Use the PDF Editor tool to place text on this document instead.</Note>}
      {signed && <Note tone="warning">This PDF seems to contain a digital signature. Filling it in will invalidate the signature.</Note>}
      {fields.length > 0 && (
        <Panel title={`2. Fill ${fields.length} ${fields.length === 1 ? 'field' : 'fields'}`}>
          <div className="space-y-4">
            <Grid>
              {fields.map((f, i) => (
                <Field key={f.name} label={f.name} htmlFor={`f-${i}`}>
                  {f.kind === 'text' ? (f.multiline ? <textarea id={`f-${i}`} className="min-h-20 w-full border border-line bg-raised/70 p-2 text-sm" value={String(f.value)} onChange={(e) => set(i, e.target.value)} /> : <Input id={`f-${i}`} value={String(f.value)} onChange={(e) => set(i, e.target.value)} />)
                    : f.kind === 'check' ? <label className="flex items-center gap-2 text-sm"><input id={`f-${i}`} type="checkbox" checked={!!f.value} onChange={(e) => set(i, e.target.checked)} /> Checked</label>
                    : f.kind === 'unsupported' ? <p className="text-xs text-muted">This field type (signature or button) cannot be edited here.</p>
                    : <Select id={`f-${i}`} value={String(f.value)} onChange={(e) => set(i, e.target.value)}><option value="">(none)</option>{f.options!.map((o) => <option key={o} value={o}>{o}</option>)}</Select>}
                </Field>
              ))}
            </Grid>
            <Toggle checked={flatten} onChange={setFlatten} label="Flatten after filling" description="Turns fields into fixed text so nobody can edit them. You cannot undo this in the saved file." />
            <Button onClick={save}>Save filled PDF</Button>
            <Failure error={error} />
          </div>
        </Panel>
      )}
      {out && (
        <Panel title="Result">
          <Button onClick={() => downloadBlob(`${baseName(io.file!)}-filled.pdf`, out)}>Download filled PDF</Button>
          <div className="mt-4"><SendTo from="pdf-form-filler" kind="pdf" files={() => [new File([out], `${baseName(io.file!)}-filled.pdf`, { type: 'application/pdf' })]} /></div>
        </Panel>
      )}
    </div>
  );
}

const PARTS: Record<string, () => JSX.Element> = {
  'pdf-compress': Compress,
  'pdf-to-images': ToImages,
  'pdf-background': Background,
  'pdf-compare': Compare,
  'pdf-split': Split,
  'pdf-extract-text': ExtractText,
  'pdf-form-filler': FormFiller,
};
export default function PdfStudio() {
  const { toolId } = useParams();
  const Part = PARTS[toolId ?? ''];
  return Part ? <Part /> : <Note tone="warning">This PDF tool was not found.</Note>;
}
void pdfFile;
