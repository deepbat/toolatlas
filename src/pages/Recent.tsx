import { Link } from 'react-router-dom';
import { Clock, Trash2 } from 'lucide-react';
import { ToolGlyph } from '../components/Glyph';
import { EmptyState } from '../components/ui';
import { CATEGORY_MAP, TOOL_MAP } from '../lib/catalog';
import { useApp } from '../lib/store';
import { relativeTime, tint } from '../lib/utils';

export default function RecentPage() {
  const { recents, clearRecents } = useApp();
  const entries = recents
    .map((entry) => ({ ...entry, tool: TOOL_MAP[entry.id] }))
    .filter((entry) => Boolean(entry.tool));

  return (
    <div className="container-page pt-12">
      <header className="section-line">
        <div className="flex items-baseline gap-3">
          <span className="label text-accent">Local history</span>
          <h1 className="font-display text-2xl font-medium tracking-tight text-fg sm:text-3xl">
            Recently used
          </h1>
        </div>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={clearRecents}
            className="inline-flex items-center gap-2 border border-line px-3 py-2 font-mono text-[10px] uppercase tracking-label text-muted transition hover:border-danger/50 hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear history
          </button>
        )}
      </header>

      <p className="max-w-2xl text-sm leading-relaxed text-muted">
        The last {entries.length || 0} tools you opened on this device. Clear it any time — it never
        leaves your browser.
      </p>

      <div className="mt-6">
        {entries.length === 0 ? (
          <EmptyState
            icon="Clock"
            title="No history yet"
            description="Open a tool and it will show up here, newest first."
            action={
              <Link
                to="/tools"
                className="bg-accent px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-label text-on-accent"
              >
                Find a tool
              </Link>
            }
          />
        ) : (
          <ol className="border border-line bg-surface/80">
            {entries.map(({ tool, at }, index) => {
              const category = CATEGORY_MAP[tool.category];
              return (
                <li key={tool.id}>
                  <Link
                    to={`/tools/${tool.id}`}
                    className="group flex items-center gap-4 border-b border-line px-4 py-3.5 transition last:border-b-0 hover:bg-raised/60"
                  >
                    <span className="w-6 shrink-0 text-center font-mono text-[10px] text-muted/60">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <ToolGlyph
                      tool={tool}
                      accent={category.accent}
                      className="h-10 w-10 rounded-xl"
                      emojiClassName="text-xl"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-sm font-semibold text-fg">
                        {tool.name}
                      </span>
                      <span className="block truncate font-mono text-[9px] uppercase tracking-label text-muted">
                        {category.shortName}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[9px] uppercase tracking-label text-muted">
                      {relativeTime(at)}
                    </span>
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
