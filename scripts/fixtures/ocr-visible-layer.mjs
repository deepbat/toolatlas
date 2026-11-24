import {PDFDocument,degrees} from 'pdf-lib';
import assert from 'node:assert/strict';
export async function makeOcrGeometryFixture(){
 const {createCanvas}=await import('@napi-rs/canvas');const d=await PDFDocument.create();
 for(const [i,angle]of[0,90,180,270,0].entries()){
  const p=d.addPage(i===4?[300,400]:[400,500]);if(i===4)p.setMediaBox(-30,40,300,400);else p.setCropBox(50,80,240,360);p.setRotation(degrees(angle));
  const w=i===4?300:angle%180?360:240,h=i===4?400:angle%180?240:360;
  const c=createCanvas(w*2,h*2),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.scale(2,2);ctx.fillStyle='black';ctx.font='24px Arial';ctx.fillText('ORBIT',40,70);
  const image=await d.embedPng(c.toBuffer('image/png'));
  const x=i===4?-30:angle===90||angle===180?290:50,y=i===4?40:angle===180||angle===270?440:80;
  p.drawImage(image,{x,y,width:w,height:h,rotate:degrees(angle)});
 }return Buffer.from(await d.save());
}
export function fixedOcrLayers(){return [0,90,180,270,0].map((a,i)=>({page:i+1,imgWidth:(i===4?300:a%180?360:240)*2,imgHeight:(i===4?400:a%180?240:360)*2,words:[{text:'ORBIT',x0:80,y0:100,x1:240,y1:140}]}));}
export async function checkOcrGeometry(source,out,{selected=false,words=['ORBIT'],fixed=false}={}){
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),{createCanvas}=await import('@napi-rs/canvas');
 const a=await pdfjs.getDocument({data:new Uint8Array(source)}).promise,b=await pdfjs.getDocument({data:new Uint8Array(out)}).promise;
 try{assert.equal(b.numPages,5);for(let n=1;n<=5;n++){
  const p=await b.getPage(n),v=p.getViewport({scale:1}),items=(await p.getTextContent()).items;
  const scan=await a.getPage(n),sv=scan.getViewport({scale:1}),sc=createCanvas(sv.width,sv.height),sx=sc.getContext('2d');
  await scan.render({canvasContext:sx,viewport:sv}).promise;
  const pixels=sx.getImageData(0,0,sc.width,sc.height).data;let inkLeft=Infinity,inkRight=-1;
  for(let y=30;y<90;y++)for(let x=20;x<160;x++){const k=(y*sc.width+x)*4;if(pixels[k]<120&&pixels[k+1]<120&&pixels[k+2]<120){inkLeft=Math.min(inkLeft,x);inkRight=Math.max(inkRight,x);}}
  const inkWidth=inkRight-inkLeft+1;assert.ok(inkWidth>30,'Fixture scan word missing');
  if(selected&&n!==2)assert.equal(items.length,0,'OCR marked an unselected page');
  else for(const text of words){const it=items.find(i=>i.str===text);assert.ok(it,'missing OCR '+text+' page'+n);const t=pdfjs.Util.transform(v.transform,it.transform);
   assert.ok(Math.abs(t[4]-40)<(fixed?.1:5),'OCR x misses visible word page'+n+': '+t);
   assert.ok(Math.abs(t[5]-70)<(fixed?.1:6),'OCR baseline misses visible word page'+n+': '+t);
   if(text==='ORBIT')assert.ok(Math.abs(it.width-(fixed?80:inkWidth))<(fixed?.1:4),'OCR text width misses scan word page'+n+': '+it.width+' vs ink '+inkWidth);
   assert.ok(t[0]>0&&t[3]<0&&Math.abs(t[1])<.01&&Math.abs(t[2])<.01,'OCR not viewer upright page'+n);
  }
  const render=async p=>{const vp=p.getViewport({scale:1}),c=createCanvas(vp.width,vp.height);await p.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;return c.getContext('2d').getImageData(0,0,c.width,c.height).data;};
  assert.deepEqual(await render(await a.getPage(n)),await render(p),'Invisible OCR changed visible scan');
 }}finally{await a.destroy();await b.destroy();}
}
