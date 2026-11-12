import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { Button, Dropzone, Field, Input, Panel, Select } from '../../components/ui';
import { downloadBlob, formatBytes } from '../../lib/utils';

export function pageRange(input: string, total: number): number[] {
  if (!input.trim()) return Array.from({ length: total }, (_, i) => i);
  const pages: number[] = [];
  for (const part of input.split(',')) {
    if (!/^\\s*\\d+(\\s*-\\s*\\d+)?\\s*$/.test(part)) {
      throw Error('Use page ranges like 1-3,5.');
    }
    const [start, endValue] = part.trim().split(/\\s*-\\s*/).map(Number);
    const end = endValue ?? start;
    if (start < 1 || end < start || end > total) {
      throw Error(`Pages must be between 1 and ${total}, in ascending ranges.`);
    }
    for (let page = start; page <= end; page++) pages.push(page - 1);
  }
  return [...new Set(pages)];
}

export function pageOrder(input: string, total: number): number[] {
  if (!input.trim()) return Array.from({ length: total }, (_, i) => i);
  const pages: number[] = [];
  for (const part of input.split(',')) {
    if (!/^\\s*\\d+(\\s*-\\s*\\d+)?\\s*$/.test(part)) {
      throw Error('Use a page order like 3,1,2 or ranges like 1-3,5.');
    }
    const [start, endValue] = part.trim().split(/\\s*-\\s*/).map(Number);
    const end = endValue ?? start;
    if (start < 1 || end < start || end > total) {
      throw Error(`Page numbers must be between 1 and ${total}; ranges must ascend.`);
    }
    for (let page = start; page <= end; page++) pages.push(page - 1);
  }
  if (!pages.length) throw Error('Enter at least one page number.');
  if (pages.length > 500) throw Error('Choose no more than 500 output pages.');
  return pages;
}

export default function PDFTools() {
  const { toolId } = useParams();
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState('');
  const [angle, setAngle] = useState('90');
  const [text, setText] = useState('DRAFT');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [output, setOutput] = useState<Blob | null>(null);

  async function run() {
    if (!file) return;
    setError('');
    setInfo('');
    setOutput(null);
    setBusy(true);
    try {
      if (file.size > 50 * 1024 * 1024) {
        throw Error('Choose a PDF under 50 MB to protect phone memory.');
      }
      const src = await PDFDocument.load(await file.arrayBuffer());
      const count = src.getPageCount();
      let doc = src;

      if (toolId === 'pdf-extract') {
        doc = await PDFDocument.create();
        for (const page of await doc.copyPages(src, pageRange(pages, count))) doc.addPage(page);
      }

      if (toolId === 'pdf-page-organiser') {
        const order = pageOrder(pages, count);
        doc = await PDFDocument.create();
        const copies = await doc.copyPages(src, order);
        copies.forEach((page) => doc.addPage(page));
      }

      if (toolId === 'pdf-rotate') {
        for (const index of pageRange(pages, count)) {
          src.getPage(index).setRotation(degrees((src.getPage(index).getRotation().angle + Number(angle)) % 360));
        }
      }

      if (toolId === 'pdf-watermark') {
        if (!text.trim()) throw Error('Enter watermark text.');
        if (!/^[\\x20-\\x7e]+$/.test(text)) {
          throw Error('This PDF watermark uses a standard Latin font. Use ASCII text.');
        }
        const font = await doc.embedFont(StandardFonts.HelveticaBold);
        for (const page of doc.getPages()) {
          const { width, height } = page.getSize();
          const size = Math.min(64, width / (text.length * 0.7 + 2));
          page.drawText(text, {
            x: width * 0.1, y: height * 0.45, size, font,
            color: rgb(0.45, 0.45, 0.45), opacity: 0.23, rotate: degrees(25),
          });
        }
      }

      if (toolId === 'pdf-page-numbers') {
        const font = await doc.embedFont(StandardFonts.Helvetica);
        doc.getPages().forEach((page, index) => {
          const label = `${index + 1} / ${count}`;
          page.drawText(label, {
            x: Math.max(10, (page.getWidth() - font.widthOfTextAtSize(label, 10)) / 2),
            y: 18, size: 10, font, color: rgb(0.25, 0.25, 0.25),
          });
        });
      }

      if (toolId === 'pdf-metadata') {
        doc.setTitle('');
        doc.setAuthor('');
        doc.setSubject('');
        doc.setKeywords([]);
        doc.setCreator('');
        doc.setProducer('');
        doc.setCreationDate(new Date(0));
        doc.setModificationDate(new Date(0));
      }

      const bytes = await doc.save();
      setOutput(new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }));
      setInfo(`${doc.getPageCount()} pages processed. Original: ${count} pages, ${formatBytes(file.size)}.`);
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : 'Could not read this PDF. Encrypted and damaged PDFs are not supported.');
    } finally {
      setBusy(false);
    }
  }

  const needsPages = ['pdf-extract', 'pdf-rotate', 'pdf-page-organiser'].includes(toolId ?? '');

  return (
    <div className="space-y-4">
      <Panel title="Choose a PDF">
        <Dropzone
          accept="application/pdf,.pdf"
          multiple={false}
          onFiles={(files) => {
            setFile(files[0] ?? null);
            setOutput(null);
            setInfo('');
            setError('');
          }}
          title="Drop a PDF or browse"
          hint="Up to 50 MB. Files are processed locally."
        />
        {file && <p className="mt-4 break-all text-sm">{file.name} · {formatBytes(file.size)}</p>}
      </Panel>

      <Panel title="Document settings">
        {needsPages && (
          <Field
            label={toolId === 'pdf-page-organiser' ? 'Page order' : 'Pages (blank means all)'}
            hint={toolId === 'pdf-page-organiser'
              ? 'Enter pages in output order, for example 3,1,2,2. Repeat a number to duplicate a page. Ranges such as 1-3 are also accepted.'
              : 'Example: 1-3,5. Page numbering starts at 1.'}
          >
            <Input
              aria-label="Pages"
              value={pages}
              onChange={(event) => setPages(event.target.value)}
              placeholder={toolId === 'pdf-page-organiser' ? '3,1,2,2' : '1-3,5'}
            />
          </Field>
        )}
        {toolId === 'pdf-rotate' && (
          <Field label="Rotate clockwise">
            <Select aria-label="Rotate clockwise" value={angle} onChange={(event) => setAngle(event.target.value)}>
              {['90', '180', '270'].map((value) => <option key={value}>{value}</option>)}
            </Select>
          </Field>
        )}
        {toolId === 'pdf-watermark' && (
          <Field label="Watermark text">
            <Input aria-label="Watermark text" value={text} maxLength={100} onChange={(event) => setText(event.target.value)} />
          </Field>
        )}
        <Button className="mt-4" onClick={run} disabled={!file || busy}>
          {busy ? 'Processing...' : 'Process PDF'}
        </Button>
        {error && <p role="alert" className="mt-4 text-danger">{error}</p>}
        {info && <p role="status" className="mt-4 text-sm">{info}</p>}
        {output && (
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={() => downloadBlob(`toolatlas-${toolId}.pdf`, output)}>
              Download PDF ({formatBytes(output.size)})
            </Button>
          </div>
        )}
      </Panel>

      <Panel title="How it works">
        <p className="text-sm leading-relaxed text-muted">
          {toolId === 'pdf-extract'
            ? 'Creates a new PDF from selected pages and ranges. Enter 3,1 to reorder pages. Duplicate page numbers are removed. Blank selects every page.'
            : toolId === 'pdf-page-organiser'
              ? 'Creates a new PDF in the exact order entered. Repeat page numbers to duplicate pages, or omit pages to remove them. Blank keeps all pages in original order.'
              : toolId === 'pdf-rotate'
                ? 'Adds a clockwise rotation to selected pages. Blank rotates every page. Page content remains vector-based.'
                : toolId === 'pdf-watermark'
                  ? 'Adds faint diagonal text to every page. It is a visible label, not copy protection or document encryption. The standard font supports ASCII text.'
                  : toolId === 'pdf-page-numbers'
                    ? 'Adds a centered page count near the bottom of each page. It can overlap an existing footer, so inspect the result before sharing.'
                    : 'Clears standard title, author, subject, keyword, creator and producer fields, and resets the two standard dates. It is not a forensic sanitizer: XMP metadata, attachments, comments, form data and identifying content may remain.'}
          {' '}Encrypted PDFs are rejected. Editing a digitally signed PDF can invalidate its signature. Keep the original and inspect the downloaded PDF before using it.
        </p>
      </Panel>
    </div>
  );
}
