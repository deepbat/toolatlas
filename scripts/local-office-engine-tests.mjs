import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=(await readFile(new URL('../public/office-engine/engine.js',import.meta.url),'utf8')).replace("import {ZetaHelperMain} from './zetaHelper.js';",'');
const bytes=new Uint8Array([1,2,3]);const hash=Buffer.from(await webcrypto.subtle.digest('SHA-256',bytes)).toString('hex');
async function harness(mode){
 const timers=new Map(),messages=[],status={textContent:''},handlers={};let id=0,starts=0,closed=false,port;
 const manifest={wasm:{bytes:3,sha256:hash,parts:[{url:'runtime/wasm-0.bin',sha256:hash}]},data:{bytes:3,sha256:hash,parts:[{url:'runtime/data-0.bin',sha256:hash}]},fonts:{hindi:hash,punjabi:hash}};
 class Helper{constructor(){context.Module={};this.thrPort=port={postMessage(){}};}start(cb){starts++;if(mode==='abort'){context.Module.onAbort();return;}if(mode==='stall')return;cb();}}
 const context=vm.createContext({console,URL,ArrayBuffer,Uint8Array,crypto:webcrypto,crossOriginIsolated:true,document:{getElementById:()=>status},location:{hash:'#'+'a'.repeat(64),href:'https://local.test/office-engine/converter.html'},sessionStorage:{removeItem(){}},BroadcastChannel:class{constructor(){context.channel=this;}postMessage(m){messages.push(m);}close(){closed=true;}},window:{addEventListener:(n,f)=>handlers[n]=f,close(){closed=true;}},setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:n=>timers.delete(n),setInterval:()=>++id,clearInterval(){},ZetaHelperMain:Helper,fetch:async url=>({ok:mode!=='manifest-fail',json:async()=>manifest,arrayBuffer:async()=>mode==='digest-mismatch'?new Uint8Array([4]).buffer:bytes.slice().buffer}),FS:{writeFile(){},readFile:()=>bytes,unlink(){}}});
 await vm.runInContext('(async()=>{'+source+'})()',context);
 const convert=()=>context.channel.onmessage({data:{type:'convert',bytes:new ArrayBuffer(1),extension:'docx'}});
 return{context,convert,timers,messages,status,handlers,get starts(){return starts;},get port(){return port;},get closed(){return closed;}};
}
for(const mode of ['manifest-fail','digest-mismatch','abort','stall','success','cancel','global-error']){
 const h=await harness(mode);await h.convert();
 if(mode==='stall'){const timer=[...h.timers.values()].find(t=>t.ms===45000);assert.ok(timer);timer.fn();}
 if(mode==='global-error'){h.handlers.error();h.handlers.unhandledrejection();}
 if(mode==='cancel'){await h.context.channel.onmessage({data:{type:'cancel'}});assert.ok(h.closed);h.port.onmessage({data:{cmd:'start'}});assert.equal(h.messages.length,0);}
 else if(mode==='success'){h.port.onmessage({data:{cmd:'start'}});assert.equal([...h.timers.values()].filter(t=>t.ms===120000).length,1);h.port.onmessage({data:{cmd:'converted',from:'in',to:'out'}});assert.equal(h.messages[0].type,'converted');assert.equal([...h.timers.values()].filter(t=>t.ms===120000).length,0);}
 else{assert.equal(h.messages.length,1);assert.equal(h.messages[0].type,'failed');assert.match(h.status.textContent,/engine/);}
 console.log('PASS engine lifecycle '+mode);
}
const sw=await readFile(new URL('../public/office-engine/isolation-sw.js',import.meta.url),'utf8');const events={};let fetched=0;
vm.runInNewContext(sw,{URL,Response,Headers,self:{location:{href:'https://local.test/office-engine/isolation-sw.js'},addEventListener:(n,fn)=>events[n]=fn,skipWaiting(){},clients:{claim(){}}},fetch:async()=>{fetched++;return new Response('ok');}});
for(const [url,method,allowed]of [['https://local.test/office-engine/runtime/wasm-0.bin','GET',true],['https://local.test/private','GET',false],['https://remote.test/a','GET',false],['https://local.test/office-engine/engine.js?x=1','GET',false],['https://local.test/office-engine/engine.js','POST',false]]){
 let result;events.fetch({request:{url,method},respondWith:p=>result=p});const r=await result;assert.equal(r.status,allowed?200:403);if(allowed){assert.equal(r.headers.get('Cross-Origin-Embedder-Policy'),'require-corp');assert.match(r.headers.get('Content-Security-Policy'),/connect-src 'self'/);}
}
assert.equal(fetched,1);console.log('PASS isolation allowlist and response policy');
