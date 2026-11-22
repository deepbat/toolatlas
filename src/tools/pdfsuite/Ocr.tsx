import { useEffect, useRef, useState } from 'react';
import { createWorker, OEM, type Worker } from 'tesseract.js';
import { Button, Dropzone, Field, FileRow, Input, Note, Panel, ProgressBar, Select } from '../../components/ui';
import { downloadBlob, formatBytes } from '../../lib/utils';
import { checkPdfFile, friendlyPdfError, openPdfjs, openPdfLib, renderPage } from '../../lib/pdfio';
import { Failure } from '../studio/kit';
import { addTextLayer, parsePageRanges, type OcrPageLayer, type OcrWord } from './ops';

const TESS = `${(import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'}tesseract`;

/** OCR PDF: render pages, read them with the bundled Tesseract engine, stamp an invisible text layer. */
export default function Ocr() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageSpec, setPageSpec] = useState('');
  const [scale, setScale] = useState('2');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const workerRef = useRef<Worker | null>(null);

  // Free the OCR engine when leaving the tool.
  useEffect(
    () => () => {
      void workerRef.current?.terminate();
      workerRef.current = null;
    },
    []
  );

  const load = async (files: File[]) => {
    setError(''); setDone('');
    const f = files[0];
    if (!f) return;
    try {
      const doc = await openPdfLib(f);
      setFile(f);
      setPageCount(doc.getPageCount());
    } catch (e) {
      setFile(null);
      setError(e instanceof Error ? e.message : 'Could not open the PDF.');
    }
  };

  const go = async () => {
    if (!file) return;
    setBusy(true); setError(''); setDone(''); setProgress(0);
    try {
      const buf = await checkPdfFile(file);
      const targets = parsePageRanges(pageSpec, pageCount);
      const { doc } = await openPdfjs(file);
      if (!workerRef.current) {
        setStatus('Preparing the OCR engine…');
        workerRef.current = await createWorker('eng', OEM.LSTM_ONLY, {
          workerPath: `${TESS}/worker.min.js`,
          corePath: TESS,
          langPath: TESS,
        });
      }
      const worker = workerRef.current;
      const layers: OcrPageLayer[] = [];
      let skipped = 0, wordsFound = 0;
      for (let k = 0; k < targets.length; k++) {
        const pageNo = targets[k] + 1;
        // Pages that already carry real text do not need a second, guessed layer.
        const page = await doc.getPage(pageNo);
        const existing = await page.getTextContent();
        const chars = existing.items.reduce((n: number, it: unknown) => n + String((it as { str?: string }).str ?? '').trim().length, 0);
        page.cleanup();
        if (chars > 20) { skipped++; continue; }
        setStatus(`Reading page ${pageNo} of ${pageCount}…`);
        const { canvas } = await renderPage(doc, pageNo, Number(scale));
        const { data } = await worker.recognize(canvas, {}, { blocks: true });
        const words: OcrWord[] = (data.blocks ?? []).flatMap((b) =>
          b.paragraphs.flatMap((p) =>
            p.lines.flatMap((l) =>
              l.words.map((w) => ({ text: w.text, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 }))
            )
          )
        );
        wordsFound += words.length;
        if (words.length) layers.push({ page: pageNo, imgWidth: canvas.width, imgHeight: canvas.height, words });
        setProgress((k + 1) / targets.length);
      }
      if (!layers.length) {
        setError(skipped ? 'Every selected page already has a text layer, so there was nothing to read.' : 'No readable text found. Try the Careful resolution, or a sharper scan.');
        return;
      }
      setStatus('Building the searchable PDF…');
      const out = await addTextLayer(new Uint8Array(buf), layers);
      const blob = new Blob([out as unknown as BlobPart], { type: 'application/pdf' });
      downloadBlob(`${file.name.replace(/\.pdf$/i, '')}-searchable.pdf`, blob);
      setDone(`Saved ${formatBytes(blob.size)} with ${wordsFound} words read across ${layers.length} ${layers.length === 1 ? 'page' : 'pages'}${skipped ? `. Skipped ${skipped} that already had text` : ''}.`);
    } catch (e) {
      setError(friendlyPdfError(e, file.name).message);
      void workerRef.current?.terminate();
      workerRef.current = null;
    } finally {
      setBusy(false); setStatus(''); setProgress(0);
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="1. Choose a scanned PDF" description="The file is opened on this device and is never uploaded.">
        {!file ? (
          <Dropzone accept="application/pdf,.pdf" multiple={false} onFiles={load} title="Drop a PDF or browse" hint="PDF files up to 150 MB" />
        ) : (
          <FileRow name={file.name} meta={`${pageCount} ${pageCount === 1 ? 'page' : 'pages'} · ${formatBytes(file.size)}`} onRemove={() => { setFile(null); setDone(''); }} />
        )}
      </Panel>
      <Panel title="2. Options" description="Pages that already contain selectable text are left untouched.">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pages" hint="Blank means every page."><Input value={pageSpec} onChange={(e) => setPageSpec(e.target.value)} placeholder="1-3,5" /></Field>
          <Field label="Resolution"><Select value={scale} onChange={(e) => setScale(e.target.value)}>
            <option value="1.5">Fast</option>
            <option value="2">Balanced</option>
            <option value="3">Careful (slow)</option>
          </Select></Field>
        </div>
      </Panel>
      <Panel title="3. Make searchable">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={go} disabled={!file || busy}>{busy ? 'Working…' : 'Make searchable'}</Button>
        </div>
        {busy && (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-muted">{status}</p>
            <ProgressBar value={Math.round(progress * 100)} />
          </div>
        )}
        <div className="mt-3"><Failure error={error} /></div>
        {done && <p className="mt-3 text-sm text-muted">{done}</p>}
        <p className="mt-4 text-[11px] text-muted/80">100% local processing. Nothing leaves your device.</p>
      </Panel>
      <Note>
        Reads printed English text; handwriting and Hindi or Punjabi script are not supported yet. The added
        text is an invisible best-effort layer for search and copy, and OCR can misread blur or fancy fonts,
        so check important words against the page.
      </Note>
    </div>
  );
}
