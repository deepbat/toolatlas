import puppeteer from 'puppeteer-core';
import fs from 'fs';
const file = process.argv[2] || 'complex.docx';
const out = process.argv[3] || '/tmp/painted.pdf';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto('http://127.0.0.1:8971/paint.html?file=' + encodeURIComponent(file), { waitUntil: 'networkidle0' });
await page.waitForFunction('document.title === "PAINTED" || document.title.startsWith("ERROR")', { timeout: 60000 });
const title = await page.title();
if (title.startsWith('ERROR')) { console.log('PAGE ' + title); await browser.close(); process.exit(1); }
const b64 = await page.evaluate('window.__pdfB64');
const warnings = await page.evaluate('window.__warnings');
fs.writeFileSync(out, Buffer.from(b64, 'base64'));
console.log('[warnings]', JSON.stringify(warnings));
console.log('[done]', out, fs.statSync(out).size, 'bytes');
await browser.close();
