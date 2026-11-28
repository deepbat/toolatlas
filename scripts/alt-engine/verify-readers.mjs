import fs from 'fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as mupdf from 'mupdf';

const EXPECT = {
  '/tmp/painted-complex.pdf': ['नमस्ते दुनिया क्षत्रिय ज्ञान', 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ ਪੰਜਾਬੀ ਕ੍ਰਿਪਾ', 'TOOLATLAS HEADER', 'PRIVATE FOOTER', 'Second page after explicit break', 'Final sentence, no content may be lost.', 'FLOATING BOX CONTENT', 'Inner merged', '1250'],
  '/tmp/painted-embedded-image.pdf': ['नमस्ते दुनिया', 'LOCAL DOCUMENT. Embedded image.'],
  '/tmp/painted-external-image.pdf': ['नमस्ते दुनिया', 'LOCAL DOCUMENT. External image must never be downloaded.'],
};

async function pdfjsText(path) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(path)), isEvalSupported: false }).promise;
  let out = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    out += tc.items.map(it => it.str).join('') + '\n';
  }
  return out;
}
function mupdfText(path) {
  const doc = mupdf.Document.openDocument(fs.readFileSync(path), 'application/pdf');
  let out = '';
  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.loadPage(i);
    out += page.toStructuredText().asJSON() ? JSON.parse(page.toStructuredText().asJSON()).blocks
      .flatMap(b => (b.lines || []).map(l => (l.wm ? '' : '') + l.text)).join('\n') + '\n' : '';
  }
  return out;
}

let fail = 0;
for (const [path, needles] of Object.entries(EXPECT)) {
  const js = await pdfjsText(path);
  const mu = mupdfText(path);
  for (const n of needles) {
    const okJs = js.replace(/\s+/g, ' ').includes(n.replace(/\s+/g, ' '));
    const okMu = mu.replace(/\s+/g, ' ').includes(n.replace(/\s+/g, ' '));
    console.log(`${path.split('/').pop()} | ${JSON.stringify(n.slice(0, 30))} | pdfjs=${okJs ? 'OK' : 'FAIL'} mupdf=${okMu ? 'OK' : 'FAIL'}`);
    if (!okJs || !okMu) fail++;
  }
}
process.exit(fail ? 1 : 0);
