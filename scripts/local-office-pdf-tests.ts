import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import{PDFDocument,PDFName,PDFRawStream,decodePDFRawStream}from'pdf-lib';import{repairLocalOfficePdf}from'../src/tools/pdfsuite/localOfficePdf';
import{checkOfficeFixture}from'./fixtures/office-engine/check.mjs';
const src=await readFile(new URL('./fixtures/office-engine/exported-docx.pdf',import.meta.url));
async function tamper(change:(s:string)=>string){const d=await PDFDocument.load(src),p=d.getPage(0),s=p.node.Contents();assert.ok(s instanceof PDFRawStream);const text=Buffer.from(decodePDFRawStream(s).decode()).toString('latin1');p.node.set(PDFName.of('Contents'),d.context.register(d.context.flateStream(change(text))));return d.save();}
for(const [n,fn]of[
 ['rotation',(s:string)=>s.replace('1 0 0 1 90.1 658.05 Tm','0 1 -1 0 90.1 658.05 Tm')],
 ['render mode',(s:string)=>s.replace('113.35 658.05 Td','2 Tr 113.35 658.05 Td')],
 ['char spacing',(s:string)=>s.replace('113.35 658.05 Td','1 Tc 113.35 658.05 Td')],
 ['missing glyph map',(s:string)=>s.replace('<010203>Tj','<FF0203>Tj')],
 ['unbalanced marker',(s:string)=>s.replace('/Span<</ActualText<FEFF09240947>>>','/Span<</ActualText<FEFF09240947>>> BDC')],
 ['nonidentity ctm',(s:string)=>'2 0 0 2 0 0 cm\n'+s],
]as const){await assert.rejects(()=>tamper(fn).then(repairLocalOfficePdf),undefined,n);console.log('PASS rejects',n);}
const d=await PDFDocument.create();d.addPage();const b=await d.save();assert.equal(await repairLocalOfficePdf(b),b,'No Indic fonts returns original bytes');console.log('PASS unchanged non-Indic PDF');

for(const kind of ['docx','xlsx']){const b=await readFile(new URL('./fixtures/office-engine/exported-'+kind+'.pdf',import.meta.url));await checkOfficeFixture(await repairLocalOfficePdf(b),kind);console.log('PASS repaired complex '+kind);}
