// CSV helpers with formula-injection safeguards.
export function parseCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === delimiter) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (quoted) throw Error('A quoted field is never closed. Check for a stray quotation mark.');
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
/** Spreadsheet apps run cells that start with = + - @ as formulas. Neutralise them with a leading apostrophe. */
export function safeCell(v: string): string {
  if (/^[=@\t\r]/.test(v)) return "'" + v;
  if (/^[+-]/.test(v) && !/^[+-]?(\d[\d,]*\.?\d*|\.\d+)(e[+-]?\d+)?%?$/i.test(v)) return "'" + v;
  return v;
}
export function toCsv(rows: string[][], safe: boolean, delimiter = ','): string {
  const q = (v: string) => {
    const s = safe ? safeCell(v) : v;
    return /["\r\n]/.test(s) || s.includes(delimiter) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return rows.map((r) => r.map(q).join(delimiter)).join('\r\n');
}
export function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const counts: [string, number][] = [',', ';', '\t', '|'].map((d) => [d, first.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}
