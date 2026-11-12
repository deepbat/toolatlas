export interface OfflineInfo { supported: boolean; controlled: boolean; cacheName: string; files: string[]; bytes: number }

export async function loadManifest(): Promise<{ files: string[]; bytes: number }> {
  const res = await fetch(`${import.meta.env.BASE_URL}offline-files.json`, { cache: 'no-store' });
  if (!res.ok) throw Error('The list of offline files could not be loaded. Check your connection and try again.');
  const data = await res.json();
  if (!Array.isArray(data.files)) throw Error('The offline file list is not in the expected format.');
  return { files: data.files.filter((f: unknown): f is string => typeof f === 'string' && f.startsWith('/')), bytes: Number(data.bytes) || 0 };
}

export async function latestCache(): Promise<Cache | null> {
  if (!('caches' in window)) return null;
  const names = (await caches.keys()).filter((k) => k.startsWith('toolatlas-')).sort();
  return names.length ? caches.open(names[names.length - 1]) : null;
}

export async function countCached(files: string[]): Promise<string[]> {
  if (!('caches' in window)) return [];
  const missing: string[] = [];
  for (const f of files) if (!(await caches.match(f, { ignoreVary: true }))) missing.push(f);
  return missing;
}

/** Fetch files that are not cached yet, a few at a time, reporting progress. Returns the files that still failed. */
export async function downloadMissing(missing: string[], onProgress: (done: number, total: number) => void): Promise<string[]> {
  const cache = await latestCache();
  if (!cache) throw Error('This browser has no offline storage available, or the app has not finished installing yet. Reload the page and try again.');
  const failed: string[] = [];
  let done = 0;
  const queue = [...missing];
  const worker = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      try {
        const res = await fetch(f, { cache: 'reload' });
        if (!res.ok) throw Error(String(res.status));
        await cache.put(f, res);
      } catch { failed.push(f); }
      onProgress(++done, missing.length);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return failed;
}
