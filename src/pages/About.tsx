import { Link } from 'react-router-dom';
import { ArrowRight, Github, ShieldCheck, Sparkles } from 'lucide-react';
import { Icon } from '../components/Icon';
import { CATEGORIES, TOOLS } from '../lib/catalog';

const PRINCIPLES = [
  {
    icon: 'ShieldCheck',
    title: 'Private by default',
    copy: 'Files, text and numbers are processed in your browser with standard web APIs. Nothing is uploaded to a server, and there is no analytics profile of what you do.',
  },
  {
    icon: 'Zap',
    title: 'Fast on purpose',
    copy: 'Every tool is a small code-split module. Pages open quickly even on slow connections, and there is no sign-up wall between you and the work.',
  },
  {
    icon: 'Compass',
    title: 'One design language',
    copy: 'Navigation, search, themes and controls are shared. Tools can have completely different layouts while still feeling like one product.',
  },
  {
    icon: 'Sparkles',
    title: 'Built to grow',
    copy: 'A registry-driven architecture keeps applications independent: new tools can be added, versioned and improved without touching existing ones.',
  },
];

export default function AboutPage() {
  return (
    <div className="container-page max-w-4xl pt-10">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">About</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-fg sm:text-4xl">
          A growing atlas of useful things.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          ToolAtlas began with a simple frustration: useful utilities are scattered across the web,
          each with its own account prompt, upload step and cookie banner. This project puts them in
          one place, keeps the data on your device, and makes each tool easy to find again.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            to="/tools"
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:brightness-110"
          >
            Explore {TOOLS.length} tools <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="https://github.com/deepbat/toolatlas"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-fg transition hover:border-accent/40"
          >
            <Github className="h-4 w-4" /> View source
          </a>
        </div>
      </header>

      <section className="mt-10 grid gap-4 sm:grid-cols-2">
        {PRINCIPLES.map((principle) => (
          <div key={principle.title} className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Icon name={principle.icon} className="h-5 w-5" />
            </span>
            <h2 className="mt-3 text-sm font-semibold text-fg">{principle.title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">{principle.copy}</p>
          </div>
        ))}
      </section>

      <section className="mt-10 rounded-2xl border border-line bg-surface p-6 shadow-soft">
        <h2 className="text-lg font-semibold tracking-tight text-fg">How the platform is organised</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Each application is a self-contained module registered in a typed catalogue. The catalogue
          supplies the name, description, category, icon, keywords, version and availability status;
          the module supplies the interface. The shell handles routing, search, favourites, recent
          history, theming and layout, so a new tool is just a folder plus one registry entry.
        </p>
        <div className="mt-4 overflow-hidden rounded-xl border border-line bg-[#0f1117] p-4 font-mono text-[12px] leading-relaxed text-slate-300">
          <div><span className="text-slate-500">// src/tools/my-tool/App.tsx</span></div>
          <div><span className="text-fuchsia-400">export default function</span> <span className="text-sky-300">App</span>() {'{'}</div>
          <div className="pl-4"><span className="text-fuchsia-400">return</span> &lt;<span className="text-emerald-300">Panel</span>&gt;…&lt;/<span className="text-emerald-300">Panel</span>&gt;;</div>
          <div>{'}'}</div>
          <div className="mt-2 text-slate-500">// src/lib/catalog.ts — one entry makes it discoverable</div>
          <div>{'{'}</div>
          <div className="pl-4">id: <span className="text-amber-300">'my-tool'</span>,</div>
          <div className="pl-4">name: <span className="text-amber-300">'My Tool'</span>,</div>
          <div className="pl-4">category: <span className="text-amber-300">'misc'</span>,</div>
          <div className="pl-4">version: <span className="text-amber-300">'1.0.0'</span>,</div>
          <div>{'}'}</div>
        </div>
        <ul className="mt-4 grid gap-2 text-sm text-muted sm:grid-cols-2">
          <li>• React + TypeScript, bundled by Vite</li>
          <li>• Tailwind CSS design tokens and themes</li>
          <li>• Hash-free URLs via a GitHub Pages 404 redirect</li>
          <li>• Optional service worker for offline use</li>
          <li>• Per-tool code splitting and version labels</li>
          <li>• No backend, no database, no accounts</li>
        </ul>
      </section>

      <section className="mt-10 grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Tools live', value: TOOLS.length },
          { label: 'Categories', value: CATEGORIES.length },
          { label: 'Files uploaded', value: '0' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-line bg-surface px-5 py-4 text-center shadow-soft">
            <p className="text-2xl font-bold tracking-tight text-fg">{stat.value}</p>
            <p className="text-[11px] uppercase tracking-wider text-muted">{stat.label}</p>
          </div>
        ))}
      </section>

      <section className="mt-10 rounded-2xl border border-line bg-surface p-6 shadow-soft">
        <h2 className="text-lg font-semibold tracking-tight text-fg">Roadmap</h2>
        <p className="mt-2 text-sm text-muted">
          The architecture already leaves room for the next steps without a rewrite.
        </p>
        <ul className="mt-4 space-y-2.5 text-sm text-muted">
          {[
            'More advanced multi-page applications, such as a full PDF toolkit.',
            'Offline-first tool support through the existing service worker layer.',
            'Optional cloud integrations behind explicit opt-in.',
            'Deeper per-tool documentation and examples.',
            'Community-contributed modules with review guidelines.',
          ].map((item) => (
            <li key={item} className="flex gap-2.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10 rounded-2xl border border-line bg-surface p-6 shadow-soft">
        <h2 className="text-lg font-semibold tracking-tight text-fg">Licence & credits</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          ToolAtlas is released under the MIT licence. It is built with open-source software: React,
          Vite, Tailwind CSS, Lucide icons, pdf-lib and qrcode. Created and maintained by{' '}
          <a
            className="font-medium text-accent hover:underline"
            href="https://github.com/deepbat"
            target="_blank"
            rel="noreferrer"
          >
            Deepak Batra
          </a>
          .
        </p>
      </section>
    </div>
  );
}
