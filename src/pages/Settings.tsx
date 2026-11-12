import { useEffect, useRef, useState } from 'react';
import { Panel } from '../components/ui';

const PREFIX = 'toolatlas:';
const MAX_BYTES = 5 * 1024 * 1024;
type Entry = { key: string; value: string };
type Backup = { app: 'ToolAtlas'; formatVersion: 1; createdAt: string; entries: Entry[] };

function entries(): Entry[] {
  const result: Entry[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith(PREFIX)) {
      const value = localStorage.getItem(key);
      if (value !== null) result.push({ key, value });
    }
  }
  return result.sort((a, b) => a.key.localeCompare(b.key));
}
const sizeOf = (s: string) => new TextEncoder().encode(s).length;

export default function SettingsPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [count, setCount] = useState(0);
  const [size, setSize] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const refresh = () => {
    try {
      const data = entries();
      setCount(data.length);
      setSize(data.reduce((sum, item) => sum + sizeOf(item.key) + sizeOf(item.value), 0));
    } catch {
      setError('Browser storage is unavailable in this session.');
    }
  };
  useEffect(() => { refresh(); }, []);

  const exportBackup = () => {
    setError('');
    try {
      const backup: Backup = { app: 'ToolAtlas', formatVersion: 1, createdAt: new Date().toISOString(), entries: entries() };
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `toolatlas-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setStatus(`Backup exported with ${backup.entries.length} records.`);
    } catch {
      setError('Could not create backup. Check browser storage permissions and try again.');
    }
  };

  const exportDiagnostics = async () => {
    setError('');
    try {
      const data = entries();
      const cacheNames = 'caches' in window ? await caches.keys() : [];
      const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
      const report = {
        app: 'ToolAtlas',
        createdAt: new Date().toISOString(),
        browser: { userAgent: navigator.userAgent, language: navigator.language, online: navigator.onLine },
        screen: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
        storage: { recordCount: data.length, approximateBytes: data.reduce((sum, item) => sum + sizeOf(item.key) + sizeOf(item.value), 0) },
        offline: { serviceWorkerSupported: 'serviceWorker' in navigator, controlled: Boolean(navigator.serviceWorker?.controller), registered: Boolean(registration), cacheNames },
      };
      const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `toolatlas-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setStatus('Diagnostic report exported. It contains technical details only, not saved note or task contents.');
    } catch {
      setError('Could not create diagnostic report in this browser.');
    }
  };

  const clearData = () => {
    setError('');
    setStatus('');
    if (!window.confirm('Clear all ToolAtlas data saved in this browser? This removes favourites, recent history, theme preferences, notes and tasks. Export a backup first if you may need them.')) return;
    try {
      entries().forEach((item) => localStorage.removeItem(item.key));
      setStatus('All ToolAtlas browser data has been cleared. Reload the page to refresh open tools.');
      refresh();
    } catch {
      setError('Could not clear all ToolAtlas data. Check browser storage permissions and try again.');
      refresh();
    }
  };

  const importBackup = async (file: File) => {
    setError('');
    setStatus('');
    if (file.size > MAX_BYTES) { setError('Backup is larger than 5 MB.'); return; }
    let raw: unknown;
    try { raw = JSON.parse(await file.text()); } catch { setError('This file is not valid JSON.'); return; }
    if (!raw || typeof raw !== 'object') { setError('Backup format is not recognised.'); return; }
    const backup = raw as Partial<Backup>;
    if (backup.app !== 'ToolAtlas' || backup.formatVersion !== 1 || !Array.isArray(backup.entries) || backup.entries.length > 500) {
      setError('Backup format or version is not supported.'); return;
    }
    const seen = new Set<string>();
    let total = 0;
    for (const item of backup.entries) {
      if (!item || typeof item.key !== 'string' || !item.key.startsWith(PREFIX) || typeof item.value !== 'string' || seen.has(item.key)) {
        setError('Backup contains an invalid or duplicate record. Nothing was changed.'); return;
      }
      seen.add(item.key);
      total += sizeOf(item.key) + sizeOf(item.value);
      if (total > MAX_BYTES) { setError('Backup data exceeds 5 MB. Nothing was changed.'); return; }
    }
    if (!window.confirm(`Restore ${backup.entries.length} records? Existing ToolAtlas data in this browser will be replaced. Export a backup first if you want to keep it.`)) return;
    let previous: Entry[] = [];
    try {
      previous = entries();
      previous.forEach(item => localStorage.removeItem(item.key));
      backup.entries.forEach(item => localStorage.setItem(item.key, item.value));
      setStatus(`Restored ${backup.entries.length} records. Reload ToolAtlas to refresh open tools.`);
      refresh();
    } catch {
      try {
        entries().forEach(item => localStorage.removeItem(item.key));
        previous.forEach(item => localStorage.setItem(item.key, item.value));
      } catch {
        setError('Restore failed and browser storage could not be fully rolled back. Check available storage space.');
        refresh(); return;
      }
      setError('Restore failed. Previous ToolAtlas data has been restored.');
      refresh();
    }
  };

  return <div className="container-page max-w-4xl space-y-6 pt-12">
    <div><p className="label text-accent">Your browser · Your data</p><h1 className="mt-3 font-display text-3xl font-medium tracking-tight text-fg">Data & Settings</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">ToolAtlas saves favourites, recent tools, theme preferences, notes and tasks in this browser. Export a backup before clearing browser data or moving to another device.</p></div>
    <Panel title="Local data overview">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="border border-line bg-raised/40 p-4"><p className="font-display text-2xl text-fg">{count}</p><p className="mt-1 text-xs text-muted">ToolAtlas storage records</p></div>
        <div className="border border-line bg-raised/40 p-4"><p className="font-display text-2xl text-fg">{size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`}</p><p className="mt-1 text-xs text-muted">Approximate storage used</p></div>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted">Storage is local to this browser profile. It is not synced, and other people using this browser profile may be able to access saved notes and tasks.</p>
    </Panel>
    <Panel title="Export backup"><p className="text-sm text-muted">Download favourites, recent history, theme settings, notes and tasks as a JSON file. Keep this file somewhere safe.</p>
      <button type="button" onClick={exportBackup} className="mt-4 inline-flex min-h-10 items-center border border-accent bg-accent px-4 py-2 font-mono text-xs font-semibold uppercase tracking-label text-on-accent transition hover:brightness-110">Export backup</button>
    </Panel>
    <Panel title="Restore backup"><p className="text-sm text-muted">Import a ToolAtlas JSON backup created by this page. Existing ToolAtlas browser data will be replaced after confirmation. Other websites' storage is not affected.</p>
      <input ref={fileRef} type="file" accept=".json,application/json" className="sr-only" aria-label="Choose ToolAtlas backup file" onChange={event => { const file = event.target.files?.[0]; if (file) void importBackup(file); event.target.value = ''; }} />
      <button type="button" onClick={() => fileRef.current?.click()} className="mt-4 inline-flex min-h-10 items-center border border-line px-4 py-2 font-mono text-xs font-semibold uppercase tracking-label text-fg transition hover:border-accent hover:text-accent">Choose backup file</button>
    </Panel>
    <Panel title="Diagnostic report"><p className="text-sm text-muted">Export a local technical report to help troubleshoot browser, storage and offline issues. It does not include note contents, task contents or other saved values.</p>
      <button type="button" onClick={() => void exportDiagnostics()} className="mt-4 inline-flex min-h-10 items-center border border-line px-4 py-2 font-mono text-xs font-semibold uppercase tracking-label text-fg transition hover:border-accent hover:text-accent">Export diagnostics</button>
    </Panel>
    <Panel title="Clear local data"><p className="text-sm text-muted">Remove all ToolAtlas records from this browser only. This includes favourites, recent history, theme preferences, notes and tasks. Export a backup first if you may need them.</p>
      <button type="button" onClick={clearData} className="mt-4 inline-flex min-h-10 items-center border border-rose-500/50 px-4 py-2 font-mono text-xs font-semibold uppercase tracking-label text-rose-700 transition hover:bg-rose-500/10 dark:text-rose-300">Clear all ToolAtlas data</button>
    </Panel>
    {status && <p role="status" className="border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-300">{status}</p>}
    {error && <p role="alert" className="border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
    <p className="text-xs text-muted">Backups can contain private notes and tasks. Do not share backup files unless you intend to share their contents.</p>
  </div>;
}
