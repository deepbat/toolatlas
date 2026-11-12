import { useMemo, useState } from 'react';
import { Field, Grid, Input, Panel, ProgressBar, Result, Select, Tabs } from '../../components/ui';
import { formatCurrency, formatNumber } from '../../lib/utils';
import { num } from '../shared';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AED', 'CAD', 'AUD', 'SGD'];
const FREQUENCIES = [
  { id: '12', label: 'Monthly', periods: 12 },
  { id: '4', label: 'Quarterly', periods: 4 },
  { id: '1', label: 'Yearly', periods: 1 },
];

export default function CompoundInterest() {
  const [principal, setPrincipal] = useState('10000');
  const [monthly, setMonthly] = useState('200');
  const [rate, setRate] = useState('7');
  const [years, setYears] = useState('10');
  const [frequency, setFrequency] = useState('12');
  const [currency, setCurrency] = useState('USD');
  const [view, setView] = useState<'chart' | 'table'>('chart');

  const periods = Number(frequency);
  const annualRate = num(rate) / 100;
  const months = Math.max(1, Math.round(num(years) * 12));
  const contribution = Math.max(0, num(monthly));

  const { balance, contributed, yearly } = useMemo(() => {
    const effectiveMonthlyRate = (1 + annualRate / periods) ** (periods / 12) - 1;
    let current = Math.max(0, num(principal));
    let contributedTotal = current;
    const rows: Array<{ year: number; balance: number; contributed: number; interest: number }> = [];

    for (let month = 1; month <= months; month += 1) {
      current = current * (1 + effectiveMonthlyRate) + contribution;
      contributedTotal += contribution;
      if (month % 12 === 0 || month === months) {
        rows.push({
          year: Math.ceil(month / 12),
          balance: current,
          contributed: contributedTotal,
          interest: current - contributedTotal,
        });
      }
    }
    return { balance: current, contributed: contributedTotal, yearly: rows };
  }, [annualRate, contribution, months, periods, principal]);

  const interest = balance - contributed;
  const maxBalance = Math.max(...yearly.map((row) => row.balance), 1);

  return (
    <div className="space-y-4">
      <Panel title="Your plan">
        <Grid cols={3}>
          <Field label="Starting amount">
            <Input type="number" inputMode="decimal" value={principal} onChange={(event) => setPrincipal(event.target.value)} />
          </Field>
          <Field label="Monthly contribution">
            <Input type="number" inputMode="decimal" value={monthly} onChange={(event) => setMonthly(event.target.value)} />
          </Field>
          <Field label="Annual return (%)">
            <Input type="number" inputMode="decimal" step="0.1" value={rate} onChange={(event) => setRate(event.target.value)} />
          </Field>
          <Field label="Years">
            <Input type="number" inputMode="decimal" value={years} onChange={(event) => setYears(event.target.value)} />
          </Field>
          <Field label="Compounding">
            <Select value={frequency} onChange={(event) => setFrequency(event.target.value)}>
              {FREQUENCIES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </Select>
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

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Result
            label="Future value"
            size="lg"
            value={formatCurrency(balance, currency, 0)}
            hint={`After ${formatNumber(months / 12, 1)} years`}
          />
          <Result label="Total contributed" value={formatCurrency(contributed, currency, 0)} />
          <Result
            label="Interest earned"
            value={formatCurrency(interest, currency, 0)}
            hint={`${formatNumber(contributed > 0 ? (interest / contributed) * 100 : 0, 1)}% on contributions`}
          />
        </div>

        <div className="mt-3">
          <div className="mb-1.5 flex justify-between text-xs text-muted">
            <span>Contributions</span>
            <span>Growth</span>
          </div>
          <ProgressBar value={contributed} max={Math.max(balance, 1)} />
        </div>
      </Panel>

      <Panel
        title="Growth over time"
        actions={
          <Tabs
            value={view}
            onChange={setView}
            tabs={[
              { id: 'chart', label: 'Chart' },
              { id: 'table', label: 'Table' },
            ]}
          />
        }
      >
        {view === 'chart' ? (
          <div className="flex h-56 items-end gap-1.5 overflow-x-auto pb-6">
            {yearly.map((row) => (
              <div key={row.year} className="group relative flex min-w-6 flex-1 flex-col items-center justify-end gap-1">
                <div className="absolute bottom-full mb-1 hidden rounded-md bg-fg px-2 py-1 text-[10px] font-medium text-bg group-hover:block">
                  {formatCurrency(row.balance, currency, 0)}
                </div>
                <div className="flex w-full flex-col justify-end" style={{ height: `${(row.balance / maxBalance) * 100}%` }}>
                  <div
                    className="w-full rounded-t bg-[linear-gradient(180deg,rgb(var(--accent)),#22d3ee)]"
                    style={{ height: `${(row.contributed / row.balance) * 100}%` }}
                  />
                  <div className="w-full rounded-b bg-accent/20" style={{ height: `${(1 - row.contributed / row.balance) * 100}%` }} />
                </div>
                <span className="absolute -bottom-5 text-[10px] text-muted">{row.year}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-raised text-left text-[11px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">Year</th>
                  <th className="px-3 py-2 text-right font-semibold">Contributed</th>
                  <th className="px-3 py-2 text-right font-semibold">Interest</th>
                  <th className="px-3 py-2 text-right font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {yearly.map((row) => (
                  <tr key={row.year}>
                    <td className="px-3 py-2 text-muted">{row.year}</td>
                    <td className="px-3 py-2 text-right font-mono text-fg">{formatCurrency(row.contributed, currency, 0)}</td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(row.interest, currency, 0)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-fg">{formatCurrency(row.balance, currency, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Contributions are added at the end of each month. Returns are an assumption, not a promise —
          real investments fluctuate and may lose value.
        </p>
      </Panel>
    </div>
  );
}
