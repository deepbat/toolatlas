import {PDFDocument,StandardFonts,degrees,rgb} from 'pdf-lib';
import assert from 'node:assert/strict';
export async function makeBackgroundFixture(){
 const d=await PDFDocument.create(),f=await d.embedFont(StandardFonts.Helvetica);
 for(const [i,angle]of[0,90,180,270,0,0].entries()){
  const p=d.addPage([400,500]);if(i===4)p.setMediaBox(-30,40,400,500);else if(i<4)p.setCropBox(50,80,240,360);p.setRotation(degrees(angle));
  if(i===5)continue;
  p.drawRectangle({x:100,y:140,width:90,height:60,color:rgb(0,0.8,0.1)});
  p.drawRectangle({x:10,y:10,width:380,height:30,color:rgb(0,0,1)});
  p.drawText('BODY',{x:130,y:250,size:20,font:f});
 }return Buffer.from(await d.save());
}
export async function checkBackgroundPixels(source,out){
 const a=await PDFDocument.load(source),b=await PDFDocument.load(out);assert.equal(b.getPageCount(),6);
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),{createCanvas}=await import('@napi-rs/canvas');
 const x=await pdfjs.getDocument({data:new Uint8Array(source),useSystemFonts:true}).promise,y=await pdfjs.getDocument({data:new Uint8Array(out),useSystemFonts:true}).promise;
 try{for(let n=1;n<=6;n++){
  const ap=a.getPage(n-1),bp=b.getPage(n-1);assert.deepEqual(bp.getMediaBox(),ap.getMediaBox());assert.deepEqual(bp.getCropBox(),ap.getCropBox());assert.deepEqual(bp.getRotation(),ap.getRotation());
  const p=await y.getPage(n),q=await x.getPage(n);
  const render=async(p,background)=>{const v=p.getViewport({scale:1}),c=createCanvas(v.width,v.height);await p.render({canvasContext:c.getContext('2d'),viewport:v,background}).promise;return c.getContext('2d').getImageData(0,0,c.width,c.height).data;};
  const expected=await render(q,'#ff0000'),actual=await render(p,'#ffffff');
  assert.deepEqual(actual,expected,'Background lost visible artwork, changed crop or covered text page'+n);
  if(n<6)assert.ok((await p.getTextContent()).items.some(i=>i.str==='BODY'),'Background lost vector text');
 }}finally{await x.destroy();await y.destroy();}
}
export async function chooseRedBackground(page){
 await page.locator('main select').first().selectOption('bg');
 await page.locator('input[type=color]').fill('#ff0000');
}
