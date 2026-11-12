import { Link } from 'react-router-dom';
import { ArrowLeft, Compass } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <span className="flex h-14 w-14 items-center justify-center border border-line bg-surface text-accent">
        <Compass className="h-6 w-6" />
      </span>
      <p className="mt-6 font-mono text-[10px] uppercase tracking-label text-accent">Error 404</p>
      <h1 className="mt-3 max-w-2xl font-display text-3xl font-medium leading-tight tracking-tight text-fg sm:text-4xl">
        This part of the atlas is uncharted.
      </h1>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
        The page you asked for does not exist, or the tool has moved. Try the library — it lists
        everything that is currently available.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Link
          to="/"
          className="inline-flex items-center gap-2 bg-accent px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-label text-on-accent transition hover:brightness-110"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back home
        </Link>
        <Link
          to="/tools"
          className="inline-flex items-center gap-2 border border-line px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-label text-fg transition hover:border-accent hover:text-accent"
        >
          Browse all tools
        </Link>
      </div>
    </div>
  );
}
