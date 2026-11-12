import { useCallback, useEffect, useState } from 'react';
import { Button, Note, Panel } from '../components/ui';
import { Busy } from '../tools/studio/kit';
import { countCached, downloadMissing, loadManifest } from '../lib/offline';

interface InstallEvent extends Event { prompt: () => Promise<void> }

export default function OfflinePage() {
  const [online, setOnline] = useState(navigator.onLine);
  const [state, setState] = useState<{ total: number; missing: string[]; bytes: number } | null>(null);
  const [controlled, setControlled] = useState(Boolean(navigator.serviceWorker?.controller));
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const supported = 'serviceWorker' in navigator && 'caches' in window;

  const refresh = useCallback(async () => {
    try {
      setError('');
      const m = await loadManifest();
      setState({ total: m.files.length, missing: await countCached(m.files), bytes: m.bytes });
      setControlled(Boolean(navigator.serviceWorker?.controller));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not check the offline files.'); }
  }, []);

  useEffect(() => {
    void refresh();
    const on = () => setOnline(true), off = () => setOnline(false);
    const prompt = (e: Event) => { e.preventDefault(); setInstall(e as InstallEvent); };
    window.addEventListener('online', on); window.addEventListener('offline', off); window.addEventListener('beforeinstallprompt', prompt);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); window.removeEventListener('beforeinstallprompt', prompt); };
  }, [refresh]);

  const download = async () => {
    if (!state) return;
    try {
      setError(''); setNote('');
      setProgress({ done: 0, total: state.missing.length });
      const failed = await downloadMissing(state.missing, (done, total) => setProgress({ done, total }));
      await refresh();
      if (failed.length) setError(`${failed.length} file${failed.length === 1 ? '' : 's'} could not be downloaded. Check your connection and press the button again. Files that already arrived are kept.`);
      else setNote('All files are saved. ToolAtlas will open without internet.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Download failed.'); } finally { setProgress(null); }
  };
  const checkUpdate = async () => {
    try {
      setError(''); setNote('');
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) throw Error('The offline helper is not installed yet. Reload the page once while online.');
      await reg.update();
      setNote(reg.installing || reg.waiting ? 'A new version is being installed. A banner will ask you to reload when it is ready.' : 'You already have the latest version.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not check for updates.'); }
  };

  const mb = state ? (state.bytes / 1048576).toFixed(1) : '';
  const saved = state ? state.total - state.missing.length : 0;
  return (
    <div className="container-page pt-12 pb-16">
      <header className="section-line">
        <div className="flex items-baseline gap-3">
          <span className="label text-accent">Works without internet</span>
          <h1 className="font-display text-2xl font-medium tracking-tight text-fg sm:text-3xl">Offline and install</h1>
        </div>
      </header>
      <p className="max-w-2xl text-sm leading-relaxed text-muted">
        After the first visit, ToolAtlas saves a copy of every tool in your browser, so it opens with no signal. Your files and inputs are never uploaded either way.
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Status">
          {!supported ? <Note tone="warning">This browser does not support offline storage. Use a current Chrome, Edge, Firefox or Safari.</Note> : (
            <dl className="divide-y divide-line border border-line text-sm" data-testid="offline-status">
              <div className="flex justify-between gap-4 px-4 py-2.5"><dt className="text-muted">Connection</dt><dd>{online ? 'Online' : 'Offline'}</dd></div>
              <div className="flex justify-between gap-4 px-4 py-2.5"><dt className="text-muted">Offline helper</dt><dd>{controlled ? 'Active' : 'Not active yet (reload once)'}</dd></div>
              <div className="flex justify-between gap-4 px-4 py-2.5"><dt className="text-muted">Saved files</dt><dd data-testid="offline-count">{state ? `${saved} of ${state.total} (${mb} MB in total)` : 'Checking'}</dd></div>
            </dl>
          )}
          {progress && <div className="mt-4"><Busy label="Saving files for offline use" value={progress.done} max={progress.total} /></div>}
          {error && <div className="mt-4" role="alert" data-testid="offline-error"><Note tone="warning">{error}</Note></div>}
          {note && <div className="mt-4" role="status"><Note tone="success">{note}</Note></div>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={download} disabled={!supported || !state || state.missing.length === 0 || !!progress || !online}>
              {state && state.missing.length > 0 ? `Save ${state.missing.length} missing files` : 'Everything is saved'}
            </Button>
            <Button type="button" variant="secondary" onClick={checkUpdate} disabled={!supported || !online}>Check for a new version</Button>
            <Button type="button" variant="secondary" onClick={refresh} disabled={!supported}>Recheck</Button>
            {install && <Button type="button" onClick={() => void install.prompt()}>Install the app</Button>}
          </div>
          <p className="mt-3 text-xs text-muted">All tools are saved together. Saving only some tools is not offered yet, because each tool loads its own code and a partial copy would break.</p>
        </Panel>

        <Panel title="Install on your device">
          <ul className="space-y-3 text-sm text-muted">
            <li><span className="text-fg">Android, Chrome:</span> open the menu (three dots), then “Install app” or “Add to Home screen”.</li>
            <li><span className="text-fg">iPhone and iPad, Safari:</span> tap Share, then “Add to Home Screen”. Other iOS browsers cannot install it.</li>
            <li><span className="text-fg">Windows, Mac, Linux, Chrome or Edge:</span> use the install icon at the right end of the address bar, or the browser menu.</li>
            <li><span className="text-fg">Firefox on desktop:</span> does not install web apps. Offline use still works from a normal tab.</li>
          </ul>
          <p className="mt-3 text-xs text-muted">If you clear site data, the saved copy is removed. Open ToolAtlas online once to save it again.</p>
        </Panel>
      </div>
    </div>
  );
}
