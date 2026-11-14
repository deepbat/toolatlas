import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Dropzone, Field, Grid, Input, Note, Panel, Toggle } from '../../components/ui';
import { downloadBlob, publishOutput } from '../../lib/utils';
import { ceiling, fitImage, fitPdf, isPdf, validateFiles, type FitResult } from './engine';

type Mode = 'photo' | 'signature' | 'pdf';
export default function ExactKB() {
  const [mode, setMode] = useState<Mode>('photo');
  const [files, setFiles] = useState<File[]>([]);
  const [kb, setKb] = useState('50');
  const [clean, setClean] = useState(true);
  const [strength, setStrength] = useState(22);
  const [resize, setResize] = useState(true);
  const [flatten, setFlatten] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [out, setOut] = useState<FitResult | null>(null);
  const [urls, setUrls] = useState<string[]>([]);
  const [original, setOriginal] = useState('');
  const [dimensions, setDimensions] = useState('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; window.dispatchEvent(new CustomEvent('toolatlas:output', { detail: null })); return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const u = out?.previews.map((b) => URL.createObjectURL(b)) ?? [];
    setUrls(u); return () => u.forEach((x) => URL.revokeObjectURL(x));
  }, [out]);
  useEffect(() => {
    if (!files[0] || isPdf(files[0])) { setOriginal(''); return; }
    const u = URL.createObjectURL(files[0]); setOriginal(u); return () => URL.revokeObjectURL(u);
  }, [files]);
  const reset = () => { setOut(null); setError(''); window.dispatchEvent(new CustomEvent('toolatlas:output', { detail: null })); };
  const pick = (selected: File[]) => {
    if (busy) return;
    reset();
    try { validateFiles(selected, mode === 'pdf'); setFiles(selected); }
    catch (e) { setFiles([]); setError((e as Error).message); }
  };
  const run = async () => {
    reset();
    try {
      const cap = ceiling(kb); validateFiles(files, mode === 'pdf');
      setBusy('Preparing files on this device');
      const status = (s: string) => { if (alive.current) setBusy(s); };
      const result = mode === 'pdf' ? await fitPdf(files, cap, flatten, status) : await fitImage(files[0], cap, mode === 'signature' && clean, strength, resize, status);
      if (result.blob.size > cap) throw Error('The final file did not meet the limit. Try a higher limit.');
      if (alive.current) { setOut(result); publishOutput(filename, result.blob); }
    } catch (e) { if (alive.current) setError((e as Error).message); }
    finally { if (alive.current) setBusy(''); }
  };
  const filename = `toolatlas-${mode === 'pdf' ? 'combined' : mode}-under-${kb.replace(/[^\d.]/g, '')}kb.${mode === 'pdf' ? 'pdf' : 'jpg'}`;
  return <div className="space-y-4">
    <Panel title="Form-ready files. Under your KB limit." description="Photos, signatures and marksheets, processed only on this device. No account or upload.">
      <div className="flex flex-wrap gap-2" role="group" aria-label="File task">
        {([['photo', 'Photo'], ['signature', 'Signature cleanup'], ['pdf', 'Combine PDFs / images']] as const).map(([id, label]) => <Button key={id} variant={mode === id ? 'primary' : 'secondary'} aria-pressed={mode === id} disabled={!!busy} onClick={() => { setMode(id); setFiles([]); reset(); setKb(id === 'pdf' ? '200' : id === 'signature' ? '20' : '50'); }}>{label}</Button>)}
      </div>
      <div className="mt-4">
        <fieldset disabled={!!busy}>
          <Dropzone key={mode} accept={mode === 'pdf' ? '.pdf,.jpg,.jpeg,.png,.webp' : '.jpg,.jpeg,.png,.webp'} multiple={mode === 'pdf'} onFiles={pick} title={mode === 'pdf' ? 'Choose PDFs or marksheet photos' : 'Choose a photo or signature'} hint={mode === 'pdf' ? 'Up to 12 files, 24 pages, 80 MB total. All pages are kept.' : 'JPG, PNG or WebP, up to 20 MB and 24 megapixels.'} />
        </fieldset>
      </div>
      {files.length > 0 && <div className="mt-4 space-y-2" aria-label="Selected files">
        {files.map((f, i) => <div key={i} className="flex flex-wrap items-center gap-2 border border-line p-2 text-sm">
          <span className="min-w-0 flex-1 break-all">{i+1}. {f.name} <span className="text-muted">({(f.size/1000).toFixed(1)} KB)</span></span>
          {mode === 'pdf' && <><Button size="sm" variant="ghost" aria-label={`Move file ${i+1} up`} disabled={!!busy || i === 0} onClick={() => { const a = [...files]; [a[i-1], a[i]] = [a[i], a[i-1]]; setFiles(a); reset(); }}>Up</Button><Button size="sm" variant="ghost" aria-label={`Remove file ${i+1}`} disabled={!!busy} onClick={() => { setFiles(files.filter((_, j) => j !== i)); reset(); }}>Remove</Button></>}
        </div>)}
        {original && mode !== 'pdf' && <div className="flex items-center gap-3"><img src={original} className="h-20 w-20 border border-line object-contain" alt="Source preview" onLoad={(e) => setDimensions(`${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight} px`)} /><p className="text-xs text-muted">{dimensions}</p></div>}
        <p className="text-xs text-muted">{mode === 'pdf' ? 'Combined in this order, including all pages in each PDF. Choosing files again replaces this list.' : 'The original file is never changed.'}</p>
      </div>}
    </Panel>
    <Panel title="Choose the size your form asks for">
      <fieldset disabled={!!busy} className="space-y-4">
        <Grid>
          <Field label="Maximum size (KB)" htmlFor="exact-kb-limit" hint="1 KB = 1,000 bytes. Output stays strictly below this ceiling, not padded to an exact size.">
            <Input id="exact-kb-limit" type="number" min="5" max="20000" step="any" value={kb} onChange={(e) => { setKb(e.target.value); reset(); }} />
          </Field>
          <div className="flex flex-wrap items-center gap-2" aria-label="Size presets">
            {[20, 50, 100, 200, 500, 1000].map((n) => <Button key={n} size="sm" variant="secondary" aria-pressed={kb === String(n)} onClick={() => { setKb(String(n)); reset(); }}>{n} KB</Button>)}
          </div>
        </Grid>
        {mode !== 'pdf' && <Toggle checked={resize} onChange={(v) => { setResize(v); reset(); }} label="Allow smaller pixel dimensions if needed" description="Keeps the aspect ratio. Turn off if your form requires the original dimensions." />}
        {mode === 'signature' && <>
          <Toggle checked={clean} onChange={(v) => { setClean(v); reset(); }} label="Clean up the paper" description="Whiten uneven shadows and keep dark strokes as blue ink. Best for plain paper, not complex backgrounds." />
          {clean && <Field label={`Paper cleanup strength: ${strength}%`} htmlFor="exact-strength" hint="Higher removes more paper but may erase faint ink. Always compare the result.">
            <input id="exact-strength" className="w-full" type="range" min="8" max="42" value={strength} onChange={(e) => { setStrength(Number(e.target.value)); reset(); }} />
          </Field>}
        </>}
        {mode === 'pdf' && <>
          <Note>PDF-only inputs are first merged without converting text to images. If that is too large, image conversion can shrink it further. Photos are placed on A4 pages without cropping. For static documents only: merging may lose interactive forms or bookmarks and invalidates digital signatures. Keep your originals.</Note>
          {files.some(isPdf) && <Toggle checked={flatten} onChange={(v) => { setFlatten(v); reset(); }} label="Allow PDF pages to become images if needed" description="This removes searchable text, interactive forms, links and digital signatures. Do not use for signed or fillable documents you need to preserve." />}
        </>}
        <Button onClick={run} disabled={!files.length || !!busy}>{busy ? 'Working on this device...' : mode === 'pdf' ? 'Combine and fit to limit' : 'Process image'}</Button>
      </fieldset>
      {busy && <p role="status" className="mt-3 text-sm text-muted">{busy}. Large PDFs can take a minute; keep this tab open.</p>}
      {error && <p role="alert" className="mt-3 border border-danger/50 p-3 text-sm">{error}</p>}
    </Panel>
    {out && <Panel title="Ready to review">
      <div data-testid="exact-kb-result" className="space-y-3">
        <p className="font-display text-2xl font-semibold">{(out.blob.size/1000).toFixed(2)} KB <span className="text-base text-muted">under {kb} KB</span></p>
        <p className="text-xs text-muted">{out.blob.size.toLocaleString()} bytes{out.width ? ` | ${out.width} x ${out.height} pixels` : ''}. Final file size verified.</p>
        <Note>{out.note} File-size compliance does not guarantee a portal will accept the format, dimensions or readability.</Note>
        <div className="grid gap-3 sm:grid-cols-2">
          {original && mode !== 'pdf' && <figure><figcaption className="mb-2 text-sm text-muted">Original</figcaption><img src={original} className="h-56 w-full border border-line bg-white object-contain" alt="Original selected image" /></figure>}
          {urls.map((u, i) => <figure key={u}><figcaption className="mb-2 text-sm text-muted">{mode === 'pdf' ? `Output page ${i+1}` : 'After'}</figcaption><img src={u} className="h-56 w-full border border-line bg-white object-contain" alt={mode === 'pdf' ? `Compressed page ${i+1}` : 'Processed image preview'} /></figure>)}
        </div>
        <Button onClick={() => downloadBlob(filename, out.blob)}>Download {mode === 'pdf' ? 'PDF' : 'image'}</Button>
      </div>
    </Panel>}
    <p className="text-sm text-muted">Need a different output? <Link className="underline" to="/tools/signature-maker/">Transparent signature PNG</Link> | <Link className="underline" to="/tools/image-compressor/">Manual image settings</Link> | <Link className="underline" to="/tools/pdf-compress/">PDF quality controls</Link></p>
  </div>;
}
