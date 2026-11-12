import { useMemo, useState } from 'react';
import { CopyButton, Panel, Result, TextArea } from '../../components/ui';

interface ParsedUrl {
  url: URL;
  error: string;
}

function parse(input: string): ParsedUrl {
  const trimmed = input.trim();
  if (!trimmed) return { url: new URL('https://example.com'), error: '' };
  try {
    return { url: new URL(/^[a-z][\w+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`), error: '' };
  } catch {
    return { url: new URL('https://example.com'), error: 'That does not look like a valid URL.' };
  }
}

export default function UrlParser() {
  const [input, setInput] = useState('https://shop.example.com:8443/products/atlas?utm_source=newsletter&page=2&tag=pdf#reviews');

  const { url, error } = useMemo(() => parse(input), [input]);
  const params = useMemo(() => Array.from(url.searchParams.entries()), [url]);
  const rows = [
    { label: 'Protocol', value: url.protocol.replace(':', '') },
    { label: 'Host', value: url.hostname },
    { label: 'Port', value: url.port || '(default)' },
    { label: 'Path', value: url.pathname },
    { label: 'Hash', value: url.hash || '—' },
    { label: 'Origin', value: url.origin },
  ];

  const asJson = JSON.stringify(
    {
      href: url.href,
      protocol: url.protocol,
      host: url.hostname,
      port: url.port,
      pathname: url.pathname,
      hash: url.hash,
      params: Object.fromEntries(params),
    },
    null,
    2
  );

  return (
    <div className="space-y-4">
      <Panel title="URL">
        <TextArea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Paste a URL…"
          className="min-h-24 break-all"
          aria-label="URL"
          spellCheck={false}
        />
        {error && <p className="mt-2 text-sm text-rose-500">{error}</p>}
      </Panel>

      <Panel title="Components">
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((row) => (
            <Result key={row.label} label={row.label} value={<span className="break-all font-mono text-sm">{row.value}</span>} />
          ))}
        </div>
      </Panel>

      <Panel
        title={`Query parameters (${params.length})`}
        actions={<CopyButton value={asJson} label="Copy JSON" size="sm" />}
      >
        {params.length === 0 ? (
          <p className="text-sm text-muted">This URL has no query string.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="bg-raised/60 text-left text-[11px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">Key</th>
                  <th className="px-3 py-2 font-semibold">Value (decoded)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {params.map(([key, value], index) => (
                  <tr key={`${key}-${index}`}>
                    <td className="px-3 py-2 font-mono text-xs text-accent">{key}</td>
                    <td className="break-all px-3 py-2 font-mono text-xs text-fg">{value || '(empty)'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Notes">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>The parser normalises missing schemes to <code className="font-mono">https://</code>.</li>
          <li>Values are shown after percent-decoding, exactly as a server would read them.</li>
          <li>Repeated keys are listed separately, in the order they appear.</li>
          <li>Credentials embedded in a URL are never displayed in full.</li>
        </ul>
      </Panel>
    </div>
  );
}
