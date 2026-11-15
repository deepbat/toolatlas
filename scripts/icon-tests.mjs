import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.E2E_BASE_URL||'http://127.0.0.1:4173/toolatlas';let server;
if(!process.env.E2E_BASE_URL){server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1'],{stdio:'ignore'});for(let i=0;i<100;i++){try{if((await fetch(base+'/')).ok)break}catch{}await new Promise(r=>setTimeout(r,100));}}
const browser=await chromium.launch();await mkdir('test-artifacts/icons',{recursive:true});let n=0;
const entries=['pdf','image','calculators','video','audio','text','converter','finance','device','web','utilities'];
const headings={pdf:'PDF Tools',image:'Image Tools',calculators:'Calculators',video:'Video Tools',audio:'Audio Tools',text:'Text Tools',converter:'File Conversion',finance:'Financial Tools',device:'Device & Sensor Tools',web:'Web Tools',utilities:'Other Utilities'};
try{
const page=await browser.newPage({viewport:{width:393,height:852}});
// 1. Hero: category pills plus the masonry wall are the first screen.
await page.goto(base+'/');
await page.locator('[data-tool-wall]').waitFor();
assert.equal(await page.locator('[data-directory-category]').count(),12,'pills show All + 11 categories');
await page.getByRole('heading',{name:'All tools',exact:true}).waitFor();
const chipsBox=await page.locator('.wall-chips').evaluate(el=>el.getBoundingClientRect());
const wallBox=await page.locator('[data-tool-wall]').evaluate(el=>el.getBoundingClientRect());
assert.ok(chipsBox.bottom<852,'category pills fit the first phone screen');
assert.ok(wallBox.top<852,'tool wall starts on the first phone screen');
console.log('PASS bento wall hero layout on phone');n++;
// 2. Every card in every category shows a pictorial glyph; glyphs are unique across all 142 tools.
const seen=new Map();
for(const id of entries){
  await page.goto(base+'/?browse='+id);
  await page.getByRole('heading',{name:headings[id],exact:true}).waitFor();
  const tiles=await page.locator('[data-tool-wall] a[href*="/tools/"]').evaluateAll(els=>els.map(a=>({href:a.getAttribute('href'),glyph:a.querySelector('[data-wall-glyph]')?.getAttribute('data-wall-glyph')??'',label:a.textContent})));
  assert.ok(tiles.length>0,id+' has cards');
  for(const t of tiles){assert.ok(t.glyph&&t.glyph.trim().length>0,`${id} card ${t.href} has a glyph`);assert.ok(!seen.has(t.glyph),`duplicate glyph ${t.glyph} on ${t.href} and ${seen.get(t.glyph)}`);seen.set(t.glyph,t.href);}
}
assert.equal(seen.size,142,'142 unique pictorial glyphs across the atlas');
console.log('PASS 142 unique pictorial tool glyphs across all categories');n++;
// 3. Selection is deep-linkable and updates the wall heading.
await page.goto(base+'/?browse=device');
await page.getByRole('heading',{name:'Device & Sensor Tools',exact:true}).waitFor();
assert.ok(await page.locator('[data-tool-wall] a[href*="/tools/metronome"]').isVisible());
await page.screenshot({path:'test-artifacts/icons/home-device-393.png'});
console.log('PASS deep-linked category selection');n++;
// 4. Tool page header carries the same pictorial glyph.
await page.goto(base+'/tools/metronome/');
await page.locator('h1').waitFor();
const headerGlyph=await page.locator('h1').evaluate(h=>h.closest('header')?.textContent??'');
assert.ok(headerGlyph.includes('🥁'),'metronome header shows its glyph');
console.log('PASS tool page glyph');n++;
// 5. Category page uses pictorial chips.
await page.goto(base+'/category/device/');
await page.locator('h1').waitFor();
const cards=await page.locator('main a[href*="/tools/"] span.rounded-xl, main a[href*="/tools/"] span.rounded-2xl, main a[href*="/tools/"] span.rounded-\\[14px\\]').count();
assert.equal(cards,11,'category page shows all 11 remaining device pictorial chips');
await page.screenshot({path:'test-artifacts/icons/category-device-393.png'});
console.log('PASS category page pictorial chips');n++;
// 6. Desktop and phone hero screenshots.
for(const [width,height] of [[393,852],[1280,900]]){
  await page.setViewportSize({width,height});
  await page.goto(base+'/');
  await page.locator('[data-tool-wall]').waitFor();
  await page.evaluate(()=>document.fonts.ready);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow at '+width);
  await page.waitForTimeout(750);
  await page.screenshot({path:`test-artifacts/icons/home-${width}.png`});
}
console.log('PASS hero screenshots phone + desktop');n++;
await page.close();
}finally{await browser.close();server?.kill();}
console.log(`${n} icon browser checks passed`);
