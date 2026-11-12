import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { CATEGORY_MAP } from '../lib/catalog';
import { useApp } from '../lib/store';
import type { ToolMeta } from '../lib/types';
import { cn } from '../lib/utils';
import { Icon } from './Icon';

export default function ToolCard({ tool, className }: { tool: ToolMeta; className?: string }) {
  const category = CATEGORY_MAP[tool.category];
  const { isFavorite, toggleFavorite } = useApp();
  const favorite = isFavorite(tool.id);

  return (
    <Link
      to={`/tools/${tool.id}`}
      className={cn(
        'card-hover group relative flex flex-col rounded-2xl border border-line bg-surface p-4 shadow-soft',
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm transition group-hover:scale-105',
            category.accent
          )}
        >
          <Icon name={tool.icon} className="h-5 w-5" />
        </span>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleFavorite(tool.id);
          }}
          className={cn(
            'rounded-lg p-1.5 transition',
            favorite ? 'text-amber-500' : 'text-muted/60 hover:bg-raised hover:text-fg'
          )}
          aria-label={favorite ? `Remove ${tool.name} from favourites` : `Add ${tool.name} to favourites`}
          aria-pressed={favorite}
        >
          <Star className={cn('h-4 w-4', favorite && 'fill-current')} />
        </button>
      </div>

      <h3 className="mt-3 text-sm font-semibold tracking-tight text-fg">{tool.name}</h3>
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{tool.description}</p>

      <div className="mt-auto flex items-center gap-2 pt-3 text-[11px] text-muted">
        <span className="truncate">{category.shortName}</span>
        <span className="text-line">•</span>
        <span className="font-mono">v{tool.version}</span>
        {tool.status === 'beta' && <span className="text-amber-500">beta</span>}
      </div>
    </Link>
  );
}
