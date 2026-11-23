// Functional check of the PRODUCTION desktop build (the installer users get: no test feature, no debug port in its config).
// WebView2 is attached through the AdditionalBrowserArguments policy registry key set by the workflow (the environment variable is ignored by this app), so the installed binary itself is what runs. Checks the default-on native PDF save, the visible save message, the saved files,
// installed binary itself is what runs. Checks the default-on native PDF save, the visible save message, the saved files,
// temp-file cleanup, and that the test-only hooks are not present in this build. Raw CDP, Node 22+.
import os from 'node:os';
import { readdirSync, copyFileSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
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
const tmpLeft = () => readdirSync(os.tmpdir()).filter(n => /^deepaks-tool-print-.*\.html$/.test(n));
const downloads = `${process.env.USERPROFILE}\\Downloads`;

const src = readFileSync('scripts/desktop-printpdf.mjs', 'utf8');
const a = src.indexOf("  const JSZip"); const bIdx = src.indexOf('const xlsxBuf'); const bEnd = src.indexOf('\n', bIdx);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const { docxBuf, xlsxBuf } = await new AsyncFunction(src.slice(a, bEnd) + '\nreturn { docxBuf, xlsxBuf };')();

await send('Page.navigate', { url: `${origin}/` }); await sleep(3000);
check(await ev(`String(localStorage.getItem('toolatlas.nativePdfSave'))`) === 'null', 'no opt-out flag is set, so the native save is the default path');
check(await ev(`!!window.__TAURI_INTERNALS__`) === true, 'running inside the desktop shell');

for (const [tool, file, buf, shot] of [['word-to-pdf', 'fixture.docx', docxBuf, 'prod-word-message.png'], ['excel-to-pdf', 'book.xlsx', xlsxBuf, 'prod-excel-message.png']]) {
  await send('Page.navigate', { url: `${origin}/tools/${tool}/` }); await sleep(4000);
  const b64 = Buffer.from(buf).toString('base64');
  await ev(`(()=>{const bin=atob('${b64}');const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);const i=document.querySelector('input[type=file]');const dt=new DataTransfer();dt.items.add(new File([u],'${file}'));i.files=dt.files;i.dispatchEvent(new Event('change',{bubbles:true}));return 'ok'})()`);
  await sleep(3000);
  await ev(`[...document.querySelectorAll('label')].find(l=>l.textContent.includes('Selectable text')).click()`);
  await sleep(500);
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Convert to PDF');b.click();return 'clicked'})()`);
  let msg = ''; for (let i = 0; i < 120 && !/Saved to /.test(msg); i++) { msg = await ev(`document.body.innerText`); if (!/Saved to /.test(msg)) await sleep(500); }
  const m = /Saved to ([^\n]+?)\. The desktop app writes/.exec(msg);
  console.log(tool + ' visible message:', m ? m[0] : '(none)');
  check(!!m, tool + ' shows the visible save-location message');
  check(!!m && m[1].toLowerCase().startsWith(downloads.toLowerCase()), tool + ' message names a path inside the Downloads folder');
  check(!!m && existsSync(m[1]), tool + ' the file named in the message exists');
  if (m && existsSync(m[1])) copyFileSync(m[1], `out/prod-${tool}.pdf`);
  const shotData = await send('Page.captureScreenshot', { format: 'png' });
  if (shotData.result?.data) writeFileSync(`out/${shot}`, Buffer.from(shotData.result.data, 'base64'));
  await sleep(500);
  check(tmpLeft().length === 0, tool + ' no temp print files left: ' + JSON.stringify(tmpLeft()));
}

// The test-only hooks must be absent in this build: these names would fail or leave a marker in the CI test build.
const inv = (name) => ev(`(async()=>{ try { return 'OK '+await window.__TAURI_INTERNALS__.invoke('save_print_pdf',{html:'<p>x</p>',name:${JSON.stringify(name)}}); } catch(e){ return 'ERR '+String(e); } })()`);
const r1 = await inv('__test_fail__prod');
console.log('test-hook probe result:', r1);
check(String(r1).startsWith('OK '), 'the forced-failure hook is absent (a name that fails in the test build saves normally here)');
const r2 = await inv('from-print-window-prodprobe');
check(!readdirSync(os.tmpdir()).some(n => n.startsWith('deepaks-tool-callmarker-')), 'no call-marker file is written by this build');
check(tmpLeft().length === 0, 'no temp print files left after the probes');
page.close();
process.exit(failed ? 1 : 0);
