import { useEffect, useState } from 'react';
import { Button, Dropzone, Field, Grid, Input, Panel, Select } from '../../components/ui';
import { downloadBlob, formatBytes } from '../../lib/utils';
import { canvasToBlob } from '../shared';

type Result = { blob: Blob; url: string; width: number; height: number };

export default function ImageContactSheet() {
  const [files, setFiles] = useState<File[]>([]);
  const [columns, setColumns] = useState('3');
  const [tileWidth, setTileWidth] = useState('320');
  const [format, setFormat] = useState('image/jpeg');
  const [background, setBackground] = useState('#ffffff');
  const [labels, setLabels] = useState(true);
  const [quality, setQuality] = useState('90');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [output, setOutput] = useState<Result | null>(null);

  useEffect(() => () => { if (output) URL.revokeObjectURL(output.url); }, [output]);

  function selectFiles(selected: File[]) {
    setError('');
    setOutput(null);
    if (!selected.length) return;
    if (selected.length > 20) { setError('Choose up to 20 images.'); return; }
    if (selected.some((file) => !file.type.startsWith('image/'))) { setError('Choose image files only.'); return; }
    if (selected.some((file) => file.size > 20 * 1024 * 1024)) { setError('Each image must be under 20 MB.'); return; }
    if (selected.reduce((sum, file) => sum + file.size, 0) > 100 * 1024 * 1024) { setError('Combined file size must be under 100 MB.'); return; }
    setFiles(selected);
  }

  async function generate() {
    if (!files.length) return;
    setBusy(true);
    setError('');
    setOutput(null);
    const bitmaps: ImageBitmap[] = [];
    try {
      const cols = Number(columns);
      const width = Number(tileWidth);
      const q = Number(quality) / 100;
      if (!Number.isInteger(cols) || cols < 1 || cols > 5) throw Error('Columns must be between 1 and 5.');
      if (!Number.isInteger(width) || width < 160 || width > 1000) throw Error('Tile width must be between 160 and 1000 pixels.');
      if (!(q >= 0.1 && q <= 1)) throw Error('Quality must be between 10 and 100.');
      let pixels = 0;
      for (const file of files) {
        const bitmap = await createImageBitmap(file);
        pixels += bitmap.width * bitmap.height;
        if (pixels > 80_000_000) { bitmap.close(); throw Error('Combined image dimensions are too large for safe processing. Choose fewer or smaller images.'); }
        bitmaps.push(bitmap);
      }
      const rows = Math.ceil(files.length / cols);
      const gap = 16;
      const margin = 16;
      const tileHeight = Math.round(width * 0.72);
      const labelHeight = labels ? 30 : 0;
      const canvas = document.createElement('canvas');
      canvas.width = margin * 2 + cols * width + (cols - 1) * gap;
      canvas.height = margin * 2 + rows * (tileHeight + labelHeight) + (rows - 1) * gap;
      if (canvas.width > 8000 || canvas.height > 8000 || canvas.width * canvas.height > 40_000_000) throw Error('Contact sheet exceeds 40 megapixels. Reduce tile width or number of columns.');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw Error('Canvas is not available in this browser.');
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingQuality = 'high';
      bitmaps.forEach((bitmap, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const x = margin + col * (width + gap);
        const y = margin + row * (tileHeight + labelHeight);
        const inset = 8;
        const availableWidth = width - inset * 2;
        const availableHeight = tileHeight - inset * 2;
        const scale = Math.min(availableWidth / bitmap.width, availableHeight / bitmap.height);
        const drawWidth = Math.round(bitmap.width * scale);
        const drawHeight = Math.round(bitmap.height * scale);
        ctx.drawImage(bitmap, x + (width - drawWidth) / 2, y + (tileHeight - drawHeight) / 2, drawWidth, drawHeight);
        if (labels) {
          const name = files[index].name.length > 42 ? files[index].name.slice(0, 39) + '…' : files[index].name;
          ctx.fillStyle = '#333333';
          ctx.font = '14px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(name, x + width / 2, y + tileHeight + labelHeight / 2, width - 8);
        }
      });
      const blob = await canvasToBlob(canvas, format, q);
      if (!blob || blob.type !== format) throw Error('This browser could not create the selected format.');
      setOutput({ blob, url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create contact sheet.');
    } finally {
      bitmaps.forEach((bitmap) => bitmap.close());
      setBusy(false);
    }
  }

  return <div className="space-y-4">
    <Panel title="Choose images" description="Select up to 20 local images. Files are not uploaded.">
      <Dropzone accept="image/*" multiple onFiles={selectFiles} title="Drop images or browse" hint="JPG, PNG, WebP and browser-supported image formats." />
      {files.length > 0 && <div className="mt-4 space-y-2">
        <p className="text-sm text-fg">{files.length} images · {formatBytes(files.reduce((sum, file) => sum + file.size, 0))} total</p>
        <ul className="max-h-40 space-y-1 overflow-auto text-xs text-muted">{files.map((file, index) => <li key={index} className="truncate">{index + 1}. {file.name}</li>)}</ul>
      </div>}
    </Panel>
    <Panel title="Contact sheet settings">
      <Grid>
        <Field label="Columns"><Select aria-label="Columns" value={columns} onChange={(event) => setColumns(event.target.value)}>{['1','2','3','4','5'].map((value) => <option key={value}>{value}</option>)}</Select></Field>
        <Field label="Tile width (px)"><Input aria-label="Tile width" type="number" min="160" max="1000" value={tileWidth} onChange={(event) => setTileWidth(event.target.value)} /></Field>
        <Field label="Background colour"><Input aria-label="Background colour" type="color" value={background} onChange={(event) => setBackground(event.target.value)} /></Field>
        <Field label="Output format"><Select aria-label="Output format" value={format} onChange={(event) => setFormat(event.target.value)}><option value="image/jpeg">JPEG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></Select></Field>
        {format !== 'image/png' && <Field label="Quality (10-100)"><Input aria-label="Quality" type="number" min="10" max="100" value={quality} onChange={(event) => setQuality(event.target.value)} /></Field>}
      </Grid>
      <label className="mt-4 flex items-center gap-2 text-sm text-fg"><input type="checkbox" checked={labels} onChange={(event) => setLabels(event.target.checked)} /> Add file names below images</label>
      <Button className="mt-4" onClick={generate} disabled={!files.length || busy}>{busy ? 'Creating sheet…' : 'Create contact sheet'}</Button>
      {error && <p role="alert" className="mt-4 text-danger">{error}</p>}
    </Panel>
    {output && <Panel title="Contact sheet ready">
      <img src={output.url} alt="Generated contact sheet preview" className="max-h-[560px] max-w-full border border-line object-contain" />
      <p role="status" className="my-3 text-sm text-muted">{output.width} × {output.height} px · {formatBytes(output.blob.size)}</p>
      <Button onClick={() => downloadBlob('toolatlas-contact-sheet.' + (format === 'image/jpeg' ? 'jpg' : format === 'image/png' ? 'png' : 'webp'), output.blob)}>Download contact sheet</Button>
    </Panel>}
    <Panel title="How it works"><p className="text-sm leading-relaxed text-muted">Images are fitted inside equal-size tiles without cropping. You can choose column count, tile width, background colour, output format and file-name labels. Large image sets can use substantial memory on phones, so the tool limits input size and total decoded pixels.</p></Panel>
  </div>;
}
