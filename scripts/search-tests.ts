import assert from 'node:assert/strict';
import { searchTools } from '../src/lib/search';
import { TOOLS } from '../src/lib/catalog';

const ids = (query: string) => searchTools(query).map((tool) => tool.id);
assert.equal(searchTools('').length, TOOLS.length, 'empty query returns complete catalogue');
assert.ok(ids('imge').includes('image-resizer'), 'one-character typo finds image tools');
assert.ok(ids('photo').includes('image-resizer'), 'photo synonym finds image tools');
assert.ok(ids('pdf combne').includes('pdf-merge'), 'typo and multi-term search finds PDF merge');
assert.ok(ids('tax').includes('gst-calculator'), 'tax synonym finds GST calculator');
assert.ok(ids('spreadsheet').some((id) => id.includes('csv')), 'spreadsheet synonym finds CSV tools');
assert.equal(ids('zzqvxx').length, 0, 'unrelated query has no false positives');
console.log('Search regression checks passed.');
