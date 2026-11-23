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
// Crates with no licence file: standard SPDX text with the manifest authors as holder.
const MIT = (h) => `MIT License\n\nCopyright (c) ${h}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;
const BSD3 = (h) => `BSD 3-Clause License\n\nCopyright (c) ${h}\n\nRedistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:\n\n1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.\n\n2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.\n\n3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.\n\nTHIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`;
const unresolved = [];
const generated = [];
for (const p of flagged) {
  const holder = (p.authors || []).join(', ') || `${p.name} authors`;
  if (p.license === 'MIT') generated.push(`${p.name} ${p.version}\n${MIT(holder)}`);
  else if (p.license === 'BSD-3-Clause') generated.push(`${p.name} ${p.version}\n${BSD3(holder)}`);
  else if (p.license === 'MPL-2.0' && [...texts.values()].some((t) => /Mozilla Public License Version 2\.0/.test(t.text))) generated.push(`${p.name} ${p.version}\nCovered by the unmodified MPL-2.0 text shipped above (same licence as the other MPL-2.0 crates). Copyright holders are named in the crate source.`);
  else unresolved.push(`${p.name} ${p.version} (${p.license})`);
}
const out = [];
out.push('DESKTOP APP: RUST DEPENDENCY LICENCES', `Target ${target}${features ? ', features ' + features : ''}. ${pkgs.length} crates linked via normal dependency edges.`, 'Generated from Cargo.lock by scripts/bundle-licences.mjs. Not a legal opinion.', '');
out.push('== Crate index (name version | declared licence | licence files shipped) ==', ...index, '');
if (mpl.length) out.push('== MPL-2.0 notice ==', 'These crates are covered by MPL-2.0 and are used unmodified: ' + mpl.map((p) => `${p.name} ${p.version}`).join(', ') + '. Source: https://crates.io/crates/<name>/<version> (download link) and the repository in each manifest. Licence text: included below and at https://www.mozilla.org/MPL/2.0/.', '');
out.push('== Licence texts shipped inside each crate package ==');
for (const { text, crates } of texts.values()) out.push('---', 'Applies to: ' + crates.join('; '), '', text, '');
if (generated.length) out.push('== Crates with no licence file in their package (standard MIT text, holder taken from the manifest authors) ==', ...generated.map((g) => '---\n' + g + '\n'));
if (unresolved.length) out.push('== UNRESOLVED: no licence text available ==', ...unresolved);
mkdirSync('src-tauri/licenses', { recursive: true });
writeFileSync('src-tauri/licenses/RUST_LICENSES.txt', out.join('\n'));
copyFileSync('public/THIRD_PARTY_NOTICES.txt', 'src-tauri/licenses/THIRD_PARTY_NOTICES.txt');
console.log(`crates=${pkgs.length} distinct-texts=${texts.size} generated-mit=${generated.length} unresolved=${unresolved.length}`);
console.log('unresolved list: ' + (unresolved.join(', ') || 'none'));
if (unresolved.length) process.exit(2);
