// Drives the desktop app over raw CDP (no Playwright, so its download handling is not involved)
// and clicks a real download. The workflow then lists the user's Downloads folder.
// Needs Node 22+ for the global WebSocket.
const port = process.env.CDP_PORT || '9222';
let targets;
for (let i = 0; i < 40 && !targets; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await new Promise(r => setTimeout(r, 1000)); }
}
const t = (targets || []).find(x => x.type === 'page');
if (!t) { console.log('FAIL no page target'); process.exit(1); }
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); return r.result?.result?.value ?? r.result?.exceptionDetails?.text; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const origin = new URL(t.url).origin;
await send('Page.navigate', { url: `${origin}/tools/pdf-rotate/` });
await sleep(4000);
const pdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R/Size 4>>\n%%EOF';
console.log('attach: ' + await ev(`(()=>{const i=document.querySelector('input[type=file]');const dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(pdf)}],'names-test.pdf',{type:'application/pdf'}));i.files=dt.files;i.dispatchEvent(new Event('change',{bubbles:true}));return i.files.length})()`));
await sleep(2500);
console.log('click: ' + await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Rotate pages');if(!b)return 'no button';b.click();return 'clicked'})()`));
await sleep(6000);
console.log('status text: ' + String(await ev(`document.body.innerText.match(/Saved[^\\n]*/)?.[0]||'none'`)));
ws.close();
process.exit(0);
