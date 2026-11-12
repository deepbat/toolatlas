import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button, Note } from '../../components/ui';
import { CHAIN, sendHandoff, takeHandoff } from '../../lib/handoff';
import { TOOL_MAP } from '../../lib/catalog';
import { cn } from '../../lib/utils';

export function Failure({ error }: { error: string }) {
  if (!error) return null;
  return (
    <div role="alert" className="border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-fg">
      {error}
    </div>
  );
}

export function Busy({ label, value, max }: { label: string; value?: number; max?: number }) {
  return (
    <div role="status" aria-live="polite" className="border border-line bg-raised/40 px-4 py-3 text-sm text-muted">
      {label}
      {value !== undefined && max ? ` (${value} of ${max})` : ''}
      <div className="mt-2 h-1.5 w-full bg-line">
        <div className="h-full bg-accent transition-all" style={{ width: max ? `${Math.min(100, ((value ?? 0) / max) * 100)}%` : '35%' }} />
      </div>
    </div>
  );
}

/** Takes a file handed over from another tool when this page opens. */
export function useHandoff(toolId: string, accept: 'pdf' | 'image', onFiles: (files: File[], from: string) => void) {
  const cb = useRef(onFiles);
  cb.current = onFiles;
  const [from, setFrom] = useState('');
  useEffect(() => {
    const h = takeHandoff(toolId);
    if (h && h.files.length) {
      setFrom(h.from);
      cb.current(h.files, h.from);
    }
  }, [toolId, accept]);
  return from;
}

/** "Send to" strip shown under a result. Files stay in memory and go straight to the next tool. */
export function SendTo({ from, kind, files }: { from: string; kind: 'pdf' | 'image'; files: () => Promise<File[]> | File[] }) {
  const nav = useNavigate();
  const [err, setErr] = useState('');
  const targets = CHAIN[kind].filter((t) => t.id !== from && TOOL_MAP[t.id]);
  return (
    <div className="border border-line bg-raised/30 p-3" aria-label="Send result to another tool">
      <p className="label text-muted">Use this result in another tool</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {targets.map((t) => (
          <Button
            key={t.id}
            size="sm"
            variant="secondary"
            onClick={async () => {
              try {
                const f = await files();
                if (!f.length) throw Error('Nothing to send yet.');
                sendHandoff(from, t.id, f);
                nav('/tools/' + t.id + '/');
              } catch (e) {
                setErr(e instanceof Error ? e.message : 'Could not send the file.');
              }
            }}
          >
            {t.label} <ArrowRight className="h-3 w-3" />
          </Button>
        ))}
      </div>
      <Failure error={err} />
    </div>
  );
}

export function Disclaimer({ children, fy }: { children?: ReactNode; fy?: string }) {
  return (
    <Note tone="warning">
      <span className="font-semibold text-fg">Estimate only.</span> {fy ? `Rules shown are for ${fy}. ` : ''}
      {children} This is not tax, legal or payroll advice. Check figures with a qualified professional or the official source before you file or pay.
    </Note>
  );
}

export function Kv({ rows, strong }: { rows: [string, ReactNode][]; strong?: number }) {
  return (
    <dl className="divide-y divide-line border border-line">
      {rows.map(([k, v], i) => (
        <div key={k + i} className={cn('flex items-baseline justify-between gap-4 px-4 py-2.5 text-sm', strong === i && 'bg-accent/10')}>
          <dt className="text-muted">{k}</dt>
          <dd className={cn('text-right font-mono tabular-nums text-fg', strong === i && 'text-base font-semibold text-accent')}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DataTable({ head, rows, caption }: { head: string[]; rows: ReactNode[][]; caption?: string }) {
  return (
    <div className="overflow-x-auto border border-line" tabIndex={0} role="region" aria-label={caption ?? 'Table'}>
      <table className="w-full min-w-[480px] border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="bg-raised/60 text-left">
            {head.map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-mono text-[10px] uppercase tracking-label text-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {r.map((c, j) => (
                <td key={j} className={cn('px-3 py-2', j > 0 && 'text-right font-mono tabular-nums')}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function useBlobUrl(blob: Blob | null) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!blob) return setUrl('');
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

export async function loadBitmap(file: File, maxPixels = 60e6): Promise<HTMLImageElement> {
  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|avif|gif|bmp|heic)$/i.test(file.name)) throw Error(`"${file.name}" is not an image file.`);
  if (file.size > 40 * 1024 * 1024) throw Error(`"${file.name}" is over 40 MB. Choose a smaller image.`);
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw Error(`"${file.name}" could not be opened. This browser may not support the format (HEIC is not supported in most browsers). Try JPG, PNG or WebP.`);
  }
  if (img.naturalWidth * img.naturalHeight > maxPixels) {
    URL.revokeObjectURL(url);
    throw Error(`"${file.name}" is ${(img.naturalWidth * img.naturalHeight / 1e6).toFixed(0)} megapixels. Use an image under ${maxPixels / 1e6} megapixels to protect memory.`);
  }
  return img;
}
