// Structural accessibility checks on every page at phone width. Not a replacement for testing with a screen reader.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173/toolatlas';
let server;
if (!process.env.E2E_BASE_URL) { server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1'], { stdio: 'ignore' }); for (let i = 0; i < 100; i++) { try { if ((await fetch(BASE + '/')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); } }
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 393, height: 851 } });
const page = await ctx.newPage();
const catalog = JSON.parse(await readFile('dist/catalog.json', 'utf8'));
const tools = (catalog.tools || catalog).map((t) => '/tools/' + t.id + '/');
const routes = ['/', '/tools/', '/categories/', '/pdf/', '/image/', '/video/', '/audio/', '/text/', '/converter/', '/web/', '/utilities/', '/favorites/', '/recent/', '/workspaces/', '/resources/', '/offline/', '/about/', '/guides/', '/settings/', '/privacy/', ...tools];

const audit = () => {
  const out = [];
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const name = (el) => {
    const aria = el.getAttribute('aria-label'); if (aria && aria.trim()) return aria;
    const by = el.getAttribute('aria-labelledby'); if (by && by.split(' ').some((id) => document.getElementById(id)?.textContent.trim())) return 'by';
    if (el.labels && [...el.labels].some((l) => l.textContent.trim())) return 'label';
    if (el.closest('label')?.textContent.trim()) return 'wrap';
    if ((el.textContent || '').trim()) return 'text';
    if (el.querySelector('img[alt]:not([alt=""])')) return 'img';
    return (el.getAttribute('title') || '').trim();
  };
  if (!document.documentElement.lang) out.push('html has no lang');
  if (!document.title.trim()) out.push('page has no title');
  if (!document.querySelector('main, [role=main]')) out.push('no main landmark');
  if (document.querySelectorAll('h1').length < 1) out.push('no h1');
  document.querySelectorAll('img').forEach((i) => { if (!i.hasAttribute('alt')) out.push('img without alt: ' + (i.src || '').slice(-40)); });
  document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button]').forEach((el) => {
    if (!visible(el)) return;
    if (el.tagName === 'INPUT' && el.type === 'file') return; // wrapped by the dropzone label
    if (!name(el)) out.push('no accessible name: ' + el.tagName.toLowerCase() + ' ' + (el.outerHTML.slice(0, 90)));
  });
  return out;
};
const failures = [];
for (const r of routes) {
  await page.goto(BASE + r);
  await page.locator('h1').first().waitFor({ timeout: 15000 }).catch(() => {});
  await page.locator('[aria-label="Loading tool"]').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  const issues = await page.evaluate(audit);
  if (issues.length) failures.push(r + '\n   ' + [...new Set(issues)].slice(0, 6).join('\n   '));
}
await browser.close(); server?.kill();
console.log(`${routes.length} pages checked, ${failures.length} with issues`);
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
