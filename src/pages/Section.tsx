import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, ChevronRight, Search, Star, X } from 'lucide-react';
import { ToolGlyph } from '../components/Glyph';
import { EmptyState } from '../components/ui';
import { SECTION_GLYPHS } from '../lib/glyphs';
import { CATEGORY_MAP } from '../lib/catalog';
import {
  SECTIONS,
  SECTION_MAP,
  sectionGroups,
  sectionTools,
  type SectionId,
} from '../lib/sections';
import { searchTools, suggestQuery } from '../lib/search';
import { useApp } from '../lib/store';
import type { ToolMeta } from '../lib/types';
import { cn, tint } from '../lib/utils';

function LaunchCard({ tool }: { tool: ToolMeta }) {
  const category = CATEGORY_MAP[tool.category];
  const { isFavorite, toggleFavorite } = useApp();
  const favorite = isFavorite(tool.id);

  return (
    <div className="group relative flex flex-col border border-line bg-surface/90 p-4 transition duration-300 ease-out hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lift">
      <div className="flex items-start justify-between gap-2">
        <ToolGlyph
          tool={tool}
          accent={category.accent}
          className="h-11 w-11 rounded-xl transition group-hover:border-accent/50"
          emojiClassName="text-[22px]"
        />
        <button
          type="button"
          onClick={() => toggleFavorite(tool.id)}
          className={cn('p-1.5 transition', favorite ? 'text-accent' : 'text-muted/50 hover:text-fg')}
          aria-label={favorite ? `Remove ${tool.name} from favourites` : `Add ${tool.name} to favourites`}
          aria-pressed={favorite}
        >
          <Star className={cn('h-4 w-4', favorite && 'fill-current')} />
        </button>
      </div>

      <h3 className="mt-3.5 font-display text-sm font-semibold tracking-tight text-fg">{tool.name}</h3>
      <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted">{tool.description}</p>

      <div className="mt-auto pt-4">
        <div className="flex items-center gap-2 pb-3 font-mono text-[9px] uppercase tracking-label text-muted">
          <span className="truncate">{category.shortName}</span>
          <span className="text-line">/</span>
          <span>v{tool.version}</span>
          {tool.status === 'beta' && <span className="text-warn">beta</span>}
        </div>
        <Link
          to={`/tools/${tool.id}`}
          className="inline-flex w-full items-center justify-center gap-1.5 border border-accent/40 bg-accent/10 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-label text-accent transition hover:bg-accent hover:text-on-accent"
          aria-label={`Open ${tool.name}`}
        >
          Open tool <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

export default function SectionPage({ sectionId }: { sectionId: SectionId }) {
  const section = SECTION_MAP[sectionId];
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';

  const tools = useMemo(() => sectionTools(sectionId), [sectionId]);
  const groups = useMemo(() => sectionGroups(sectionId), [sectionId]);
  const filtered = useMemo(
    () => (query.trim() ? searchTools(query, tools) : null),
    [query, tools]
  );

  const update = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set('q', value);
    else next.delete('q');
    setParams(next, { replace: true });
  };

  return (
    <div className="container-page pt-12">
      <nav aria-label="Breadcrumb" className="mb-6">
        <ol className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] uppercase tracking-label text-muted">
          <li>
            <Link to="/" className="transition hover:text-accent">
              Home
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="h-3 w-3 text-muted/50" />
          </li>
          <li aria-current="page" className="text-accent">
            {section.name}
          </li>
        </ol>
      </nav>

      <header className="section-line">
        <div className="flex items-baseline gap-3">
          <span className="label text-muted/60">Category</span>
          <h1 className="font-display text-2xl font-medium tracking-tight text-fg sm:text-3xl">
            {section.name}
          </h1>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-label text-muted">
          {section.comingSoon ? (
            <span className="text-accent">Coming soon</span>
          ) : (
            <>
              <span className="text-accent">{tools.length}</span>{' '}
              {tools.length === 1 ? 'tool' : 'tools'}
            </>
          )}
          {query && <> matching “{query}”</>}
        </p>
      </header>

      <p className="max-w-2xl text-sm leading-relaxed text-muted">{section.description}</p>

      <nav className="mt-6 flex flex-wrap items-center gap-1.5" aria-label="Categories">
        {SECTIONS.map((item) => (
          <Link
            key={item.id}
            to={`/${item.id}`}
            aria-current={item.id === sectionId ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 border px-3 py-1 font-mono text-[10px] uppercase tracking-label transition',
              item.id === sectionId
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-line text-muted hover:border-accent/40 hover:text-fg'
            )}
          >
            <span aria-hidden="true" className="text-xs leading-none">{SECTION_GLYPHS[item.id]}</span>
            {item.shortName}
          </Link>
        ))}
      </nav>

      {!section.comingSoon && (
        <div className="mt-6 border border-line bg-surface/80 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(event) => update(event.target.value)}
              placeholder={`Filter ${section.name.toLowerCase()}…`}
              className="h-10 w-full border border-line bg-raised/60 pl-9 pr-9 font-mono text-[13px] text-fg outline-none transition placeholder:text-muted/60 focus:border-accent"
              aria-label={`Filter ${section.name}`}
            />
            {query && (
              <button
                type="button"
                onClick={() => update('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted transition hover:text-fg"
                aria-label="Clear filter"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-6 space-y-10">
        {section.comingSoon ? (
          <EmptyState
            icon={section.icon}
            title={`No ${section.shortName.toLowerCase()} tools yet`}
            description={`${section.name} are planned for a future release. Until then, the rest of the atlas is fully working.`}
            action={
              <Link
                to="/tools"
                className="bg-accent px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-label text-on-accent"
              >
                Browse all tools
              </Link>
            }
          />
        ) : filtered ? (
          filtered.length === 0 ? (
            <EmptyState
              icon="Search"
              title="No tools found in this category"
              description="Try a different keyword, or clear the filter to see every tool here."
              action={
                <div className="flex flex-col items-center gap-3">
                  {suggestQuery(query) && (
                    <p className="text-sm text-muted">
                      Did you mean{' '}
                      <button
                        type="button"
                        className="text-accent underline"
                        onClick={() => update(suggestQuery(query)!)}
                        data-testid="did-you-mean"
                      >
                        {suggestQuery(query)}
                      </button>
                      ?
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => update('')}
                    className="bg-accent px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-label text-on-accent"
                  >
                    Clear filter
                  </button>
                </div>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((tool) => (
                <LaunchCard key={tool.id} tool={tool} />
              ))}
            </div>
          )
        ) : (
          groups.map((group) => (
            <section key={group.category.id} aria-label={group.category.name}>
              {groups.length > 1 && (
                <div className="mb-4 flex items-baseline justify-between gap-3 border-b border-line pb-2">
                  <h2 className="font-display text-base font-semibold tracking-tight text-fg">
                    {group.category.name}
                  </h2>
                  <span className="font-mono text-[9px] uppercase tracking-label text-muted">
                    {group.tools.length} {group.tools.length === 1 ? 'tool' : 'tools'}
                  </span>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {group.tools.map((tool) => (
                  <LaunchCard key={tool.id} tool={tool} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
