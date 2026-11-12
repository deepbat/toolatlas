import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Search, X } from 'lucide-react';
import { CATEGORY_MAP, POPULAR_TOOLS } from '../lib/catalog';
import { searchTools } from '../lib/search';
import { cn } from '../lib/utils';
import { Icon } from './Icon';

export default function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const results = useMemo(() => {
    const source = query.trim() ? searchTools(query) : POPULAR_TOOLS;
    return source.slice(0, 8);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open) return null;

  const go = (id: string) => {
    onClose();
    navigate(`/tools/${id}`);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => (results.length ? (current + 1) % results.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => (results.length ? (current - 1 + results.length) % results.length : 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const target = results[active];
      if (target) go(target.id);
      else if (query.trim()) {
        onClose();
        navigate(`/tools?q=${encodeURIComponent(query.trim())}`);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/45 px-4 pt-[10vh] backdrop-blur-sm animate-fade-in"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Search tools"
      onKeyDown={onKeyDown}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-4 w-4 shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search 35 tools, categories or keywords…"
            className="h-14 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-muted/70"
            aria-label="Search query"
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted transition hover:bg-raised hover:text-fg"
            aria-label="Close search"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="px-3 py-10 text-center">
              <p className="text-sm font-medium text-fg">No tools match “{query}”</p>
              <p className="mt-1 text-xs text-muted">Try a broader word, like “pdf”, “date” or “json”.</p>
            </div>
          ) : (
            <>
              <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                {query.trim() ? 'Results' : 'Popular right now'}
              </p>
              {results.map((tool, index) => {
                const category = CATEGORY_MAP[tool.category];
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onMouseEnter={() => setActive(index)}
                    onClick={() => go(tool.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition',
                      index === active ? 'bg-accent/10' : 'hover:bg-raised'
                    )}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-accent shadow-sm ring-1 ring-line">
                      <Icon name={tool.icon} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-fg">{tool.name}</span>
                      <span className="block truncate text-xs text-muted">{category.shortName}</span>
                    </span>
                    <ArrowRight className={cn('h-4 w-4 shrink-0', index === active ? 'text-accent' : 'text-muted/50')} />
                  </button>
                );
              })}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line bg-raised/40 px-4 py-2 text-[11px] text-muted">
          <span className="hidden sm:inline">
            <span className="kbd">↑</span> <span className="kbd">↓</span> to navigate · <span className="kbd">↵</span> to open
          </span>
          <span>
            <span className="kbd">esc</span> to close
          </span>
        </div>
      </div>
    </div>
  );
}
