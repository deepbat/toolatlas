import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Github, Menu, Moon, Search, Sun, X } from 'lucide-react';
import { CATEGORIES, TOOLS } from '../lib/catalog';
import { useApp } from '../lib/store';
import { cn } from '../lib/utils';
import { Icon } from './Icon';
import SearchDialog from './SearchDialog';

const GITHUB_URL = 'https://github.com/deepbat/toolatlas';

function navClass({ isActive }: { isActive: boolean }): string {
  return cn(
    'rounded-lg px-3 py-1.5 text-sm font-medium transition',
    isActive ? 'bg-raised text-fg' : 'text-muted hover:bg-raised/60 hover:text-fg'
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useApp();
  const dark = resolvedTheme === 'dark';
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-muted shadow-sm transition hover:text-fg"
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Light theme' : 'Dark theme'}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-20 border-t border-line bg-surface/60">
      <div className="container-page py-12">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link to="/" className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#7c6cff,#22d3ee)] text-white shadow-soft">
                <Icon name="Compass" className="h-5 w-5" />
              </span>
              <span className="text-[15px] font-bold tracking-tight text-fg">
                Tool<span className="text-accent">Atlas</span>
              </span>
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
              One Place. Countless Useful Tools. A growing atlas of free, privacy-first browser
              utilities — no accounts, no uploads, no waiting.
            </p>
            <p className="mt-3 text-xs text-muted">
              {TOOLS.length} tools · {CATEGORIES.length} categories · 100% local processing
            </p>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-fg">Explore</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li><Link className="hover:text-fg" to="/tools">All tools</Link></li>
              <li><Link className="hover:text-fg" to="/categories">Categories</Link></li>
              <li><Link className="hover:text-fg" to="/favorites">Favourites</Link></li>
              <li><Link className="hover:text-fg" to="/recent">Recently used</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-fg">Popular</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li><Link className="hover:text-fg" to="/tools/json-formatter">JSON Formatter</Link></li>
              <li><Link className="hover:text-fg" to="/tools/unit-converter">Unit Converter</Link></li>
              <li><Link className="hover:text-fg" to="/tools/word-counter">Word Counter</Link></li>
              <li><Link className="hover:text-fg" to="/tools/password-generator">Password Generator</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-fg">Project</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li><Link className="hover:text-fg" to="/about">About ToolAtlas</Link></li>
              <li>
                <a className="hover:text-fg" href={GITHUB_URL} target="_blank" rel="noreferrer">
                  GitHub repository
                </a>
              </li>
              <li>
                <a className="hover:text-fg" href={`${GITHUB_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer">
                  MIT licence
                </a>
              </li>
              <li>
                <a className="hover:text-fg" href={`${GITHUB_URL}/issues/new`} target="_blank" rel="noreferrer">
                  Report a problem
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-line pt-6 text-xs text-muted sm:flex-row sm:items-center">
          <p>© {year} ToolAtlas · Built by Deepak Batra · MIT licensed</p>
          <p className="flex items-center gap-1.5">
            <Icon name="ShieldCheck" className="h-3.5 w-3.5" />
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
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/80 backdrop-blur-xl">
        <div className="container-page flex h-16 items-center gap-3">
          <Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label="ToolAtlas home">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#7c6cff,#22d3ee)] text-white shadow-soft">
              <Icon name="Compass" className="h-5 w-5" />
            </span>
            <span className="text-[15px] font-bold tracking-tight text-fg">
              Tool<span className="text-accent">Atlas</span>
            </span>
          </Link>

          <nav className="ml-3 hidden items-center gap-1 md:flex" aria-label="Primary">
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

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="hidden h-9 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm text-muted shadow-sm transition hover:text-fg sm:flex"
              aria-label="Search tools"
            >
              <Search className="h-4 w-4" />
              <span className="hidden lg:inline">Search tools</span>
              <span className="kbd ml-1 hidden lg:inline-flex">⌘K</span>
            </button>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-muted shadow-sm transition hover:text-fg sm:hidden"
              aria-label="Search tools"
            >
              <Search className="h-4 w-4" />
            </button>
            <ThemeToggle />
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="hidden h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-muted shadow-sm transition hover:text-fg sm:flex"
              aria-label="ToolAtlas on GitHub"
            >
              <Github className="h-4 w-4" />
            </a>
            <button
              type="button"
              onClick={() => setMobileOpen((open) => !open)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-muted shadow-sm transition hover:text-fg md:hidden"
              aria-label="Toggle navigation"
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t border-line bg-surface/95 px-4 py-3 backdrop-blur animate-fade-in md:hidden">
            <nav className="grid gap-1" aria-label="Mobile">
              {[
                { to: '/tools', label: 'All tools' },
                { to: '/categories', label: 'Categories' },
                { to: '/favorites', label: 'Favourites' },
                { to: '/recent', label: 'Recently used' },
                { to: '/about', label: 'About' },
              ].map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'rounded-lg px-3 py-2 text-sm font-medium',
                      isActive ? 'bg-raised text-fg' : 'text-muted hover:bg-raised/60 hover:text-fg'
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        )}
      </header>

      <main id="main" className="flex-1 pb-10">
        <Outlet />
      </main>

      <Footer />
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
