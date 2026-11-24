// Asymmetric vector fixture: red top, green left, blue content outside CropBox.
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
export async function makeLayoutFixture(cropped = true) {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
  for (const angle of [0, 90, 180, 270]) {
    const p = doc.addPage([400, 500]);
    if (cropped) p.drawRectangle({ x:0, y:0, width:400, height:500, color:rgb(0,0,1) });
    if (cropped) p.drawText('OUTSIDE CROP', { x:5, y:465, size:20, font });
    p.drawRectangle({ x:50, y:80, width:240, height:360, color:rgb(1,1,1) });
    p.drawRectangle({ x:50, y:80, width:30, height:360, color:rgb(0,1,0) });
    p.drawRectangle({ x:50, y:380, width:240, height:60, color:rgb(1,0,0) });
    p.drawText('TOP '+angle, { x:90, y:400, size:20, font });
    if (cropped) p.setCropBox(50,80,240,360); else p.setMediaBox(50,80,240,360); p.setRotation(degrees(angle));
  }
  doc.addPage([200,300]); // no Contents stream
  doc.addPage([200,300]).drawText('ORDINARY VECTOR PAGE',{x:10,y:150,size:12,font});
  return Buffer.from(await doc.save());
}

export async function checkLayoutPixels(bytes, kind, imagePages = true) {
  const { createCanvas } = await import('@napi-rs/canvas');
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false}).promise;
  // 6 pages: four cropped rotations, one blank, one ordinary vector page.
  const order = kind === 'nup' ? [[0,1,2,3],[4,5,-1,-1]] : [[-1,0],[1,-1],[5,2],[3,4]];
  if(doc.numPages!==order.length) throw Error('Wrong output sheet count');
  try {
    for(let n=1;n<=doc.numPages;n++) {
      const page=await doc.getPage(n), vp=page.getViewport({scale:1});
      const canvas=createCanvas(Math.ceil(vp.width),Math.ceil(vp.height));
      await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
      const all=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      for(let i=0;i<all.length;i+=4)if(all[i+2]>all[i]+5&&all[i+2]>all[i+1]+5)throw Error('Blue crop artwork is visible, including page edges');
      const cols=2,rows=kind==='nup'?2:1,gap=kind==='nup'?12:0;
      const cw=(vp.width-gap*(cols+1))/cols,ch=(vp.height-gap*(rows+1))/rows;
      for(let k=0;k<order[n-1].length;k++) {
        const idx=order[n-1][k],col=k%cols,row=Math.floor(k/cols);
        const x0=gap+col*(cw+gap),y0=gap+row*(ch+gap);
        const data=canvas.getContext('2d').getImageData(Math.ceil(x0+2),Math.ceil(y0+2),Math.floor(cw-4),Math.floor(ch-4));
        let red=0,green=0,blue=0,rx=0,ry=0;
        for(let y=0;y<data.height;y++)for(let x=0;x<data.width;x++) {
          const i=(y*data.width+x)*4,[r,g,b]=data.data.slice(i,i+3);
          if(b>180&&r<50&&g<50)blue++;
          if(g>180&&r<50&&b<50)green++;
          if(r>180&&g<50&&b<50){red++;rx+=x;ry+=y;}
        }
        if(blue)throw Error('Content outside CropBox leaked onto sheet');
        if(idx<0||idx>=4){if(red||green)throw Error('Blank slot contains source artwork');continue;}
        if(red<500||green<200)throw Error('Visible vector bands missing');
        const cx=rx/red/data.width,cy=ry/red/data.height;
        const ok=idx===0?cy<0.25:idx===1?cx>0.75:idx===2?cy>0.75:cx<0.25;
        if(!ok)throw Error('Source rotation lost at sheet '+n+' slot '+k+': '+cx+','+cy);
      }
      const text=(await page.getTextContent()).items.map(i=>i.str).join(' ');
      if(order[n-1].includes(5)&&!text.includes('ORDINARY VECTOR PAGE'))throw Error('Ordinary page vector text lost');
      for(const idx of order[n-1])if(idx>=0&&idx<4) {
        if(imagePages&&text.includes('TOP '+idx*90))throw Error('Cropped page unexpectedly retains source text');
        if(!imagePages&&!text.includes('TOP '+idx*90))throw Error('Vector text lost');
      }
    }
  } finally {await doc.destroy();}
}
