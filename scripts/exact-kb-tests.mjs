import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PDFDocument, rgb } from 'pdf-lib';
import { inflateSync } from 'node:zlib';
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173/toolatlas';
let server;
if (!process.env.E2E_BASE_URL) {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1'], { stdio: 'ignore' });
  for (let i=0;i<100;i++) { try { if ((await fetch(BASE+'/')).ok) break; } catch {} await new Promise(r=>setTimeout(r,100)); }
}
await mkdir('test-artifacts/exact-kb', { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ acceptDownloads:true, viewport:{width:1280,height:1050} });
const page = await context.newPage(), errors = [], uploads = [];
page.on('pageerror', e=>errors.push(e.message));
page.on('request', r=>{ if (['POST','PUT','PATCH'].includes(r.method())) uploads.push(r.url()); });
const go = async()=>{ await page.goto(BASE+'/tools/image-target-size/'); await page.getByRole('button',{name:'Photo',exact:true}).waitFor(); };
const input = ()=>page.locator('input[type=file]').first();
const limit = ()=>page.getByLabel('Maximum size (KB)',{exact:true});
const processImage = async()=>{ await page.getByRole('button',{name:'Process image',exact:true}).click(); await page.getByTestId('exact-kb-result').waitFor({timeout:60000}); };
const download = async(name, path)=>{
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button',{name,exact:true}).click()]);
  await d.saveAs(path); return new Uint8Array(await readFile(path));
};
let passed=0;
const check = (name, ok)=>{ assert.ok(ok,name); passed++; console.log('PASS '+name); };
try {
  await go();
  const fixtures = await page.evaluate(async()=>{
    const c=document.createElement('canvas'); c.width=1600; c.height=1200; const g=c.getContext('2d');
    // A textured photo surrogate that cannot fit 20 KB without dimension fitting.
    let seed=42; const d=g.createImageData(c.width,c.height);
    for(let i=0;i<d.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;const v=seed>>>24;d.data[i]=v;d.data[i+1]=(v+80)%256;d.data[i+2]=(v+140)%256;d.data[i+3]=255;}
    g.putImageData(d,0,0);
    const data=async(type,q)=>{ const b=await new Promise(r=>c.toBlob(r,type,q)); return Array.from(new Uint8Array(await b.arrayBuffer())); };
    const photo=await data('image/jpeg',.96);
    c.width=1000;c.height=360;
    const grad=g.createLinearGradient(0,0,1000,0);grad.addColorStop(0,'#777');grad.addColorStop(1,'#eee');g.fillStyle=grad;g.fillRect(0,0,1000,360);
    g.strokeStyle='#0c203b';g.lineWidth=5;g.beginPath();g.moveTo(100,240);g.bezierCurveTo(290,10,45,355,380,140);g.bezierCurveTo(580,20,400,320,830,130);g.stroke();
    return {photo,signature:await data('image/jpeg',.96)};
  });
  const photoPath='test-artifacts/exact-kb/photo.jpg', signaturePath='test-artifacts/exact-kb/signature.jpg';
  await writeFile(photoPath,Buffer.from(fixtures.photo)); await writeFile(signaturePath,Buffer.from(fixtures.signature));
  await input().setInputFiles(photoPath); await limit().fill('20'); await processImage();
  const jpg=await download('Download image','test-artifacts/exact-kb/photo-under-20kb.jpg');
  check('photo final bytes strictly below decimal 20 KB',jpg.length<20000);
  const imageInfo=await page.getByRole('img',{name:'Processed image preview',exact:true}).evaluate(i=>({w:i.naturalWidth,h:i.naturalHeight}));
  check('photo dimensions reduced with aspect ratio preserved',imageInfo.w<1600&&Math.abs(imageInfo.w/imageInfo.h-4/3)<.01);
  await page.getByRole('button',{name:'50 KB',exact:true}).click();
  check('changed limit clears stale download and handoff',await page.getByTestId('exact-kb-result').count()===0&&await page.getByLabel('Continue with output',{exact:true}).count()===0);
  await limit().fill('0');await page.getByRole('button',{name:'Process image',exact:true}).click();await page.getByRole('alert').waitFor();
  check('invalid limits rejected',/5 to 20,000/.test(await page.getByRole('alert').innerText()));
  await limit().fill('5');await page.getByLabel('Allow smaller pixel dimensions if needed').uncheck();
  await page.getByRole('button',{name:'Process image',exact:true}).click();await page.getByRole('alert').waitFor({timeout:60000});
  check('impossible fixed-dimension target is not marked successful',await page.getByTestId('exact-kb-result').count()===0);
  await go();await page.getByRole('button',{name:'Signature cleanup',exact:true}).click();await input().setInputFiles(signaturePath);await processImage();
  const sign=await download('Download image','test-artifacts/exact-kb/signature-clean.jpg');
  check('signature strictly under 20 KB',sign.length<20000);
  const pixels=await page.getByRole('img',{name:'Processed image preview',exact:true}).evaluate(i=>{
    const c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;const g=c.getContext('2d');g.drawImage(i,0,0);const p=g.getImageData(0,0,c.width,c.height).data;let white=0,ink=0;
    for(let k=0;k<p.length;k+=4){if(p[k]>245&&p[k+1]>245&&p[k+2]>245)white++;if(p[k]<100)ink++;}return {white:white/(p.length/4),ink};
  });
  check('uneven shadow paper whitened while ink survives',pixels.white>.9&&pixels.ink>500);
  await page.getByTestId('exact-kb-result').scrollIntoViewIfNeeded();await page.screenshot({path:'test-artifacts/exact-kb/signature-desktop.png'});
  // Large image-backed PDFs ensure real raster compression, plus a simple text PDF for lossless merge.
  for(let j=0;j<2;j++){
    const doc=await PDFDocument.create(),img=await doc.embedJpg(j?sign:jpg),p=doc.addPage([400,500]);p.drawImage(img,{x:10,y:80,width:380,height:300});p.drawText('Marksheet '+(j+1),{x:30,y:450,size:20,color:rgb(.1,.1,.1)});
    await writeFile(`test-artifacts/exact-kb/marksheet-${j+1}.pdf`,await doc.save());
  }
  await go();await page.getByRole('button',{name:'Combine PDFs / images',exact:true}).click();await input().setInputFiles(['test-artifacts/exact-kb/marksheet-1.pdf','test-artifacts/exact-kb/marksheet-2.pdf']);
  await page.getByRole('button',{name:'Move file 2 up',exact:true}).click();await limit().fill('200');
  await page.getByRole('button',{name:'Combine and fit to limit',exact:true}).click();await page.getByTestId('exact-kb-result').waitFor({timeout:60000});
  const merged=await download('Download PDF','test-artifacts/exact-kb/merged.pdf'),mp=await PDFDocument.load(merged);
  check('PDF merge keeps every page under cap',mp.getPageCount()===2&&merged.length<200000);
  const content = mp.getPage(0).node.Contents();
  const firstStream = mp.context.lookup(content.get(0));
  const firstText = inflateSync(firstStream.getContents()).toString();
  check('file reorder controls change actual PDF page order',firstText.includes(Buffer.from('Marksheet 2').toString('hex').toUpperCase()));
  check('already-fitting PDF remains unrasterised',/without rasterising/.test(await page.getByTestId('exact-kb-result').innerText()));
  await limit().fill('20');await page.getByRole('button',{name:'Combine and fit to limit',exact:true}).click();await page.getByRole('alert').waitFor({timeout:60000});
  check('PDF flattening requires opt-in',/Enable page-image conversion/.test(await page.getByRole('alert').innerText()));
  await page.getByLabel('Allow PDF pages to become images if needed').check();await page.getByRole('button',{name:'Combine and fit to limit',exact:true}).click();await page.getByTestId('exact-kb-result').waitFor({timeout:120000});
  const fitted=await download('Download PDF','test-artifacts/exact-kb/merged-under-20kb.pdf');
  check('raster PDF final bytes including overhead below limit',fitted.length<20000);
  check('raster PDF preserves page count',(await PDFDocument.load(fitted)).getPageCount()===2);
  check('all output pages get review previews',await page.getByRole('img',{name:/Compressed page/}).count()===2);
  await page.getByTestId('exact-kb-result').scrollIntoViewIfNeeded();await page.screenshot({path:'test-artifacts/exact-kb/pdf-desktop.png'});
  await go();await page.getByRole('button',{name:'Combine PDFs / images',exact:true}).click();await input().setInputFiles([signaturePath,signaturePath,signaturePath]);await limit().fill('200');await page.getByRole('button',{name:'Combine and fit to limit',exact:true}).click();await page.getByTestId('exact-kb-result').waitFor({timeout:60000});
  const photosPdf=await download('Download PDF','test-artifacts/exact-kb/photos.pdf');
  check('three marksheet images become one three-page PDF',(await PDFDocument.load(photosPdf)).getPageCount()===3&&photosPdf.length<200000);
  await input().setInputFiles({name:'bad.pdf',mimeType:'application/pdf',buffer:Buffer.from('not a PDF')});await page.getByRole('button',{name:'Combine and fit to limit',exact:true}).click();await page.getByRole('alert').waitFor({timeout:60000});
  check('invalid PDF gives error not stale download',/PDF/.test(await page.getByRole('alert').innerText())&&await page.getByTestId('exact-kb-result').count()===0);
  const huge=await PDFDocument.create();for(let j=0;j<25;j++)huge.addPage();await input().setInputFiles({name:'too-many.pdf',mimeType:'application/pdf',buffer:Buffer.from(await huge.save())});await page.getByRole('button',{name:'Combine and fit to limit',exact:true}).click();await page.getByRole('alert').waitFor({timeout:60000});
  check('page limit rejects instead of dropping pages',/24 pages/.test(await page.getByRole('alert').innerText()));
  for(const width of [360,393,1280]){
    await page.setViewportSize({width,height:900});await go();await page.getByRole('button',{name:'Signature cleanup',exact:true}).click();await input().setInputFiles(signaturePath);await processImage();
    check('no horizontal overflow at '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    if(width===393){await page.screenshot({path:'test-artifacts/exact-kb/mobile-settings.png',fullPage:true});}
  }
  check('no file-upload requests',uploads.length===0);check('no uncaught browser errors',errors.length===0);
  console.log(`${passed} Exact KB checks passed`);
} finally { await browser.close();server?.kill(); }
