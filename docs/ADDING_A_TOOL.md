# Adding a new tool

A new tool is three edits: one module, one catalogue entry, one lazy import. Nothing else in the codebase needs to change.

---

## 1. Create the module

```bash
mkdir -p src/tools/my-tool
```

Create `src/tools/my-tool/App.tsx`:

```tsx
import { Field, Grid, Input, Panel, Result } from '../../components/ui';

export default function MyTool() {
  return (
    <div className="space-y-4">
      <Panel title="My tool" description="What it does, in one line.">
        <Grid>
          <Field label="First value">
            <Input defaultValue="21" />
          </Field>
          <Field label="Second value">
            <Input defaultValue="2" />
          </Field>
        </Grid>
        <div className="mt-4">
          <Result label="Result" value="42" />
        </div>
      </Panel>
    </div>
  );
}
```

### Rules

- **The file must have a default export.** The registry imports it with `lazy(() => import('./my-tool/App'))`.
- **The component name should match the tool.** It appears in the React DevTools tree.
- **The root element should be a `div` with `space-y-4`** so panels stack consistently. A fragment works too.
- **Tools may use anything React can do** — local state, effects, timers, `localStorage`. There is no imposed structure beyond the default export.

---

## 2. Register the metadata

Add an entry to the `TOOLS` array in `src/lib/catalog.ts`:

```ts
{
  id: 'my-tool',
  name: 'My Tool',
  description: 'Does one useful thing, quickly and privately.',
  category: 'misc',
  icon: 'Sparkles',
  keywords: ['my', 'tool', 'useful', 'example'],
  version: '1.0.0',
  status: 'stable',
  added: '2026-11-12',
  featured: false,
  popular: false,
},
```

| Field | Notes |
| --- | --- |
| `id` | Lowercase, hyphenated, unique, never reused. This becomes the URL: `/tools/my-tool` |
| `name` | The visible title |
| `description` | One sentence; shown on cards, in search results and as the page meta description |
| `category` | One of the 13 `CategoryId` values |
| `icon` | A key from `ICONS` in `src/components/Icon.tsx` (add it there if missing) |
| `keywords` | Extra search terms that do not appear in the name or description |
| `version` | Semver. Bump it when behaviour changes |
| `status` | `'stable'` or `'beta'` |
| `added` | ISO date (`YYYY-MM-DD`) — drives the "Recently added" timeline |
| `featured` | Optional — shows on the home page |
| `popular` | Optional — shows in the search dialog's default state |
| `layout` | Optional — `'default'` (narrow), `'wide'` or `'full'` for tools that need the space |

Place the entry near the other tools of its category to keep the file readable.

---

## 3. Add the lazy import

In `src/tools/index.tsx`:

```ts
const REGISTRY = {
  // ...
  'my-tool': lazy(() => import('./my-tool/App')),
  // ...
};
```

Keep the map alphabetical within its group. The build verifies that this map and the catalogue contain exactly the same ids.

---

## 4. Verify

```bash
npm run build       # type-checks and builds
npm run preview     # serves dist/ at http://localhost:4173/toolatlas/
```

Open <http://localhost:4173/toolatlas/tools/my-tool>.

Your tool should now be:

- reachable at `/tools/my-tool`,
- listed on `/tools` and in its category page,
- findable through the global search and the ⌘K dialog,
- shown in "Recently added" (it sorts by `added`),
- listed on the home page if you set `featured` or `popular`.

---

## 5. Style guide

Use the shared primitives so the tool matches the rest of the platform.

| You want | Use |
| --- | --- |
| A titled card | `<Panel title="…" description="…">` |
| A labelled input | `<Field label="…" hint="…">` |
| A responsive grid | `<Grid cols={2}>` (1, 2, 3 or 4 columns) |
| A text input | `<Input />` |
| A multi-line input | `<TextArea />` |
| A dropdown | `<Select>` with `<option>` children |
| A primary action | `<Button>` |
| A secondary action | `<Button variant="secondary">` |
| A result value | `<Result label="…" value="…" hint="…" size="lg" />` |
| Mode switches | `<Tabs tabs={[…]} value={…} onChange={…} />` |
| A boolean setting | `<Toggle checked={…} onChange={…} label="…" />` |
| A progress bar | `<ProgressBar value={…} max={…} />` |
| A file picker | `<Dropzone onFiles={…} accept="…" />` |
| A note or warning | `<Note tone="info\|warning\|success">` |
| An empty state | `<EmptyState icon="…" title="…" description="…" />` |
| A copy button | `<CopyButton value={…} />` |

Colour comes from the semantic tokens — `bg-surface`, `border-line`, `text-fg`, `text-muted`, `bg-accent`, `text-accent` — never from raw palette colours, so both themes work automatically.

---

## 6. State

For state that should survive a refresh, use the local-storage hook:

```tsx
import { useLocalStorage } from '../../lib/hooks';

const [items, setItems] = useLocalStorage<Item[]>('toolatlas:tool:my-tool', []);
```

Namespace the key with `toolatlas:tool:` so it never collides with shell state.

For state that should not persist, plain `useState` is enough.

---

## 7. Privacy rules

- Do not add `fetch()` calls that send user data anywhere.
- Use Web APIs (`crypto.subtle`, `Canvas`, `FileReader`, `TextEncoder`) for local work.
- If you truly need a third-party service, make it explicit and optional, and tell the user what is sent.

---

## 8. Checklist before opening a pull request

- [ ] `npm run build` succeeds (types and the registry check pass).
- [ ] `npm run test:e2e` passes.
- [ ] The tool works in both light and dark themes.
- [ ] The tool works on a narrow (320 px) viewport.
- [ ] The description and keywords are accurate.
- [ ] `version` was bumped if you changed existing behaviour.
