import { useMemo, useState } from 'react';
import { Button, CopyButton, Panel, Result, Select, TextArea } from '../../components/ui';
import { downloadText, formatBytes } from '../../lib/utils';

const SAMPLE = '{"name":"ToolAtlas","tools":35,"private":false,"tags":["calculators","text","pdf"]}';

function countKeys(value: unknown): number {
  if (Array.isArray(value)) return value.reduce<number>((total, item) => total + countKeys(item), 0);
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce(
      (total, [, item]) => total + 1 + countKeys(item),
      0
    );
  }
  return 0;
}

function depthOf(value: unknown): number {
  if (Array.isArray(value)) return 1 + Math.max(0, ...value.map(depthOf));
  if (value && typeof value === 'object') {
    return 1 + Math.max(0, ...Object.values(value as Record<string, unknown>).map(depthOf));
  }
  return 0;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, sortValue(item)])
    );
  }
  return value;
}

export default function JsonFormatter() {
  const [input, setInput] = useState(SAMPLE);
  const [output, setOutput] = useState('');
  const [indent, setIndent] = useState('2');
  const [error, setError] = useState<{ message: string; line?: number; column?: number } | null>(null);

  const parsed = useMemo(() => {
    if (!input.trim()) return { value: undefined, error: null };
    try {
      return { value: JSON.parse(input) as unknown, error: null };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Invalid JSON';
      const position = /position (\d+)/.exec(message);
      if (position) {
        const index = Number(position[1]);
        const before = input.slice(0, index);
        const line = before.split('\n').length;
        const column = index - before.lastIndexOf('\n');
        return { value: undefined, error: { message, line, column } };
      }
      return { value: undefined, error: { message } };
    }
  }, [input]);

  const run = (kind: 'format' | 'minify' | 'sort') => {
    if (parsed.error) {
      setError(parsed.error);
      setOutput('');
      return;
    }
    setError(null);
    const value = kind === 'sort' ? sortValue(parsed.value) : parsed.value;
    setOutput(
      kind === 'minify' ? JSON.stringify(value) : JSON.stringify(value, null, Number(indent) || 2)
    );
  };

  return (
    <div className="space-y-4">
      <Panel
        title="JSON input"
        actions={
          <Select value={indent} onChange={(event) => setIndent(event.target.value)} className="h-9 w-32">
            <option value="2">2 spaces</option>
            <option value="4">4 spaces</option>
            <option value="8">8 spaces</option>
          </Select>
        }
      >
        <TextArea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder='Paste JSON, for example {"hello":"world"}'
          className="min-h-44"
          aria-label="JSON input"
          spellCheck={false}
        />

        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" onClick={() => run('format')}>
            Format
          </Button>
          <Button type="button" variant="secondary" onClick={() => run('minify')}>
            Minify
          </Button>
          <Button type="button" variant="secondary" onClick={() => run('sort')}>
            Sort keys
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setInput('');
              setOutput('');
              setError(null);
            }}
          >
            Clear
          </Button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Result
            label="Status"
            value={parsed.error ? 'Invalid' : input.trim() ? 'Valid JSON' : 'Empty'}
            hint={error?.line ? `Line ${error.line}, column ${error.column}` : undefined}
          />
          <Result label="Keys" value={parsed.error || parsed.value === undefined ? '—' : String(countKeys(parsed.value))} />
          <Result
            label="Depth"
            value={parsed.error || parsed.value === undefined ? '—' : String(depthOf(parsed.value))}
          />
        </div>

        {error && (
          <p className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 font-mono text-xs text-rose-600 dark:text-rose-400">
            {error.message}
            {error.line ? ` (line ${error.line}, column ${error.column})` : ''}
          </p>
        )}
      </Panel>

      <Panel
        title="Result"
        description={output ? formatBytes(new Blob([output]).size) : 'Format or minify to produce output.'}
        actions={
          output ? (
            <>
              <CopyButton value={output} size="sm" />
              <Button type="button" variant="secondary" size="sm" onClick={() => downloadText('toolatlas.json', output, 'application/json')}>
                Download
              </Button>
            </>
          ) : undefined
        }
      >
        <TextArea value={output} readOnly placeholder="The formatted JSON appears here." className="min-h-44 bg-raised/40" aria-label="Formatted JSON" />
      </Panel>
    </div>
  );
}
