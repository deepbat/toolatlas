// Lazy loader and wrappers for the qpdf WASM engine (@neslinesli93/qpdf-wasm,
// ISC; qpdf itself Apache-2.0). The 1.3 MB wasm is served from <base>/qpdf/
// (copied there by prebuild) and fetched only when a Protect, Unlock or Repair
// run starts. Everything happens on-device: passwords never leave the browser.

const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

type QpdfModule = {
  callMain: (args: string[]) => number;
  FS: {
    writeFile: (path: string, data: Uint8Array) => void;
    readFile: (path: string) => Uint8Array;
    unlink?: (path: string) => void;
  };
};

let cached: Promise<{ m: QpdfModule; lines: string[] }> | null = null;

function load(wasmUrl: string) {
  if (!cached) {
    cached = import('@neslinesli93/qpdf-wasm').then(async ({ default: createModule }) => {
      const lines: string[] = [];
      const m = (await (createModule as unknown as (cfg: object) => Promise<QpdfModule>)({
        locateFile: () => wasmUrl,
        noInitialRun: true,
        print: (t: string) => lines.push(t),
        printErr: (t: string) => lines.push(t),
      })) as QpdfModule;
      return { m, lines };
    });
    cached.catch(() => { cached = null; });
  }
  return cached;
}

function fail(lines: string[], e: unknown, hint: string): Error {
  const log = lines.join('\n');
  if (/invalid password/i.test(log)) return new Error('That password did not unlock the file.');
  const last = log.trim().split('\n').filter(Boolean).pop();
  if (last) return new Error(last);
  return new Error(e instanceof Error && e.message && !/^\d+$/.test(e.message) ? e.message : hint);
}

/** Run qpdf on one input file and return the rewritten file. */
export async function runQpdf(input: Uint8Array, args: string[], wasmUrl = `${BASE}qpdf/qpdf.wasm`, hint = 'qpdf could not process this file.'): Promise<Uint8Array> {
  const { m, lines } = await load(wasmUrl);
  lines.length = 0;
  // Never let a previous successful output survive a failed invocation.
  for (const p of ['/in.pdf', '/out.pdf']) { try { m.FS.unlink?.(p); } catch { /* absent */ } }
  m.FS.writeFile('/in.pdf', input);
  try {
    let code: number;
    try { code = m.callMain(['/in.pdf', ...args, '--', '/out.pdf']); }
    catch (e) { throw fail(lines, e, hint); }
    if (code !== 0) throw fail(lines, code, hint);
    return m.FS.readFile('/out.pdf').slice();
  } finally {
    for (const p of ['/in.pdf', '/out.pdf']) { try { m.FS.unlink?.(p); } catch { /* absent */ } }
  }
}

/** Encrypt with 256-bit AES. The same password opens and owns the file. */
export function protectPdf(input: Uint8Array, password: string, wasmUrl?: string): Promise<Uint8Array> {
  if (!password) return Promise.reject(new Error('Choose a password first.'));
  return runQpdf(input, ['--encrypt', password, password, '256'], wasmUrl, 'Could not protect this file. If it is damaged, try Repair PDF first.');
}

/** Remove encryption. Blank password tries files that open without one. */
export function unlockPdf(input: Uint8Array, password: string, wasmUrl?: string): Promise<Uint8Array> {
  return runQpdf(input, [`--password=${password}`, '--decrypt'], wasmUrl, 'Could not unlock the file. Check the password, or try Repair PDF first if it is damaged.');
}

/** Rewrite a damaged file; optional object recovery requires per-file consent. */
export async function repairPdf(input: Uint8Array, wasmUrl?: string, allowRecovery = false): Promise<Uint8Array> {
  try { return await runQpdf(input, [], wasmUrl, 'This file is too damaged for qpdf to rebuild.'); }
  catch (original) {
    if (!allowRecovery) throw new Error('The structure could not be rewritten. You can try object recovery after accepting the warning below.');
    // pdf-lib scans intact objects even when xref offsets are damaged. Refuse
    // invalid objects and encryption, then ask qpdf to validate the rebuild.
    try {
      const { PDFDocument } = await import('pdf-lib');
      const doc = await PDFDocument.load(input, { throwOnInvalidObject: true, updateMetadata: false });
      if (!doc.getPageCount()) throw new Error('No pages recovered.');
      const rebuilt = await doc.save({ useObjectStreams: false });
      return await runQpdf(rebuilt, [], wasmUrl, 'Object recovery could not produce a readable PDF.');
    } catch { throw new Error('Object recovery could not produce a readable PDF. No repaired file was saved.'); }
  }
}
