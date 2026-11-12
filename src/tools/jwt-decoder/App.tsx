import { useMemo, useState } from 'react';
import { CopyButton, Note, Panel, TextArea } from '../../components/ui';
import { formatDate } from '../../lib/utils';

function decodePart(part: string): unknown {
  const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

const CLAIM_LABELS: Record<string, string> = {
  iss: 'Issuer',
  sub: 'Subject',
  aud: 'Audience',
  exp: 'Expires',
  nbf: 'Not before',
  iat: 'Issued at',
  jti: 'JWT ID',
};

export default function JwtDecoder() {
  const [token, setToken] = useState('');

  const decoded = useMemo(() => {
    const trimmed = token.trim();
    if (!trimmed) return { header: null, payload: null, error: '' };
    const parts = trimmed.split('.');
    if (parts.length < 2) return { header: null, payload: null, error: 'A JWT needs at least two dot-separated segments.' };

    try {
      const header = decodePart(parts[0]) as Record<string, unknown>;
      const payload = decodePart(parts[1]) as Record<string, unknown>;
      return { header, payload, error: '' };
    } catch {
      return { header: null, payload: null, error: 'Could not decode the token — check that it is a complete JWT.' };
    }
  }, [token]);

  const claims = decoded.payload ?? {};
  const exp = typeof claims.exp === 'number' ? claims.exp * 1000 : null;
  const iat = typeof claims.iat === 'number' ? claims.iat * 1000 : null;
  const nbf = typeof claims.nbf === 'number' ? claims.nbf * 1000 : null;
  const expired = exp !== null && exp < Date.now();
  const remaining = exp !== null ? Math.round((exp - Date.now()) / 60000) : null;

  return (
    <div className="space-y-4">
      <Panel title="JWT" description="Paste a bearer token to inspect its claims. It never leaves this page.">
        <TextArea
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.signature"
          className="min-h-32 break-all"
          aria-label="JWT token"
          spellCheck={false}
        />
        {decoded.error && <p className="mt-2 text-sm text-rose-500">{decoded.error}</p>}
      </Panel>

      {decoded.header && decoded.payload && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Panel className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Algorithm</p>
              <p className="mt-1 font-mono text-lg text-fg">{String(decoded.header.alg ?? '—')}</p>
            </Panel>
            <Panel className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Expiry</p>
              <p className={`mt-1 text-sm font-semibold ${expired ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {exp ? (expired ? 'Expired' : `${remaining} min left`) : 'No exp claim'}
              </p>
              {exp && <p className="text-xs text-muted">{formatDate(new Date(exp), { dateStyle: 'medium', timeStyle: 'short' })}</p>}
            </Panel>
            <Panel className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Signature</p>
              <p className="mt-1 text-sm text-fg">Not verified</p>
              <p className="text-xs text-muted">Decoding only</p>
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title="Header"
              actions={<CopyButton value={JSON.stringify(decoded.header, null, 2)} size="sm" />}
            >
              <pre className="max-h-64 overflow-auto rounded-xl bg-[#0f1117] p-3 font-mono text-[12px] leading-relaxed text-slate-300">
                {JSON.stringify(decoded.header, null, 2)}
              </pre>
            </Panel>
            <Panel
              title="Payload"
              actions={<CopyButton value={JSON.stringify(decoded.payload, null, 2)} size="sm" />}
            >
              <pre className="max-h-64 overflow-auto rounded-xl bg-[#0f1117] p-3 font-mono text-[12px] leading-relaxed text-slate-300">
                {JSON.stringify(decoded.payload, null, 2)}
              </pre>
            </Panel>
          </div>

          <Panel title="Claims">
            <div className="divide-y divide-line overflow-hidden rounded-xl border border-line text-sm">
              {Object.keys(CLAIM_LABELS)
                .filter((key) => key in claims)
                .map((key) => {
                  const value = claims[key];
                  const isDate = ['exp', 'iat', 'nbf'].includes(key) && typeof value === 'number';
                  return (
                    <div key={key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <span className="text-muted">
                        {CLAIM_LABELS[key]} <span className="font-mono text-[11px]">({key})</span>
                      </span>
                      <span className="max-w-[60%] truncate font-mono text-xs text-fg">
                        {isDate
                          ? formatDate(new Date((value as number) * 1000), { dateStyle: 'medium', timeStyle: 'short' })
                          : typeof value === 'object'
                            ? JSON.stringify(value)
                            : String(value)}
                      </span>
                    </div>
                  );
                })}
              {iat && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-muted">
                  <span>Token age</span>
                  <span>{Math.max(0, Math.round((Date.now() - iat) / 60000))} min</span>
                </div>
              )}
            </div>
          </Panel>

          <Note tone="warning">
            Decoding does not verify the signature. A token can be edited and still look valid here —
            always verify it on your server before trusting it.
          </Note>
        </>
      )}
    </div>
  );
}
