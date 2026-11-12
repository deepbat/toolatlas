import { useState } from 'react';
import { Button, CopyButton, Field, Input, Panel, Toggle } from '../../components/ui';
import { downloadText } from '../../lib/utils';

function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export default function UuidGenerator() {
  const [count, setCount] = useState('6');
  const [uppercase, setUppercase] = useState(false);
  const [hyphens, setHyphens] = useState(true);
  const [values, setValues] = useState<string[]>(() => Array.from({ length: 6 }, uuid));

  const generate = () => {
    const total = Math.min(100, Math.max(1, Number(count) || 1));
    setValues(Array.from({ length: total }, uuid));
  };

  const formatted = values.map((value) => {
    let next = hyphens ? value : value.replace(/-/g, '');
    if (uppercase) next = next.toUpperCase();
    return next;
  });

  return (
    <div className="space-y-4">
      <Panel title="Generate identifiers">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="How many?" className="w-32">
            <Input
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(event) => setCount(event.target.value)}
            />
          </Field>
          <Button type="button" onClick={generate} className="mb-0.5">
            Generate
          </Button>
          <CopyButton value={formatted.join('\n')} label="Copy all" className="mb-0.5" />
          <Button
            type="button"
            variant="secondary"
            className="mb-0.5"
            onClick={() => downloadText('toolatlas-uuids.txt', formatted.join('\n'))}
          >
            Download
          </Button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Toggle checked={uppercase} onChange={setUppercase} label="Uppercase" />
          <Toggle checked={hyphens} onChange={setHyphens} label="Include hyphens" />
        </div>
      </Panel>

      <Panel title="Your UUIDs" description="RFC 4122 version 4, generated from cryptographic randomness.">
        {formatted.length === 0 ? (
          <p className="text-sm text-muted">Generate a batch to get started.</p>
        ) : (
          <ul className="space-y-1.5">
            {formatted.map((value, index) => (
              <li
                key={`${value}-${index}`}
                className="flex items-center gap-2 rounded-lg border border-line bg-raised/40 px-3 py-2"
              >
                <span className="w-6 shrink-0 text-center font-mono text-[10px] text-muted">{index + 1}</span>
                <code className="min-w-0 flex-1 break-all font-mono text-xs text-fg">{value}</code>
                <CopyButton value={value} size="sm" label="Copy" />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
