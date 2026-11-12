import { useEffect, useState } from 'react';
import { Button, Dropzone, Field, Grid, Panel, ProgressBar, Result, Select } from '../../components/ui';
import { downloadBlob, formatBytes, formatNumber } from '../../lib/utils';
import { canvasToBlob, num } from '../shared';

interface Source {
  file: File;
  url: string;
  width: number;
  height: number;
}

interface Output {
  blob: Blob;
  url: string;
  width: number;
  height: number;
  type: string;
}

export default function ImageCompressor() {
  const [source, setSource] = useState<Source | null>(null);
  const [maxWidth, setMaxWidth] = useState('1600');
  const [quality, setQuality] = useState('0.8');
  const [format, setFormat] = useState('image/jpeg');
  const [output, setOutput] = useState<Output | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    return () => {
      if (source) URL.revokeObjectURL(source.url);
    };
  }, [source]);

  useEffect(() => {
    return () => {
      if (output) URL.revokeObjectURL(output.url);
    };
  }, [output]);

  const load = (files: File[]) => {
    const file = files[0];
    if (!file || !file.type.startsWith('image/')) {
      setError('Choose an image file (JPG, PNG or WebP).');
      return;
    }
    setError('');
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setSource({ file, url, width: image.naturalWidth, height: image.naturalHeight });
      setOutput(null);
    };
    image.onerror = () => setError('That image could not be read.');
    image.src = url;
  };

  const compress = async () => {
    if (!source) return;
    setBusy(true);
    setError('');
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('The image could not be decoded.'));
        element.src = source.url;
      });

      const limit = Math.max(0, Math.round(num(maxWidth, 0)));
      const scale = limit > 0 ? Math.min(1, limit / image.naturalWidth) : 1;
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas is unavailable in this browser.');
      if (format === 'image/jpeg') {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
      }
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, width, height);

      const blob = await canvasToBlob(canvas, format, Math.min(1, Math.max(0.05, num(quality, 0.8))));
      if (!blob) throw new Error('The browser could not encode that format.');

      setOutput({ blob, url: URL.createObjectURL(blob), width, height, type: format });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Compression failed.');
    } finally {
      setBusy(false);
    }
  };

  const saving = source && output ? (1 - output.blob.size / source.file.size) * 100 : 0;

  return (
    <div className="space-y-4">
      <Panel title="Choose an image">
        <Dropzone
          accept="image/*"
          multiple={false}
          onFiles={load}
          title="Drop an image"
          hint="JPG, PNG or WebP · everything is processed on this device"
        />

        {source && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-raised/40 p-3">
            <img src={source.url} alt="" className="h-14 w-14 rounded-lg border border-line object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-fg">{source.file.name}</p>
              <p className="text-xs text-muted">
                {formatBytes(source.file.size)} · {source.width} × {source.height} px
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSource(null);
                setOutput(null);
              }}
            >
              Remove
            </Button>
          </div>
        )}
      </Panel>

      <Panel title="Settings">
        <Grid cols={3}>
          <Field label="Maximum width (px)" hint="Leave empty or 0 for original size.">
            <input
              type="number"
              value={maxWidth}
              onChange={(event) => setMaxWidth(event.target.value)}
              className="w-full rounded-xl border border-line bg-raised/60 px-3.5 py-2.5 text-sm text-fg outline-none focus:border-accent/70 focus:ring-4 focus:ring-accent/10"
            />
          </Field>
          <Field label="Quality" hint={`${Math.round(num(quality, 0.8) * 100)}%`}>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={quality}
              onChange={(event) => setQuality(event.target.value)}
              className="mt-3 w-full"
            />
          </Field>
          <Field label="Output format">
            <Select value={format} onChange={(event) => setFormat(event.target.value)}>
              <option value="image/jpeg">JPEG — smallest, no transparency</option>
              <option value="image/webp">WebP — modern, efficient</option>
              <option value="image/png">PNG — lossless, keeps transparency</option>
            </Select>
          </Field>
        </Grid>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={compress} disabled={!source || busy}>
            {busy ? 'Working…' : 'Compress image'}
          </Button>
          {output && source && (
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                downloadBlob(
                  `toolatlas-${source.file.name.replace(/\.[^.]+$/, '')}.${output.type === 'image/webp' ? 'webp' : output.type === 'image/png' ? 'png' : 'jpg'}`,
                  output.blob
                )
              }
            >
              Download result
            </Button>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-rose-500">{error}</p>}
      </Panel>

      {source && output && (
        <Panel title="Before and after">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="overflow-hidden rounded-xl border border-line bg-raised/40">
                <img src={source.url} alt="Original" className="h-48 w-full object-contain" />
              </div>
              <div className="mt-2">
                <Result label="Original" value={formatBytes(source.file.size)} hint={`${source.width} × ${source.height} px`} />
              </div>
            </div>
            <div>
              <div className="overflow-hidden rounded-xl border border-line bg-raised/40">
                <img src={output.url} alt="Compressed" className="h-48 w-full object-contain" />
              </div>
              <div className="mt-2">
                <Result
                  label="Compressed"
                  value={formatBytes(output.blob.size)}
                  hint={`${output.width} × ${output.height} px`}
                />
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-xs text-muted">
              <span>Size reduction</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {formatNumber(Math.max(0, saving), 1)}%
              </span>
            </div>
            <ProgressBar value={Math.max(0, saving)} />
          </div>
        </Panel>
      )}
    </div>
  );
}
