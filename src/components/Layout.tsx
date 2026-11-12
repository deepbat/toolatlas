import SEO from '../lib/seo';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Github, Menu, Moon, Search, Sun, X } from 'lucide-react';
import { CATEGORIES, TOOLS } from '../lib/catalog';
import { useApp } from '../lib/store';
import { cn } from '../lib/utils';
import SearchDialog from './SearchDialog';

const GITHUB_URL = 'https://github.com/deepbat/toolatlas';

function navClass({ isActive }: { isActive: boolean }): string {
  return cn(
    'text-[12px] transition',
    isActive ? 'text-accent' : 'text-soft hover:text-fg'
  );
}

function Brand() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-3" aria-label="ToolAtlas home">
      <span className="relative flex h-8 w-8 items-center justify-center border border-accent bg-accent/10">
        <span className="font-mono text-[11px] font-semibold tracking-tight text-accent">TA</span>
      </span>
      <span className="font-mono text-[12px] font-semibold uppercase tracking-wide2 text-fg">
        Tool<span className="text-accent">Atlas</span>
      </span>
    </Link>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useApp();
  const dark = resolvedTheme === 'dark';
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      className="inline-flex h-8 items-center gap-2 border border-line px-2.5 font-mono text-[10px] font-semibold uppercase tracking-label text-muted transition hover:border-accent hover:text-accent"
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Light theme' : 'Dark theme'}
    >
      {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">{dark ? 'Light' : 'Dark'}</span>
    </button>
  );
}

function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-line bg-surface/40">
      <div className="container-page py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Brand />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
              One Place. Countless Useful Tools. A growing atlas of free, privacy-first browser
              utilities — no accounts, no uploads, no waiting.
            </p>
            <p className="mt-4 font-mono text-[10px] uppercase tracking-label text-muted">
              {TOOLS.length} tools · {CATEGORIES.length} categories · 100% local processing
            </p>
          </div>

          <div>
            <h3 className="label text-accent">Explore</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-muted">
              <li><Link className="transition hover:text-accent" to="/tools">All tools</Link></li>
              <li><Link className="transition hover:text-accent" to="/categories">Categories</Link></li>
              <li><Link className="transition hover:text-accent" to="/favorites">Favourites</Link></li>
              <li><Link className="transition hover:text-accent" to="/recent">Recently used</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="label text-accent">Popular</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-muted">
              <li><Link className="transition hover:text-accent" to="/tools/json-formatter">JSON Formatter</Link></li>
              <li><Link className="transition hover:text-accent" to="/tools/unit-converter">Unit Converter</Link></li>
              <li><Link className="transition hover:text-accent" to="/tools/word-counter">Word Counter</Link></li>
              <li><Link className="transition hover:text-accent" to="/tools/password-generator">Password Generator</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="label text-accent">Project</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-muted">
              <li><Link className="transition hover:text-accent" to="/about">About ToolAtlas</Link></li>
              <li><Link className="transition hover:text-accent" to="/guides">Practical guides</Link></li>
              <li><Link className="transition hover:text-accent" to="/privacy">Privacy policy</Link></li>
              <li><Link className="transition hover:text-accent" to="/contact">Contact & support</Link></li>
              <li><Link className="transition hover:text-accent" to="/terms">Terms of use</Link></li>
              <li>
                <a className="transition hover:text-accent" href={GITHUB_URL} target="_blank" rel="noreferrer">
                  GitHub repository ↗
                </a>
              </li>
              <li>
                <a className="transition hover:text-accent" href={`${GITHUB_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer">
                  MIT licence
                </a>
              </li>
              <li>
                <a className="transition hover:text-accent" href={`${GITHUB_URL}/issues/new`} target="_blank" rel="noreferrer">
                  Report a problem
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-line pt-6 font-mono text-[10px] uppercase tracking-label text-muted sm:flex-row sm:items-center">
          <p>© {year} ToolAtlas · Built by deepbat · MIT licensed</p>
          <p className="flex items-center gap-2 text-accent">
            <span className="h-1.5 w-1.5 animate-pulse-dot bg-accent" aria-hidden="true" />
            Everything runs in your browser
          </p>
        </div>
      </div>
    </footer>
  );
}

export default function Layout() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      } else if (event.key === '/' && !typing) {
        event.preventDefault();
        setSearchOpen(true);
      } else if (event.key === 'Escape') {
        setMobileOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="grain" aria-hidden="true" />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:border focus:border-accent focus:bg-surface focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-xl">
        <div className="container-page flex h-16 items-center gap-5">
          <Brand />

          <nav className="ml-2 hidden items-center gap-6 md:flex" aria-label="Primary">
            <NavLink to="/tools" className={navClass} end>
              All tools
            </NavLink>
            <NavLink to="/categories" className={navClass}>
              Categories
            </NavLink>
            <NavLink to="/favorites" className={navClass}>
              Favourites
            </NavLink>
            <NavLink to="/about" className={navClass}>
              About
            </NavLink>
          </nav>

          <span className="ml-auto hidden items-center gap-2 border border-line px-3 py-2 font-mono text-[10px] uppercase tracking-label text-accent lg:inline-flex">
            <span className="h-1.5 w-1.5 animate-pulse-dot bg-accent" aria-hidden="true" />
            {TOOLS.length} tools live
          </span>

          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="hidden h-8 items-center gap-2 border border-line px-2.5 font-mono text-[10px] uppercase tracking-label text-muted transition hover:border-accent hover:text-accent sm:flex"
              aria-label="Search tools"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Search</span>
              <span className="kbd hidden lg:inline-flex">⌘K</span>
            </button>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex h-8 w-8 items-center justify-center border border-line text-muted transition hover:border-accent hover:text-accent sm:hidden"
              aria-label="Search tools"
            >
              <Search className="h-3.5 w-3.5" />
            </button>
            <ThemeToggle />
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="hidden h-8 w-8 items-center justify-center border border-line text-muted transition hover:border-accent hover:text-accent sm:flex"
              aria-label="ToolAtlas on GitHub"
            >
              <Github className="h-3.5 w-3.5" />
            </a>
            <button
              type="button"
              onClick={() => setMobileOpen((open) => !open)}
              className="flex h-8 w-8 items-center justify-center border border-line text-muted transition hover:border-accent hover:text-accent md:hidden"
              aria-label="Toggle navigation"
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t border-line bg-bg/95 px-5 py-4 backdrop-blur animate-fade-in md:hidden">
            <nav className="grid gap-1" aria-label="Mobile">
              {[
                { to: '/tools', label: 'All tools' },
                { to: '/categories', label: 'Categories' },
                { to: '/favorites', label: 'Favourites' },
                { to: '/recent', label: 'Recently used' },
                { to: '/about', label: 'About' },
              ].map((item, index) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-2 py-2 font-mono text-[11px] uppercase tracking-label transition',
                      isActive ? 'text-accent' : 'text-muted hover:text-fg'
                    )
                  }
                >
                  <span className="text-[9px] opacity-50">{String(index + 1).padStart(2, '0')}</span>
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        )}
      </header>

      <main id="main" className="flex-1 pb-12">
        <SEO /><Outlet />
      </main>

      <Footer />
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
