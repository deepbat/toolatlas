import type { ToolMeta } from './types';


/**
 * The 24 signature tools retained from the original 148-tool catalogue.
 * Everything else (generic calculators, unit converters, basic text/dev tools)
 * is retired so visitors are never overwhelmed.
 */
export const CURATED_KEEP_IDS = new Set<string>([
  // Portal & Print
  'pvc-card-maker',
  'image-target-size',
  'passport-photo',
  'signature-maker',
  'pdf-editor',
  'pdf-compare',
  'pdf-form-filler',
  'pdf-background',
  // Privacy Shield & Local Files
  'id-masker',
  'photo-pixelator',
  'remove-exif',
  'bulk-renamer',
  'list-cleaner',
  'csv-excel-tools',
  // India Desk
  'land-area-india',
  'exam-age-eligibility',
  'upi-qr',
  'income-tax-india',
  'gst-pan-validator',
  'number-to-words-inr',
  // Clever Studio
  'photo-colouring-page',
  'colour-blind-simulator',
  'split-bill',
  'screen-ruler',
]);


/**
 * 6 new uncommon, high-utility, 100% on-device tools.
 */
export const UNCOMMON_TOOLS: ToolMeta[] = [
  {
    id: 'doc-flatten-print',
    name: 'Phone-Scan A4 Prepper',
    description:
      'Turn crooked, shadowy phone photos of IDs or receipts into crisp, whitened 2-up A4 printouts.',
    category: 'image',
    icon: 'FileImage',
    keywords: ['scan', 'xerox', 'a4', 'id card', 'receipt', 'whiten', 'print', 'clean'],
    version: '1.0.0',
    status: 'stable',
    added: '2026-11-19',
    featured: true,
    layout: 'wide',
  },
  {
    id: 'pdf-redaction-verify',
    name: 'True PDF Redactor',
    description:
      'Permanently black out sensitive text and rasterize redacted pages so hidden data cannot be copied.',
    category: 'pdf',
    icon: 'ShieldCheck',
    keywords: ['redact', 'blackout', 'hide text', 'censor', 'privacy', 'pdf sanitize'],
    version: '1.0.0',
    status: 'stable',
    added: '2026-11-19',
    featured: true,
    layout: 'wide',
  },
  {
    id: 'cheque-overlay',
    name: 'Bank Cheque Print Alignment',
    description:
      'Format and print payee, date and rupee words aligned to standard CTS-2010 Indian cheque dimensions.',
    category: 'finance',
    icon: 'Landmark',
    keywords: ['cheque', 'check', 'cts 2010', 'bank', 'print', 'rupees', 'india'],
    version: '1.0.0',
    status: 'stable',
    added: '2026-11-19',
    featured: true,
    layout: 'wide',
  },
  {
    id: 'screenshot-mockup',
    name: 'Clean Screenshot Framer',
    description:
      'Frame raw screenshots with balanced padding, shadows and optional click-to-blur privacy boxes.',
    category: 'image',
    icon: 'Monitor',
    keywords: ['screenshot', 'mockup', 'frame', 'blur', 'share', 'presentation'],
    version: '1.0.0',
    status: 'stable',
    added: '2026-11-19',
    layout: 'wide',
  },
  {
    id: 'subscription-burn',
    name: 'Silent Drain Calculator',
    description:
      'See the real 5-year and 10-year compounded cost of small recurring subscriptions and daily habits.',
    category: 'finance',
    icon: 'TrendingUp',
    keywords: ['subscription', 'habit', 'opportunity cost', 'burn', 'savings', 'sip'],
    version: '1.0.0',
    status: 'stable',
    added: '2026-11-19',
    layout: 'wide',
  },
  {
    id: 'wifi-poster',
    name: 'Guest Wi-Fi Printable Card',
    description:
      'Create a clean tabletop A5 card with a scannable Wi-Fi QR code for your home, office or shop.',
    category: 'generators',
    icon: 'QrCode',
    keywords: ['wifi', 'qr', 'guest', 'poster', 'card', 'print', 'office', 'cafe'],
    version: '1.0.0',
    status: 'stable',
    added: '2026-11-19',
    featured: true,
    layout: 'wide',
  },
];
