import { lazy, type ComponentType, type LazyExoticComponent } from 'react';


const PdfStudio = lazy(() => import('./studio/PdfStudio'));
const ImageStudio = lazy(() => import('./studio/ImageStudio'));
const FinanceTools = lazy(() => import('./studio/FinanceTools'));
const UtilityApp = lazy(() => import('./expanded/UtilityApp'));
const OutboxApp = lazy(() => import('./outbox/App'));
const DeviceApp = lazy(() => import('./device/App'));


/**
 * ToolAtlas 4.0 — Curated 30-Tool Registry (24 signature + 6 uncommon).
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
  'doc-flatten-print': lazy(() => import('./uncommon/DocFlattenPrint')),
  'pdf-redaction-verify': lazy(() => import('./uncommon/TruePdfRedactor')),


  // Privacy Shield (6 kept)
  'id-masker': UtilityApp,
  'photo-pixelator': OutboxApp,
  'remove-exif': lazy(() => import('./new/ExifStripper')),
  'bulk-renamer': lazy(() => import('./new/BulkRenamer')),
  'list-cleaner': lazy(() => import('./new/ListCleaner')),
  'csv-excel-tools': FinanceTools,


  // India Desk (6 kept + 1 new)
  'land-area-india': UtilityApp,
  'exam-age-eligibility': UtilityApp,
  'upi-qr': OutboxApp,
  'income-tax-india': FinanceTools,
  'gst-pan-validator': FinanceTools,
  'number-to-words-inr': FinanceTools,
  'cheque-overlay': lazy(() => import('./uncommon/ChequeOverlay')),


  // Clever Studio (4 kept + 3 new)
  'photo-colouring-page': OutboxApp,
  'colour-blind-simulator': OutboxApp,
  'split-bill': lazy(() => import('./new/SplitBill')),
  'screen-ruler': DeviceApp,
  'screenshot-mockup': lazy(() => import('./uncommon/ScreenshotMockup')),
  'subscription-burn': lazy(() => import('./uncommon/SubscriptionBurn')),
  'wifi-poster': lazy(() => import('./uncommon/WifiPoster')),
};


export const TOOL_COMPONENTS: Record<string, LazyExoticComponent<ComponentType>> = REGISTRY;


export default TOOL_COMPONENTS;
