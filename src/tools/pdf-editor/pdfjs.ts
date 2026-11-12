// pdf.js (legacy build) setup for the PDF editor.
// The worker is served as a plain .js file from /public so every static host
// (including GitHub Pages) serves it with a JavaScript MIME type.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - the legacy build ships no type declarations
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.min.mjs';

let configured = false;

export function pdfjs(): any {
  if (!configured) {
    const base = (import.meta as any).env?.BASE_URL ?? '/';
    pdfjsLib.GlobalWorkerOptions.workerSrc = `${base}pdfjs.worker.min.js`;
    configured = true;
  }
  return pdfjsLib;
}

export interface PageInfo {
  num: number; // 1-based
  viewW: number; // viewport width at scale 1 (rotation applied)
  viewH: number;
}
