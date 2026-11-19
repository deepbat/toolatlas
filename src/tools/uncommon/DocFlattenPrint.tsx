import { useEffect, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { Button, Dropzone, Field, Note, Panel, Toggle } from '../../components/ui';
import { downloadBlob } from '../../lib/utils';


interface ProcessedScan {
  id: string;
  name: string;
  previewUrl: string;
  canvas: HTMLCanvasElement;
}


function cleanDocumentCanvas(
  img: HTMLImageElement,
  contrast: number,
  whitenBg: boolean,
  grayscale: boolean
): HTMLCanvasElement {
  const maxDim = 1800;
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);


  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);


  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;


  // Estimate paper white point from upper-quartile luminance
  let lumSum = 0;
  let lumCount = 0;
  for (let i = 0; i < data.length; i += 16) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum > 150) {
      lumSum += lum;
      lumCount += 1;
    }
  }
  const paperWhite = lumCount > 0 ? Math.max(170, lumSum / lumCount) : 220;
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));


  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];


    if (whitenBg) {
      r = Math.min(255, (r / paperWhite) * 255);
      g = Math.min(255, (g / paperWhite) * 255);
      b = Math.min(255, (b / paperWhite) * 255);
    }


    r = Math.max(0, Math.min(255, factor * (r - 128) + 128));
    g = Math.max(0, Math.min(255, factor * (g - 128) + 128));
    b = Math.max(0, Math.min(255, factor * (b - 128) + 128));


    if (grayscale) {
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      r = g = b = y > 225 ? 255 : y;
    }


    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }


  ctx.putImageData(imageData, 0, 0);
  return canvas;
}


export default function DocFlattenPrint() {
  const [files, setFiles] = useState<File[]>([]);
  const [scans, setScans] = useState<ProcessedScan[]>([]);
  const [contrast, setContrast] = useState(32);
  const [whitenBg, setWhitenBg] = useState(true);
  const [grayscale, setGrayscale] = useState(false);
  const [twoUp, setTwoUp] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const urlsRef = useRef<string[]>([]);


  useEffect(() => {
    let cancelled = false;
    const processAll = async () => {
      urlsRef.current.forEach(URL.revokeObjectURL);
      urlsRef.current = [];
      if (!files.length) {
        setScans([]);
        return;
      }
      setBusy(true);
      setError('');
      try {
        const next: ProcessedScan[] = [];
        for (const file of files.slice(0, 6)) {
          const url = URL.createObjectURL(file);
          const img = new Image();
          img.src = url;
          await img.decode();
          URL.revokeObjectURL(url);
          const canvas = cleanDocumentCanvas(img, contrast, whitenBg, grayscale);
          const previewUrl = canvas.toDataURL('image/jpeg', 0.88);
          next.push({ id: `${file.name}-${file.size}`, name: file.name, previewUrl, canvas });
        }
        if (!cancelled) setScans(next);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not process image.');
      } finally {
        if (!cancelled) setBusy(false);
      }
    };
    void processAll();
    return () => {
      cancelled = true;
    };
  }, [files, contrast, whitenBg, grayscale]);


  const exportA4Pdf = async () => {
    if (!scans.length) return;
    setBusy(true);
    setError('');
    try {
      const pdf = await PDFDocument.create();
      const A4_W = 595.28;
      const A4_H = 841.89;
      const margin = 36;
      const perPage = twoUp ? 2 : 1;


      for (let i = 0; i < scans.length; i += perPage) {
        const page = pdf.addPage([A4_W, A4_H]);
        const group = scans.slice(i, i + perPage);
        const slotH = (A4_H - margin * (perPage + 1)) / perPage;
        const slotW = A4_W - margin * 2;


        for (let idx = 0; idx < group.length; idx++) {
          const scan = group[idx];
          const jpgBytes = await new Promise<ArrayBuffer>((resolve, reject) =>
            scan.canvas.toBlob(
              (b) => (b ? b.arrayBuffer().then(resolve) : reject(new Error('Encode failed'))),
              'image/jpeg',
              0.9
            )
          );
          const embedded = await pdf.embedJpg(jpgBytes);
          const ratio = Math.min(slotW / embedded.width, slotH / embedded.height);
          const drawW = embedded.width * ratio;
          const drawH = embedded.height * ratio;
          const x = (A4_W - drawW) / 2;
          const yTop = A4_H - margin - idx * (slotH + margin);
          const y = yTop - slotH + (slotH - drawH) / 2;
          page.drawImage(embedded, { x, y, width: drawW, height: drawH });
        }
      }


      const bytes = await pdf.save();
      downloadBlob('toolatlas-print-ready-a4.pdf', new Blob([bytes as BlobPart], { type: 'application/pdf' }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build A4 PDF.');
    } finally {
      setBusy(false);
    }
  };


  return (
    <div className="space-y-4">
      <Note tone="info">
        Turn shadowy phone photos of IDs, bills or forms into clean xerox-style A4 sheets. Everything runs locally in your browser.
      </Note>


      <Panel title="1. Add phone photos (up to 6)">
        <Dropzone
          accept="image/jpeg,image/png,image/webp"
          multiple
          onFiles={(incoming) => setFiles(incoming.slice(0, 6))}
          title="Drop front & back ID photos or receipts"
          hint="JPG, PNG or WebP · processed locally"
        />


        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label={`Text contrast (${contrast})`}>
            <input
              type="range"
              min={0}
              max={90}
              value={contrast}
              onChange={(e) => setContrast(Number(e.target.value))}
              className="w-full"
            />
          </Field>
          <div className="space-y-2">
            <Toggle checked={whitenBg} onChange={setWhitenBg} label="Whiten grey paper shadows" />
            <Toggle checked={grayscale} onChange={setGrayscale} label="Crisp black & white (xerox mode)" />
            <Toggle checked={twoUp} onChange={setTwoUp} label="Place 2 photos per A4 page (front + back)" />
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
      </Panel>


      {scans.length > 0 && (
        <Panel
          title={`2. Cleaned preview (${scans.length})`}
          actions={
            <Button type="button" onClick={() => void exportA4Pdf()} disabled={busy}>
              {busy ? 'Preparing PDF…' : 'Download A4 PDF'}
            </Button>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {scans.map((scan) => (
              <figure key={scan.id} className="border border-line bg-white p-2">
                <img
                  src={scan.previewUrl}
                  alt={`Cleaned preview of ${scan.name}`}
                  className="max-h-72 w-full object-contain"
                />
                <figcaption className="mt-2 truncate font-mono text-[11px] text-muted">
                  {scan.name}
                </figcaption>
              </figure>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
