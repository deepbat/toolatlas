// Homepage checks for the Nov 2026 curated redesign: the drop-first workbench
// and the four curated drawers are the hero on every screen size.
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.E2E_BASE_URL||'http://127.0.0.1:4173/toolatlas';let server;
if(!process.env.E2E_BASE_URL){server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1'],{stdio:'ignore'});for(let i=0;i<100;i++){try{if((await fetch(base+'/')).ok)break}catch{}await new Promise(r=>setTimeout(r,100));}}
const browser=await chromium.launch();await mkdir('test-artifacts/directory',{recursive:true});let n=0;
const DRAWERS=['Portal & Print','Privacy Shield & Local Files','India Desk','Clever Studio'];
try{
// 1. Static HTML carries the new hero before JavaScript runs.
const html=await(await fetch(base+'/')).text();
assert.ok(html.includes('Rare, private tools for real-world jobs.'),'static hero headline');
assert.ok(html.includes('26 curated tools'),'static curated count');
for(const id of ['tools','pdf','image','category/finance','utilities'])assert.ok(html.includes('/toolatlas/'+id+'/'),'static nav link '+id);
assert.ok(!html.includes('One toolbox for every small job.'),'old hero is gone');
console.log('PASS curated static HTML before JavaScript');n++;
// 2. The hero (headline, workbench, drawers) lands on the first screen at every size.
for(const [width,height] of [[360,740],[393,740],[412,740],[820,900],[1280,720],[1440,800]]){
  const page=await browser.newPage({viewport:{width,height}});
  await page.goto(base+'/');
  await page.getByRole('heading',{name:'Rare, private tools for real-world jobs.',exact:true}).waitFor();
  await page.evaluate(()=>document.fonts.ready);
  assert.ok(await page.getByText('26 curated tools').first().isVisible(),'telemetry pill visible at '+width);
  assert.ok(await page.getByText('Drop a PDF, photo, or CSV here').isVisible(),'workbench visible at '+width);
  const heroBottom=await page.getByText('Drop a PDF, photo, or CSV here').evaluate(el=>el.getBoundingClientRect().bottom);
  assert.ok(heroBottom<=height+1,width+': workbench sits on the first screen: '+heroBottom);
  for(const d of DRAWERS)await page.getByRole('heading',{name:d,exact:true}).waitFor();
  const firstDrawerTop=await page.getByRole('heading',{name:DRAWERS[0],exact:true}).evaluate(el=>el.getBoundingClientRect().top);
  assert.ok(firstDrawerTop<height*1.6,width+': first drawer near first screen: '+firstDrawerTop);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),width+' overflow');
  await page.screenshot({path:`test-artifacts/directory/home-${width}.png`});
  await page.close();
  console.log('PASS hero + drawers first screen '+width+'x'+height);n++;
}
// 3. The instant filter narrows the drawers by job keyword.
{const page=await browser.newPage({viewport:{width:393,height:740}});
await page.goto(base+'/');
await page.getByLabel('Filter curated tools').fill('cheque');
await page.locator('a[href*="/tools/cheque-overlay/"]').first().waitFor();
const chequeHrefs=await page.locator('main a[href*="/tools/"]').evaluateAll(els=>els.map(a=>a.getAttribute('href')));assert.ok(chequeHrefs.some(h=>h.includes('cheque-overlay')),'cheque tool survives the filter');assert.ok(chequeHrefs.length<=3,'filter narrows the drawers: '+chequeHrefs);
await page.getByLabel('Filter curated tools').fill('zzqvxx');
assert.equal(await page.locator('main a[href*="/tools/"]').count(),0,'nonsense filters to nothing');
await page.getByLabel('Filter curated tools').fill('');
assert.ok((await page.locator('main a[href*="/tools/"]').count())>=26,'clear filter restores all cards');
await page.close();console.log('PASS instant job filter');n++;}
// 4. Every drawer card links to a curated tool page.
{const page=await browser.newPage({viewport:{width:1280,height:800}});
await page.goto(base+'/');
const hrefs=await page.locator('main a[href*="/tools/"]').evaluateAll(els=>els.map(a=>a.getAttribute('href')));
assert.equal(new Set(hrefs).size,26,'drawers link all 26 curated tools');
for(const href of new Set(hrefs)){const r=await page.goto(base+href.slice(href.indexOf('/tools')));assert.ok(r&&r.ok(),href+' resolves');}
await page.close();console.log('PASS all 26 drawer cards resolve');n++;}
// 5. Drawer anchor navigation jumps to the right section.
{const page=await browser.newPage({viewport:{width:1280,height:800}});
await page.goto(base+'/');
await page.locator('a[href="#drawer-india"]').click();
let top=Infinity;
for(let i=0;i<25;i++){await page.waitForTimeout(120);top=await page.getByRole('heading',{name:'India Desk',exact:true}).evaluate(el=>el.getBoundingClientRect().top);if(top<200)break;}
assert.ok(top<200,'anchor scrolls India Desk into view: '+top);
await page.close();console.log('PASS drawer anchor navigation');n++;}
}finally{await browser.close();server?.kill();}
console.log(`${n} directory checks passed`);
