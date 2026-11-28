# Alternative on-device Office engine, 28 November 2026

Not production-enabled. No release approval is implied by these fixture results.
Bench harness lives in `scripts/alt-engine/`; fonts are fetched by
`scripts/alt-engine/fetch-fonts.sh` (all OFL/Apache-2.0, gitignored).

## Why

User direction 28/11: "find some alternative. do not rely on one thing" (the
ZetaOffice/allotropia route is held pending vendor source correspondence).
This route needs no vendor, no server, no paid service, no 1 GiB WASM
reservation and no cross-origin isolation.

## Architecture

1. `docx-preview` (MIT) renders DOCX to DOM in-browser. Injected `@font-face`
   rules alias Word families (Calibri/Cambria/Times New Roman) to bundled
   metric-compatible clones (Carlito/Caladea/Tinos) and route Indic Unicode
   ranges to bundled Noto fonts, so the browser lays out with the exact TTFs
   the painter embeds.
2. `painter.js` walks the rendered DOM per section and paints a vector PDF
   with pdfkit: backgrounds and borders as vectors, images embedded, text
   shaped with fontkit (bundled inside pdfkit) and placed at DOM-measured
   positions.
3. Text extraction exactness by construction:
   - Non-reordered runs (Latin etc.): normal embedded-subset text at absolute
     positions.
   - Reordered runs (Indic matras): visible glyphs are drawn as vector paths;
     an invisible (render mode 3) layer carries the source text encoded one
     CID per code point in a tiny blank composite font with an exact
     ToUnicode map (technique ported from `src/tools/pdfsuite/unicodeLayer.ts`).
     No shaping in that layer, so no reader can reorder it.
   - Each line is also wrapped in `/Span<</ActualText ...>>` for readers that
     honor ActualText (Poppler, Acrobat).
4. External resources are never fetched: the external-image fixture's
   relationship resolves to a broken placeholder; zero external requests were
   observed in the harness request log.

## Fixture results (28/11, headless Chrome 157)

`complex.docx`, `embedded-image.docx`, `external-image.docx`:
- Poppler `pdftotext`: exact authored Hindi/Punjabi strings, all content,
  headers/footers on both pages, explicit page break honored. No syntax
  errors.
- PDF.js `getTextContent`: exact strings (verified 4/4 repeat runs).
- MuPDF `toStructuredText`: exact strings.
- Visual inspection of rendered pages: conjuncts (क्ष, ज्ञ, ਸ੍ਰੀ, ਕ੍ਰਿਪਾ)
  correct, nested/merged table borders, heading color rule, red embedded
  square, broken-image placeholder only for the external image.
- `external-image.docx` converts cleanly (the case that crashes the
  ZetaOffice WASM build with a function-signature mismatch).
- Fonts embedded: CID TrueType subsets, Identity-H, with ToUnicode
  (pdffonts-verified).
- `verify-readers.mjs` asserts all of the extraction claims above.

## Integration state (28/11, branch feat/alt-office-engine)

- The painter is the Suite's default Word/Excel to PDF output: Suite.tsx
  paints rendered sections through `officePainterEngine.paintSections`
  (vector PDF, real text) instead of rasterising pages for an image PDF.
  The radio copy says so honestly ("PDF with real text (recommended)").
  The print view is unchanged. The engine loads on demand
  (officePainterEngine chunk 213 KB, fontkit split to its own 393 KB chunk,
  both under the 600 kB budget; entry chunk unchanged at 437 kB).
- `officePainter.ts` is the strict-TS port of the bench painter. Indic runs
  always take the vector-path + invisible exact-text route; the invisible
  layer is Tz-fitted to the painted box (unicodeLayer.ts trick) or pdf.js
  invents spaces and splits words at larger sizes. The bench painter
  (scripts/alt-engine/painter.js) carries the same fixes.
- Excel: `workbookToPaintHtml` (office2pdf.ts) replaces the basic SheetJS
  table route: print areas honoured (defined names), simple arithmetic
  formulas evaluated (CE drops uncached results), header/footer strings read
  from the sheet XML via jszip, one PDF page per worksheet, column widths
  kept. Charts, cell fills/fonts and orientation remain absent, and the UI
  note says so.
- `localOffice.ts` (WASM popup driver) is restored untouched; the WASM page,
  its engine and its tests are untouched. The alt protocol page
  (office-engine/alt/converter.html) remains as the protocol-level harness.
- Isolation: `isolation-sw.js` allowlists the alt engine's exact paths; the
  alt page registers the SW (scope /office-engine/alt/) and awaits it before
  fetching fonts. `local-office-network-tests.mjs` covers the alt page:
  allowlisted 200s with CSP headers, path-escape/query/POST 403s, external
  fetch and blob-worker exfiltration denied.
- Suite-level e2e: `office-painter-e2e.mjs` drives the real UI for
  word-to-pdf and excel-to-pdf against vite preview and asserts exact Indic
  extraction, stored page breaks, repeating header/footer, formula results
  and print-area exclusion.
- Green: tsc, pdfsuite-tests.mjs (112 browser checks incl. exact Indic words
  with selection geometry and one-page-per-worksheet), painter e2e, both
  isolation suites, session tests, pdfsuite-unit, engine lifecycle, asset
  hashes, 9 quality checks, 22 exact-KB checks. pdfkit added (MIT; notices
  and reviewed-deps updated); jszip promoted to a direct dependency (dual
  MIT/GPL, taken as MIT).
- Not yet: pushed/PR (waiting on a working GitHub PAT), CI run.

## Known limitations / not yet done

- Painter is young: multi-run mixed-formatting lines, hyperlinks, rotated
  objects and unusual page sizes are characterized on the fixture set only.
  VML text boxes render in-flow (docx-preview limit, content preserved).
- XLSX: SheetJS CE preserves values, merges, column widths, Indic text,
  print areas, header/footer and simple formulas, but not charts, cell
  styles or orientation; no free on-device route matches ZetaOffice XLSX
  fidelity.
- Selection highlight geometry on Indic lines follows the Tz-fitted
  invisible layer (per-line box), not per-glyph. Copy and search are exact;
  visual selection granularity is coarser on those lines only.
- Arial has no bundled metric clone yet (Arimo went variable-only upstream);
  unknown families fall back to Noto Sans/Serif with a painter warning.

## References

- Recovery source: delivered project ZIP (Drive file 1enqDLbPUzNu8LUNzRFx-Kp3-St3JXgNi)
- Blank-font technique: `src/tools/pdfsuite/unicodeLayer.ts`
- Prior engine notes: `docs/engineering/local-office-prototype.md`
