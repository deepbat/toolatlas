// Tool-to-tool handoff. Files are held in memory only (never stored, never uploaded)
// and are cleared as soon as the receiving tool takes them or after 10 minutes.
export interface Handoff {
  from: string;
  to: string;
  files: File[];
  at: number;
}
let pending: Handoff | null = null;
const TTL = 10 * 60 * 1000;

export function sendHandoff(from: string, to: string, files: File[]) {
  pending = { from, to, files, at: Date.now() };
}
export function peekHandoff(to: string): Handoff | null {
  if (!pending) return null;
  if (Date.now() - pending.at > TTL) {
    pending = null;
    return null;
  }
  return pending.to === to ? pending : null;
}
export function takeHandoff(to: string): Handoff | null {
  const h = peekHandoff(to);
  if (h) pending = null;
  return h;
}

export interface ChainTarget {
  id: string;
  label: string;
  accept: 'pdf' | 'image';
}
/** Where a result can be sent next. Keys are the producing tool or the generic output kind. */
export const CHAIN: Record<string, ChainTarget[]> = {
  pdf: [
    { id: 'pdf-compress', label: 'Compress', accept: 'pdf' },
    { id: 'pdf-page-organiser', label: 'Reorder pages', accept: 'pdf' },
    { id: 'pdf-watermark', label: 'Watermark', accept: 'pdf' },
    { id: 'pdf-to-images', label: 'Convert to images', accept: 'pdf' },
    { id: 'pdf-split', label: 'Split', accept: 'pdf' },
    { id: 'pdf-form-filler', label: 'Fill form', accept: 'pdf' },
    { id: 'pdf-editor', label: 'Open in editor', accept: 'pdf' },
  ],
  image: [
    { id: 'image-bg-remove', label: 'Remove background', accept: 'image' },
    { id: 'passport-photo', label: 'Passport photo', accept: 'image' },
    { id: 'image-annotate', label: 'Annotate', accept: 'image' },
    { id: 'image-upscale', label: 'Upscale', accept: 'image' },
    { id: 'image-bulk-convert', label: 'Resize or convert', accept: 'image' },
    { id: 'image-metadata', label: 'Check metadata', accept: 'image' },
    { id: 'image-to-pdf', label: 'Make a PDF', accept: 'image' },
  ],
};
