import { Link } from 'react-router-dom';
import { Clock, Trash2 } from 'lucide-react';
import { Icon } from '../components/Icon';
import { EmptyState } from '../components/ui';
import { CATEGORY_MAP, TOOL_MAP } from '../lib/catalog';
import { useApp } from '../lib/store';
import { relativeTime } from '../lib/utils';

export default function RecentPage() {
  const { recents, clearRecents } = useApp();
  const entries = recents
    .map((entry) => ({ ...entry, tool: TOOL_MAP[entry.id] }))
    .filter((entry) => Boolean(entry.tool));

  return (
    <div className="container-page pt-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            <Clock className="h-3.5 w-3.5" /> Local history
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-fg sm:text-4xl">Recently used</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            The last {entries.length || 0} tools you opened on this device. Clear it any time — it never leaves your browser.
          </p>
        </div>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={clearRecents}
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-muted transition hover:border-rose-400/40 hover:text-rose-500"
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear history
          </button>
        )}
      </header>

      <div className="mt-6">
        {entries.length === 0 ? (
          <EmptyState
            icon="Clock"
            title="No history yet"
            description="Open a tool and it will show up here, newest first."
            action={
              <Link to="/tools" className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white">
                Find a tool
              </Link>
            }
          />
        ) : (
          <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
            {entries.map(({ tool, at }, index) => {
              const category = CATEGORY_MAP[tool.category];
              return (
                <li key={tool.id}>
                  <Link
                    to={`/tools/${tool.id}`}
                    className="group flex items-center gap-4 px-4 py-3.5 transition hover:bg-raised/60"
                  >
                    <span className="w-6 shrink-0 text-center font-mono text-xs text-muted/70">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-raised text-accent">
                      <Icon name={tool.icon} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-fg">{tool.name}</span>
                      <span className="block truncate text-xs text-muted">{category.shortName}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted">{relativeTime(at)}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
