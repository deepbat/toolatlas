import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Dropzone, Field, FileRow, Grid, Input, Note, Panel, Select, Toggle } from '../../components/ui';
import { downloadBlob, formatBytes } from '../../lib/utils';
import { checkPdfFile, friendlyPdfError, openPdfLib } from '../../lib/pdfio';
import { Failure } from '../studio/kit';
import { booklet, cropPages, deletePages, flattenForms, nUp, parsePageRanges, reorderPages, rotatePages, signPdf, stampText, watermark, type StampPlace } from './ops';
import SignaturePad from '../pdf-editor/SignaturePad';
import Ocr from './Ocr';
import { protectPdf, repairPdf, unlockPdf } from './qpdf';
import { buildDocx, itemsToParagraphs, type Para, type TextItem } from './docx';
import { openPrintView, renderDocx, sectionsToPdf, tablesToSections, workbookToTables, SHEET_CSS } from './office2pdf';
import { pdfjs } from '../pdf-editor/pdfjs';
import { PDFDocument } from 'pdf-lib';
import { applyActualText, pageActualTexts } from './actualtext';

/** Shared shell: pick one PDF, run an operation, download the result. */
function Shell({ verb, help, outSuffix, outExt = 'pdf', mime = 'application/pdf', run, children, ready = true, lenient = false }: {
  verb: string;
  help: ReactNode;
  outSuffix: string;
  outExt?: string;
  mime?: string;
  run: (bytes: Uint8Array, pages: number) => Promise<Uint8Array>;
  children?: ReactNode;
  ready?: boolean;
  /** Skip the pdf-lib readability probe for encrypted or damaged inputs. */
  lenient?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const load = async (files: File[]) => {
    setError(''); setDone('');
    const f = files[0];
    if (!f) return;
    try {
      if (lenient) {
        await checkPdfFile(f);
        setFile(f);
        setPages(0);
        return;
      }
      const doc = await openPdfLib(f);
      setFile(f);
      setPages(doc.getPageCount());
    } catch (e) {
      setFile(null);
      setError(e instanceof Error ? e.message : 'Could not open the PDF.');
    }
  };

  const go = async () => {
    if (!file) return;
    setBusy(true); setError(''); setDone('');
    try {
      const bytes = new Uint8Array(await checkPdfFile(file));
      const out = await run(bytes, pages);
      const blob = new Blob([out as unknown as BlobPart], { type: mime });
      downloadBlob(`${file.name.replace(/\.pdf$/i, '')}-${outSuffix}.${outExt}`, blob);
      setDone(`Saved ${formatBytes(blob.size)}. The download should have started.`);
    } catch (e) {
      setError(friendlyPdfError(e, file.name).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="1. Choose a PDF" description="The file is opened on this device and is never uploaded.">
        {!file ? (
          <Dropzone accept="application/pdf,.pdf" multiple={false} onFiles={load} title="Drop a PDF or browse" hint="PDF files up to 150 MB" />
        ) : (
          <FileRow name={file.name} meta={pages ? `${pages} ${pages === 1 ? 'page' : 'pages'} · ${formatBytes(file.size)}` : formatBytes(file.size)} onRemove={() => { setFile(null); setDone(''); }} />
        )}
      </Panel>
      <Panel title="2. Options" description={help}>{children}</Panel>
      <Panel title={`3. ${verb}`}>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={go} disabled={!file || busy || !ready}>{busy ? 'Working…' : verb}</Button>
        </div>
        <div className="mt-3"><Failure error={error} /></div>
        {done && <p className="mt-3 text-sm text-muted">{done}</p>}
        <p className="mt-4 text-[11px] text-muted/80">100% local processing. Nothing leaves your device.</p>
      </Panel>
    </div>
  );
}

function DeletePages() {
  const [spec, setSpec] = useState('');
  return (
    <Shell verb="Delete pages" outSuffix="trimmed" ready={!!spec.trim()} help="Pages count from 1. Use commas and ranges, for example 2,4-6."
      run={(b) => deletePages(b, spec)}>
      <Field label="Pages to delete"><Input value={spec} onChange={(e) => setSpec(e.target.value)} placeholder="2,4-6" inputMode="text" /></Field>
    </Shell>
  );
}

function Crop() {
  const [m, setM] = useState({ top: '0', right: '0', bottom: '0', left: '0' });
  const [mm, setMm] = useState(true);
  const [pages, setPages] = useState('');
  const k = mm ? 72 / 25.4 : 1;
  const n = (v: string) => Math.max(0, Number(v) || 0) * k;
  const set = (key: keyof typeof m) => (e: React.ChangeEvent<HTMLInputElement>) => setM({ ...m, [key]: e.target.value });
  return (
    <Shell verb="Crop PDF" outSuffix="cropped" help="Trims the edges of every page, or only the pages you list. Content outside the new edge is hidden, not erased."
      run={(b) => cropPages(b, { top: n(m.top), right: n(m.right), bottom: n(m.bottom), left: n(m.left) }, pages)}>
      <Grid cols={2}>
        <Field label="Top"><Input type="number" min={0} value={m.top} onChange={set('top')} /></Field>
        <Field label="Bottom"><Input type="number" min={0} value={m.bottom} onChange={set('bottom')} /></Field>
        <Field label="Left"><Input type="number" min={0} value={m.left} onChange={set('left')} /></Field>
        <Field label="Right"><Input type="number" min={0} value={m.right} onChange={set('right')} /></Field>
      </Grid>
      <div className="mt-3 space-y-3">
        <Toggle checked={mm} onChange={setMm} label={mm ? 'Millimetres' : 'Points'} />
        <Field label="Pages" hint="Blank means every page."><Input value={pages} onChange={(e) => setPages(e.target.value)} placeholder="1-3,5" /></Field>
      </div>
    </Shell>
  );
}

const PLACES: [StampPlace, string][] = [['footer-center', 'Footer, centre'], ['footer-right', 'Footer, right'], ['footer-left', 'Footer, left'], ['header-center', 'Header, centre'], ['header-right', 'Header, right'], ['header-left', 'Header, left']];

function Stamp({ mode }: { mode: 'header-footer' | 'bates' }) {
  const bates = mode === 'bates';
  const [text, setText] = useState(bates ? '{bates}' : 'Page {n} of {total}');
  const [place, setPlace] = useState<StampPlace>(bates ? 'footer-right' : 'footer-center');
  const [size, setSize] = useState('10');
  const [pages, setPages] = useState('');
  const [prefix, setPrefix] = useState('DOC-');
  const [start, setStart] = useState('1');
  const [digits, setDigits] = useState('6');
  return (
    <Shell verb={bates ? 'Add Bates numbers' : 'Add header or footer'} outSuffix={bates ? 'bates' : 'stamped'}
      help={bates ? 'Sequential identifiers for legal and records work, for example DOC-000001.' : 'Use {n} for the page number and {total} for the page count.'}
      run={(b) => stampText(b, { text, place, size: Number(size) || 10, pages, batesPrefix: prefix, batesStart: Number(start) || 1, batesDigits: Number(digits) || 6 })}>
      <Field label="Text"><Input value={text} onChange={(e) => setText(e.target.value)} /></Field>
      <div className="mt-3"><Grid cols={2}>
        <Field label="Position"><Select value={place} onChange={(e) => setPlace(e.target.value as StampPlace)}>{PLACES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        <Field label="Size (pt)"><Input type="number" min={6} max={48} value={size} onChange={(e) => setSize(e.target.value)} /></Field>
        {bates && <Field label="Prefix"><Input value={prefix} onChange={(e) => setPrefix(e.target.value)} /></Field>}
        {bates && <Field label="Start at"><Input type="number" min={0} value={start} onChange={(e) => setStart(e.target.value)} /></Field>}
        {bates && <Field label="Digits"><Input type="number" min={1} max={12} value={digits} onChange={(e) => setDigits(e.target.value)} /></Field>}
        <Field label="Pages" hint="Blank means every page."><Input value={pages} onChange={(e) => setPages(e.target.value)} placeholder="1-3,5" /></Field>
      </Grid></div>
      {bates && <div className="mt-3"><Note>Put {'{bates}'} in the text where the number should appear. Numbers are drawn on top of existing page content and may overlap it.</Note></div>}
    </Shell>
  );
}

function NUp() {
  const [per, setPer] = useState('2');
  const [border, setBorder] = useState(true);
  return (
    <Shell verb="Combine pages" outSuffix={`${per}-up`} help="Places several pages on each A4 sheet, scaled to fit, to save paper."
      run={(b) => nUp(b, Number(per) as 2 | 4 | 6 | 9, { border })}>
      <Field label="Pages per sheet"><Select value={per} onChange={(e) => setPer(e.target.value)}>{['2', '4', '6', '9'].map((v) => <option key={v} value={v}>{v}</option>)}</Select></Field>
      <div className="mt-3"><Toggle checked={border} onChange={setBorder} label="Thin border around each page" /></div>
    </Shell>
  );
}

function Booklet() {
  return (
    <Shell verb="Make booklet" outSuffix="booklet" help="Reorders pages two per landscape sheet for folding. Print double-sided and flip on the short edge, then fold the stack in half."
      run={(b) => booklet(b)}>
      <Note>The page count is padded to a multiple of 4 with blank pages.</Note>
    </Shell>
  );
}

function Rotate() {
  const [angle, setAngle] = useState('90');
  const [pages, setPages] = useState('');
  return (
    <Shell verb="Rotate pages" outSuffix="rotated" help="Rotation adds to any rotation the page already has. The content itself is not re-rendered, so quality stays identical."
      run={(b) => rotatePages(b, Number(angle) as 90 | 180 | 270, pages)}>
      <Grid cols={2}>
        <Field label="Rotation"><Select value={angle} onChange={(e) => setAngle(e.target.value)}>
          <option value="90">90° clockwise</option>
          <option value="180">180° upside down</option>
          <option value="270">90° counter-clockwise</option>
        </Select></Field>
        <Field label="Pages" hint="Blank means every page."><Input value={pages} onChange={(e) => setPages(e.target.value)} placeholder="1-3,5" /></Field>
      </Grid>
    </Shell>
  );
}

const STRENGTHS: [string, string][] = [['0.08', 'Very faint'], ['0.15', 'Faint'], ['0.3', 'Noticeable'], ['0.5', 'Strong']];

function Watermark() {
  const [text, setText] = useState('CONFIDENTIAL');
  const [size, setSize] = useState('48');
  const [strength, setStrength] = useState('0.15');
  const [pages, setPages] = useState('');
  return (
    <Shell verb="Add watermark" outSuffix="watermarked" ready={!!text.trim()} help="Draws faint diagonal text across the centre of each page. Long text is scaled down to fit."
      run={(b) => watermark(b, { text, size: Number(size) || 48, opacity: Number(strength), pages })}>
      <Field label="Watermark text"><Input value={text} onChange={(e) => setText(e.target.value)} placeholder="CONFIDENTIAL" /></Field>
      <div className="mt-3"><Grid cols={2}>
        <Field label="Size (pt)"><Input type="number" min={12} max={120} value={size} onChange={(e) => setSize(e.target.value)} /></Field>
        <Field label="Strength"><Select value={strength} onChange={(e) => setStrength(e.target.value)}>{STRENGTHS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        <Field label="Pages" hint="Blank means every page."><Input value={pages} onChange={(e) => setPages(e.target.value)} placeholder="1-3,5" /></Field>
      </Grid></div>
      <div className="mt-3"><Note>The watermark is a visible label drawn on top of the page. It does not hide or remove the content underneath; use the True PDF Redactor for that.</Note></div>
    </Shell>
  );
}

function Organise() {
  const [order, setOrder] = useState('');
  return (
    <Shell verb="Reorder pages" outSuffix="reordered" ready={!!order.trim()} help="List the pages in their new order. Repeat a number to duplicate that page; pages you leave out are removed."
      run={(b) => reorderPages(b, order)}>
      <Field label="New page order" hint="Page numbers with commas, for example 3,1,2."><Input value={order} onChange={(e) => setOrder(e.target.value)} placeholder="3,1,2" inputMode="text" /></Field>
      <div className="mt-3"><Note>The rebuilt file keeps the page content, title, author and subject. Fillable form fields and bookmarks are not carried over.</Note></div>
    </Shell>
  );
}

const XSPOTS: [SignX, string][] = [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']];
const YSPOTS: [SignY, string][] = [['bottom', 'Bottom'], ['middle', 'Middle'], ['top', 'Top']];
type SignX = 'left' | 'center' | 'right';
type SignY = 'top' | 'middle' | 'bottom';

function Sign() {
  const [sig, setSig] = useState<{ url: string; w: number; h: number } | null>(null);
  const [padOpen, setPadOpen] = useState(false);
  const [pageSpec, setPageSpec] = useState('');
  const [xSpot, setXSpot] = useState<SignX>('right');
  const [ySpot, setYSpot] = useState<SignY>('bottom');
  const [widthPt, setWidthPt] = useState('140');
  const w = Number(widthPt) || 140;
  return (
    <Shell verb="Sign PDF" outSuffix="signed" ready={!!sig} help="Draw, type or upload a signature, pick a page and a corner, and the image is stamped onto that page."
      run={async (b, total) => {
        const page = pageSpec.trim() ? Number(pageSpec) : total;
        const png = Uint8Array.from(atob(sig!.url.split(',')[1]), (c) => c.charCodeAt(0));
        return signPdf(b, { page, png, width: w, height: Math.max(10, (w * sig!.h) / sig!.w), x: xSpot, y: ySpot });
      }}>
      {!sig ? (
        <Button type="button" variant="secondary" onClick={() => setPadOpen(true)}>Create a signature</Button>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <img src={sig.url} alt="Your signature" className="h-16 border border-line bg-white p-1" />
          <Button type="button" variant="ghost" onClick={() => setPadOpen(true)}>Make a new signature</Button>
        </div>
      )}
      <div className="mt-3"><Grid cols={2}>
        <Field label="Page" hint="Blank signs the last page."><Input type="number" min={1} value={pageSpec} onChange={(e) => setPageSpec(e.target.value)} placeholder="Last page" /></Field>
        <Field label="Width (pt)"><Input type="number" min={40} max={300} value={widthPt} onChange={(e) => setWidthPt(e.target.value)} /></Field>
        <Field label="Horizontal"><Select value={xSpot} onChange={(e) => setXSpot(e.target.value as SignX)}>{XSPOTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        <Field label="Vertical"><Select value={ySpot} onChange={(e) => setYSpot(e.target.value as SignY)}>{YSPOTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
      </Grid></div>
      <div className="mt-3"><Note>This places a visible image of your signature on the page. It is not a cryptographic digital signature and does not prove identity in a legal sense.</Note></div>
      {padOpen && <SignaturePad onDone={(url, sw, sh) => { setSig({ url, w: sw, h: sh }); setPadOpen(false); }} onCancel={() => setPadOpen(false)} />}
    </Shell>
  );
}

function ToWord() {
  const [pages, setPages] = useState('');
  return (
    <Shell verb="Convert to Word" outSuffix="word" outExt="docx" mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      help="Turns the text layer into an editable Word document with real paragraphs, headings and bold or italic runs."
      run={async (b) => {
        const doc = await pdfjs().getDocument({ data: new Uint8Array(b), isEvalSupported: false }).promise;
        const paras: Para[] = [];
        let unreadable = 0;
        let lib: PDFDocument | null = null;
        try { lib = await PDFDocument.load(b, { ignoreEncryption: true, updateMetadata: false }); } catch { lib = null; }
        for (const i of parsePageRanges(pages, doc.numPages)) {
          const page = await doc.getPage(i + 1);
          const tc = await page.getTextContent();
          const items: TextItem[] = [];
          const strItems = tc.items.filter((x: any) => 'str' in x) as any[];
          // Use /ActualText where the PDF carries it: pdf.js ignores it, and Indic conjuncts and reordered matras depend on it.
          let fixed: string[] | null = null;
          try { if (lib) fixed = await applyActualText(pdfjs(), page, strItems.map((x) => x.str), pageActualTexts(lib, i)); } catch { fixed = null; }
          let si = 0;
          for (const it of tc.items) {
            if (!('str' in it)) continue;
            const str: string = fixed ? fixed[si] : it.str; si++;
            // pdf.js yields NUL for glyphs it cannot map back to text (seen with Devanagari and Gurmukhi conjuncts).
            unreadable += (str.match(/\u0000/g) ?? []).length;
            let bold = false, italic = false;
            try {
              const fname = String(page.commonObjs.get(it.fontName)?.name ?? '').toLowerCase();
              bold = /bold|black|semibold|demi/.test(fname);
              italic = /italic|oblique/.test(fname);
            } catch { /* font style unknown */ }
            items.push({ text: str, size: Math.hypot(it.transform[2], it.transform[3]) || it.height || 12, bold, italic, y: it.transform[5], x: it.transform[4], w: typeof it.width === 'number' ? it.width : undefined });
          }
          paras.push(...itemsToParagraphs(items));
          page.cleanup();
        }
        if (unreadable) throw new Error(`${unreadable} characters in this PDF could not be read back as text (common with Indic scripts such as Devanagari and Gurmukhi). A Word file would be missing text, so none was written. Use PDF to Image or keep the PDF.`);
        if (!paras.length) throw new Error('This PDF has no text layer, so it is probably a scan. Run it through OCR PDF first, then convert the result.');
        return buildDocx(paras);
      }}>
      <Field label="Pages" hint="Blank means every page."><Input value={pages} onChange={(e) => setPages(e.target.value)} placeholder="1-3,5" /></Field>
      <div className="mt-3"><Note>Fidelity is honest: text becomes editable paragraphs and headings, but images, tables, multi-column layouts and exact fonts are not preserved. Complex layouts read better in the original PDF.</Note></div>
    </Shell>
  );
}

function Protect() {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const mismatch = pw.length > 0 && pw2.length > 0 && pw !== pw2;
  return (
    <Shell verb="Protect PDF" outSuffix="protected" ready={pw.length > 0 && pw === pw2} lenient
      help="Encrypts every page with 256-bit AES. Without the password the file cannot be opened."
      run={(b) => protectPdf(b, pw)}>
      <Grid cols={2}>
        <Field label="Password"><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" autoComplete="new-password" /></Field>
        <Field label="Repeat password"><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Repeat password" autoComplete="new-password" /></Field>
      </Grid>
      {mismatch && <p className="mt-2 text-sm text-danger">The passwords do not match.</p>}
      <div className="mt-3"><Note>The password is used only on this device and is never stored or uploaded. If you lose it, the file cannot be recovered here.</Note></div>
    </Shell>
  );
}

function Unlock() {
  const [pw, setPw] = useState('');
  return (
    <Shell verb="Unlock PDF" outSuffix="unlocked" lenient
      help="Removes password protection from a file you are allowed to open, so it no longer asks for a password."
      run={(b) => unlockPdf(b, pw)}>
      <Field label="Password" hint="The password the file asks for. Leave blank only if it opens without one."><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password (if any)" /></Field>
      <div className="mt-3"><Note>The password is used only on this device and is never stored or uploaded.</Note></div>
    </Shell>
  );
}

function Repair() {
  return (
    <Shell verb="Repair PDF" outSuffix="repaired" lenient
      help="Rebuilds the internal structure of a file that viewers call damaged or refuse to open."
      run={(b) => repairPdf(b)}>
      <Note>Repair fixes broken file structure. Content that was never saved correctly, or pages missing from the original, cannot be brought back.</Note>
    </Shell>
  );
}

function Flatten() {
  return (
    <Shell verb="Flatten forms" outSuffix="flattened" help="Turns fillable fields into plain page content so they can no longer be edited."
      run={(b) => flattenForms(b)}>
      <Note>Annotations other than form fields are kept as they are.</Note>
    </Shell>
  );
}

/** Word/Excel to PDF: pick a .docx/.xlsx, choose image PDF or selectable-text print view, convert. */
function OfficeToPdf({ kind }: { kind: 'word' | 'excel' }) {
  const word = kind === 'word';
  const accept = word
    ? '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    : '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'image' | 'print'>('image');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const go = async () => {
    if (!file) return;
    setBusy(true); setError(''); setDone('');
    const base = file.name.replace(/\.[^.]+$/, '');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let pages: HTMLElement[] = [];
      let cssHtml = '';
      let bodyHtml = '';
      let dispose = () => {};
      if (word) {
        const rendered = await renderDocx(bytes);
        pages = rendered.pages; cssHtml = rendered.cssHtml; bodyHtml = rendered.bodyHtml; dispose = rendered.dispose;
      } else {
        const XLSX = await import('xlsx');
        const wb = XLSX.read(bytes, { type: 'array' });
        const tables = workbookToTables(wb.SheetNames, wb.Sheets as never);
        if (!tables.length) throw Error('This workbook has no sheets.');
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;left:-100000px;top:0;';
        host.setAttribute('aria-hidden', 'true');
        document.body.appendChild(host);
        pages = tablesToSections(tables, host);
        cssHtml = `<style>${SHEET_CSS}</style>`;
        bodyHtml = host.innerHTML;
        dispose = () => host.remove();
      }
      try {
        if (mode === 'image') {
          const out = await sectionsToPdf(pages, cssHtml);
          const blob = new Blob([out as unknown as BlobPart], { type: 'application/pdf' });
          downloadBlob(`${base}-deepakstool.pdf`, blob);
          setDone(`Saved ${formatBytes(blob.size)}. The download should have started.`);
        } else {
          openPrintView(file.name, cssHtml, bodyHtml);
          setDone('The print view opened in a new tab. Choose "Save as PDF" in the browser dialog.');
        }
      } finally {
        dispose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The conversion failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Panel title={word ? '1. Choose a Word document' : '1. Choose an Excel workbook'} description="The file is opened on this device and is never uploaded.">
        {!file ? (
          <Dropzone accept={accept} multiple={false} onFiles={(f) => { setError(''); setDone(''); setFile(f[0] ?? null); }} title={word ? 'Drop a .docx or browse' : 'Drop an .xlsx or browse'} hint="Files up to 100 MB" />
        ) : (
          <FileRow name={file.name} meta={formatBytes(file.size)} onRemove={() => { setFile(null); setDone(''); }} />
        )}
      </Panel>
      <Panel title="2. Choose the kind of PDF" description="This choice changes whether the text in the PDF can be selected.">
        <div className="space-y-2 text-sm">
          <label className="flex items-start gap-2">
            <input type="radio" name="office2pdf-mode" className="mt-1" checked={mode === 'image'} onChange={() => setMode('image')} />
            <span><strong>Image PDF (recommended).</strong> Each page is drawn as an image from this app's own rendering, with Indic scripts shown when the fonts are available. Text in the PDF is not selectable.</span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" name="office2pdf-mode" className="mt-1" checked={mode === 'print'} onChange={() => setMode('print')} />
            <span><strong>Selectable text.</strong> Opens a print view; pick "Save as PDF" in the print dialog. Page breaks may shift compared with Word.</span>
          </label>
        </div>
        <div className="mt-3">
          <Note>
            {word
              ? 'This app renders the document itself, so layout can differ from Word: fonts may be substituted and some features, such as text boxes or charts, may be missing. Page breaks stored in the file are honoured.'
              : 'Every sheet becomes its own section with merged cells and column widths preserved. Charts and embedded images are not included.'}
          </Note>
        </div>
      </Panel>
      <Panel title="3. Convert">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={go} disabled={!file || busy}>{busy ? 'Working…' : word ? 'Convert to PDF' : 'Convert to PDF'}</Button>
        </div>
        <div className="mt-3"><Failure error={error} /></div>
        {done && <p className="mt-3 text-sm text-muted">{done}</p>}
        <p className="mt-4 text-[11px] text-muted/80">100% local processing. Nothing leaves your device.</p>
      </Panel>
    </div>
  );
}

const PARTS: Record<string, () => JSX.Element> = {
  'word-to-pdf': () => <OfficeToPdf kind="word" />,
  'excel-to-pdf': () => <OfficeToPdf kind="excel" />,
  'pdf-delete-pages': DeletePages,
  'pdf-crop': Crop,
  'pdf-header-footer': () => <Stamp mode="header-footer" />,
  'pdf-bates': () => <Stamp mode="bates" />,
  'pdf-rotate': Rotate,
  'pdf-watermark': Watermark,
  'pdf-page-organiser': Organise,
  'pdf-sign': Sign,
  'pdf-ocr': Ocr,
  'pdf-protect': Protect,
  'pdf-unlock': Unlock,
  'pdf-repair': Repair,
  'pdf-to-word': ToWord,
  'pdf-nup': NUp,
  'pdf-booklet': Booklet,
  'pdf-flatten': Flatten,
};

export default function PdfSuite() {
  const { toolId } = useParams();
  const Part = PARTS[toolId ?? ''];
  return Part ? <Part /> : null;
      }
