// Desktop check: Indic-text PDF -> Word in the installed app (CDP). Input is the selectable-text PDF saved by desktop-printpdf.mjs.
// Used only by .github/workflows/desktop.yml against the test-only build. Saved docx is inspected afterwards.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const port = process.env.CDP_PORT || '9222';
let browser;
for (let i = 0; i < 40 && !browser; i++) {
  try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); } catch { await new Promise(r => setTimeout(r, 1000)); }
}
if (!browser) { console.log('FAIL could not attach'); process.exit(1); }
const page = browser.contexts()[0].pages()[0];
const origin = process.env.ORIGIN || new URL(page.url()).origin;
const base = process.env.BASE || '';
setTimeout(() => { console.log('FAIL watchdog'); process.exit(2); }, 120000);
const pdf = await readFile('out/word-print-webview2.pdf');
await page.goto(`${origin}${base}/tools/pdf-to-word/`);
await page.locator('input[type=file]').first().setInputFiles({ name: 'indic.pdf', mimeType: 'application/pdf', buffer: pdf });
await page.getByText('indic.pdf').first().waitFor({ timeout: 20000 });
const p = page.waitForEvent('download', { timeout: 40000 }).then((d) => ({ d }), () => null);
await page.getByRole('button', { name: 'Convert to Word', exact: true }).click();
const got = await p;
if (got && got.d) {
  await got.d.saveAs('out/indic-pdf-to-word.docx');
  console.log('SAVED docx ' + got.d.suggestedFilename() + ' (inspect it)');
} else {
  const msg = (await page.locator('[role=alert], .text-danger').allInnerTexts()).join(' | ');
  console.log('NO DOWNLOAD. visible message: ' + msg);
  await page.screenshot({ path: 'out/indic-p2w-ui.png' });
}
process.exit(0);
