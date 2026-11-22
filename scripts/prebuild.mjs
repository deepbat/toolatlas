// Copies self-hosted engine assets into public/ so no tool loads code or data
// from a CDN at runtime. Everything stays on-device / same-origin.
import { copyFileSync, mkdirSync } from 'node:fs';

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

// qpdf engine (Protect / Unlock / Repair PDF tools), loaded lazily from <base>/qpdf/.
mkdirSync(out('qpdf'), { recursive: true });
copyFileSync('node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.wasm', out('qpdf/qpdf.wasm'));

console.log('prebuild: copied pdfjs worker, tesseract and qpdf assets to public/');
