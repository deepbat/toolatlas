import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.E2E_BASE_URL||'http://127.0.0.1:4173/toolatlas';let server;
if(!process.env.E2E_BASE_URL){server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1'],{stdio:'ignore'});for(let i=0;i<100;i++){try{if((await fetch(base+'/')).ok)break}catch{}await new Promise(r=>setTimeout(r,100));}}
const browser=await chromium.launch();await mkdir('test-artifacts/directory',{recursive:true});let n=0;
try{const html=await(await fetch(base+'/')).text();assert.ok(html.includes('Pick your tools.')&&html.includes('Choose a tool category'));for(const id of ['pdf','image','video','audio','category/calculators'])assert.ok(html.includes('/toolatlas/'+id+'/'));console.log('PASS category-first static HTML before JavaScript');n++;for(const [width,height] of [[360,740],[393,740],[412,740],[820,900],[1280,720],[1440,800]]){
const page=await browser.newPage({viewport:{width,height}});await page.goto(base+'/');await page.locator('[data-directory-category]').last().waitFor();await page.evaluate(()=>document.fonts.ready);
const boxes=await page.locator('[data-directory-category]').evaluateAll(els=>els.map(el=>({id:el.dataset.directoryCategory,top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom,width:el.getBoundingClientRect().width})));
assert.equal(boxes.length,11);for(const b of boxes){assert.ok(b.width>=56,`${width} ${b.id} rail too narrow: ${b.width}`);}
const browserBox=await page.locator('[data-app-browser]').evaluate(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom};});
assert.ok(browserBox.top>=0&&browserBox.bottom<height,`${width} app browser off first screen: ${browserBox.bottom}`);
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.getByRole('searchbox').count();
for(const id of ['pdf','image','calculators','audio','video']){const a=page.locator(`[data-directory-category=${id}]`);assert.ok(await a.isVisible());}
await page.screenshot({path:`test-artifacts/directory/home-${width}.png`});
await page.locator('[data-directory-category=calculators]').click();await page.getByRole('heading',{name:'Calculators',exact:true}).waitFor();await page.goBack();await page.locator('[data-directory-category=video]').click();await page.getByRole('heading',{name:'Video Tools',exact:true}).waitFor();
await page.close();console.log('PASS first screen + navigation '+width+'x'+height);n++;}
}finally{await browser.close();server?.kill();}console.log(`${n} directory checks passed`);
