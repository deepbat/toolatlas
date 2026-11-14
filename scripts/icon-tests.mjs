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
// 1. Hero app browser: rail + pictorial grid are the first screen.
await page.goto(base+'/');
await page.locator('[data-app-browser]').waitFor();
assert.equal(await page.locator('[data-directory-category]').count(),11,'rail shows 11 categories');
await page.getByRole('heading',{name:'PDF Tools',exact:true}).waitFor();
const railBox=await page.locator('[data-directory-category=pdf]').evaluate(el=>el.getBoundingClientRect());
const gridBox=await page.locator('[data-app-browser] section').evaluate(el=>el.getBoundingClientRect());
assert.ok(railBox.left<gridBox.left,'rail sits left of the grid');
assert.ok(gridBox.bottom<852,'app browser fits the first phone screen');
console.log('PASS app browser hero layout on phone');n++;
// 2. Every tile in every category shows a pictorial glyph; glyphs are unique across all 155 tools.
const seen=new Map();
for(const id of entries){
  await page.goto(id==='pdf'?base+'/':base+'/?browse='+id);
  await page.getByRole('heading',{name:headings[id],exact:true}).waitFor();
  const tiles=await page.locator('[data-app-browser] section a[href*="/tools/"]').evaluateAll(els=>els.map(a=>({href:a.getAttribute('href'),glyph:a.querySelector('span span')?.textContent??'',label:a.textContent})));
  assert.ok(tiles.length>0,id+' has tiles');
  for(const t of tiles){assert.ok(t.glyph&&t.glyph.trim().length>0,`${id} tile ${t.href} has a glyph`);assert.ok(!seen.has(t.glyph),`duplicate glyph ${t.glyph} on ${t.href} and ${seen.get(t.glyph)}`);seen.set(t.glyph,t.href);}
}
assert.equal(seen.size,155,'155 unique pictorial glyphs across the atlas');
console.log('PASS 155 unique pictorial tool glyphs across all rail categories');n++;
// 3. Selection is deep-linkable and updates the panel heading.
await page.goto(base+'/?browse=device');
await page.getByRole('heading',{name:'Device & Sensor Tools',exact:true}).waitFor();
assert.ok(await page.locator('[data-app-browser] section a[href*="/tools/metronome"]').isVisible());
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
const cards=await page.locator('main a[href*="/tools/"] span.rounded-xl, main a[href*="/tools/"] span.rounded-2xl').count();
assert.ok(cards>=13,'category page shows pictorial chips');
await page.screenshot({path:'test-artifacts/icons/category-device-393.png'});
console.log('PASS category page pictorial chips');n++;
// 6. Desktop and phone hero screenshots.
for(const [width,height] of [[393,852],[1280,900]]){
  await page.setViewportSize({width,height});
  await page.goto(base+'/');
  await page.locator('[data-app-browser]').waitFor();
  await page.evaluate(()=>document.fonts.ready);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow at '+width);
  await page.screenshot({path:`test-artifacts/icons/home-${width}.png`});
}
console.log('PASS hero screenshots phone + desktop');n++;
await page.close();
}finally{await browser.close();server?.kill();}
console.log(`${n} icon browser checks passed`);
