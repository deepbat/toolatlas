import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.E2E_BASE_URL||'http://127.0.0.1:4173/toolatlas';let server;
if(!process.env.E2E_BASE_URL){server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1'],{stdio:'ignore'});for(let i=0;i<100;i++){try{if((await fetch(base+'/')).ok)break}catch{}await new Promise(r=>setTimeout(r,100));}}
const browser=await chromium.launch();await mkdir('test-artifacts/directory',{recursive:true});let n=0;
try{const html=await(await fetch(base+'/')).text();assert.ok(html.includes('One toolbox for every small job.')&&html.includes('Choose a tool category'));for(const id of ['pdf','image','video','audio','category/calculators'])assert.ok(html.includes('/toolatlas/'+id+'/'));console.log('PASS category-first static HTML before JavaScript');n++;for(const [width,height] of [[360,740],[393,740],[412,740],[820,900],[1280,720],[1440,800]]){
const page=await browser.newPage({viewport:{width,height}});await page.goto(base+'/');await page.locator('[data-directory-category]').last().waitFor();await page.evaluate(()=>document.fonts.ready);
const pills=await page.locator('[data-directory-category]').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {id:el.dataset.directoryCategory,top:r.top,width:r.width};}));
assert.equal(pills.length,12,'12 category pills including All');for(const p of pills){assert.ok(p.width>=48,`${width} ${p.id} pill too narrow: ${p.width}`);}
// Category pills and the first row of wall cards land on the first screen.
const firstPillTop=pills[0].top;assert.ok(firstPillTop>=0&&firstPillTop<height,`${width} category pills off first screen: ${firstPillTop}`);
const wallTop=await page.locator('[data-tool-wall]').evaluate(el=>el.getBoundingClientRect().top);
assert.ok(wallTop<height,`${width} tool wall starts below first screen: ${wallTop}`);
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
for(const id of ['pdf','image','calculators','audio','video']){const a=page.locator(`[data-directory-category=${id}]`);await a.scrollIntoViewIfNeeded();assert.ok(await a.isVisible());}
await page.waitForTimeout(750);await page.screenshot({path:`test-artifacts/directory/home-${width}.png`});
await page.locator('[data-directory-category=calculators]').click();await page.getByRole('heading',{name:'Calculators',exact:true}).waitFor();await page.goBack();await page.locator('[data-directory-category=video]').click();await page.getByRole('heading',{name:'Video Tools',exact:true}).waitFor();
await page.close();console.log('PASS first screen + navigation '+width+'x'+height);n++;}
// The unfiltered wall reshuffles itself, pauses under the pointer and stays still under reduced motion.
{const page=await browser.newPage({viewport:{width:1280,height:800}});await page.goto(base+'/');await page.locator('[data-tool-wall] a[href*="/tools/"]').first().waitFor();
const order=()=>page.locator('[data-tool-wall] a[href*="/tools/"]').evaluateAll(els=>els.map(a=>a.getAttribute('href')));
const before=await order();await page.waitForTimeout(5600);const after=await order();
assert.notDeepEqual(after,before,'wall reshuffles on its own');assert.equal(after.length,before.length);assert.equal(after[0],before[0],'pinned card keeps the front spot');
const settled=await order();await page.hover('[data-tool-wall]');await page.waitForTimeout(4800);
assert.deepEqual(await order(),settled,'wall pauses under the pointer');await page.close();
const calm=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'});await calm.goto(base+'/');await calm.locator('[data-tool-wall] a[href*="/tools/"]').first().waitFor();
const stillBefore=await calm.locator('[data-tool-wall] a[href*="/tools/"]').evaluateAll(els=>els.map(a=>a.getAttribute('href')));await calm.waitForTimeout(5600);
const stillAfter=await calm.locator('[data-tool-wall] a[href*="/tools/"]').evaluateAll(els=>els.map(a=>a.getAttribute('href')));
assert.deepEqual(stillAfter,stillBefore,'reduced motion keeps the wall still');await calm.close();
console.log('PASS wall auto-rotation');n++;}
}finally{await browser.close();server?.kill();}console.log(`${n} directory checks passed`);
