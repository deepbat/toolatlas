import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Clock, Search, ShieldCheck, Sparkles, Star, Zap } from 'lucide-react';
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
import { cn, relativeTime } from '../lib/utils';

function SectionHeader({
  eyebrow,
  title,
  description,
  to,
  cta = 'View all',
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  to?: string;
  cta?: string;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">{eyebrow}</p>
        )}
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-fg sm:text-2xl">{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {to && (
        <Link
          to={to}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-accent transition hover:gap-2.5"
        >
          {cta} <ArrowRight className="h-4 w-4" />
        </Link>
      )}
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
      className="relative mx-auto mt-8 w-full max-w-2xl"
      onSubmit={(event) => {
        event.preventDefault();
        navigate(query.trim() ? `/tools?q=${encodeURIComponent(query.trim())}` : '/tools');
      }}
      role="search"
    >
      <div
        className={cn(
          'flex items-center gap-2 rounded-2xl border bg-surface p-2 shadow-lift transition',
          focused ? 'border-accent/60 ring-4 ring-accent/10' : 'border-line'
        )}
      >
        <Search className="ml-2 h-5 w-5 shrink-0 text-muted" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          placeholder="Try “pdf”, “json”, “bmi” or “password”…"
          className="h-11 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-muted/70 sm:text-base"
          aria-label="Search all tools"
        />
        <button
          type="submit"
          className="hidden shrink-0 items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:brightness-110 sm:inline-flex"
        >
          Search <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {focused && suggestions.length > 0 && (
        <div className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-line bg-surface p-2 text-left shadow-2xl animate-fade-in">
          {suggestions.map((tool) => (
            <Link
              key={tool.id}
              to={`/tools/${tool.id}`}
              className="flex items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-raised"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-raised text-accent">
                <Icon name={tool.icon} className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg">{tool.name}</span>
                <span className="block truncate text-xs text-muted">
                  {CATEGORY_MAP[tool.category].shortName}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 text-muted/60" />
            </Link>
          ))}
          <button
            type="submit"
            className="mt-1 flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium text-muted transition hover:bg-raised hover:text-fg"
          >
            See all results for “{query}”
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-muted">
        <span className="hidden sm:inline">Popular:</span>
        {['JSON formatter', 'PDF merge', 'Unit converter', 'BMI', 'Timezone', 'Password'].map((term) => (
          <button
            key={term}
            type="button"
            onClick={() => navigate(`/tools?q=${encodeURIComponent(term)}`)}
            className="rounded-full border border-line bg-surface px-2.5 py-1 font-medium transition hover:border-accent/40 hover:text-fg"
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
      <section className="relative overflow-hidden border-b border-line/70">
        <div className="aurora" />
        <div className="absolute inset-0 grid-fade opacity-60" aria-hidden="true" />
        <div className="container-page relative z-10 pb-14 pt-16 text-center sm:pt-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3 py-1 text-xs font-medium text-muted shadow-sm backdrop-blur">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            {TOOLS.length} tools live · {CATEGORIES.length} categories · no sign-up
          </span>

          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight text-fg sm:text-5xl lg:text-6xl">
            One Place.{' '}
            <span className="bg-[linear-gradient(100deg,#7c6cff_10%,#a78bfa_45%,#22d3ee_95%)] bg-clip-text text-transparent">
              Countless Useful Tools.
            </span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
            Calculators, converters, text helpers, image tools and developer utilities — all in one
            fast, private workspace. Nothing is uploaded, and nothing needs an account.
          </p>

          <HeroSearch />

          <div className="mx-auto mt-10 grid max-w-2xl grid-cols-3 gap-3 text-center">
            {[
              { label: 'Tools available', value: TOOLS.length },
              { label: 'Categories', value: CATEGORIES.length },
              { label: 'Data uploaded', value: '0' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-line bg-surface/70 px-3 py-3 backdrop-blur">
                <p className="text-xl font-semibold tracking-tight text-fg">{stat.value}</p>
                <p className="text-[11px] uppercase tracking-wider text-muted">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="container-page space-y-16 pt-12">
        <section aria-labelledby="categories-heading">
          <SectionHeader
            eyebrow="Browse the atlas"
            title="Find your category"
            description="Thirteen collections, from quick sums to complete little applications."
            to="/categories"
            cta="All categories"
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {CATEGORIES.slice(0, 10).map((category) => (
              <Link
                key={category.id}
                to={`/category/${category.id}`}
                className="card-hover group flex items-center gap-3 rounded-xl border border-line bg-surface p-3 shadow-soft"
              >
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white',
                    category.accent
                  )}
                >
                  <Icon name={category.icon} className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-fg">{category.shortName}</span>
                  <span className="block text-[11px] text-muted">
                    {TOOLS.filter((tool) => tool.category === category.id).length} tools
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        {recentEntries.length > 0 && (
          <section aria-labelledby="recent-heading">
            <SectionHeader
              eyebrow="Pick up where you left off"
              title="Recently used"
              to="/recent"
              cta="Full history"
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {recentEntries.map(({ tool, at }) => (
                <Link
                  key={tool.id}
                  to={`/tools/${tool.id}`}
                  className="card-hover flex items-center gap-3 rounded-xl border border-line bg-surface p-3 shadow-soft"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-raised text-accent">
                    <Icon name={tool.icon} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-fg">{tool.name}</span>
                    <span className="block text-[11px] text-muted">{relativeTime(at)}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section aria-labelledby="featured-heading">
          <SectionHeader
            eyebrow="Hand-picked"
            title="Featured tools"
            description="The ones people open first — polished, quick and genuinely useful."
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
            eyebrow="Most opened"
            title="Popular applications"
            description="A dependable starting point when you just need to get something done."
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {POPULAR_TOOLS.slice(0, 4).map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <div>
            <SectionHeader
              eyebrow="Fresh from the workshop"
              title="Recently added"
              description="New applications land here first."
              to="/tools?sort=newest"
              cta="See timeline"
            />
            <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
              {RECENTLY_ADDED.slice(0, 6).map((tool) => (
                <Link
                  key={tool.id}
                  to={`/tools/${tool.id}`}
                  className="group flex items-center gap-3 px-4 py-3 transition hover:bg-raised/60"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-raised text-accent">
                    <Icon name={tool.icon} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{tool.name}</span>
                    <span className="block truncate text-xs text-muted">{tool.description}</span>
                  </span>
                  <span className="hidden shrink-0 text-xs text-muted sm:block">
                    {new Date(tool.added).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted/50 transition group-hover:text-accent" />
                </Link>
              ))}
            </div>
          </div>

          <div>
            <SectionHeader eyebrow="Your space" title="Saved & personal" />
            <div className="space-y-4">
              <div className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
                    <Star className="h-4 w-4 text-amber-500" /> Favourites
                  </h3>
                  <Link to="/favorites" className="text-xs font-medium text-accent hover:underline">
                    View all
                  </Link>
                </div>
                {favoriteTools.length === 0 ? (
                  <p className="mt-2 text-xs leading-relaxed text-muted">
                    Tap the star on any tool to pin it here. Favourites are stored only in this browser.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {favoriteTools.slice(0, 4).map((tool) => (
                      <li key={tool.id}>
                        <Link
                          to={`/tools/${tool.id}`}
                          className="flex items-center gap-2 rounded-lg px-1 py-1 text-sm text-muted transition hover:text-fg"
                        >
                          <Icon name={tool.icon} className="h-3.5 w-3.5 text-accent" />
                          <span className="truncate">{tool.name}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
                  <Clock className="h-4 w-4 text-accent" /> Recent activity
                </h3>
                {recents.length === 0 ? (
                  <p className="mt-2 text-xs leading-relaxed text-muted">
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
                            className="flex items-center justify-between gap-2 rounded-lg px-1 py-1 text-sm text-muted transition hover:text-fg"
                          >
                            <span className="truncate">{tool.name}</span>
                            <span className="shrink-0 text-[11px]">{relativeTime(entry.at)}</span>
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

        <section className="relative overflow-hidden rounded-3xl border border-line bg-surface p-8 shadow-soft sm:p-10">
          <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-accent/20 blur-3xl" aria-hidden="true" />
          <div className="relative grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
                Open by design
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
                Built to grow, one tool at a time.
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
                ToolAtlas is a modular platform, not a single-purpose site. Every application is an
                independent module with its own URL, version and lifecycle, so the atlas can keep
                expanding without ever being rebuilt.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  to="/about"
                  className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:brightness-110"
                >
                  <Sparkles className="h-4 w-4" /> About the project
                </Link>
                <a
                  href="https://github.com/deepbat/toolatlas"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-fg transition hover:border-accent/40"
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
                <li key={item.title} className="rounded-xl border border-line bg-raised/50 p-4">
                  <Icon name={item.icon} className="h-5 w-5 text-accent" />
                  <p className="mt-2 text-sm font-semibold text-fg">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">{item.copy}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="flex flex-wrap items-center justify-center gap-6 rounded-2xl border border-line bg-surface/60 px-6 py-5 text-xs text-muted">
          <span className="flex items-center gap-2"><Zap className="h-3.5 w-3.5 text-accent" /> No account needed</span>
          <span className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Zero uploads</span>
          <span className="flex items-center gap-2"><Star className="h-3.5 w-3.5 text-amber-500" /> Free forever</span>
          <span className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-accent" /> MIT licensed</span>
        </section>
      </div>
    </>
  );
}
