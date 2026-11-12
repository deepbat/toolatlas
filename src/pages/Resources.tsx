import { RESOURCES } from '../lib/resources';

export default function ResourcesPage() {
  const total = RESOURCES.reduce((n, g) => n + g.items.length, 0);
  return (
    <div className="container-page pt-12 pb-16">
      <header className="section-line">
        <div className="flex items-baseline gap-3">
          <span className="label text-accent">Elsewhere</span>
          <h1 className="font-display text-2xl font-medium tracking-tight text-fg sm:text-3xl">Free apps worth knowing</h1>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-label text-muted"><span className="text-accent">{total}</span> links</p>
      </header>
      <p className="max-w-2xl text-sm leading-relaxed text-muted">
        ToolAtlas covers small jobs in the browser. Some jobs need a bigger program. These are free to use, and most are open source. They are not made by ToolAtlas, and each opens on its own site. Check the licence and terms there before you rely on one for work.
      </p>
      <nav aria-label="Sections" className="mt-4 flex flex-wrap gap-3 text-sm">
        {RESOURCES.map((g) => <a key={g.id} className="text-accent underline" href={`#${g.id}`}>{g.title}</a>)}
      </nav>
      {RESOURCES.map((g) => (
        <section key={g.id} id={g.id} className="mt-10" aria-labelledby={`h-${g.id}`}>
          <h2 id={`h-${g.id}`} className="font-display text-lg font-medium text-fg">{g.title}</h2>
          <p className="mt-1 text-sm text-muted">{g.intro}</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {g.items.map((r) => (
              <li key={r.url} className="border border-line bg-surface/50 p-4" data-testid="resource-item">
                <a className="font-display text-sm font-medium text-fg underline decoration-line underline-offset-4 hover:text-accent" href={r.url} target="_blank" rel="noopener noreferrer">{r.name}</a>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{r.what}</p>
                <p className="mt-2 font-mono text-[10px] uppercase tracking-label text-muted">{r.licence}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
