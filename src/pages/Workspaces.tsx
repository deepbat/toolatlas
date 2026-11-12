import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, DownloadButton, Dropzone, Field, Input, Note, Select } from '../components/ui';
import { TOOLS, TOOL_MAP } from '../lib/catalog';
import { useLocalStorage } from '../lib/hooks';
import { downloadText } from '../lib/utils';
import { MAX_TOOLS, MAX_WORKSPACES, WS_KEY, cleanName, parseWorkspaces, type Workspace } from '../lib/workspaces';

const SORTED = [...TOOLS].sort((a, b) => a.name.localeCompare(b.name));

export default function WorkspacesPage() {
  const [spaces, setSpaces] = useLocalStorage<Workspace[]>(WS_KEY, []);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<{ tone: 'warning' | 'success'; text: string } | null>(null);
  const fail = (e: unknown) => setMsg({ tone: 'warning', text: e instanceof Error ? e.message : 'Something went wrong.' });

  const create = () => {
    try {
      if (spaces.length >= MAX_WORKSPACES) throw Error(`You can keep up to ${MAX_WORKSPACES} workspaces. Delete one first.`);
      setSpaces([...spaces, { id: crypto.randomUUID(), name: cleanName(name), tools: [] }]);
      setName(''); setMsg(null);
    } catch (e) { fail(e); }
  };
  const update = (id: string, fn: (w: Workspace) => Workspace) => setSpaces(spaces.map((w) => (w.id === id ? fn(w) : w)));
  const add = (id: string, toolId: string) => {
    if (!toolId) return;
    update(id, (w) => (w.tools.includes(toolId) || w.tools.length >= MAX_TOOLS ? w : { ...w, tools: [...w.tools, toolId] }));
  };
  const importFile = async (files: File[]) => {
    try {
      const f = files[0];
      if (!f) return;
      if (f.size > 1_000_000) throw Error('This file is too large to be a workspace export.');
      const incoming = parseWorkspaces(await f.text());
      const room = MAX_WORKSPACES - spaces.length;
      if (room <= 0) throw Error(`You already have ${MAX_WORKSPACES} workspaces.`);
      setSpaces([...spaces, ...incoming.slice(0, room)]);
      setMsg({ tone: 'success', text: `Imported ${Math.min(room, incoming.length)} workspace${incoming.length === 1 ? '' : 's'}.` });
    } catch (e) { fail(e); }
  };

  return (
    <div className="container-page pt-12 pb-16">
      <header className="section-line">
        <div className="flex items-baseline gap-3">
          <span className="label text-accent">Saved locally</span>
          <h1 className="font-display text-2xl font-medium tracking-tight text-fg sm:text-3xl">Workspaces</h1>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-label text-muted"><span className="text-accent">{spaces.length}</span> saved</p>
      </header>
      <p className="max-w-2xl text-sm leading-relaxed text-muted">
        A workspace is a named set of tools you use together, for example “Passport photo” or “Month end”. They are kept in this browser only. Export a file to move them to another device. Nothing syncs and nothing is encrypted.
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <Field label="New workspace" htmlFor="ws-name">
          <Input id="ws-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} placeholder="Name" />
        </Field>
        <Button type="button" onClick={create}>Create</Button>
        <DownloadButton label="Export all" onClick={() => downloadText('toolatlas-workspaces.json', JSON.stringify({ app: 'toolatlas', version: 1, workspaces: spaces }, null, 2), 'application/json')} />
      </div>
      <div className="mt-4 max-w-xl"><Dropzone accept=".json,application/json" multiple={false} onFiles={importFile} title="Import a workspace file" hint="a .json file exported from ToolAtlas" /></div>
      {msg && <div className="mt-4" role={msg.tone === 'warning' ? 'alert' : 'status'} data-testid="ws-message"><Note tone={msg.tone}>{msg.text}</Note></div>}

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {spaces.map((w) => (
          <section key={w.id} className="border border-line bg-surface/50 p-4" aria-label={w.name} data-testid="workspace">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-base font-medium text-fg">{w.name}</h2>
              <button type="button" className="text-sm text-muted underline hover:text-accent" aria-label={`Delete workspace ${w.name}`} onClick={() => { if (confirm(`Delete “${w.name}”? The tools stay in the atlas.`)) setSpaces(spaces.filter((x) => x.id !== w.id)); }}>Delete</button>
            </div>
            <ol className="mt-3 divide-y divide-line border border-line">
              {w.tools.length === 0 && <li className="px-3 py-3 text-sm text-muted">No tools yet. Add one below.</li>}
              {w.tools.map((id, i) => TOOL_MAP[id] && (
                <li key={id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <Link className="text-fg hover:text-accent" to={`/tools/${id}`}>{TOOL_MAP[id].name}</Link>
                  <span className="flex shrink-0 gap-2">
                    <button type="button" className="underline text-muted disabled:opacity-40" disabled={i === 0} aria-label={`Move ${TOOL_MAP[id].name} up`} onClick={() => update(w.id, (x) => { const t = [...x.tools]; [t[i - 1], t[i]] = [t[i], t[i - 1]]; return { ...x, tools: t }; })}>Up</button>
                    <button type="button" className="underline text-muted" aria-label={`Remove ${TOOL_MAP[id].name} from ${w.name}`} onClick={() => update(w.id, (x) => ({ ...x, tools: x.tools.filter((t) => t !== id) }))}>Remove</button>
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-3">
              <Field label="Add a tool" htmlFor={`add-${w.id}`}>
                <Select id={`add-${w.id}`} value="" onChange={(e) => add(w.id, e.target.value)}>
                  <option value="">Choose a tool</option>
                  {SORTED.filter((t) => !w.tools.includes(t.id)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </Field>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
