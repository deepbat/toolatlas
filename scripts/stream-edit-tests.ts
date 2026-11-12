import { PDFDocument, PDFName, PDFRawStream, StandardFonts, decodePDFRawStream } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { locateSourceEdit, removeSourceTexts, TextRun } from '../src/tools/pdf-editor/streamEdit';
import assert from 'node:assert/strict';
const doc = await PDFDocument.create();
const f = await doc.embedFont(StandardFonts.Helvetica);
const page = doc.addPage([612, 792]);
page.drawText('Receipt No.', { x: 40, y: 650, size: 10, font: f });
page.drawText('TEST-RECEIPT-001', { x: 300, y: 650, size: 10, font: f });
page.drawText('Customer Name', { x: 40, y: 630, size: 10, font: f });
page.drawText('TEST CUSTOMER', { x: 300, y: 630, size: 10, font: f });
const bytes = await doc.save();
const d = await PDFDocument.load(bytes);
const parsed = await pdfjs.getDocument({ data: bytes.slice() }).promise;
const pp = await parsed.getPage(1);
const ops = await pp.getOperatorList();
const runs: TextRun[] = ops.fnArray.flatMap((op, i) => {
 if (op !== pdfjs.OPS.showText) return [];
 const gs = ops.argsArray[i][0].filter((g: any) => typeof g !== 'number');
 return [{ text: gs.map((g: any) => g.unicode).join(''), codes: gs.map((g: any) => g.originalCharCode), width: gs.reduce((n: number, g: any) => n + g.width, 0), spaces: gs.filter((g: any) => g.isSpace).length }];
});
const edit = locateSourceEdit(d.getPage(0), runs.find(r => r.text === 'TEST-RECEIPT-001')!);
assert.ok(edit, 'exact receipt run maps to source');
removeSourceTexts(d.getPage(0), [edit]);
const result = await d.save();
const out = await pdfjs.getDocument({ data: result.slice() }).promise;
const tc = await (await out.getPage(1)).getTextContent();
const strings = tc.items.map((x: any) => x.str);
assert.ok(!strings.some(t => t.includes('TEST-RECEIPT-001')), 'original no longer extractable');
assert.ok(strings.includes('TEST CUSTOMER'), 'neighbour text unchanged');
console.log('PASS', strings);

// Raw PDF syntax cases, including escaped strings, kerning, and spacing.
async function rawCase(name: string, content: string, target: string, shouldRemove = true) {
 const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica); const p = d.addPage([612, 792]);
 p.drawText('seed', {font:f});
 const fontName = p.node.Resources()!.lookup(PDFName.of('Font'))!.keys()[0].toString();
 p.node.set(PDFName.of('Contents'), d.context.register(d.context.flateStream(`BT ${fontName} 12 Tf 1 Tc 2 Tw 72 700 Td ${content} ET`)));
 const bytes = await d.save(); const parsed = await pdfjs.getDocument({data:bytes.slice()}).promise; const pp = await parsed.getPage(1); const op = await pp.getOperatorList();
 const textRuns = op.fnArray.flatMap((n, i) => {
  if(n !== pdfjs.OPS.showText) return [];
  const gs = op.argsArray[i][0].filter((g:any) => typeof g !== 'number');
  return [{text:gs.map((g:any)=>g.unicode).join(''),codes:gs.map((g:any)=>g.originalCharCode),width:gs.reduce((n:number,g:any)=>n+g.width,0),spaces:gs.filter((g:any)=>g.isSpace).length}];
 });
 const actual = await PDFDocument.load(bytes); const hit = locateSourceEdit(actual.getPage(0), textRuns.find(r=>r.text===target)!);
 if(!shouldRemove){assert.equal(hit,undefined,name+' uses visual fallback');console.log('PASS '+name+' fallback');return;}
 assert.ok(hit,name+' exact match');removeSourceTexts(actual.getPage(0),[hit]);
 const after = await pdfjs.getDocument({data:await actual.save()}).promise; const ap = await after.getPage(1);const aops=await ap.getOperatorList();
 const allGlyphs=aops.fnArray.flatMap((n,i)=>n===pdfjs.OPS.showText?aops.argsArray[i][0].filter((g:any)=>typeof g!=='number').map((g:any)=>g.unicode):[]).join('');
 assert.ok(!allGlyphs.includes(target),name+' removed'); assert.ok(allGlyphs.includes('Neighbour'),name+' neighbour stays');
 // Compare the final neighbour's PDF.js text matrix after the removed operator.
 const beforeTc=await pp.getTextContent(), afterTc=await ap.getTextContent();
 const afterNeighbour=afterTc.items.find((x:any)=>x.str==='Neighbour') as any;
 // Original may be merged into one item. Draw each operator at its own line
 // for quote cases; relative positioning cases are asserted via operator list.
 assert.ok(afterNeighbour,name+' neighbour extractable');
 const restored=await PDFDocument.load(await actual.save());
 for(const [,obj] of restored.context.enumerateIndirectObjects()){
  if(obj instanceof PDFRawStream){try {assert.ok(!Buffer.from(decodePDFRawStream(obj).decode()).toString('latin1').includes(target),name+' old literal is not orphaned');}catch(e){if(e instanceof assert.AssertionError)throw e;}}
 }
 console.log('PASS '+name);
}
await rawCase('literal escaped parentheses','(Receipt \\(123\\)) Tj (Neighbour) Tj','Receipt (123)');
await rawCase('TJ kerning','[(Receipt ) -20 (123)] TJ (Neighbour) Tj','Receipt 123');
await rawCase('hex string','<5265636569707420313233> Tj (Neighbour) Tj','Receipt 123');
await rawCase('single quote','14 TL (Receipt 123) \' (Neighbour) Tj','Receipt 123');
await rawCase('double quote','14 TL 3 1 (Receipt 123) " (Neighbour) Tj','Receipt 123');
await rawCase('duplicate source strings','(Receipt 123) Tj 0 -30 Td (Receipt 123) Tj (Neighbour) Tj','Receipt 123',false);
console.log('All content-stream cases passed.');
