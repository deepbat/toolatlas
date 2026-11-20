import { useState } from 'react';
import { Button, CopyButton, Dropzone, Field, Note, Panel, Select, TextArea } from '../../components/ui';
import { detectDelimiter, parseCsv, toCsv } from '../../lib/csvtools';
import { downloadBlob, formatBytes, publishOutput } from '../../lib/utils';

type ImageKind = 'png' | 'jpeg' | 'webp';
type DataKind = 'csv' | 'json';

interface LoadedImage {
  kind: 'image';
  file: File;
  img: HTMLImageElement;
  url: string;
  format: ImageKind;
}

interface LoadedData {
  kind: 'data';
  file: File;
  dataKind: DataKind;
  text: string;
}

type Loaded = LoadedImage | LoadedData;

const MIME: Record<ImageKind, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

function imageFormat(file: File): ImageKind | null {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (file.type === 'image/png' || ext === 'png') return 'png';
  if (file.type === 'image/webp' || ext === 'webp') return 'webp';
  if (file.type === 'image/jpeg' || ext === 'jpg' || ext === 'jpeg') return 'jpeg';
  return null;
}

function dataKind(file: File): DataKind | null {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (file.type === 'application/json' || ext === 'json') return 'json';
  if (ext === 'csv' || file.type === 'text/csv') return 'csv';
  return null;
}

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '') || 'converted';
}

export default function FileConverter() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [target, setTarget] = useState<ImageKind>('png');
  const [quality, setQuality] = useState(0.92);
  const [output, setOutput] = useState<{ name: string; blob: Blob; preview?: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setOutput(null);
    setError('');
  };

  const loadFile = async (file: File) => {
    reset();
    const imgFmt = imageFormat(file);
    if (imgFmt) {
      try {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.src = url;
        await img.decode();
        setLoaded({ kind: 'image', file, img, url, format: imgFmt });
        setTarget(imgFmt === 'png' ? 'jpeg' : 'png');
        return;
      } catch {
        setError('This image could not be decoded by your browser.');
        return;
      }
    }
    const dk = dataKind(file);
    if (dk) {
      if (file.size > 20 * 1024 * 1024) {
        setError('Data files up to 20 MB are supported. Choose a smaller file.');
        return;
      }
      const text = await file.text();
      setLoaded({ kind: 'data', file, dataKind: dk, text });
      return;
    }
    setError('Supported files: PNG, JPG or WebP images, and CSV or JSON data files.');
  };

  const convertImage = async (l: LoadedImage) => {
    const canvas = document.createElement('canvas');
    canvas.width = l.img.naturalWidth;
    canvas.height = l.img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    if (target !== 'png') {
      // JPEG/WebP have no alpha: flatten onto white so transparent logos stay readable.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(l.img, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, MIME[target], target === 'png' ? undefined : quality)
    );
    if (!blob) throw Error('Your browser could not write this format.');
    const ext = target === 'jpeg' ? 'jpg' : target;
    return { name: `${baseName(l.file.name)}.${ext}`, blob };
  };

  const convertData = (l: LoadedData) => {
    if (l.dataKind === 'csv') {
      const rows = parseCsv(l.text, detectDelimiter(l.text)).filter((r) => r.some((c) => c.trim() !== ''));
      if (rows.length < 2) throw Error('The CSV needs a header row and at least one data row.');
      const header = rows[0].map((h, i) => h.trim() || `column_${i + 1}`);
      const records = rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
      const text = JSON.stringify(records, null, 2);
      return { name: `${baseName(l.file.name)}.json`, blob: new Blob([text], { type: 'application/json' }), preview: text };
    }
    const parsed: unknown = JSON.parse(l.text);
    if (!Array.isArray(parsed) || parsed.length === 0 || typeof parsed[0] !== 'object' || parsed[0] === null) {
      throw Error('JSON to CSV needs an array of objects, like [{"name":"Asha","qty":2}].');
    }
    const keys = Array.from(new Set(parsed.flatMap((row) => Object.keys(row as Record<string, unknown>))));
    const rows = [
      keys,
      ...parsed.map((row) =>
        keys.map((k) => {
          const v = (row as Record<string, unknown>)[k];
          return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
        })
      ),
    ];
    const text = toCsv(rows, false);
    return { name: `${baseName(l.file.name)}.csv`, blob: new Blob([text], { type: 'text/csv' }), preview: text };
  };

  const convert = async () => {
    if (!loaded) return;
    setBusy(true);
    reset();
    try {
      const result = loaded.kind === 'image' ? await convertImage(loaded) : convertData(loaded);
      setOutput(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Conversion failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="1. Add a file">
        <Dropzone
          accept="image/png,image/jpeg,image/webp,.csv,.json"
          multiple={false}
          onFiles={(files) => {
            if (files[0]) void loadFile(files[0]);
          }}
          title="Drop an image, CSV or JSON file here"
          hint="PNG, JPG, WebP, CSV or JSON — converted on your device, never uploaded"
        />
        {loaded && (
          <div className="mt-4 flex flex-wrap items-center gap-4">
            {loaded.kind === 'image' && (
              <img
                src={loaded.url}
                alt={loaded.file.name}
                className="max-h-40 max-w-full border border-line object-contain"
              />
            )}
            <div className="min-w-0 text-sm text-muted">
              <p className="truncate font-medium text-fg">{loaded.file.name}</p>
              <p>
                {formatBytes(loaded.file.size)}
                {loaded.kind === 'image' &&
                  ` · ${loaded.format.toUpperCase()} · ${loaded.img.naturalWidth}×${loaded.img.naturalHeight}`}
                {loaded.kind === 'data' && ` · ${loaded.dataKind.toUpperCase()}`}
              </p>
            </div>
          </div>
        )}
      </Panel>

      {loaded?.kind === 'image' && (
        <Panel title="2. Choose the new format">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Convert to">
              <Select value={target} onChange={(e) => { setTarget(e.target.value as ImageKind); setOutput(null); }} aria-label="Target image format">
                {(['png', 'jpeg', 'webp'] as ImageKind[])
                  .filter((f) => f !== loaded.format)
                  .map((f) => (
                    <option key={f} value={f}>
                      {f === 'jpeg' ? 'JPG' : f.toUpperCase()}
                    </option>
                  ))}
              </Select>
            </Field>
            {target !== 'png' && (
              <Field label={`Quality (${Math.round(quality * 100)}%)`}>
                <input
                  type="range"
                  min={0.5}
                  max={1}
                  step={0.01}
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                  className="w-full"
                  aria-label="Output quality"
                />
              </Field>
            )}
          </div>
          <Button type="button" size="sm" className="mt-4" disabled={busy} onClick={() => void convert()}>
            {busy ? 'Converting…' : 'Convert'}
          </Button>
        </Panel>
      )}

      {loaded?.kind === 'data' && (
        <Panel title={`2. Convert ${loaded.dataKind.toUpperCase()} to ${loaded.dataKind === 'csv' ? 'JSON' : 'CSV'}`}>
          <Button type="button" size="sm" disabled={busy} onClick={() => void convert()}>
            {busy ? 'Converting…' : `Convert to ${loaded.dataKind === 'csv' ? 'JSON' : 'CSV'}`}
          </Button>
        </Panel>
      )}

      {error && <Note tone="warning">{error}</Note>}

      {output && (
        <Panel
          title="3. Save the converted file"
          description={`${output.name} · ${formatBytes(output.blob.size)}`}
          actions={
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={() => downloadBlob(output.name, output.blob)}>
                Download
              </Button>
              {output.preview && <CopyButton value={output.preview} label="Copy" size="sm" />}
              {loaded?.kind === 'image' && (
                <Button type="button" variant="ghost" size="sm" onClick={() => publishOutput(output.name, output.blob)}>
                  Send output to…
                </Button>
              )}
            </div>
          }
        >
          {output.preview && (
            <TextArea readOnly value={output.preview.slice(0, 4000)} rows={8} className="w-full font-mono text-xs" aria-label="Converted data preview" />
          )}
          {!output.preview && loaded?.kind === 'image' && (
            <img src={URL.createObjectURL(output.blob)} alt="Converted result" className="max-h-56 max-w-full border border-line object-contain" />
          )}
        </Panel>
      )}

      <Note>
        Every conversion runs in your browser with canvas and text parsing — no server, no upload, no queue.
        WebP photos from WhatsApp convert cleanly to JPG for forms that reject WebP.
      </Note>
    </div>
  );
      }
