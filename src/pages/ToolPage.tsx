import { Suspense, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, ChevronRight, Github, Star } from 'lucide-react';
import { Icon } from '../components/Icon';
import ToolCard from '../components/ToolCard';
import { Badge, CopyButton, Note } from '../components/ui';
import { CATEGORY_MAP, TOOL_MAP, relatedTools } from '../lib/catalog';
import { useApp } from '../lib/store';
import { cn, formatDate, tint } from '../lib/utils';
import { TOOL_COMPONENTS } from '../tools';
import NotFoundPage from './NotFound';

const GITHUB_URL = 'https://github.com/deepbat/toolatlas';

function ToolSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading tool">
      <div className="h-40 animate-pulse border border-line bg-surface/60" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-24 animate-pulse border border-line bg-surface/60" />
        <div className="h-24 animate-pulse border border-line bg-surface/60" />
      </div>
      <div className="h-10 w-40 animate-pulse bg-raised" />
    </div>
  );
}

export default function ToolPage() {
  const { toolId } = useParams();
  const tool = toolId ? TOOL_MAP[toolId] : undefined;
  const { isFavorite, toggleFavorite, recordVisit } = useApp();

  useEffect(() => {
    if (!tool) return;
    recordVisit(tool.id);
    const previous = document.title;
    document.title = `${tool.name} — ToolAtlas`;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', tool.description);
    return () => {
      document.title = previous;
    };
  }, [tool, recordVisit]);

  if (!tool) return <NotFoundPage />;

  const category = CATEGORY_MAP[tool.category];
  const Component = TOOL_COMPONENTS[tool.id];
  const favorite = isFavorite(tool.id);
  const related = relatedTools(tool);
  const widthClass =
    tool.layout === 'full'
      ? 'max-w-none'
      : tool.layout === 'wide'
        ? 'mx-auto max-w-5xl'
        : 'mx-auto max-w-4xl';

  return (
    <div className="container-page pt-8">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-label text-muted">
        <Link to="/" className="transition hover:text-accent">
          Home
        </Link>
        <ChevronRight className="h-3 w-3 text-muted/40" />
        <Link to={`/category/${category.id}`} className="transition hover:text-accent">
          {category.shortName}
        </Link>
        <ChevronRight className="h-3 w-3 text-muted/40" />
        <span className="text-fg">{tool.name}</span>
      </nav>

      <header className="mt-6 flex flex-col gap-5 border-b border-line pb-7 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-4">
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center border border-line"
            style={{ backgroundColor: tint(category.accent, 0.12), color: category.accent }}
          >
            <Icon name={tool.icon} className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
                {tool.name}
              </h1>
              {tool.status === 'beta' && <Badge tone="warning">Beta</Badge>}
            </div>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{tool.description}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[9px] uppercase tracking-label text-muted">
              <Link to={`/category/${category.id}`} className="font-semibold text-accent hover:underline">
                {category.name}
              </Link>
              <span>v{tool.version}</span>
              <span>Added {formatDate(tool.added)}</span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => toggleFavorite(tool.id)}
            aria-pressed={favorite}
            className={cn(
              'inline-flex items-center gap-2 border px-3 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-label transition',
              favorite
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-line text-fg hover:border-accent hover:text-accent'
            )}
          >
            <Star className={cn('h-3.5 w-3.5', favorite && 'fill-current')} />
            {favorite ? 'Saved' : 'Save'}
          </button>
          <CopyButton
            value={typeof window !== 'undefined' ? window.location.href : ''}
            label="Copy link"
          />
        </div>
      </header>

      <div className={cn('mt-8', widthClass)}>
        <Suspense fallback={<ToolSkeleton />}>
          {Component ? <Component /> : <ToolSkeleton />}
        </Suspense>

        <div className="mt-8 space-y-6">
          <Note>
            <span className="font-semibold text-fg">Private by design.</span> This tool runs entirely
            in your browser. Nothing you enter or upload is sent to a server.
          </Note>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 font-mono text-[10px] uppercase tracking-label text-muted">
            <span>
              Version {tool.version} · {tool.status === 'beta' ? 'Beta' : 'Stable'} ·{' '}
              {tool.keywords.slice(0, 4).join(' · ')}
            </span>
            <a
              href={`${GITHUB_URL}/issues/new?title=${encodeURIComponent(`[${tool.id}] `)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 font-semibold transition hover:text-accent"
            >
              <Github className="h-3.5 w-3.5" /> Report an issue
            </a>
          </div>
        </div>
      </div>

      <section className="mx-auto mt-14 max-w-5xl border-t border-line pt-8">
        <div className="section-line">
          <h2 className="font-display text-base font-medium tracking-tight text-fg">
            You might also need
          </h2>
          <Link
            to={`/category/${category.id}`}
            className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-label text-accent transition hover:gap-2.5"
          >
            More in {category.shortName} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {related.map((item) => (
            <ToolCard key={item.id} tool={item} />
          ))}
        </div>
      </section>
    </div>
  );
}
