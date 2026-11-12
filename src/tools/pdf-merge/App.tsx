import { useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { Button, Dropzone, FileRow, Panel, Result } from '../../components/ui';
import { downloadBlob, formatBytes } from '../../lib/utils';
import { readAsArrayBuffer } from '../shared';

interface Item {
  id: string;
  file: File;
  pages: number | null;
}

export default function PdfMerge() {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ size: number; pages: number } | null>(null);

  const addFiles = async (files: File[]) => {
    setError('');
    setDone(null);
    const pdfs = files.filter((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
    if (pdfs.length !== files.length) setError('Only PDF files can be merged.');

    const loaded = await Promise.all(
      pdfs.map(async (file) => {
        let pages: number | null = null;
        try {
          const document = await PDFDocument.load(await readAsArrayBuffer(file), { ignoreEncryption: true });
          pages = document.getPageCount();
        } catch {
          pages = null;
        }
        return {
          id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
          file,
          pages,
        } satisfies Item;
      })
    );

    setItems((current) => [...current, ...loaded]);
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

  const merge = async () => {
    if (items.length < 2) {
      setError('Add at least two PDF files to merge.');
      return;
    }
    setBusy(true);
    setError('');
    setDone(null);
    try {
      const merged = await PDFDocument.create();
      for (const item of items) {
        const document = await PDFDocument.load(await readAsArrayBuffer(item.file), { ignoreEncryption: true });
        const pages = await merged.copyPages(document, document.getPageIndices());
        pages.forEach((page) => merged.addPage(page));
      }
      const bytes = await merged.save();
      const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
      downloadBlob('toolatlas-merged.pdf', blob);
      setDone({ size: blob.size, pages: merged.getPageCount() });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `${cause.message} — password-protected or damaged PDFs may need to be unlocked first.`
          : 'The merge failed. Check that the files are valid PDFs.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="Add PDFs" description="Files stay in your browser; nothing is uploaded.">
        <Dropzone
          accept="application/pdf,.pdf"
          onFiles={addFiles}
          title="Drop PDF files here"
          hint="or click to choose — they merge in the order shown"
        />

        {items.length > 0 && (
          <ul className="mt-4 space-y-2">
            {items.map((item, index) => (
              <li key={item.id} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-center font-mono text-[11px] text-muted">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <FileRow
                    name={item.file.name}
                    meta={`${formatBytes(item.file.size)}${item.pages ? ` · ${item.pages} pages` : ''}`}
                    onRemove={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}
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

      <Panel title="Merge">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={merge} disabled={items.length < 2 || busy}>
            {busy ? 'Merging…' : `Merge ${items.length || 0} files`}
          </Button>
          {items.length > 0 && (
            <Button type="button" variant="ghost" onClick={() => setItems([])}>
              Clear list
            </Button>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-rose-500">{error}</p>}
        {done && (
          <div className="mt-4">
            <Result
              label="Merged PDF"
              value={`${done.pages} pages · ${formatBytes(done.size)}`}
              hint="The download should have started automatically."
            />
          </div>
        )}
      </Panel>
    </div>
  );
}
