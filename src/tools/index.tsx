import { lazy, type ComponentType, type LazyExoticComponent } from 'react';


const PdfStudio = lazy(() => import('./studio/PdfStudio'));
const ImageStudio = lazy(() => import('./studio/ImageStudio'));
const FinanceTools = lazy(() => import('./studio/FinanceTools'));
const UtilityApp = lazy(() => import('./expanded/UtilityApp'));
const OutboxApp = lazy(() => import('./outbox/App'));
const PdfSuite = lazy(() => import('./pdfsuite/Suite'));


/**
 * ToolAtlas 4.0 — Curated 26-Tool Registry (18 signature + 8 uncommon).
 * Drop this file into `src/tools/index.tsx`.
 */
const REGISTRY = {
  // Portal & Print (8 kept + 2 new)
  'pvc-card-maker': lazy(() => import('./new/PvcCard')),
  'image-target-size': lazy(() => import('./exact-kb/App')),
  'passport-photo': ImageStudio,
  'signature-maker': lazy(() => import('./new/Signature')),
  'pdf-editor': lazy(() => import('./pdf-editor/App')),
  'pdf-compare': PdfStudio,
  'pdf-form-filler': PdfStudio,
  'pdf-background': PdfStudio,
  'pdf-merge': lazy(() => import('./pdf-merge/App')),
  'image-to-pdf': lazy(() => import('./image-to-pdf/App')),
  'pdf-compress': PdfStudio,
  'pdf-split': PdfStudio,
  'pdf-to-images': PdfStudio,
  'pdf-extract-text': PdfStudio,
  'doc-flatten-print': lazy(() => import('./uncommon/DocFlattenPrint')),
  'pdf-redaction-verify': lazy(() => import('./uncommon/TruePdfRedactor')),
  'pdf-delete-pages': PdfSuite,
  'pdf-crop': PdfSuite,
  'pdf-header-footer': PdfSuite,
  'pdf-bates': PdfSuite,
  'pdf-rotate': PdfSuite,
  'pdf-watermark': PdfSuite,
  'pdf-page-organiser': PdfSuite,
  'pdf-nup': PdfSuite,
  'pdf-booklet': PdfSuite,
  'pdf-flatten': PdfSuite,


  // Privacy Shield (4 kept + 2 new)
  'id-masker': UtilityApp,
  'photo-pixelator': OutboxApp,
  'remove-exif': lazy(() => import('./new/ExifStripper')),
  'bulk-renamer': lazy(() => import('./new/BulkRenamer')),
  'image-ocr': lazy(() => import('./uncommon/ImageOcr')),
  'file-converter': lazy(() => import('./uncommon/FileConverter')),


  // India Desk (6 kept + 1 new)
  'land-area-india': UtilityApp,
  'exam-age-eligibility': UtilityApp,
  'upi-qr': OutboxApp,
  'income-tax-india': FinanceTools,
  'gst-pan-validator': FinanceTools,
  'number-to-words-inr': FinanceTools,
  'cheque-overlay': lazy(() => import('./uncommon/ChequeOverlay')),


  // Clever Studio (3 new)
  'screenshot-mockup': lazy(() => import('./uncommon/ScreenshotMockup')),
  'subscription-burn': lazy(() => import('./uncommon/SubscriptionBurn')),
  'wifi-poster': lazy(() => import('./uncommon/WifiPoster')),
};


export const TOOL_COMPONENTS: Record<string, LazyExoticComponent<ComponentType>> = REGISTRY;


export default TOOL_COMPONENTS;
