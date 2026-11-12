# Contributing to ToolAtlas

Thanks for wanting to help. ToolAtlas is built by people who like small, fast, private tools.

## Ways to contribute

- **Add a tool.** The best contribution. See [`docs/ADDING_A_TOOL.md`](docs/ADDING_A_TOOL.md).
- **Improve an existing tool.** Bug fixes, better explanations, more units, better empty states.
- **Improve the shell.** Search ranking, keyboard shortcuts, responsive behaviour, accessibility.
- **Report a problem.** Open an issue with the tool name, what you expected and what happened.

## Ground rules

1. **Everything stays local.** Do not add code that sends user data to a server.
2. **No placeholders.** A tool must work. If it is not finished, do not merge it — the platform's value is that every entry is usable.
3. **Use the shared primitives.** `src/components/ui.tsx` exists so every tool looks and feels the same.
4. **Use semantic colour tokens** (`bg-surface`, `text-muted`, `border-line`, `text-accent`), never raw palette colours.
5. **No new runtime dependencies without discussion.** The current bundle is deliberately small; `pdf-lib` and `qrcode` are the only non-React runtime libraries, and both are loaded lazily.

## Development

```bash
npm install
npm run dev
```

## Before you open a pull request

```bash
npm run build       # type-checks and builds — this also verifies the tool registry
npm run preview     # serve the production build
npm run test:e2e    # headless functional suite (run in a second terminal)
```

The e2e suite drives a real browser: it checks that every tool computes the right answer, that state persists, that routing works, that the 404 page appears, and that every catalogued tool renders.

## Style

- TypeScript with `strict` mode on.
- Functional React with hooks; no class components.
- Comments explain **why**, not **what**.
- Match the existing formatting (2-space indent, single quotes, semicolons).

## Licence

By contributing you agree that your work is licensed under the [MIT Licence](../LICENSE).
