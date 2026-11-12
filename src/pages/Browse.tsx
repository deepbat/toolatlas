import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import ToolCard from '../components/ToolCard';
import { Icon } from '../components/Icon';
import { EmptyState } from '../components/ui';
import { CATEGORIES, CATEGORY_MAP, TOOLS, toolsByCategory } from '../lib/catalog';
import { searchTools } from '../lib/search';
import type { CategoryId, ToolMeta } from '../lib/types';
import { cn, tint } from '../lib/utils';

type SortKey = 'relevance' | 'name' | 'newest' | 'popular';

const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: 'relevance', label: 'Best match' },
  { id: 'popular', label: 'Most popular' },
  { id: 'newest', label: 'Newest first' },
  { id: 'name', label: 'A → Z' },
];

function sortTools(tools: ToolMeta[], sort: SortKey): ToolMeta[] {
  if (sort === 'name') return [...tools].sort((a, b) => a.name.localeCompare(b.name));
  if (sort === 'newest') return [...tools].sort((a, b) => (a.added < b.added ? 1 : -1));
  if (sort === 'popular')
    return [...tools].sort((a, b) => Number(Boolean(b.popular)) - Number(Boolean(a.popular)));
  return tools;
}

export default function BrowsePage() {
  const { categoryId } = useParams();
  const [params, setParams] = useSearchParams();

  const activeCategory =
    categoryId && CATEGORY_MAP[categoryId as CategoryId] ? (categoryId as CategoryId) : null;
  const category = activeCategory ? CATEGORY_MAP[activeCategory] : null;
  const query = params.get('q') ?? '';
  const sort = (SORTS.find((option) => option.id === params.get('sort'))?.id ?? 'relevance') as SortKey;
  const recentOnly = params.get('recent') === '1';

  const results = useMemo(() => {
    const base = activeCategory ? toolsByCategory(activeCategory) : TOOLS;
    const matched = sortTools(searchTools(query, base), sort);
    if (!recentOnly) return matched;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    return matched.filter((tool) => new Date(`${tool.added}T00:00:00`) >= cutoff);
  }, [activeCategory, query, sort, recentOnly]);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <div className="container-page pt-12">
      <header className="section-line">
        <div className="flex items-baseline gap-3">
          <span className="label text-muted/60">{category ? 'Category' : 'Library'}</span>
          <h1 className="font-display text-2xl font-medium tracking-tight text-fg sm:text-3xl">
            {category ? category.name : 'All tools'}
          </h1>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-label text-muted">
          <span className="text-accent">{results.length}</span> {results.length === 1 ? 'tool' : 'tools'}
          {query && <> matching “{query}”</>}
        </p>
      </header>

      <p className="max-w-2xl text-sm leading-relaxed text-muted">
        {category
          ? category.description
          : 'Every application in the atlas, searchable and filterable. Nothing behind a login.'}
      </p>

      <div className="mt-6 border border-line bg-surface/80 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(event) => update('q', event.target.value)}
              placeholder="Filter by name, keyword or category…"
              className="h-10 w-full border border-line bg-raised/60 pl-9 pr-9 font-mono text-[13px] text-fg outline-none transition placeholder:text-muted/60 focus:border-accent"
              aria-label="Filter tools"
            />
            {query && (
              <button
                type="button"
                onClick={() => update('q', '')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted transition hover:text-fg"
                aria-label="Clear filter"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <SlidersHorizontal className="hidden h-3.5 w-3.5 text-muted sm:block" />
            <select
              value={sort}
              onChange={(event) => update('sort', event.target.value === 'relevance' ? '' : event.target.value)}
              className="h-10 border border-line bg-raised/60 px-3 font-mono text-[11px] uppercase tracking-label text-fg outline-none focus:border-accent"
              aria-label="Sort tools"
            >
              {SORTS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
          <button type="button" onClick={() => update('recent', recentOnly ? '' : '1')} aria-pressed={recentOnly} className={cn('border px-3 py-1 font-mono text-[10px] uppercase tracking-label transition', recentOnly ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:border-accent/40 hover:text-fg')}>Recently added · 30 days</button>
          <Link
            to="/tools"
            className={cn(
              'border px-3 py-1 font-mono text-[10px] uppercase tracking-label transition',
              !activeCategory
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-line text-muted hover:border-accent/40 hover:text-fg'
            )}
          >
            All
          </Link>
          {CATEGORIES.map((item) => {
            const count = TOOLS.filter((tool) => tool.category === item.id).length;
            return (
              <Link
                key={item.id}
                to={`/category/${item.id}`}
                className={cn(
                  'inline-flex items-center gap-1.5 border px-3 py-1 font-mono text-[10px] uppercase tracking-label transition',
                  activeCategory === item.id
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-line text-muted hover:border-accent/40 hover:text-fg'
                )}
              >
                <Icon name={item.icon} className="h-3 w-3" />
                {item.shortName}
                <span className="opacity-50">{count}</span>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        {results.length === 0 ? (
          <EmptyState
            icon="Search"
            title="No tools found"
            description="Try a different keyword, or clear the filters to see the whole atlas."
            action={
              <Link to="/tools" className="bg-accent px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-label text-on-accent">
                Show all tools
              </Link>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {results.map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
