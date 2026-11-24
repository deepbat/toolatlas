# Page arrangement regression fixture

`makeLayoutFixture` constructs six pages locally with pdf-lib. No customer document or external data is included.

- Four source pages have rotations 0, 90, 180 and 270 degrees.
- Each page has a 400 x 500 pt MediaBox and a nonzero 50,80 origin CropBox measuring 240 x 360 pt.
- The visible crop has a red top band, green left band and text naming its rotation.
- Blue artwork and an OUTSIDE CROP label are outside the visible crop. They must not become visible after arrangement.
- A fifth page has no Contents stream. It must remain blank without crashing export.
- A sixth ordinary uncropped page has vector text that must remain searchable.
- Booklet padding introduces two more blank slots.

The baseline ignores rotation and CropBox, making the blue margin visible. It also throws when embedding the actual blank page.

The first local vector repair fixes rotation and blank pages but shows a thin blue crop-boundary fringe in PDF.js, Poppler and MuPDF. Its initial test ignored boundary pixels and missed this. The fixture now checks every output pixel, including edges, and fails that implementation. A direct render of the source CropBox has no blue pixels at the tested scales.

Do not treat the crop repair as ready until the full-sheet edge test and independent output inspection pass. Do not conceal the issue by trimming additional source content.

The developed fallback renders only cropped pages at up to2x (144dpi), capped near8MP with integer canvas rounding. The tool requires affirmative consent per input file and explains the loss of vector detail/search on those pages. Ordinary pages stay vector. The crop-edge check covers the complete output sheet and rejects even pale blue-dominant boundary pixels. Poppler and MuPDF were also used to inspect actual output.

A separate4000x2000pt cropped-page case verifies the image respects the memory cap. Fine detail on large pages can soften and is disclosed. The fixture does not prove arbitrary print-quality equivalence to vector content. Form fields and links are not interactive in arranged output; this is not a redaction tool.
