const base=new URL('./',self.location.href);
const allow=/^(?:converter\.html|engine\.(?:js|css)|office-worker\.js|zetaHelper\.js|zeta\.js|isolation-sw\.js|notices\.html|runtime\/(?:manifest\.json|soffice\.js|soffice\.data\.js\.metadata|(?:data|wasm)-[0-9]+\.bin)|licenses\/[A-Za-z0-9._-]+|fonts\/(?:hindi|punjabi)\.ttf|alt\/(?:converter\.html|engine\.js|manifest\.json|fonts\/[A-Za-z0-9._-]+\.ttf))$/;
self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 if(event.request.cache==='only-if-cached'&&event.request.mode!=='same-origin')return;
 const u=new URL(event.request.url),path=u.pathname.slice(base.pathname.length)||'converter.html';
 if(u.origin!==base.origin||!u.pathname.startsWith(base.pathname)||u.search||!allow.test(path)||event.request.method!=='GET'){event.respondWith(Promise.resolve(new Response('Blocked',{status:403})));return;}
 event.respondWith((async()=>{const r=await fetch(event.request);if(r.status===0)return r;const h=new Headers(r.headers);h.set('Cross-Origin-Opener-Policy','same-origin');h.set('Cross-Origin-Embedder-Policy','require-corp');h.set('Content-Security-Policy',"default-src 'self' blob: data:; connect-src 'self'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' blob: data:; style-src 'self' 'unsafe-inline'; worker-src 'self' blob: data:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'");return new Response(r.body,{status:r.status,statusText:r.statusText,headers:h});})());
});
