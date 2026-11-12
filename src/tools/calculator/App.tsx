import { useEffect, useState } from 'react';
import { Panel } from '../../components/ui';

type Op = '+' | '−' | '×' | '÷';

function apply(a: number, b: number, op: Op): number {
  switch (op) {
    case '+':
      return a + b;
    case '−':
      return a - b;
    case '×':
      return a * b;
    case '÷':
      return b === 0 ? Number.NaN : a / b;
  }
}

function format(value: number): string {
  if (!Number.isFinite(value)) return 'Error';
  return Number(value.toPrecision(12)).toString();
}

const KEYS: Array<{ label: string; kind: 'digit' | 'op' | 'action'; value: string }> = [
  { label: 'C', kind: 'action', value: 'clear' },
  { label: '⌫', kind: 'action', value: 'back' },
  { label: '%', kind: 'action', value: 'percent' },
  { label: '÷', kind: 'op', value: '÷' },
  { label: '7', kind: 'digit', value: '7' },
  { label: '8', kind: 'digit', value: '8' },
  { label: '9', kind: 'digit', value: '9' },
  { label: '×', kind: 'op', value: '×' },
  { label: '4', kind: 'digit', value: '4' },
  { label: '5', kind: 'digit', value: '5' },
  { label: '6', kind: 'digit', value: '6' },
  { label: '−', kind: 'op', value: '−' },
  { label: '1', kind: 'digit', value: '1' },
  { label: '2', kind: 'digit', value: '2' },
  { label: '3', kind: 'digit', value: '3' },
  { label: '+', kind: 'op', value: '+' },
  { label: '±', kind: 'action', value: 'sign' },
  { label: '0', kind: 'digit', value: '0' },
  { label: '.', kind: 'digit', value: '.' },
  { label: '=', kind: 'op', value: 'equals' },
];

export default function Calculator() {
  const [display, setDisplay] = useState('0');
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<Op | null>(null);
  const [fresh, setFresh] = useState(true);
  const [history, setHistory] = useState<string[]>([]);

  const digit = (value: string) => {
    if (value === '.') {
      if (fresh) {
        setDisplay('0.');
        setFresh(false);
      } else if (!display.includes('.')) {
        setDisplay(`${display}.`);
      }
      return;
    }
    if (fresh) {
      setDisplay(value);
      setFresh(false);
      return;
    }
    if (display === '0') {
      setDisplay(value);
      return;
    }
    if (display.replace(/[-.]/g, '').length >= 12) return;
    setDisplay(display + value);
  };

  const clear = () => {
    setDisplay('0');
    setAcc(null);
    setOp(null);
    setFresh(true);
  };

  const back = () => {
    if (fresh) return;
    if (display.length <= 1 || (display.length === 2 && display.startsWith('-'))) {
      setDisplay('0');
      setFresh(true);
    } else {
      setDisplay(display.slice(0, -1));
    }
  };

  const sign = () => {
    if (display === '0') return;
    setDisplay(display.startsWith('-') ? display.slice(1) : `-${display}`);
  };

  const percent = () => {
    setDisplay(format(Number(display) / 100));
    setFresh(false);
  };

  const chooseOp = (next: Op | 'equals') => {
    if (next === 'equals') {
      if (op === null || acc === null) return;
      const value = apply(acc, Number(display), op);
      const line = `${format(acc)} ${op} ${format(Number(display))} = ${format(value)}`;
      setHistory((items) => [line, ...items].slice(0, 6));
      setDisplay(format(value));
      setAcc(null);
      setOp(null);
      setFresh(true);
      return;
    }

    if (op !== null && acc !== null && !fresh) {
      const value = apply(acc, Number(display), op);
      setAcc(value);
      setDisplay(format(value));
    } else if (acc === null || !fresh) {
      setAcc(Number(display));
    }
    setOp(next);
    setFresh(true);
  };

  const press = (kind: 'digit' | 'op' | 'action', value: string) => {
    if (kind === 'digit') return digit(value);
    if (kind === 'op') return chooseOp(value as Op | 'equals');
    if (value === 'clear') return clear();
    if (value === 'back') return back();
    if (value === 'sign') return sign();
    if (value === 'percent') return percent();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = event.key;
      if (/^[0-9]$/.test(key)) {
        event.preventDefault();
        digit(key);
      } else if (key === '.') {
        event.preventDefault();
        digit('.');
      } else if (key === '+' || key === '-' || key === '*' || key === '/') {
        event.preventDefault();
        chooseOp(({ '+': '+', '-': '−', '*': '×', '/': '÷' } as Record<string, Op>)[key]);
      } else if (key === 'Enter' || key === '=') {
        event.preventDefault();
        chooseOp('equals');
      } else if (key === 'Escape') {
        clear();
      } else if (key === 'Backspace') {
        event.preventDefault();
        back();
      } else if (key === '%') {
        percent();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="space-y-4">
      <Panel className="overflow-hidden !p-0">
        <div className="flex items-center justify-between border-b border-line px-4 py-2 text-xs text-muted">
          <span className="font-mono">
            {acc !== null && op ? `${format(acc)} ${op}` : '\u00a0'}
          </span>
          <span>Keyboard ready</span>
        </div>
        <div className="px-5 py-6 text-right">
          <p
            className="truncate font-mono text-4xl font-semibold tracking-tight text-fg sm:text-5xl"
            aria-live="polite"
          >
            {display}
          </p>
        </div>
        <div className="grid grid-cols-4 gap-2 border-t border-line p-3">
          {KEYS.map((key) => {
            const isEquals = key.value === 'equals';
            const isOperator = key.kind === 'op' && !isEquals;
            return (
              <button
                key={key.label}
                type="button"
                onClick={() => press(key.kind, key.value)}
                className={[
                  'h-12 rounded-xl text-base font-semibold transition active:scale-[0.97]',
                  isEquals
                    ? 'bg-accent text-white shadow-soft hover:brightness-110'
                    : isOperator
                      ? 'bg-accent/10 text-accent hover:bg-accent/20'
                      : key.kind === 'action'
                        ? 'bg-raised text-muted hover:text-fg'
                        : 'border border-line bg-surface text-fg hover:border-accent/40',
                ].join(' ')}
              >
                {key.label}
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel title="Recent calculations" description="The last few results from this session.">
        {history.length === 0 ? (
          <p className="text-sm text-muted">Nothing yet — the history appears after your first “=”.</p>
        ) : (
          <ul className="space-y-1.5 font-mono text-sm text-muted">
            {history.map((line) => (
              <li key={line} className="rounded-lg bg-raised/60 px-3 py-2">
                {line}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
