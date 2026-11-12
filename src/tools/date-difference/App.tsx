import { useState } from 'react';
import { Field, Grid, Panel, Result, Toggle } from '../../components/ui';
import { formatNumber, todayISO } from '../../lib/utils';

function businessDays(start: Date, end: Date): number {
  const days=Math.round((+end-+start)/86400000);let count=Math.floor(days/7)*5;
  for(let i=0;i<days%7;i++){const day=(start.getUTCDay()+i)%7;if(day!==0&&day!==6)count++}return count;
}

export default function DateDifference() {
  const [start, setStart] = useState(todayISO());
  const [end, setEnd] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    return date.toISOString().slice(0, 10);
  });
  const [includeEnd, setIncludeEnd] = useState(false);

  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const valid = !Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime());

  const rawDays = valid ? Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) : 0;
  const days = Math.abs(rawDays) + (includeEnd ? 1 : 0);
  const weeks = Math.floor(days / 7);
  const remainderDays = days % 7;
  const months = days / 30.436875;
  const years = days / 365.2425;
  const workDays = valid
    ? businessDays(rawDays >= 0 ? startDate : endDate, rawDays >= 0 ? endDate : startDate) +
      (includeEnd && (rawDays>=0?endDate:startDate).getUTCDay() !== 0 && (rawDays>=0?endDate:startDate).getUTCDay() !== 6 ? 1 : 0)
    : 0;

  return (
    <div className="space-y-4">
      <Panel title="Pick two dates">
        <Grid>
          <Field label="Start date">
            <input
              type="date"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              className="w-full rounded-xl border border-line bg-raised/60 px-3.5 py-2.5 text-sm text-fg outline-none focus:border-accent/70 focus:ring-4 focus:ring-accent/10"
            />
          </Field>
          <Field label="End date">
            <input
              type="date"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              className="w-full rounded-xl border border-line bg-raised/60 px-3.5 py-2.5 text-sm text-fg outline-none focus:border-accent/70 focus:ring-4 focus:ring-accent/10"
            />
          </Field>
        </Grid>

        <div className="mt-3">
          <Toggle
            checked={includeEnd}
            onChange={setIncludeEnd}
            label="Include the end date"
            description="Count both the first and the last day."
          />
        </div>

        <div className="mt-5">
          <Result
            label="Difference"
            size="lg"
            value={valid ? `${formatNumber(days, 0)} days` : '—'}
            hint={
              valid
                ? `${weeks} ${weeks === 1 ? 'week' : 'weeks'} and ${remainderDays} ${remainderDays === 1 ? 'day' : 'days'}${rawDays < 0 ? ' · end is before start' : ''}`
                : 'Choose two valid dates'
            }
          />
        </div>
      </Panel>

      <Panel title="In other units">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Result label="Business days" value={formatNumber(workDays, 0)} hint="Monday to Friday" />
          <Result label="Weeks" value={formatNumber(days / 7, 2)} />
          <Result label="Months (avg)" value={formatNumber(months, 2)} />
          <Result label="Years (avg)" value={formatNumber(years, 3)} />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Result label="Hours" value={formatNumber(days * 24, 0)} />
          <Result label="Minutes" value={formatNumber(days * 24 * 60, 0)} />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Business days exclude Saturdays and Sundays. Public holidays are not considered, because they
          differ by country and year.
        </p>
      </Panel>
    </div>
  );
}
