# Quality checks

Everything runs locally in Node and Playwright. No paid service or secret is needed.

| Command | What it checks |
|---|---|
| `npm run build` | `tsc` (strict) and the Vite build, then static pages, sitemap, service worker and offline file list |
| `npm run test:search` | Search ranking, synonyms, did-you-mean, Hindi and Punjabi words |
| `npm run test:unit` | Pure logic of the PDF, image and India finance tools |
| `npm run test:expanded` | Every tool page at 393px, utility tools run end to end |
| `npm run test:studio` | PDF, image, finance and office tools, platform pages, 360px and 390px overflow |
| `npm run test:quality` | Licences, reviewed dependency list, no `eval` or unsanitised HTML, no secrets, no analytics, bundle budget |
| `npm run test:a11y` | Every static page at 393px: lang, title, main landmark, one h1, image alt text, names on controls and fields |
| `npm run test:pdf-editor` | PDF editor behaviour. Writes to `/downloads`, so it runs locally only, not in CI |

## Bundle budget

Entry chunk under 450 kB, any other chunk under 600 kB, total JavaScript under 4 MB. Heavy libraries are lazy-loaded by the tools that need them.

## Accessibility notes

- `Field` links its label to its control automatically.
- Icon-only buttons get an `aria-label`.
- Automated checks do not replace a screen reader pass. That has not been done.

## Not covered

- No timing on real phones. Large PDFs and images depend on device memory.
- Hindi and Punjabi navigation text needs a native-speaker review.
- Selective offline downloads are not built. Offline is all or nothing.
