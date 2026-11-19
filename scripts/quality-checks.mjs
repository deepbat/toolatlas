// Quality gates that run on the repo and the production build. Run: npm run build && npm run test:quality
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';

let n = 0;
const check = async (name, fn) => { await fn(); n++; console.log('ok  ' + name); };
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const walk = async (d) => (await Promise.all((await readdir(d, { withFileTypes: true })).map((e) => (e.isDirectory() ? walk(d + '/' + e.name) : [d + '/' + e.name])))).flat();

await check('runtime dependencies use permissive licences', async () => {
  const ok = /^(MIT|ISC|Apache-2\.0|BSD-[23]-Clause|OFL-1\.1|MPL-2\.0|\(MPL-2\.0 OR Apache-2\.0\)|0BSD)$/;
  for (const d of Object.keys(pkg.dependencies)) {
    const lic = JSON.parse(await readFile(`node_modules/${d}/package.json`, 'utf8')).license;
    assert.ok(ok.test(String(lic)), `${d} has licence ${lic}`);
  }
});
await check('no new runtime dependencies beyond the reviewed list', () => {
  const reviewed = ['@fontsource/dm-sans', '@fontsource/ibm-plex-mono', '@fontsource/space-grotesk', 'dompurify', 'lucide-react', 'marked', 'pdf-lib', 'pdfjs-dist', 'qrcode', 'react', 'react-dom', 'react-router-dom'];
  const extra = Object.keys(pkg.dependencies).filter((d) => !reviewed.includes(d));
  assert.deepEqual(extra, [], 'review the licence and size of: ' + extra.join(', '));
});
await check('source has no eval, Function constructor or unsanitised HTML', async () => {
  const files = (await walk('src')).filter((f) => /\.(ts|tsx)$/.test(f));
  for (const f of files) {
    const t = await readFile(f, 'utf8');
    assert.ok(!/\beval\s*\(|new Function\s*\(/.test(t), f + ' uses eval or Function');
    if (/dangerouslySetInnerHTML|\.innerHTML\s*=/.test(t)) assert.ok(/DOMPurify|sanitize/i.test(t), f + ' sets HTML without sanitising');
  }
});
await check('no secrets or private keys in source and docs', async () => {
  const files = [...(await walk('src')), ...(await walk('docs')), 'README.md', 'package.json'];
  const bad = /(AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|ghp_[A-Za-z0-9]{30,}|sk_live_[A-Za-z0-9]{10,}|AIza[0-9A-Za-z_-]{35})/;
  for (const f of files) assert.ok(!bad.test(await readFile(f, 'utf8')), 'possible secret in ' + f);
});
await check('no analytics or ad scripts are loaded by the app', async () => {
  const html = await readFile('dist/index.html', 'utf8');
  assert.ok(!/googletagmanager|google-analytics|doubleclick|adsbygoogle|facebook\.net/.test(html));
});
await check('bundle budget: entry chunk under 450 kB, any other chunk under 600 kB, total assets under 4 MB', async () => {
  const files = await readdir('dist/assets');
  let total = 0;
  for (const f of files) {
    const size = (await stat('dist/assets/' + f)).size;
    total += size;
    if (/^index-.*\.js$/.test(f)) assert.ok(size < 450 * 1024, `entry chunk ${f} is ${Math.round(size / 1024)} kB`);
    else if (f.endsWith('.js')) assert.ok(size < 600 * 1024, `${f} is ${Math.round(size / 1024)} kB`);
  }
  assert.ok(total < 4 * 1024 * 1024, 'assets total ' + Math.round(total / 1024) + ' kB');
});
await check('third-party notices list every runtime dependency', async () => {
  const notice = await readFile('public/THIRD_PARTY_NOTICES.txt', 'utf8');
  for (const d of Object.keys(pkg.dependencies)) assert.ok(notice.includes('## ' + d) || notice.includes(d), d + ' missing from notices');
});
await check('prerendered pages carry complete and unique SEO tags', async () => {
  const pages = (await walk('dist')).filter((f) => f.endsWith('/index.html') || f === 'dist/index.html');
  const catalog = JSON.parse(await readFile('dist/catalog.json', 'utf8'));
  assert.equal(pages.length, catalog.length + new Set(catalog.map(t => t.category)).size + 8 + 12, 'every tool, collection, section and support page is prerendered');
  const titles = new Map();
  const root = 'https://deepbat.github.io/toolatlas';
  for (const f of pages) {
    const html = await readFile(f, 'utf8');
    const rel = f === 'dist/index.html' ? '' : f.slice('dist/'.length, -'/index.html'.length) + '/';
    const url = root + '/' + rel;
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    assert.ok(title && title.endsWith("| Deepak's Tool"), f + " missing Deepak's Tool title");
    assert.ok(!titles.has(title), 'duplicate page title: ' + title);
    titles.set(title, f);
    assert.ok(/<meta name="description" content="[^"]{40,}"/.test(html), f + ' weak or missing description');
    assert.ok(html.includes(`<link rel="canonical" href="${url}"/>`), f + ' canonical mismatch, expected ' + url);
    assert.ok(html.includes(`<meta property="og:url" content="${url}"/>`), f + ' og:url mismatch');
    assert.ok(html.includes('og:site_name') && html.includes('twitter:card'), f + ' missing social tags');
    const ld = html.match(/<script id="page-schema" type="application\/ld\+json">([^<]+)<\/script>/)?.[1];
    assert.ok(ld, f + ' missing JSON-LD');
    const graph = JSON.parse(ld)['@graph'];
    assert.ok(Array.isArray(graph) && graph.length >= 1, f + ' JSON-LD has no @graph');
    if (/^dist\/tools\/[^/]+\/index\.html$/.test(f)) {
      assert.ok(graph.some((n) => n['@type'] === 'WebApplication'), f + ' tool page lacks WebApplication schema');
      assert.ok(graph.some((n) => n['@type'] === 'BreadcrumbList'), f + ' tool page lacks BreadcrumbList schema');
    }
  }
  const sitemap = await readFile('dist/sitemap.xml', 'utf8');
  const locs = sitemap.match(/<loc>/g) || [];
  const mods = sitemap.match(/<lastmod>/g) || [];
  assert.equal(locs.length, pages.length, 'sitemap URL count != prerendered page count');
  assert.equal(mods.length, pages.length, 'every sitemap URL needs a lastmod');
  const robots = await readFile('dist/robots.txt', 'utf8');
  assert.ok(robots.includes('Sitemap: ' + root + '/sitemap.xml'), 'robots.txt must reference the sitemap');
});
await check('retired tools have no generated pages, sitemap entries or offline files', async () => {
  const retired = ['calculator','unit-converter','temperature-converter','todo-list','quick-notes','speech-to-text','screen-recorder','video-trim','voice-recorder','image-rotate','image-filters','stopwatch','find-replace'];
  const files = await walk('dist');
  const sitemap = await readFile('dist/sitemap.xml', 'utf8');
  const offline = await readFile('dist/offline-files.json', 'utf8');
  for (const id of retired) {
    assert.ok(!files.includes(`dist/tools/${id}/index.html`), id);
    assert.ok(!sitemap.includes(`/tools/${id}/`), id);
    assert.ok(!offline.includes(`/tools/${id}/`), id);
  }
});
console.log(`\n${n} quality checks passed`);
