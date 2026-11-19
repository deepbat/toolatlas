import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Button, Field, Grid, Input, Note, Panel, Select, Toggle } from '../../components/ui';
import { downloadBlob } from '../../lib/utils';


type AuthType = 'WPA' | 'WEP' | 'nopass';


function escapeWifi(val: string): string {
  return val.replace(/([\\;,:"])/g, '\\$1');
}


export default function WifiPoster() {
  const [title, setTitle] = useState('Guest Wi-Fi');
  const [ssid, setSsid] = useState('Office_Guest_5G');
  const [password, setPassword] = useState('Welcome@2026');
  const [auth, setAuth] = useState<AuthType>('WPA');
  const [hidden, setHidden] = useState(false);
  const [showPassword, setShowPassword] = useState(true);
  const [note, setNote] = useState('Point your phone camera at the QR code to connect automatically.');
  const [qrDataUrl, setQrDataUrl] = useState('');


  const payload = `WIFI:T:${auth};S:${escapeWifi(ssid)};P:${auth === 'nopass' ? '' : escapeWifi(password)};H:${hidden ? 'true' : 'false'};;`;


  useEffect(() => {
    let cancelled = false;
    if (!ssid.trim()) {
      setQrDataUrl('');
      return;
    }
    QRCode.toDataURL(payload, {
      width: 480,
      margin: 2,
      color: { dark: '#141619', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [payload, ssid]);


  const exportA5Pdf = async () => {
    if (!qrDataUrl) return;
    const pdf = await PDFDocument.create();
    // A5 portrait: 148 × 210 mm = 419.5 × 595.3 pt
    const W = 419.53;
    const H = 595.28;
    const page = pdf.addPage([W, H]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);


    // Subtle border frame
    page.drawRectangle({
      x: 24,
      y: 24,
      width: W - 48,
      height: H - 48,
      borderColor: rgb(0.12, 0.14, 0.16),
      borderWidth: 1.5,
    });


    const centerText = (text: string, y: number, size: number, useBold = false, color = rgb(0.08, 0.09, 0.1)) => {
      const f = useBold ? bold : font;
      const safe = text.replace(/[^\x20-\x7E]/g, '');
      const width = f.widthOfTextAtSize(safe, size);
      page.drawText(safe, { x: (W - width) / 2, y, size, font: f, color });
    };


    centerText((title || 'Guest Wi-Fi').toUpperCase(), H - 72, 22, true);
    centerText('SCAN TO CONNECT', H - 96, 10, true, rgb(0.42, 0.44, 0.48));


    const png = await pdf.embedPng(qrDataUrl);
    const qrSize = 230;
    page.drawImage(png, {
      x: (W - qrSize) / 2,
      y: H - 125 - qrSize,
      width: qrSize,
      height: qrSize,
    });


    centerText(`Network: ${ssid}`, 185, 13, true);
    if (showPassword && auth !== 'nopass') {
      centerText(`Password: ${password}`, 160, 13, false);
    } else if (auth === 'nopass') {
      centerText('Open network (no password)', 160, 12, false, rgb(0.4, 0.4, 0.4));
    }


    if (note.trim()) {
      centerText(note.slice(0, 72), 90, 9.5, false, rgb(0.4, 0.42, 0.46));
    }


    const bytes = await pdf.save();
    downloadBlob('guest-wifi-card-a5.pdf', new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  };


  return (
    <div className="space-y-4">
      <Note tone="info">
        Your Wi-Fi credentials never leave this browser. Works natively with iPhone and Android cameras.
      </Note>


      <Panel title="Network details">
        <Grid cols={2}>
          <Field label="Card heading">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} />
          </Field>
          <Field label="Wi-Fi name (SSID)">
            <Input value={ssid} onChange={(e) => setSsid(e.target.value)} maxLength={64} />
          </Field>
          <Field label="Security">
            <Select value={auth} onChange={(e) => setAuth(e.target.value as AuthType)}>
              <option value="WPA">WPA / WPA2 / WPA3</option>
              <option value="WEP">WEP</option>
              <option value="nopass">None (Open network)</option>
            </Select>
          </Field>
          {auth !== 'nopass' && (
            <Field label="Password">
              <Input value={password} onChange={(e) => setPassword(e.target.value)} maxLength={64} />
            </Field>
          )}
        </Grid>


        <div className="mt-4">
          <Field label="Footer note">
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={90} />
          </Field>
        </div>


        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Toggle checked={showPassword} onChange={setShowPassword} label="Print password text below QR" />
          <Toggle checked={hidden} onChange={setHidden} label="Hidden network (SSID not broadcast)" />
        </div>


        <div className="mt-5">
          <Button type="button" onClick={() => void exportA5Pdf()} disabled={!qrDataUrl}>
            Download Printable A5 PDF
          </Button>
        </div>
      </Panel>


      {qrDataUrl && (
        <Panel title="Tabletop card preview">
          <div className="mx-auto max-w-sm border-2 border-fg bg-white p-8 text-center text-[#141619]">
            <p className="font-display text-2xl font-bold uppercase tracking-tight">{title || 'Guest Wi-Fi'}</p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
              Scan to connect
            </p>
            <img src={qrDataUrl} alt="Wi-Fi QR code" className="mx-auto my-5 h-56 w-56" />
            <p className="font-mono text-sm font-semibold">Network: {ssid}</p>
            {showPassword && auth !== 'nopass' && (
              <p className="mt-1 font-mono text-sm text-neutral-700">Password: {password}</p>
            )}
            {note && <p className="mt-5 text-xs text-neutral-500">{note}</p>}
          </div>
        </Panel>
      )}
    </div>
  );
}
