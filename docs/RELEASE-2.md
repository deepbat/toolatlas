# ToolAtlas 2: Small jobs. Sorted.

87 working tools across 13 categories. The original 35 modules are preserved, with 51 additions.

## Product decisions

The focus is ordinary jobs: a photo that must fit an upload form, pages to extract from a PDF, GST and loan estimates, and text/data cleanup. No fake AI detector, invented live currency rate, server-dependent converter or paid API has been added. Background removal and OCR were left out rather than silently download large AI models onto phones.

Every dependency and font is bundled locally. Tool code is split by capability. The service worker precaches the complete release, so all tools are available offline once installation finishes. The offline cache only manages `toolatlas-` caches and `/toolatlas/` requests; it does not erase other projects on the same GitHub Pages origin.

## Publishing and ads

This release does not earn ad revenue yet. It includes inert, labelled ad spaces away from controls, a privacy policy, contact/support via public GitHub issues, terms, about, six practical guides, per-tool static HTML, canonical URLs, schema and a sitemap. No ad-network code, publisher IDs, analytics or tracking cookies are installed.

Before monetization:

1. Review the site and original content quality, browser compatibility and accessibility.
2. Consider a dedicated domain. Update the base path, canonical origin, sitemap, manifest, service worker scope and 404 redirect together if moving it.
3. Place the real verified ads.txt seller record at the domain root. The project-level `/toolatlas/ads.txt` is only a comment placeholder and does not satisfy a root-level check. Domain-root robots.txt is also outside this project path.
4. Apply to your chosen network yourself. Approval and earnings are not guaranteed.
5. Before enabling ads or analytics, update the privacy policy and implement any required consent and preference controls for the regions you serve. Do not paste a tracking script into this release without that work.
6. Submit the sitemap to a verified search-console property and publish useful original guides based on real user questions. SEO metadata does not guarantee indexing or rankings.

## Limits

Images: modern browser formats; animation is flattened; target-size output is JPEG and may reduce dimensions. Cropping is centered, not a draggable editor. Large inputs have memory guards.

PDFs: encrypted PDFs are rejected. Editing can invalidate signatures. Standard metadata clearing is not forensic sanitization. Watermarks use ASCII text. Inspect output before sharing.

Finance and health tools are estimates, not professional advice. SIP uses beginning-of-month contributions and a constant nominal annual return divided by 12. Currency labels do not perform currency conversion.

Invoice data is not retained. Notes and tasks are browser-local, not synchronized or encrypted. Clearing site data erases them.

No physical Android or iPhone test has been performed. Automated Chromium tests include 393px mobile layouts, file outputs, unicode/CSV edge cases, offline operation and print styling.

## Verification

- `npm run build`: typecheck, production bundle, static-page generation.
- `npm run test:expanded`: functional, file-output, 87-route mobile layout, offline and SEO assertions. Installs a local preview server and cleans it up.
- `npm run test:e2e`: original CDP suite. Requires a running preview and CHROME_PATH if Chrome is not installed in a default path.
- `npm audit`: zero known dependency vulnerabilities at release preparation.

Rollback source: commit `cf1d92a`, before this release. Generated static files are build output, not hand-maintained copies.
