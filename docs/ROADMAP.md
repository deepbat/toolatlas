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
- [x] Add a local storage usage overview and backup export/restore page.\n- [ ] Add safe clear-data controls and export reminders.
- [ ] Add offline installation progress, cache failure recovery and selective offline mode.
- [ ] Add fuzzy search, synonyms, category filters and recently-added filters.
- [ ] Add optional copyable diagnostic reports that remain local by default.

## Phase 2: High-value tool collections

### PDF Studio
- [ ] PDF compression with quality and size preview.
- [ ] PDF-to-image export with page selection and resolution controls.
- [ ] Batch image-to-PDF ordering, page size, margins and orientation.
- [ ] PDF form filling where browser-compatible.
- [ ] Page backgrounds and advanced page arrangement.
- [ ] Visual PDF comparison.
- [ ] Warn that editing signed PDFs can invalidate signatures.

### Image Studio
- [ ] Batch resize and convert with per-file output.
- [ ] Passport/photo-print layouts with configurable dimensions.
- [ ] Collage and contact-sheet maker.
- [ ] Screenshot annotation and crop handles.
- [ ] EXIF and metadata viewer, plus clear-metadata export.
- [ ] Optional background removal and upscaling only after model size, device performance, licence and privacy review. Show download size and ask before downloading.

### India Finance and Office Toolkit
- [ ] TDS, HRA, salary structure, EPF and gratuity calculators.
- [ ] Income-tax comparison by financial year and regime, with official references and effective dates.
- [ ] Capital-gains worksheet with explicit FIFO assumptions and editable transactions.
- [ ] FD, RD, SWP and loan amortisation tools.
- [ ] GST invoice and quotation templates with CGST/SGST/IGST selection.
- [ ] Attendance and working-hours calculator with configurable shifts, holidays and overtime rules.
- [ ] CSV/XLSX viewer and export, with formula-injection safeguards.

## Phase 3: Connected workflows
- [ ] Tool-to-tool handoff using typed, in-memory data contracts.
- [ ] Named workflows for photo preparation, invoice creation and PDF submission packs.
- [ ] Personal dashboard with pinned tools and configurable shortcuts.
- [ ] Local workspaces with export/import. Do not imply sync or encryption unless implemented and tested.
- [ ] Reusable clipboard and history with explicit clear controls.
- [ ] Workflow templates with visible steps and clear output destinations.

## Phase 4: Everyday and developer utilities
- [ ] Calendar and working-day planner with selectable country/region holidays.
- [ ] Expense and travel budget tools with CSV export.
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
Current Release 2 contains 87 tools in 13 categories. This roadmap is a plan, not a claim that unchecked features are already available.
