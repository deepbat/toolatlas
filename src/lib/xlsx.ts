// Small .xlsx reader and writer. Strings only, first sheet, no formulas written.
import { makeZip, readZip } from './zip';
import { safeCell } from './csvtools';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const col = (i: number) => {
  let s = '';
  for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
};
const enc = new TextEncoder();
const dec = new TextDecoder();

export async function makeXlsx(rows: string[][], sheetName = 'Sheet1'): Promise<Uint8Array> {
  if (rows.length > 1048576) throw Error('Excel allows at most 1,048,576 rows.');
  const sheet = rows
    .map((r, ri) => {
      const cells = r
        .map((v, ci) => {
          const s = safeCell(String(v));
          return s === '' ? '' : /^-?\d+(\.\d+)?$/.test(s) && s.length < 16 && !/^-?0\d/.test(s)
            ? `<c r="${col(ci)}${ri + 1}"><v>${s}</v></c>`
            : `<c r="${col(ci)}${ri + 1}" t="inlineStr"><is><t xml:space="preserve">${esc(s)}</t></is></c>`;
        })
        .join('');
      return `<row r="${ri + 1}">${cells}</row>`;
    })
    .join('');
  const x = (s: string) => enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + s);
  return makeZip([
    { name: '[Content_Types].xml', data: x('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>') },
    { name: '_rels/.rels', data: x('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
    { name: 'xl/workbook.xml', data: x(`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(sheetName.slice(0, 31).replace(/[\\/?*[\]:]/g, '_') || 'Sheet1')}" sheetId="1" r:id="rId1"/></sheets></workbook>`) },
    { name: 'xl/_rels/workbook.xml.rels', data: x('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>') },
    { name: 'xl/worksheets/sheet1.xml', data: x(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheet}</sheetData></worksheet>`) },
  ]);
}

const unesc = (s: string) => s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e: string) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" } as Record<string, string>)[e.toLowerCase()]);
const colIndex = (ref: string) => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

export async function readXlsx(buf: ArrayBuffer | Uint8Array): Promise<string[][]> {
  const files = await readZip(buf);
  const sheetName = [...files.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  if (!sheetName) throw Error('No worksheet found. Is this an .xlsx file?');
  const shared: string[] = [];
  const sst = files.get('xl/sharedStrings.xml');
  if (sst) {
    for (const m of dec.decode(sst).matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(unesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
  }
  const xml = dec.decode(files.get(sheetName)!);
  const rows: string[][] = [];
  for (const rm of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const cm of rm[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /t="(\w+)"/.exec(attrs)?.[1];
      const body = cm[2] ?? '';
      let v = '';
      if (type === 'inlineStr') v = unesc([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''));
      else {
        const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '';
        v = type === 's' ? shared[Number(raw)] ?? '' : unesc(raw);
      }
      const ci = ref ? colIndex(ref) : row.length;
      while (row.length < ci) row.push('');
      row[ci] = v;
    }
    rows.push(row);
    if (rows.length > 200000) throw Error('This sheet has more than 200,000 rows. Split it first.');
  }
  return rows;
}
