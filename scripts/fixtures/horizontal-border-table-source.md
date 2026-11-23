# Top/bottom outer-rule nested table regression sources

`horizontal-border-table.mjs` preserves four fixed producer PDFs. Each has one two-column, two-row outer grid and an inner two-column table whose second row spans both columns. The inner grid shares exactly the outer top or bottom rule and is inset from the other three outer edges. Top cases use the upper-right cell with text after the inner table; bottom cases use the lower-right cell with text before it. All sources include text before/after the outer table.

- Writer top: python-docx Table Grid, parent cell top margin zero, first empty paragraph removed, inner width two inches. Rendered by LibreOffice 7.3.
- Writer bottom: same source family, lower-right parent bottom margin zero, required final cell paragraph retained at one-point line height. Removing that required paragraph produces malformed Word structure that Writer moves outside the parent, so that invalid source is not used.
- Chromium top/bottom: border-collapse outer table width 600px, fixed column layout; cells have 8px padding except the shared edge's zero padding. The inner grid is 90% width, horizontally centered. Chromium print produces adjoining segmented rules. Bottom fixture is in the outer bottom-right cell, not the internal row boundary.

SHA256 of the original fixed PDFs:

| Fixture | SHA256 |
| --- | --- |
| writer-top | 1027986fcd02db5e82555f9bda3ff9c54b233c5ffeed29715d451bd2688694d2 |
| writer-bottom | 15cbf47cae6330829a5155a9e1e9573fe533e9a7317797baf1f2b10fde8397a9 |
| chromium-top | 049710007efbc9313601791da9d23160a6227e53c4091812777627f9b6b76a24 |
| chromium-bottom | c676f3d82ba5f116d4f82febb10160afd3fe2ec146074d0f093db05afaf0c1af |

Tests assert root/nested ownership, two rows and columns, the inner merged row, unique text, cell selection and before/after order. Synthetic tests also swap merged axes to check rowspan reconstruction and reject partial perimeters. Existing shared-side, ordinary merged, partial and crossing tests remain unchanged.

Scope remains one unambiguous closed inner grid sharing exactly one outer rule. Two or more shared parent edges, internal-boundary attachment and several connected children are not claimed. Original shading, border style, padding, font and exact positioning are not reproduced.
