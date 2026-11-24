import {PDFDocument,StandardFonts,degrees,rgb} from 'pdf-lib';
import assert from 'node:assert/strict';
export async function makeRepairFixtures(){
 const d=await PDFDocument.create(),f=await d.embedFont(StandardFonts.Helvetica);
 for(const angle of [0,90,180,270]){const p=d.addPage([400,500]);p.setCropBox(50,80,240,360);p.setRotation(degrees(angle));p.drawText('RECOVER PAGE '+(d.getPageCount()),{x:80,y:200,font:f,size:16});p.drawRectangle({x:100,y:300,width:80,height:50,color:rgb(.2,.7,.1)});}
 d.addPage([300,400]);
 const good=Buffer.from(await d.save({useObjectStreams:false})),s=good.toString('latin1');
 return {good,cases:[['zero-xref',s.replace(/startxref\s+\d+/,'startxref\n0')],['wrong-xref',s.replace(/startxref\s+(\d+)/,(_,n)=>'startxref\n'+(Number(n)+2))],['missing-xref',s.replace(/xref\n[\s\S]*?trailer/,'trailer')]].map(([name,s])=>({name,bytes:Buffer.from(s,'latin1')}))};
}
export async function checkRecovered(source,out){
 const a=await PDFDocument.load(source),b=await PDFDocument.load(out);assert.equal(b.getPageCount(),5);
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),{createCanvas}=await import('@napi-rs/canvas');
 const x=await pdfjs.getDocument({data:new Uint8Array(source),useSystemFonts:true}).promise,y=await pdfjs.getDocument({data:new Uint8Array(out),useSystemFonts:true}).promise;
 try{for(let n=1;n<=5;n++){
  const ap=a.getPage(n-1),bp=b.getPage(n-1);assert.deepEqual(bp.getCropBox(),ap.getCropBox());assert.deepEqual(bp.getMediaBox(),ap.getMediaBox());assert.deepEqual(bp.getRotation(),ap.getRotation());
  const render=async p=>{const v=p.getViewport({scale:1}),c=createCanvas(v.width,v.height);await p.render({canvasContext:c.getContext('2d'),viewport:v}).promise;return c.getContext('2d').getImageData(0,0,c.width,c.height).data;};
  assert.deepEqual(await render(await x.getPage(n)),await render(await y.getPage(n)),'Recovery changed pixels page'+n);
  if(n<5)assert.ok((await(await y.getPage(n)).getTextContent()).items.some(i=>i.str==='RECOVER PAGE '+n));
 }}finally{await x.destroy();await y.destroy();}
}
