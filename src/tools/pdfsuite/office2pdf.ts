// Office to PDF conversion, fully on-device.
//
// DOCX is rendered by docx-preview (Apache-2.0) to real styled HTML: fonts,
// tables, images, lists, headers and footers. XLSX is read with SheetJS CE
// (Apache-2.0) into per-sheet tables that keep sheet structure, merged cells
// and column widths.
//
// Two outputs, and the tool asks which one before converting:
//  - Image PDF: each rendered page is captured as a high-resolution image.
//    The browser's own text engine shapes complex scripts (Devanagari,
//    Gurmukhi) correctly, so the pages look exactly as rendered, but the
//    text inside the PDF is not selectable.
//  - Print view: the styled document opens in a print window so the
//    browser's "Save as PDF" keeps text selectable. Page breaks may shift,
//    because only Word/LibreOffice reproduce Word's own pagination.
// Page breaks stored in the .docx are honoured in both outputs.

import DOMPurify from 'dompurify';

export interface RenderedDoc {
  /** One element per page (docx-preview section), or the body as a single page. */
  pages: HTMLElement[];
  /** The rendered markup, for the print view. */
  bodyHtml: string;
  /** The stylesheet markup the renderer produced, for the print view. */
  cssHtml: string;
  /** Remove the offscreen host from the document. */
  dispose: () => void;
}

/** Render a .docx into offscreen styled HTML pages. */
export async function renderDocx(data: Uint8Array): Promise<RenderedDoc> {
  const docx = await import('docx-preview');
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;';
  host.setAttribute('aria-hidden', 'true');
  const styles = document.createElement('div');
  const body = document.createElement('div');
  host.append(styles, body);
  document.body.appendChild(host);
  try {
    await docx.renderAsync(data, body, styles, {
      breakPages: true,
      useBase64URL: true,
      inWrapper: true,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
    });
  } catch (e) {
    host.remove();
    throw e instanceof Error && e.message ? e : Error('This file could not be read as a Word document. Only modern .docx files are supported.');
  }
  const found = Array.from(body.querySelectorAll('section.docx')) as HTMLElement[];
  return {
    pages: found.length ? found : [body],
    bodyHtml: body.innerHTML,
    cssHtml: styles.innerHTML,
    dispose: () => host.remove(),
  };
}

/* ---- XLSX to HTML tables (pure, unit-tested without a DOM) ---- */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function colToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export interface CellRef { r: number; c: number }
export function parseRef(ref: string): CellRef {
  const m = /^([A-Za-z]+)(\d+)$/.exec(ref);
  if (!m) throw Error(`Bad cell reference: ${ref}`);
  return { r: Number(m[2]) - 1, c: colToIndex(m[1]) };
}
export function parseRange(ref: string): { s: CellRef; e: CellRef } {
  const [a, b] = ref.split(':');
  const s = parseRef(a);
  const e = b ? parseRef(b) : { ...s };
  return { s, e };
}

export function indexToCol(i: number): string {
  let n = i + 1;
  let out = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    out = String.fromCharCode(65 + m) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export interface SheetLike {
  '!ref'?: string;
  '!merges'?: { s: CellRef; e: CellRef }[];
  '!cols'?: { wpx?: number; wch?: number }[];
  [cell: string]: unknown;
}
export interface CellLike { v?: unknown; w?: string }

export interface SheetTable { name: string; html: string }

/**
 * One worksheet to one HTML table. Sheet structure, merged cells and column
 * widths survive; formatted values (dates, currencies) use the workbook's
 * stored display text. Charts and images are not part of the output.
 */
export function sheetToTable(ws: SheetLike): string {
  const ref = ws['!ref'];
  if (!ref) return '<p class="sheet-empty">This sheet is empty.</p>';
  const { s, e } = parseRange(ref);
  const covered = new Set<string>();
  const anchor = new Map<string, { rowspan: number; colspan: number }>();
  for (const m of ws['!merges'] ?? []) {
    const rowspan = m.e.r - m.s.r + 1;
    const colspan = m.e.c - m.s.c + 1;
    anchor.set(`${m.s.r},${m.s.c}`, { rowspan, colspan });
    for (let r = m.s.r; r <= m.e.r; r++) for (let c = m.s.c; c <= m.e.c; c++) if (r !== m.s.r || c !== m.s.c) covered.add(`${r},${c}`);
  }
  const colWidths: string[] = [];
  for (let c = s.c; c <= e.c; c++) {
    const col = (ws['!cols'] ?? [])[c];
    const px = col?.wpx ?? (col?.wch ? Math.round(col.wch * 7.5) : 0);
    colWidths.push(px ? `<col style="width:${px}px">` : '<col>');
  }
  const rows: string[] = [];
  for (let r = s.r; r <= e.r; r++) {
    const cells: string[] = [];
    for (let c = s.c; c <= e.c; c++) {
      if (covered.has(`${r},${c}`)) continue;
      const raw = ws[`${indexToCol(c)}${r + 1}`] as CellLike | undefined;
      const text = raw?.w ?? (raw?.v == null ? '' : String(raw.v));
      const mrg = anchor.get(`${r},${c}`);
      const span = mrg ? `${mrg.rowspan > 1 ? ` rowspan="${mrg.rowspan}"` : ''}${mrg.colspan > 1 ? ` colspan="${mrg.colspan}"` : ''}` : '';
      cells.push(`<td${span}>${esc(text)}</td>`);
    }
    rows.push(`<tr>${cells.join('')}</tr>`);
  }
  return `<table class="sheet"><colgroup>${colWidths.join('')}</colgroup>${rows.join('')}</table>`;
}

export function workbookToTables(names: string[], sheets: Record<string, SheetLike>): SheetTable[] {
  return names.map((name) => ({ name, html: sheetToTable(sheets[name] ?? {}) }));
}

/** Styles used by both the raster route and the print view for spreadsheets. */
export const SHEET_CSS = `
section.sheetpage{font-family:Calibri,Arial,sans-serif;background:#fff;color:#111;padding:24px;box-sizing:border-box;}
section.sheetpage h2{font-size:14px;margin:0 0 8px;font-weight:600;}
table.sheet{border-collapse:collapse;table-layout:fixed;}
table.sheet td{border:1px solid #bbb;padding:2px 6px;font-size:11px;vertical-align:top;overflow:hidden;white-space:pre-wrap;}
p.sheet-empty{color:#666;font-size:12px;}
`.trim();

/** Wrap spreadsheet tables in page sections for rendering or printing. */
export function tablesToSections(tables: SheetTable[], host: HTMLElement): HTMLElement[] {
  // Cell text and sheet names are already escaped; sanitise again in depth.
  host.innerHTML = DOMPurify.sanitize(
    tables.map((t) => `<section class="sheetpage"><h2>${esc(t.name)}</h2>${t.html}</section>`).join(''),
  );
  const style = document.createElement('style');
  style.textContent = SHEET_CSS;
  host.appendChild(style);
  return Array.from(host.querySelectorAll('section.sheetpage')) as HTMLElement[];
}

/* ---- Shared outputs ---- */

/** Rasterise one rendered page element through an SVG foreignObject, so the
 * browser's own layout engine does the wrapping and script shaping — the
 * pixels match what the page shows. Everything is inlined (base64 assets),
 * so the canvas stays clean. */
async function rasterise(el: HTMLElement, cssHtml: string, scale: number): Promise<HTMLCanvasElement> {
  const w = Math.max(1, el.offsetWidth);
  const h = Math.max(1, el.offsetHeight);
  // foreignObject content must be well-formed XML: build it as DOM and let
  // XMLSerializer close void elements and escape text, which outerHTML does not.
  const container = document.createElement('div');
  if (cssHtml) {
    const t = document.createElement('template');
    t.innerHTML = cssHtml;
    container.appendChild(t.content.cloneNode(true));
  }
  const content = el.classList.contains('docx')
    ? Object.assign(document.createElement('div'), { className: 'docx-wrapper' })
    : container;
  if (content !== container) content.style.cssText = 'background:#fff;padding:0';
  if (content !== container) container.appendChild(content);
  content.appendChild(el.cloneNode(true));
  const xhtml = new XMLSerializer().serializeToString(container);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<foreignObject width="100%" height="100%">${xhtml}</foreignObject></svg>`;
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(Error('The page could not be rendered. Try the selectable-text option instead.'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('Canvas is unavailable in this browser.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0);
  return canvas;
}

/** Capture rendered page elements into a PDF of page images at high DPI. */
export async function sectionsToPdf(sections: HTMLElement[], cssHtml: string, scale = 2): Promise<Uint8Array> {
  if (!sections.length) throw Error('Nothing to convert: the document rendered no pages.');
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  for (const el of sections) {
    const canvas = await rasterise(el, cssHtml, scale);
    const png = await doc.embedPng(canvas.toDataURL('image/png'));
    const w = Math.max(72, (el.offsetWidth * 72) / 96);
    const h = Math.max(72, (el.offsetHeight * 72) / 96);
    doc.addPage([w, h]).drawImage(png, { x: 0, y: 0, width: w, height: h });
  }
  return doc.save();
}

/** Print-view styles: strip the on-screen wrapper chrome and give every page room. */
export const PRINT_CSS =
  'body{margin:0;background:#fff}' +
  '.docx-wrapper{background:#fff!important;padding:0!important;display:block!important}' +
  '.docx-wrapper>section.docx{margin:0 auto 24px!important;box-shadow:none!important;overflow:visible!important}' +
  'section.sheetpage{box-sizing:border-box;max-width:100%}' +
  'table.sheet{max-width:100%}' +
  '@media print{' +
  // Full-page-height sections would spill a blank page after every real page.
  '.docx-wrapper>section.docx{margin:0 auto!important;height:auto!important;min-height:0!important;page-break-after:always}' +
  '.docx-wrapper>section.docx:last-child{page-break-after:auto}' +
  'section.sheetpage{page-break-after:always}' +
  'section.sheetpage:last-child{page-break-after:auto}}' +
  '@page{margin:12mm}';

/** Open the styled document in a print window; the browser's Save as PDF keeps text selectable. */
export function openPrintView(title: string, cssHtml: string, bodyHtml: string): void {
  const w = window.open('', '_blank');
  if (!w) throw Error('The browser blocked the print window. Allow pop-ups for this site and try again.');
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>${cssHtml}` +
      `<style>${PRINT_CSS}</style></head><body>` +
      bodyHtml +
      '<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},250);});<\/script></body></html>',
  );
  w.document.close();
}
