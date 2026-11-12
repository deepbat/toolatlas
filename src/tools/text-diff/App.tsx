import { useMemo, useState } from 'react';
import { Panel, TextArea } from '../../components/ui';
import { formatNumber } from '../../lib/utils';

type Op = 'same' | 'add' | 'remove';

interface Line {
  type: Op;
  text: string;
}

function diffLines(a: string[], b: string[]): Line[] {
  const rows = a.length;
  const cols = b.length;

  if (rows * cols > 1_500_000) {
    return [
      ...a.map((text) => ({ type: 'remove' as Op, text })),
      ...b.map((text) => ({ type: 'add' as Op, text })),
    ];
  }

  const table: Uint32Array[] = Array.from({ length: rows + 1 }, () => new Uint32Array(cols + 1));
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      table[i][j] =
        a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const result: Line[] = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (a[i] === b[j]) {
      result.push({ type: 'same', text: a[i] });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      result.push({ type: 'remove', text: a[i] });
      i += 1;
    } else {
      result.push({ type: 'add', text: b[j] });
      j += 1;
    }
  }
  while (i < rows) {
    result.push({ type: 'remove', text: a[i] });
    i += 1;
  }
  while (j < cols) {
    result.push({ type: 'add', text: b[j] });
    j += 1;
  }
  return result;
}

export default function TextDiff() {
  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');

  const diff = useMemo(() => diffLines(left.split('\n'), right.split('\n')), [left, right]);
  const added = diff.filter((line) => line.type === 'add').length;
  const removed = diff.filter((line) => line.type === 'remove').length;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Original" description="The text before your changes.">
          <TextArea
            value={left}
            onChange={(event) => setLeft(event.target.value)}
            placeholder="Paste the original text…"
            className="min-h-48"
            aria-label="Original text"
          />
        </Panel>
        <Panel title="Changed" description="The text after your changes.">
          <TextArea
            value={right}
            onChange={(event) => setRight(event.target.value)}
            placeholder="Paste the revised text…"
            className="min-h-48"
            aria-label="Changed text"
          />
        </Panel>
      </div>

      <Panel
        title="Comparison"
        description={`${formatNumber(added, 0)} added · ${formatNumber(removed, 0)} removed · ${formatNumber(diff.length - added - removed, 0)} unchanged`}
      >
        {diff.length === 0 ? (
          <p className="text-sm text-muted">Add text to both boxes to see a line-by-line comparison.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line">
            <div className="max-h-96 overflow-auto font-mono text-[12px] leading-relaxed">
              {diff.map((line, index) => (
                <div
                  key={`${index}-${line.type}`}
                  className={[
                    'flex gap-3 px-3 py-1',
                    line.type === 'add'
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : line.type === 'remove'
                        ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
                        : 'text-muted',
                  ].join(' ')}
                >
                  <span className="w-4 shrink-0 select-none opacity-70">
                    {line.type === 'add' ? '+' : line.type === 'remove' ? '−' : ' '}
                  </span>
                  <span className="whitespace-pre-wrap break-words">{line.text || '\u00a0'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
