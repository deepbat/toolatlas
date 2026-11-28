import {ZetaHelperMain} from './zetaHelper.js';
const status=document.getElementById('status');
const token=location.hash.slice(1);
if(!/^[a-f0-9]{64}$/.test(token))throw Error('Missing conversion session');
if(!crossOriginIsolated){
 if(sessionStorage.getItem('office-isolation-retry')){status.textContent='This browser cannot isolate the local Office engine. Close this window and use the standard converter.';throw Error('Isolation unavailable');}
 await navigator.serviceWorker.register('./isolation-sw.js',{scope:'./'});await navigator.serviceWorker.ready;
 sessionStorage.setItem('office-isolation-retry','1');location.reload();await new Promise(()=>{});
}
sessionStorage.removeItem('office-isolation-retry');
const channel=new BroadcastChannel('deepak-office-'+token);let started=false,finished=false,phaseTimer;
const phase=(message,timeout=45000)=>{status.textContent=message;clearTimeout(phaseTimer);phaseTimer=setTimeout(()=>fail('The local Office engine stopped responding. Close this window and try again.'),timeout);};
window.addEventListener('pagehide',()=>{try{channel.postMessage({type:'cancelled'});}catch{}});
const fail=message=>{if(finished)return;finished=true;clearTimeout(phaseTimer);clearInterval(ready);status.textContent=message;channel.postMessage({type:'failed',message});};
window.addEventListener('error',()=>fail('The local Office engine could not start. Your original document has not changed.'));
window.addEventListener('unhandledrejection',()=>fail('The local Office engine could not start. Your original document has not changed.'));
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
async function verified(url,sha){if(finished)throw Error('Conversion stopped');const r=await fetch(url);if(!r.ok)throw Error('Engine download failed');const b=await r.arrayBuffer();if(finished)throw Error('Conversion stopped');if(hex(await crypto.subtle.digest('SHA-256',b))!==sha)throw Error('Engine integrity check failed');return new Uint8Array(b);}
async function assemble(spec){const out=new Uint8Array(spec.bytes);let n=0;for(const part of spec.parts){const b=await verified(part.url,part.sha256);out.set(b,n);n+=b.length;}if(n!==spec.bytes||hex(await crypto.subtle.digest('SHA-256',out))!==spec.sha256)throw Error('Engine integrity check failed');return out;}
channel.onmessage=async({data})=>{
 if(data?.type==='cancel'){finished=true;clearTimeout(phaseTimer);channel.close();window.close();return;}
 if(data?.type==='received'){finished=true;clearTimeout(phaseTimer);channel.close();window.close();return;}
 if(started||data?.type!=='convert'||!(data.bytes instanceof ArrayBuffer)||!['docx','xlsx'].includes(data.extension)||data.bytes.byteLength>100*1024*1024)return;
 started=true;clearInterval(ready);clearTimeout(orphan);
 try{
  phase('Downloading and checking the local Office engine...',180000);
  const response=await fetch('runtime/manifest.json');if(!response.ok)throw Error('Engine manifest unavailable');const manifest=await response.json();
  const z=new ZetaHelperMain('office-worker.js',{threadJsType:'module',wasmPkg:'url:'+new URL('runtime/',location.href).href});
  Module.wasmBinary=await assemble(manifest.wasm);const fs=(await assemble(manifest.data)).buffer;Module.getPreloadedPackage=()=>fs;
  const hi=await verified('fonts/hindi.ttf',manifest.fonts.hindi),pa=await verified('fonts/punjabi.ttf',manifest.fonts.punjabi);
  Module.preRun=[()=>{FS.mkdirTree('/instdir/share/fonts/truetype');FS.writeFile('/instdir/share/fonts/truetype/ToolHindi.ttf',hi);FS.writeFile('/instdir/share/fonts/truetype/ToolPunjabi.ttf',pa);}];
  if(finished)return;
  Module.onAbort=()=>fail('The local Office engine could not allocate its memory or start. Your original document has not changed.');
  phase('Starting the local Office engine...');
  z.start(()=>{if(finished)return;phase('Starting the document converter...');z.thrPort.onmessage=({data:msg})=>{if(finished)return;
   if(msg.cmd==='start'){phase('Converting your document locally...',120000);const from='/tmp/input.'+data.extension;FS.writeFile(from,new Uint8Array(data.bytes));z.thrPort.postMessage({cmd:'convert',from,to:'/tmp/output.pdf',name:'output'});}
   else if(msg.cmd==='converted'){clearTimeout(phaseTimer);const output=FS.readFile(msg.to);finished=true;channel.postMessage({type:'converted',bytes:output.slice().buffer});FS.unlink(msg.from);FS.unlink(msg.to);status.textContent='Done. The PDF is returning to the original window.';setTimeout(()=>{channel.close();window.close();},5000);}
   else if(msg.cmd==='failed')fail(msg.message);
  };});
 }catch{fail('The local Office engine could not finish. Your original document has not changed.');}
};
const orphan=setTimeout(()=>{channel.close();window.close();},300000);
const ready=setInterval(()=>channel.postMessage({type:'ready'}),500);
