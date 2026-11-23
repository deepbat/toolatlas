// Independent check of the Rust licence bundle: compares the crate index in src-tauri/licenses/RUST_LICENSES.txt with the
// dependency set that `cargo tree` resolves from the committed Cargo.lock for the target (normal edges only, the code that is linked).
// Fails when a crate linked by the default-feature build is missing from the bundle. Crates the bundle lists that this graph does not
// contain are reported, not failed: the bundle is built from the wider resolved graph, so it can only over-include. Not a legal review.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const target = process.argv[2] || 'x86_64-pc-windows-msvc';
const out = execFileSync('cargo', ['tree', '--locked', '--manifest-path', 'src-tauri/Cargo.toml', '--target', target, '-e', 'normal', '--prefix', 'none', '--format', '{p}'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const tree = new Set();
for (const line of out.split('\n')) { const m = /^(\S+) v(\S+)/.exec(line.trim()); if (m) tree.add(`${m[1]} ${m[2]}`); }
const txt = readFileSync('src-tauri/licenses/RUST_LICENSES.txt', 'utf8');
const start = txt.indexOf('== Crate index');
const body = txt.slice(start).split('\n').slice(1);
const bundle = new Map();
for (const l of body) { if (!l.trim()) break; const [k, lic, files] = l.split('\t'); bundle.set(k, { lic, files }); }
const root = [...tree].filter(k => k.startsWith('deepaks-tool '));
for (const r of root) tree.delete(r);
const missing = [...tree].filter(k => !bundle.has(k));
const extra = [...bundle.keys()].filter(k => !tree.has(k));
const noFile = [...bundle].filter(([, v]) => /NO FILE/.test(v.files)).map(([k]) => k);
console.log(`cargo tree crates (excluding the app itself): ${tree.size}; bundle index: ${bundle.size}`);
console.log('linked but missing from bundle:', JSON.stringify(missing));
console.log('bundled in addition (not in the default-feature cargo tree, over-inclusion):', JSON.stringify(extra));
console.log('crates with no licence file in the package (text fetched from upstream or flagged):', JSON.stringify(noFile));
if (missing.length) { console.log('FAIL licence coverage mismatch'); process.exit(1); }
console.log(`PASS every crate in the cargo tree (${tree.size}) is in the bundle index; ${extra.length} extra crates are bundled`);
