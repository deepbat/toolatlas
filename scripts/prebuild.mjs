// Copies self-hosted engine assets into public/ so no tool loads code or data
// from a CDN at runtime. Everything stays on-device / same-origin.
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const out = (p) => `public/${p}`;
mkdirSync(out('tesseract'), { recursive: true });

// pdf.js worker (used by the PDF tools)
copyFileSync('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', out('pdfjs.worker.min.js'));

// Tesseract OCR engine: browser worker, LSTM cores (SIMD variants) and the
// English language data (best_int set, ~3 MB compressed). Loaded lazily by the
// Copy Text from Picture tool from <base>/tesseract/.
copyFileSync('node_modules/tesseract.js/dist/worker.min.js', out('tesseract/worker.min.js'));
for (const variant of ['relaxedsimd-lstm', 'simd-lstm', 'lstm']) {
  copyFileSync(`node_modules/tesseract.js-core/tesseract-core-${variant}.wasm.js`, out(`tesseract/tesseract-core-${variant}.wasm.js`));
  copyFileSync(`node_modules/tesseract.js-core/tesseract-core-${variant}.wasm`, out(`tesseract/tesseract-core-${variant}.wasm`));
}
copyFileSync('node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', out('tesseract/eng.traineddata.gz'));

// Hindi and Punjabi OCR models (tessdata_best, integer-quantised, ~1.4 MB each). They come from the
// @tesseract.js-data npm tarballs (MIT, data from the Apache-2.0 tessdata_best set). The tarball bytes
// are checked against the registry's SHA-512 integrity values pinned here, so a changed or tampered
// download fails the build. A copy already in public/tesseract is kept, so a rebuild works offline.
const MODELS = {
  hin: 'sha512-MB6WY6g4SAtrs+Xuyz5JDDsLFCykCwIESV7M9KkyxF71bxBqhLa8e7GJi5yGa/Wl6V4nuC7LWX/EMdSyTINTvg==',
  pan: 'sha512-Ta6T8XrXldXxxDq+xQpUKMKsaY9Z14WSbrD1JMoHjQu3ys7+2xJYXtDUWwxe3y3RoifJ+dWXp30q+k6C97pCkw==',
};
function tarFile(buf, name) {
  for (let off = 0; off + 512 <= buf.length; ) {
    const head = buf.subarray(off, off + 512);
    const fname = head.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '');
    if (!fname) break;
    const size = parseInt(head.subarray(124, 136).toString('utf8').replace(/\0.*$/s, '').trim() || '0', 8);
    if (fname === name) return buf.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error(`${name} not found in the model tarball`);
}
for (const [lang, integrity] of Object.entries(MODELS)) {
  const dest = out(`tesseract/${lang}.traineddata.gz`);
  if (existsSync(dest)) continue;
  const url = `https://registry.npmjs.org/@tesseract.js-data/${lang}/-/${lang}-1.0.0.tgz`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download the ${lang} OCR model: HTTP ${res.status}`);
  const tgz = Buffer.from(await res.arrayBuffer());
  const got = 'sha512-' + createHash('sha512').update(tgz).digest('base64');
  if (got !== integrity) throw new Error(`The ${lang} OCR model failed its integrity check`);
  writeFileSync(dest, tarFile(gunzipSync(tgz), `package/4.0.0_best_int/${lang}.traineddata.gz`));
}

// qpdf engine (Protect / Unlock / Repair PDF tools), loaded lazily from <base>/qpdf/.
mkdirSync(out('qpdf'), { recursive: true });
copyFileSync('node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.wasm', out('qpdf/qpdf.wasm'));

console.log('prebuild: copied pdfjs worker, tesseract and qpdf assets to public/');
