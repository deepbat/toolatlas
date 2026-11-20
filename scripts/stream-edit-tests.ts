// Unit tests for position-aware source text removal (streamEdit.ts).
import { PDFDocument, PDFName, PDFRawStream, PDFArray, PDFDict, StandardFonts, rgb, decodePDFRawStream } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import assert from 'node:assert/strict';
import { planTextRemoval, removeSourceTexts, encodeWithSourceFont, sourceFontInfo } from '../src/tools/pdf-editor/streamEdit';

// Rectangle (PDF user space) of the textContent item whose text matches, as
// the editor computes it from the pdf.js viewport.
async function rectForText(parsed: any, target: string, occurrence = 0) {
  const page = await parsed.getPage(1);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const hits: { x: number; y: number; w: number; h: number; str: string }[] = [];
  const all: { x: number; y: number; w: number; h: number; str: string }[] = [];
  for (let index = 0; index < tc.items.length; index++) {
    const item: any = tc.items[index];
    if (!item.str || !item.width) continue;
    const tx = pdfjs.Util.transform(vp.transform, item.transform);
    const fontH = Math.hypot(tx[2], tx[3]);
    if (!fontH) continue;
    const style = tc.styles[item.fontName] ?? {};
    const ascent = fontH * (style.ascent ?? 0.8);
    const descent = fontH * Math.abs(style.descent ?? -0.2);
    const width = item.width * (vp.scale ?? 1);
    const ul = Math.hypot(tx[0], tx[1]) || 1;
    const dx = tx[0] / ul, dy = tx[1] / ul;
    const nx = -dy, ny = dx;
    const corners = [
      [tx[4] - nx * ascent, tx[5] - ny * ascent],
      [tx[4] + dx * width - nx * ascent, tx[5] + dy * width - ny * ascent],
      [tx[4] + dx * width + nx * descent, tx[5] + dy * width + ny * descent],
      [tx[4] + nx * descent, tx[5] + ny * descent],
    ];
    const pcs = corners.map((c) => vp.convertToPdfPoint(c[0], c[1]) as number[]);
    const pxs = pcs.map((p) => p[0]), pys = pcs.map((p) => p[1]);
    const entry = {
      x: Math.min(...pxs), y: Math.min(...pys),
      w: Math.max(...pxs) - Math.min(...pxs), h: Math.max(...pys) - Math.min(...pys),
      str: item.str,
    };
    all.push(entry);
    if (item.str.trim()) hits.push(entry);
  }
  const exact = hits.filter((h) => h.str === target);
  if (exact.length > occurrence) return exact[occurrence];
  // Char/space-split text: merge consecutive items until the target is covered.
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  for (let i = 0; i < all.length; i++) {
    let str = '';
    for (let j = i; j < all.length && norm(str).length < target.length; j++) {
      str += all[j].str;
      if (norm(str) === target) {
        const group = all.slice(i, j + 1).filter((h) => h.str.trim());
        return {
          x: Math.min(...group.map((h) => h.x)), y: Math.min(...group.map((h) => h.y)),
          w: Math.max(...group.map((h) => h.x + h.w)) - Math.min(...group.map((h) => h.x)),
          h: Math.max(...group.map((h) => h.y + h.h)) - Math.min(...group.map((h) => h.y)),
          str,
        };
      }
    }
  }
  return undefined;
}

async function pageText(bytes: Uint8Array, pageNo = 1) {
  const parsed = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const tc = await (await parsed.getPage(pageNo)).getTextContent();
  return tc.items.map((x: any) => x.str).join('');
}

// Plan + apply a removal for `target` (nth occurrence) on page 1. Returns the
// exported bytes, or null when the plan falls back to a visual cover.
async function removeText(bytes: Uint8Array, target: string, occurrence = 0, expectRemoval = true) {
  const parsed = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const rect = await rectForText(parsed, target, occurrence);
  assert.ok(rect, `no text item for "${target}"`);
  const doc = await PDFDocument.load(bytes);
  const edits = planTextRemoval(doc.getPage(0), rect!);
  if (!expectRemoval) {
    assert.equal(edits, undefined, `"${target}" should fall back to visual cover`);
    return null;
  }
  assert.ok(edits && edits.length, `"${target}" should map to source operators`);
  const done = removeSourceTexts(doc.getPage(0), edits!);
  assert.equal(done.size, new Set(edits!.map((e) => e.obj)).size, 'all streams rewritten');
  return doc.save();
}

// Case 1: unique run on a pdf-lib generated page (the original happy path).
{
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  const p1 = d.addPage([612, 792]);
  p1.drawText('Receipt No.', { x: 40, y: 650, size: 10, font: f });
  p1.drawText('TEST-RECEIPT-001', { x: 300, y: 650, size: 10, font: f });
  p1.drawText('Customer Name', { x: 40, y: 630, size: 10, font: f });
  p1.drawText('TEST CUSTOMER', { x: 300, y: 630, size: 10, font: f });
  const bytes = await d.save();
  const out = (await removeText(bytes, 'TEST-RECEIPT-001'))!;
  const strings = await pageText(out);
  assert.ok(!strings.includes('TEST-RECEIPT-001'), 'original no longer extractable');
  assert.ok(strings.includes('TEST CUSTOMER'), 'neighbour text unchanged');
  console.log('PASS unique run removal');
}

// Case 2: duplicate labels - only the tapped instance is removed.
{
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  const p = d.addPage([612, 792]);
  p.drawText('Account Number', { x: 40, y: 700, size: 10, font: f });
  p.drawText('Account Number', { x: 40, y: 600, size: 10, font: f });
  p.drawText('Branch Code', { x: 40, y: 650, size: 10, font: f });
  const bytes = await d.save();
  const out = (await removeText(bytes, 'Account Number', 1))!;
  const strings = await pageText(out);
  assert.equal(strings.split('Account Number').length - 1, 1, 'exactly one duplicate remains');
  assert.ok(strings.includes('Branch Code'), 'neighbour unchanged');
  console.log('PASS duplicate labels: only tapped instance removed');
}

// Raw-syntax cases through the position-based planner.
async function rawCase(name: string, content: string, target: string, shouldRemove = true, orphanCheck = true) {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  const p = d.addPage([612, 792]);
  p.drawText('seed', { font: f });
  const fontName = p.node.Resources()!.lookup(PDFName.of('Font'))!.keys()[0].toString();
  p.node.set(PDFName.of('Contents'), d.context.register(d.context.flateStream(`BT ${fontName} 12 Tf 1 Tc 2 Tw 72 700 Td ${content} ET`)));
  const bytes = await d.save();
  const out = await removeText(bytes, target, 0, shouldRemove);
  if (!shouldRemove) {
    console.log('PASS ' + name + ' falls back');
    return;
  }
  const strings = await pageText(out!);
  assert.ok(!strings.includes(target), name + ' removed');
  assert.ok(strings.includes('Neighbour'), name + ' neighbour stays');
  if (orphanCheck) {
    const restored = await PDFDocument.load(out!);
    for (const [, obj] of restored.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFRawStream) {
        assert.ok(!Buffer.from(decodePDFRawStream(obj).decode()).toString('latin1').includes(target), name + ' old literal is not orphaned');
      }
    }
  }
  console.log('PASS ' + name);
}
await rawCase('literal escaped parentheses', '(Receipt \\(123\\)) Tj 0 -30 Td (Neighbour) Tj', 'Receipt (123)');
await rawCase('TJ kerning', '[(Receipt ) -20 (123)] TJ 0 -30 Td (Neighbour) Tj', 'Receipt 123', true, false);
await rawCase('hex string', '<5265636569707420313233> Tj 0 -30 Td (Neighbour) Tj', 'Receipt 123');
await rawCase('single quote', "14 TL (Receipt 123) ' 200 30 Td (Neighbour) Tj", 'Receipt 123');
await rawCase('double quote', '14 TL 3 1 (Receipt 123) " 200 30 Td (Neighbour) Tj', 'Receipt 123');
// Char-split: every glyph its own show operator; the line is one item to the user.
await rawCase('char-split operators', '(R) Tj (e) Tj (c) Tj (e) Tj (i) Tj (p) Tj (t) Tj 0 -30 Td (Neighbour) Tj', 'Receipt', true, false);

// Case: text drawn inside a Form XObject is removable when used once.
async function xobjectDoc(shared: boolean) {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  const mk = () => {
    const p = d.addPage([612, 792]);
    p.drawText('page heading', { x: 40, y: 760, size: 14, font: f });
    return p;
  };
  const pages = shared ? [mk(), mk()] : [mk()];
  const fontDict = pages[0].node.Resources()!.lookup(PDFName.of('Font'), PDFDict)!;
  const fontKey = fontDict.keys()[0].toString();
  const xobjRef = d.context.register(d.context.flateStream(`BT ${fontKey} 10 Tf 0 0 Td (FORM-XOBJECT-TEXT) Tj ET`));
  const xobj = d.context.lookup(xobjRef, PDFRawStream)!;
  xobj.dict.set(PDFName.of('Type'), PDFName.of('XObject'));
  xobj.dict.set(PDFName.of('Subtype'), PDFName.of('Form'));
  xobj.dict.set(PDFName.of('BBox'), d.context.obj([0, 0, 300, 20]));
  xobj.dict.set(PDFName.of('Resources'), d.context.obj({ Font: fontDict }));
  pages.forEach((p, i) => {
    const res = p.node.Resources()!;
    let xobjects = res.lookupMaybe(PDFName.of('XObject'), PDFDict);
    if (!xobjects) {
      xobjects = d.context.obj({});
      res.set(PDFName.of('XObject'), xobjects);
    }
    xobjects.set(PDFName.of('Fm0'), xobjRef);
    const old = p.node.get(PDFName.of('Contents'));
    const doRef = d.context.register(d.context.flateStream(`q 1 0 0 1 40 ${700 - i * 100} cm /Fm0 Do Q`));
    if (old instanceof PDFArray) old.push(doRef);
    else p.node.set(PDFName.of('Contents'), d.context.obj([old, doRef]));
  });
  return d.save();
}
{
  const bytes = await xobjectDoc(false);
  const out = (await removeText(bytes, 'FORM-XOBJECT-TEXT'))!;
  const strings = await pageText(out);
  assert.ok(!strings.includes('FORM-XOBJECT-TEXT'), 'xobject text removed');
  assert.ok(strings.includes('page heading'), 'page text unchanged');
  console.log('PASS form XObject text removal');
}
{
  const bytes = await xobjectDoc(true);
  await removeText(bytes, 'FORM-XOBJECT-TEXT', 0, false);
  console.log('PASS shared XObject falls back');
}

// Case: a tiny tap between words removes nothing (no stray matching).
{
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  const p = d.addPage([612, 792]);
  p.drawText('left text', { x: 40, y: 700, size: 10, font: f });
  p.drawText('right text', { x: 300, y: 700, size: 10, font: f });
  const bytes = await d.save();
  const doc = await PDFDocument.load(bytes);
  const edits = planTextRemoval(doc.getPage(0), { x: 200, y: 700, w: 4, h: 4 });
  assert.equal(edits, undefined, 'empty spot has no plan');
  console.log('PASS empty spot removes nothing');
}

// Case: Illustrator-style subset font (descriptor ascent/descent 0, only used
// glyphs have widths). Removal must still be planned, and replacement text can
// reuse the embedded font only when every glyph exists in the subset.
{
  const d = await PDFDocument.create();
  const widths = Array.from({ length: 95 }, (_, i) => ('FUND TRANSFER'.includes(String.fromCharCode(32 + i)) ? 600 : 0));
  const fd = d.context.register(d.context.obj({
    Type: 'FontDescriptor', FontName: 'ABCDEF+Gotham-Medium', Flags: 32, FontBBox: [0, 0, 1000, 1000],
    ItalicAngle: 0, Ascent: 0, Descent: 0, CapHeight: 700, StemV: 124, FontWeight: 500,
  }));
  const fontRef = d.context.register(d.context.obj({
    Type: 'Font', Subtype: 'TrueType', BaseFont: 'ABCDEF+Gotham-Medium', FirstChar: 32, LastChar: 126,
    Widths: widths, Encoding: 'WinAnsiEncoding', FontDescriptor: fd,
  }));
  const page = d.addPage([612, 792]);
  const tag = page.node.newFontDictionary('GM', fontRef);
  const { PDFOperator, PDFName: N, PDFString: S } = await import('pdf-lib');
  page.pushOperators(
    PDFOperator.of('BT' as any, []), PDFOperator.of('Tf' as any, [tag, (d.context.obj(11) as any)]),
    PDFOperator.of('Td' as any, [d.context.obj(50) as any, d.context.obj(700) as any]),
    PDFOperator.of('Tj' as any, [S.of('FUND TRANSFER')]), PDFOperator.of('ET' as any, []),
  );
  const doc = await PDFDocument.load(await d.save());
  const edits = planTextRemoval(doc.getPage(0), { x: 48, y: 697, w: 80, h: 12 });
  assert.ok(edits && edits.length, 'zero-ascent subset font still plans removal');
  const obj = edits![0].font;
  assert.ok(obj, 'plan names the source font');
  const info = sourceFontInfo(doc, obj!);
  assert.equal(info?.weight, 500);
  assert.ok(encodeWithSourceFont(doc, obj!, 'TRANS FUND'), 'subset glyphs encode');
  assert.equal(encodeWithSourceFont(doc, obj!, 'SLIP'), undefined, 'missing glyph falls back');
  console.log('PASS subset font: plan, weight and glyph availability');
}

console.log('All content-stream cases passed.');
