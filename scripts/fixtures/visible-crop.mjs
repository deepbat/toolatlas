import {PDFDocument,StandardFonts,degrees,rgb} from 'pdf-lib';
export const CROP_MARGINS={top:12,right:24,bottom:36,left:48};
export async function makeCropFixture(){
 const d=await PDFDocument.create(),f=await d.embedFont(StandardFonts.Helvetica);
 for(const angle of[0,90,180,270]){
  const p=d.addPage([400,500]);p.setCropBox(50,80,240,360);p.setRotation(degrees(angle));
  for(let row=0;row<18;row++)for(let col=0;col<12;col++)p.drawRectangle({x:50+col*20,y:80+row*20,width:20,height:20,color:rgb((row%3)/2,(col%4)/3,((row+col)%5)/4)});
  p.drawText('VECTOR BODY',{x:90,y:250,size:12,font:f});
 }
 return Buffer.from(await d.save());
}
export async function checkCropPixels(source,output,selected=false){
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),{createCanvas}=await import('@napi-rs/canvas');
 const docs=await Promise.all([source,output].map(b=>pdfjs.getDocument({data:new Uint8Array(b),isEvalSupported:false}).promise));
 const render=async(p)=>{const v=p.getViewport({scale:1}),c=createCanvas(Math.ceil(v.width),Math.ceil(v.height));await p.render({canvasContext:c.getContext('2d'),viewport:v}).promise;return {w:c.width,h:c.height,d:c.getContext('2d').getImageData(0,0,c.width,c.height).data};};
 try{
  if(docs[1].numPages!==4)throw Error('Crop page count changed');
  for(let n=1;n<=4;n++){
   const pages=await Promise.all(docs.map(d=>d.getPage(n))),[a,b]=await Promise.all(pages.map(render));
   const m=selected&&n!==2?{top:0,right:0,bottom:0,left:0}:CROP_MARGINS;
   if(b.w!==a.w-m.left-m.right||b.h!==a.h-m.top-m.bottom)throw Error('Wrong visible crop dimensions page'+n);
   if(pages[0].rotate!==pages[1].rotate)throw Error('Crop rotation changed');
   let bad=0;
   for(let y=1;y<b.h-1;y++)for(let x=1;x<b.w-1;x++){
    const ai=((y+m.top)*a.w+x+m.left)*4,bi=(y*b.w+x)*4;
    if([0,1,2].some(k=>Math.abs(a.d[ai+k]-b.d[bi+k])>8))bad++;
   }
   if(bad>10)throw Error('Crop trims wrong visible edges page'+n+': '+bad+' pixels');
   if(!(await pages[1].getTextContent()).items.some(i=>i.str==='VECTOR BODY'))throw Error('Crop lost vector text');
  }
 }finally{await Promise.all(docs.map(d=>d.destroy()));}
}
