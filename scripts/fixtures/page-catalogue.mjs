import {PDFArray,PDFDict,PDFDocument,PDFHexString,PDFName,PDFString,StandardFonts,degrees,rgb} from 'pdf-lib';
import assert from 'node:assert/strict';
const N=PDFName.of;
export async function makeCatalogueFixture(label='Donor',fontName=StandardFonts.Helvetica){
 const d=await PDFDocument.create(),font=await d.embedFont(fontName);d.setTitle('Catalogue '+label);d.setAuthor(label);
 for(let i=0;i<3;i++){const p=d.addPage([400,500]);p.setCropBox(40,60,300,380);p.setRotation(degrees(i===1?90:0));p.drawText(label+' PAGE '+(i+1),{x:65,y:340,font,size:16});p.drawRectangle({x:70,y:120,width:120,height:50,color:rgb(.1,.5,.8)});}
 const form=d.getForm(),customer=form.createTextField('customer');customer.setText(label+' Alice');customer.addToPage(d.getPage(0),{x:65,y:210,width:180,height:28});customer.updateAppearances(font);
 const cb=form.createCheckBox('approved');cb.addToPage(d.getPage(0),{x:260,y:210,width:20,height:20});cb.check();
 const radio=form.createRadioGroup('choice');radio.addOptionToPage('Yes',d.getPage(1),{x:65,y:170,width:18,height:18});radio.addOptionToPage('No',d.getPage(1),{x:110,y:170,width:18,height:18});radio.select('Yes');
 const nested=form.createTextField('person.name');nested.setText(label+' nested');nested.addToPage(d.getPage(1),{x:65,y:210,width:180,height:28});nested.updateAppearances(font);
 const shared=form.createTextField('shared');shared.setText(label+' shared');for(const i of [0,1])shared.addToPage(d.getPage(i),{x:65,y:260,width:180,height:28});shared.updateAppearances(font);
 const secret=form.createTextField('omittedSecret');secret.setText('OMITTED_SECRET_'+label);secret.addToPage(d.getPage(2),{x:65,y:210,width:180,height:28});
 const link=(page,dict)=>{const ref=d.context.register(d.context.obj({Type:'Annot',Subtype:'Link',Rect:[65,340,260,360],Border:[0,0,0],...dict}));d.getPage(page).node.addAnnot(ref);};
 link(1,{A:{Type:'Action',S:'URI',URI:PDFString.of('https://example.com/')}});
 link(0,{Dest:[d.getPage(1).ref,'Fit']});link(1,{A:{Type:'Action',S:'GoTo',D:PDFString.of('target')}});link(1,{Dest:[d.getPage(2).ref,'Fit']});
 const names=d.context.obj({Dests:{Names:[PDFString.of('target'),[d.getPage(0).ref,'Fit']],}});d.catalog.set(N('Names'),names);
 const outline=d.context.register(d.context.obj({Type:'Outlines'}));let prev;
 const entries=[['Second page',[d.getPage(1).ref,'Fit']],['Named first',PDFString.of('target')],['Secret page',[d.getPage(2).ref,'Fit']]];
 for(const [title,dest] of entries){const item=d.context.register(d.context.obj({Title:PDFString.of(label+' '+title),Parent:outline,Dest:dest}));if(prev){d.context.lookup(prev,PDFDict).set(N('Next'),item);d.context.lookup(item,PDFDict).set(N('Prev'),prev);}else d.context.lookup(outline,PDFDict).set(N('First'),item);prev=item;}
 const root=d.context.lookup(outline,PDFDict);root.set(N('Last'),prev);root.set(N('Count'),d.context.obj(3));d.catalog.set(N('Outlines'),outline);
 await d.attach(new Uint8Array([65,66,67,label.charCodeAt(0)]),'fixture.txt',{mimeType:'text/plain'});
 return Buffer.from(await d.save({useObjectStreams:false}));
}
export async function checkCatalogueOutput(sources,output,expected,{fields,attachments,omitSecret=false,bookmarks,bookmarkPages}={}){
 const d=await PDFDocument.load(output);assert.equal(d.getPageCount(),expected.length);
 const names=d.getForm().getFields().map(f=>f.getName());if(fields)assert.deepEqual(names.sort(),[...fields].sort());assert.equal(new Set(names).size,names.length,'Duplicate field names');
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),{createCanvas}=await import('@napi-rs/canvas');
 const docs=await Promise.all(sources.map(b=>pdfjs.getDocument({data:new Uint8Array(b),useSystemFonts:true}).promise)),out=await pdfjs.getDocument({data:new Uint8Array(output),useSystemFonts:true}).promise;
 const destPage=async dest=>{if(typeof dest==='string')dest=await out.getDestination(dest);assert.ok(dest,'Missing named destination');return out.getPageIndex(dest[0]);};
 try{
  for(let i=0;i<expected.length;i++){
   const [source,index]=expected[i],a=await docs[source].getPage(index+1),b=await out.getPage(i+1);
   assert.deepEqual(b.view,a.view);assert.equal(b.rotate,a.rotate);
   const render=async page=>{const v=page.getViewport({scale:1}),c=createCanvas(v.width,v.height);await page.render({canvasContext:c.getContext('2d'),viewport:v}).promise;return c.getContext('2d').getImageData(0,0,c.width,c.height).data;};
   assert.deepEqual(await render(b),await render(a),'Changed visible page '+(i+1));
   const anns=await b.getAnnotations();
   for(const ann of anns){if(ann.dest){const n=await destPage(ann.dest);assert.ok(n>=0&&n<expected.length);const sourcePage=expected[n];assert.equal(sourcePage[0],source,'Internal link crossed donor documents');if(typeof ann.dest==='string')assert.equal(sourcePage[1],0,'Named destination target changed');}if(ann.subtype==='Widget')assert.ok(ann.fieldName,'Orphaned widget');}
  }
  const attached=await out.getAttachments()??{};if(attachments!==undefined)assert.equal(Object.keys(attached).length,attachments);
  for(const a of Object.values(attached))assert.deepEqual(Array.from(a.content).slice(0,3),[65,66,67]);
  const outlines=await out.getOutline()??[];if(bookmarks!==undefined)assert.equal(outlines.length,bookmarks);
  for(let i=0;i<outlines.length;i++){const item=outlines[i];if(item.dest){const n=await destPage(item.dest);assert.ok(n>=0&&n<expected.length);if(bookmarkPages)assert.equal(n,bookmarkPages[i],'Bookmark target moved');}}
  if(omitSecret){assert.ok(!names.some(n=>n.includes('omittedSecret')));for(const [,obj]of d.context.enumerateIndirectObjects()){const value=obj instanceof PDFString||obj instanceof PDFHexString?obj.decodeText():obj.toString();assert.ok(!value.includes('OMITTED_SECRET_'),'Orphaned excluded field value');}}
  // Editing one donor or duplicated-page field must not change another field.
  const textFields=d.getForm().getFields().filter(f=>f.constructor.name==='PDFTextField');const values=textFields.map(f=>f.getText());
  if(textFields.length){textFields[0].setText('Independent edit');const saved=await PDFDocument.load(await d.save());assert.equal(saved.getForm().getTextField(textFields[0].getName()).getText(),'Independent edit');for(let i=1;i<textFields.length;i++)assert.equal(saved.getForm().getTextField(textFields[i].getName()).getText(),values[i]);}
 }finally{await out.destroy();for(const doc of docs)await doc.destroy();}
 return {fields:names};
}
