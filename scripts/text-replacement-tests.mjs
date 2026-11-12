// End-to-end replacement regression: synthetic Airtel-style receipt, no user data.
import { chromium } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173/toolatlas';
let server;
if (!process.env.E2E_BASE_URL) {
 server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1'], {stdio:'pipe'});
 for(let i=0;i<80;i++){try {if((await fetch(BASE+'/')).ok)break;}catch{} await new Promise(r=>setTimeout(r,100));}
}
let count=0; const check=(name,ok)=>{assert.ok(ok,name);count++;console.log('PASS '+name);};
const fixture = '/tmp/receipt-style.pdf';
const d=await PDFDocument.create();const font=await d.embedFont(StandardFonts.Helvetica);const bold=await d.embedFont(StandardFonts.HelveticaBold);
const p=d.addPage([595,842]);
p.drawText('airtel', {x:480,y:780,size:22,font:bold,color:rgb(.8,.05,.1)});
p.drawText('Bharti Airtel Limited', {x:220,y:755,size:12,font:bold});
p.drawText('payment receipt', {x:240,y:735,size:11,font});
p.drawText('Thank you for choosing airtel service. Here is the payment receipt.',{x:40,y:700,size:10,font});
const rows=[['Receipt No.','TEST-RECEIPT-001'],['Customer Name','SAMPLE CUSTOMER'],['Customer Number','0000000000_dsl'],['Order Number','TEST-ORDER-001'],['Line of Business','Airtel Xstream Fiber'],['Payment type','Change Plan'],['Amount paid','1180.00 INR']];
rows.forEach(([a,b],i)=>{const y=670-i*26;p.drawRectangle({x:40,y:y-9,width:515,height:26,color:i===0?rgb(.94,.95,.96):rgb(1,1,1),borderColor:rgb(.55,.55,.55),borderWidth:.5});p.drawLine({start:{x:285,y:y-9},end:{x:285,y:y+17},thickness:.5,color:rgb(.55,.55,.55)});p.drawText(a,{x:46,y,size:10,font});p.drawText(b,{x:292,y,size:10,font});});
p.drawText('SYNTHETIC TEST DOCUMENT - NOT A REAL PAYMENT RECEIPT',{x:40,y:420,size:9,font,color:rgb(.5,.5,.5)});
await writeFile(fixture,await d.save());
await mkdir('/downloads/toolatlas-evidence',{recursive:true});
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
async function open(file=fixture){await page.goto(BASE+'/tools/pdf-editor/');await page.locator('input[type=file]').first().setInputFiles(file);await page.locator('[data-testid=pdf-editor]').waitFor();await page.waitForFunction(()=>document.querySelector('[data-testid=page-1] canvas')?.width>100);}
async function click(x,y){const el=page.locator('[data-testid=overlay-1]');const b=await el.boundingBox();await el.click({position:{x:x*b.width/595,y:y*b.width/595}});}
async function exportFile(path){const pending=page.waitForEvent('download');await page.locator('[data-testid=download]').click();const dl=await pending;await dl.saveAs(path);return new Uint8Array(await readFile(path));}
async function text(bytes){const pd=await pdfjs.getDocument({data:bytes.slice()}).promise;const pp=await pd.getPage(1);const tc=await pp.getTextContent();return tc.items;}
try {
 await open();
 check('Edit text is the default',await page.locator('[data-testid=tool-edit]').getAttribute('aria-pressed')==='true');
 await click(352,170);
 const ta=page.locator('textarea[data-testid^=ann-]');await ta.waitFor();
 check('receipt line prefilled',await ta.inputValue()==='TEST-RECEIPT-001');
 check('source removal supported',await page.locator('[data-testid=replacement-method]').innerText()==='Original text removed on export');
 check('original 10pt size matched',+await page.locator('[aria-label="Text size"]').inputValue()===10);
 const bg=await page.locator('[data-kind=replacement-cover]').getAttribute('fill');check('grey receipt background sampled',bg!=='#ffffff'&&bg!=='#000000');
 await ta.fill('REPLACED-RECEIPT-002');
 await page.locator('[data-testid=tool-select]').click();
 await page.screenshot({path:'/downloads/toolatlas-evidence/receipt-replacement-desktop.png'});
 const out=await exportFile('/downloads/toolatlas-evidence/receipt-replaced.pdf');
 const items=await text(out);check('new receipt number in exported text',items.some(i=>i.str==='REPLACED-RECEIPT-002'));
 check('old receipt number absent from exported text',!items.some(i=>i.str.includes('TEST-RECEIPT-001')));
 check('neighbouring customer value unchanged',items.some(i=>i.str==='SAMPLE CUSTOMER'));
 const original=await text(new Uint8Array(await readFile(fixture)));const before=original.find(i=>i.str==='TEST-RECEIPT-001'),after=items.find(i=>i.str==='REPLACED-RECEIPT-002');
 check('export baseline matches original',Math.abs(before.transform[5]-after.transform[5])<.01&&Math.abs(before.transform[4]-after.transform[4])<.01);
 // Re-edit, clearing text deletes original words without resurrecting them.
 await page.locator('[data-testid=tool-edit]').click();await click(352,170);await ta.waitFor();check('re-edit uses same linked replacement',await ta.inputValue()==='REPLACED-RECEIPT-002');await ta.fill('');await page.locator('[data-testid=tool-select]').click();
 const empty=await text(await exportFile('/tmp/receipt-empty.pdf'));check('empty replacement deletes original',!empty.some(i=>i.str.includes('TEST-RECEIPT-001')||i.str.includes('REPLACED-RECEIPT-002')));
 await page.locator('[data-testid=undo]').click();await page.locator('[data-testid=tool-edit]').click();await click(352,170);await ta.waitFor();check('undo restores edited value',await ta.inputValue()==='REPLACED-RECEIPT-002');
 await page.locator('[data-testid=delete-ann]').click();check('delete restores original preview',await page.locator('[data-kind=replacement-cover]').count()===0);
 const restored=await text(await exportFile('/tmp/receipt-restored.pdf'));check('delete replacement restores original PDF text',restored.some(i=>i.str==='TEST-RECEIPT-001'));
 await page.setViewportSize({width:393,height:852});await open();check('Edit text label visible on phone',await page.locator('[data-testid=tool-edit]').innerText()==='EDIT TEXT');check('Add text label visible on phone',await page.locator('[data-testid=tool-text]').innerText()==='ADD TEXT');
 await click(352,170);await ta.waitFor();await ta.fill('PHONE-REPLACED-002');await page.locator('[data-testid=tool-select]').click();await page.screenshot({path:'/downloads/toolatlas-evidence/receipt-replacement-mobile.png'});
 check('no mobile page overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 const phone=await text(await exportFile('/tmp/receipt-phone.pdf'));check('mobile export replaces source',phone.some(i=>i.str==='PHONE-REPLACED-002')&&!phone.some(i=>i.str==='TEST-RECEIPT-001'));
 check('zero browser errors',errors.length===0);
 console.log(JSON.stringify({passed:count,errors}));
} finally {await browser.close();server?.kill();}
