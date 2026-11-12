import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import ToolCard from '../components/ToolCard';
import { EmptyState } from '../components/ui';
import { TOOL_MAP } from '../lib/catalog';
import { useApp } from '../lib/store';

export default function FavoritesPage() {
  const { favorites } = useApp();
  const tools = favorites.map((id) => TOOL_MAP[id]).filter(Boolean);

  return (
    <div className="container-page pt-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-500">
            <Star className="h-3.5 w-3.5 fill-current" /> Saved locally
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-fg sm:text-4xl">Favourites</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Your pinned tools. They live in this browser only — no account, no sync, no tracking.
          </p>
        </div>
        <p className="text-sm text-muted">
          <span className="font-semibold text-fg">{tools.length}</span> saved
        </p>
      </header>

      <div className="mt-6">
        {tools.length === 0 ? (
          <EmptyState
            icon="Star"
            title="Nothing pinned yet"
            description="Open any tool and press the star in its header (or on its card) to keep it here."
            action={
              <Link to="/tools" className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white">
                Browse the atlas
              </Link>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tools.map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
