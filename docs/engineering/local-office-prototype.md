# Local Office prototype, 24 November 2026

Not production-enabled. No release approval is implied by these fixture results.

## Reproduce

- `node scripts/local-office-assets.mjs` downloads pinned runtime/font assets and verifies hashes. Large assets stay ignored.
- `npx tsx scripts/local-office-pdf-tests.ts` checks saved authored Office exports and rejection cases.
- `npx tsx scripts/office-ttf-tests.ts` checks every code in six embedded subset fonts and rejects malformed bounds.
- `node scripts/local-office-assets-tests.mjs` checks hash failures and chunk reconstruction.
- `node scripts/local-office-session-tests.mjs` checks session success, invalid result, engine error, timeout, abort and blocked popup.
- `OFFICE_INPUT=scripts/fixtures/office-engine/complex.docx OFFICE_NAME=complex.docx OFFICE_OUTPUT=/tmp/complex.pdf node scripts/local-office-probe.mjs` exercises the real isolated engine popup. XLSX works with the corresponding extension.

## Findings

The authored DOCX preserves explicit page break, headers/footers, nested/merged table and floating text box. XLSX preserves formulas, chart series, landscape and print-area exclusion. Original WASM exports paint Indic correctly but PDF.js and MuPDF do not extract their ActualText clusters correctly.

Repair uses shaped glyph outlines from the embedded subset font, not rasterization or reshaping. It replaces text on affected-font pages with vector paths and one exact logical text layer. PDF.js, Poppler and MuPDF extract tested Hindi/Punjabi exactly. Native font text editing and existing tagged accessibility structure are lost on repaired pages. This is a material tradeoff, not general Sejda-equivalent fidelity.

A bounded TrueType decoder replaces an initially tested large font package. No new runtime package remains. Standalone repair bundle including pdf-lib is about446KB uncompressed,185KB gzip. This is NOT the final integrated chunk budget: the helper is not UI-reachable yet.

The scoped converter popup is required because an iframe inside the nonisolated app did not acquire cross-origin isolation. Scoped worker headers, CSP, path allowlist and macro/update disabling restrict the local engine. Document contents are not sent to any conversion server. Runtime assets are self-hosted in20MiB pieces.

## Remaining gates

- Pinned runtime reserves1GiB shared WASM memory. Desktop emulation does not prove a real phone can run it. Smaller custom build needs more than the available2GiBRAM/16GBdisk environment.
- LibreOffice engine commit is known, but exact Qt/Qtbase/Emscripten dependency revisions and complete matching source/build correspondence are not yet established. Vendor README links mutable branches. Do not distribute based on these notices alone.
- Rotation, nested forms, page transforms, clipping/render modes, character spacing and unsupported embedded font formats reject rather than silently corrupt. General layout fidelity is unproved.
- Browser e2e above is local Vite. No remote PR, live hosting or installed Windows proof for this prototype.
- Existing CI and deploy workflows are unchanged. Desktop publication remains held.

## Primary references

- https://github.com/LibreOffice/core/commit/efaf0670b4d055f838a2849becb10f08aa06a257
- https://raw.githubusercontent.com/LibreOffice/core/efaf0670b4d055f838a2849becb10f08aa06a257/static/README.wasm.md
- https://raw.githubusercontent.com/allotropia/zetajs/main/README.md
- https://learn.microsoft.com/en-us/typography/opentype/spec/glyf
- https://learn.microsoft.com/en-us/typography/opentype/spec/cmap
- https://learn.microsoft.com/en-us/typography/opentype/spec/loca

## Recovery validation,25November2026

Original local-only commits were unavailable after a workspace reset. Source was recovered and reconstructed, runtime/assets re-fetched with the original SHA-256 pins, and complex DOCX/XLSX fixtures regenerated. This recovery is not a byte-identical original commit. Typecheck, build, existing full unit suite, quality11, asset checks, six session cases, seven PDF rejection/no-change cases, complex fixture checks and six-font decoder checks pass again. Real popup conversion and PDF.js/Poppler/MuPDF exact Indic checks pass. One first DOCX run timed out; the immediate repeat and repaired run passed, so startup reliability remains an open item. No runtime is cleared for distribution.

## Startup reliability checks

Local engine startup now has explicit manifest response checking, download/start/convert phase deadlines, runtime-abort and uncaught startup error reporting, idempotent failure, and late-message suppression after cancellation. These checks prevent a known failure from waiting silently for the overall session timeout; they do not prove the underlying one-off cold startup timeout is fixed. `node scripts/local-office-engine-tests.mjs` checks seven lifecycle paths including digest mismatch and the service-worker allowlist/response headers. The real-popup DOCX and XLSX fixture conversions were rerun successfully after these changes. Browser-level malicious-document networking is not established by this policy unit test.

Recovery provenance note: Noto-copyright.txt was recreated from upstream OFL text, rather than restoring the previous Debian copyright document. That license inventory needs reconciliation before any runtime distribution.

Browser network verification: `node scripts/local-office-network-tests.mjs` registers and activates the real scoped service worker in Chromium, confirms isolation/header policy, denies same-origin outside paths, queries and POST, and confirms page and blob-worker external fetches cannot reach the network. These probes are not a full Office document exploit audit or a claim about all browser versions.

## External versus embedded image characterization

Authored fixtures are generated by `scripts/fixtures/office-engine/external-image.py`. `external-image.docx` has an external image relationship to an intentionally non-resolving test domain. In the real-popup, deny-external-network probe it reproducibly triggers a pinned WASM function-signature mismatch, then a reported conversion failure, with zero external requests observed. `embedded-image.docx`, using an embedded red PNG, converts successfully with exact Hindi copy text and a visible red square, inspected at page scale. These are different source documents, not proof of identical layout equivalence.

Use OFFICE_DENY_EXTERNAL=1 for these probes. OFFICE_EXPECT_FAILURE=1 characterizes the known external-link failure and requires reassessment if the runtime behavior changes; it is not a product success assertion. No linked content is stripped or fetched. Runtime/library repair or a source-grounded new build is needed to support this document without silent loss.
