# Borderless right-aligned numeric table sources

Fixed producer PDFs in `borderless-numeric-table.mjs` contain Product/Units/Amount headers, Apples/7/12.50, Oranges/125/1234.00 and Pears/23/85.75. Units and Amount are right-aligned, while the product labels are left-aligned. Text before and after the table must remain outside it.

- Writer: python-docx four-row three-column table without a table style or borders, two-inch fixed column widths, bold first row and right-aligned numeric columns. LibreOffice 7.3 PDF export.
- Chromium: HTML table, 600px fixed layout, no borders, 8px cell padding, 16px Arial, first column left-aligned and remaining columns right-aligned. Chromium print to PDF.

SHA256:
- Writer: 611b6fc12e06fa895be8c5b87139260f77e147f222b34e75fdccd45733420e8f
- Chromium: 1666b6c5a614e51142f289b81dd7e6cec5657b9423f7da3a849710fdfd94b42a

Before the repair, both sources became separate paragraphs for the header and first two body rows, then a false table containing the last row and the following prose. Tests check the exact four-by-three table and unique outside text. Detection needs at least two complete numeric body rows agreeing on right edges, a separate label header and left-aligned row labels. OCR word boxes, shifted right edges, lone rows, widely separated lines and prose are negative tests.

This preserves cell contents and ownership, not original styling. Output tables currently have visible borders, left-aligned contents and estimated widths. Borderless styling and numeric alignment preservation are not claimed.
