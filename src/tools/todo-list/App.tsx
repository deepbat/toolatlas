import { useMemo, useState } from 'react';
import { Button, Panel, ProgressBar, Tabs } from '../../components/ui';
import { useLocalStorage } from '../../lib/hooks';
import { relativeTime } from '../../lib/utils';

type Priority = 'low' | 'normal' | 'high';

interface Task {
  id: string;
  text: string;
  done: boolean;
  priority: Priority;
  createdAt: number;
}

const PRIORITY_STYLES: Record<Priority, string> = {
  low: 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400',
  normal: 'border-line bg-raised text-muted',
  high: 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400',
};

export default function TaskList() {
  const [tasks, setTasks] = useLocalStorage<Task[]>('toolatlas:tool:todo', []);
  const [text, setText] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('all');

  const add = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setTasks((current) => [
      { id: crypto.randomUUID(), text: trimmed, done: false, priority, createdAt: Date.now() },
      ...current,
    ]);
    setText('');
  };

  const visible = useMemo(() => {
    if (filter === 'active') return tasks.filter((task) => !task.done);
    if (filter === 'done') return tasks.filter((task) => task.done);
    return tasks;
  }, [filter, tasks]);

  const doneCount = tasks.filter((task) => task.done).length;
  const percent = tasks.length > 0 ? (doneCount / tasks.length) * 100 : 0;

  return (
    <div className="space-y-4">
      <Panel title="Add a task">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="What needs doing?"
            className="h-11 flex-1 rounded-xl border border-line bg-raised/60 px-3.5 text-sm text-fg outline-none transition placeholder:text-muted/70 focus:border-accent/70 focus:bg-surface focus:ring-4 focus:ring-accent/10"
            aria-label="New task"
            maxLength={180}
          />
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value as Priority)}
            className="h-11 rounded-xl border border-line bg-raised/60 px-3 text-sm text-fg outline-none"
            aria-label="Priority"
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
          <Button type="submit" className="h-11">
            Add task
          </Button>
        </form>

        <div className="mt-5">
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
            <span>
              {doneCount} of {tasks.length} complete
            </span>
            <span>{Math.round(percent)}%</span>
          </div>
          <ProgressBar value={percent} />
        </div>
      </Panel>

      <Panel
        title="Your list"
        actions={
          <Tabs
            value={filter}
            onChange={setFilter}
            tabs={[
              { id: 'all', label: `All ${tasks.length}` },
              { id: 'active', label: `Active ${tasks.length - doneCount}` },
              { id: 'done', label: `Done ${doneCount}` },
            ]}
          />
        }
      >
        {visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            {tasks.length === 0 ? 'No tasks yet — add your first one above.' : 'Nothing in this view.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {visible.map((task) => (
              <li
                key={task.id}
                className="group flex items-start gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 transition hover:border-accent/30"
              >
                <button
                  type="button"
                  onClick={() =>
                    setTasks((current) =>
                      current.map((item) => (item.id === task.id ? { ...item, done: !item.done } : item))
                    )
                  }
                  className={[
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition',
                    task.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-line hover:border-accent',
                  ].join(' ')}
                  aria-label={task.done ? 'Mark as active' : 'Mark as done'}
                  aria-pressed={task.done}
                >
                  {task.done && (
                    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none">
                      <path d="m5 10 3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  <p className={['text-sm', task.done ? 'text-muted line-through' : 'text-fg'].join(' ')}>{task.text}</p>
                  <p className="mt-0.5 text-[11px] text-muted">Added {relativeTime(task.createdAt)}</p>
                </div>

                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${PRIORITY_STYLES[task.priority]}`}>
                  {task.priority}
                </span>

                <button
                  type="button"
                  onClick={() => setTasks((current) => current.filter((item) => item.id !== task.id))}
                  className="shrink-0 rounded-md p-1 text-muted opacity-0 transition hover:bg-raised hover:text-rose-500 group-hover:opacity-100"
                  aria-label={`Delete ${task.text}`}
                >
                  <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none">
                    <path d="M4 6h12M8 6V4h4v2m-6 0 .7 10h6.6L14 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}

        {doneCount > 0 && (
          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setTasks((current) => current.filter((task) => !task.done))}
            >
              Clear completed
            </Button>
          </div>
        )}
      </Panel>
    </div>
  );
}
