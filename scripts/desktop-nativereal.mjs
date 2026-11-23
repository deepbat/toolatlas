// Real-tool verification of the native PDF save in the installed test-only desktop app: saved output of the Word and Excel print views,
// network blocking with request evidence (local listener), command authorization from the hidden print window, and temp-file cleanup.
// Raw CDP, Node 22+. Used only by .github/workflows/desktop.yml against the test-only build (feature native-pdf).
import http from 'node:http';
import os from 'node:os';
import { readdirSync, copyFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
const port = process.env.CDP_PORT || '9222';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
mkdirSync('out', { recursive: true });
let failed = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) failed++; };
setTimeout(() => { console.log('FAIL watchdog'); process.exit(2); }, 400000);

async function targetsList() { try { return await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { return []; } }
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0; const pend = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  const ready = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression, awaitPromise = true, limitMs = 120000) => { const r = await Promise.race([send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }), new Promise(res => setTimeout(() => res({ result: { result: { value: 'EVAL_TIMEOUT' } } }), limitMs))]); return r.result?.result?.value ?? r.result?.exceptionDetails?.text ?? JSON.stringify(r.error || r.result); };
  return { ready, send, ev, close: () => ws.close() };
}
let main;
for (let i = 0; i < 40 && !main; i++) { const t = (await targetsList()).find(x => x.type === 'page' && !x.url.startsWith('file:')); if (t) main = t; else await sleep(1000); }
if (!main) { console.log('FAIL no main page target'); process.exit(1); }
const page = connect(main.webSocketDebuggerUrl); await page.ready;
const origin = new URL(main.url).origin;
const { send, ev } = page;

// Local listener that records every request it receives.
const hits = [];
const srv = http.createServer((q, r) => { hits.push(q.url); r.writeHead(200, { 'content-type': 'image/png' }); r.end(); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const lport = srv.address().port;
const tmpLeft = () => readdirSync(os.tmpdir()).filter(n => /^deepaks-tool-print-.*\.html$/.test(n));
const downloads = `${process.env.USERPROFILE}\\Downloads`;
const invoke = (html, name) => ev(`(async()=>{ if(!window.__TAURI_INTERNALS__) return 'NO_TAURI'; try { return 'OK '+await window.__TAURI_INTERNALS__.invoke('save_print_pdf',{html:${JSON.stringify(html)},name:${JSON.stringify(name)}}); } catch(e){ return 'ERR '+String(e); } })()`);

await send('Page.navigate', { url: `${origin}/` }); await sleep(3000);
// 0. Control: the listener does see a request when one is allowed (the app page itself may fetch it).
await ev(`new Promise(r=>{const i=new Image();i.onload=i.onerror=()=>r('done');i.src='http://127.0.0.1:${lport}/control';})`);
await sleep(500);
check(hits.length === 1 && hits[0] === '/control', `control request reached the local listener (hits: ${JSON.stringify(hits)})`);

// 1. Hostile HTML straight into the command: nothing may reach the listener.
const hostile = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="http://127.0.0.1:${lport}/css"><style>@import url(http://127.0.0.1:${lport}/import);p{background:url(http://127.0.0.1:${lport}/bg)}</style></head><body><p>HOSTILE-VISIBLE</p><img src="http://127.0.0.1:${lport}/img"><iframe src="http://127.0.0.1:${lport}/frame"></iframe><script>fetch("http://127.0.0.1:${lport}/script");new Image().src="http://127.0.0.1:${lport}/script-img";document.body.append("SCRIPT-RAN")</script><a href="http://127.0.0.1:${lport}/link">l</a></body></html>`;
const h = await invoke(hostile, 'hostile-probe');
console.log('hostile invoke:', h);
if (h.startsWith('OK ')) copyFileSync(h.slice(3), 'out/native-hostile-probe.pdf');
await sleep(1500);
check(hits.length === 1, `no request from hostile HTML reached the local listener (hits after: ${JSON.stringify(hits)})`);
check(tmpLeft().length === 0, `temp print files after success: ${JSON.stringify(tmpLeft())}`);

// 2. Authorization: call the command from the hidden print window while it is held open.
const holdP = ev(`(()=>{ window.__hold = window.__TAURI_INTERNALS__.invoke('save_print_pdf',{html:'<p>held</p>',name:'__test_hold__a'}).then(p=>({ok:true,p}),e=>({ok:false,e:String(e)})); return 'started'; })()`, false);
console.log('hold started:', await holdP);
let pt;
for (let i = 0; i < 16 && !pt; i++) { pt = (await targetsList()).find(x => x.type === 'page' && x.url.startsWith('file:')); if (!pt) await sleep(500); }
check(!!pt, 'hidden print window exists while the command runs');
if (pt) {
  console.log('print window url:', pt.url.replace(/\\/g, '/').split('/').pop());
  const pw = connect(pt.webSocketDebuggerUrl); await pw.ready;
  const during = tmpLeft().length;
  check(during >= 1, `temp print file exists while the window is open (${during})`);
  await pw.ev(`(()=>{ window.__r='PENDING'; if(!window.__TAURI_INTERNALS__){ window.__r='NO_IPC_OBJECT'; return 'x'; } try { window.__TAURI_INTERNALS__.invoke('save_print_pdf',{html:'<p>no</p>',name:'from-print-window'}).then(v=>{window.__r='CALLED '+v;},e=>{window.__r='REJECTED '+String(e);}); } catch(e){ window.__r='THREW '+String(e); } return 'x'; })()`, false, 5000);
  let r = 'PENDING';
  for (let i = 0; i < 12 && r === 'PENDING'; i++) { await sleep(500); r = await pw.ev('window.__r', false, 3000); }
  console.log('invoke from print window:', r);
  check(!String(r).startsWith('CALLED'), 'the print window cannot call save_print_pdf');
  const markers = readdirSync(os.tmpdir()).filter(n => n.startsWith('deepaks-tool-callmarker-'));
  console.log('command entry markers:', JSON.stringify(markers));
  check(!markers.some(n => n.includes('printview')), markers.length ? 'the command body was entered from the print window (code label check had to stop it)' : 'the print window call never reached the command body (blocked before it, by IPC access control)');
  console.log('layer: ' + (markers.some(n => n.includes('printview')) ? 'code label check (Err returned)' : 'blocked before the command body'));
  check(!existsSync(`${downloads}\\from-print-window.pdf`), 'no file was written by the print window call');
  pw.close();
}
let holdRes; for (let i = 0; i < 60; i++) { holdRes = await ev('window.__hold ? Promise.race([window.__hold, new Promise(r=>setTimeout(()=>r(null),200))]).then(v=>v?JSON.stringify(v):"pending") : "none"'); if (holdRes !== 'pending') break; await sleep(500); }
console.log('hold result:', holdRes);
check(tmpLeft().length === 0, `temp print files after the held call finished: ${JSON.stringify(tmpLeft())}`);

// Marker control: a call from the main window must leave its own marker, so a missing print-window marker means something.
const ctl = await invoke('<p>ctl</p>', 'from-print-window-ctl');
console.log('marker control call:', ctl);
check(readdirSync(os.tmpdir()).some(n => n === 'deepaks-tool-callmarker-main.txt'), 'control: a main-window call leaves the main marker');
if (String(ctl).startsWith('OK ')) copyFileSync(ctl.slice(3), 'out/native-marker-control.pdf');

// 3. Failure path cleanup.
const f = await invoke('<p>fail</p>', '__test_fail__a');
console.log('forced failure result:', f);
await sleep(1000);
check(String(f).startsWith('ERR'), 'forced failure returns an error');
check(tmpLeft().length === 0, `temp print files after a failed call: ${JSON.stringify(tmpLeft())}`);
check(!(await targetsList()).some(x => x.url.startsWith('file:')), 'no hidden print window left after failure');

// 4. Real tools through the flag-gated frontend path.
const src = readFileSync('scripts/desktop-printpdf.mjs', 'utf8');
const a = src.indexOf("  const JSZip"); const bIdx = src.indexOf('const xlsxBuf'); const bEnd = src.indexOf('\n', bIdx);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const { docxBuf, xlsxBuf } = await new AsyncFunction(src.slice(a, bEnd) + '\nreturn { docxBuf, xlsxBuf };')();
await ev(`localStorage.setItem('toolatlas.nativePdfSave','1')`);
for (const [tool, file, buf] of [['word-to-pdf', 'fixture.docx', docxBuf], ['excel-to-pdf', 'book.xlsx', xlsxBuf]]) {
  await send('Page.navigate', { url: `${origin}/tools/${tool}/` }); await sleep(4000);
  const b64 = Buffer.from(buf).toString('base64');
  await ev(`(()=>{const bin=atob('${b64}');const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);const i=document.querySelector('input[type=file]');const dt=new DataTransfer();dt.items.add(new File([u],'${file}'));i.files=dt.files;i.dispatchEvent(new Event('change',{bubbles:true}));return 1})()`);
  await sleep(3000);
  await ev(`[...document.querySelectorAll('label')].find(l=>l.textContent.includes('Selectable text')).click()`);
  await sleep(500);
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Convert to PDF');b.click();return 'clicked'})()`);
  let res; for (let i = 0; i < 120 && !res; i++) { res = await ev('window.__nativePdfSave ? JSON.stringify(window.__nativePdfSave) : ""'); if (!res) await sleep(500); }
  console.log(tool + ' native save result:', res);
  const o = res ? JSON.parse(res) : null;
  check(!!o?.ok, tool + ' saved through the native command');
  if (o?.ok) copyFileSync(o.path, `out/native-real-${tool}.pdf`);
  await sleep(500);
  check(tmpLeft().length === 0, tool + ' temp print files after save: ' + JSON.stringify(tmpLeft()));
}
check(hits.length === 1, `still no request from any document reached the listener (hits: ${JSON.stringify(hits)})`);
await ev(`localStorage.removeItem('toolatlas.nativePdfSave')`);
srv.close(); page.close();
process.exit(failed ? 1 : 0);
