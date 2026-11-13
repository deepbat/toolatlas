# Platform and practical tools upgrade

141 tools, 8 top-level sections, 15 collections. React + TypeScript + Vite with generated static routes, not Astro. The seven requested tool outcomes add six new routes because invoice-generator already existed.

## Platform

- Search keeps the existing zero-dependency ranked catalog index, with typo tolerance, substring matching, shrink/compress aliases, keyboard selection, Esc/outside close, a focus trap and return to the opener. The placeholder uses the real tool count. Generated catalog.json now carries title, URL, category, description and keywords.
- Pin any individual tool near its title. The homepage shows pinned/recent links above the category directory, with unpin and clear-history controls. Recents are capped at six; old stored data is validated. Existing favourites stay intact. The personal strip scrolls sideways to preserve the first-screen category layout.
- Related tools use explicit workflow maps for common PDF, image, signature, invoice and fuel jobs, then category-based suggestions elsewhere.
- Homepage file selection/drop recognizes PDF, browser-supported images, video, audio, JSON, CSV and TXT. Only receiving tools with a tested file/text-input path are suggested, not every vaguely related tool. MIME detection and extension fallback are hints; each tool still validates format and limits.
- Temporary output handoff supports files and compatible PDF/image/audio/video/text receivers. Existing studio send-to controls now use the same IndexedDB path and preserve multi-file handoffs. A token in the URL identifies the handoff, not its contents. Same-tab in-memory fallback works if IndexedDB is blocked. Files are removed when consumed, expire after 10 minutes, and stale records are removed on the next app start. A closed browser cannot run its expiry timer. Maximum transfer is 100 MB total. Settings clear-data also clears these temporary files. Keep original copies.
- Common image, PDF, media and utility results offer the next-tool control as soon as output is produced. Other export-only tools offer it once the local export is generated. Existing studio controls remain beside their result. The shared result selector appears above the workspace to avoid rewriting each independent tool.
- A generated service worker precaches the whole release, including fonts, tools, PDF worker and static pages. Immutable assets are cache-first; navigations are stale-while-revalidate. Versioned cache cleanup keeps unrelated caches. A brief ready notice appears after successful installation. Offline is not guaranteed merely by opening the first page: installation must finish, storage must be available and the browser must not evict it. The Offline page still checks and repairs missing files. Microphone and browser codec permissions/support remain device-specific.
- Shareable calculator/date/converter/text states are opt-in, rather than silently writing private text or money values into history. After enabling, inputs sync to the hash and restore on reload. Copy Shareable Link is explicit; files are never included. Links are limited to 16,000 encoded characters. Invoice, expense, signature and password pages are not auto-shared.
- The workspace privacy badge states the precise claim: inputs/files are processed locally, with no upload. The site still fetches its own static assets; optional app-resource links leave the site.

## Tool outcomes

| Route | Shipped | Limits / choices |
| --- | --- | --- |
| `/tools/signature-maker/` | Pointer drawing, ink colour/thickness, uploaded-scan threshold cleanup, auto-crop, transparent PNG | JPG/PNG/WebP; 20 MB / 24 MP; threshold method, not AI or a certified digital signature |
| `/tools/invoice-generator/` | Upgraded existing invoice: invoice/quotation, logo, sender/client, number/date, currency, per-item taxes, notes, live preview, local A4 PDF | 50 rows; sender-only optional auto-save; PDF pages rendered at 200 ppi so multilingual text can use device fonts, not selectable text; no legal/tax compliance guarantee |
| `/tools/bulk-renamer/` | Multiple files or ZIP, stack/reorder literal replace/prefix/suffix/case/number rules, full before/after table, renamed ZIP | Existing lightweight ZIP code, not JSZip; no new dependency; 1,000 files, 50 MB input / 100 MB expanded; flat output; collision suffixes; encrypted/split/ZIP64 archives rejected; actual expansion, bounds and CRC checked |
| `/tools/list-cleaner/` | TXT/CSV import, trim/empty/dedupe/case/sort/email extraction, output delimiters, live counts, copy/TXT/CSV | 1 MB input; CSV import is line-based, not a column parser; CSV output quotes each item and neutralizes spreadsheet formula prefixes; no email-validation/network calls |
| `/tools/id-photo-maker/` | 35x45 mm, exact 2-inch and custom presets; drag, zoom and keyboard position; face guides; 4x6/A4 JPG/PDF tiled print sheets | 20 MB / 24 MP; no guarantee of official acceptance; 35x45 is not universal for Indian passports; exact 2 inches is 50.8 mm; JPEG DPI metadata varies, use PDF at 100% for physical sizing |
| `/tools/remove-exif/` | Batch JPG/PNG/WebP metadata inspection and cleanup, individual/ZIP export | 30 files / 50 MB total; camera/date/GPS where parser supports them; JPEG/WebP re-encoding by default; optional lossless JPEG retains colour profiles/other APP segments and can change rotation; PNG text/time/EXIF stripped without pixel changes; visible image content is not anonymized |
| `/tools/split-bill/` | Participants, multiple expenses, payer/membership selection, net balances, exact minimum transactions, copy summary | 2-12 people, 100 expenses, integer-cent rounding; no payments sent; duplicated names numbered; remainder cents assigned in participant order |
| `/tools/fuel-cost/` | One-way/round-trip, km/L, L/100km, US MPG, EV kWh/100km; toll/parking, driver exclusion, local vehicle presets, copy summary | Round-trip doubles distance/energy, not optional trip-total tolls/parking; units reset efficiency to an example; prices share one user-chosen currency; no live fuel prices |

## Validation

`npm run build`, search, 36 existing + 13 new unit checks, expanded browser regression including every catalog tool at 393px, studio, AV exports, demand tools, first-screen directory and quality/licence/bundle gates. `npm run test:upgrades` exercises 19 new browser scenarios and real downloadable files. The existing CI quality command runs that new suite, so no CI coverage depends on a separate unconfigured workflow. No new runtime dependencies or third-party services.

### Photo-dimension references checked for this release

- UK printed passport photos, 35 mm wide by 45 mm high: https://www.gov.uk/photos-for-passports/photo-requirements
- US printed passport photos, 2 by 2 inches (official page rounds to 51 by 51 mm): https://travel.state.gov/en/passports/apply/help/photos.html

These links do not mean that this crop tool certifies compliance. Digital-upload requirements differ from print requirements.
