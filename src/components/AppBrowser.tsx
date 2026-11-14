import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CATEGORY_MAP, TOOLS } from '../lib/catalog';
import { sectionTools } from '../lib/sections';
import { glyphFor } from '../lib/glyphs';
import { Glyph } from './Glyph';
import type { ToolMeta } from '../lib/types';
import { cn } from '../lib/utils';

/**
 * App-style tool browser: a vertical category rail with big pictorial glyphs
 * beside a grid of tool tiles whose pictures say what each tool does. This is
 * the homepage hero - the first thing on screen. Selection lives in the
 * `?browse=` URL parameter so back/forward and sharing work naturally.
 */
interface BrowseEntry {
  id: string;
  label: string;
  heading: string;
  glyph: string;
  accent: string;
  to: string;
  tools: () => ToolMeta[];
}

const byCategory = (id: ToolMeta['category']) => () => TOOLS.filter((tool) => tool.category === id);

const ENTRIES: BrowseEntry[] = [
  { id: 'pdf', label: 'PDF', heading: 'PDF Tools', glyph: '📕', accent: 'var(--cat-pdf)', to: '/pdf', tools: () => sectionTools('pdf') },
  { id: 'image', label: 'Images', heading: 'Image Tools', glyph: '🏞️', accent: 'var(--cat-image)', to: '/image', tools: () => sectionTools('image') },
  { id: 'calculators', label: 'Calculators', heading: 'Calculators', glyph: '🧮', accent: 'var(--cat-calculators)', to: '/category/calculators', tools: byCategory('calculators') },
  { id: 'video', label: 'Video', heading: 'Video Tools', glyph: '📹', accent: 'var(--cat-generators)', to: '/video', tools: () => sectionTools('video') },
  { id: 'audio', label: 'Audio', heading: 'Audio Tools', glyph: '🎼', accent: 'var(--cat-date)', to: '/audio', tools: () => sectionTools('audio') },
  { id: 'text', label: 'Text', heading: 'Text Tools', glyph: '✏️', accent: 'var(--cat-text)', to: '/text', tools: () => sectionTools('text') },
  { id: 'converter', label: 'Converters', heading: 'File Conversion', glyph: '📐', accent: 'var(--cat-converters)', to: '/converter', tools: () => sectionTools('converter') },
  { id: 'finance', label: 'Finance', heading: 'Financial Tools', glyph: '💰', accent: 'var(--cat-finance)', to: '/category/finance', tools: byCategory('finance') },
  { id: 'device', label: 'Device', heading: 'Device & Sensor Tools', glyph: '📱', accent: 'var(--cat-productivity)', to: '/category/device', tools: byCategory('device') },
  { id: 'web', label: 'Web', heading: 'Web Tools', glyph: '🌐', accent: 'var(--cat-internet)', to: '/web', tools: () => sectionTools('web') },
  {
    id: 'utilities',
    label: 'More',
    heading: 'Other Utilities',
    glyph: '🧰',
    accent: 'var(--cat-misc)',
    to: '/utilities',
    // Categories with their own rail entry stay out of the catch-all section.
    tools: () =>
      sectionTools('utilities').filter(
        (tool) => !['calculators', 'finance', 'device'].includes(tool.category)
      ),
  },
];

export default function AppBrowser() {
  const [params] = useSearchParams();
  const active = ENTRIES.find((entry) => entry.id === params.get('browse')) ?? ENTRIES[0];
  const tools = useMemo(() => active.tools(), [active]);

  return (
    <div data-app-browser className="flex items-stretch gap-2.5 sm:gap-3.5">
      <nav
        aria-label="Choose a tool category"
        className="flex h-[440px] w-[74px] shrink-0 flex-col gap-1 overflow-y-auto rounded-2xl border border-line bg-surface/70 p-1.5 sm:h-[450px] sm:w-[100px] sm:gap-1.5 sm:p-2"
      >
        {ENTRIES.map((entry) => {
          const selected = entry.id === active.id;
          return (
            <Link
              key={entry.id}
              to={entry.id === ENTRIES[0].id ? '/' : `/?browse=${entry.id}`}
              data-directory-category={entry.id}
              aria-current={selected ? 'true' : undefined}
              className={cn(
                'group flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-center transition sm:gap-1.5 sm:py-2.5',
                selected
                  ? 'border-accent bg-raised shadow-lift'
                  : 'border-transparent hover:border-line hover:bg-raised/70'
              )}
            >
              <Glyph
                emoji={entry.glyph}
                accent={entry.accent}
                className={cn('h-9 w-9 rounded-xl sm:h-10 sm:w-10', selected && 'border-accent/50')}
                emojiClassName="text-[19px] sm:text-[21px]"
              />
              <span
                className={cn(
                  'font-display text-[9.5px] font-semibold leading-tight tracking-tight sm:text-[10.5px]',
                  selected ? 'text-fg' : 'text-muted group-hover:text-fg'
                )}
              >
                {entry.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <section
        aria-label={`${active.heading} tools`}
        className="flex h-[440px] min-w-0 flex-1 flex-col rounded-2xl border border-line bg-surface/70 p-2.5 sm:h-[450px] sm:p-4"
      >
        <div className="mb-2 flex items-baseline justify-between gap-2 px-1 sm:mb-3">
          <h2 className="font-display text-base font-semibold tracking-tight text-fg sm:text-lg">
            {active.heading}
          </h2>
          <Link
            to={active.to}
            className="shrink-0 font-mono text-[9px] font-semibold uppercase tracking-label text-accent transition hover:underline"
          >
            {tools.length} tools · open ↗
          </Link>
        </div>
        <div className="grid flex-1 grid-cols-3 content-start gap-1 overflow-y-auto pr-0.5 sm:grid-cols-4 sm:gap-2 lg:grid-cols-5">
          {tools.map((tool) => (
            <Link
              key={tool.id}
              to={`/tools/${tool.id}`}
              className="group flex flex-col items-center gap-1.5 rounded-xl border border-transparent px-1 py-2.5 text-center transition hover:border-line hover:bg-raised"
            >
              <Glyph
                emoji={glyphFor(tool)}
                accent={CATEGORY_MAP[tool.category].accent}
                className="h-11 w-11 rounded-2xl transition duration-200 group-hover:scale-105 sm:h-12 sm:w-12"
                emojiClassName="text-[22px] sm:text-2xl"
              />
              <span className="line-clamp-2 text-[10px] font-medium leading-tight text-muted transition group-hover:text-fg sm:text-[11px]">
                {tool.name}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
