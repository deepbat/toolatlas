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
    <div className="container-page max-w-4xl pt-12">
      <header>
        <p className="label text-accent">About</p>
        <h1 className="mt-3 font-display text-3xl font-medium leading-tight tracking-tight text-fg sm:text-4xl">
          A growing atlas of useful things.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
          Published by deepbat, ToolAtlas began with a simple frustration: useful utilities are scattered across the web,
          each with its own account prompt, upload step and cookie banner. This project puts them in
          one place, keeps the data on your device, and makes each tool easy to find again.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/tools"
            className="inline-flex items-center gap-2 bg-accent px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-label text-on-accent transition hover:brightness-110"
          >
            Explore {TOOLS.length} tools <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <a
            href="https://github.com/deepbat/toolatlas"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 border border-line px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-label text-fg transition hover:border-accent hover:text-accent"
          >
            <Github className="h-3.5 w-3.5" /> View source
          </a>
        </div>
      </header>

      <section className="mt-12 grid gap-4 sm:grid-cols-2">
        {PRINCIPLES.map((principle) => (
          <div key={principle.title} className="border border-line bg-surface/80 p-5">
            <span className="flex h-10 w-10 items-center justify-center border border-line bg-raised text-accent">
              <Icon name={principle.icon} className="h-4 w-4" />
            </span>
            <h2 className="mt-3.5 font-display text-sm font-semibold text-fg">{principle.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{principle.copy}</p>
          </div>
        ))}
      </section>

      <section className="mt-12 border border-line bg-surface/80 p-6">
        <h2 className="font-display text-lg font-medium tracking-tight text-fg">
          How the platform is organised
        </h2>
        <p className="mt-2.5 text-sm leading-relaxed text-muted">
          Each application is a self-contained module registered in a typed catalogue. The catalogue
          supplies the name, description, category, icon, keywords, version and availability status;
          the module supplies the interface. The shell handles routing, search, favourites, recent
          history, theming and layout, so a new tool is just a folder plus one registry entry.
        </p>
        <div className="mt-4 overflow-x-auto border border-line bg-[#0b171b] p-4 font-mono text-[12px] leading-relaxed text-slate-300">
          <div><span className="text-slate-500">// src/tools/my-tool/App.tsx</span></div>
          <div><span className="text-accent-2">export default function</span> <span className="text-accent">App</span>() {'{'}</div>
          <div className="pl-4"><span className="text-accent-2">return</span> &lt;<span className="text-accent">Panel</span>&gt;…&lt;/<span className="text-accent">Panel</span>&gt;;</div>
          <div>{'}'}</div>
          <div className="mt-2 text-slate-500">// src/lib/catalog.ts — one entry makes it discoverable</div>
          <div>{'{'}</div>
          <div className="pl-4">id: <span className="text-warn">'my-tool'</span>,</div>
          <div className="pl-4">name: <span className="text-warn">'My Tool'</span>,</div>
          <div className="pl-4">category: <span className="text-warn">'misc'</span>,</div>
          <div className="pl-4">version: <span className="text-warn">'1.0.0'</span>,</div>
          <div>{'}'}</div>
        </div>
        <ul className="mt-5 grid gap-2 font-mono text-[10px] uppercase tracking-label text-muted sm:grid-cols-2">
          <li>• React + TypeScript, bundled by Vite</li>
          <li>• Tailwind CSS design tokens and themes</li>
          <li>• Hash-free URLs via a GitHub Pages 404 redirect</li>
          <li>• Optional service worker for offline use</li>
          <li>• Per-tool code splitting and version labels</li>
          <li>• No backend, no database, no accounts</li>
        </ul>
      </section>

      <section className="mt-12 grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Tools live', value: TOOLS.length },
          { label: 'Categories', value: CATEGORIES.length },
          { label: 'Files uploaded', value: '0' },
        ].map((stat) => (
          <div key={stat.label} className="border border-line bg-surface/80 px-5 py-4 text-center">
            <p className="font-display text-2xl font-medium tracking-tight text-fg">{stat.value}</p>
            <p className="mt-1 font-mono text-[9px] uppercase tracking-label text-muted">{stat.label}</p>
          </div>
        ))}
      </section>

      <section className="mt-12 border border-line bg-surface/80 p-6">
        <h2 className="font-display text-lg font-medium tracking-tight text-fg">Roadmap</h2>
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
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12 border border-line bg-surface/80 p-6">
        <h2 className="font-display text-lg font-medium tracking-tight text-fg">Licence & credits</h2>
        <p className="mt-2.5 text-sm leading-relaxed text-muted">
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
