// Invisible, Unicode-exact text for scanned or image-only pages.
//
// Chromium's print path and Helvetica cannot carry Hindi or Punjabi text reliably. This builds a tiny
// composite font instead: every distinct character gets its own code, and a ToUnicode map sends each
// code straight back to that character. The text is drawn in render mode 3 (invisible), so no glyph
// shapes are needed and no shaping can reorder anything. Readers that copy or search text use the
// ToUnicode map, which is exact here. No font file is embedded.
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFOperator, PDFRef, PDFString, popGraphicsState, pushGraphicsState, type PDFPage } from 'pdf-lib';

export interface PlacedWord { text: string; x: number; y: number; w: number; h: number }

const hex4 = (n: number) => n.toString(16).toUpperCase().padStart(4, '0');

function utf16Hex(cp: number): string {
  if (cp < 0x10000) return hex4(cp);
  const v = cp - 0x10000;
  return hex4(0xd800 + (v >> 10)) + hex4(0xdc00 + (v & 0x3ff));
}

export class InvisibleUnicodeFont {
  private cids = new Map<number, number>();
  private order: number[] = [];
  readonly ref: PDFRef;
  constructor(private doc: PDFDocument) { this.ref = doc.context.nextRef(); }

  /** Two-byte codes for a string, as hex, plus the character count. */
  encode(text: string): { hex: string; count: number } {
    let hex = '', count = 0;
    for (const ch of text) {
      const cp = ch.codePointAt(0) as number;
      if (cp < 0x20 || cp === 0x7f) continue;
      let id = this.cids.get(cp);
      if (id === undefined) { id = this.order.length + 1; this.cids.set(cp, id); this.order.push(cp); }
      hex += hex4(id); count++;
    }
    return { hex, count };
  }

  /** Build the font objects once every string is encoded. */
  finish() {
    const ctx = this.doc.context;
    const parts: string[] = [];
    for (let i = 0; i < this.order.length; i += 100) {
      const chunk = this.order.slice(i, i + 100);
      parts.push(`${chunk.length} beginbfchar\n${chunk.map((cp, k) => `<${hex4(i + k + 1)}> <${utf16Hex(cp)}>`).join('\n')}\nendbfchar`);
    }
    const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${parts.join('\n')}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
    const toUni = ctx.register(ctx.stream(cmap));
    const base = PDFName.of('DeepakInvisible');
    const desc = ctx.register(ctx.obj({
      Type: 'FontDescriptor', FontName: base, Flags: 4, FontBBox: [0, -200, 1000, 800], ItalicAngle: 0, Ascent: 800, Descent: -200, CapHeight: 700, StemV: 80,
    }));
    const sysInfo = ctx.obj({ Registry: PDFString.of('Adobe'), Ordering: PDFString.of('Identity'), Supplement: 0 });
    const cid = ctx.register(ctx.obj({
      Type: 'Font', Subtype: 'CIDFontType2', BaseFont: base, CIDSystemInfo: sysInfo, FontDescriptor: desc, DW: 1000, CIDToGIDMap: 'Identity',
    }));
    const type0 = ctx.obj({ Type: 'Font', Subtype: 'Type0', BaseFont: base, Encoding: 'Identity-H', DescendantFonts: [cid], ToUnicode: toUni });
    ctx.assign(this.ref, type0 as PDFDict);
  }
}

/** True when any word needs more than WinAnsi can carry, so Helvetica would drop letters. */
export function needsUnicode(words: { text: string }[]): boolean {
  return words.some((w) => /[^\u0000-\u00ff\u2018\u2019\u201c\u201d\u2013\u2014\u2022\u2026\u20ac]/.test(w.text));
}

/** Draw words as invisible text. Positions are in page points, y is the baseline. */
export function drawInvisibleWords(page: PDFPage, font: InvisibleUnicodeFont, words: PlacedWord[]) {
  const name = page.node.newFontDictionary('FDeepakInv', font.ref);
  const ops: PDFOperator[] = [pushGraphicsState(), PDFOperator.of('BT' as never)];
  const op = (n: string, args: (PDFNumber | PDFName | PDFHexString)[] = []) => ops.push(PDFOperator.of(n as never, args));
  op('Tr', [PDFNumber.of(3)]);
  for (const w of words) {
    const { hex, count } = font.encode(w.text);
    if (!count) continue;
    const size = Math.max(1, w.h);
    // Every code is 1000 units wide, so horizontal scaling makes the string exactly as wide as the word box.
    const tz = Math.max(1, Math.min(10000, (w.w / (count * size)) * 100));
    op('Tf', [name, PDFNumber.of(size)]);
    op('Tz', [PDFNumber.of(tz)]);
    op('Tm', [PDFNumber.of(1), PDFNumber.of(0), PDFNumber.of(0), PDFNumber.of(1), PDFNumber.of(w.x), PDFNumber.of(w.y)]);
    op('Tj', [PDFHexString.of(hex)]);
  }
  ops.push(PDFOperator.of('ET' as never), popGraphicsState());
  page.pushOperators(...ops);
}
void PDFArray;
