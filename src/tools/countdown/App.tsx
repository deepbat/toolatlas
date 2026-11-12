import { useEffect, useRef, useState } from 'react';
import { Button, Field, Grid, Input, Panel, ProgressBar, Tabs } from '../../components/ui';
import { formatNumber } from '../../lib/utils';
import { num } from '../shared';

type Mode = 'date' | 'timer';

function nextNewYear(): string {
  const now = new Date();
  return `${now.getFullYear() + 1}-01-01`;
}

export default function Countdown() {
  const [mode, setMode] = useState<Mode>('date');
  const [event, setEvent] = useState('New Year');
  const [target, setTarget] = useState(nextNewYear);
  const [now, setNow] = useState(() => Date.now());

  const [minutes, setMinutes] = useState('5');
  const [seconds, setSeconds] = useState('0');
  const [remaining, setRemaining] = useState(300);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (mode !== 'date') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [mode]);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = window.setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          setRunning(false);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [running]);

  const targetDate = new Date(`${target}T00:00:00`).getTime();
  const delta = Math.max(0, targetDate - now);
  const days = Math.floor(delta / 86_400_000);
  const hours = Math.floor((delta % 86_400_000) / 3_600_000);
  const minutesLeft = Math.floor((delta % 3_600_000) / 60_000);
  const secondsLeft = Math.floor((delta % 60_000) / 1000);

  const totalTimer = Math.max(1, num(minutes) * 60 + num(seconds));
  const displayMinutes = Math.floor(remaining / 60);
  const displaySeconds = remaining % 60;

  return (
    <div className="space-y-4">
      <Tabs
        value={mode}
        onChange={setMode}
        tabs={[
          { id: 'date', label: 'Countdown to a date' },
          { id: 'timer', label: 'Minute timer' },
        ]}
      />

      {mode === 'date' ? (
        <Panel title="The event">
          <Grid>
            <Field label="Event name">
              <Input value={event} onChange={(event_) => setEvent(event_.target.value)} maxLength={40} />
            </Field>
            <Field label="Target date">
              <input
                type="date"
                value={target}
                onChange={(event_) => setTarget(event_.target.value)}
                className="w-full rounded-xl border border-line bg-raised/60 px-3.5 py-2.5 text-sm text-fg outline-none focus:border-accent/70 focus:ring-4 focus:ring-accent/10"
              />
            </Field>
          </Grid>

          <div className="mt-6 rounded-2xl border border-line bg-raised/40 p-5 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{event || 'Countdown'}</p>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {[
                { label: 'Days', value: days },
                { label: 'Hours', value: hours },
                { label: 'Minutes', value: minutesLeft },
                { label: 'Seconds', value: secondsLeft },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-line bg-surface px-2 py-3">
                  <p className="font-mono text-2xl font-semibold tabular-nums text-fg sm:text-4xl">
                    {String(item.value).padStart(2, '0')}
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-muted">{item.label}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-muted">
              {delta === 0
                ? 'The moment has arrived.'
                : `${event || 'This event'} is ${formatNumber(days, 0)} days away.`}
            </p>
          </div>
        </Panel>
      ) : (
        <Panel title="Set a timer">
          <Grid>
            <Field label="Minutes">
              <Input
                type="number"
                min={0}
                value={minutes}
                onChange={(event_) => setMinutes(event_.target.value)}
                disabled={running}
              />
            </Field>
            <Field label="Seconds">
              <Input
                type="number"
                min={0}
                max={59}
                value={seconds}
                onChange={(event_) => setSeconds(event_.target.value)}
                disabled={running}
              />
            </Field>
          </Grid>

          <div className="mt-6 rounded-2xl border border-line bg-raised/40 p-6 text-center">
            <p className="font-mono text-5xl font-semibold tabular-nums tracking-tight text-fg sm:text-6xl">
              {String(displayMinutes).padStart(2, '0')}:{String(displaySeconds).padStart(2, '0')}
            </p>
            <div className="mx-auto mt-4 max-w-sm">
              <ProgressBar value={remaining} max={totalTimer} />
            </div>
            {remaining === 0 && <p className="mt-3 text-sm font-semibold text-emerald-500">Time is up.</p>}
          </div>

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              onClick={() => {
                if (!running && remaining === 0) setRemaining(totalTimer);
                setRunning((value) => !value);
              }}
            >
              {running ? 'Pause' : 'Start'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setRunning(false);
                setRemaining(totalTimer);
              }}
            >
              Reset
            </Button>
          </div>
        </Panel>
      )}
    </div>
  );
}
