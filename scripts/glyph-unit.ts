import assert from 'node:assert/strict';
import { TOOLS, relatedTools } from '../src/lib/catalog';
import { CATEGORIES } from '../src/lib/catalog';
import { TOOL_GLYPHS, CATEGORY_GLYPHS, SECTION_GLYPHS, glyphFor } from '../src/lib/glyphs';
import { SECTIONS } from '../src/lib/sections';

// Every tool has a pictorial glyph and every glyph is unique, so each tool is
// recognisable at a glance without reading its label.
const glyphs = TOOLS.map((tool) => glyphFor(tool));
assert.equal(new Set(glyphs).size, TOOLS.length, 'tool glyphs must be unique');
for (const tool of TOOLS) {
  assert.ok(TOOL_GLYPHS[tool.id], `${tool.id} missing a glyph`);
  assert.ok([...TOOL_GLYPHS[tool.id]].length <= 4, `${tool.id} glyph should be a single emoji`);
}
// No stale glyph entries for removed tools.
for (const id of Object.keys(TOOL_GLYPHS)) {
  assert.ok(TOOLS.some((tool) => tool.id === id), `glyph for unknown tool ${id}`);
}
// Every category and section has a glyph.
for (const category of CATEGORIES) assert.ok(CATEGORY_GLYPHS[category.id], `${category.id} missing a category glyph`);
for (const section of SECTIONS) assert.ok(SECTION_GLYPHS[section.id], `${section.id} missing a section glyph`);

console.log(`PASS glyph coverage and uniqueness for ${TOOLS.length} tools, ${CATEGORIES.length} categories and ${SECTIONS.length} sections`);

// The approved removal is exact: no substitute tools were removed.
const retired = ['list-cleaner','csv-excel-tools','photo-colouring-page','colour-blind-simulator','split-bill','screen-ruler','calculator','unit-converter','temperature-converter','todo-list','quick-notes','speech-to-text','screen-recorder','video-trim','voice-recorder','image-rotate','image-filters','stopwatch','find-replace','image-metadata','reverse-text'];
assert.equal(TOOLS.length, 48);
for (const id of retired) assert.ok(!TOOLS.some(t => t.id === id), `${id} must stay retired`);
for (const tool of TOOLS) for (const related of relatedTools(tool)) assert.ok(TOOLS.some(t => t.id === related.id));
console.log('PASS curated 48-tool catalogue (Nov 2026 trim + OCR/converter/suite additions) and remaining related-tool coverage');
