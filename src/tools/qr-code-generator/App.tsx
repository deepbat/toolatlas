import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Field, Grid, Input, Panel, Select, Tabs, TextArea } from '../../components/ui';
import { downloadBlob } from '../../lib/utils';

type Kind = 'text' | 'wifi' | 'email';

export default function QrCodeGenerator() {
  const [kind, setKind] = useState<Kind>('text');
  const [text, setText] = useState('https://deepbat.github.io/toolatlas/');
  const [ssid, setSsid] = useState('Home WiFi');
  const [wifiPassword, setWifiPassword] = useState('');
  const [encryption, setEncryption] = useState('WPA');
  const [email, setEmail] = useState('hello@example.com');
  const [subject, setSubject] = useState('Hello from ToolAtlas');
  const [body, setBody] = useState('');
  const [size, setSize] = useState('480');
  const [level, setLevel] = useState('M');
  const [dark, setDark] = useState('#000000');
  const [dataUrl, setDataUrl] = useState('');
  const [error, setError] = useState('');

  const payload = useMemo(() => {
    if (kind === 'text') return text;
    if (kind === 'wifi') {
      return `WIFI:T:${encryption};S:${ssid.replace(/([\\;,:"])/g, '\\$1')};P:${wifiPassword.replace(/([\\;,:"])/g, '\\$1')};;`;
    }
    const params = new URLSearchParams();
    if (subject) params.set('subject', subject);
    if (body) params.set('body', body);
    const query = params.toString();
    return `mailto:${email}${query ? `?${query}` : ''}`;
  }, [body, email, encryption, kind, ssid, subject, text, wifiPassword]);

  useEffect(() => {
    if (!payload) {
      setDataUrl('');
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(payload, {
      width: Number(size),
      margin: 2,
      errorCorrectionLevel: level as 'L' | 'M' | 'Q' | 'H',
      color: { dark, light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) {
          setDataUrl(url);
          setError('');
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not build the QR code.');
      });
    return () => {
      cancelled = true;
    };
  }, [dark, level, payload, size]);

  return (
    <div className="space-y-4">
      <Panel title="What should the code contain?">
        <Tabs
          value={kind}
          onChange={setKind}
          tabs={[
            { id: 'text', label: 'Text or link' },
            { id: 'wifi', label: 'Wi-Fi' },
            { id: 'email', label: 'Email' },
          ]}
          className="mb-4"
        />

        {kind === 'text' && (
          <TextArea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="A link, message, phone number or anything else…"
            className="min-h-24"
            aria-label="QR content"
          />
        )}

        {kind === 'wifi' && (
          <Grid cols={3}>
            <Field label="Network name (SSID)">
              <Input value={ssid} onChange={(event) => setSsid(event.target.value)} />
            </Field>
            <Field label="Password">
              <Input value={wifiPassword} onChange={(event) => setWifiPassword(event.target.value)} />
            </Field>
            <Field label="Security">
              <Select value={encryption} onChange={(event) => setEncryption(event.target.value)}>
                <option value="WPA">WPA / WPA2 / WPA3</option>
                <option value="WEP">WEP</option>
                <option value="nopass">Open network</option>
              </Select>
            </Field>
          </Grid>
        )}

        {kind === 'email' && (
          <Grid>
            <Field label="Email address">
              <Input value={email} onChange={(event) => setEmail(event.target.value)} />
            </Field>
            <Field label="Subject">
              <Input value={subject} onChange={(event) => setSubject(event.target.value)} />
            </Field>
            <Field label="Message" className="sm:col-span-2">
              <TextArea value={body} onChange={(event) => setBody(event.target.value)} className="min-h-20" />
            </Field>
          </Grid>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <Panel title="Appearance">
          <Grid>
            <Field label="Size">
              <Select value={size} onChange={(event) => setSize(event.target.value)}>
                <option value="320">320 px</option>
                <option value="480">480 px</option>
                <option value="720">720 px</option>
                <option value="1024">1024 px</option>
              </Select>
            </Field>
            <Field label="Error correction">
              <Select value={level} onChange={(event) => setLevel(event.target.value)}>
                <option value="L">Low (most capacity)</option>
                <option value="M">Medium</option>
                <option value="Q">Quartile</option>
                <option value="H">High (most robust)</option>
              </Select>
            </Field>
            <Field label="Foreground colour">
              <input
                type="color"
                value={dark}
                onChange={(event) => setDark(event.target.value)}
                className="h-10 w-full cursor-pointer rounded-lg border border-line bg-surface p-1"
                aria-label="QR colour"
              />
            </Field>
          </Grid>
          <p className="mt-3 text-xs text-muted">
            Keep strong contrast between the code and the background. Very light colours may not scan.
          </p>
        </Panel>

        <Panel title="Preview">
          <div className="flex flex-col items-center gap-3">
            <div className="flex min-h-56 w-full items-center justify-center rounded-xl border border-line bg-white p-4">
              {dataUrl ? (
                <img src={dataUrl} alt="QR code preview" className="h-56 w-56" />
              ) : (
                <p className="px-4 text-center text-xs text-slate-500">
                  {error || 'Add some content to generate a QR code.'}
                </p>
              )}
            </div>
            <button
              type="button"
              disabled={!dataUrl}
              onClick={async () => {
                const response = await fetch(dataUrl);
                downloadBlob('toolatlas-qr.png', await response.blob());
              }}
              className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:brightness-110 disabled:opacity-50"
            >
              Download PNG
            </button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
