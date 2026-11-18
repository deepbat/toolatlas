import type { ToolMeta } from './types';

/**
 * Out-of-box tools added November 2026 (ToolAtlas 3.0 batch).
 *
 * These are jobs the generic tool sites do not do well, or at all:
 * photo-to-colouring-page and colour-blind simulation are canvas jobs,
 * photo-pixelator is a privacy job, and UPI QR is an India payments job.
 * All processing is local; images never leave the device.
 */
const rows: [id: string, name: string, description: string, category: ToolMeta['category'], icon: string, keywords: string[]][] = [
  [
    'photo-colouring-page',
    'Photo to Colouring Page',
    'Turn a photo into a printable black-and-white colouring page: outlines only, no grey shading.',
    'image',
    'Palette',
    ['colouring page', 'coloring page', 'kids', 'outline', 'sketch', 'printable', 'draw'],
  ],
  [
    'colour-blind-simulator',
    'Colour Blindness Simulator',
    'See a photo the way someone with protanopia, deuteranopia, tritanopia or total colour blindness sees it.',
    'image',
    'Monitor',
    ['colour blind', 'color blind', 'protanopia', 'deuteranopia', 'tritanopia', 'daltonism', 'accessibility', 'vision'],
  ],
  [
    'photo-pixelator',
    'Privacy Pixelator',
    'Pixelate a photo so faces, number plates and addresses cannot be read, then download the safe copy.',
    'image',
    'Shapes',
    ['pixelate', 'blur face', 'privacy', 'number plate', 'anonymise', 'mosaic', 'censor'],
  ],
  [
    'upi-qr',
    'UPI QR Generator',
    'Make a QR code that opens a UPI payment for your UPI ID, with an optional amount and note. Works with GPay, PhonePe and Paytm.',
    'generators',
    'QrCode',
    ['upi', 'qr code', 'gpay', 'phonepe', 'paytm', 'payment', 'bhim', 'collect money'],
  ],
];

export const OUTBOX_TOOLS: ToolMeta[] = rows.map(([id, name, description, category, icon, keywords]) => ({
  id,
  name,
  description,
  category,
  icon,
  keywords,
  version: '1.0.0',
  status: 'beta',
  added: '2026-11-18',
  layout: 'wide',
}));
