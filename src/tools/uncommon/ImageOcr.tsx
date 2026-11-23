import { useEffect, useRef, useState } from 'react';
import { createWorker, OEM, type Worker } from 'tesseract.js';
import { Button, CopyButton, Dropzone, Field, Note, Panel, ProgressBar, Select, TextArea } from '../../components/ui';
import { downloadBlob, formatBytes, publishOutput } from '../../lib/utils';

const TESS = `${(import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'}tesseract`;

type Stage = 'idle' | 'loading-engine' | 'loading-language' | 'recognizing';

export default function ImageOcr() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState(0);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const workerRef = useRef<Worker | null>(null);
  const workerLang = useRef('');
  const [lang, setLang] = useState('eng');

  const loadFile = (f: File) => {
    setFile(f);
    setText('');
    setError('');
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(f);
    });
  };

  // Paste a screenshot straight from the clipboard.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'));
      const f = item?.getAsFile();
      if (f) loadFile(f);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  // Free the OCR engine when leaving the tool.
  useEffect(
    () => () => {
      void workerRef.current?.terminate();
      workerRef.current = null;
    },
    []
  );

  const run = async () => {
    if (!file) return;
    setError('');
    setText('');
    try {
      if (workerRef.current && workerLang.current !== lang) {
        await workerRef.current.terminate();
        workerRef.current = null;
      }
      if (!workerRef.current) {
        workerLang.current = lang;
        workerRef.current = await createWorker(lang.split('+'), OEM.LSTM_ONLY, {
          workerPath: `${TESS}/worker.min.js`,
          corePath: TESS,
          langPath: TESS,
          logger: (m: { status: string; progress: number }) => {
            if (m.status === 'recognizing text') {
              setStage('recognizing');
              setProgress(m.progress);
            } else {
              setStage((s) => (s === 'recognizing' ? s : 'loading-engine'));
              setProgress(m.progress ?? 0);
            }
          },
        });
      }
      setStage('recognizing');
      setProgress(0);
      const { data } = await workerRef.current.recognize(file);
      const cleaned = data.text.replace(/[ \t]+\n/g, '\n').trim();
      if (!cleaned) {
        setError('No readable text found. Try a sharper, brighter or higher-resolution picture.');
      }
      setText(cleaned);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The OCR engine could not run in this browser.');
      void workerRef.current?.terminate();
      workerRef.current = null;
    } finally {
      setStage('idle');
      setProgress(0);
    }
  };

  const busy = stage !== 'idle';

  return (
    <div className="space-y-4">
      <Panel title="1. Add a picture">
        <Dropzone
          accept="image/png,image/jpeg,image/webp,image/bmp"
          multiple={false}
          onFiles={(files) => {
            if (files[0]) loadFile(files[0]);
          }}
          title="Drop a photo or screenshot here"
          hint="or click to browse, or paste from the clipboard — the picture never leaves your device"
        />
        {file && (
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <img
              src={previewUrl}
              alt={file.name}
              className="max-h-48 max-w-full border border-line object-contain"
            />
            <div className="min-w-0 text-sm text-muted">
              <p className="truncate font-medium text-fg">{file.name}</p>
              <p>{formatBytes(file.size)}</p>
              <Field label="Language" hint="Pick the script printed in the picture.">
                <Select value={lang} onChange={(e) => setLang(e.target.value)} disabled={busy}>
                  <option value="eng">English</option>
                  <option value="hin+eng">Hindi (Devanagari) and English</option>
                  <option value="pan+eng">Punjabi (Gurmukhi) and English</option>
                </Select>
              </Field>
              <Button type="button" size="sm" className="mt-3" disabled={busy} onClick={() => void run()}>
                {busy ? 'Reading…' : text ? 'Read again' : 'Read text'}
              </Button>
            </div>
          </div>
        )}
      </Panel>

      {busy && (
        <Panel
          title={stage === 'recognizing' ? 'Reading text…' : 'Preparing the OCR engine…'}
          description={
            stage === 'recognizing'
              ? 'Recognizing every word on your device.'
              : 'First run downloads about 4 MB of engine and language data, cached for next time.'
          }
        >
          <ProgressBar value={Math.round(progress * 100)} />
        </Panel>
      )}

      {error && <Note tone="warning">{error}</Note>}

      {text && (
        <Panel
          title="2. Copy the text"
          description="Check the words against the picture before you rely on them — OCR can misread blur or fancy fonts."
          actions={
            <div className="flex gap-2">
              <CopyButton value={text} label="Copy text" size="sm" />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => downloadBlob('ocr-text.txt', new Blob([text], { type: 'text/plain' }))}
              >
                Download .txt
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => publishOutput('ocr-text.txt', new Blob([text], { type: 'text/plain' }))}
              >
                Send output to…
              </Button>
            </div>
          }
        >
          <TextArea readOnly value={text} rows={10} className="w-full font-mono text-sm" aria-label="Recognized text" />
        </Panel>
      )}

      <Note>
        Reads printed English, Hindi (Devanagari) and Punjabi (Gurmukhi) text. Handwriting and other scripts
        are not supported. Hindi and Punjabi need a clear, upright picture and can still misread conjunct
        letters. The recognition model runs fully on your device and no picture is ever uploaded.
      </Note>
    </div>
  );
      }
