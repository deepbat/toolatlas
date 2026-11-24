// Synthetic CropBox/rotation regression, no customer documents.
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
export const STAMP_PLACES=['header-left','header-center','header-right','footer-left','footer-center','footer-right'];
export async function makeStampFixture(){
  const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica);
  for(const angle of[0,90,180,270]){
    const p=doc.addPage([400,500]);p.setCropBox(50,80,240,360);p.setRotation(degrees(angle));
    p.drawText('BODY',{x:120,y:250,font,size:20});
  }
  const p=doc.addPage([300,400]);p.setMediaBox(-30,40,300,400);p.drawText('BODY',{x:90,y:220,font,size:20});
  return Buffer.from(await doc.save());
}
export async function checkStampGeometry(bytes,place,{bates=false,size=10,margin=28,selected=false}={}){
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const reader=await pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false}).promise;
  const metrics=await PDFDocument.create(),font=await metrics.embedFont(StandardFonts.Helvetica);
  try{
    if(reader.numPages!==5)throw Error('Stamp page count changed');
    for(let n=1;n<=5;n++){
      const p=await reader.getPage(n),vp=p.getViewport({scale:1}),items=(await p.getTextContent()).items;
      if(!items.some(i=>i.str==='BODY'))throw Error('Original body text lost');
      const expected=bates?'CASE-'+String(n+6).padStart(4,'0'):'STAMP '+n+'/5';
      const i=items.find(i=>i.str===expected);
      if(selected&&n!==2){if(i)throw Error('Unselected page stamped');continue;}
      if(!i)throw Error('Missing stamp '+n);
      const t=pdfjs.Util.transform(vp.transform,i.transform),tw=font.widthOfTextAtSize(expected,size);
      const x=place.endsWith('left')?margin:place.endsWith('right')?vp.width-margin-tw:(vp.width-tw)/2;
      const y=place.startsWith('header')?margin+size*.8:vp.height-margin;
      if(Math.abs(t[4]-x)>.05||Math.abs(t[5]-y)>.05)throw Error('Wrong visible stamp position '+place+' page'+n+': '+t.slice(4));
      if(Math.abs(t[0]-size)>.05||Math.abs(t[1])>.05||Math.abs(t[2])>.05||Math.abs(t[3]+size)>.05)throw Error('Stamp is not viewer-upright');
      if(x<0||x+tw>vp.width||y<0||y>vp.height)throw Error('Stamp outside visible page');
    }
  }finally{await reader.destroy();}
}
