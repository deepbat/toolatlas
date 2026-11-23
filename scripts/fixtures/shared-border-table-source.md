# One-side-shared nested table regression sources

The two PDFs in `shared-border-table.mjs` are fixed inputs, not generated during a test. Both have a two-by-two outer table, an inner two-column table with a merged second row in the upper-right cell, and text before/after each table. The inner right rule coincides with the outer right rule.

- Writer: generated with python-docx and rendered with LibreOffice 7.3, using a full-width inner Table Grid in its parent cell. Parent cell padding leaves the inner left side inset; the right side touches the parent rule. The saved source PDF returned no ruled grids before this repair.
- Chromium: printed from the HTML below with Playwright Chromium, default page settings. Its border lines arrive as multiple adjoining segments, unlike the Writer fixture.

SHA256:
- `writer-source.pdf`: `8ad53b9032f153804079a644058a8fa00c56e6fe87b6d27074e6fc8cdbb362c4`
- `chromium-source.pdf`: `55393e70dff31b8990b3616e9cdb5aefc2211887afafaf3f359de2823694e70c`

Chromium source:
```html
<style>body{font:16px Arial}table{border-collapse:collapse}td{border:1px solid black;padding:8px}table.outer{width:600px;table-layout:fixed}table.inner{width:calc(100% + 9px);margin-right:-9px}p{margin:8px 0}</style><p>Before the outer table</p><table class="outer"><tr><td>Outer A</td><td><p>Before inner</p><table class="inner"><tr><td>in1</td><td>in2</td></tr><tr><td colspan="2">inspan</td></tr></table><p>After inner</p></td></tr><tr><td>Outer C</td><td>Outer D</td></tr></table><p>After the outer table</p>
```

Scope: one closed inner grid sharing only a left/right outer rule, inset on the other three sides. Ordinary valid merged grids are handled first and are never reinterpreted as nested. Partial borders and grids crossing parent cells are negative tests; both-side grids remain flat rather than guessing nesting. Top/bottom sharing and multiple connected inner tables are not claimed.
