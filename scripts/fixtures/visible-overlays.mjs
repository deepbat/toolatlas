import {PDFDocument,StandardFonts,degrees,rgb} from 'pdf-lib';
import {PNG} from 'pngjs';
export const OVERLAY_X=['left','center','right'],OVERLAY_Y=['bottom','middle','top'];
export async function makeOverlayFixture(){
 const d=await PDFDocument.create(),font=await d.embedFont(StandardFonts.Helvetica);
 for(const angle of[0,90,180,270]){const p=d.addPage([400,500]);p.setCropBox(50,80,240,360);p.setRotation(degrees(angle));p.drawText('BODY',{x:130,y:250,font,size:15});}
 const p=d.addPage([300,400]);p.setMediaBox(-30,40,300,400);p.drawText('BODY',{x:90,y:230,font,size:15});
 return Buffer.from(await d.save());
}
export function overlayMark(){
 const p=new PNG({width:100,height:40});for(let y=0;y<40;y++)for(let x=0;x<100;x++){const i=(y*100+x)*4;p.data[i]=y<10?255:0;p.data[i+1]=y<10?0:255;p.data[i+2]=0;p.data[i+3]=255;}
 return PNG.sync.write(p);
}
export async function checkSignaturePixels(bytes,pageIndex,xSpot,ySpot){
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),{createCanvas}=await import('@napi-rs/canvas');
 const d=await pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false}).promise;
 try{
  if(d.numPages!==5)throw Error('Signature changed page count');
  for(let n=1;n<=5;n++){
   const p=await d.getPage(n),vp=p.getViewport({scale:1}),c=createCanvas(Math.ceil(vp.width),Math.ceil(vp.height));await p.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
   const a=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let minX=1e9,minY=1e9,maxX=-1,maxY=-1,red=0,green=0,ry=0,gy=0;
   for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4,[r,g,b]=a.slice(i,i+3);if(b<30&&((r>220&&g<30)||(g>220&&r<30))){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);if(r>220){red++;ry+=y;}else{green++;gy+=y;}}}
   if(n!==pageIndex){if(red||green)throw Error('Signature on wrong page');continue;}
   const x=xSpot==='left'?36:xSpot==='right'?vp.width-136:(vp.width-100)/2;
   const y=ySpot==='top'?36:ySpot==='bottom'?vp.height-76:(vp.height-40)/2;
   if(Math.abs(minX-x)>1||Math.abs(minY-y)>1||Math.abs(maxX-x-99)>1||Math.abs(maxY-y-39)>1)throw Error('Wrong visible signature bounds page'+n+': '+[minX,minY,maxX,maxY]);
   if(red<700||green<2200||ry/red>=gy/green)throw Error('Signature not viewer upright');
   if(!(await p.getTextContent()).items.some(i=>i.str==='BODY'))throw Error('Signature lost original text');
  }
 }finally{await d.destroy();}
}
export async function checkWatermarkGeometry(bytes){
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');const d=await pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false}).promise;
 const metric=await PDFDocument.create(),font=await metric.embedFont(StandardFonts.HelveticaBold),size=24,tw=font.widthOfTextAtSize('MARK',size),q=Math.SQRT1_2;
 try{for(let n=1;n<=5;n++){
  const p=await d.getPage(n),vp=p.getViewport({scale:1}),items=(await p.getTextContent()).items,i=items.find(i=>i.str==='MARK');if(!i)throw Error('Watermark missing');
  const t=pdfjs.Util.transform(vp.transform,i.transform),x=vp.width/2-tw/2*q+size*.35*q,y=vp.height-(vp.height/2-tw/2*q-size*.35*q);
  if(Math.abs(t[4]-x)>.05||Math.abs(t[5]-y)>.05||Math.abs(t[0]-size*q)>.05||Math.abs(t[1]+size*q)>.05)throw Error('Watermark not centered viewer-diagonal page'+n);
  if(!items.some(i=>i.str==='BODY'))throw Error('Watermark lost body');
 }}finally{await d.destroy();}
}
export async function chooseOverlayMark(page,n,x,y){
 await page.getByRole('button',{name:'Create a signature',exact:true}).click();
 await page.getByRole('button',{name:'Upload',exact:true}).click();
 await page.getByLabel('Signature image file').setInputFiles({name:'test-mark.png',mimeType:'image/png',buffer:overlayMark()});
 await page.getByAltText('Your signature',{exact:true}).waitFor();
 await page.getByLabel('Page',{exact:true}).fill(String(n));
 await page.getByLabel('Width (pt)',{exact:true}).fill('100');
 await page.getByLabel('Horizontal',{exact:true}).selectOption(x);
 await page.getByLabel('Vertical',{exact:true}).selectOption(y);
}
