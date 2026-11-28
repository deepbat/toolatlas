// Builds the painter-based Office converter page into public/office-engine/alt/.
// Source: scripts/alt-engine/ (plain JS, browser-only; see docs/engineering/alt-office-engine.md).
import { createHash } from 'node:crypto';
import { mkdir, readdir, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const outDir = root + 'public/office-engine/alt/';
await mkdir(outDir + 'fonts/', { recursive: true });

await esbuild.build({
  entryPoints: [root + 'scripts/alt-engine/entry-converter.js'],
  bundle: true,
  format: 'esm',
  minify: true,
  outfile: outDir + 'engine.js',
  logLevel: 'warning',
});

// Fonts are committed under public/office-engine/alt/fonts/ (OFL/Apache-2.0);
// the manifest pins their hashes so the page could verify them later.
const manifest = { fonts: {} };
for (const f of await readdir(outDir + 'fonts/')) {
  if (!f.endsWith('.ttf')) continue;
  const b = await import('node:fs/promises').then(m => m.readFile(outDir + 'fonts/' + f));
  manifest.fonts[f] = createHash('sha256').update(b).digest('hex');
}
await writeFile(outDir + 'manifest.json', JSON.stringify(manifest));
console.log('alt engine built:', outDir);
