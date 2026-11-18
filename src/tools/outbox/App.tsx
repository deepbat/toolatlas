import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { Button, CopyButton, Dropzone, Field, Grid, Input, Note, Panel, Select } from '../../components/ui';
import { downloadBlob, formatBytes, publishOutput } from '../../lib/utils';
import { canvasToBlob } from '../shared';

/* ------------------------------------------------------------------ */
/* Shared image plumbing: one photo in, one processed image out.       */
/* Everything runs on canvas in this browser; nothing is uploaded.    */
/* ------------------------------------------------------------------ */

function usePhoto() {
  const [file, setFile] = useState<File | null>(null);
  const [src, setSrc] = useState('');
  const [size, setSize] = useState([0, 0]);
  const [error, setError] = useState('');
  const [output, setOutput] = useState<{ blob: Blob; url: string; width: number; height: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);
  useEffect(() => () => { if (output) URL.revokeObjectURL(output.url); }, [output]);

  async function load(files: File[]) {
    const f = files[0];
    if (!f) return;
    if (f.size > 30 * 1024 * 1024) { setError('Choose a file under 30 MB.'); return; }
    setError('');
    setOutput(null);
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth * img.naturalHeight > 40e6) { URL.revokeObjectURL(url); setError('Use an image under 40 megapixels to protect phone memory.'); return; }
      setSrc(url);
      setFile(f);
      setSize([img.naturalWidth, img.naturalHeight]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); setError('This format could not be decoded. Try JPG, PNG or WebP.'); };
    img.src = url;
  }

  async function finish(canvas: HTMLCanvasElement, name: string) {
    const blob = await canvasToBlob(canvas, 'image/png');
    if (!blob) throw Error('Image encoding failed.');
    publishOutput(name, blob);
    setOutput({ blob, url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height });
  }

  return { file, src, size, error, setError, output, setOutput, busy, setBusy, load, finish };
}

async function drawInto(src: string, maxDim: number): Promise<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

function Picker({ s }: { s: ReturnType<typeof usePhoto> }) {
  return (
    <Panel title="Choose a photo" description="JPG, PNG, WebP and browser-supported formats. Up to 30 MB / 40 megapixels.">
      <Dropzone accept="image/*" multiple={false} onFiles={s.load} title="Drop an image or browse" hint="Your image stays on this device." />
      {s.file && (
        <div className="mt-4 flex items-center gap-4">
          <img src={s.src} alt="Source preview" className="h-24 w-24 object-contain" />
          <p className="break-all text-sm">{s.file.name}<br />{s.size[0]} × {s.size[1]} px · {formatBytes(s.file.size)}</p>
        </div>
      )}
    </Panel>
  );
}

function Result({ s, id, label }: { s: ReturnType<typeof usePhoto>; id: string; label: string }) {
  if (!s.output) return null;
  return (
    <Panel title={label}>
      <img alt="Processed image preview" src={s.output.url} className="max-h-80 max-w-full object-contain" />
      <p className="my-4" role="status">{s.output.width} × {s.output.height} px · {formatBytes(s.output.blob.size)}</p>
      <Button onClick={() => downloadBlob(`toolatlas-${id}.png`, s.output!.blob)}>Download PNG</Button>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Photo to Colouring Page: Sobel edges, black lines on white.         */
/* ------------------------------------------------------------------ */

function ColouringPage() {
  const s = usePhoto();
  const [threshold, setThreshold] = useState('45');

  async function run() {
    if (!s.src) return;
    s.setBusy(true);
    s.setError('');
    try {
      const t = Number(threshold);
      if (!Number.isFinite(t) || t < 5 || t > 200) throw Error('Line sensitivity must be between 5 and 200.');
      const { canvas, ctx } = await drawInto(s.src, 1200);
      const w = canvas.width;
      const h = canvas.height;
      const data = ctx.getImageData(0, 0, w, h);
      const grey = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) {
        const r = data.data[i * 4];
        const g = data.data[i * 4 + 1];
        const b = data.data[i * 4 + 2];
        grey[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      }
      const out = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const at = (dx: number, dy: number) => grey[Math.min(h - 1, Math.max(0, y + dy)) * w + Math.min(w - 1, Math.max(0, x + dx))];
          const gx = -at(-1, -1) - 2 * at(-1, 0) - at(-1, 1) + at(1, -1) + 2 * at(1, 0) + at(1, 1);
          const gy = -at(-1, -1) - 2 * at(0, -1) - at(1, -1) + at(-1, 1) + 2 * at(0, 1) + at(1, 1);
          const mag = Math.sqrt(gx * gx + gy * gy);
          const v = mag > t ? 0 : 255;
          const i = (y * w + x) * 4;
          out.data[i] = v; out.data[i + 1] = v; out.data[i + 2] = v; out.data[i + 3] = 255;
        }
      }
      ctx.putImageData(out, 0, 0);
      await s.finish(canvas, 'toolatlas-colouring-page.png');
    } catch (e) {
      s.setError(e instanceof Error ? e.message : 'Image processing failed.');
    } finally {
      s.setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Picker s={s} />
      <Panel title="Settings">
        <Field label={`Line sensitivity: ${threshold} (lower = more lines)`} hint="Photos with a clear subject on a plain background work best. Busy backgrounds become busy outlines.">
          <input aria-label="Line sensitivity" type="range" min={5} max={200} value={threshold} onChange={(e) => setThreshold(e.target.value)} className="w-full" />
        </Field>
        <Button className="mt-4" disabled={!s.file || s.busy} onClick={run}>{s.busy ? 'Drawing outlines…' : 'Make colouring page'}</Button>
        {s.error && <p role="alert" className="mt-4 text-danger">{s.error}</p>}
      </Panel>
      <Result s={s} id="photo-colouring-page" label="Colouring page ready" />
      <Panel title="Before you print"><p className="text-sm leading-relaxed text-muted">The output is a black-and-white PNG with outlines only — no grey shading, so it prints cleanly on any printer. Print at 100% for A4. Faces and fine detail do not always survive edge detection; a simple, well-lit photo works best.</p></Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Colour Blindness Simulator: Machado et al. simulation matrices.     */
/* ------------------------------------------------------------------ */

const BLIND_MATRICES: Record<string, number[]> = {
  Protanopia: [0.567, 0.433, 0, 0.558, 0.442, 0, 0, 0.242, 0.758],
  Deuteranopia: [0.625, 0.375, 0, 0.7, 0.3, 0, 0, 0.3, 0.7],
  Tritanopia: [0.95, 0.05, 0, 0, 0.433, 0.567, 0, 0.475, 0.525],
  'Total colour blindness': [0.299, 0.587, 0.114, 0.299, 0.587, 0.114, 0.299, 0.587, 0.114],
};

function ColourBlind() {
  const s = usePhoto();
  const [mode, setMode] = useState('Deuteranopia');

  async function run() {
    if (!s.src) return;
    s.setBusy(true);
    s.setError('');
    try {
      const { canvas, ctx } = await drawInto(s.src, 1200);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const m = BLIND_MATRICES[mode];
      for (let i = 0; i < data.data.length; i += 4) {
        const r = data.data[i];
        const g = data.data[i + 1];
        const b = data.data[i + 2];
        data.data[i] = Math.min(255, Math.max(0, m[0] * r + m[1] * g + m[2] * b));
        data.data[i + 1] = Math.min(255, Math.max(0, m[3] * r + m[4] * g + m[5] * b));
        data.data[i + 2] = Math.min(255, Math.max(0, m[6] * r + m[7] * g + m[8] * b));
      }
      ctx.putImageData(data, 0, 0);
      await s.finish(canvas, 'toolatlas-colour-blind.png');
    } catch (e) {
      s.setError(e instanceof Error ? e.message : 'Image processing failed.');
    } finally {
      s.setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Picker s={s} />
      <Panel title="Settings">
        <Grid>
          <Field label="Vision type to simulate">
            <Select aria-label="Vision type to simulate" value={mode} onChange={(e) => setMode(e.target.value)}>
              {Object.keys(BLIND_MATRICES).map((m) => <option key={m}>{m}</option>)}
            </Select>
          </Field>
        </Grid>
        <p className="mt-2 text-sm text-muted">Deuteranopia (red-green) is the most common form, affecting about 1 in 12 men. Protanopia is red-blind, tritanopia is blue-yellow, and total colour blindness sees only greys.</p>
        <Button className="mt-4" disabled={!s.file || s.busy} onClick={run}>{s.busy ? 'Simulating…' : 'Simulate'}</Button>
        {s.error && <p role="alert" className="mt-4 text-danger">{s.error}</p>}
      </Panel>
      {s.output && s.src && (
        <Panel title="Compare">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><p className="mb-2 text-sm text-muted">Original</p><img alt="Original photo" src={s.src} className="max-h-80 w-full object-contain" /></div>
            <div><p className="mb-2 text-sm text-muted">{mode}</p><img alt={`Photo as seen with ${mode}`} src={s.output.url} className="max-h-80 w-full object-contain" /></div>
          </div>
        </Panel>
      )}
      <Result s={s} id="colour-blind-simulator" label="Simulated image ready" />
      <Panel title="Before you use this"><p className="text-sm leading-relaxed text-muted">This is a simulation for design checks and awareness, using the widely used Machado matrices. It is not a medical diagnosis, and real colour vision varies from person to person. Use it to check whether a chart, map or poster still works when colour is not the only signal.</p></Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Privacy Pixelator: shrink the image to blocks, then scale it back   */
/* with smoothing off, so detail is destroyed, not just blurred.       */
/* ------------------------------------------------------------------ */

function Pixelator() {
  const s = usePhoto();
  const [block, setBlock] = useState('16');

  async function run() {
    if (!s.src) return;
    s.setBusy(true);
    s.setError('');
    try {
      const b = Number(block);
      if (!Number.isInteger(b) || b < 2 || b > 100) throw Error('Block size must be a whole number from 2 to 100.');
      const { canvas, ctx } = await drawInto(s.src, 1600);
      const small = document.createElement('canvas');
      small.width = Math.max(1, Math.floor(canvas.width / b));
      small.height = Math.max(1, Math.floor(canvas.height / b));
      const sctx = small.getContext('2d')!;
      sctx.drawImage(canvas, 0, 0, small.width, small.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, canvas.width, canvas.height);
      await s.finish(canvas, 'toolatlas-pixelated.png');
    } catch (e) {
      s.setError(e instanceof Error ? e.message : 'Image processing failed.');
    } finally {
      s.setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Picker s={s} />
      <Panel title="Settings">
        <Field label={`Block size: ${block} px (bigger = harder to read)`} hint="A face needs roughly 12–20 px blocks to be unreadable; a number plate usually needs 8–12 px. Check the preview before sharing.">
          <input aria-label="Block size" type="range" min={2} max={100} value={block} onChange={(e) => setBlock(e.target.value)} className="w-full" />
        </Field>
        <Button className="mt-4" disabled={!s.file || s.busy} onClick={run}>{s.busy ? 'Pixelating…' : 'Pixelate whole photo'}</Button>
        {s.error && <p role="alert" className="mt-4 text-danger">{s.error}</p>}
      </Panel>
      <Result s={s} id="photo-pixelator" label="Pixelated copy ready" />
      <Panel title="Before you share"><p className="text-sm leading-relaxed text-muted">This pixelates the whole photo. To hide one face or plate in an otherwise normal photo, crop to that area first, pixelate it, and use the result. Pixelation destroys detail — unlike a blur, it cannot be reversed from the downloaded file. Always share the downloaded copy, never the original.</p></Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* UPI QR Generator: upi://pay link rendered as a QR code.             */
/* ------------------------------------------------------------------ */

function UpiQr() {
  const [upiId, setUpiId] = useState('deepak@okhdfcbank');
  const [name, setName] = useState('Deepak Batra');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [dataUrl, setDataUrl] = useState('');
  const [link, setLink] = useState('');
  const [error, setError] = useState('');

  function build() {
    setError('');
    const id = upiId.trim();
    if (!/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(id)) { setError('Enter a valid UPI ID, like name@okhdfcbank.'); setDataUrl(''); setLink(''); return; }
    const amt = amount.trim();
    if (amt && (!/^\d+(\.\d{1,2})?$/.test(amt) || Number(amt) <= 0 || Number(amt) > 100000)) { setError('Amount must be a number from 0.01 to 100,000, or leave it blank so the payer enters it.'); return; }
    const params = new URLSearchParams();
    params.set('pa', id);
    if (name.trim()) params.set('pn', name.trim());
    if (amt) params.set('am', amt);
    if (note.trim()) params.set('tn', note.trim());
    params.set('cu', 'INR');
    const url = `upi://pay?${params.toString()}`;
    setLink(url);
    QRCode.toDataURL(url, { width: 480, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
      .then((u) => setDataUrl(u))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not build the QR code.'));
  }

  async function download() {
    if (!dataUrl) return;
    const blob = await (await fetch(dataUrl)).blob();
    publishOutput('toolatlas-upi-qr.png', blob);
    downloadBlob('toolatlas-upi-qr.png', blob);
  }

  return (
    <div className="space-y-4">
      <Panel title="Payment details" description="Your UPI ID is only used to build the QR code on this device. No payment is made here.">
        <Grid>
          <Field label="Your UPI ID">
            <Input aria-label="Your UPI ID" value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="name@okhdfcbank" />
          </Field>
          <Field label="Payee name (shown in the app)">
            <Input aria-label="Payee name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Amount in ₹ (optional — leave blank to let the payer choose)">
            <Input aria-label="Amount in rupees" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 250" />
          </Field>
          <Field label="Note (optional)">
            <Input aria-label="Note" value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Rent — November" />
          </Field>
        </Grid>
        <Button className="mt-4" onClick={build}>Generate QR code</Button>
        {error && <p role="alert" className="mt-4 text-danger">{error}</p>}
      </Panel>
      {dataUrl && (
        <Panel title="Your UPI QR code" actions={<CopyButton value={link} label="Copy UPI link" />}>
          <img alt="UPI payment QR code" src={dataUrl} className="h-64 w-64" />
          <p className="my-4 break-all font-mono text-sm">{link}</p>
          <Button onClick={download}>Download QR PNG</Button>
          <p className="mt-3 text-xs text-muted">Print it on a bill, a shop counter or a rent notice. Anyone who scans it pays the UPI ID above — double-check the ID before printing, and test it with ₹1 first.</p>
        </Panel>
      )}
      <Panel title="Before you print"><p className="text-sm leading-relaxed text-muted">This builds a standard UPI payment link (upi://pay) and a QR code for it, the same format GPay, PhonePe, Paytm and BHIM read. No money moves until someone scans it and confirms in their own UPI app. A fixed amount cannot be changed by the payer; a blank amount lets them type it in.</p></Panel>
    </div>
  );
}

const PARTS: Record<string, () => JSX.Element> = {
  'photo-colouring-page': ColouringPage,
  'colour-blind-simulator': ColourBlind,
  'photo-pixelator': Pixelator,
  'upi-qr': UpiQr,
};

export default function OutboxApp() {
  const { toolId } = useParams();
  const Part = PARTS[toolId ?? ''];
  if (!Part) return <Note tone="warning">This tool was not found.</Note>;
  return <Part />;
}
