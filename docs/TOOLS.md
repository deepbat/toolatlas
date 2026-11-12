# The ToolAtlas catalogue

120 applications, 13 categories. Every tool runs entirely in your browser and works offline once loaded.

---

## Calculators

### Standard Calculator — `/tools/calculator`
A keypad calculator with memory of the last six calculations, percentage handling, a sign toggle and full keyboard support (digits, `+ - * /`, `Enter`, `Esc`, `Backspace`, `%`).

### Percentage Calculator — `/tools/percentage-calculator`
Three modes: *X % of Y*, *X is what percent of Y*, and *percentage change*. Shows the arithmetic it used so the answer can be checked by hand.

### BMI Calculator — `/tools/bmi-calculator`
Metric or imperial input, body mass index with the standard four bands, a healthy-weight range for the entered height, and a marker on a 15–40 scale. Includes a note that BMI is a screening measure, not a diagnosis.

### Tip & Bill Splitter — `/tools/tip-calculator`
Tip amount, total and per-person split, with preset tips from 0 % to 25 %, eight currencies, and a "round the total up" suggestion.

---

## Measurement Converters

### Unit Converter — `/tools/unit-converter`
Seven families — length, mass, area, volume, speed, digital storage and time — with 47 units in total, a swap button and a table of every equivalent value for the current input.

### Temperature Converter — `/tools/temperature-converter`
Celsius, Fahrenheit and Kelvin with a reference table (absolute zero, freezing, body temperature, boiling, moderate oven).

---

## Date & Time Tools

### Age Calculator — `/tools/age-calculator`
Exact age in years, months and days, plus totals in months, weeks, days and hours, and a countdown to the next birthday.

### Date Difference — `/tools/date-difference`
Days between two dates, converted to weeks, months, years, hours and minutes. Also counts business days, with an option to include the end date.

### Time Zone Converter — `/tools/timezone-converter`
One reference time, many zones. Adds a UTC offset per zone, flags your own local zone, and lets you add or remove zones from the list.

### Countdown Timer — `/tools/countdown`
A live countdown to any date, or a custom minute-and-second timer with a progress bar and start/pause/reset.

---

## Financial Tools

### Loan EMI Calculator — `/tools/loan-emi-calculator`
Monthly payment, total interest and total repayment for any principal, rate and term, with a year-by-year amortisation table showing how the principal/interest split changes.

### Compound Interest — `/tools/compound-interest`
Starting amount plus a monthly contribution, compounded monthly, quarterly or yearly. Includes a growth chart, a yearly table and a breakdown of contributions versus growth.

### Savings Goal Planner — `/tools/savings-goal`
Given a target, what you have already saved and a monthly amount, it works out how long the goal takes — with or without an expected annual return.

---

## Text & Writing Tools

### Word & Character Counter — `/tools/word-counter`
Live counts of words, characters (with and without spaces), sentences, paragraphs and lines, plus reading and speaking time and the most-used words with stop words removed.

### Case Converter — `/tools/case-converter`
Ten styles: UPPER, lower, Sentence, Title, camelCase, PascalCase, snake_case, kebab-case, URL slug and aLTeRNAtiNg. Every result is one click to copy.

### Text Diff Checker — `/tools/text-diff`
Compares two blocks of text line by line with added and removed lines highlighted, and a count of each.

### Lorem Ipsum Generator — `/tools/lorem-ipsum`
Placeholder paragraphs in a chosen number of paragraphs and sentences, optionally wrapped in `<p>` tags, with the classic opening.

---

## PDF & Document Tools

### Image to PDF — `/tools/image-to-pdf`
Turns photos and scans into a single PDF. JPG and PNG are embedded directly; other formats are converted through a canvas first. Choose A4, US Letter or fit-to-image, set the margin, and reorder the pages.

### PDF Merge — `/tools/pdf-merge`
Combines any number of PDFs into one document, in the order you choose, with page counts shown per file. Password-protected files are skipped with a clear message.

---

## Image & Media Tools

### Image Compressor — `/tools/image-compressor`
Resize and re-encode JPG, PNG or WebP with a quality slider and a live before/after preview. Shows the exact size reduction.

### Image Contact Sheet — `/tools/image-contact-sheet`
Arrange up to 20 local images in a configurable grid. Choose columns, tile width, background, output format and optional file-name labels, then download a single contact sheet.

---

## File Utilities

### File Checksum — `/tools/file-checksum`
Computes SHA-1, SHA-256, SHA-384 and SHA-512 digests of any local file with the Web Crypto API, each one click to copy.

---

## Productivity Applications

### Task List — `/tools/todo-list`
Add tasks with low, normal or high priority, tick them off, filter by all/active/done, and watch the completion bar. Everything is saved in your browser.

### Quick Notes — `/tools/quick-notes`
A notepad with multiple notes, a search box and automatic saving as you type.

### Pomodoro Timer — `/tools/pomodoro`
Focus, short break and long break sessions with a circular progress ring, adjustable durations (the classic 25 / 5 / 15) and a long break every fourth session.

---

## Developer Tools

### JSON Formatter — `/tools/json-formatter`
Format, minify and sort keys, with the indentation width configurable. Shows whether the input is valid, the number of keys, the nesting depth and the line and column of any error.

### Base64 Encoder — `/tools/base64`
Encodes and decodes text, with a URL-safe alphabet option and file support. Includes a reminder that Base64 is an encoding, not encryption.

### Hash Generator — `/tools/hash-generator`
SHA-1, SHA-256, SHA-384 and SHA-512 digests of any text, updated as you type.

### JWT Decoder — `/tools/jwt-decoder`
Decodes a JWT's header and payload, highlights the standard claims with human-readable dates, and warns when the token has expired. Signature verification is explicitly not performed.

### Regex Tester — `/tools/regex-tester`
Live regular-expression testing with the `g`, `i`, `m`, `s` and `u` flags, highlighted matches in the text, a match list with capture groups, and a readable error for an invalid pattern.

---

## Generators

### Password Generator — `/tools/password-generator`
Cryptographically random passwords with a length slider (8–64), optional character sets and an option to avoid look-alike characters. Shows the estimated entropy in bits and a strength label.

### QR Code Generator — `/tools/qr-code-generator`
QR codes for text or links, Wi-Fi networks and email addresses, with size, error-correction level and colour settings, plus a PNG download.

### UUID Generator — `/tools/uuid-generator`
Bulk-generates RFC 4122 version 4 identifiers, with optional hyphens and uppercase, and copy-one or copy-all.

### Colour Palette Generator — `/tools/color-palette`
Builds analogous, complementary, triadic, tetradic and monochrome palettes from a base colour. Copies individual swatches or the whole palette as CSS custom properties.

---

## Internet & Network Utilities

### URL Parser — `/tools/url-parser`
Breaks a URL into protocol, host, port, path, hash and origin, lists every query parameter in order, and exports the whole thing as JSON.

---

## Miscellaneous Utilities

### Colour Converter — `/tools/color-converter`
Converts any colour between HEX, RGB, HSL, HSV and CMYK, with a preview, channel sliders and a random colour button.

---

## Related reading

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — how the platform is built
- [`ADDING_A_TOOL.md`](ADDING_A_TOOL.md) — how to add the next one


---

## Studio batch 1 (added 12 November 2026)

All of these run in the browser. Files are not uploaded. Outputs can be passed to another tool with the "Use this result in another tool" strip.

### PDF
- **PDF Compressor** (`/tools/pdf-compress`): quality or target-size modes. Warns when compression rasterises text.
- **PDF to Images** (`/tools/pdf-to-images`): PNG or JPEG per page, ZIP download. Page size is capped at 8 megapixels.
- **PDF Background and Colour** (`/tools/pdf-background`): background fill, greyscale, black and white, brightness and contrast.
- **PDF Compare** (`/tools/pdf-compare`): text and page-picture differences.
- **PDF Splitter** (`/tools/pdf-split`): single pages, fixed chunks or custom ranges.
- **PDF Text Extractor** (`/tools/pdf-extract-text`): copies the text layer. Scans without a text layer are reported, not OCR'd.
- **PDF Form Filler** (`/tools/pdf-form-filler`): fills AcroForm fields, optional flatten.

### Image
- **Background Remover, colour based** (`/tools/image-bg-remove`): removes a plain background by colour. It is not an AI cut-out and struggles with busy backgrounds.
- **Image Enlarger** (`/tools/image-upscale`): 2x to 4x resampling with sharpening. Does not add detail.
- **Bulk Image Resizer and Converter** (`/tools/image-bulk-convert`): up to 100 images to JPEG, PNG, WebP or AVIF. AVIF saving depends on the browser.
- **Passport Photo Maker, India** (`/tools/passport-photo`): 35 x 45 mm, PAN 25 x 35 mm, 2 x 2 inch and custom sizes at 300 dpi, plus a print sheet. Always check the current rules of the office you apply to.
- **Collage Maker** (`/tools/image-collage`), **Image Annotator and Editor** (`/tools/image-annotate`), **Image Metadata Viewer and Remover** (`/tools/image-metadata`).

## Studio batch 2: India finance and date tools (added 12 November 2026)

Each tool shows the financial year it uses, links its sources and says it is an estimate, not tax, legal or payroll advice. Rules were reviewed in November 2026.

- **Income Tax Calculator** (`/tools/income-tax-india`): FY 2025-26 and 2026-27, new and old regime, age bands, 87A rebate, surcharge, cess and a side-by-side other-regime total.
- **TDS Calculator** (`/tools/tds-calculator`): common sections with 1961 numbering and the 2025 Act reference.
- **EPF Calculator** (`/tools/epf-calculator`), **Gratuity Calculator** (`/tools/gratuity-calculator`), **HRA Exemption Calculator** (`/tools/hra-calculator`, metro list depends on the FY).
- **FD and RD Calculator** (`/tools/fd-rd-calculator`), **Loan Amortisation Schedule** (`/tools/loan-schedule`), **Working Days Calculator** (`/tools/working-days`).
- **Number to Words, Rupees** (`/tools/number-to-words-inr`), **GSTIN, PAN and IFSC Checker** (`/tools/gst-pan-validator`, format checks only, no registry lookup).
- **Salary Structure Calculator** (`/tools/salary-structure`): CTC split into basic, HRA, special allowance and PF with an estimated take-home. HRA exemption and other deductions are not applied.
- **PPF Calculator** (`/tools/ppf-calculator`): yearly compounding with an editable rate. Real PPF works out interest monthly, so the result is a close estimate.
- **CAGR Calculator** (`/tools/cagr-calculator`)
- **Rent Receipt Maker** (`/tools/rent-receipt`): monthly receipts in one PDF, landlord PAN checked when rent is above 1,00,000 a year.
- **GST Invoice Maker** (`/tools/gst-invoice`): CGST and SGST or IGST, HSN or SAC, total in words, PDF download. A simple layout, not a full statutory invoice.
- **Expense and Petty Cash Tracker** (`/tools/expense-tracker`): saved in this browser only, CSV export.
- **CSV and Excel Utilities** (`/tools/csv-excel-tools`): open CSV or XLSX, sort, remove duplicates and empty rows, trim, export. Formula-injection safeguard on export.
