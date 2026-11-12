import { Link } from 'react-router-dom';
import { ArrowLeft, Compass } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface text-accent shadow-soft">
        <Compass className="h-6 w-6" />
      </span>
      <p className="mt-5 font-mono text-xs uppercase tracking-[0.2em] text-muted">Error 404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-fg sm:text-4xl">
        This part of the atlas is uncharted.
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
        The page you asked for does not exist, or the tool has moved. Try the library — it lists
        everything that is currently available.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:brightness-110"
        >
          <ArrowLeft className="h-4 w-4" /> Back home
        </Link>
        <Link
          to="/tools"
          className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-fg transition hover:border-accent/40"
        >
          Browse all tools
        </Link>
      </div>
    </div>
  );
}
