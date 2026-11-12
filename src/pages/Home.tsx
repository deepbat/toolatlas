import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Clock, Search, Sparkles, Star, Zap } from 'lucide-react';
import ToolCard from '../components/ToolCard';
import { Icon } from '../components/Icon';
import {
  CATEGORIES,
  CATEGORY_MAP,
  FEATURED_TOOLS,
  POPULAR_TOOLS,
  RECENTLY_ADDED,
  TOOLS,
  TOOL_MAP,
} from '../lib/catalog';
import { searchTools } from '../lib/search';
import { useApp } from '../lib/store';
import { cn, relativeTime, tint } from '../lib/utils';

function categoryCount(categoryId: string): number {
  return TOOLS.filter((tool) => tool.category === categoryId).length;
}

function SectionHeader({
  index,
  title,
  note,
  to,
  cta = 'View all',
}: {
  index?: string;
  title: string;
  note?: string;
  to?: string;
  cta?: string;
}) {
  return (
    <div className="mb-6">
      <div className="section-line">
        <span className="label text-accent">{index}</span>
        {note && <span className="label max-w-[160px] text-right text-muted">{note}</span>}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-xl font-medium tracking-tight text-fg sm:text-2xl">{title}</h2>
        {to && (
          <Link
            to={to}
            className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-label text-accent transition hover:gap-2.5"
          >
            {cta} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}

function HeroSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const suggestions = useMemo(() => (query.trim() ? searchTools(query).slice(0, 5) : []), [query]);

  return (
    <form
      className="relative w-full"
      onSubmit={(event) => {
        event.preventDefault();
        navigate(query.trim() ? `/tools?q=${encodeURIComponent(query.trim())}` : '/tools');
      }}
      role="search"
    >
      <div
        className={cn(
          'flex items-center gap-2 border bg-surface/80 p-2 transition',
          focused ? 'border-accent' : 'border-line'
        )}
      >
        <Search className="ml-2 h-4 w-4 shrink-0 text-accent" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          placeholder="Try “pdf”, “json”, “bmi” or “password”…"
          className="h-10 flex-1 bg-transparent font-mono text-[13px] text-fg outline-none placeholder:text-muted/60 sm:text-sm"
          aria-label="Search all tools"
        />
        <button
          type="submit"
          className="hidden shrink-0 items-center gap-1.5 bg-accent px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-label text-on-accent transition hover:brightness-110 sm:inline-flex"
        >
          Search <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {focused && suggestions.length > 0 && (
        <div className="absolute inset-x-0 top-full z-20 mt-2 border border-line bg-surface p-1 text-left shadow-lift animate-fade-in">
          {suggestions.map((tool) => (
            <Link
              key={tool.id}
              to={`/tools/${tool.id}`}
              className="flex items-center gap-3 px-3 py-2 transition hover:bg-raised"
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center border border-line"
                style={{
                  backgroundColor: tint(CATEGORY_MAP[tool.category].accent, 0.12),
                  color: CATEGORY_MAP[tool.category].accent,
                }}
              >
                <Icon name={tool.icon} className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-sm font-medium text-fg">{tool.name}</span>
                <span className="block truncate font-mono text-[9px] uppercase tracking-label text-muted">
                  {CATEGORY_MAP[tool.category].shortName}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 text-muted/40" />
            </Link>
          ))}
          <button
            type="submit"
            className="mt-1 flex w-full items-center justify-between border-t border-line px-3 py-2 font-mono text-[10px] uppercase tracking-label text-muted transition hover:text-accent"
          >
            See all results for “{query}”
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {['JSON formatter', 'PDF merge', 'Unit converter', 'BMI', 'Timezone', 'Password'].map((term) => (
          <button
            key={term}
            type="button"
            onClick={() => navigate(`/tools?q=${encodeURIComponent(term)}`)}
            className="border border-line px-2.5 py-1 font-mono text-[10px] uppercase tracking-label text-muted transition hover:border-accent hover:text-accent"
          >
            {term}
          </button>
        ))}
      </div>
    </form>
  );
}

export default function HomePage() {
  const { favorites, recents } = useApp();
  const favoriteTools = favorites.map((id) => TOOL_MAP[id]).filter(Boolean);
  const recentEntries = recents
    .map((entry) => ({ tool: TOOL_MAP[entry.id], at: entry.at }))
    .filter((entry) => Boolean(entry.tool))
    .slice(0, 4);

  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <div className="hero-grid absolute inset-0 opacity-70" aria-hidden="true" />
        <div
          className="halo -right-40 -top-56 h-[36rem] w-[36rem]"
          style={{ background: 'rgb(var(--accent) / 0.16)' }}
          aria-hidden="true"
        />
        <div
          className="halo -left-40 top-24 h-[28rem] w-[28rem]"
          style={{ background: 'rgb(var(--accent-2) / 0.12)' }}
          aria-hidden="true"
        />

        <div className="container-page relative z-10 pb-16 pt-14 sm:pt-20">
          <div className="max-w-5xl">
            <p className="label inline-flex items-center gap-2.5 text-soft">
              <span className="h-1.5 w-1.5 animate-pulse-dot bg-accent" aria-hidden="true" />
              {TOOLS.length} tools live · {CATEGORIES.length} categories · no sign-up
            </p>

            <p className="label mt-9 text-accent-2">Your everyday tool drawer</p>

            <h1 className="mt-4 font-display text-[clamp(2.5rem,6.3vw,5.6rem)] font-medium leading-[0.9] tracking-[-0.055em] text-fg">
              Small jobs.
              <br />
              <em className="not-italic font-bold text-accent">Sorted.</em>
            </h1>

            <div className="mt-10 grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
              <p className="max-w-md text-base leading-relaxed text-muted">
                For the PDF that needs two pages out. The photo that is 12 KB too large. The calculation that does not need a spreadsheet. Open a tool and get on with it.
              </p>
              <HeroSearch />
            </div>

            <div className="mt-12 flex flex-wrap gap-x-14 gap-y-6">
              {[
                { label: 'Tools available', value: TOOLS.length },
                { label: 'Categories', value: CATEGORIES.length },
                { label: 'Data uploaded', value: '0' },
              ].map((stat) => (
                <div key={stat.label}>
                  <p className="font-display text-3xl font-medium tracking-tight text-fg">{stat.value}</p>
                  <p className="mt-1 font-mono text-[9px] uppercase tracking-label text-muted">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="container-page space-y-16 pt-14">
        <section className="grid gap-4 sm:grid-cols-3" aria-label="Popular workflows">{[
          {title:'Photo too large?',copy:'Fit an upload form in seconds.',to:'/tools/image-target-size',tag:'20 KB / 50 KB / 100 KB'},
          {title:'PDF needs a quick fix?',copy:'Merge, extract, rotate and number.',to:'/category/pdf',tag:'NO UPLOADS'},
          {title:'Everyday money math.',copy:'GST, EMI, discounts and SIP estimates.',to:'/category/finance',tag:'INDIA-FRIENDLY'}
        ].map(w=><Link key={w.to} to={w.to} className="group border border-line bg-surface p-5 transition hover:border-accent"><p className="label text-accent">{w.tag}</p><h2 className="mt-4 text-lg">{w.title} ↗</h2><p className="mt-2 text-sm text-muted">{w.copy}</p></Link>)}</section>
        <div className="flex flex-wrap items-center justify-between gap-4 border-y border-line py-5"><p className="text-sm text-muted">Start with a job, not a dozen tabs. Read our practical workflows.</p><Link to="/guides" className="text-sm text-accent">Open field notes ↗</Link></div>
        <details className="border border-line bg-surface p-5"><summary className="cursor-pointer font-display text-lg text-accent">Browse all {TOOLS.length} tools</summary><div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{TOOLS.map(t=><Link key={t.id} to={'/tools/'+t.id} className="border-b border-line py-3 text-sm hover:text-accent">{t.name} ↗</Link>)}</div></details>
        <section aria-labelledby="categories-heading">
          <SectionHeader
            index="01 / Browse"
            title="Find your category"
            note="Thirteen collections"
            to="/categories"
            cta="All categories"
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {CATEGORIES.map((category) => (
              <Link
                key={category.id}
                to={`/category/${category.id}`}
                className="group flex items-center gap-3 border border-line bg-surface/80 p-3 transition hover:border-accent/50 hover:-translate-y-0.5"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center border border-line transition group-hover:border-accent/50"
                  style={{ backgroundColor: tint(category.accent, 0.12), color: category.accent }}
                >
                  <Icon name={category.icon} className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-display text-sm font-medium text-fg">
                    {category.shortName}
                  </span>
                  <span className="block font-mono text-[9px] uppercase tracking-label text-muted">
                    {categoryCount(category.id)}{' '}
                    {categoryCount(category.id) === 1 ? 'tool' : 'tools'}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        {recentEntries.length > 0 && (
          <section aria-labelledby="recent-heading">
            <SectionHeader
              index="02 / Continue"
              title="Recently used"
              note="Pick up where you left off"
              to="/recent"
              cta="Full history"
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {recentEntries.map(({ tool, at }) => (
                <Link
                  key={tool.id}
                  to={`/tools/${tool.id}`}
                  className="flex items-center gap-3 border border-line bg-surface/80 p-3 transition hover:border-accent/50"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-line bg-raised text-accent">
                    <Icon name={tool.icon} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-display text-sm font-medium text-fg">{tool.name}</span>
                    <span className="block font-mono text-[9px] uppercase tracking-label text-muted">
                      {relativeTime(at)}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section aria-labelledby="featured-heading">
          <SectionHeader
            index="03 / Hand-picked"
            title="Featured tools"
            note="Hand-picked shortcuts"
            to="/tools"
            cta="Browse all"
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURED_TOOLS.slice(0, 6).map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        </section>

        <section aria-labelledby="popular-heading">
          <SectionHeader
            index="04 / Useful every day"
            title="Everyday essentials"
            note="A dependable starting point"
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {POPULAR_TOOLS.slice(0, 4).map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <div className="min-w-0">
            <SectionHeader
              index="05 / Fresh"
              title="Recently added"
              note="New applications land here first"
              to="/tools?sort=newest"
              cta="See timeline"
            />
            <div className="overflow-hidden border border-line bg-surface/80">
              {RECENTLY_ADDED.slice(0, 6).map((tool) => (
                <Link
                  key={tool.id}
                  to={`/tools/${tool.id}`}
                  className="group flex items-center gap-3 border-b border-line px-4 py-3 transition last:border-b-0 hover:bg-raised/60"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-line bg-raised text-accent">
                    <Icon name={tool.icon} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-sm font-medium text-fg">{tool.name}</span>
                    <span className="block truncate text-[11px] text-muted">{tool.description}</span>
                  </span>
                  <span className="hidden shrink-0 font-mono text-[9px] uppercase tracking-label text-muted sm:block">
                    {new Date(tool.added).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted/40 transition group-hover:text-accent" />
                </Link>
              ))}
            </div>
          </div>

          <div className="min-w-0">
            <SectionHeader index="06 / Yours" title="Saved & personal" note="Stored in this browser" />
            <div className="space-y-4">
              <div className="border border-line bg-surface/80 p-5">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-fg">
                    <Star className="h-3.5 w-3.5 text-accent" /> Favourites
                  </h3>
                  <Link to="/favorites" className="font-mono text-[10px] uppercase tracking-label text-accent">
                    View all
                  </Link>
                </div>
                {favoriteTools.length === 0 ? (
                  <p className="mt-2.5 text-xs leading-relaxed text-muted">
                    Tap the star on any tool to pin it here. Favourites are stored only in this browser.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {favoriteTools.slice(0, 4).map((tool) => (
                      <li key={tool.id}>
                        <Link
                          to={`/tools/${tool.id}`}
                          className="flex items-center gap-2 py-1 text-sm text-muted transition hover:text-fg"
                        >
                          <Icon name={tool.icon} className="h-3.5 w-3.5 text-accent" />
                          <span className="truncate">{tool.name}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border border-line bg-surface/80 p-5">
                <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-fg">
                  <Clock className="h-3.5 w-3.5 text-accent" /> Recent activity
                </h3>
                {recents.length === 0 ? (
                  <p className="mt-2.5 text-xs leading-relaxed text-muted">
                    Tools you open appear here so you can jump back in with one click.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {recents.slice(0, 4).map((entry) => {
                      const tool = TOOL_MAP[entry.id];
                      if (!tool) return null;
                      return (
                        <li key={entry.id}>
                          <Link
                            to={`/tools/${entry.id}`}
                            className="flex items-center justify-between gap-2 py-1 text-sm text-muted transition hover:text-fg"
                          >
                            <span className="truncate">{tool.name}</span>
                            <span className="shrink-0 font-mono text-[9px] uppercase tracking-label">
                              {relativeTime(entry.at)}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden border border-line bg-surface/80 p-8 sm:p-12">
          <div
            className="halo -right-24 -top-32 h-96 w-96"
            style={{ background: 'rgb(var(--accent) / 0.14)' }}
            aria-hidden="true"
          />
          <div className="relative grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
            <div>
              <p className="label text-accent">07 / Open by design</p>
              <h2 className="mt-3 font-display text-2xl font-medium leading-tight tracking-tight text-fg sm:text-3xl">
                Made for the small stuff,
                <br />
                <em className="not-italic text-accent">used every day.</em>
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
                A useful tool should do one job well. No sign-up detour, no upload queue, no disappearing download button. Just the settings you need and a result you can keep.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  to="/about"
                  className="inline-flex items-center gap-2 bg-accent px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-label text-on-accent transition hover:brightness-110"
                >
                  <Sparkles className="h-3.5 w-3.5" /> About the project
                </Link>
                <a
                  href="https://github.com/deepbat/toolatlas"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 border border-line px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-label text-fg transition hover:border-accent hover:text-accent"
                >
                  Source on GitHub
                </a>
              </div>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {[
                { icon: 'ShieldCheck', title: 'Local-first', copy: 'Processing stays in your browser.' },
                { icon: 'Zap', title: 'Instant', copy: 'No uploads, no queues, no round-trips.' },
                { icon: 'Compass', title: 'Modular', copy: 'New tools plug in without rewrites.' },
                { icon: 'Sparkles', title: 'Consistent', copy: 'One design system across every app.' },
              ].map((item) => (
                <li key={item.title} className="border border-line bg-raised/40 p-4">
                  <Icon name={item.icon} className="h-4 w-4 text-accent" />
                  <p className="mt-2.5 font-display text-sm font-semibold text-fg">{item.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{item.copy}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 border border-line bg-surface/60 px-6 py-4 font-mono text-[10px] uppercase tracking-label text-muted">
          <span className="flex items-center gap-2"><Zap className="h-3 w-3 text-accent" /> No account needed</span>
          <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 bg-accent" /> Zero uploads</span>
          <span className="flex items-center gap-2"><Star className="h-3 w-3 text-accent" /> Free forever</span>
          <span className="flex items-center gap-2"><Sparkles className="h-3 w-3 text-accent" /> MIT licensed</span>
        </section>
      </div>
    </>
  );
}
