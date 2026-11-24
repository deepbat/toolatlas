// Shared browser and installed-production privacy fixture. Assertions are identical.
import { PDFDocument, PDFDict, PDFName, PDFString, StandardFonts, degrees } from 'pdf-lib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

export async function verifyEditorRedaction(page, { base, evidence, check }) {
  await mkdir(evidence, { recursive: true });
  const go = async () => {
    await page.goto(base + '/tools/pdf-editor/');
    await page.locator('h1').first().waitFor();
    await page.locator('[aria-label="Loading tool"]').waitFor({ state: 'hidden' });
  };
  const drag = async (n, x1, y1, x2, y2) => {
    const box = await page.locator(`[data-testid=overlay-${n}]`).boundingBox();
    const s = box.width / 612;
    await page.mouse.move(box.x + x1 * s, box.y + y1 * s);
    await page.mouse.down();
    for (let i=1;i<=8;i++) await page.mouse.move(box.x+(x1+(x2-x1)*i/8)*s,box.y+(y1+(y2-y1)*i/8)*s);
    await page.mouse.up();
  };
  const src=await PDFDocument.create();src.setTitle('METADATA_PRIVATE_TOKEN');
  const f=await src.embedFont(StandardFonts.Helvetica);const first=src.addPage([612,792]);
  first.drawText('SECRET_COVERED_TOKEN',{x:72,y:640,size:16,font:f});
  first.drawText('VISIBLE PUBLIC',{x:72,y:700,size:16,font:f});
  first.drawText('HIDDEN_ORIGINAL_TOKEN',{x:72,y:580,size:12,font:f,opacity:0});
  const rotated=src.addPage([200,300]);rotated.setRotation(degrees(90));rotated.drawText('ROTATED_PUBLIC',{x:20,y:200,size:14,font:f});
  const link=src.context.obj({Type:'Annot',Subtype:'Link',Rect:[72,690,200,720],A:{S:'URI',URI:PDFString.of('https://example.com/private-link')}});first.node.set(PDFName.of('Annots'),src.context.obj([src.context.register(link)]));
  src.addPage([300,400]).drawText('SECOND_PAGE_TOKEN',{x:30,y:340,size:14,font:f});
  await src.attach(new TextEncoder().encode('ATTACHMENT_PRIVATE_TOKEN'),'private.txt');
  const name=src.getForm().createTextField('FORM_PRIVATE_TOKEN');name.setText('FORM_VALUE_TOKEN');name.addToPage(first,{x:72,y:500,width:180,height:25});
  await go();await page.locator('input[type=file]').setInputFiles({name:'redaction-source.pdf',mimeType:'application/pdf',buffer:Buffer.from(await src.save())});
  await page.locator('[data-testid=pdf-editor]').waitFor();
  await page.waitForFunction(()=>document.querySelector('[data-testid=page-1] canvas')?.width>100);
  await page.locator('[data-testid=tool-redact]').click();await drag(1,65,130,330,168);
  check('redaction export tradeoff visible before download',await page.getByText(/Redaction download rebuilds every page as an image/).isVisible());
  await page.screenshot({path:`${evidence}/editor-redaction-before-export.png`});
  let failedDownload=false;const onFailedDownload=()=>{failedDownload=true;};page.on('download',onFailedDownload);
  await page.evaluate(()=>{window.__redactionToBlob=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(cb){cb(null);};});
  await page.locator('[data-testid=download]').click();await page.getByText('Could not encode the redacted page. No file was saved.',{exact:true}).waitFor();
  check('redaction encoding failure never falls back to an unsafe download',!failedDownload);
  page.off('download',onFailedDownload);await page.evaluate(()=>{HTMLCanvasElement.prototype.toBlob=window.__redactionToBlob;delete window.__redactionToBlob;});
  const dl=page.waitForEvent('download',{timeout:60000});await page.locator('[data-testid=download]').click();
  const path=await(await dl).path();const bytes=await readFile(path);await writeFile(`${evidence}/editor-redacted.pdf`,bytes);
  const out=await PDFDocument.load(bytes);check('redaction preserves page count',out.getPageCount()===3);
  check('redaction bakes rotated viewport geometry',out.getPages()[1].getWidth()===300&&out.getPages()[1].getHeight()===200&&out.getPages()[1].getRotation().angle===0);
  check('redaction preserves different page dimensions',out.getPages()[2].getWidth()===300&&out.getPages()[2].getHeight()===400);
  check('redaction contains no original fonts or form objects',out.context.enumerateIndirectObjects().every(([,o])=>!(o instanceof PDFDict)||(!o.has(PDFName.of('BaseFont'))&&!o.has(PDFName.of('FT')))));
  check('redaction drops original metadata',out.getTitle()!=='METADATA_PRIVATE_TOKEN');
  check('redaction drops forms',out.getForm().getFields().length===0);
  check('redaction drops names and attachments',!out.catalog.has(PDFName.of('Names')));
  check('redaction drops original links and widgets',out.getPages().every(p=>(p.node.Annots()?.size()??0)===0));
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc=await pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false}).promise;let text='';
  for(let n=1;n<=doc.numPages;n++)text+=(await(await doc.getPage(n)).getTextContent()).items.map(i=>i.str).join('');
  check('redaction leaves no extractable text on any page',text==='');await doc.destroy();
  check('redaction completion reports raster tradeoff',await page.getByText(/Redaction rebuilt all pages as images/).isVisible());
  await page.screenshot({path:`${evidence}/editor-redaction-warning.png`});
  await go();await page.locator('input[type=file]').setInputFiles({name:'redacted.pdf',mimeType:'application/pdf',buffer:bytes});await page.locator('[data-testid=pdf-editor]').waitFor();
  await page.waitForFunction(()=>document.querySelector('[data-testid=page-1] canvas')?.width>100);
  await page.locator('[data-testid=page-1][data-rendered=true]').waitFor();
  const result=await page.locator('[data-testid=page-1] canvas').evaluate(c=>{
    const ctx=c.getContext('2d'),sx=c.width/612,sy=c.height/792;
    const px=ctx.getImageData(Math.round(80*sx),Math.round(145*sy),Math.round(240*sx),Math.round(15*sy)).data;let dark=0;for(let i=0;i<px.length;i+=4)if(px[i]<10&&px[i+1]<10&&px[i+2]<10)dark++;
    const visible=ctx.getImageData(Math.round(70*sx),Math.round(70*sy),Math.round(180*sx),Math.round(30*sy)).data;let ink=0;for(let i=0;i<visible.length;i+=4)if(visible[i]<100)ink++;
    return {dark,total:px.length/4,ink};
  });
  check('redaction pixels are opaque black',result.dark===result.total);
  check('uncovered visible content remains',result.ink>100);
  await page.screenshot({path:`${evidence}/editor-redacted-reopened.png`});
}
