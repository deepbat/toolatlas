import { useEffect, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { Button, Dropzone, Field, FileRow, Grid, Panel, Result, Select } from '../../components/ui';
import { downloadBlob, formatBytes } from '../../lib/utils';
import { canvasToBlob, num, readAsArrayBuffer } from '../shared';

interface Item {
  id: string;
  file: File;
  url: string;
}

const SIZES: Record<string, [number, number] | null> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
  auto: null,
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not read that image.'));
    image.src = src;
  });
}

async function toPngBytes(file: File): Promise<ArrayBuffer> {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is not available in this browser.');
    context.drawImage(image, 0, 0);
    const blob = await canvasToBlob(canvas, 'image/png');
    if (!blob) throw new Error('Could not convert that image.');
    return blob.arrayBuffer();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function ImageToPdf() {
  const [items, setItems] = useState<Item[]>([]);
  const [pageSize, setPageSize] = useState('a4');
  const [margin, setMargin] = useState('24');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ size: number; pages: number } | null>(null);

  useEffect(() => {
    return () => items.forEach((item) => URL.revokeObjectURL(item.url));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = (files: File[]) => {
    const images = files.filter((file) => file.type.startsWith('image/'));
    if (images.length !== files.length) setError('Only image files can be added to the PDF.');
    const next = images.map((file) => ({
      id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
      file,
      url: URL.createObjectURL(file),
    }));
    setItems((current) => [...current, ...next]);
    setDone(null);
  };

  const remove = (id: string) => {
    setItems((current) => {
      const target = current.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return current.filter((item) => item.id !== id);
    });
  };

  const move = (index: number, direction: -1 | 1) => {
    setItems((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const build = async () => {
    if (items.length === 0) return;
    setBusy(true);
    setError('');
    setDone(null);
    try {
      const pdf = await PDFDocument.create();
      const pad = Math.max(0, num(margin, 24));

      for (const item of items) {
        let embedded;
        if (item.file.type === 'image/png') {
          embedded = await pdf.embedPng(await item.file.arrayBuffer());
        } else if (item.file.type === 'image/jpeg') {
          embedded = await pdf.embedJpg(await item.file.arrayBuffer());
        } else {
          embedded = await pdf.embedPng(await toPngBytes(item.file));
        }

        const fixed = SIZES[pageSize];
        const width = fixed ? fixed[0] : embedded.width + pad * 2;
        const height = fixed ? fixed[1] : embedded.height + pad * 2;
        const page = pdf.addPage([width, height]);
        const scale = Math.min((width - pad * 2) / embedded.width, (height - pad * 2) / embedded.height);
        page.drawImage(embedded, {
          x: (width - embedded.width * scale) / 2,
          y: (height - embedded.height * scale) / 2,
          width: embedded.width * scale,
          height: embedded.height * scale,
        });
      }

      const bytes = await pdf.save();
      const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
      downloadBlob('toolatlas-images.pdf', blob);
      setDone({ size: blob.size, pages: items.length });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong while building the PDF.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="Add images" description="JPG, PNG, WebP and more — converted locally.">
        <Dropzone
          accept="image/*"
          onFiles={addFiles}
          title="Drop images here"
          hint="or click to choose — one image becomes one page"
        />

        {items.length > 0 && (
          <ul className="mt-4 space-y-2">
            {items.map((item, index) => (
              <li key={item.id} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-center font-mono text-[11px] text-muted">{index + 1}</span>
                <img src={item.url} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-line object-cover" />
                <div className="min-w-0 flex-1">
                  <FileRow
                    name={item.file.name}
                    meta={`${formatBytes(item.file.size)} · ${item.file.type || 'image'}`}
                    onRemove={() => remove(item.id)}
                    icon="FileImage"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    className="rounded-md border border-line px-1.5 text-xs text-muted transition hover:text-fg disabled:opacity-30"
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === items.length - 1}
                    className="rounded-md border border-line px-1.5 text-xs text-muted transition hover:text-fg disabled:opacity-30"
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Page setup">
        <Grid>
          <Field label="Page size">
            <Select value={pageSize} onChange={(event) => setPageSize(event.target.value)}>
              <option value="a4">A4 (210 × 297 mm)</option>
              <option value="letter">US Letter</option>
              <option value="auto">Fit to each image</option>
            </Select>
          </Field>
          <Field label="Margin (points)" hint="1 point = 1/72 inch. Use 0 for full bleed.">
            <input
              type="number"
              min={0}
              value={margin}
              onChange={(event) => setMargin(event.target.value)}
              className="w-full rounded-xl border border-line bg-raised/60 px-3.5 py-2.5 text-sm text-fg outline-none focus:border-accent/70 focus:ring-4 focus:ring-accent/10"
            />
          </Field>
        </Grid>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={build} disabled={items.length === 0 || busy}>
            {busy ? 'Building…' : `Create PDF (${items.length} ${items.length === 1 ? 'page' : 'pages'})`}
          </Button>
          {items.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                items.forEach((item) => URL.revokeObjectURL(item.url));
                setItems([]);
                setDone(null);
              }}
            >
              Clear all
            </Button>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-rose-500">{error}</p>}
        {done && (
          <div className="mt-4">
            <Result
              label="PDF ready"
              value={`${done.pages} ${done.pages === 1 ? 'page' : 'pages'} · ${formatBytes(done.size)}`}
              hint="The download should have started automatically."
            />
          </div>
        )}
      </Panel>
    </div>
  );
}
