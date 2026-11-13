import { CATEGORY_MAP, TOOLS } from './catalog';
import type { Category, CategoryId, ToolMeta } from './types';

/**
 * Top-level sections: the eight public categories of the atlas, each with its
 * own dedicated URL (/pdf, /image, /video, /audio, /text, /converter, /web,
 * /utilities). Every tool belongs to exactly one section. The thirteen
 * catalogue categories remain as the sub-collections shown inside a section
 * and keep their existing /category/<id> pages.
 */

export type SectionId =
  | 'pdf'
  | 'image'
  | 'video'
  | 'audio'
  | 'text'
  | 'converter'
  | 'web'
  | 'utilities';

export interface Section {
  id: SectionId;
  name: string;
  shortName: string;
  description: string;
  icon: string;
  accent: string;
  /** True while a section has no tools yet; its page shows a coming-soon state. */
  comingSoon?: boolean;
}

export const SECTIONS: Section[] = [
  {
    id: 'pdf',
    name: 'PDF Tools',
    shortName: 'PDF',
    description:
      'Merge, split, compress, rotate, edit and convert PDFs, and fill PDF forms. Files never leave your device.',
    icon: 'FileText',
    accent: 'var(--cat-pdf)',
  },
  {
    id: 'image',
    name: 'Image Tools',
    shortName: 'Images',
    description:
      'Compress, resize, convert, crop, annotate and prepare photos, including passport photos and collages.',
    icon: 'Image',
    accent: 'var(--cat-image)',
  },
  {
    id: 'video',
    name: 'Video Tools',
    shortName: 'Video',
    description: 'Trim, convert and prepare video clips in the browser. Files stay on your device.',
    icon: 'Video',
    accent: 'var(--cat-generators)',
  },
  {
    id: 'audio',
    name: 'Audio Tools',
    shortName: 'Audio',
    description: 'Convert, trim and clean up audio files in the browser. Files stay on your device.',
    icon: 'Music',
    accent: 'var(--cat-date)',
  },
  {
    id: 'text',
    name: 'Text Tools',
    shortName: 'Text',
    description: 'Count, clean, compare, sort and generate text without leaving the page.',
    icon: 'PenLine',
    accent: 'var(--cat-text)',
  },
  {
    id: 'converter',
    name: 'File Conversion',
    shortName: 'Converters',
    description: 'Convert units, temperatures, data sizes, number bases, text and spreadsheet formats.',
    icon: 'Ruler',
    accent: 'var(--cat-converters)',
  },
  {
    id: 'web',
    name: 'Web Tools',
    shortName: 'Web',
    description: 'JSON, encodings, hashes, tokens, URLs, colours and design helpers for web work.',
    icon: 'Globe',
    accent: 'var(--cat-internet)',
  },
  {
    id: 'utilities',
    name: 'Other Utilities',
    shortName: 'Utilities',
    description:
      'Calculators, India finance tools, date and time helpers, generators, notes and everyday apps.',
    icon: 'Shapes',
    accent: 'var(--cat-calculators)',
  },
];

export const SECTION_MAP: Record<SectionId, Section> = Object.fromEntries(
  SECTIONS.map((section) => [section.id, section])
) as Record<SectionId, Section>;

/** Default section for each catalogue category. */
const SECTION_BY_CATEGORY: Record<CategoryId, SectionId> = {
  video: 'video',
  audio: 'audio',
  pdf: 'pdf',
  image: 'image',
  text: 'text',
  converters: 'converter',
  developer: 'web',
  internet: 'web',
  calculators: 'utilities',
  finance: 'utilities',
  date: 'utilities',
  productivity: 'utilities',
  generators: 'utilities',
  file: 'utilities',
  misc: 'utilities',
};

/** Individual tools placed outside their catalogue category's default section. */
const SECTION_OVERRIDES: Record<string, SectionId> = {
  'csv-to-json': 'converter',
  'json-to-csv': 'converter',
  'css-gradient': 'web',
  'box-shadow': 'web',
  'color-converter': 'web',
  'color-contrast': 'web',
};

export function toolSection(tool: ToolMeta): SectionId {
  return SECTION_OVERRIDES[tool.id] ?? SECTION_BY_CATEGORY[tool.category];
}

export function sectionTools(id: SectionId): ToolMeta[] {
  return TOOLS.filter((tool) => toolSection(tool) === id);
}

export interface SectionGroup {
  category: Category;
  tools: ToolMeta[];
}

/** Tools of a section grouped by their catalogue category, in catalogue order. */
export function sectionGroups(id: SectionId): SectionGroup[] {
  const byCategory = new Map<CategoryId, ToolMeta[]>();
  for (const tool of sectionTools(id)) {
    const list = byCategory.get(tool.category) ?? [];
    list.push(tool);
    byCategory.set(tool.category, list);
  }
  return [...byCategory.entries()].map(([categoryId, tools]) => ({
    category: CATEGORY_MAP[categoryId],
    tools,
  }));
}
