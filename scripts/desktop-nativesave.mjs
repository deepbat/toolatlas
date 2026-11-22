// Calls the native save_print_pdf command (WebView2 PrintToPdf) in the installed test-only app and copies the saved PDF to out/.
// Raw CDP, Node 22+. Used only by .github/workflows/desktop.yml.
import { mkdir, copyFile, stat } from 'node:fs/promises';
const port = process.env.CDP_PORT || '9222';
let targets;
for (let i = 0; i < 40 && !targets; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await new Promise(r => setTimeout(r, 1000)); }
}
const tg = (targets || []).find(x => x.type === 'page' && !x.url.startsWith('file:'));
if (!tg) { console.log('FAIL no page target'); process.exit(1); }
const ws = new WebSocket(tg.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
setTimeout(() => { console.log('FAIL watchdog'); process.exit(2); }, 150000);
await mkdir('out', { recursive: true });
const html = '<!doctype html><html><head><meta charset="utf-8"><title>native save test</title><style>body{font-family:Georgia,serif;font-size:14pt}table{border-collapse:collapse}td{border:1px solid #000;padding:4px}</style></head><body><h1>Native save test</h1><p>नमस्ते दुनिया क्षत्रिय ज्ञान</p><p>ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ ਦੂਜੇ ਸਫ਼ੇ ਦੀ</p><p>Quarterly report, selectable text check.</p><table><tr><td>Item</td><td>गणना</td></tr><tr><td>Apples</td><td>42</td></tr></table></body></html>';
const expr = `(async()=>{ if(!window.__TAURI_INTERNALS__) return 'NO_TAURI'; try { return 'OK '+await window.__TAURI_INTERNALS__.invoke('save_print_pdf',{html:${JSON.stringify(html)},name:'native-save-test'}); } catch(e){ return 'ERR '+String(e); } })()`;
const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
const v = r.result?.result?.value ?? JSON.stringify(r.result);
console.log('invoke result:', v);
if (typeof v === 'string' && v.startsWith('OK ')) {
  const p = v.slice(3);
  const s = await stat(p);
  await copyFile(p, 'out/native-save-test.pdf');
  console.log('saved', p, s.size, 'bytes; copied to out/native-save-test.pdf');
  process.exit(0);
}
process.exit(1);
