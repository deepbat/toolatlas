import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Icon } from '../components/Icon';
import { CATEGORIES, TOOLS } from '../lib/catalog';
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
        <span className="label hidden text-muted sm:inline">{CATEGORIES.length} collections</span>
      </header>

      <p className="max-w-2xl text-sm leading-relaxed text-muted">
        Thirteen collections, each built from small independent applications. Pick a shelf and
        explore — every tool opens on its own page with a permanent URL.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((category, index) => {
          const tools = TOOLS.filter((tool) => tool.category === category.id);
          return (
            <Link
              key={category.id}
              to={`/category/${category.id}`}
              className="group flex flex-col border border-line bg-surface/80 p-5 transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lift"
            >
              <div className="flex items-start justify-between">
                <span
                  className="flex h-11 w-11 items-center justify-center border border-line transition group-hover:border-accent/50"
                  style={{ backgroundColor: tint(category.accent, 0.12), color: category.accent }}
                >
                  <Icon name={category.icon} className="h-5 w-5" />
                </span>
                <span className="font-mono text-[10px] uppercase tracking-label text-muted">
                  {String(index + 1).padStart(2, '0')} / {tools.length} tools
                </span>
              </div>

              <h2 className="mt-4 font-display text-base font-semibold tracking-tight text-fg">
                {category.name}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{category.description}</p>

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

              <span className="mt-5 inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-label text-accent transition group-hover:gap-2.5">
                Explore <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
