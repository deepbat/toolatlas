import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Icon } from '../components/Icon';
import { CATEGORIES, TOOLS } from '../lib/catalog';
import { cn } from '../lib/utils';

export default function CategoriesPage() {
  return (
    <div className="container-page pt-10">
      <header className="max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">Atlas</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-fg sm:text-4xl">
          Browse by category
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Thirteen collections, each built from small independent applications. Pick a shelf and
          explore — every tool opens on its own page with a permanent URL.
        </p>
      </header>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((category) => {
          const tools = TOOLS.filter((tool) => tool.category === category.id);
          return (
            <Link
              key={category.id}
              to={`/category/${category.id}`}
              className="card-hover group flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-soft"
            >
              <div className="flex items-start justify-between">
                <span
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm transition group-hover:scale-105',
                    category.accent
                  )}
                >
                  <Icon name={category.icon} className="h-5 w-5" />
                </span>
                <span className="rounded-full border border-line bg-raised px-2.5 py-0.5 text-[11px] font-semibold text-muted">
                  {tools.length} {tools.length === 1 ? 'tool' : 'tools'}
                </span>
              </div>

              <h2 className="mt-4 text-base font-semibold tracking-tight text-fg">{category.name}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{category.description}</p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {tools.slice(0, 3).map((tool) => (
                  <span key={tool.id} className="rounded-md bg-raised px-2 py-0.5 text-[11px] text-muted">
                    {tool.name}
                  </span>
                ))}
                {tools.length > 3 && (
                  <span className="rounded-md px-2 py-0.5 text-[11px] text-muted">+{tools.length - 3}</span>
                )}
              </div>

              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent transition group-hover:gap-2.5">
                Explore <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
