import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { CATEGORY_MAP } from '../lib/catalog';
import { useApp } from '../lib/store';
import type { ToolMeta } from '../lib/types';
import { cn } from '../lib/utils';
import { ToolGlyph } from './Glyph';

export default function ToolCard({ tool, className }: { tool: ToolMeta; className?: string }) {
  const category = CATEGORY_MAP[tool.category];
  const { isFavorite, toggleFavorite } = useApp();
  const favorite = isFavorite(tool.id);

  return (
    <Link
      to={`/tools/${tool.id}`}
      className={cn(
        'group relative flex flex-col border border-line bg-surface/90 p-4 transition duration-300 ease-out hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lift',
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <ToolGlyph
          tool={tool}
          accent={category.accent}
          className="h-11 w-11 rounded-xl transition group-hover:border-accent/50"
          emojiClassName="text-[22px]"
        />
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleFavorite(tool.id);
          }}
          className={cn(
            'p-1.5 transition',
            favorite ? 'text-accent' : 'text-muted/50 hover:text-fg'
          )}
          aria-label={favorite ? `Remove ${tool.name} from favourites` : `Add ${tool.name} to favourites`}
          aria-pressed={favorite}
        >
          <Star className={cn('h-4 w-4', favorite && 'fill-current')} />
        </button>
      </div>

      <h3 className="mt-3.5 font-display text-sm font-semibold tracking-tight text-fg">{tool.name}</h3>
      <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted">{tool.description}</p>

      <div className="mt-auto flex items-center gap-2 pt-4 font-mono text-[9px] uppercase tracking-label text-muted">
        <span className="truncate">{category.shortName}</span>
        <span className="text-line">/</span>
        <span>v{tool.version}</span>
        {tool.status === 'beta' && <span className="text-warn">beta</span>}
      </div>
    </Link>
  );
}
