import { useState } from 'react';
import { Field, Grid, Panel, Result } from '../../components/ui';
import { formatDate, formatNumber, todayISO } from '../../lib/utils';

function diffYMD(from: Date, to: Date) {
  let totalMonths=(to.getFullYear()-from.getFullYear())*12+to.getMonth()-from.getMonth();
  const anchor=(months:number)=>{const date=new Date(from.getFullYear(),from.getMonth()+months,1);date.setDate(Math.min(from.getDate(),new Date(date.getFullYear(),date.getMonth()+1,0).getDate()));return date};
  if(anchor(totalMonths)>to)totalMonths--;
  const d=anchor(totalMonths);const days=Math.round((Date.UTC(to.getFullYear(),to.getMonth(),to.getDate())-Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()))/86400000);
  return {years:Math.floor(totalMonths/12),months:totalMonths%12,days};
}

export default function AgeCalculator() {
  const [dob, setDob] = useState('1995-06-15');
  const [asOf, setAsOf] = useState(todayISO());

  const birth = new Date(`${dob}T00:00:00`);
  const reference = new Date(`${asOf}T00:00:00`);
  const valid = Boolean(dob) && Boolean(asOf) && !Number.isNaN(birth.getTime()) && !Number.isNaN(reference.getTime()) && birth <= reference;

  const ymd = valid ? diffYMD(birth, reference) : { years: 0, months: 0, days: 0 };
  const totalDays = valid ? Math.round((Date.UTC(reference.getFullYear(),reference.getMonth(),reference.getDate()) - Date.UTC(birth.getFullYear(),birth.getMonth(),birth.getDate())) / 86_400_000) : 0;
  const totalWeeks = Math.floor(totalDays / 7);
  const totalMonths = valid ? ymd.years * 12 + ymd.months : 0;

  let nextBirthday: Date | null = null;
  let daysToBirthday = 0;
  if (valid) {
    nextBirthday = new Date(reference.getFullYear(), birth.getMonth(), Math.min(birth.getDate(),new Date(reference.getFullYear(),birth.getMonth()+1,0).getDate()));
    if (nextBirthday.getTime() < reference.getTime()) {
      nextBirthday = new Date(reference.getFullYear()+1, birth.getMonth(), Math.min(birth.getDate(),new Date(reference.getFullYear()+1,birth.getMonth()+1,0).getDate()));
    }
    daysToBirthday = Math.round((nextBirthday.getTime() - reference.getTime()) / 86_400_000);
  }

  return (
    <div className="space-y-4">
      <Panel title="Dates" description="Calendar age uses a clamped month-end convention: a 29 February birthday falls on 28 February in non-leap years.">
        <Grid>
          <Field label="Date of birth">
            <input
              type="date"
              value={dob}
              max={asOf}
              onChange={(event) => setDob(event.target.value)}
              className="w-full rounded-xl border border-line bg-raised/60 px-3.5 py-2.5 text-sm text-fg outline-none focus:border-accent/70 focus:ring-4 focus:ring-accent/10"
            />
          </Field>
          <Field label="Age as of">
            <input
              type="date"
              value={asOf}
              min={dob}
              onChange={(event) => setAsOf(event.target.value)}
              className="w-full rounded-xl border border-line bg-raised/60 px-3.5 py-2.5 text-sm text-fg outline-none focus:border-accent/70 focus:ring-4 focus:ring-accent/10"
            />
          </Field>
        </Grid>

        {!valid ? (
          <p className="mt-4 text-sm text-rose-500">Choose a birth date that is not after the reference date.</p>
        ) : (
          <>
            <div className="mt-5">
              <Result
                label="Exact age"
                size="lg"
                value={`${ymd.years} years, ${ymd.months} months, ${ymd.days} days`}
                hint={`Born on a ${birth.toLocaleDateString(undefined, { weekday: 'long' })}`}
              />
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Result label="Total months" value={formatNumber(totalMonths, 0)} />
              <Result label="Total weeks" value={formatNumber(totalWeeks, 0)} />
              <Result label="Total days" value={formatNumber(totalDays, 0)} />
              <Result label="Total hours" value={formatNumber(totalDays * 24, 0)} />
            </div>
          </>
        )}
      </Panel>

      {valid && nextBirthday && (
        <Panel title="Next birthday">
          <div className="grid gap-3 sm:grid-cols-2">
            <Result
              label="Countdown"
              value={daysToBirthday === 0 ? 'Today! 🎉' : `${formatNumber(daysToBirthday, 0)} days`}
              hint={`Turning ${ymd.years + (daysToBirthday === 0 ? 0 : 1)}`}
            />
            <Result
              label="Date"
              value={formatDate(nextBirthday, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            />
          </div>
        </Panel>
      )}
    </div>
  );
}
