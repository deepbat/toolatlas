// PDF text-layer to DOCX conversion, built on the in-house ZIP writer: no new
// dependency. The output is honest about fidelity: real editable paragraphs,
// headings and bold/italic runs, but no images, tables, columns or exact fonts.

import { makeZip } from '../../lib/zip';

export interface TextItem { text: string; size: number; bold: boolean; italic: boolean; y: number; x: number }
export interface ParaRun { text: string; bold: boolean; italic: boolean }
export interface Para { runs: ParaRun[]; level: 0 | 1 | 2 | 3 } // 0 = body, 1-3 = heading

/** Group raw pdf.js text items (one page, reading order) into paragraphs. */
export function itemsToParagraphs(items: TextItem[]): Para[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  if (!sorted.length) return [];
  const sizes = sorted.map((i) => i.size).sort((a, b) => a - b);
  const body = sizes[Math.floor(sizes.length / 2)] || 12;
  const lines: TextItem[][] = [];
  for (const item of sorted) {
    if (!item.text.trim()) continue;
    const last = lines[lines.length - 1];
    if (last && Math.abs(last[0].y - item.y) < Math.max(2, item.size * 0.35)) last.push(item);
    else lines.push([item]);
  }
  const paras: Para[] = [];
  for (const line of lines) {
    const size = line[0].size;
    const level = size >= body * 1.8 ? 1 : size >= body * 1.4 ? 2 : size >= body * 1.18 ? 3 : 0;
    const runs: ParaRun[] = line.map((i) => ({ text: i.text, bold: i.bold || level > 0, italic: i.italic }));
    // Merge runs with identical styling and join fragments with spaces where needed.
    const merged: ParaRun[] = [];
    for (const r of runs) {
      const prev = merged[merged.length - 1];
      const needsSpace = prev && !prev.text.endsWith(' ') && !r.text.startsWith(' ') && !/^[,.;:!?%\)\]]/.test(r.text) && !/[\(\[]$/.test(prev.text);
      if (prev && prev.bold === r.bold && prev.italic === r.italic) prev.text += (needsSpace ? ' ' : '') + r.text;
      else merged.push({ ...r });
    }
    // A new paragraph starts when the line is a heading or follows a large vertical gap;
    // otherwise continuation lines join the previous paragraph with a space.
    const gap = paras.length ? Math.abs(line[0].y - (lines[lines.indexOf(line) - 1]?.[0]?.y ?? line[0].y)) : 0;
    const prev = paras[paras.length - 1];
    if (prev && level === 0 && prev.level === 0 && gap < body * 1.9) {
      const lastRun = prev.runs[prev.runs.length - 1];
      if (lastRun && merged[0] && lastRun.bold === merged[0].bold && lastRun.italic === merged[0].italic) lastRun.text += ' ' + merged[0].text;
      else prev.runs.push({ ...merged[0], text: ' ' + merged[0].text });
      for (const r of merged.slice(1)) prev.runs.push(r);
    } else {
      paras.push({ runs: merged, level });
    }
  }
  return paras;
}

const esc = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function paraXml(p: Para): string {
  const style = p.level > 0 ? `<w:pPr><w:pStyle w:val="Heading${p.level}"/></w:pPr>` : '';
  const runs = p.runs
    .filter((r) => r.text.trim())
    .map((r) => `<w:r><w:rPr>${r.bold ? '<w:b/>' : ''}${r.italic ? '<w:i/>' : ''}</w:rPr><w:t xml:space="preserve">${esc(r.text)}</w:t></w:r>`)
    .join('');
  return `<w:p>${style}${runs}</w:p>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
</w:styles>`;

/** Build a valid .docx from paragraphs. */
export function buildDocx(paras: Para[]): Uint8Array {
  const body = paras.map(paraXml).join('');
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const enc = new TextEncoder();
  return makeZip([
    { name: '[Content_Types].xml', data: enc.encode(CONTENT_TYPES) },
    { name: '_rels/.rels', data: enc.encode(RELS) },
    { name: 'word/_rels/document.xml.rels', data: enc.encode(DOC_RELS) },
    { name: 'word/document.xml', data: enc.encode(document) },
    { name: 'word/styles.xml', data: enc.encode(STYLES) },
  ]);
}
