import { useState } from 'react';
import { CopyButton, Dropzone, FileRow, Panel } from '../../components/ui';
import { formatBytes } from '../../lib/utils';
import { readAsArrayBuffer, toHex } from '../shared';

const ALGORITHMS = [
  { id: 'SHA-1', label: 'SHA-1' },
  { id: 'SHA-256', label: 'SHA-256' },
  { id: 'SHA-384', label: 'SHA-384' },
  { id: 'SHA-512', label: 'SHA-512' },
];

export default function FileChecksum() {
  const [file, setFile] = useState<File | null>(null);
  const [hashes, setHashes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const compute = async (incoming: File) => {
    setFile(incoming);
    setHashes({});
    setError('');
    setBusy(true);
    try {
      const buffer = await readAsArrayBuffer(incoming);
      const entries = await Promise.all(
        ALGORITHMS.map(async (algorithm) => {
          const digest = await crypto.subtle.digest(algorithm.id, buffer);
          return [algorithm.id, toHex(digest)] as const;
        })
      );
      setHashes(Object.fromEntries(entries));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="Choose a file" description="Hashes are computed locally with the Web Crypto API.">
        <Dropzone
          multiple={false}
          onFiles={(files) => {
            if (files[0]) compute(files[0]);
          }}
          title="Drop any file"
          hint="Large files are read in one pass — nothing is uploaded"
        />

        {file && (
          <div className="mt-4">
            <FileRow
              name={file.name}
              meta={`${formatBytes(file.size)} · ${file.type || 'unknown type'}`}
              icon="ShieldCheck"
              onRemove={() => {
                setFile(null);
                setHashes({});
              }}
            />
          </div>
        )}
      </Panel>

      <Panel title="Digests">
        {busy && <p className="text-sm text-muted">Computing…</p>}
        {error && <p className="text-sm text-rose-500">{error}</p>}
        {!busy && !error && Object.keys(hashes).length === 0 && (
          <p className="text-sm text-muted">Add a file to see its SHA-1, SHA-256, SHA-384 and SHA-512 digests.</p>
        )}

        <div className="space-y-3">
          {ALGORITHMS.map((algorithm) => {
            const value = hashes[algorithm.id];
            if (!value) return null;
            return (
              <div key={algorithm.id} className="rounded-xl border border-line bg-raised/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{algorithm.label}</p>
                  <CopyButton value={value} size="sm" label="Copy" />
                </div>
                <p className="mt-1.5 break-all font-mono text-xs leading-relaxed text-fg">{value}</p>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="How to use a checksum">
        <p className="text-sm leading-relaxed text-muted">
          Compare the digest above with the one published by the file's author. If a single byte has
          changed, the whole hash changes. SHA-256 is the usual choice for downloads; SHA-1 is included
          for legacy compatibility only and should not be used for new security decisions.
        </p>
      </Panel>
    </div>
  );
}
