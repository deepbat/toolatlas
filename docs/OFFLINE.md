# Offline use

ToolAtlas registers a service worker in production builds. On the first visit it saves every page and script listed at build time (about 224 files). After that the site opens without internet.

## How it works

- `scripts/static.ts` walks `dist/`, writes `sw.js` with the file list and writes `offline-files.json` (the same list plus total bytes).
- Page navigations go to the network first and fall back to the saved copy, so a deployed update is never hidden by an old page.
- Scripts, styles and images come from the saved copy first. Their names are hashed, so a new build has new names.
- Each build uses a new cache name. Old caches are deleted when the new worker activates.
- If saving fails during install, the browser retries on the next visit.

## The /offline page

- Shows connection state, whether the helper is active and how many files are saved.
- "Save missing files" fetches only what is absent, four at a time, with a progress bar. Files that arrive are kept if others fail, and the button can be pressed again.
- "Check for a new version" asks the browser to look for a new worker. A banner offers a reload once it takes over.
- Install steps for Android, iOS, desktop Chrome and Edge, and Firefox.

## Limits

- Saving only some tools is not offered. Each tool loads its own code and the mapping is not stable across builds.
- Clearing site data removes the saved copy.
- Tools that call out to the internet by design, such as opening a link, do nothing without a connection.

## Tests

`npm run test:studio` covers the /offline page: counting saved files, deleting one and repairing it, the banner when the connection drops, and reloading while offline. `npm run test:expanded` checks that every tool opens offline.
