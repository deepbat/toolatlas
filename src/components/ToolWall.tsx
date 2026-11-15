import { useEffect, useMemo, useRef, useState } from 'react';
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
 *
 * On the unfiltered "All" view the wall is alive: each column is a seamless
 * vertical marquee that drifts slowly and nonstop, neighbouring columns
 * moving in opposite directions (one up, the next down). The loop is pure
 * CSS: the column's cards render twice and the track translates from 0 to
 * -50%, so it never jumps and costs only a transform. A fine-pointer hover
 * pauses the drift so a card can be clicked; touch never pauses it (a tap's
 * sticky hover would otherwise freeze the wall on phones), background tabs
 * pause it natively, and prefers-reduced-motion gets a fully static wall.
 * A filtered wall is always static.
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

/** Marquee pacing: a very slow ambient crawl, the same speed on every column. */
const MARQUEE_SPEED_PX_S = 16;

/** Column count mirrors the masonry breakpoints of the static grid. */
function columnCountFor(width: number): number {
  if (width >= 1400) return 5;
  if (width >= 1024) return 4;
  if (width >= 640) return 3;
  return 2;
}

/** Rough card height (preview tile plus the text/meta block) for balancing. */
function estimatedCardHeight(tool: ToolMeta): number {
  return heightFor(tool.id) + 134;
}

/** Deal cards to the currently shortest column so the columns stay even. */
function splitColumns(tools: ToolMeta[], count: number): ToolMeta[][] {
  const columns: ToolMeta[][] = Array.from({ length: count }, () => []);
  const heights = new Array<number>(count).fill(0);
  for (const tool of tools) {
    let target = 0;
    for (let index = 1; index < count; index += 1) {
      if (heights[index] < heights[target]) target = index;
    }
    columns[target].push(tool);
    heights[target] += estimatedCardHeight(tool);
  }
  return columns;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

function useColumnCount(ref: React.RefObject<HTMLDivElement | null>): number {
  const [count, setCount] = useState(4);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => setCount(columnCountFor(el.getBoundingClientRect().width));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return count;
}

function WallCard({ tool, index, duplicate }: { tool: ToolMeta; index: number; duplicate?: boolean }) {
  const category = CATEGORY_MAP[tool.category];
  const glyph = glyphFor(tool);
  return (
    <Link
      to={`/tools/${tool.id}`}
      className="wall-card group"
      data-wall-id={tool.id}
      tabIndex={duplicate ? -1 : undefined}
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

/**
 * The living wall: one clipped viewport of columns, each a seamless marquee.
 * The track holds the column's cards twice; translating from 0 to -50% loops
 * with no seam. Column direction alternates up/down. The per-column animation
 * duration comes from the measured track height so every column drifts at the
 * same slow speed whatever it holds.
 */
function WallMarquee({ tools }: { tools: ToolMeta[] }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const trackRefs = useRef<Array<HTMLDivElement | null>>([]);
  const columnCount = useColumnCount(rootRef);
  const columns = useMemo(() => splitColumns(tools, columnCount), [tools, columnCount]);
  const [durations, setDurations] = useState<number[]>([]);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      const next = columns.map((_, index) => {
        const track = trackRefs.current[index];
        const half = track ? track.scrollHeight / 2 : 0;
        return half > 0 ? Math.max(60, half / MARQUEE_SPEED_PX_S) : 0;
      });
      // Only update when the duration meaningfully changed: applying a fresh
      // animation-duration restarts the loop with a visible jump.
      setDurations((prev) =>
        prev.length === next.length && next.every((d, i) => Math.abs(d - prev[i]) <= Math.max(4, d * 0.03))
          ? prev
          : next
      );
    };
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    document.fonts?.ready.then(measure).catch(() => undefined);
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
    };
  }, [columns]);

  return (
    <div data-tool-wall ref={rootRef} className="wall-marquee mt-4">
      <div className="wall-cols">
        {columns.map((column, columnIndex) => (
          <div className="wall-col" data-wall-col data-dir={columnIndex % 2 === 0 ? 'up' : 'down'} key={columnIndex}>
            <div
              className="wall-track"
              data-wall-track
              ref={(el) => {
                trackRefs.current[columnIndex] = el;
              }}
              style={
                durations[columnIndex]
                  ? {
                      animation: `${columnIndex % 2 === 0 ? 'wall-drift-up' : 'wall-drift-down'} ${durations[columnIndex]}s linear infinite`,
                    }
                  : undefined
              }
            >
              {[0, 1].map((copy) => (
                <div className="wall-copy" data-wall-copy key={copy} aria-hidden={copy === 1 || undefined}>
                  {column.map((tool, cardIndex) => (
                    <WallCard key={tool.id} tool={tool} index={cardIndex} duplicate={copy === 1} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ToolWall() {
  const [params] = useSearchParams();
  const requested = params.get('browse');
  const active = WALL_ENTRIES.find((entry) => entry.id === requested);
  const tools = useMemo(() => (active ? active.tools() : pin(TOOLS)), [active]);
  const heading = active ? active.heading : 'All tools';
  const reducedMotion = usePrefersReducedMotion();
  const marquee = !active && !reducedMotion;

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

      {marquee ? (
        <WallMarquee tools={tools} />
      ) : (
        <div data-tool-wall className="wall-grid mt-4">
          {tools.map((tool, index) => (
            <WallCard key={tool.id} tool={tool} index={index} />
          ))}
        </div>
      )}
    </div>
  );
}
