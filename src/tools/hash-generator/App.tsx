import { useEffect, useState } from 'react';
import { Button, CopyButton, Panel, TextArea } from '../../components/ui';
import { toHex } from '../shared';

const ALGORITHMS = [
  { id: 'SHA-1', label: 'SHA-1', note: 'Legacy — do not use for security' },
  { id: 'SHA-256', label: 'SHA-256', note: 'Recommended default' },
  { id: 'SHA-384', label: 'SHA-384', note: 'Truncated SHA-512' },
  { id: 'SHA-512', label: 'SHA-512', note: 'Longest digest' },
];

export default function HashGenerator() {
  const [text, setText] = useState('ToolAtlas');
  const [hashes, setHashes] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!text) {
        setHashes({});
        return;
      }
      const bytes = new TextEncoder().encode(text);
      const entries = await Promise.all(
        ALGORITHMS.map(async (algorithm) => {
          const digest = await crypto.subtle.digest(algorithm.id, bytes);
          return [algorithm.id, toHex(digest)] as const;
        })
      );
      if (!cancelled) setHashes(Object.fromEntries(entries));
    };
    run().catch(() => setHashes({}));
    return () => {
      cancelled = true;
    };
  }, [text]);

  return (
    <div className="space-y-4">
      <Panel
        title="Text to hash"
        actions={
          <Button type="button" variant="ghost" size="sm" onClick={() => setText('')}>
            Clear
          </Button>
        }
      >
        <TextArea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Type anything…"
          className="min-h-32"
          aria-label="Text to hash"
        />
        <p className="mt-2 text-xs text-muted">
          The same input always produces the same digest. A one-character change produces a completely
          different result.
        </p>
      </Panel>

      <div className="space-y-3">
        {ALGORITHMS.map((algorithm) => (
          <Panel key={algorithm.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-fg">{algorithm.label}</p>
                <p className="text-xs text-muted">{algorithm.note}</p>
              </div>
              <CopyButton value={hashes[algorithm.id] ?? ''} size="sm" />
            </div>
            <p className="mt-2 break-all rounded-lg bg-raised/60 px-3 py-2 font-mono text-xs leading-relaxed text-fg">
              {hashes[algorithm.id] ?? '—'}
            </p>
          </Panel>
        ))}
      </div>
    </div>
  );
}
