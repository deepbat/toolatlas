import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
 * On the unfiltered "All" view the wall is alive: every few seconds a pair of
 * same-height cards trade places with a FLIP animation, so the masonry slowly
 * reshuffles itself like a living wall. The reshuffle pauses on hover, focus
 * and hidden tabs, is disabled under prefers-reduced-motion and never runs
 * while a category filter is active.
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

/** Reshuffle pacing: a slow first move, then a gentle steady rhythm. */
const SHUFFLE_FIRST_MS = 2000;
const SHUFFLE_INTERVAL_MS = 2000;
const FLIP_DURATION_MS = 1100;
const FLIP_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

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

/**
 * Pick the next wall order by swapping a few pairs of same-height cards.
 * Same-height swaps leave every other card's slot untouched in the balanced
 * columns, so only the swapped pair travels - the reflow stays cheap and the
 * motion stays calm. Falls back to a linear scan so a move is always found.
 */
function nextOrder(order: string[], rects: Map<string, DOMRect>, pinnedCount: number, pairs: number): string[] {
  const eligible = order.length - pinnedCount;
  if (eligible < 4) return order;
  const next = [...order];
  const used = new Set<number>();
  // Keep swaps in a local neighbourhood so cards glide, not fly.
  const maxDistance = Math.min(48, Math.max(8, Math.floor(eligible / 4)));
  const sameHeight = (a: string, b: string) => {
    const ra = rects.get(a);
    const rb = rects.get(b);
    return !!ra && !!rb && Math.abs(ra.height - rb.height) <= 6;
  };
  const swap = (i: number, j: number) => {
    [next[i], next[j]] = [next[j], next[i]];
    used.add(i);
    used.add(j);
  };
  let made = 0;
  for (let attempt = 0; attempt < 60 && made < pairs; attempt += 1) {
    const i = pinnedCount + Math.floor(Math.random() * eligible);
    const span = 2 + Math.floor(Math.random() * (maxDistance - 1));
    const direction = Math.random() < 0.5 ? -1 : 1;
    const j = i + span * direction;
    if (j < pinnedCount || j >= order.length || used.has(i) || used.has(j)) continue;
    if (!sameHeight(order[i], order[j])) continue;
    swap(i, j);
    made += 1;
  }
  for (let i = pinnedCount; made < pairs && i < order.length - 2; i += 1) {
    for (let j = i + 2; j < Math.min(i + maxDistance, order.length); j += 1) {
      if (used.has(i) || used.has(j) || !sameHeight(order[i], order[j])) continue;
      swap(i, j);
      made += 1;
      break;
    }
  }
  return made > 0 ? next : order;
}

function WallCard({ tool, index }: { tool: ToolMeta; index: number }) {
  const category = CATEGORY_MAP[tool.category];
  const glyph = glyphFor(tool);
  return (
    <Link
      to={`/tools/${tool.id}`}
      className="wall-card group"
      data-wall-id={tool.id}
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

  const gridRef = useRef<HTMLDivElement | null>(null);
  const pausedRef = useRef(false);
  const positionsRef = useRef<Map<string, DOMRect>>(new Map());
  const reducedMotion = usePrefersReducedMotion();
  const [order, setOrder] = useState<string[] | null>(null);

  // A category filter freezes the wall and restores the natural order.
  useEffect(() => {
    setOrder(null);
    positionsRef.current = new Map();
  }, [active]);

  const displayTools = useMemo(() => {
    if (!order || active) return tools;
    const byId = new Map(tools.map((tool) => [tool.id, tool]));
    const rearranged = order.map((id) => byId.get(id)).filter((tool): tool is ToolMeta => !!tool);
    return rearranged.length === tools.length ? rearranged : tools;
  }, [order, active, tools]);

  // Pause the reshuffle while the wall is hovered, focused or the tab hidden.
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return undefined;
    const pause = () => {
      pausedRef.current = true;
    };
    const resume = () => {
      pausedRef.current = false;
    };
    grid.addEventListener('pointerenter', pause);
    grid.addEventListener('pointerleave', resume);
    grid.addEventListener('focusin', pause);
    grid.addEventListener('focusout', resume);
    return () => {
      grid.removeEventListener('pointerenter', pause);
      grid.removeEventListener('pointerleave', resume);
      grid.removeEventListener('focusin', pause);
      grid.removeEventListener('focusout', resume);
    };
  }, []);

  const tick = useCallback(() => {
    if (pausedRef.current || document.hidden) return;
    const grid = gridRef.current;
    if (!grid) return;
    // First: record where every card is (the "First" of FLIP).
    const rects = new Map<string, DOMRect>();
    grid.querySelectorAll<HTMLElement>('[data-wall-id]').forEach((el) => {
      if (el.dataset.wallId) rects.set(el.dataset.wallId, el.getBoundingClientRect());
    });
    positionsRef.current = rects;
    const width = grid.getBoundingClientRect().width;
    const pairs = width >= 1024 ? 2 : 1;
    setOrder((previous) => {
      const current = previous ?? tools.map((tool) => tool.id);
      return nextOrder(current, rects, tools.filter((tool) => PINNED.includes(tool.id)).length, pairs);
    });
  }, [tools]);

  useEffect(() => {
    if (active || reducedMotion) return undefined;
    let timer = 0;
    const loop = () => {
      tick();
      timer = window.setTimeout(loop, SHUFFLE_INTERVAL_MS);
    };
    timer = window.setTimeout(loop, SHUFFLE_FIRST_MS);
    return () => window.clearTimeout(timer);
  }, [active, reducedMotion, tick]);

  // Last + Invert + Play: after React commits the new order, measure where
  // each card landed and glide it there from where it was.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    const before = positionsRef.current;
    if (!grid || before.size === 0) return;
    positionsRef.current = new Map();
    if (reducedMotion) return;
    grid.querySelectorAll<HTMLElement>('[data-wall-id]').forEach((el) => {
      const id = el.dataset.wallId;
      const from = id ? before.get(id) : undefined;
      if (!from) return;
      const to = el.getBoundingClientRect();
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0px, 0px)' }],
        { duration: FLIP_DURATION_MS, easing: FLIP_EASING }
      );
    });
  }, [displayTools, reducedMotion]);

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

      <div data-tool-wall ref={gridRef} className="wall-grid mt-4">
        {displayTools.map((tool, index) => (
          <WallCard key={tool.id} tool={tool} index={index} />
        ))}
      </div>
    </div>
  );
}
