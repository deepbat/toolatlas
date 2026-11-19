// Audio and video tools were retired in the Nov 2026 curated redesign (30 tools).
// These checks lock in that retirement: the media sections show their
// coming-soon state and retired media routes render the not-found page.
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const BASE=process.env.E2E_BASE_URL||'http://127.0.0.1:4173/toolatlas';
let server;if(!process.env.E2E_BASE_URL){server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1'],{stdio:'ignore'});for(let i=0;i<100;i++){try{if((await fetch(BASE+'/')).ok)break}catch{}await new Promise(r=>setTimeout(r,100));}}
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:800}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await mkdir('test-artifacts/av',{recursive:true});
let count=0;const failures=[];
const test=async(name,f)=>{try{await f();count++;console.log('PASS '+name);}catch(e){failures.push(name+': '+e.message);console.error('FAIL '+name+': '+e.message);}};
try{
await test('video and audio sections show the coming-soon state',async()=>{
  for(const section of ['video','audio']){
    await page.goto(BASE+'/'+section+'/');
    await page.locator('h1').waitFor();
    const text=await page.locator('main').innerText();
    assert.ok(/coming soon|future release|No tools/i.test(text),section+' section must not list retired tools: '+text.slice(0,120));
    assert.ok(!text.includes('Video Compressor')&&!text.includes('Audio Converter'),section+' still lists retired tools');
  }
});
await test('web section is also empty after the redesign',async()=>{
  await page.goto(BASE+'/web/');
  await page.locator('h1').waitFor();
  const text=await page.locator('main').innerText();
  assert.ok(/coming soon|future release|No tools/i.test(text),'web section must not list retired tools');
});
await test('retired media tool routes render the not-found page',async()=>{
  for(const id of ['audio-convert','video-compress','video-trim']){
    await page.goto(BASE+'/tools/'+id+'/');
    await page.locator('h1').first().waitFor();
    const text=await page.locator('main').innerText();
    assert.ok(/not found|does not exist|404/i.test(text),id+' should be a 404 page, got: '+text.slice(0,100));
  }
});
await test('curated catalogue has no audio or video tools',async()=>{
  const catalog=await(await fetch(BASE+'/catalog.json')).json();
  const media=(catalog.tools||catalog).filter(t=>['audio','video'].includes(t.category));
  assert.equal(media.length,0,JSON.stringify(media.map(t=>t.id)));
});
await test('no uncaught errors',()=>assert.deepEqual(errors,[]));
}finally{await browser.close();server?.kill();}
console.log(`${count} passed, ${failures.length} failed`);if(failures.length)process.exitCode=1;
