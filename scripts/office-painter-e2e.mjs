// Suite-level e2e for the painter engine behind Word/Excel -> PDF: drives
// the real UI (upload, default mode, Convert to PDF), captures the download
// and asserts the painted PDF carries the fixture's exact Latin and Indic
// text, honours the stored page break, repeats header/footer, evaluates the
// simple formulas and excludes the print-area secret.
// Runs against `vite preview` (build first), or set E2E_BASE_URL to a server.
import { chromium } from '@playwright/test';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173/toolatlas';
let server;
if (!process.env.E2E_BASE_URL) {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1'], { stdio: 'ignore' });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/')).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
}

async function extract(bytes) {
  const d = await pdfjs.getDocument({ data: new Uint8Array(bytes), standardFontDataUrl: new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url).pathname }).promise;
  try {
    const pages = [];
    for (let n = 1; n <= d.numPages; n++) {
      const p = await d.getPage(n);
      pages.push((await p.getTextContent()).items.map((x) => x.str).join(' '));
    }
    return { numPages: d.numPages, pages, text: pages.join(' ').replace(/\s+/g, ' ') };
  } finally { await d.destroy(); }
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  async function convert(id, fixture, name, mimeType) {
    await page.goto(`${base}/tools/${id}/`);
    await page.locator('input[type=file]').first().setInputFiles({ name, mimeType, buffer: await readFile(fixture) });
    await page.getByText(name).first().waitFor();
    const pending = page.waitForEvent('download', { timeout: 90000 });
    await page.getByRole('button', { name: 'Convert to PDF', exact: true }).click();
    const dl = await pending;
    const path = `/tmp/painter-e2e-${id}.pdf`;
    await dl.saveAs(path);
    return readFile(path);
  }

  const docx = await extract(await convert('word-to-pdf', 'scripts/fixtures/office-engine/complex.docx', 'complex.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'));
  assert.equal(docx.numPages, 2, 'stored DOCX page break respected at Suite level');
  for (const s of ['TOOLATLAS HEADER', 'PRIVATE FOOTER', 'Complex quarterly report', 'नमस्ते दुनिया क्षत्रिय ज्ञान', 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ ਪੰਜਾਬੀ ਕ੍ਰਿਪਾ', 'Inner merged', 'Outer merged', 'Final sentence, no content may be lost.'])
    assert.ok(docx.text.includes(s), 'Suite DOCX retains ' + s);
  assert.equal((docx.text.match(/TOOLATLAS HEADER/g) || []).length, 2, 'header repeats per page');
  assert.equal((docx.text.match(/PRIVATE FOOTER/g) || []).length, 2, 'footer repeats per page');
  assert.ok(!docx.pages[0].includes('Second page after explicit break') && docx.pages[1].includes('Second page after explicit break'), 'break page content on page 2');
  console.log('PASS word-to-pdf painter e2e (exact Indic, breaks, header/footer)');

  const xlsx = await extract(await convert('excel-to-pdf', 'scripts/fixtures/office-engine/complex.xlsx', 'complex.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
  // 'Actual versus target' is the chart title: charts are out of scope for the painter route (documented), so no chart assertions here.
  for (const s of ['CONFIDENTIAL REPORT', 'Quarterly बिक्री', 'North', '125', '230', '25', '30', '-10', 'Page 1 of 1'])
    assert.ok(xlsx.text.includes(s), 'Suite XLSX retains ' + s);
  assert.ok(!xlsx.text.includes('OUTSIDE PRINT AREA SECRET'), 'print-area excluded cell stays excluded at Suite level');
  console.log('PASS excel-to-pdf painter e2e (print area, formulas, header/footer, Indic)');

  assert.deepEqual(errors, [], 'no page errors during conversion');
  console.log('PASS office painter suite e2e');
} finally {
  await browser?.close();
  server?.kill();
}
