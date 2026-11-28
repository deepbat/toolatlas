import{chromium}from'@playwright/test';import{spawn}from'node:child_process';import assert from'node:assert/strict';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4194','--strictPort'],{stdio:'ignore'});let browser;
try{
 for(let i=0;i<80;i++){try{await fetch('http://127.0.0.1:4194/toolatlas/');break;}catch{await new Promise(r=>setTimeout(r,100));}}
 browser=await chromium.launch();const c=await browser.newContext(),p=await c.newPage();let remote=0;
 await c.route('https://example.invalid/**',route=>{remote++;return route.abort();});
 await p.goto('http://127.0.0.1:4194/toolatlas/office-engine/converter.html#'+'a'.repeat(64));await p.waitForFunction(()=>crossOriginIsolated&&!!navigator.serviceWorker.controller);
 const results=await p.evaluate(async()=>{
  const out=[];for(const [url,method]of [['engine.css','GET'],['../index.html','GET'],['engine.js?probe=1','GET'],['engine.js','POST'],['https://example.invalid/probe','GET']]){try{const r=await fetch(url,{method});out.push({url,status:r.status,csp:r.headers.get('content-security-policy'),coop:r.headers.get('cross-origin-opener-policy'),coep:r.headers.get('cross-origin-embedder-policy')});}catch{out.push({url,blocked:true});}}
  const worker=await new Promise(resolve=>{const w=new Worker(URL.createObjectURL(new Blob([`fetch('https://example.invalid/worker').then(()=>postMessage(false),()=>postMessage(true));`],{type:'text/javascript'})));w.onmessage=e=>{w.terminate();resolve(e.data);};setTimeout(()=>{w.terminate();resolve('timeout');},5000);});return{out,worker};
 });
 assert.equal(results.out[0].status,200);assert.equal(results.out[0].coop,'same-origin');assert.equal(results.out[0].coep,'require-corp');assert.match(results.out[0].csp,/connect-src 'self'/);for(const r of results.out.slice(1,4))assert.equal(r.status,403);assert.equal(results.out[4].blocked,true);assert.equal(results.worker,true);assert.equal(remote,0);console.log('PASS real browser isolation, same-origin path/query/method denial and page/blob-worker external fetch denial');
}finally{await browser?.close();server.kill();}
