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
// The unfiltered wall is a slow continuous marquee: columns drift nonstop, neighbouring columns in opposite directions.
{const page=await browser.newPage({viewport:{width:1280,height:800}});await page.goto(base+'/');await page.locator('[data-wall-track]').first().waitFor();await page.waitForTimeout(1200);
const y=()=>page.locator('[data-wall-track]').evaluateAll(els=>els.map(el=>new DOMMatrix(getComputedStyle(el).transform).f));
const first=await page.locator('[data-tool-wall] a[href*="/tools/"]').first().getAttribute('href');assert.ok(first.includes('pvc-card-maker'),'pinned card keeps the front spot: '+first);
const cols=(await y()).length;assert.ok(cols>=4,'desktop shows several marquee columns: '+cols);
assert.equal(await page.locator('[data-wall-copy]').count(),cols*2,'each column renders two seamless copies');
assert.equal(await page.locator('[data-wall-copy][aria-hidden=true] a').first().getAttribute('tabindex'),'-1','duplicate copy links leave the tab order');
const a=await y();await page.waitForTimeout(4200);const b=await y();
const deltas=a.map((v,i)=>b[i]-v);for(const d of deltas)assert.ok(Math.abs(d)>20,'every column drifts continuously: '+deltas);
for(let i=1;i<deltas.length;i++)assert.ok(Math.sign(deltas[i])!==Math.sign(deltas[i-1]),'adjacent columns drift in opposite directions: '+deltas);
// A mouse hover pauses the drift so a card can be clicked.
await page.hover('[data-tool-wall]');const e1=await y();await page.waitForTimeout(2600);const e2=await y();
assert.ok(e2.every((v,i)=>Math.abs(v-e1[i])<2),'mouse hover pauses the marquee');
await page.close();console.log('PASS wall marquee');n++;}
// On a phone a tap leaves a sticky hover and transient focus on the wall; the marquee must drift on regardless.
{const page=await browser.newPage({viewport:{width:393,height:740},hasTouch:true,isMobile:true});await page.goto(base+'/');await page.locator('[data-wall-track]').first().waitFor();await page.waitForTimeout(1200);
const y=()=>page.locator('[data-wall-track]').evaluateAll(els=>els.map(el=>new DOMMatrix(getComputedStyle(el).transform).f));
assert.equal((await y()).length,2,'phone shows two marquee columns');
assert.equal(await page.evaluate(()=>matchMedia('(pointer: coarse)').matches),true,'touch emulation reports a coarse pointer');
await page.locator('[data-tool-wall]').dispatchEvent('pointerenter',{pointerType:'touch'});
await page.locator('[data-tool-wall] a[href*="/tools/"]').first().dispatchEvent('focusin');
const a=await y();await page.waitForTimeout(3600);const b=await y();
assert.ok(b.some((v,i)=>Math.abs(v-a[i])>10),'touch hover and tap focus never freeze the marquee');
await page.locator('[data-tool-wall]').dispatchEvent('pointerleave',{pointerType:'touch'});
await page.close();
const calm=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'});await calm.goto(base+'/');await calm.locator('[data-tool-wall] a[href*="/tools/"]').first().waitFor();
assert.equal(await calm.locator('[data-wall-track]').count(),0,'reduced motion renders a static wall');
await calm.close();console.log('PASS wall marquee touch + reduced motion');n++;}
}finally{await browser.close();server?.kill();}console.log(`${n} directory checks passed`);
