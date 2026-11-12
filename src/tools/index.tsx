import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * Application registry.
 *
 * Every tool is an independent module that is code-split out of the main
 * bundle. The catalogue (`src/lib/catalog.ts`) holds the metadata — name,
 * description, category, icon, keywords, version and availability status —
 * so adding a tool never requires touching this file's typing or the shell.
 *
 * To add a new tool:
 *   1. create `src/tools/<id>/App.tsx` with a default export,
 *   2. add an entry to `TOOLS` in `src/lib/catalog.ts`,
 *   3. add the lazy import below.
 *
 * The `TOOL_COMPONENTS` keys are checked against the catalogue at build time
 * (see `src/tools/registry.test-d.ts`-style assertions in `App.tsx`), so a
 * missing or unknown id fails loudly instead of rendering an empty page.
 */
const REGISTRY = {
  // Calculators
  calculator: lazy(() => import('./calculator/App')),
  'percentage-calculator': lazy(() => import('./percentage-calculator/App')),
  'bmi-calculator': lazy(() => import('./bmi-calculator/App')),
  'tip-calculator': lazy(() => import('./tip-calculator/App')),

  // Converters
  'unit-converter': lazy(() => import('./unit-converter/App')),
  'temperature-converter': lazy(() => import('./temperature-converter/App')),

  // Date & time
  'age-calculator': lazy(() => import('./age-calculator/App')),
  'date-difference': lazy(() => import('./date-difference/App')),
  'timezone-converter': lazy(() => import('./timezone-converter/App')),
  countdown: lazy(() => import('./countdown/App')),

  // Financial
  'loan-emi-calculator': lazy(() => import('./loan-emi-calculator/App')),
  'compound-interest': lazy(() => import('./compound-interest/App')),
  'savings-goal': lazy(() => import('./savings-goal/App')),

  // Text & writing
  'word-counter': lazy(() => import('./word-counter/App')),
  'case-converter': lazy(() => import('./case-converter/App')),
  'text-diff': lazy(() => import('./text-diff/App')),
  'lorem-ipsum': lazy(() => import('./lorem-ipsum/App')),

  // PDF & documents
  'image-to-pdf': lazy(() => import('./image-to-pdf/App')),
  'pdf-merge': lazy(() => import('./pdf-merge/App')),

  // Image & media
  'image-compressor': lazy(() => import('./image-compressor/App')),

  // File utilities
  'file-checksum': lazy(() => import('./file-checksum/App')),

  // Productivity
  'todo-list': lazy(() => import('./todo-list/App')),
  'quick-notes': lazy(() => import('./quick-notes/App')),
  pomodoro: lazy(() => import('./pomodoro/App')),

  // Developer
  'json-formatter': lazy(() => import('./json-formatter/App')),
  base64: lazy(() => import('./base64/App')),
  'hash-generator': lazy(() => import('./hash-generator/App')),
  'jwt-decoder': lazy(() => import('./jwt-decoder/App')),
  'regex-tester': lazy(() => import('./regex-tester/App')),

  // Generators
  'password-generator': lazy(() => import('./password-generator/App')),
  'qr-code-generator': lazy(() => import('./qr-code-generator/App')),
  'uuid-generator': lazy(() => import('./uuid-generator/App')),
  'color-palette': lazy(() => import('./color-palette/App')),

  // Misc & internet
  'color-converter': lazy(() => import('./color-converter/App')),
  'url-parser': lazy(() => import('./url-parser/App')),
};

/**
 * Public map consumed by the tool page. It is intentionally widened to
 * `Record<string, …>` so a URL can be looked up by an arbitrary string; the
 * literal shape is kept internally for the compile-time sync check in
 * `src/tools/registry.check.ts`.
 */
export const TOOL_COMPONENTS: Record<string, LazyExoticComponent<ComponentType>> = REGISTRY;

export default TOOL_COMPONENTS;
