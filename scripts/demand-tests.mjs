// Smoke checks for the eight uncommon tools added in the Nov 2026 curated
// redesign, plus a full-catalogue load check. Run: npm run build && npm run test:demand
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdir, readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.E2E_BASE_URL||'http://127.0.0.1:4173/toolatlas';let server;
if(!process.env.E2E_BASE_URL){server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1'],{stdio:'ignore'});for(let i=0;i<100;i++){try{if((await fetch(base+'/')).ok)break}catch{}await new Promise(r=>setTimeout(r,100));}}
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:393,height:800}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await mkdir('test-artifacts/demand',{recursive:true});let n=0;
async function go(id){await page.goto(base+'/tools/'+id+'/');await page.locator('h1').first().waitFor();await page.locator('[aria-label="Loading tool"]').waitFor({state:'hidden'}).catch(()=>{});}
const UNCOMMON={
 'doc-flatten-print':'Phone-Scan A4 Prepper',
 'pdf-redaction-verify':'True PDF Redactor',
 'cheque-overlay':'Bank Cheque Print Alignment',
 'screenshot-mockup':'Screenshot Frame & Redact',
 'subscription-burn':'Silent Drain Calculator',
 'wifi-poster':'Guest Wi-Fi Printable Card',
 'image-ocr':'Copy Text from Picture (OCR)',
 'file-converter':'Local File Converter',
};
try{
for(const [id,name] of Object.entries(UNCOMMON)){
  await go(id);
  await page.getByRole('heading',{name,exact:true,level:1}).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),id+' overflows at 393px');
  await page.screenshot({path:'test-artifacts/demand/'+id+'-393.png'});
  console.log('PASS '+id+' renders and fits phone');n++;
}
// Static prerender carries each new tool's SEO shell.
for(const [id,name] of Object.entries(UNCOMMON)){
  const html=await(await fetch(base+'/tools/'+id+'/')).text();
  assert.ok(html.includes('<title>'+name.replace(/&/g,'&amp;')+" | Deepak's Tool</title>"),id+' static title');
  assert.ok(html.includes('WebApplication'),id+' schema');
}
console.log('PASS uncommon tools have static SEO shells');n++;
// Every catalogued tool page loads with a non-empty heading and no overflow.
const catalog=JSON.parse(await readFile('dist/catalog.json','utf8'));
const all=(catalog.tools||catalog).map(t=>t.id);
assert.equal(all.length ,26,'catalogue holds exactly the 26 curated tools');
for(const id of all){
  await go(id);
  const h1=await page.locator('h1').first().innerText();
  assert.ok(h1.trim().length>0,id+' has an empty heading');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),id+' overflows at 393px');
}
console.log('PASS all 26 curated tools load on a phone viewport');n++;
// The homepage workbench routes a dropped PDF to the new redactor.
await page.goto(base+'/');
await page.locator('input[type=file]').first().setInputFiles({name:'doc.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 minimal')});
await page.getByRole('button',{name:'True PDF Redactor',exact:true}).waitFor();
console.log('PASS workbench offers the redactor for a dropped PDF');n++;
assert.deepEqual(errors,[]);console.log('PASS no uncaught errors');n++;
}finally{await browser.close();server?.kill();}console.log(`${n} demand checks passed`);
