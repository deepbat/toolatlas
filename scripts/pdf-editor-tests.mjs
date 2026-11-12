// Functional tests for the PDF Editor tool. Run after `npm run build`.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PDFDict, PDFDocument, PDFName, StandardFonts, rgb } from 'pdf-lib';

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173/toolatlas';
let server;
if (!process.env.E2E_BASE_URL) {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'] });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(BASE + '/')).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
}

// ---------- fixtures ----------
async function makeTextPdf() {
  const doc = await PDFDocument.create();
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const p1 = doc.addPage([612, 792]);
  p1.drawText('Quarterly Report', { x: 72, y: 700, size: 24, font: f, color: rgb(0.1, 0.1, 0.1) });
  p1.drawText('Amount due: 1180 INR', { x: 72, y: 640, size: 12, font: f });
  p1.drawText('Prepared for the board meeting on Monday.', { x: 72, y: 615, size: 12, font: f });
  const p2 = doc.addPage([612, 792]);
  p2.drawText('Second page content here.', { x: 72, y: 700, size: 14, font: f });
  return doc.save();
}
async function makeFormPdf() {
  const doc = await PDFDocument.create();
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText('Membership form', { x: 72, y: 750, size: 18, font: f });
  const form = doc.getForm();
  const name = form.createTextField('full_name');
  name.addToPage(page, { x: 72, y: 690, width: 220, height: 22 });
  const agree = form.createCheckBox('agree');
  agree.addToPage(page, { x: 72, y: 640, width: 16, height: 16 });
  const plan = form.createDropdown('plan');
  plan.addOptions(['Basic', 'Pro']);
  plan.addToPage(page, { x: 72, y: 590, width: 140, height: 22 });
  const size = form.createRadioGroup('size');
  size.addOptionToPage('S', page, { x: 72, y: 540, width: 16, height: 16 });
  size.addOptionToPage('M', page, { x: 140, y: 540, width: 16, height: 16 });
  return doc.save();
}
await writeFile('/tmp/editor-text.pdf', await makeTextPdf());
await writeFile('/tmp/editor-form.pdf', await makeFormPdf());
const png = await (async () => {
  const { default: zlib } = await import('node:zlib');
  // 40x20 red PNG via raw encoding
  const w = 40, h = 20;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 200; raw[o + 1] = 40; raw[o + 2] = 40; }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const crcBuf = Buffer.concat([Buffer.from(type), data]); let crc = 0xffffffff; for (const b of crcBuf) { crc ^= b; for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1; } const crcOut = Buffer.alloc(4); crcOut.writeUInt32BE((crc ^ 0xffffffff) >>> 0); return Buffer.concat([len, crcBuf, crcOut]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
})();
await writeFile('/tmp/editor-img.png', png);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
context.setDefaultTimeout(7000);
const errors = [], failures = [];
let passed = 0;
page.on('pageerror', (e) => errors.push(e.message));
const check = (name, cond) => { if (!cond) throw Error(name); passed++; console.log('PASS ' + name); };
const test = async (name, fn) => { try { await fn(); } catch (e) { failures.push(name + ': ' + e.message); console.error('FAIL ' + name + ': ' + e.message); } };
await mkdir('/downloads/toolatlas-evidence', { recursive: true });

const go = async () => {
  await page.goto(BASE + '/tools/pdf-editor/');
  await page.locator('h1').first().waitFor();
  await page.locator('[aria-label="Loading tool"]').waitFor({ state: 'hidden' });
};
const scaleOf = async (n = 1) => page.evaluate((i) => {
  const ov = document.querySelector(`[data-testid=overlay-${i}]`);
  return ov ? ov.getBoundingClientRect().width / 612 : 1;
}, n);
const drag = async (n, x1, y1, x2, y2) => {
  const s = await scaleOf(n);
  const box = await page.locator(`[data-testid=overlay-${n}]`).boundingBox();
  await page.mouse.move(box.x + x1 * s, box.y + y1 * s);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + (x1 + ((x2 - x1) * i) / 8) * s, box.y + (y1 + ((y2 - y1) * i) / 8) * s);
  await page.mouse.up();
};
const clickView = async (n, x, y) => {
  const s = await scaleOf(n);
  await page.locator(`[data-testid=overlay-${n}]`).click({ position: { x: x * s, y: y * s } });
};
const annCount = async (kind) => page.evaluate((k) => document.querySelectorAll(`[data-kind="${k}"]`).length, kind);
const scrollToPoint = async (n, vy) => {
  const s = await scaleOf(n);
  await page.evaluate(({ n, y, s }) => {
    const sc = document.querySelector('[data-testid=pages-scroll]');
    const pageEl = document.querySelector(`[data-testid=page-${n}]`);
    sc.scrollTop += pageEl.getBoundingClientRect().top - sc.getBoundingClientRect().top + y * s - 150;
  }, { n, y: vy, s });
};

try {
  await test('open text PDF renders pages', async () => {
    await go();
    await page.locator('input[type=file]').setInputFiles('/tmp/editor-text.pdf');
    await page.locator('[data-testid=pdf-editor]').waitFor();
    await page.locator('[data-testid=page-1] canvas').first().waitFor();
    await page.waitForFunction(() => {
      const c = document.querySelector('[data-testid=page-1] canvas');
      return c && c.width > 100;
    });
    check('two pages', (await page.locator('[data-testid=page-indicator]').innerText()).trim() === '1 / 2');
  });

  await test('edit existing text covers and replaces', async () => {
    await page.locator('[data-testid=tool-edit]').click();
    await clickView(1, 80, 146); // on "Amount due: 1180 INR"
    const ta = page.locator('textarea[data-testid^=ann-]');
    await ta.waitFor();
    check('prefilled original', (await ta.inputValue()) === 'Amount due: 1180 INR');
    const white = page.locator('[data-kind=replacement-cover]');
    check('whiteout created', (await white.count()) === 1);
    const box = await white.first().evaluate((e) => ({ x: +e.getAttribute('x'), y: +e.getAttribute('y'), w: +e.getAttribute('width'), h: +e.getAttribute('height') }));
    check('whiteout covers text line', Math.abs(box.x - 71) < 4 && Math.abs(box.y - 141) < 6 && box.w > 80 && box.h > 8 && box.h < 20);
    await ta.fill('Amount due: 1181 INR');
    await page.locator('[data-testid=tool-select]').click();
    check('replacement text shown', await page.locator('div[data-testid^=ann-]:has-text("1181 INR")').isVisible());
    await page.screenshot({ path: '/downloads/toolatlas-evidence/editor-edit-text.png' });
  });

  await test('highlight snaps to text lines', async () => {
    await page.locator('[data-testid=tool-highlight]').click();
    await drag(1, 68, 155, 400, 170); // across "Prepared for the board meeting"
    await page.waitForFunction(() => document.querySelectorAll('[data-kind=highlight]').length >= 1, null, { timeout: 8000 });
    check('highlight rect', (await annCount('highlight')) >= 1);
    const box = await page.locator('[data-kind=highlight]').first().evaluate((e) => ({ x: +e.getAttribute('x'), y: +e.getAttribute('y'), w: +e.getAttribute('width'), h: +e.getAttribute('height') }));
    check('highlight on target line', Math.abs(box.y - 167) < 8 && box.h < 20);
  });

  for (const [mode, x1, y1, x2, y2, want] of [['underline', 68, 155, 300, 172, 1], ['strike', 68, 155, 300, 172, 1], ['whiteout', 400, 600, 500, 640, 1], ['redact', 400, 650, 500, 690, 1]]) {
    await test(mode + ' tool', async () => {
      await page.locator('[data-testid=tool-' + mode + ']').click();
      await scrollToPoint(1, y1);
      await drag(1, x1, y1, x2, y2);
      await page.waitForFunction((m) => document.querySelectorAll('[data-kind=' + m + ']').length >= 1, mode, { timeout: 8000 });
      check(mode + ' count', (await annCount(mode)) === want);
    });
  }

  await test('pen and shapes draw', async () => {
    await page.locator('[data-testid=tool-pen]').click();
    await scrollToPoint(1, 420);
    await drag(1, 100, 400, 200, 450);
    await page.waitForFunction(() => document.querySelectorAll('[data-kind=pen]').length === 1, null, { timeout: 8000 });
    check('pen stroke', true);
    await page.locator('[data-testid=tool-shape]').click();
    await page.getByLabel('Shape type', { exact: true }).selectOption('arrow');
    await scrollToPoint(1, 500);
    await drag(1, 100, 480, 250, 520);
    await page.waitForFunction(() => document.querySelectorAll('[data-kind=shape]').length === 1, null, { timeout: 8000 });
    check('arrow shape', true);
  });

  await test('image insert and place', async () => {
    await page.locator('[data-testid=image-input]').setInputFiles('/tmp/editor-img.png');
    await clickView(1, 300, 300);
    const img = page.locator('img[data-testid^=ann-]');
    await img.waitFor();
    check('image placed', true);
  });

  await test('signature draw and place', async () => {
    await page.locator('[data-testid=tool-sign]').click();
    const pad = page.locator('[data-testid=signature-canvas]');
    await pad.waitFor();
    const box = await pad.boundingBox();
    await page.mouse.move(box.x + 60, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 150, box.y + 60);
    await page.mouse.move(box.x + 260, box.y + 110);
    await page.mouse.up();
    await page.getByRole('button', { name: 'Use signature', exact: true }).click();
    await clickView(1, 350, 500);
    check('signature placed', (await page.locator('img[data-testid^=ann-]').count()) === 2);
    await page.screenshot({ path: '/downloads/toolatlas-evidence/editor-annotations.png' });
  });

  await test('link annotation', async () => {
    await page.locator('[data-testid=tool-link]').click();
    await scrollToPoint(1, 70);
    await drag(1, 70, 60, 220, 80);
    await page.locator('[data-testid=link-url]').waitFor();
    await page.locator('[data-testid=link-url]').fill('example.com');
    await page.locator('[data-testid=link-add]').click();
    check('link ann', (await annCount('link')) === 1);
  });

  await test('undo and redo', async () => {
    const before = await page.evaluate(() => document.querySelectorAll('[data-testid^=ann-]').length);
    await page.locator('[data-testid=undo]').click();
    const afterUndo = await page.evaluate(() => document.querySelectorAll('[data-testid^=ann-]').length);
    check('undo removes', afterUndo === before - 1);
    await page.locator('[data-testid=redo]').click();
    const afterRedo = await page.evaluate(() => document.querySelectorAll('[data-testid^=ann-]').length);
    check('redo restores', afterRedo === before);
  });

  await test('select, move and delete', async () => {
    await page.locator('[data-testid=tool-select]').click();
    const before = await page.evaluate(() => document.querySelectorAll('[data-testid^=ann-]').length);
    await scrollToPoint(1, 665);
    await clickView(1, 450, 665); // on the redact box
    await page.locator('[data-testid=delete-ann]').waitFor();
    await page.locator('[data-testid=delete-ann]').click();
    const after = await page.evaluate(() => document.querySelectorAll('[data-testid^=ann-]').length);
    check('delete removes redact', after === before - 1 && (await annCount('redact')) === 0);
  });

  await test('find in document', async () => {
    await page.locator('[data-testid=tool-find]').click();
    await page.locator('[data-testid=find-input]').fill('Quarterly');
    await page.waitForFunction(() => (document.querySelector('[data-testid=find-count]')?.textContent || '').includes('1 of 1'), null, { timeout: 8000 });
    check('find match', true);
    check('flash shown', await page.locator('[data-testid=find-flash]').isVisible());
  });

  let editedTextPath;
  await test('export text PDF flattened', async () => {
    const dl = page.waitForEvent('download');
    await page.locator('[data-testid=download]').click();
    editedTextPath = await (await dl).path();
    const doc = await PDFDocument.load(await readFile(editedTextPath));
    check('export two pages', doc.getPageCount() === 2);
    let hasUri = false, annotCount = 0;
    for (const [, obj] of doc.context.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFDict)) continue;
      if (String(obj.get(PDFName.of('Subtype'))).includes('Link')) {
        annotCount++;
        const a = obj.get(PDFName.of('A'));
        if (a && String(a.get?.(PDFName.of('URI')) ?? a).includes('example.com')) hasUri = true;
      }
    }
    check('link annotation exported', annotCount >= 1);
    check('link uri correct', hasUri);
  });

  await test('edited text is in the file', async () => {
    // reopen the exported PDF in the editor and use find
    await go();
    await page.locator('input[type=file]').setInputFiles(editedTextPath);
    await page.locator('[data-testid=pdf-editor]').waitFor();
    await page.waitForFunction(() => { const c = document.querySelector('[data-testid=page-1] canvas'); return c && c.width > 100; });
    await page.locator('[data-testid=tool-find]').click();
    await page.locator('[data-testid=find-input]').fill('1181 INR');
    await page.waitForFunction(() => (document.querySelector('[data-testid=find-count]')?.textContent || '').includes('1 of 1'), null, { timeout: 8000 });
    check('new text found', true);
    await page.locator('[data-testid=find-input]').fill('HELLO WORLD');
    await page.waitForFunction(() => (document.querySelector('[data-testid=find-count]')?.textContent || '').includes('No matches'), null, { timeout: 8000 });
    check('no phantom text', true);
  });

  await test('form filling and export', async () => {
    await go();
    await page.locator('input[type=file]').setInputFiles('/tmp/editor-form.pdf');
    await page.locator('[data-testid=pdf-editor]').waitFor();
    await page.waitForFunction(() => { const c = document.querySelector('[data-testid=page-1] canvas'); return c && c.width > 100; });
    check('form fields found', (await page.locator('input[data-testid^=form-], select[data-testid^=form-]').count()) === 5);
    await page.locator('[data-testid=form-full_name]').fill('Deepak Batra');
    await page.locator('[data-testid=form-agree]').check();
    await page.locator('[data-testid=form-plan]').selectOption('Pro');
    await page.locator('[data-testid=form-size]').nth(1).check();
    check('radio marked', await page.locator('[data-testid=form-size]').nth(1).isChecked());
    await page.screenshot({ path: '/downloads/toolatlas-evidence/editor-form.png' });
    const dl = page.waitForEvent('download');
    await page.locator('[data-testid=download]').click();
    const outPath = await (await dl).path();
    const doc = await PDFDocument.load(await readFile(outPath));
    check('form flattened', doc.getForm().getFields().length === 0);
    const raw = String(doc.context);
    void raw;
  });

  await test('form values without flattening', async () => {
    await page.getByText('Flatten form fields on download', { exact: true }).click();
    const dl = page.waitForEvent('download');
    await page.locator('[data-testid=download]').click();
    const outPath = await (await dl).path();
    const doc = await PDFDocument.load(await readFile(outPath));
    const form = doc.getForm();
    check('name value', form.getTextField('full_name').getText() === 'Deepak Batra');
    check('checkbox value', form.getCheckBox('agree').isChecked());
    check('dropdown value', form.getDropdown('plan').getSelected()[0] === 'Pro');
    check('radio value', form.getRadioGroup('size').getSelected() === 'M');
  });

  await test('mobile layout has no overflow', async () => {
    await page.setViewportSize({ width: 393, height: 852 });
    await go();
    await page.locator('input[type=file]').setInputFiles('/tmp/editor-text.pdf');
    await page.locator('[data-testid=pdf-editor]').waitFor();
    await page.waitForFunction(() => { const c = document.querySelector('[data-testid=page-1] canvas'); return c && c.width > 100; });
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    check('no horizontal overflow', !overflow);
    await page.locator('[data-testid=tool-text]').click();
    check('text tool active', await page.locator('[data-testid=tool-text]').getAttribute('aria-pressed') === 'true');
    await clickView(1, 72, 300);
    await page.locator('textarea[data-testid^=ann-]').waitFor();
    await page.keyboard.type('Mobile note');
    await page.locator('[data-testid=tool-select]').click();
    check('mobile text works', await page.locator('div[data-testid^=ann-]:has-text("Mobile note")').isVisible());
    await page.screenshot({ path: '/downloads/toolatlas-evidence/editor-mobile.png', fullPage: false });
    await page.setViewportSize({ width: 1440, height: 1000 });
  });

  check('no uncaught browser exceptions', errors.length === 0);
} finally {
  await browser.close();
  if (server) server.kill('SIGTERM');
  await writeFile('/tmp/pdf-editor-test-report.json', JSON.stringify({ passed, failures, errors }, null, 2));
  console.log(JSON.stringify({ passed, failures, errors }, null, 2));
}
if (failures.length) process.exitCode = 1;
