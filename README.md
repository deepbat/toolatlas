# ToolAtlas

## Release 2

**86 tools. 13 categories. Small jobs. Sorted.**

The original foundation is preserved and expanded with 51 new browser-only tools, static deep-link pages, full-release offline caching, six practical guides, local fonts, policy/support pages and inert ad spaces. No ad network is active and no revenue is promised. See [release notes and monetization checklist](docs/RELEASE-2.md), [research](docs/RESEARCH.md), and `npm run test:expanded`.


**One Place. Countless Useful Tools.**

ToolAtlas is a growing collection of free, privacy-first browser utilities — calculators, converters, date and time tools, text helpers, PDF and image utilities, developer tools and generators. Everything runs locally in your browser: no sign-up, no uploads, no server round-trips.

🌐 **Live site:** https://deepbat.github.io/toolatlas/

---

## Contents

- [Highlights](#highlights)
- [The tools](#the-tools)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Project structure](#project-structure)
- [Adding a new tool](#adding-a-new-tool)
- [Design system](#design-system)
- [Privacy](#privacy)
- [Deployment](#deployment)
- [Testing](#testing)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Licence](#licence)

---

## Highlights

- **86 fully functional tools** across **13 categories** — no placeholders, no dead buttons.
- **Every tool has its own URL** (`/tools/<id>`) so it can be linked, bookmarked and shared.
- **Global search** — press `⌘K` / `Ctrl+K` (or `/`) from anywhere.
- **Favourites and recently used** tools, stored in your browser only.
- **Light and dark themes**, applied before first paint so there is no flash.
- **Fully local processing** — files, text and numbers never leave your device.
- **No registration**, no accounts, no telemetry.
- **Modular registry** — new tools are added as independent modules without touching existing ones.
- **Responsive** from 320 px phones to wide desktops.
- **PWA-ready** — manifest and service worker included; offline shell caching.

---

## The tools

The current catalogue contains **86 tools across 13 categories**. The compact category list below describes the original foundation; the generated catalogue at [docs/TOOLS.md](docs/TOOLS.md) is the complete reference for Release 2.

Browse the [live tool library](https://deepbat.github.io/toolatlas/tools/) or open a category from the website. New tools are added only after implementation and verification.

---

## Architecture

ToolAtlas is a single-page application with a **registry-driven** design. The shell (navigation, search, routing, theming, favourites, history) is completely separate from the applications it hosts.

```
                    ┌──────────────────────────────┐
                    │        src/lib/catalog.ts    │  ← metadata for every app
                    │  id · name · description ·    │
                    │  category · icon · keywords ·  │
                    │  version · status · layout     │
                    └──────────────┬───────────────┘
                                   │
                 ┌─────────────────┴─────────────────┐
                 │                                   │
    ┌────────────────────────┐         ┌────────────────────────┐
    │   src/tools/index.tsx  │         │  src/pages/*.tsx       │
    │  lazy() → one chunk    │         │  shell: home, browse,  │
    │  per application       │         │  categories, favourites │
    └───────────┬────────────┘         │  recent, about, 404    │
                │                      └────────────────────────┘
                │
    ┌───────────┴────────────┐
    │  src/tools/<id>/App.tsx│  ← independent application modules
    └────────────────────────┘
```

Key ideas:

1. **Metadata lives in one typed catalogue.** `ToolMeta` in `src/lib/types.ts` describes every application: unique id, name, description, category, icon, keywords, version and availability status.
2. **Components are lazy-loaded.** Each tool is a separate chunk, so the initial bundle stays small and tools load on demand.
3. **The registry is checked at build time.** `src/tools/registry.check.ts` fails the TypeScript build if a catalogued tool has no component, or a component has no catalogue entry.
4. **Shared primitives do the heavy lifting.** `src/components/ui.tsx` provides panels, fields, inputs, buttons, tabs, toggles, dropzones, results and more, so every tool looks and feels the same without duplicating markup.
5. **Tools may still own their layout.** A tool can use any primitive and arrange them however it likes — a compact converter and a full-width Pomodoro timer live happily in the same shell.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full write-up.

---

## Getting started

Requires **Node.js 20+** and **npm 10+**.

```bash
git clone https://github.com/deepbat/toolatlas.git
cd toolatlas
npm install
npm run dev
```

The dev server prints a local URL (default <http://localhost:5173/toolatlas/>).

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server with hot reload |
| `npm run build` | Type-check (`tsc --noEmit`) and build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Type-check only |
| `npm run test:e2e` | Run the original headless-Chrome suite (needs a running `preview` server) |
| `npm run test:expanded` | Run expanded browser, file-output, mobile, offline and SEO checks |

### Serving from a different path

The build base path defaults to `/toolatlas/`. Override it with an environment variable:

```bash
BASE_PATH=/ npm run build        # serve from the domain root
BASE_PATH=/my-app/ npm run build # serve from a sub-path
```

---

## Project structure

```
toolatlas/
├── .github/workflows/deploy.yml   # GitHub Pages deployment
├── docs/
│   ├── ARCHITECTURE.md            # how the platform is built
│   ├── ADDING_A_TOOL.md           # step-by-step guide for contributors
│   └── TOOLS.md                   # catalogue of every application
├── public/
│   ├── 404.html                   # deep-link redirect for GitHub Pages
│   ├── manifest.webmanifest       # PWA manifest
│   ├── favicon.svg
│   ├── robots.txt
│   └── sw.js                      # service worker (offline shell)
├── scripts/
│   ├── e2e.mjs                    # original headless functional test suite
│   └── expanded-tests.mjs         # expanded Chromium regression suite
├── src/
│   ├── components/                # shell UI (Layout, SearchDialog, ToolCard, ui.tsx)
│   ├── lib/                       # catalogue, types, search, store, utils, colour
│   ├── pages/                     # route components
│   ├── tools/                     # one folder per application
│   │   ├── <id>/App.tsx
│   │   ├── index.tsx              # lazy application registry
│   │   ├── registry.check.ts      # compile-time catalogue/registry sync
│   │   └── shared.ts              # helpers shared between tools
│   ├── App.tsx                    # routes
│   ├── main.tsx                   # bootstrap, 404 restore, SW registration
│   └── index.css                  # design tokens and base styles
├── index.html
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

---

## Adding a new tool

Three steps — no existing tool needs to change:

1. **Create the module** at `src/tools/<your-tool-id>/App.tsx` with a default export:

   ```tsx
   import { Field, Input, Panel, Result } from '../../components/ui';

   export default function MyTool() {
     return (
       <Panel title="My tool">
         <Field label="Value">
           <Input defaultValue="42" />
         </Field>
         <Result label="Answer" value="42" />
       </Panel>
     );
   }
   ```

2. **Register the metadata** in `src/lib/catalog.ts`:

   ```ts
   {
     id: 'my-tool',
     name: 'My Tool',
     description: 'Does one useful thing, quickly.',
     category: 'misc',
     icon: 'Sparkles',
     keywords: ['my', 'tool', 'example'],
     version: '1.0.0',
     status: 'stable',
     added: '2026-11-12',
   }
   ```

3. **Add the lazy import** in `src/tools/index.tsx`:

   ```ts
   'my-tool': lazy(() => import('./my-tool/App')),
   ```

`npm run build` then fails loudly if any of the three steps is missing. The new tool appears in search, in its category, in the library and in the “recently added” timeline automatically.

Full guide: [`docs/ADDING_A_TOOL.md`](docs/ADDING_A_TOOL.md).

---

## Design system

ToolAtlas shares the visual language of its sibling project, [deepbat.github.io/db](https://deepbat.github.io/db/): deep teal-black ink, acid-lime accent, cyan secondary, mono labels and sharp, technical corners.

| Token | Light | Dark |
| --- | --- | --- |
| `--bg` | `#f3f1e9` | `#071014` |
| `--surface` | `#fffffc` | `#0a181c` |
| `--raised` | `#e5e4dc` | `#0b171b` |
| `--line` | `rgba(20,33,38,.18)` | `rgba(212,240,238,.16)` |
| `--fg` | `#142126` | `#eff3eb` |
| `--muted` | `#546366` | `#869a9d` |
| `--accent` | `#607b00` | `#d7ff3f` |
| `--accent-2` | `#007d92` | `#6fe7ff` |

Colour, spacing and elevation are defined once as CSS custom properties in `src/index.css` and exposed to Tailwind as semantic tokens (`bg`, `surface`, `raised`, `line`, `fg`, `muted`, `accent`, `accent-2`).

```html
<div class="border border-line bg-surface p-5">
```

Because the tokens swap under the `.dark` class, every tool supports both themes without writing a single dark-mode rule. The active theme is resolved by a tiny inline script in `index.html` before React boots, so there is no flash of the wrong theme.

**Type** — `Space Grotesk` for display and headings, `DM Sans` for body copy, `IBM Plex Mono` for labels, data and code. **Shape** — a 2px radius scale, 1px borders instead of shadows, and uppercase mono micro-labels (`01 / Browse`) as the connective tissue between sections.

---

## Privacy

- **All processing is local.** Images are resized with `Canvas`, PDFs are assembled with `pdf-lib`, hashes are computed with the Web Crypto API, QR codes are rendered with `qrcode` — all inside your browser.
- **Nothing is uploaded.** There is no backend, no database and no analytics.
- **Your preferences stay yours.** Theme, favourites, recent history and tool-specific state (your task list, your notes) live in `localStorage` under `toolatlas:*` keys.
- **No accounts.** Nothing to sign up for, nothing to leak.

---

## Deployment

The site is published to GitHub Pages by GitHub Actions.

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build:
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    steps:
      - uses: actions/deploy-pages@v4
```

Enable **Settings → Pages → Build and deployment → Source: GitHub Actions** once, and every push to `main` redeploys the site.

### Deep links on GitHub Pages

GitHub Pages has no rewrite rules, so a direct visit to `/toolatlas/tools/calculator` would 404. `public/404.html` solves this: it stores the requested path in `sessionStorage` and redirects to the app root, and `src/main.tsx` restores the original URL with `history.replaceState` — no extra round-trip, no flash.

---

## Testing

The project ships with a headless-Chrome functional suite that drives the real UI over the Chrome DevTools Protocol. It asserts that every tool computes the right answer, that state persists, that routing works and that no route is broken.

```bash
npm run build
npm run preview          # in one terminal
npm run test:e2e         # in another
```

The expanded suite covers 86 tool routes, representative calculations, file outputs, image and PDF processing, CSV and Unicode edge cases, mobile overflow, offline operation, SEO deep links and browser exceptions. Run `npm run test:expanded` after `npm run build`; it starts its own preview server and requires Playwright Chromium.

---

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) for a phased ToolAtlas 3.0 plan covering quality, PDF Studio, Image Studio, India Finance and Office Toolkit, connected workflows, developer utilities and growth. Unchecked items are planned work, not existing features.

---

## Contributing

Issues and pull requests are welcome. Read [`docs/ADDING_A_TOOL.md`](docs/ADDING_A_TOOL.md) and [`docs/ROADMAP.md`](docs/ROADMAP.md) first. Before opening a pull request, run `npm ci`, `npm run build`, and `npm run test:expanded`. GitHub Actions repeats build and expanded browser checks automatically.

---

## Licence

ToolAtlas is released under the [MIT Licence](LICENSE).

Built with open-source software: [React](https://react.dev), [Vite](https://vite.dev), [TypeScript](https://www.typescriptlang.org), [Tailwind CSS](https://tailwindcss.com), [React Router](https://reactrouter.com), [Lucide](https://lucide.dev), [pdf-lib](https://pdf-lib.js.org) and [qrcode](https://github.com/soldair/node-qrcode).

Created and maintained by **Deepak Batra**.
