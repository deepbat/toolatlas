import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import ToolCard from '../components/ToolCard';
import { Icon } from '../components/Icon';
import { CATEGORIES, CATEGORY_MAP, TOOLS, toolsByCategory } from '../lib/catalog';
import { searchTools } from '../lib/search';
import type { CategoryId, ToolMeta } from '../lib/types';
import { cn } from '../lib/utils';
import { EmptyState } from '../components/ui';

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

  const results = useMemo(() => {
    const base = activeCategory ? toolsByCategory(activeCategory) : TOOLS;
    return sortTools(searchTools(query, base), sort);
  }, [activeCategory, query, sort]);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <div className="container-page pt-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            {category ? 'Category' : 'Library'}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-fg sm:text-4xl">
            {category ? category.name : 'All tools'}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            {category
              ? category.description
              : 'Every application in the atlas, searchable and filterable. Nothing behind a login.'}
          </p>
        </div>
        <p className="text-sm text-muted">
          <span className="font-semibold text-fg">{results.length}</span>{' '}
          {results.length === 1 ? 'tool' : 'tools'}
          {query && <> matching “{query}”</>}
        </p>
      </header>

      <div className="mt-6 rounded-2xl border border-line bg-surface p-3 shadow-soft">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(event) => update('q', event.target.value)}
              placeholder="Filter by name, keyword or category…"
              className="h-10 w-full rounded-xl border border-line bg-raised/50 pl-9 pr-9 text-sm text-fg outline-none transition placeholder:text-muted/70 focus:border-accent/60 focus:bg-surface focus:ring-4 focus:ring-accent/10"
              aria-label="Filter tools"
            />
            {query && (
              <button
                type="button"
                onClick={() => update('q', '')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted transition hover:bg-raised hover:text-fg"
                aria-label="Clear filter"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <SlidersHorizontal className="hidden h-4 w-4 text-muted sm:block" />
            <select
              value={sort}
              onChange={(event) => update('sort', event.target.value === 'relevance' ? '' : event.target.value)}
              className="h-10 rounded-xl border border-line bg-raised/50 px-3 text-sm text-fg outline-none focus:border-accent/60"
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

        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
          <Link
            to="/tools"
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition',
              !activeCategory
                ? 'border-accent/30 bg-accent/10 text-accent'
                : 'border-line text-muted hover:border-accent/30 hover:text-fg'
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
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition',
                  activeCategory === item.id
                    ? 'border-accent/30 bg-accent/10 text-accent'
                    : 'border-line text-muted hover:border-accent/30 hover:text-fg'
                )}
              >
                <Icon name={item.icon} className="h-3 w-3" />
                {item.shortName}
                <span className="text-[10px] opacity-60">{count}</span>
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
              <Link
                to="/tools"
                className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white"
              >
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
