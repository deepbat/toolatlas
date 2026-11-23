// Builds src-tauri/licenses/ for the desktop installer from the crates that are
// actually linked into the app (normal dependency edges of the resolved graph for
// the chosen target), plus the website's third-party notices.
// Not legal advice: this ships each crate's own licence files and flags crates
// that carry none, so a human can review the flagged list.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const target = process.argv[2] || 'x86_64-pc-windows-msvc';
const features = process.argv[3] || '';
const args = ['metadata', '--format-version', '1', '--locked', '--manifest-path', 'src-tauri/Cargo.toml', '--filter-platform', target];
if (features) args.push('--features', features);
const meta = JSON.parse(execFileSync('cargo', args, { maxBuffer: 1 << 28 }).toString());
const byId = new Map(meta.packages.map((p) => [p.id, p]));
const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]));
const seen = new Set();
const stack = [meta.resolve.root];
while (stack.length) {
  const id = stack.pop();
  if (seen.has(id)) continue;
  seen.add(id);
  for (const d of nodes.get(id).deps) if (d.dep_kinds.some((k) => k.kind === null)) stack.push(d.pkg);
}
const pkgs = [...seen].map((i) => byId.get(i)).filter((p) => p.source);
pkgs.sort((a, b) => (a.name + a.version).localeCompare(b.name + b.version));

const LIC = /^(LICEN[CS]E|COPYING|NOTICE|UNLICENSE)/i;
const texts = new Map(); // hash -> {text, crates:[]}
const flagged = [];
const index = [];
const mpl = [];
for (const p of pkgs) {
  const dir = path.dirname(p.manifest_path);
  const files = readdirSync(dir).filter((f) => LIC.test(f) && !/\.spdx$/i.test(f));
  index.push(`${p.name} ${p.version}\t${p.license || p.license_file || 'NONE'}\t${files.join('+') || 'NO FILE IN PACKAGE'}`);
  if (/MPL-2\.0/.test(p.license || '')) mpl.push(p);
  if (!files.length) { flagged.push(p); continue; }
  for (const f of files) {
    const t = readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n').trim();
    const h = createHash('sha256').update(t).digest('hex');
    if (!texts.has(h)) texts.set(h, { text: t, crates: [] });
    texts.get(h).crates.push(`${p.name} ${p.version} (${f})`);
  }
}
const unresolved = [];
const generated = [];
// A crate package that carries no licence file: fetch the licence file from the crate's own
// repository at the exact commit recorded in the published package (.cargo_vcs_info.json).
async function fromUpstream(p) {
  const dir = path.dirname(p.manifest_path);
  const vcsFile = path.join(dir, '.cargo_vcs_info.json');
  if (!existsSync(vcsFile) || !p.repository) return null;
  const sha = JSON.parse(readFileSync(vcsFile, 'utf8'))?.git?.sha1;
  const m = /github\.com\/([^/]+)\/([^/.]+)/.exec(p.repository);
  if (!sha || !m) return null;
  for (const f of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENSE-MIT', 'LICENCE', 'COPYING']) {
    const url = `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${sha}/${f}`;
    try {
      const r = await fetch(url);
      if (r.ok) return { url, text: (await r.text()).replace(/\r\n/g, '\n').trim() };
    } catch {}
  }
  return null;
}
for (const p of flagged) {
  if (p.license === 'MPL-2.0' && [...texts.values()].some((t) => /Mozilla Public License Version 2\.0/.test(t.text))) {
    generated.push(`${p.name} ${p.version}\nCovered by the unmodified MPL-2.0 text shipped above (same licence as the other MPL-2.0 crates).`);
    continue;
  }
  const up = await fromUpstream(p);
  if (up) generated.push(`${p.name} ${p.version}\nLicence file taken from ${up.url} (the commit recorded in the published crate package).\n\n${up.text}`);
  else unresolved.push(`${p.name} ${p.version} (${p.license})`);
}
const out = [];
out.push('DESKTOP APP: RUST DEPENDENCY LICENCES', `Target ${target}${features ? ', features ' + features : ''}. ${pkgs.length} crates reachable through normal dependency edges in the resolved graph. This can be a few more than the default-feature build links (scripts/check-licence-coverage.mjs reports the difference in CI).`, 'Generated from Cargo.lock by scripts/bundle-licences.mjs. Not a legal opinion.', '');
out.push('== Crate index (name version | declared licence | licence files shipped) ==', ...index, '');
if (mpl.length) out.push('== MPL-2.0 notice ==', 'These crates are covered by MPL-2.0 and are used unmodified: ' + mpl.map((p) => `${p.name} ${p.version}`).join(', ') + '. Source: https://crates.io/crates/<name>/<version> (download link) and the repository in each manifest. Licence text: included below and at https://www.mozilla.org/MPL/2.0/.', '');
out.push('== Licence texts shipped inside each crate package ==');
for (const { text, crates } of texts.values()) out.push('---', 'Applies to: ' + crates.join('; '), '', text, '');
if (generated.length) out.push('== Crates with no licence file in their package (licence file from the upstream repository at the commit recorded in the crate package) ==', ...generated.map((g) => '---\n' + g + '\n'));
if (unresolved.length) out.push('== UNRESOLVED: no licence text available ==', ...unresolved);
mkdirSync('src-tauri/licenses', { recursive: true });
writeFileSync('src-tauri/licenses/RUST_LICENSES.txt', out.join('\n'));
copyFileSync('public/THIRD_PARTY_NOTICES.txt', 'src-tauri/licenses/THIRD_PARTY_NOTICES.txt');
console.log(`crates=${pkgs.length} distinct-texts=${texts.size} generated-mit=${generated.length} unresolved=${unresolved.length}`);
console.log('unresolved list: ' + (unresolved.join(', ') || 'none'));
if (unresolved.length) process.exit(2);
