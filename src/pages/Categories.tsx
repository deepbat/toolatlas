import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Icon } from '../components/Icon';
import { CATEGORIES, TOOLS } from '../lib/catalog';
import { SECTIONS, sectionTools } from '../lib/sections';
import { tint } from '../lib/utils';

export default function CategoriesPage() {
  return (
    <div className="container-page pt-12">
      <header className="section-line">
        <div className="flex items-baseline gap-3">
          <span className="label text-muted/60">Atlas</span>
          <h1 className="font-display text-2xl font-medium tracking-tight text-fg sm:text-3xl">
            Browse by category
          </h1>
        </div>
        <span className="label hidden text-muted sm:inline">{SECTIONS.length} sections</span>
      </header>

      <p className="max-w-2xl text-sm leading-relaxed text-muted">
        Eight sections, each with its own page and permanent URL. Pick one and explore — every tool
        opens on its own page and runs entirely in your browser.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SECTIONS.map((section) => {
          const tools = sectionTools(section.id);
          return (
            <Link
              key={section.id}
              to={`/${section.id}`}
              className="group flex flex-col border border-line bg-surface/80 p-5 transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lift"
            >
              <div className="flex items-start justify-between">
                <span
                  className="flex h-11 w-11 items-center justify-center border border-line transition group-hover:border-accent/50"
                  style={{ backgroundColor: tint(section.accent, 0.12), color: section.accent }}
                >
                  <Icon name={section.icon} className="h-5 w-5" />
                </span>
                <span className="font-mono text-[10px] uppercase tracking-label text-muted">
                  {tools.length > 0
                    ? `${tools.length} ${tools.length === 1 ? 'tool' : 'tools'}`
                    : 'Coming soon'}
                </span>
              </div>

              <h2 className="mt-4 font-display text-base font-semibold tracking-tight text-fg">
                {section.name}
              </h2>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted">
                {section.description}
              </p>

              {tools.length > 0 && (
                <div className="mt-3.5 flex flex-wrap gap-1.5">
                  {tools.slice(0, 3).map((tool) => (
                    <span
                      key={tool.id}
                      className="border border-line bg-raised/60 px-2 py-0.5 font-mono text-[9px] uppercase tracking-label text-muted"
                    >
                      {tool.name}
                    </span>
                  ))}
                  {tools.length > 3 && (
                    <span className="px-2 py-0.5 font-mono text-[9px] uppercase tracking-label text-muted">
                      +{tools.length - 3}
                    </span>
                  )}
                </div>
              )}

              <span className="mt-5 inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-label text-accent transition group-hover:gap-2.5">
                Explore <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          );
        })}
      </div>

      <section className="mt-14" aria-labelledby="collections-heading">
        <div className="section-line">
          <span className="label text-accent">Sub-collections</span>
          <span className="label max-w-[160px] text-right text-muted">
            {CATEGORIES.length} collections
          </span>
        </div>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          The thirteen original collections, preserved with their own pages for finer-grained
          browsing.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {CATEGORIES.map((category) => {
            const count = TOOLS.filter((tool) => tool.category === category.id).length;
            return (
              <Link
                key={category.id}
                to={`/category/${category.id}`}
                className="group flex items-center gap-3 border border-line bg-surface/80 p-3 transition hover:-translate-y-0.5 hover:border-accent/50"
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
                    {count} {count === 1 ? 'tool' : 'tools'}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
