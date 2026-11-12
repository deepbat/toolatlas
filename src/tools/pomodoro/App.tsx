import { useEffect, useState } from 'react';
import { Button, Field, Grid, Input, Panel, Tabs } from '../../components/ui';
import { useLocalStorage } from '../../lib/hooks';

type Mode = 'focus' | 'short' | 'long';

const LABELS: Record<Mode, string> = {
  focus: 'Focus session',
  short: 'Short break',
  long: 'Long break',
};

export default function Pomodoro() {
  const [durations, setDurations] = useLocalStorage('toolatlas:tool:pomodoro', {
    focus: 25,
    short: 5,
    long: 15,
  });
  const [completed, setCompleted] = useLocalStorage('toolatlas:tool:pomodoro:done', 0);
  const [mode, setMode] = useState<Mode>('focus');
  const [secondsLeft, setSecondsLeft] = useState(durations.focus * 60);
  const [running, setRunning] = useState(false);

  const total = Math.max(1, durations[mode] * 60);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((value) => {
        if (value <= 1) {
          setRunning(false);
          if (mode === 'focus') {
            const nextCount = completed + 1;
            setCompleted(nextCount);
            setMode(nextCount % 4 === 0 ? 'long' : 'short');
          } else {
            setMode('focus');
          }
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running, mode, completed, setCompleted]);

  useEffect(() => {
    setSecondsLeft(durations[mode] * 60);
    setRunning(false);
  }, [mode, durations]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const progress = 1 - secondsLeft / total;
  const circumference = 2 * Math.PI * 54;

  return (
    <div className="space-y-4">
      <Tabs
        value={mode}
        onChange={(next) => setMode(next)}
        tabs={[
          { id: 'focus', label: 'Focus' },
          { id: 'short', label: 'Short break' },
          { id: 'long', label: 'Long break' },
        ]}
      />

      <Panel title={LABELS[mode]} description={`${durations[mode]} minutes`}>
        <div className="flex flex-col items-center py-2">
          <div className="relative h-40 w-40">
            <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
              <circle cx="60" cy="60" r="54" fill="none" stroke="rgb(var(--line))" strokeWidth="8" />
              <circle
                cx="60"
                cy="60"
                r="54"
                fill="none"
                stroke="rgb(var(--accent))"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - progress)}
                className="transition-[stroke-dashoffset] duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="font-mono text-4xl font-semibold tabular-nums tracking-tight text-fg">
                {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-muted">
                {running ? 'Running' : secondsLeft === 0 ? 'Finished' : 'Ready'}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              onClick={() => {
                if (secondsLeft === 0) setSecondsLeft(total);
                setRunning((value) => !value);
              }}
            >
              {running ? 'Pause' : secondsLeft === 0 ? 'Start again' : 'Start'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setSecondsLeft(total)}>
              Reset
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setRunning(false);
                setSecondsLeft(0);
              }}
            >
              Skip
            </Button>
          </div>

          <p className="mt-4 text-xs text-muted">
            {completed} focus {completed === 1 ? 'session' : 'sessions'} completed today · a long break
            every 4 sessions
          </p>
        </div>
      </Panel>

      <Panel title="Durations" description="Adjust the classic 25 / 5 / 15 rhythm.">
        <Grid cols={3}>
          {(['focus', 'short', 'long'] as Mode[]).map((key) => (
            <Field key={key} label={LABELS[key]}>
              <Input
                type="number"
                min={1}
                max={120}
                value={String(durations[key])}
                disabled={running && mode === key}
                onChange={(event) => {
                  const value = Math.max(1, Math.min(120, Number(event.target.value) || 1));
                  setDurations((current) => ({ ...current, [key]: value }));
                }}
              />
            </Field>
          ))}
        </Grid>
        <div className="mt-3 flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={() => setCompleted(0)}>
            Reset session count
          </Button>
        </div>
      </Panel>
    </div>
  );
}
