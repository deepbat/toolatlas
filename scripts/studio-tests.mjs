import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import assert from 'node:assert/strict';
const BASE=process.env.E2E_BASE_URL||'http://127.0.0.1:4173/toolatlas';
let server;
if(!process.env.E2E_BASE_URL){server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1'],{stdio:'ignore'});for(let i=0;i<100;i++){try{if((await fetch(BASE+'/')).ok)break}catch{}await new Promise(r=>setTimeout(r,200))}}
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});
const page=await ctx.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const failures=[];let passed=0;
const test=async(n,f)=>{try{await f();passed++;console.log('PASS '+n)}catch(e){failures.push(n+': '+e.message);console.error('FAIL '+n+': '+e.message)}};
await mkdir('test-artifacts/studio',{recursive:true});
// sample files
const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica);
for(let i=1;i<=4;i++){const p=pdf.addPage([400,500]);p.drawText('Sample page '+i+' hello studio',{x:40,y:440,size:18,font})}
await writeFile('test-artifacts/studio/sample.pdf',await pdf.save());
const b64=async(type,color)=>page.evaluate(async([type,color])=>{const c=document.createElement('canvas');c.width=300;c.height=400;const g=c.getContext('2d');g.fillStyle=color;g.fillRect(0,0,300,400);g.fillStyle='#b33';g.beginPath();g.arc(150,200,80,0,7);g.fill();const b=await new Promise(r=>c.toBlob(r,type,.9));return btoa(String.fromCharCode(...new Uint8Array(await b.arrayBuffer())))},[type,color]);
await page.goto(BASE+'/');
const png=Buffer.from(await b64('image/png','#ffffff'),'base64');
const jpg0=Buffer.from(await b64('image/jpeg','#dddddd'),'base64');
// inject a minimal EXIF block with Make tag
const make=Buffer.from('TestCam\0');const tiff=Buffer.alloc(8+2+12+4+make.length);tiff.write('MM');tiff.writeUInt16BE(42,2);tiff.writeUInt32BE(8,4);tiff.writeUInt16BE(1,8);tiff.writeUInt16BE(0x010f,10);tiff.writeUInt16BE(2,12);tiff.writeUInt32BE(make.length,14);tiff.writeUInt32BE(26,18);tiff.writeUInt32BE(0,22);make.copy(tiff,26);
const app1=Buffer.concat([Buffer.from('Exif\0\0'),tiff]);const hdr=Buffer.from([0xff,0xe1,(app1.length+2)>>8,(app1.length+2)&255]);
const jpg=Buffer.concat([jpg0.subarray(0,2),hdr,app1,jpg0.subarray(2)]);
await writeFile('test-artifacts/studio/sample.png',png);await writeFile('test-artifacts/studio/sample.jpg',jpg);
async function go(id){await page.goto(BASE+'/tools/'+id+'/');await page.locator('h1').first().waitFor();await page.locator('[aria-label="Loading tool"]').waitFor({state:'hidden'})}
const upload=(f)=>page.locator('input[type=file]').first().setInputFiles(f);
const sampleP='test-artifacts/studio/sample.pdf',sampleJ='test-artifacts/studio/sample.jpg',sampleN='test-artifacts/studio/sample.png';
await test('pdf-compress produces summary',async()=>{await go('pdf-compress');await upload(sampleP);await page.getByRole('button',{name:'Compress PDF'}).click();await page.getByTestId('compress-summary').waitFor({timeout:30000});const t=await page.getByTestId('compress-summary').innerText();assert.ok(/KB|B|MB/.test(t),t)});
await test('pdf-to-images converts',async()=>{await go('pdf-to-images');await upload(sampleP);await page.getByRole('button',{name:'Convert pages'}).click();await page.getByText('4 images ready').waitFor({timeout:30000})});
await test('pdf-split makes parts',async()=>{await go('pdf-split');await upload(sampleP);await page.getByRole('button',{name:'Split PDF'}).click();await page.getByText(/files ready/).waitFor({timeout:30000})});
await test('pdf-extract-text finds text',async()=>{await go('pdf-extract-text');await upload(sampleP);await page.getByRole('button',{name:'Extract text'}).click();await page.getByText(/Sample page 1 hello studio/).first().waitFor({timeout:30000})});
await test('pdf-compare identical',async()=>{await go('pdf-compare');await upload(sampleP);await upload(sampleP);await page.getByRole('button',{name:'Compare PDFs'}).click();await page.getByTestId('compare-summary').waitFor({timeout:30000});assert.ok(/No differences/.test(await page.getByTestId('compare-summary').innerText()))});
await test('pdf rejects non-pdf with a clear message',async()=>{await go('pdf-compress');await upload(sampleN);await page.getByText(/not a PDF|PDF/i).first().waitFor();assert.ok(await page.getByRole('alert').count()>0)});
await test('bg-remove clears white background',async()=>{await go('image-bg-remove');await upload(sampleN);await page.getByRole('button',{name:'Remove background'}).click();await page.getByTestId('bg-summary').waitFor({timeout:30000});const m=(await page.getByTestId('bg-summary').innerText()).match(/(\d+)%/);assert.ok(Number(m[1])>20&&Number(m[1])<90)});
await test('upscale doubles size',async()=>{await go('image-upscale');await upload(sampleN);await page.getByRole('button',{name:'Enlarge image'}).click();await page.getByTestId('upscale-summary').waitFor({timeout:30000});assert.ok((await page.getByTestId('upscale-summary').innerText()).startsWith('600 × 800'))});
await test('bulk convert to webp',async()=>{await go('image-bulk-convert');await upload([sampleN,sampleJ]);await page.getByRole('button',{name:/Convert 2 images/}).click();await page.getByTestId('bulk-summary').waitFor({timeout:30000});await page.getByText('sample.webp').first().waitFor()});
await test('passport photo preset and download',async()=>{await go('passport-photo');await upload(sampleJ);await page.getByText(/630|413/).first().waitFor();const [d]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download single photo'}).click()]);assert.ok(d.suggestedFilename().includes('35x45'))});
await test('metadata viewer finds Make and cleans',async()=>{await go('image-metadata');await upload(sampleJ);await page.getByTestId('meta-list').waitFor();assert.ok((await page.getByTestId('meta-list').innerText()).includes('TestCam'));await page.getByRole('button',{name:/Remove metadata/}).click();await page.getByTestId('meta-after').waitFor();assert.ok(/no personal metadata remains/.test(await page.getByTestId('meta-after').innerText()))});
await test('annotate draws and exports',async()=>{await go('image-annotate');await upload(sampleN);const c=page.getByTestId('annotate-canvas');await c.waitFor();const b=await c.boundingBox();await page.mouse.move(b.x+20,b.y+20);await page.mouse.down();await page.mouse.move(b.x+120,b.y+120,{steps:5});await page.mouse.up();const [d]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download PNG'}).click()]);assert.ok(d.suggestedFilename().endsWith('.png'))});
await test('collage renders',async()=>{await go('image-collage');await upload([sampleN,sampleJ]);await page.getByTestId('collage-canvas').waitFor()});
const catalog=JSON.parse(await readFile('dist/catalog.json','utf8'));
const ids=(catalog.tools||catalog).map(t=>t.id).filter(id=>/^(pdf-(compress|to-images|background|compare|split|extract-text|form-filler)|image-(bg-remove|upscale|bulk-convert|collage|annotate|metadata)|passport-photo)$/.test(id));
for(const w of [360,390])await test('no horizontal overflow at '+w+'px for '+ids.length+' studio tools',async()=>{const p=await ctx.newPage();await p.setViewportSize({width:w,height:800});for(const id of ids){await p.goto(BASE+'/tools/'+id+'/');await p.locator('h1').first().waitFor();await p.locator('[aria-label="Loading tool"]').waitFor({state:'hidden'});const over=await p.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);assert.ok(over<=1,id+' overflows by '+over)}await p.close()});
await test('no page errors',async()=>assert.deepEqual(errors,[]));
await browser.close();server?.kill();
console.log(`${passed} passed, ${failures.length} failed`);
if(failures.length){console.error(failures.join('\n'));process.exit(1)}
