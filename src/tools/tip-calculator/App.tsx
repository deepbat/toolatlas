import { useState } from 'react';
import { Field, Grid, Input, Panel, Result } from '../../components/ui';
import { formatCurrency, formatNumber, round } from '../../lib/utils';
import { num } from '../shared';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AED', 'CAD', 'AUD', 'SGD'];
const PRESETS = [0, 5, 10, 15, 18, 20, 25];

export default function TipCalculator() {
  const [bill, setBill] = useState('60');
  const [tip, setTip] = useState('18');
  const [people, setPeople] = useState('2');
  const [currency, setCurrency] = useState('USD');

  const billValue = Math.max(0, num(bill));
  const tipPercent = Math.max(0, num(tip));
  const peopleValue = Math.max(1, Math.floor(num(people, 1)));

  const tipAmount = (billValue * tipPercent) / 100;
  const total = billValue + tipAmount;
  const perPerson = total / peopleValue;

  return (
    <div className="space-y-4">
      <Panel title="The bill">
        <Grid cols={3}>
          <Field label="Bill amount">
            <Input type="number" inputMode="decimal" value={bill} onChange={(event) => setBill(event.target.value)} />
          </Field>
          <Field label="Tip (%)">
            <Input type="number" inputMode="decimal" value={tip} onChange={(event) => setTip(event.target.value)} />
          </Field>
          <Field label="People">
            <Input type="number" min={1} value={people} onChange={(event) => setPeople(event.target.value)} />
          </Field>
        </Grid>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setTip(String(preset))}
              className={[
                'rounded-full border px-3 py-1 text-xs font-semibold transition',
                num(tip) === preset
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-line text-muted hover:border-accent/30 hover:text-fg',
              ].join(' ')}
            >
              {preset === 0 ? 'No tip' : `${preset}%`}
            </button>
          ))}
          <div className="ml-auto">
            <select
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
              className="h-8 rounded-lg border border-line bg-surface px-2 text-xs text-fg outline-none"
              aria-label="Currency"
            >
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Result label="Tip" value={formatCurrency(tipAmount, currency)} />
          <Result label="Total" value={formatCurrency(total, currency)} />
          <Result label="Per person" value={formatCurrency(perPerson, currency)} size="lg" />
        </div>
      </Panel>

      <Panel title="Rounding made easy">
        <p className="text-sm leading-relaxed text-muted">
          Want to leave a round number? The bill plus tip is{' '}
          <span className="font-semibold text-fg">{formatCurrency(total, currency)}</span>, which is{' '}
          <span className="font-semibold text-fg">{formatNumber(round(perPerson, 2))}</span> per person.
          If everyone adds a little, the next easy total is{' '}
          {formatCurrency(Math.ceil(total / 5) * 5, currency)}.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {[15, 18, 20].map((percent) => (
            <span key={percent} className="rounded-lg border border-line bg-raised/50 px-2.5 py-1.5 text-muted">
              {percent}% → {formatCurrency((billValue * percent) / 100, currency)} tip
            </span>
          ))}
        </div>
      </Panel>
    </div>
  );
}
