import type { CategoryId, ToolMeta } from './types';


/**
 * ToolAtlas 4.0 — Unique pictorial glyphs for all 48 curated tools.
 * Drop this file into `src/lib/glyphs.ts`.
 */
export const TOOL_GLYPHS: Record<string, string> = {
  // Portal & Print
  'pvc-card-maker': '🪪',
  'image-target-size': '🎯',
  'passport-photo': '📸',
  'signature-maker': '✒️',
  'pdf-editor': '✍️',
  'pdf-compare': '⚖️',
  'pdf-form-filler': '📝',
  'pdf-background': '🧹',
  'pdf-merge': '🧩',
  'image-to-pdf': '🏞️',
  'pdf-compress': '🗜️',
  'pdf-split': '🪓',
  'pdf-to-images': '🎞️',
  'pdf-extract-text': '📃',
  'doc-flatten-print': '📄',
  'pdf-redaction-verify': '⬛',
  'pdf-delete-pages': '🗑️',
  'pdf-crop': '✂️',
  'pdf-header-footer': '🔖',
  'pdf-bates': '🔢',
  'pdf-rotate': '🔄',
  'pdf-watermark': '💧',
  'pdf-page-organiser': '🔀',
  'pdf-sign': '🖋️',
  'pdf-ocr': '🔎',
  'pdf-protect': '🔒',
  'pdf-unlock': '🔓',
  'pdf-repair': '🩹',
  'pdf-to-word': '📑',
  'pdf-nup': '🔲',
  'pdf-booklet': '📖',
  'pdf-flatten': '🧱',


  // Privacy Shield
  'id-masker': '🛡️',
  'photo-pixelator': '🕶️',
  'remove-exif': '📍',
  'bulk-renamer': '🏷️',
  'image-ocr': '🔤',
  'file-converter': '🔁',


  // India Desk
  'land-area-india': '🗺️',
  'exam-age-eligibility': '🎓',
  'upi-qr': '🇮🇳',
  'income-tax-india': '🏛️',
  'gst-pan-validator': '✅',
  'number-to-words-inr': '₹',
  'cheque-overlay': '🏦',


  // Clever Studio
  'screenshot-mockup': '🖼️',
  'subscription-burn': '🔥',
  'wifi-poster': '📶',
};


export const CATEGORY_GLYPHS: Record<CategoryId, string> = {
  calculators: '🧮',
  converters: '🔄',
  date: '🗓️',
  finance: '💼',
  text: '✏️',
  pdf: '📑',
  image: '🖼️',
  video: '🎬',
  audio: '🎧',
  file: '📁',
  productivity: '⚡',
  developer: '💻',
  internet: '🌐',
  generators: '✨',
  device: '📱',
  misc: '🧰',
};


export const SECTION_GLYPHS: Record<string, string> = {
  pdf: '📑',
  image: '🖼️',
  video: '🎬',
  audio: '🎧',
  text: '✏️',
  converter: '🔄',
  web: '🌐',
  utilities: '🧰',
};


export function glyphFor(tool: ToolMeta): string {
  return TOOL_GLYPHS[tool.id] ?? CATEGORY_GLYPHS[tool.category] ?? '🧰';
}
