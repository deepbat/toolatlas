# Exact KB form workflow

The existing `/tools/image-target-size/` tool now has three modes, keeping its route and the 142-tool catalogue intact.

- Photo: choose a decimal KB ceiling. Search JPEG quality first, then reduce dimensions only if permitted. The aspect ratio is kept. Final bytes must be strictly below the limit; files are never padded.
- Signature: adaptive local paper-brightness estimates whiten grey shadows, with a strength slider and before/after previews. Ink is rendered blue on white. Best for dark handwriting on plain paper; faint strokes or textured backgrounds need inspection. The separate signature pad still exports transparent PNG.
- PDF: reorder and combine PDFs, images, or both. PDF-only files are first merged without rasterising. If the merged file is too large, page-image conversion requires explicit opt-in. Each image is placed on an A4 page without cropping. Raster output has a preview for every page, and the final PDF container bytes are checked against the ceiling.

## Limits and honest trade-offs

- KB here means 1,000 bytes, a conservative ceiling for portals using 1,024-byte KB. Supported limits: 5 to 20,000 KB.
- One photo/signature at a time, input up to 20 MB / 24 megapixels. Working canvases are capped at 6 megapixels. Disabling dimension reduction rejects larger images instead of silently resizing them.
- PDF mode: at most 12 files, 24 pages and 80 MB total. No pages are silently discarded. Inputs are processed sequentially to limit memory use. Encrypted, damaged and unsupported documents produce errors.
- PDF raster fitting tries 144 down to 47 dpi, with bounded JPEG quality search. It stops with an error if the target is still impossible; it does not label an oversized file successful. Low-resolution output can make small writing unreadable. Raise the ceiling when possible.
- PDF merging can lose interactive forms/bookmarks and invalidates digital signatures. Raster conversion also removes searchable text and links. Use this workflow for static marksheets, not documents whose signatures or interactive features must remain valid. Keep originals.
- JPEG output flattens transparency onto white and does not carry source photo metadata. Browser-supported JPG, PNG and WebP input only. Animations are flattened to one frame.
- File-size compliance does not promise acceptance by a particular form. Check file format, pixel dimensions, page order and every detail before submitting.
- All processing stays in the browser. No new dependency, account, model download, paid API or server upload.

## Regression coverage

`node scripts/exact-kb-tests.mjs` runs after the existing expanded suite in `npm run test:expanded` and CI. It checks strict final JPEG/PDF bytes, photo resizing and aspect ratio, white-paper cleanup with surviving ink, PDF merge/raster/image modes, every page retained, actual reordered PDF content, flattening consent, invalid and impossible limits, damaged PDF and page-count errors, stale-output clearing, mobile overflow at 360/393 pixels, upload-request absence and browser errors. Generated fixtures and visual evidence are under `test-artifacts/exact-kb/`.
