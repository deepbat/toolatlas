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

- The painter engine is wired as the on-device converter: `localOffice.ts`
  opens `office-engine/alt/converter.html` and skips the LibreOffice-specific
  repair pass for painter output (`engine: 'painter'` in the converted
  message). The WASM page, its isolation and its tests are untouched.
- `scripts/build-alt-engine.mjs` bundles `scripts/alt-engine/entry-converter.js`
  to `public/office-engine/alt/engine.js` (413 KB gzip, converter-popup only)
  and writes a sha256 font manifest. Fonts are committed under `alt/fonts/`.
- XLSX goes through the same painter: SheetJS CE tables with print-area
  exclusion (privacy-asserted by the fixture), header/footer strings read
  from sheet XML, simple arithmetic formulas evaluated in-page (CE drops
  uncached formula results). Charts, cell fills/fonts and orientation are
  still absent.
- Verified end to end through the real BroadcastChannel protocol in headless
  Chrome on 7 fixtures. Existing suites green: engine lifecycle, network
  isolation, asset hashes; tsc clean. Not yet covered: alt-page network
  isolation assertions (the network test still targets the WASM page),
  Playwright e2e through the real Suite UI, CI.

## Known limitations / not yet done

- Painter is bench-grade: multi-run mixed-formatting lines, list markers,
  hyperlinks, rotated/floating objects and page-size edge cases are not
  characterized yet. VML text boxes render in-flow (docx-preview limit,
  content preserved).
- XLSX is out of scope for docx-preview. SheetJS CE preserves values, merges
  and Indic text but not charts, cell styles, print areas or orientation; no
  free on-device route matches ZetaOffice XLSX fidelity.
- Selection highlight geometry on reordered (Indic) lines sits at the
  segment origin, not per-glyph (zero-advance invisible layer). Copy and
  search are exact; visual selection is degraded on those lines only.
- Not yet integrated into the app or CI: no UI wiring, no PR, no green
  checks. docx-preview + pdfkit/fontkit add ~1.4 MB uncompressed bench
  bundle, on-demand only; integration must measure the real chunk.
- Arial has no bundled metric clone yet (Arimo went variable-only upstream);
  unknown families fall back to Noto Sans/Serif with a painter warning.

## References

- Recovery source: delivered project ZIP (Drive file 1enqDLbPUzNu8LUNzRFx-Kp3-St3JXgNi)
- Blank-font technique: `src/tools/pdfsuite/unicodeLayer.ts`
- Prior engine notes: `docs/engineering/local-office-prototype.md`
