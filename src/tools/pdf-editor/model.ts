import type { SourceEdit } from './streamEdit';
// Annotation model for the PDF editor.
// All annotation coordinates live in "view space": the pdf.js viewport at
// scale 1 (page rotation applied, y grows downward, 1 unit = 1 PDF point).
// Conversion to true PDF coordinates happens at export time through the
// stored pdf.js viewports, which also handles rotated pages.

export type AnnMode = 'highlight' | 'underline' | 'strike' | 'whiteout' | 'redact';
export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'arrow';

export interface TextAnn {
  kind: 'text';
  id: string;
  x: number;
  y: number; // top edge of the first line's em box
  text: string;
  size: number;
  color: string;
  bold: boolean;
  fontFamily?: 'Helvetica' | 'Times' | 'Courier';
  italic?: boolean;
  source?: {
    key: string;
    x: number; y: number; w: number; h: number;
    background: string;
    edit?: SourceEdit;
  };
}

export interface RectAnn {
  kind: 'rect';
  id: string;
  mode: AnnMode;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

export interface PenAnn {
  kind: 'pen';
  id: string;
  color: string;
  width: number;
  pts: number[]; // flat [x1, y1, x2, y2, ...]
}

export interface ShapeAnn {
  kind: 'shape';
  id: string;
  shape: ShapeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  width: number;
}

export interface ImageAnn {
  kind: 'image';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  dataUrl: string;
  label: string;
}

export interface LinkAnn {
  kind: 'link';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  url: string;
}

export type Ann = TextAnn | RectAnn | PenAnn | ShapeAnn | ImageAnn | LinkAnn;
export type AnnMap = Record<number, Ann[]>;

export interface TextItemRect {
  x: number;
  y: number;
  w: number;
  h: number;
  size: number;
  str: string;
  key: string;
  baseline: number;
  editable: boolean;
  fontFamily: 'Helvetica' | 'Times' | 'Courier';
  bold: boolean;
  italic: boolean;
  color: string;
  edit?: SourceEdit;
}

export interface FormFieldInfo {
  name: string;
  type: 'text' | 'checkbox' | 'radio' | 'choice';
  page: number; // 0-based
  x: number;
  y: number;
  w: number;
  h: number;
  options: { value: string; label: string }[];
}

export const uid = (): string =>
  Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

export function annBBox(a: Ann): { x: number; y: number; w: number; h: number } {
  if (a.kind === 'pen') {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < a.pts.length; i += 2) {
      minX = Math.min(minX, a.pts[i]);
      maxX = Math.max(maxX, a.pts[i]);
      minY = Math.min(minY, a.pts[i + 1]);
      maxY = Math.max(maxY, a.pts[i + 1]);
    }
    const pad = a.width / 2 + 2;
    return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
  }
  if (a.kind === 'text') {
    const lines = a.text.split('\n');
    const w = Math.max(24, ...lines.map((l) => l.length)) * a.size * 0.62;
    return { x: a.x, y: a.y, w, h: Math.max(1, lines.length) * a.size * 1.2 };
  }
  return { x: a.x, y: a.y, w: a.w, h: a.h };
}

export function moveAnn(a: Ann, dx: number, dy: number): Ann {
  if (a.kind === 'pen') {
    const pts = a.pts.slice();
    for (let i = 0; i < pts.length; i += 2) {
      pts[i] += dx;
      pts[i + 1] += dy;
    }
    return { ...a, pts };
  }
  return { ...a, x: a.x + dx, y: a.y + dy };
}

export function resizeAnn(a: Ann, w: number, h: number): Ann {
  if (a.kind === 'rect' || a.kind === 'shape' || a.kind === 'image' || a.kind === 'link') {
    return { ...a, w: Math.max(6, w), h: Math.max(6, h) };
  }
  return a;
}

export function hexToRgb01(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// pdf-lib's standard fonts use WinAnsi encoding. Characters outside this set
// cannot be printed; report them instead of failing mid-export.
const WINANSI_EXTRA = new Set(
  '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ¡¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ'.split('')
);

export function winAnsiOffenders(text: string): string[] {
  const bad = new Set<string>();
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (ch === '\n' || ch === '\t') continue;
    if (cp >= 32 && cp <= 126) continue;
    if (cp >= 160 && cp <= 255) continue;
    if (WINANSI_EXTRA.has(ch)) continue;
    bad.add(ch);
  }
  return [...bad];
}
