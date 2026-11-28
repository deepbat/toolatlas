/** Opens synchronously in the click handler, before any await can lose popup permission. */
export function convertLocalOffice(file:File,options:{signal?:AbortSignal;timeoutMs?:number}={}):Promise<Uint8Array>{
 if(options.signal?.aborted)throw Error('Office conversion cancelled.');
 const extension=file.name.split('.').pop()?.toLowerCase();
 if(!['docx','xlsx'].includes(extension||'')||file.size>100*1024*1024)throw Error('Choose a DOCX or XLSX up to100MB.');
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
 const channel=new BroadcastChannel('deepak-office-'+token);
 const win=window.open(import.meta.env.BASE_URL+'office-engine/converter.html#'+token,'_blank','popup,width=720,height=600');
 if(!win){channel.close();throw Error('Allow the local converter window, then try again.');}
 return new Promise((resolve,reject)=>{
  let sent=false,settled=false,processing=false;
  const finish=(error?:Error,bytes?:Uint8Array)=>{if(settled)return;settled=true;options.signal?.removeEventListener('abort',abort);if(error)channel.postMessage({type:'cancel'});clearTimeout(timeout);clearInterval(closed);channel.close();try{win.close();}catch{}if(error)reject(error);else resolve(bytes!);};
  // COOP can sever the WindowProxy without closing its window, so its closed flag is not used for cancellation.
  const closed=setInterval(()=>{try{channel.postMessage({type:'heartbeat'});}catch{}},10000);
  const abort=()=>finish(Error('Office conversion cancelled.'));
  options.signal?.addEventListener('abort',abort,{once:true});
  const timeout=setTimeout(()=>finish(Error('The Office conversion timed out. Close its window and try a smaller file.')),options.timeoutMs??240000);
  channel.onmessage=async({data})=>{
   if(data?.type==='ready'&&!sent){sent=true;try{channel.postMessage({type:'convert',extension,bytes:await file.arrayBuffer()});}catch{finish(Error('The document could not be read.'));}}
   else if(data?.type==='converted'&&data.bytes instanceof ArrayBuffer&&!processing){processing=true;const b=new Uint8Array(data.bytes);if(b.length<5||String.fromCharCode(...b.slice(0,5))!=='%PDF-')finish(Error('The engine did not return a PDF.'));else {try{const {repairLocalOfficePdf}=await import('./localOfficePdf');const repaired=await repairLocalOfficePdf(b);if(!settled){channel.postMessage({type:'received'});finish(undefined,repaired);}}catch(error){finish(error instanceof Error?error:Error('The Office PDF could not be checked.'));}}}
   else if(data?.type==='cancelled')finish(Error('Office conversion cancelled.'));
   else if(data?.type==='failed')finish(Error('The local Office engine could not convert this document.'));
  };
 });
}
