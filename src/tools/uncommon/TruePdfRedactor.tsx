import { useEffect, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { Button, Dropzone, Note, Panel } from '../../components/ui';
import { openPdfjs, renderPage } from '../../lib/pdfio';
import { downloadBlob } from '../../lib/utils';


interface RedactBox {
  id: string;
  page: number; // 1-based
  x: number; // normalized 0..1
  y: number;
  w: number;
  h: number;
}


export default function TruePdfRedactor() {
  const [file, setFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [rawBuf, setRawBuf] = useState<ArrayBuffer | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [boxes, setBoxes] = useState<RedactBox[]>([]);
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');


  const canvasRef = useRef<HTMLCanvasElement>(null);


  const loadPdf = async (incoming: File) => {
    setError('');
    setBusy(true);
    try {
      const { doc, buf } = await openPdfjs(incoming);
      setFile(incoming);
      setPdfDoc(doc);
      setRawBuf(buf);
      setPageCount(doc.numPages);
      setPageNum(1);
      setBoxes([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open PDF.');
    } finally {
      setBusy(false);
    }
  };


  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;
    const draw = async () => {
      try {
        const rendered = await renderPage(pdfDoc, pageNum, 1.5);
        if (cancelled || !canvasRef.current) return;
        const c = canvasRef.current;
        c.width = rendered.canvas.width;
        c.height = rendered.canvas.height;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(rendered.canvas, 0, 0);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not render page.');
      }
    };
    void draw();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageNum]);


  const relPos = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };


  const exportRedacted = async () => {
    if (!pdfDoc || !rawBuf || !file) return;
    setBusy(true);
    setError('');
    try {
      const src = await PDFDocument.load(rawBuf, { ignoreEncryption: false });
      const out = await PDFDocument.create();
      const redactedPages = new Set(boxes.map((b) => b.page));


      for (let p = 1; p <= pageCount; p++) {
        if (!redactedPages.has(p)) {
          const [copied] = await out.copyPages(src, [p - 1]);
          out.addPage(copied);
          continue;
        }
        // Rasterize redacted pages at 2x so the original text layer is destroyed permanently
        const rendered = await renderPage(pdfDoc, p, 2);
        const ctx = rendered.canvas.getContext('2d')!;
        ctx.fillStyle = '#000000';
        for (const box of boxes.filter((b) => b.page === p)) {
          ctx.fillRect(
            box.x * rendered.canvas.width,
            box.y * rendered.canvas.height,
            box.w * rendered.canvas.width,
            box.h * rendered.canvas.height
          );
        }
        const pngBytes = await new Promise<ArrayBuffer>((resolve, reject) =>
          rendered.canvas.toBlob(
            (b) => (b ? b.arrayBuffer().then(resolve) : reject(new Error('Failed to encode page'))),
            'image/png'
          )
        );
        const embedded = await out.embedPng(pngBytes);
        const newPage = out.addPage([rendered.widthPt, rendered.heightPt]);
        newPage.drawImage(embedded, {
          x: 0,
          y: 0,
          width: rendered.widthPt,
          height: rendered.heightPt,
        });
      }


      const bytes = await out.save();
      const outName = file.name.replace(/\.pdf$/i, '') + '-redacted.pdf';
      downloadBlob(outName, new Blob([bytes as BlobPart], { type: 'application/pdf' }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not export redacted PDF.');
    } finally {
      setBusy(false);
    }
  };


  const pageBoxes = boxes.filter((b) => b.page === pageNum);


  return (
    <div className="space-y-4">
      <Note tone="info">
        Unlike simple black-box overlays, this tool flattens and rasterizes every redacted page so hidden text cannot be selected, copied or extracted underneath. Untouched pages stay vector.
      </Note>


      <Panel title="1. Choose PDF">
        <Dropzone
          accept="application/pdf,.pdf"
          multiple={false}
          onFiles={(list) => {
            if (list[0]) void loadPdf(list[0]);
          }}
          title="Drop a PDF to redact locally"
          hint="No uploads · password-protected PDFs must be unlocked first"
        />
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
      </Panel>


      {pdfDoc && (
        <Panel
          title={`2. Draw black-out boxes (Page ${pageNum} of ${pageCount})`}
          description="Click and drag over any sensitive number, name or address."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={pageNum <= 1}
                onClick={() => setPageNum((p) => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={pageNum >= pageCount}
                onClick={() => setPageNum((p) => Math.min(pageCount, p + 1))}
              >
                Next
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!pageBoxes.length}
                onClick={() => setBoxes((prev) => prev.filter((b) => b.page !== pageNum))}
              >
                Clear page
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy || boxes.length === 0}
                onClick={() => void exportRedacted()}
              >
                {busy ? 'Flattening…' : `Export Redacted PDF (${boxes.length})`}
              </Button>
            </div>
          }
        >
          <div
            className="relative mx-auto w-fit max-w-full cursor-crosshair select-none touch-none border border-line bg-white"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              const pt = relPos(e);
              setDraft({ x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y });
            }}
            onPointerMove={(e) => {
              if (!draft) return;
              const pt = relPos(e);
              setDraft((d) => (d ? { ...d, x1: pt.x, y1: pt.y } : null));
            }}
            onPointerUp={() => {
              if (!draft) return;
              const x = Math.min(draft.x0, draft.x1);
              const y = Math.min(draft.y0, draft.y1);
              const w = Math.abs(draft.x1 - draft.x0);
              const h = Math.abs(draft.y1 - draft.y0);
              if (w > 0.008 && h > 0.008) {
                setBoxes((prev) => [
                  ...prev,
                  { id: `${Date.now()}-${Math.random()}`, page: pageNum, x, y, w, h },
                ]);
              }
              setDraft(null);
            }}
          >
            <canvas ref={canvasRef} className="block max-h-[75vh] max-w-full h-auto" />
            {pageBoxes.map((b) => (
              <div
                key={b.id}
                style={{
                  left: `${b.x * 100}%`,
                  top: `${b.y * 100}%`,
                  width: `${b.w * 100}%`,
                  height: `${b.h * 100}%`,
                }}
                className="absolute bg-black"
                title="Double-click to remove"
                onDoubleClick={() => setBoxes((prev) => prev.filter((item) => item.id !== b.id))}
              />
            ))}
            {draft && (
              <div
                style={{
                  left: `${Math.min(draft.x0, draft.x1) * 100}%`,
                  top: `${Math.min(draft.y0, draft.y1) * 100}%`,
                  width: `${Math.abs(draft.x1 - draft.x0) * 100}%`,
                  height: `${Math.abs(draft.y1 - draft.y0) * 100}%`,
                }}
                className="pointer-events-none absolute border-2 border-accent bg-black/75"
              />
            )}
          </div>
          <p className="mt-2 text-xs text-muted">
            Double-click any black box to remove it. Always open the downloaded PDF and try selecting the redacted region to verify.
          </p>
        </Panel>
      )}
    </div>
  );
}
