import assert from 'node:assert/strict';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {createCanvas} from '@napi-rs/canvas';
export async function checkOfficeFixture(bytes,kind){
 const d=await pdfjs.getDocument({data:new Uint8Array(bytes),standardFontDataUrl:new URL('../../../../node_modules/pdfjs-dist/standard_fonts/',import.meta.url).pathname}).promise;
 try{assert.equal(d.numPages,kind==='docx'?2:1,'Explicit DOCX break / XLSX print area');const pages=[];
 for(let n=1;n<=d.numPages;n++){const p=await d.getPage(n),t=(await p.getTextContent()).items.map(x=>x.str).join(' ');pages.push(t);}
 const text=pages.join(' ').replace(/\s+/g,' ');
 if(kind==='docx'){
  for(const s of ['TOOLATLAS HEADER','PRIVATE FOOTER','Complex quarterly report','नमस्ते दुनिया क्षत्रिय ज्ञान','ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ ਪੰਜਾਬੀ ਕ੍ਰਿਪਾ','Inner 1','Inner 2','Inner merged','Outer merged','FLOATING BOX CONTENT','Final sentence, no content may be lost.'])assert.ok(text.includes(s),'DOCX retains '+s);
  assert.ok(!pages[0].includes('Second page after explicit break')&&pages[1].includes('Second page after explicit break'),'Stored page break respected');
  assert.equal((text.match(/TOOLATLAS HEADER/g)||[]).length,2);assert.equal((text.match(/PRIVATE FOOTER/g)||[]).length,2);
 }else{
  for(const s of ['CONFIDENTIAL REPORT','Quarterly बिक्री','Actual versus target','North','South','East','125','230','80','25','30','-10','Page 1 of 1'])assert.ok(text.includes(s),'XLSX retains '+s);
  assert.ok(!text.includes('OUTSIDE PRINT AREA SECRET'),'Print-area excluded cell must stay excluded');
  const p=await d.getPage(1),v=p.getViewport({scale:1});assert.ok(v.width>v.height,'Spreadsheet landscape');
  const c=createCanvas(v.width,v.height);await p.render({canvasContext:c.getContext('2d'),viewport:v}).promise;const pix=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let blue=0,red=0;
  for(let y=Math.floor(v.height*.30);y<v.height*.70;y++)for(let x=Math.floor(v.width*.08);x<v.width*.56;x++){const k=(y*c.width+x)*4,r=pix[k],g=pix[k+1],b=pix[k+2];if(b>r*1.3&&b>g*1.1)blue++;if(r>g*1.3&&r>b*1.2)red++;}
  assert.ok(blue>500&&red>500,'Both chart series must be visibly painted, not just labels');
 }
 return {pages:d.numPages,text};
 }finally{await d.destroy();}
}
