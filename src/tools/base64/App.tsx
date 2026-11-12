import { useMemo, useState } from 'react';
import { Button, CopyButton, Panel, Tabs, TextArea, Toggle } from '../../components/ui';
import { formatBytes } from '../../lib/utils';

function encodeBase64(text: string, urlSafe: boolean): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  const base64 = btoa(binary);
  return urlSafe ? base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : base64;
}

function decodeBase64(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export default function Base64Tool() {
  const [mode, setMode] = useState<'encode' | 'decode'>('encode');
  const [input, setInput] = useState('ToolAtlas — One Place. Countless Useful Tools.');
  const [urlSafe, setUrlSafe] = useState(false);
  const [fileName, setFileName] = useState('');

  const { output, error } = useMemo(() => {
    if (!input.trim()) return { output: '', error: '' };
    try {
      return { output: mode === 'encode' ? encodeBase64(input, urlSafe) : decodeBase64(input), error: '' };
    } catch {
      return { output: '', error: 'That does not look like valid Base64 text.' };
    }
  }, [input, mode, urlSafe]);

  return (
    <div className="space-y-4">
      <Panel>
        <Tabs
          value={mode}
          onChange={setMode}
          tabs={[
            { id: 'encode', label: 'Text → Base64' },
            { id: 'decode', label: 'Base64 → Text' },
          ]}
        />

        <div className="mt-4">
          <TextArea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={mode === 'encode' ? 'Type or paste text…' : 'Paste Base64 here…'}
            className="min-h-40"
            aria-label="Input"
            spellCheck={false}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          {mode === 'encode' && (
            <div className="min-w-64">
              <Toggle checked={urlSafe} onChange={setUrlSafe} label="URL-safe alphabet" description="Uses - and _ and drops padding." />
            </div>
          )}

          <label className="ml-auto inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-fg transition hover:border-accent/40">
            <input
              type="file"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const dataUrl = await new Promise<string>((resolve) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(String(reader.result));
                  reader.readAsDataURL(file);
                });
                setMode('decode');
                setFileName(`${file.name} · ${formatBytes(file.size)}`);
                setInput(dataUrl.split(',')[1] ?? '');
                event.target.value = '';
              }}
            />
            Encode a file
          </label>
        </div>
        {fileName && <p className="mt-2 text-xs text-muted">Loaded: {fileName}</p>}
      </Panel>

      <Panel
        title="Result"
        actions={<CopyButton value={output} size="sm" label={mode === 'encode' ? 'Copy Base64' : 'Copy text'} />}
      >
        {error ? (
          <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        ) : (
          <TextArea value={output} readOnly className="min-h-40 bg-raised/40" aria-label="Output" />
        )}
        <p className="mt-2 text-xs text-muted">
          Base64 is an encoding, not encryption — anyone can reverse it. Never use it to protect
          passwords or secrets.
        </p>
      </Panel>
    </div>
  );
}
