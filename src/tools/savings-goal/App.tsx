import { useMemo, useState } from 'react';
import { Field, Grid, Input, Panel, ProgressBar, Result, Select } from '../../components/ui';
import { formatCurrency, formatNumber, round } from '../../lib/utils';
import { num } from '../shared';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AED', 'CAD', 'AUD', 'SGD'];

export default function SavingsGoal() {
  const [goal, setGoal] = useState('50000');
  const [current, setCurrent] = useState('5000');
  const [monthly, setMonthly] = useState('600');
  const [rate, setRate] = useState('4');
  const [currency, setCurrency] = useState('USD');

  const target = Math.max(0, num(goal));
  const start = Math.max(0, num(current));
  const contribution = Math.max(0, num(monthly));
  const monthlyRate = num(rate) / 100 / 12;

  const projection = useMemo(() => {
    if (target <= start) {
      return { months: 0, balance: start, contributions: 0, interest: 0, reached: true };
    }
    if (contribution <= 0 && monthlyRate <= 0) {
      return { months: Infinity, balance: start, contributions: 0, interest: 0, reached: false };
    }

    let balance = start;
    let contributions = 0;
    let months = 0;
    while (balance < target && months < 1200) {
      balance = balance * (1 + monthlyRate) + contribution;
      contributions += contribution;
      months += 1;
    }
    return {
      months,
      balance,
      contributions,
      interest: balance - start - contributions,
      reached: balance >= target,
    };
  }, [contribution, monthlyRate, start, target]);

  const targetDate = useMemo(() => {
    if (!Number.isFinite(projection.months)) return null;
    const date = new Date();
    date.setMonth(date.getMonth() + projection.months);
    return date;
  }, [projection.months]);

  const progress = target > 0 ? Math.min(100, (start / target) * 100) : 0;

  return (
    <div className="space-y-4">
      <Panel title="The goal">
        <Grid cols={3}>
          <Field label="Target amount">
            <Input type="number" inputMode="decimal" value={goal} onChange={(event) => setGoal(event.target.value)} />
          </Field>
          <Field label="Already saved">
            <Input type="number" inputMode="decimal" value={current} onChange={(event) => setCurrent(event.target.value)} />
          </Field>
          <Field label="Monthly saving">
            <Input type="number" inputMode="decimal" value={monthly} onChange={(event) => setMonthly(event.target.value)} />
          </Field>
          <Field label="Annual return (%)" hint="Use 0 for a plain savings account.">
            <Input type="number" inputMode="decimal" step="0.1" value={rate} onChange={(event) => setRate(event.target.value)} />
          </Field>
          <Field label="Currency">
            <Select value={currency} onChange={(event) => setCurrency(event.target.value)}>
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </Field>
        </Grid>

        <div className="mt-5">
          <div className="mb-1.5 flex justify-between text-xs text-muted">
            <span>Saved so far</span>
            <span>{formatNumber(progress, 1)}%</span>
          </div>
          <ProgressBar value={progress} />
        </div>
      </Panel>

      <Panel title="Projection">
        {projection.reached ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Result
              label="Time to goal"
              size="lg"
              value={
                projection.months === 0
                  ? 'Already there'
                  : `${Math.floor(projection.months / 12)}y ${projection.months % 12}m`
              }
              hint={targetDate ? `Around ${targetDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}` : undefined}
            />
            <Result label="Total contributions" value={formatCurrency(projection.contributions, currency, 0)} />
            <Result label="Growth earned" value={formatCurrency(projection.interest, currency, 0)} />
          </div>
        ) : (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
            With these numbers the goal is not reached within 100 years. Increase the monthly saving or
            the expected return.
          </div>
        )}

        <p className="mt-4 text-xs leading-relaxed text-muted">
          Saving {formatCurrency(contribution, currency, 0)} a month with a{' '}
          {formatNumber(round(num(rate), 1))}% annual return needs{' '}
          {Number.isFinite(projection.months) ? `${projection.months} months` : 'more time'} to reach{' '}
          {formatCurrency(target, currency, 0)}.
        </p>
      </Panel>
    </div>
  );
}
