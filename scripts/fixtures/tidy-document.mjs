import {PDFDocument,PDFName,PDFString,StandardFonts,degrees,rgb} from 'pdf-lib';import assert from 'node:assert/strict';
export async function makeTidyFixture(){
 const d=await PDFDocument.create(),f=await d.embedFont(StandardFonts.Helvetica);d.setTitle('Intact catalogue');d.setAuthor('Synthetic fixture');
 for(const angle of [0,90]){const p=d.addPage([400,500]);p.setCropBox(40,60,300,380);p.setRotation(degrees(angle));p.drawText('KEEP DOCUMENT',{x:70,y:300,font:f,size:16});p.drawRectangle({x:70,y:120,width:120,height:50,color:rgb(.1,.5,.8)});}
 const form=d.getForm(),field=form.createTextField('customer');field.setText('Alice');field.addToPage(d.getPage(0),{x:65,y:210,width:160,height:28});
 const cb=form.createCheckBox('approved');cb.addToPage(d.getPage(0),{x:260,y:210,width:20,height:20});cb.check();
 const link=d.context.register(d.context.obj({Type:'Annot',Subtype:'Link',Rect:[70,300,230,320],Border:[0,0,0],A:{Type:'Action',S:'URI',URI:PDFString.of('https://example.com/')}}));d.getPage(1).node.addAnnot(link);
 const outlines=d.context.nextRef(),item=d.context.register(d.context.obj({Title:PDFString.of('Second page'),Parent:outlines,Dest:[d.getPage(1).ref,'Fit']}));d.context.assign(outlines,d.context.obj({Type:'Outlines',First:item,Last:item,Count:1}));d.catalog.set(PDFName.of('Outlines'),outlines);
 await d.attach(new Uint8Array([65,66,67]),'fixture.txt',{mimeType:'text/plain',description:'Intact attachment'});
 return Buffer.from(await d.save({useObjectStreams:false}));
}
export async function checkTidyDocument(source,out){
 const a=await PDFDocument.load(source),b=await PDFDocument.load(out);assert.equal(b.getPageCount(),2);assert.equal(b.getTitle(),'Intact catalogue');assert.equal(b.getAuthor(),'Synthetic fixture');
 assert.equal(b.getForm().getFields().length,2);assert.equal(b.getForm().getTextField('customer').getText(),'Alice');assert.ok(b.getForm().getCheckBox('approved').isChecked());
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),{createCanvas}=await import('@napi-rs/canvas');const x=await pdfjs.getDocument({data:new Uint8Array(source),useSystemFonts:true}).promise,y=await pdfjs.getDocument({data:new Uint8Array(out),useSystemFonts:true}).promise;
 try{const outline=await y.getOutline();assert.equal(outline[0].title,'Second page');assert.equal(await y.getPageIndex(outline[0].dest[0]),1);const attached=await y.getAttachments();assert.deepEqual(Array.from(attached['fixture.txt'].content),[65,66,67]);
 for(let n=1;n<=2;n++){const ap=a.getPage(n-1),bp=b.getPage(n-1);assert.deepEqual(bp.getCropBox(),ap.getCropBox());assert.deepEqual(bp.getRotation(),ap.getRotation());
  const q=await x.getPage(n),p=await y.getPage(n);assert.ok((await p.getTextContent()).items.some(i=>i.str==='KEEP DOCUMENT'));
  if(n===2)assert.ok((await p.getAnnotations()).some(i=>i.url==='https://example.com/'));
  const render=async p=>{const v=p.getViewport({scale:1}),c=createCanvas(v.width,v.height);await p.render({canvasContext:c.getContext('2d'),viewport:v}).promise;return c.getContext('2d').getImageData(0,0,c.width,c.height).data;};assert.deepEqual(await render(q),await render(p),'Tidy changed page pixels');
 }
 // Still editable, not merely a preserved appearance.
 b.getForm().getTextField('customer').setText('Bob');const again=await PDFDocument.load(await b.save());assert.equal(again.getForm().getTextField('customer').getText(),'Bob');
 }finally{await x.destroy();await y.destroy();}
}
