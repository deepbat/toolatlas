import { useState } from 'react';
import { Button, Field, Input, Panel, Select } from '../../components/ui';
import { cn } from '../../lib/utils';
import { Icon } from '../../components/Icon';

const ZONES = [
  'UTC',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Karachi',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Pacific/Auckland',
];

function localDateTimeValue(date = new Date()): string {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export default function TimezoneConverter() {
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [value, setValue] = useState(localDateTimeValue());
  const [zones, setZones] = useState<string[]>([
    localZone,
    'UTC',
    'America/New_York',
    'Europe/London',
    'Asia/Dubai',
    'Asia/Kolkata',
    'Asia/Tokyo',
  ]);
  const [candidate, setCandidate] = useState('Europe/Berlin');

  const instant = new Date(value);
  const valid = !Number.isNaN(instant.getTime());

  const addZone = () => {
    if (!zones.includes(candidate)) setZones((current) => [...current, candidate]);
  };

  return (
    <div className="space-y-4">
      <Panel title="Your reference time">
        <Field label={`Date and time in ${localZone}`} hint="Enter the time as it appears on your own clock.">
          <Input type="datetime-local" value={value} onChange={(event) => setValue(event.target.value)} />
        </Field>

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <Field label="Add another zone">
              <Select value={candidate} onChange={(event) => setCandidate(event.target.value)}>
                {ZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone.replace(/_/g, ' ')}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Button type="button" variant="secondary" onClick={addZone} className="mb-0.5">
            Add zone
          </Button>
        </div>
      </Panel>

      <Panel
        title="Converted times"
        description={valid ? 'Everyone sees the same moment, expressed in their own zone.' : 'Enter a valid date and time.'}
      >
        <div className="space-y-2">
          {zones.map((zone) => {
            const time = valid
              ? new Intl.DateTimeFormat(undefined, {
                  timeZone: zone,
                  weekday: 'short',
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                }).format(instant)
              : '—';
            const offset = valid
              ? new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' })
                  .formatToParts(instant)
                  .find((part) => part.type === 'timeZoneName')?.value ?? ''
              : '';
            const isLocal = zone === localZone;
            return (
              <div
                key={zone}
                className={cn(
                  'flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3',
                  isLocal ? 'border-accent/30 bg-accent/5' : 'border-line bg-raised/40'
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface text-accent">
                    <Icon name="Globe2" className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-sm font-medium text-fg">{zone.replace(/_/g, ' ')}</span>
                  {isLocal && <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">local</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-fg">{time}</span>
                  <span className="rounded-md bg-surface px-2 py-0.5 font-mono text-[11px] text-muted">{offset}</span>
                  {zones.length > 1 && !isLocal && (
                    <button
                      type="button"
                      onClick={() => setZones((current) => current.filter((item) => item !== zone))}
                      className="rounded-md p-1 text-muted transition hover:bg-surface hover:text-rose-500"
                      aria-label={`Remove ${zone}`}
                    >
                      <Icon name="X" className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
