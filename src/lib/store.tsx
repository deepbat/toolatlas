import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Theme = 'light' | 'dark' | 'system';

export interface RecentEntry {
  id: string;
  at: number;
}

interface AppState {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  favorites: string[];
  isFavorite: (id: string) => boolean;
  toggleFavorite: (id: string) => void;
  recents: RecentEntry[];
  recordVisit: (id: string) => void;
  clearRecents: () => void;
}

const STORAGE = {
  theme: 'toolatlas:theme',
  favorites: 'toolatlas:favorites',
  recents: 'toolatlas:recents',
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage is optional */
  }
}

/**
 * The theme is stored as a bare string (not JSON) because the pre-paint script
 * in `index.html` reads it before React boots. Keeping it unquoted avoids a
 * flash of the wrong theme on first paint.
 */
function readTheme(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE.theme);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
    // Tolerate values written by older builds that used JSON encoding.
    const parsed = raw ? (JSON.parse(raw) as Theme) : null;
    return parsed === 'light' || parsed === 'dark' || parsed === 'system' ? parsed : 'system';
  } catch {
    return 'system';
  }
}

function writeTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE.theme, theme);
  } catch {
    /* storage is optional */
  }
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => readTheme());
  const [systemDark, setSystemDark] = useState<boolean>(() =>
    typeof window === 'undefined' ? true : window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  const [favorites, setFavorites] = useState<string[]>(() => read<string[]>(STORAGE.favorites, []));
  const [recents, setRecents] = useState<RecentEntry[]>(() => read<RecentEntry[]>(STORAGE.recents, []));

  const resolvedTheme: 'light' | 'dark' = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', resolvedTheme === 'dark' ? '#071014' : '#f3f1e9');
  }, [resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    writeTheme(next);
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [id, ...current];
      write(STORAGE.favorites, next);
      return next;
    });
  }, []);

  const isFavorite = useCallback((id: string) => favorites.includes(id), [favorites]);

  const recordVisit = useCallback((id: string) => {
    setRecents((current) => {
      const next = [{ id, at: Date.now() }, ...current.filter((entry) => entry.id !== id)].slice(0, 12);
      write(STORAGE.recents, next);
      return next;
    });
  }, []);

  const clearRecents = useCallback(() => {
    setRecents([]);
    write(STORAGE.recents, []);
  }, []);

  const value = useMemo<AppState>(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      favorites,
      isFavorite,
      toggleFavorite,
      recents,
      recordVisit,
      clearRecents,
    }),
    [theme, resolvedTheme, setTheme, favorites, isFavorite, toggleFavorite, recents, recordVisit, clearRecents]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside <AppProvider>');
  return context;
}
