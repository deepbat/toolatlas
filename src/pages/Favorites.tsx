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
    <div className="container-page pt-12">
      <header className="section-line">
        <div className="flex items-baseline gap-3">
          <span className="label text-accent">Saved locally</span>
          <h1 className="font-display text-2xl font-medium tracking-tight text-fg sm:text-3xl">Favourites</h1>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-label text-muted">
          <span className="text-accent">{tools.length}</span> saved
        </p>
      </header>

      <p className="max-w-2xl text-sm leading-relaxed text-muted">
        Your pinned tools. They live in this browser only — no account, no sync, no tracking.
      </p>

      <div className="mt-6">
        {tools.length === 0 ? (
          <EmptyState
            icon="Star"
            title="Nothing pinned yet"
            description="Open any tool and press the star in its header (or on its card) to keep it here."
            action={
              <Link
                to="/tools"
                className="bg-accent px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-label text-on-accent"
              >
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
