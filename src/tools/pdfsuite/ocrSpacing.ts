// OCR may join two Indic words even when their pictures have a word-sized white gap.
// Insert a space only at an existing grapheme boundary backed by a fully blank vertical strip.
interface Box { x0: number; y0: number; x1: number; y1: number }
interface Word { text: string; bbox: Box; symbols?: Array<{ text: string; bbox: Box }> }
export function indicWordSpacing(word: Word, lineWords: Word[], blankColumns: boolean[]): string {
  if (!/^[\u0900-\u097f\u0a00-\u0a7f]+$/u.test(word.text) || !word.symbols?.length) return word.text;
  const indic = (w: Word) => /^[\u0900-\u097f\u0a00-\u0a7f]+$/u.test(w.text);
  const gaps = lineWords.slice(1).map((w, i) => indic(w) && indic(lineWords[i]) ? w.bbox.x0 - lineWords[i].bbox.x1 : 0).filter(g => g > 0).sort((a,b) => a-b);
  if (gaps.length < 3) return word.text; // not enough independent word-gap evidence
  const typical = gaps[Math.floor(gaps.length / 2)];
  const minGap = Math.max(4, typical * 0.8, (word.bbox.y1 - word.bbox.y0) * 0.12);
  const strips: Array<[number, number]> = [];
  let start = -1;
  for (let i = 0; i <= blankColumns.length; i++) {
    if (blankColumns[i] && start < 0) start = i;
    if (!blankColumns[i] && start >= 0) { if (i-start >= minGap && start > 0 && i < blankColumns.length) strips.push([word.bbox.x0+start, word.bbox.x0+i]); start = -1; }
  }
  if (!strips.length) return word.text;
  const clusters = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(word.text)];
  // Match OCR symbol text in order. A combining mark can have a misleading box extending into a neighbour;
  // use the cluster's first base letter as its anchor, never split inside a cluster or conjunct.
  const symbols = word.symbols;
  let si = 0;
  const anchors: Array<{ text: string; box: Box }> = [];
  for (const { segment } of clusters) {
    let consumed = '', anchor: Box | undefined;
    while (si < symbols.length && consumed.length < segment.length) {
      const sym = symbols[si++]; consumed += sym.text;
      if (!anchor && /\p{Letter}/u.test(sym.text)) anchor = sym.bbox;
    }
    if (consumed !== segment || !anchor) return word.text;
    anchors.push({ text: segment, box: anchor });
  }
  return anchors.map((c,i) => {
    const before = anchors[i-1];
    const space = before && strips.some(([lo,hi]) => before.box.x1 <= hi && c.box.x0 >= lo && (before.box.x0+before.box.x1)/2 < lo && (c.box.x0+c.box.x1)/2 > hi);
    return (space ? ' ' : '') + c.text;
  }).join('');
}
