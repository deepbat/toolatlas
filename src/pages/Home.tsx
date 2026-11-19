import { PersonalStrip, FileDrop } from '../components/Workflow';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Search } from 'lucide-react';
import ToolWall from '../components/ToolWall';
import { ToolGlyph } from '../components/Glyph';
import { CATEGORY_MAP, TOOLS } from '../lib/catalog';
import { searchTools } from '../lib/search';
import { cn } from '../lib/utils';

function HeroSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const suggestions = useMemo(() => (query.trim() ? searchTools(query).slice(0, 5) : []), [query]);

  return (
    <form
      className="relative w-full max-w-xl"
      onSubmit={(event) => {
        event.preventDefault();
        navigate(query.trim() ? `/tools?q=${encodeURIComponent(query.trim())}` : '/tools');
      }}
      role="search"
    >
      <div
        className={cn(
          'flex items-center gap-2 rounded-full border p-1.5 pl-4 transition',
          focused
            ? 'border-[rgb(var(--wall-blue))] bg-[rgb(var(--wall-card))] shadow-[0_10px_30px_-14px_rgb(15_23_42/0.35)]'
            : 'border-black/[0.06] bg-[rgb(var(--wall-card))] shadow-[0_1px_2px_rgb(15_23_42/0.06),0_12px_28px_-20px_rgb(15_23_42/0.25)]'
        )}
      >
        <Search className="h-4 w-4 shrink-0 text-[rgb(var(--wall-blue))]" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          placeholder="Try “pdf”, “json”, “bmi” or “password”…"
          className="h-9 min-w-0 flex-1 bg-transparent text-[13px] text-[rgb(var(--wall-ink))] outline-none placeholder:text-[rgb(var(--wall-muted)/0.7)] sm:text-sm"
          aria-label="Search all tools"
        />
        <button
          type="submit"
          className="hidden shrink-0 items-center gap-1.5 rounded-full bg-[rgb(var(--wall-blue))] px-4 py-2.5 text-[11px] font-semibold text-white transition hover:brightness-110 sm:inline-flex"
        >
          Search <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {focused && suggestions.length > 0 && (
        <div className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-black/[0.06] bg-[rgb(var(--wall-card))] p-1.5 text-left shadow-[0_24px_50px_-24px_rgb(15_23_42/0.4)] animate-fade-in">
          {suggestions.map((tool) => (
            <Link
              key={tool.id}
              to={`/tools/${tool.id}`}
              className="flex items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-black/[0.04]"
            >
              <ToolGlyph
                tool={tool}
                accent={CATEGORY_MAP[tool.category].accent}
                className="h-8 w-8 rounded-[10px]"
                emojiClassName="text-base"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-sm font-medium text-[rgb(var(--wall-ink))]">
                  {tool.name}
                </span>
                <span className="block truncate font-mono text-[9px] uppercase tracking-label text-[rgb(var(--wall-muted))]">
                  {CATEGORY_MAP[tool.category].shortName}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 text-[rgb(var(--wall-muted)/0.5)]" />
            </Link>
          ))}
          <button
            type="submit"
            className="mt-1 flex w-full items-center justify-between rounded-xl border-t border-black/[0.05] px-3 py-2 font-mono text-[10px] uppercase tracking-label text-[rgb(var(--wall-muted))] transition hover:text-[rgb(var(--wall-blue))]"
          >
            See all results for “{query}”
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </form>
  );
}

export default function HomePage() {
  return (
    <div className="wall-page -mt-px">
      <section className="container-page pb-4 pt-8 sm:pt-11" aria-label="Tool directory">
        <p className="wall-eyebrow">
          <span className="wall-eyebrow-dot" aria-hidden="true" />
          {TOOLS.length} tools · Free · No sign-up · On-device
        </p>
        <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <h1 className="font-display text-[30px] font-semibold leading-[1.05] tracking-[-0.03em] text-[rgb(var(--wall-ink))] sm:text-[42px]">
              One toolbox for every small job.
            </h1>
            <p className="mt-3 max-w-lg text-[13px] leading-relaxed text-[rgb(var(--wall-muted))] sm:text-sm">
              PDF, image, finance, text and everyday utilities that run entirely in your browser.
              Private documents never leave your device.
            </p>
          </div>
          <HeroSearch />
        </div>
        <PersonalStrip />
        <FileDrop />
        <ToolWall />
      </section>

      <section className="container-page pb-16 pt-12 sm:pb-20" aria-label="About Deepak's Tool">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="wall-eyebrow">
              <span className="wall-eyebrow-dot" aria-hidden="true" />
              {TOOLS.length} tools. All in the browser.
            </p>
            <p className="mt-3 font-display text-[26px] font-semibold leading-[1.08] tracking-[-0.03em] text-[rgb(var(--wall-ink))] sm:text-[36px]">
              Made for the small stuff.
            </p>
          </div>
          <div className="flex max-w-xl flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] font-semibold uppercase tracking-label">
            {[
              ['PDF', '/pdf'],
              ['Images', '/image'],
              ['Video', '/video'],
              ['Audio', '/audio'],
              ['Text', '/text'],
              ['Converters', '/converter'],
              ['Web', '/web'],
              ['More', '/utilities'],
            ].map(([label, to]) => (
              <Link
                key={to}
                to={to}
                className="text-[rgb(var(--wall-muted))] transition hover:text-[rgb(var(--wall-blue))]"
              >
                {label} ↗
              </Link>
            ))}
            <Link to="/guides" className="text-[rgb(var(--wall-muted))] transition hover:text-[rgb(var(--wall-blue))]">
              Field notes ↗
            </Link>
            <Link to="/about" className="text-[rgb(var(--wall-muted))] transition hover:text-[rgb(var(--wall-blue))]">
              About ↗
            </Link>
            <a
              href="https://github.com/deepbat/toolatlas"
              target="_blank"
              rel="noreferrer"
              className="text-[rgb(var(--wall-muted))] transition hover:text-[rgb(var(--wall-blue))]"
            >
              GitHub ↗
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
