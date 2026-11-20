// Pictorial glyph checks for the Nov 2026 curated redesign: every tool keeps a
// unique pictorial glyph (data-level uniqueness is asserted by glyph-unit.ts);
// these browser checks cover glyph rendering on tool, category and browse pages.
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdir, readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.E2E_BASE_URL||'http://127.0.0.1:4173/toolatlas';let server;
if(!process.env.E2E_BASE_URL){server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1'],{stdio:'ignore'});for(let i=0;i<100;i++){try{if((await fetch(base+'/')).ok)break}catch{}await new Promise(r=>setTimeout(r,100));}}
const browser=await chromium.launch();await mkdir('test-artifacts/icons',{recursive:true});let n=0;
try{
const page=await browser.newPage({viewport:{width:393,height:852}});
// 1. Tool page header carries the tool's pictorial glyph.
await page.goto(base+'/tools/upi-qr/');
await page.locator('h1').waitFor();
const headerText=await page.locator('h1').evaluate(h=>(h.closest('header')||h.parentElement).textContent);
assert.ok(headerText.includes('🇮🇳'),'upi-qr header shows its glyph');
console.log('PASS tool page glyph');n++;
// 2. Every curated tool page header shows a non-empty glyph.
const catalog=JSON.parse(await readFile('dist/catalog.json','utf8'));
for(const t of (catalog.tools||catalog)){
  await page.goto(base+'/tools/'+t.id+'/');
  await page.locator('h1').waitFor();
  const text=await page.locator('h1').evaluate(h=>(h.closest('header')||h.parentElement).textContent);
  assert.ok(/[\u20B9\u2190-\u2BFF\u{1F000}-\u{1FAFF}\u{FE0F}]/u.test(text),t.id+' header has no pictorial glyph');
}
console.log('PASS all 33 tool pages show their glyph');n++;
// 3. Category and browse pages render pictorial cards for curated tools.
await page.goto(base+'/category/generators/');
await page.locator('h1').waitFor();
const genCards=await page.locator('main a[href*="/tools/"]').count();
assert.ok(genCards>=2,'generators category shows curated cards: '+genCards);
await page.screenshot({path:'test-artifacts/icons/category-generators-393.png'});
await page.goto(base+'/tools/');
await page.locator('h1').waitFor();
const browseCards=await page.locator('main a[href*="/tools/"]').count();
assert.equal(browseCards,33,'browse page lists all 33 curated tools');
console.log('PASS category + browse pictorial cards');n++;
// 4. Phone and desktop hero screenshots of the new curated homepage.
for(const [width,height] of [[393,852],[1280,900]]){
  await page.setViewportSize({width,height});
  await page.goto(base+'/');
  await page.getByRole('heading',{name:'Rare, private tools for real-world jobs.',exact:true}).waitFor();
  await page.evaluate(()=>document.fonts.ready);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow at '+width);
  await page.waitForTimeout(500);
  await page.screenshot({path:`test-artifacts/icons/home-${width}.png`});
}
console.log('PASS hero screenshots phone + desktop');n++;
await page.close();
}finally{await browser.close();server?.kill();}
console.log(`${n} icon browser checks passed`);
