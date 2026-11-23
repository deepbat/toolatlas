# Two-adjacent-edge corner nested table sources

Fixed Writer and Chromium PDFs have an outer 2x2 grid. A closed inner 2x2 grid shares its top and left edges with the upper-right parent cell. Its second row spans both columns. Text before/after the outer table and after the inner table stays distinct.

Writer source derives from the earlier valid top-sharing python-docx source, setting the parent left cell margin to zero as well as the top margin. Inner width is two inches. LibreOffice 7.3 exports the PDF.

Chromium prints a letter-sized HTML page: outer border-collapse fixed-layout table,580px wide; parent top/left padding zero; inner table75% width with a merged second row. Other cells have8px padding. The source has real adjoining, segmented rules.

PDF SHA256:
- writer:7fe983d7eed1e2898f2aaca3166b7b389117d063611fc7347bc4abf9135024c4
- chromium:4957b9c59e5cfe03f54d026337a15bc02c6c013162a6d6b448d2715222bad731

Acceptance requires one unique closed child/parent decomposition, with exactly two adjacent shared parent-cell edges and no continuation of either free child edge outside its bounds. Partial free perimeters, crossing parent-cell boundaries and ambiguous interpretations stay unsupported. Synthetic tests mirror all four corners; real-PDF assertions check nested ownership, merged row, cell content, unique text and order. Existing one-edge and partial/crossing tests remain unchanged.

This recovers structure, not exact padding, border styles, fonts or position. Several connected children, three-edge attachments and complex internal-boundary cases remain unclaimed.
