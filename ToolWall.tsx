import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CATEGORY_MAP, TOOLS } from '../lib/catalog';
import { sectionTools } from '../lib/sections';
import { glyphFor } from '../lib/glyphs';
import type { ToolMeta } from '../lib/types';
import { tint } from '../lib/utils';

/**
 * The bento tool wall: an airy masonry of white rounded cards, one per tool,
 * each with a small tinted preview tile, the tool's pictorial glyph, its name,
 * a one-line description and quiet metadata. Category pills across the top
 * filter the wall; the selection lives in the `?browse=` URL parameter so
 * back/forward and sharing work naturally.
 */
interface WallEntry {
  id: string;
  label: string;
  heading: string;
  glyph: string;
  to: string;
  tools: () => ToolMeta[];
}

/** Featured tools pinned to the front of the wall and their own category. */
const PINNED = ['pvc-card-maker'];
const pin = (list: ToolMeta[]) => [
  ...list.filter((tool) => PINNED.includes(tool.id)),
  ...list.filter((tool) => !PINNED.includes(tool.id)),
];

const byCategory = (id: ToolMeta['category']) => () => TOOLS.filter((tool) => tool.category === id);

export const WALL_ENTRIES: WallEntry[] = [
  { id: 'pdf', label: 'PDF', heading: 'PDF Tools', glyph: '📕', to: '/pdf', tools: () => pin(sectionTools('pdf')) },
  { id: 'image', label: 'Images', heading: 'Image Tools', glyph: '🏞️', to: '/image', tools: () => sectionTools('image') },
  { id: 'calculators', label: 'Calculators', heading: 'Calculators', glyph: '🧮', to: '/category/calculators', tools: byCategory('calculators') },
  { id: 'video', label: 'Video', heading: 'Video Tools', glyph: '📹', to: '/video', tools: () => sectionTools('video') },
  { id: 'audio', label: 'Audio', heading: 'Audio Tools', glyph: '🎼', to: '/audio', tools: () => sectionTools('audio') },
  { id: 'text', label: 'Text', heading: 'Text Tools', glyph: '✏️', to: '/text', tools: () => sectionTools('text') },
  { id: 'converter', label: 'Converters', heading: 'File Conversion', glyph: '📐', to: '/converter', tools: () => sectionTools('converter') },
  { id: 'finance', label: 'Finance', heading: 'Financial Tools', glyph: '💰', to: '/category/finance', tools: byCategory('finance') },
  { id: 'device', label: 'Device', heading: 'Device & Sensor Tools', glyph: '📱', to: '/category/device', tools: byCategory('device') },
  { id: 'web', label: 'Web', heading: 'Web Tools', glyph: '🌐', to: '/web', tools: () => sectionTools('web') },
  {
    id: 'utilities',
    label: 'More',
    heading: 'Other Utilities',
    glyph: '🧰',
    to: '/utilities',
    // Categories with their own pill stay out of the catch-all section.
    tools: () =>
      sectionTools('utilities').filter(
        (tool) => !['calculators', 'finance', 'device'].includes(tool.category)
      ),
  },
];

/** Preview-tile heights cycle deterministically so the masonry has rhythm. */
const PREVIEW_HEIGHTS = [96, 132, 112, 148];

function heightFor(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash + id.charCodeAt(index) * (index + 3)) % 997;
  return PREVIEW_HEIGHTS[hash % PREVIEW_HEIGHTS.length];
}

function WallCard({ tool, index }: { tool: ToolMeta; index: number }) {
  const category = CATEGORY_MAP[tool.category];
  const glyph = glyphFor(tool);
  return (
    <Link
      to={`/tools/${tool.id}`}
      className="wall-card group"
      style={{ animationDelay: `${Math.min(index, 14) * 28}ms` }}
    >
      <span
        className="wall-preview"
        style={{ height: `${heightFor(tool.id)}px`, backgroundColor: tint(category.accent, 0.1) }}
      >
        <span className="wall-glyph" data-wall-glyph={glyph}>
          {glyph}
        </span>
        <span className="wall-dot" style={{ backgroundColor: tint(category.accent, 0.5) }} />
        <span className="wall-ring" style={{ borderColor: tint(category.accent, 0.38) }} />
      </span>
      <span className="wall-name">{tool.name}</span>
      <span className="wall-desc">{tool.description}</span>
      <span className="wall-meta">
        <span
          className="wall-tag"
          style={{ backgroundColor: tint(category.accent, 0.12), color: tint(category.accent, 1) }}
        >
          {category.shortName}
        </span>
        <span>v{tool.version}</span>
        {tool.status === 'beta' && <span className="wall-beta">beta</span>}
      </span>
    </Link>
  );
}

export default function ToolWall() {
  const [params] = useSearchParams();
  const requested = params.get('browse');
  const active = WALL_ENTRIES.find((entry) => entry.id === requested);
  const tools = useMemo(() => (active ? active.tools() : pin(TOOLS)), [active]);
  const heading = active ? active.heading : 'All tools';

  return (
    <div className="mt-7 sm:mt-9">
      <nav aria-label="Choose a tool category" className="wall-chips">
        <Link
          to="/"
          data-directory-category="all"
          data-active={!active}
          aria-current={!active ? 'true' : undefined}
          className="wall-chip"
        >
          <span aria-hidden="true">✨</span>
          All
        </Link>
        {WALL_ENTRIES.map((entry) => (
          <Link
            key={entry.id}
            to={`/?browse=${entry.id}`}
            data-directory-category={entry.id}
            data-active={active?.id === entry.id}
            aria-current={active?.id === entry.id ? 'true' : undefined}
            className="wall-chip"
          >
            <span aria-hidden="true">{entry.glyph}</span>
            {entry.label}
          </Link>
        ))}
      </nav>

      <div className="mt-5 flex items-baseline justify-between gap-3 px-1">
        <h2 className="font-display text-lg font-semibold tracking-tight text-[rgb(var(--wall-ink))] sm:text-xl">
          {heading}
        </h2>
        {active && (
          <Link
            to={active.to}
            className="shrink-0 font-mono text-[9px] font-semibold uppercase tracking-label text-[rgb(var(--wall-blue))] transition hover:underline"
          >
            {tools.length} tools · open ↗
          </Link>
        )}
      </div>

      <div data-tool-wall className="wall-grid mt-4">
        {tools.map((tool, index) => (
          <WallCard key={tool.id} tool={tool} index={index} />
        ))}
      </div>
    </div>
  );
}
