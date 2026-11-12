# ToolAtlas 3.0 Roadmap

This roadmap turns ToolAtlas from a directory of independent utilities into a dependable, privacy-first toolkit. Reliability and usability come before adding a large number of tools.

## Product principles
- Preserve browser-first processing. Files stay on-device unless a future feature clearly explains external processing and obtains consent.
- No fake live data, misleading AI claims or interface-only placeholders.
- Every tool needs input validation, useful empty/error states, keyboard and mobile support, documentation and automated coverage.
- Keep dependencies local. Do not download large models without explicit user action.
- Finance, tax and health tools must state assumptions, jurisdiction and effective date. They are estimates, not professional advice.
- Do not add analytics, advertising or third-party tracking without privacy, consent and regional compliance review.

## Phase 1: Foundation and quality
- [x] Correct catalogue count and testing documentation.
- [x] Add pull-request CI for production build and expanded Chromium regression tests.
- [ ] Test physical Android and iOS devices, including file pickers, downloads, print, keyboard and low-memory behaviour.
- [ ] Audit keyboard-only and screen-reader use.
- [ ] Add automated accessibility and contrast regression tests.
- [x] Add versioned export/import for ToolAtlas local storage, including favourites, notes and tasks, with schema validation and rollback on restore errors.
- [x] Add a local storage usage overview and backup export/restore page.
- [x] Add safe clear-data controls with confirmation and backup reminders.
- [ ] Add offline installation progress, cache failure recovery and selective offline mode. Progress, repair of missing files with retry, an offline banner, a new-version prompt and install steps shipped (/offline). Selective offline mode is pending because each tool loads its own code chunks and a partial copy would break.
- [x] Add typo-tolerant search, practical synonyms, category filters and a recently-added filter.
- [x] Add optional local diagnostic report export without saved note/task contents.

## Phase 2: High-value tool collections

### PDF Studio
- [x] PDF page organiser with custom page order, page removal and duplication.
- [x] PDF compression with quality and size preview.
- [x] PDF-to-image export with page selection and resolution controls.
- [ ] Batch image-to-PDF ordering, page size, margins and orientation.
- [x] PDF form filling where browser-compatible.
- [ ] Page backgrounds and advanced page arrangement. Background and colour shipped; advanced arrangement is still pending.
- [x] Visual PDF comparison.
- [ ] Warn that editing signed PDFs can invalidate signatures.

### Image Studio
- [x] Batch resize and convert with per-file output.
- [x] Passport/photo-print layouts with configurable dimensions.
- [x] Collage and contact-sheet maker.
- [ ] Screenshot annotation and crop handles. Annotation shipped; draggable crop handles are still pending (crop uses sliders).
- [x] EXIF and metadata viewer, plus clear-metadata export.
- [ ] Optional background removal and upscaling only after model size, device performance, licence and privacy review. Show download size and ask before downloading. A non-AI colour-key remover and a plain enlarger shipped; model-based versions remain pending.

### India Finance and Office Toolkit
- [x] TDS, HRA, salary structure, EPF and gratuity calculators.
- [x] Income-tax comparison by financial year and regime, with official references and effective dates.
- [ ] Capital-gains worksheet with explicit FIFO assumptions and editable transactions.
- [ ] FD, RD, SWP and loan amortisation tools. FD, RD and loan amortisation shipped; SWP is still pending.
- [ ] GST invoice and quotation templates with CGST/SGST/IGST selection. Invoice shipped; quotation templates are still pending.
- [ ] Attendance and working-hours calculator with configurable shifts, holidays and overtime rules.
- [x] CSV/XLSX viewer and export, with formula-injection safeguards.

## Phase 3: Connected workflows
- [ ] Tool-to-tool handoff using typed, in-memory data contracts.
- [ ] Named workflows for photo preparation, invoice creation and PDF submission packs.
- [ ] Personal dashboard with pinned tools and configurable shortcuts.
- [x] Local workspaces with export/import. Do not imply sync or encryption: the page says plainly that nothing syncs or is encrypted.
- [ ] Reusable clipboard and history with explicit clear controls.
- [ ] Workflow templates with visible steps and clear output destinations.

## Phase 4: Everyday and developer utilities
- [ ] Calendar and working-day planner with selectable country/region holidays. A working-day counter shipped; regional holiday lists are still pending.
- [ ] Expense and travel budget tools with CSV export. Expense and petty cash tracker shipped; travel budget is still pending.
- [ ] World clock using browser time-zone data.
- [ ] Electricity and fuel calculators with editable local tariffs.
- [ ] Indian PIN-code reference only if a trustworthy, maintainable data source is available.
- [ ] API request builder with a clear warning before sending data to a remote host.
- [ ] SQL, HTML, CSS, JavaScript and XML formatters/minifiers.
- [ ] Cron expression explainer and generator.
- [ ] Barcode and QR reader using camera only after permission.

## Phase 5: Growth and sustainability
- [ ] Choose a distinctive domain and check name/trademark availability before purchase.
- [ ] Move GitHub Pages base path, canonical URLs, sitemap, manifest, service-worker scope and 404 handling together.
- [ ] Publish original guides based on actual user tasks, with examples and limitations.
- [ ] Add contribution process, security disclosure guidance and tool quality checklist.
- [ ] Consider optional donations or advertising only after privacy, consent, disclosure and regional compliance reviews.
- [ ] Never promise search ranking, network approval or revenue.

## Release gate for every new tool
1. Works with realistic and malformed inputs.
2. Clear validation and error messages.
3. Usable at 320px, 393px and desktop widths.
4. Keyboard navigation and accessible labels.
5. Outputs tested, including downloaded files where relevant.
6. Offline behaviour tested if described as offline-capable.
7. Privacy behaviour and external network use documented.
8. Included in catalogue, search, static deep-link pages and sitemap.
9. Dependencies and licences reviewed.
10. Build and relevant regression tests pass.

## Current scope
Current release contains 120 tools in 13 categories (Studio batch 1 added 14 PDF and image tools, batch 3 added 7 office and finance tools (salary structure, PPF, CAGR, rent receipt, GST invoice, expense tracker, CSV and Excel utilities), batch 2 added 10 India finance and date tools). This roadmap is a plan, not a claim that unchecked features are already available.

## PDF editor responsiveness

- Done: page content streams are tokenised once and indexed, so tapping text to edit no longer re-parses the page for every text item. Zoom re-renders after 250 ms and the canvas is capped at 8 megapixels. Background colour sampling reads two strips instead of many single pixels. Covered by a unit test of 400 lookups and the PDF editor suite (`npm run test:pdf-editor`). Timing on a physical low-end phone has not been measured yet.

## Platform progress

- Done: Workspaces page (`/workspaces`) with named tool sets, reorder, JSON export and a validated import. Free apps page (`/resources`) with 25 links that were opened and checked, each marked with its licence. Search suggests a correction when nothing matches and understands a few Hindi words (for example vetan, byaj, kagaz).
- Pending: workspace tool chaining as a guided flow, a reusable clipboard history, a customisable pinned dashboard on Home, Hindi and Punjabi tool names and descriptions, selective offline downloads.

## Language support

- Done: English, Hindi and Punjabi navigation labels (header, mobile menu, footer) with a language selector that remembers your choice and sets the page language. Search understands common Hindi and Punjabi words in Devanagari and Gurmukhi script.
- Pending: Hindi and Punjabi tool names, descriptions and tool screens. Only Latin font subsets are bundled, so Hindi and Punjabi text uses your device fonts. Translations should be reviewed by a native speaker before they are treated as final.

## Quality and accessibility progress

- Done: automated accessibility audit of every static page at 393px (`npm run test:a11y`), licence, secrets, unsafe HTML and bundle checks (`npm run test:quality`). See [QUALITY.md](QUALITY.md).
- Pending: customisable dashboard. Favourites and Recent already cover pinning.
- Skipped on purpose to keep the interface simple: clipboard history and guided tool chaining.
- Pending: selective offline downloads, translated tool names and descriptions, a manual screen reader pass, quotation templates, SWP calculator, travel budget.
