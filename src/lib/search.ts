import type { ToolMeta } from './types';
import { CATEGORY_MAP, TOOLS } from './catalog';

const SYNONYMS: Record<string, string[]> = {
  photo: ['image', 'picture', 'passport'], pictures: ['image', 'photo'], image: ['photo', 'picture'],
  combine: ['merge', 'join'], join: ['merge', 'combine'], split: ['divide', 'separate'],
  tax: ['gst', 'tds', 'income tax'], gst: ['tax', 'goods services tax'], salary: ['pay', 'wage', 'hra', 'epf'],
  pay: ['salary', 'wage'], pf: ['epf', 'provident fund'], provident: ['epf', 'pf'],
  money: ['finance', 'currency', 'loan'], interest: ['emi', 'loan', 'fd', 'rd'],
  resize: ['compress', 'image'], reduce: ['compress', 'shrink'], compress: ['reduce', 'shrink'],
  time: ['clock', 'date', 'timer'], clock: ['time', 'timezone'], birthday: ['age', 'dob'],
  words: ['text', 'character'], text: ['words', 'writing'], qr: ['barcode', 'code'],
  developer: ['code', 'json', 'formatter'], excel: ['csv', 'spreadsheet', 'xlsx'],
  spreadsheet: ['csv', 'xlsx', 'excel'], invoice: ['bill', 'quotation', 'gst'],
  paisa: ['money', 'finance'], vetan: ['salary'], tankhwah: ['salary'], byaj: ['interest', 'loan'], karj: ['loan', 'emi'], tasveer: ['image', 'photo'], kagaz: ['pdf', 'document'], dastavez: ['pdf', 'document'], hisab: ['calculator'],
  ctc: ['salary'], inhand: ['salary'], bill: ['invoice', 'gst'], receipt: ['invoice', 'rent'], petty: ['expense'], cashbook: ['expense'],
  pdf: ['document'], document: ['pdf', 'file'], background: ['remove background'],
};

const NATIVE: Record<string, string[]> = {
  'वेतन': ['salary'], 'तनख्वाह': ['salary'], 'ब्याज': ['interest', 'loan'], 'कर': ['tax'], 'पीडीएफ': ['pdf'], 'फोटो': ['photo', 'image'], 'तस्वीर': ['image', 'photo'], 'कैलकुलेटर': ['calculator'], 'बिल': ['invoice', 'gst'], 'ऋण': ['loan', 'emi'],
  'ਤਨਖਾਹ': ['salary'], 'ਵਿਆਜ': ['interest', 'loan'], 'ਟੈਕਸ': ['tax'], 'ਪੀਡੀਐਫ': ['pdf'], 'ਫੋਟੋ': ['photo', 'image'], 'ਤਸਵੀਰ': ['image', 'photo'], 'ਕੈਲਕੁਲੇਟਰ': ['calculator'], 'ਬਿੱਲ': ['invoice', 'gst'], 'ਕਰਜ਼ਾ': ['loan', 'emi'],
};
const normalize = (value: string) => value.toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
const tokens = (value: string) => normalize(value).split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);

for (const [k, v] of Object.entries(NATIVE)) SYNONYMS[normalize(k)] = v;

function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const value = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      current[j] = value;
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length];
}

function toolFields(tool: ToolMeta) {
  return {
    name: tokens(tool.name),
    category: tokens(CATEGORY_MAP[tool.category].name),
    description: tokens(tool.description),
    keywords: tool.keywords.flatMap(tokens),
    all: tokens([tool.name, tool.description, CATEGORY_MAP[tool.category].name, tool.id.replace(/-/g, ' '), ...tool.keywords].join(' ')),
  };
}

function matchTerm(term: string, fields: ReturnType<typeof toolFields>): { score: number; matched: boolean } {
  const aliases = [term, ...(SYNONYMS[term] ?? [])];
  let best = 0;
  for (const alias of aliases) {
    if (fields.name.includes(alias)) best = Math.max(best, alias === term ? 70 : 34);
    if (fields.keywords.includes(alias)) best = Math.max(best, alias === term ? 24 : 15);
    if (fields.category.includes(alias)) best = Math.max(best, alias === term ? 12 : 8);
    if (fields.description.includes(alias)) best = Math.max(best, alias === term ? 5 : 3);
    if (fields.all.some((word) => word.startsWith(alias))) best = Math.max(best, alias === term ? 18 : 10);
  }
  if (best) return { score: best, matched: true };

  if (term.length < 4) return { score: 0, matched: false };
  const limit = term.length >= 8 ? 2 : 1;
  let distance = limit + 1;
  for (const word of fields.all) {
    if (Math.abs(word.length - term.length) > limit) continue;
    distance = Math.min(distance, editDistance(term, word, limit));
    if (distance === 0) break;
  }
  return distance <= limit ? { score: distance === 1 ? 8 : 5, matched: true } : { score: 0, matched: false };
}

/** Dependency-free ranked search with typo tolerance and practical synonyms. */
export function searchTools(query: string, source: ToolMeta[] = TOOLS): ToolMeta[] {
  const terms = tokens(query);
  if (!terms.length) return source;
  return source
    .map((tool) => {
      const fields = toolFields(tool);
      let score = 0;
      for (const term of terms) {
        const match = matchTerm(term, fields);
        if (!match.matched) return { tool, score: -1 };
        score += match.score;
      }
      if (tool.featured) score += 1;
      if (tool.popular) score += 0.5;
      return { tool, score };
    })
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name))
    .map((entry) => entry.tool);
}

let vocabulary: string[] | null = null;
function vocab(): string[] {
  if (!vocabulary) {
    const set = new Set<string>(Object.keys(SYNONYMS));
    TOOLS.forEach((t) => toolFields(t).all.forEach((w) => set.add(w)));
    vocabulary = [...set].filter((w) => w.length >= 4);
  }
  return vocabulary;
}

/** When nothing matches, offer the nearest real words as a corrected query ("Did you mean"). */
export function suggestQuery(query: string): string | null {
  const terms = tokens(query);
  if (!terms.length || searchTools(query).length > 0) return null;
  const fixed = terms.map((term) => {
    if (term.length < 4) return term;
    let best = term, bestD = 3;
    for (const word of vocab()) {
      const d = editDistance(term, word, 2);
      if (d < bestD) { best = word; bestD = d; if (d === 0) break; }
    }
    return bestD <= 2 ? best : term;
  });
  const out = fixed.join(' ');
  return out !== terms.join(' ') && searchTools(out).length > 0 ? out : null;
}
