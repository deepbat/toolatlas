import { useState } from 'react';
import { Button, Panel } from '../../components/ui';
import { useLocalStorage } from '../../lib/hooks';
import { relativeTime } from '../../lib/utils';

interface Note {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
}

function makeNote(): Note {
  return { id: crypto.randomUUID(), title: 'Untitled note', body: '', updatedAt: Date.now() };
}

export default function QuickNotes() {
  const [notes, setNotes] = useLocalStorage<Note[]>('toolatlas:tool:notes', [makeNote()]);
  const [activeId, setActiveId] = useState<string | null>(notes[0]?.id ?? null);
  const [query, setQuery] = useState('');

  const active = notes.find((note) => note.id === activeId) ?? notes[0] ?? null;

  const update = (id: string, patch: Partial<Note>) => {
    setNotes((current) =>
      current.map((note) => (note.id === id ? { ...note, ...patch, updatedAt: Date.now() } : note))
    );
  };

  const add = () => {
    const note = makeNote();
    setNotes((current) => [note, ...current]);
    setActiveId(note.id);
  };

  const remove = (id: string) => {
    setNotes((current) => current.filter((note) => note.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const filtered = notes.filter((note) =>
    `${note.title} ${note.body}`.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <Panel className="p-0" title={undefined}>
      <div className="grid min-h-[26rem] sm:grid-cols-[15rem_1fr]">
        <div className="border-b border-line p-3 sm:border-b-0 sm:border-r">
          <Button type="button" onClick={add} className="w-full" size="sm">
            + New note
          </Button>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search notes…"
            className="mt-2 h-9 w-full rounded-lg border border-line bg-raised/60 px-2.5 text-xs text-fg outline-none placeholder:text-muted/70 focus:border-accent/60"
            aria-label="Search notes"
          />
          <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto sm:max-h-[22rem]">
            {filtered.map((note) => (
              <li key={note.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(note.id)}
                  className={[
                    'w-full rounded-lg px-2.5 py-2 text-left transition',
                    active?.id === note.id ? 'bg-accent/10' : 'hover:bg-raised',
                  ].join(' ')}
                >
                  <span className="block truncate text-xs font-semibold text-fg">{note.title || 'Untitled'}</span>
                  <span className="block truncate text-[10px] text-muted">
                    {note.body.trim() ? note.body.slice(0, 36) : 'Empty note'} · {relativeTime(note.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="px-2 py-3 text-xs text-muted">No matches.</li>}
          </ul>
        </div>

        <div className="flex flex-col p-4">
          {active ? (
            <>
              <div className="flex items-center gap-2">
                <input
                  value={active.title}
                  onChange={(event) => update(active.id, { title: event.target.value })}
                  className="min-w-0 flex-1 border-none bg-transparent text-lg font-semibold tracking-tight text-fg outline-none"
                  aria-label="Note title"
                />
                <button
                  type="button"
                  onClick={() => remove(active.id)}
                  className="rounded-lg border border-line px-2 py-1 text-[11px] font-medium text-muted transition hover:border-rose-400/40 hover:text-rose-500"
                >
                  Delete
                </button>
              </div>
              <textarea
                value={active.body}
                onChange={(event) => update(active.id, { body: event.target.value })}
                placeholder="Start writing… everything saves automatically."
                className="mt-3 min-h-[18rem] flex-1 resize-none border-none bg-transparent text-sm leading-relaxed text-fg outline-none placeholder:text-muted/60"
                aria-label="Note body"
              />
              <p className="mt-2 text-[11px] text-muted">
                Saved locally · {relativeTime(active.updatedAt)}
              </p>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted">
              Select a note, or create a new one.
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
