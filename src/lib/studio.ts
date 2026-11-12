import type { CategoryId, ToolMeta } from './types';

type Row = [id: string, name: string, description: string, category: CategoryId, icon: string, keywords: string[], extra?: Partial<ToolMeta>];

const rows: Row[] = [
  ['pdf-compress', 'PDF Compressor', 'Shrink a PDF to a quality level or a target size. Shows the saving and warns when text would turn into pictures.', 'pdf', 'FileText', ['reduce pdf size', 'smaller pdf', 'shrink', 'email limit', 'optimize'], { popular: true }],
  ['pdf-to-images', 'PDF to Images', 'Save each PDF page as a PNG or JPEG at the resolution you choose, with a ZIP download.', 'pdf', 'FileImage', ['pdf to jpg', 'pdf to png', 'export pages', 'screenshot pdf']],
  ['pdf-background', 'PDF Background and Colour', 'Change the page background, make a PDF greyscale or black and white, or adjust brightness and contrast for scans.', 'pdf', 'Palette', ['grayscale', 'black and white', 'scan cleanup', 'dark pdf', 'page colour']],
  ['pdf-compare', 'PDF Compare', 'Compare two PDFs by text and by page picture to see what changed.', 'pdf', 'FileDiff', ['diff pdf', 'difference', 'versions', 'redline']],
  ['pdf-split', 'PDF Splitter', 'Split a PDF into single pages, fixed-size chunks or custom ranges.', 'pdf', 'Files', ['split pages', 'separate pdf', 'divide', 'cut pdf']],
  ['pdf-extract-text', 'PDF Text Extractor', 'Copy or save the text from a PDF. Warns when a file is a scan with no text layer.', 'pdf', 'Type', ['pdf to text', 'copy text', 'ocr alternative', 'txt']],
  ['pdf-form-filler', 'PDF Form Filler', 'Fill the fields of a fillable PDF form and save it, with an option to flatten the result.', 'pdf', 'PenLine', ['fill form', 'acroform', 'fillable pdf', 'application form']],
  ['image-bg-remove', 'Background Remover (colour based)', 'Remove a plain background by colour. Works on studio and white backgrounds. Not an AI cut-out.', 'image', 'Image', ['remove background', 'transparent', 'cutout', 'white background', 'png']],
  ['image-upscale', 'Image Enlarger', 'Enlarge a picture 2x to 4x with smooth resampling and light sharpening. No AI.', 'image', 'ImageDown', ['upscale', 'increase resolution', 'bigger image', 'enhance']],
  ['image-bulk-convert', 'Bulk Image Resizer and Converter', 'Resize and convert up to 100 images at once to JPEG, PNG, WebP or AVIF and download a ZIP.', 'image', 'Files', ['batch', 'webp', 'avif', 'bulk resize', 'convert many']],
  ['passport-photo', 'Passport Photo Maker (India)', 'Crop a portrait to India passport 35x45 mm, PAN 25x35 mm or a custom size, and print a sheet of copies.', 'image', 'Image', ['passport size photo', 'visa photo', 'pan photo', '35x45', 'id photo'], { popular: true }],
  ['image-collage', 'Collage Maker', 'Combine up to 12 pictures into a grid, row, column or hero layout.', 'image', 'Shapes', ['photo grid', 'combine images', 'merge photos']],
  ['image-annotate', 'Image Annotator and Editor', 'Draw arrows, boxes and text, hide private areas, rotate, crop and adjust light.', 'image', 'Pencil', ['annotate screenshot', 'blur', 'redact', 'markup', 'crop', 'rotate']],
  ['image-metadata', 'Image Metadata Viewer and Remover', 'See EXIF, GPS and camera details inside a photo and save a clean copy without them.', 'image', 'ShieldCheck', ['exif', 'gps', 'privacy', 'strip metadata', 'location in photo']],
];

export const STUDIO_TOOLS: ToolMeta[] = rows.map(([id, name, description, category, icon, keywords, extra]) => ({
  id, name, description, category, icon, keywords, version: '1.0.0', status: 'stable', added: '2026-11-12', layout: 'wide', ...extra,
}));
export const STUDIO_PDF = new Set(rows.filter((r) => r[3] === 'pdf').map((r) => r[0]));
export const STUDIO_IMAGE = new Set(rows.filter((r) => r[3] === 'image').map((r) => r[0]));
