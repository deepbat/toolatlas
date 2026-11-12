# Architecture

How ToolAtlas is put together, and why it is shaped this way.

---

## 1. Design goals

| Goal | How it is met |
| --- | --- |
| New tools must be independent | One folder per tool, one registry entry, no edits to existing tools |
| The initial page must stay small | Every tool is a lazily loaded chunk |
| Every tool must be consistent | A shared primitive library (`src/components/ui.tsx`) and shared tokens |
| But tools must be free to differ | Tools compose the primitives however they like |
| Data must stay on the device | No backend; `localStorage` and Web APIs only |
| The platform must keep growing | Registry, categories and routing are data-driven, not hard-coded |

---

## 2. Layers

```
┌──────────────────────────────────────────────────────────────┐
│ Shell                                                         │
│  Layout (header, nav, footer)  SearchDialog (⌘K)  ToolCard   │
├──────────────────────────────────────────────────────────────┤
│ Pages                                                        │
│  Home  Browse  Categories  Favorites  Recent  About  ToolPage │
├──────────────────────────────────────────────────────────────┤
│ Registry                                                     │
│  lib/catalog.ts (metadata)   tools/index.tsx (lazy modules)  │
├──────────────────────────────────────────────────────────────┤
│ Shared services                                              │
│  lib/store.tsx (theme, favourites, history)                  │
│  lib/search.ts (ranking)  lib/utils.ts  lib/color.ts         │
├──────────────────────────────────────────────────────────────┤
│ Applications                                                 │
│  tools/<id>/App.tsx  — 35 independent modules                │
└──────────────────────────────────────────────────────────────┘
```

The shell knows nothing about individual tools beyond their metadata. The tools know nothing about the shell beyond the primitives they import.

---

## 3. The application registry

### 3.1 Metadata — `src/lib/catalog.ts`

Every application is described by a `ToolMeta` record (`src/lib/types.ts`):

```ts
export interface ToolMeta {
  id: string;          // unique, URL-safe, never reused
  name: string;
  description: string;
  category: CategoryId;
  icon: string;        // key of the curated icon map
  keywords: string[];  // extra search terms
  version: string;     // semver, shown in the UI
  status: ToolStatus;  // 'stable' | 'beta'
  added: string;       // ISO date, drives "Recently added"
  featured?: boolean;
  popular?: boolean;
  layout?: 'default' | 'wide' | 'full';
}
```

The catalogue also exports the derived collections the pages need:

| Export | Used by |
| --- | --- |
| `CATEGORIES`, `CATEGORY_MAP` | navigation, category pages, cards |
| `TOOL_MAP` | id → metadata lookup (recent history, favourites, routing) |
| `FEATURED_TOOLS` | home page |
| `POPULAR_TOOLS` | home page, search dialog default state |
| `RECENTLY_ADDED` | home page timeline |
| `toolsByCategory(id)` | browse page |
| `relatedTools(tool)` | "you might also need" on a tool page |

Metadata stays in the main bundle; only the tool components are split out. That means the catalogue, search and navigation are available instantly while a tool's code downloads only when you open it.

### 3.2 Components — `src/tools/index.tsx`

```ts
const REGISTRY = {
  calculator: lazy(() => import('./calculator/App')),
  // ...
};

export const TOOL_COMPONENTS: Record<string, LazyExoticComponent<ComponentType>> = REGISTRY;
```

### 3.3 The compile-time guarantee — `src/tools/registry.check.ts`

This file is never imported at runtime. It exists purely so `tsc --noEmit` can prove the two registries agree:

```ts
type MissingComponent = Exclude<CatalogId, RegisteredId>;
type OrphanComponent  = Exclude<RegisteredId, CatalogId>;

export type RegistryIsComplete = Assert<
  [MissingComponent] extends [never] ? true : { error: 'Missing tool components'; ids: MissingComponent }
>;
```

If you add a tool to the catalogue but forget the lazy import (or the other way round), the **build fails with a readable error** instead of the user landing on an empty page.

---

## 4. Routing

Routes live in `src/App.tsx`:

| Route | Page |
| --- | --- |
| `/` | home |
| `/tools` | full library with search, filters and sorting |
| `/category/:categoryId` | one category (same view, pre-filtered) |
| `/categories` | category overview |
| `/favorites` | saved tools |
| `/recent` | recently used tools |
| `/about` | about the project |
| `/tools/:toolId` | a single application |
| `*` | 404 |

`BrowserRouter` is mounted with `basename={import.meta.env.BASE_URL}`, so the same build works at `/toolatlas/` or at a domain root.

### 4.1 Deep links on static hosting

GitHub Pages cannot rewrite unknown paths to `index.html`. ToolAtlas solves this with a two-part trick:

1. `public/404.html` is served for any unknown path. Its inline script saves the requested path in `sessionStorage` and redirects to the app root.
2. `src/main.tsx` reads that value on boot and restores the URL with `history.replaceState`.

The user ends up on the right URL with no visible reload and no extra network round-trip.

---

## 5. State

| What | Where | Key |
| --- | --- | --- |
| Theme | `localStorage` (bare string) | `toolatlas:theme` |
| Favourites | `localStorage` (JSON array of ids) | `toolatlas:favorites` |
| Recently used | `localStorage` (JSON array of `{ id, at }`) | `toolatlas:recents` |
| Task list | `localStorage` | `toolatlas:tool:todo` |
| Quick notes | `localStorage` | `toolatlas:tool:notes` |
| Pomodoro preferences | `localStorage` | `toolatlas:tool:pomodoro` |

`src/lib/store.tsx` exposes theme, favourites and history through a single React context (`useApp()`). Tool-specific state uses the `useLocalStorage` hook in `src/lib/hooks.ts`.

### Theme without a flash

The theme is resolved by an inline script in `index.html` **before** the CSS and React load:

```js
var stored = localStorage.getItem('toolatlas:theme');
if (stored && stored.charAt(0) === '"') stored = JSON.parse(stored); // legacy values
var dark = stored === 'dark' || ((!stored || stored === 'system') && matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.classList.toggle('dark', dark);
```

The stored value is deliberately a bare string rather than JSON, so the same literal is read by both the pre-paint script and the React store. (Values written by older builds are still handled by the `JSON.parse` branch.)

---

## 6. Search

`src/lib/search.ts` implements a small, dependency-free ranker:

- Every whitespace-separated term must appear somewhere in the tool's name, description, category, id or keywords — so extra terms narrow results instead of widening them.
- Matches are weighted: exact name ≫ name prefix ≫ name substring ≫ keyword ≫ category ≫ description.
- Featured tools get a tiny tie-breaking bonus.

The same function powers the hero search, the browse-page filter and the ⌘K dialog, so results are consistent everywhere.

---

## 7. Design system

ToolAtlas shares the visual language of [deepbat.github.io/db](https://deepbat.github.io/db/). `src/index.css` defines the tokens; `tailwind.config.js` exposes them as utilities.

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| `--bg` | 243 241 233 | 7 16 20 | page background |
| `--surface` | 255 255 252 | 10 24 28 | cards, panels |
| `--raised` | 229 228 220 | 11 23 27 | inputs, chips |
| `--line` | 20 33 38 (α .18) | 212 240 238 (α .16) | borders |
| `--fg` | 20 33 38 | 239 243 235 | primary text |
| `--soft` | 76 93 96 | 165 182 182 | secondary text |
| `--muted` | 84 99 102 | 134 154 157 | tertiary text |
| `--accent` | 96 123 0 | 215 255 63 | primary actions |
| `--accent-2` | 0 125 146 | 111 231 255 | cyan secondary |
| `--on-accent` | 7 16 20 | 7 16 20 | text on the accent |
| `--danger` | 168 77 65 | 255 158 147 | destructive |
| `--warn` | 166 106 20 | 255 180 84 | warnings |

Because both themes are the same token names with different values, no component ever needs a `.dark:` variant.

Each category also carries a hue (`--cat-<id>`) that is defined per theme, so a category icon is recognisable without breaking the palette.

### Type

| Family | Role |
| --- | --- |
| Space Grotesk | Display headings, values, card titles |
| DM Sans | Body copy |
| IBM Plex Mono | Labels, data, code, navigation status |

### Shape

The radius scale is deliberately flat — `rounded-2xl` resolves to 3px — and depth comes from 1px borders rather than shadows. Uppercase mono micro-labels (`01 / Browse`) act as the connective tissue between sections, matching the reference site.

### Shared primitives

`src/components/ui.tsx` exports:

`Panel` · `Field` · `Grid` · `Input` · `TextArea` · `Select` · `Button` · `CopyButton` · `DownloadButton` · `Result` · `Stat` · `Badge` · `Note` · `Tabs` · `Toggle` · `ProgressBar` · `EmptyState` · `Dropzone` · `FileRow`

They are deliberately unopinionated about layout, so a tool can compose them into a compact two-column form or a full-width dashboard.

---

## 8. Build and output

- **Vite** produces `dist/` with a hashed asset manifest.
- Each tool is its own chunk; `pdf-lib` is isolated into a shared chunk loaded only by the PDF tools.
- `public/` files are copied verbatim (`404.html`, `manifest.webmanifest`, `sw.js`, `favicon.svg`, `robots.txt`).
- The build runs `tsc --noEmit` first, so a type error blocks deployment.

---

## 9. Offline and PWA

`public/manifest.webmanifest` makes the site installable. `public/sw.js` implements a conservative cache-first strategy for same-origin assets with a network-first fallback for navigations, and it is registered only in production builds. Offline support is a bonus, never a requirement — every tool works with the network switched off.

---

## 10. Extending the platform

| Extension | Where it plugs in |
| --- | --- |
| New tool | `src/tools/<id>/App.tsx` + two registry entries |
| New category | `CATEGORIES` in `src/lib/catalog.ts` |
| New icon | `ICONS` in `src/components/Icon.tsx` |
| New page | `src/pages/<Page>.tsx` + a route in `src/App.tsx` |
| Multi-page app | mount a sub-router inside the tool's `App.tsx` |
| Cloud integration | add an opt-in module; the current architecture has no server coupling to break |
| Telemetry | deliberately absent — any future addition must be opt-in |

---

## 11. Non-goals

- No user accounts or authentication.
- No server-side processing of user data.
- No advertising, tracking pixels or third-party analytics.
- No framework lock-in: tools are plain React components.
