// Saves the Selectable-text print views (Word and Excel) as PDFs through the desktop app's own WebView2
// print engine (CDP Page.printToPDF), so the saved files can be inspected for text and layout.
// Raw CDP, Node 22+. Used only by .github/workflows/desktop.yml against the test-only build.
import { writeFile, mkdir } from 'node:fs/promises';
const port = process.env.CDP_PORT || '9222';
let targets;
for (let i = 0; i < 40 && !targets; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await new Promise(r => setTimeout(r, 1000)); }
}
const tg = (targets || []).find(x => x.type === 'page');
if (!tg) { console.log('FAIL no page target'); process.exit(1); }
const ws = new WebSocket(tg.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); return r.result?.result?.value ?? r.result?.exceptionDetails?.text; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const origin = new URL(tg.url).origin;
await ev("localStorage.setItem('toolatlas.nativePdfSave','0')"); // this script tests the print-dialog fallback path
await mkdir('out', { recursive: true });
let failed = 0;
setTimeout(() => { console.log('FAIL watchdog'); process.exit(2); }, 200000);
  const JSZip = (await import('jszip')).default;
  const XLSX = await import('xlsx');
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const para = (text, style = '') => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
  const docxZip = new JSZip();
  docxZip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
  docxZip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  docxZip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>');
  docxZip.file('word/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style></w:styles>');
  const longMixed = 'The quarter closed strongly across every region. नमस्ते दुनिया, यह एक लंबा अनुच्छेद है जो कई पंक्तियों में लिपटना चाहिए। '.repeat(3) + 'क्षत्रिय ज्ञान अंत तक पहुँचना चाहिए बिना कटे।';
  const borders = '<w:tblPr><w:tblBorders><w:top w:val="single" w:sz="8" w:space="0" w:color="1F2937"/><w:left w:val="single" w:sz="8" w:space="0" w:color="1F2937"/><w:bottom w:val="single" w:sz="8" w:space="0" w:color="1F2937"/><w:right w:val="single" w:sz="8" w:space="0" w:color="1F2937"/><w:insideH w:val="single" w:sz="8" w:space="0" w:color="1F2937"/><w:insideV w:val="single" w:sz="8" w:space="0" w:color="1F2937"/></w:tblBorders></w:tblPr>';
  docxZip.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    para('Quarterly Report', 'Heading1') +
    para('नमस्ते दुनिया क्षत्रिय ज्ञान') +
    para(longMixed) +
    `<w:tbl>${borders}<w:tr><w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr>${para('Item')}</w:tc><w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr>${para('गणना')}</w:tc></w:tr><w:tr><w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr>${para('Apples')}</w:tc><w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr>${para('42')}</w:tc></w:tr></w:tbl>` +
    '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' +
    para('Page two starts here') +
    para('ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ — ਦੂਜੇ ਸਫ਼ੇ ਦੀ ਸਮਗਰੀ। ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ।') +
    para('Closing notes in English after the break.') +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>');
  const docxBuf = await docxZip.generateAsync({ type: 'nodebuffer' });
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet([['Quarterly बिक्री', '', ''], ['Item', 'गणना', 'Amount'], ['Apples', 5, 125.5], ['कुल', 7, 200]]);
  ws1['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
  ws1['!cols'] = [{ wpx: 140 }, { wpx: 80 }, { wpx: 80 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'बिक्री Data');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), 'Empty');
  const xlsxBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
async function printView(tool, file, buf, outName) {
  await send('Page.navigate', { url: `${origin}/tools/${tool}/` });
  await sleep(4000);
  const b64 = Buffer.from(buf).toString('base64');
  await ev(`(()=>{window.open=()=>null;window.__printed=0;const o=HTMLIFrameElement.prototype;const d=Object.getOwnPropertyDescriptor(o,'contentWindow');Object.defineProperty(o,'contentWindow',{get(){const w=d.get.call(this);if(w&&!w.__hooked){w.__hooked=true;w.print=()=>{window.__printed++;};}return w;},configurable:true});
    const bin=atob('${b64}');const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
    const i=document.querySelector('input[type=file]');const dt=new DataTransfer();dt.items.add(new File([u],'${file}'));i.files=dt.files;i.dispatchEvent(new Event('change',{bubbles:true}));return 1})()`);
  await sleep(3000);
  await ev(`[...document.querySelectorAll('label')].find(l=>l.textContent.includes('Selectable text')).click()`);
  await sleep(500);
  console.log(tool + ' click: ' + await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Convert to PDF');b.click();return 'clicked'})()`));
  for (let i = 0; i < 20 && (await ev('window.__printed')) !== 1; i++) await sleep(500);
  const printed = await ev('window.__printed');
  const html = await ev(`document.querySelector('iframe[data-print-frame]')?.contentDocument.documentElement.outerHTML || ''`);
  console.log(tool + ' print() calls: ' + printed + ', print-view html chars: ' + String(html).length);
  if (printed !== 1 || !html) throw new Error('no print view');
  await ev(`(()=>{const h=${JSON.stringify(html)};document.open();document.write(h);document.close();return 1})()`);
  await sleep(2500);
  const r = await send('Page.printToPDF', { preferCSSPageSize: false, printBackground: true });
  if (!r.result?.data) throw new Error('printToPDF failed ' + JSON.stringify(r.error || r.result).slice(0, 200));
  await writeFile(outName, Buffer.from(r.result.data, 'base64'));
  console.log('PASS ' + tool + ' saved ' + outName);
}
for (const [tool, file, buf, out] of [
  ['word-to-pdf', 'fixture.docx', docxBuf, 'out/word-print-webview2.pdf'],
  ['excel-to-pdf', 'book.xlsx', xlsxBuf, 'out/excel-print-webview2.pdf'],
]) { try { await printView(tool, file, buf, out); } catch (e) { failed++; console.log('FAIL ' + tool + ': ' + e.message); } }
ws.close();
process.exit(failed ? 1 : 0);
