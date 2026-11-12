import { useMemo, useState } from 'react';
import { Field, Grid, Input, Panel, ProgressBar, Result, Select } from '../../components/ui';
import { formatCurrency, formatNumber, round } from '../../lib/utils';
import { num } from '../shared';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AED', 'CAD', 'AUD', 'SGD', 'JPY'];

export default function LoanEmiCalculator() {
  const [principal, setPrincipal] = useState('250000');
  const [rate, setRate] = useState('7.5');
  const [years, setYears] = useState('20');
  const [currency, setCurrency] = useState('USD');

  const amount = Math.max(0, num(principal));
  const annualRate = Math.max(0, num(rate));
  const months = Math.min(1200, Math.max(1, Math.round(num(years) * 12)));
  const monthlyRate = annualRate / 100 / 12;

  const emi =
    monthlyRate === 0
      ? amount / months
      : (amount * monthlyRate) / (1 - (1 + monthlyRate) ** -months);

  const totalPayment = emi * months;
  const totalInterest = totalPayment - amount;
  const interestShare = totalPayment > 0 ? (totalInterest / totalPayment) * 100 : 0;

  const schedule = useMemo(() => {
    let balance = amount;
    const rows: Array<{ year: number; principal: number; interest: number; balance: number }> = [];
    let yearPrincipal = 0;
    let yearInterest = 0;
    for (let month = 1; month <= months; month += 1) {
      const interest = balance * monthlyRate;
      const principalPart = Math.min(emi - interest, balance);
      balance -= principalPart;
      yearInterest += interest;
      yearPrincipal += principalPart;
      if (month % 12 === 0 || month === months) {
        rows.push({
          year: Math.ceil(month / 12),
          principal: yearPrincipal,
          interest: yearInterest,
          balance: Math.max(0, balance),
        });
        yearPrincipal = 0;
        yearInterest = 0;
      }
    }
    return rows;
  }, [amount, emi, monthlyRate, months]);

  return (
    <div className="space-y-4">
      <Panel title="Loan details" description="Educational estimate. Term is limited to 1-1200 monthly instalments. Fees, insurance and changing rates are excluded.">
        <Grid cols={3}>
          <Field label="Loan amount">
            <Input type="number" inputMode="decimal" value={principal} onChange={(event) => setPrincipal(event.target.value)} />
          </Field>
          <Field label="Annual interest (%)">
            <Input type="number" inputMode="decimal" step="0.1" value={rate} onChange={(event) => setRate(event.target.value)} />
          </Field>
          <Field label="Term (years)">
            <Input type="number" inputMode="decimal" value={years} onChange={(event) => setYears(event.target.value)} />
          </Field>
        </Grid>

        <div className="mt-3 max-w-40">
          <Field label="Currency">
            <Select value={currency} onChange={(event) => setCurrency(event.target.value)}>
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Result
            label="Monthly payment"
            size="lg"
            value={formatCurrency(emi, currency, 0)}
            hint={`${formatNumber(months, 0)} instalments`}
          />
          <Result label="Total interest" value={formatCurrency(totalInterest, currency, 0)} />
          <Result label="Total repayment" value={formatCurrency(totalPayment, currency, 0)} />
        </div>

        <div className="mt-5">
          <div className="mb-1.5 flex justify-between text-xs text-muted">
            <span>Principal {formatNumber(100 - interestShare, 1)}%</span>
            <span>Interest {formatNumber(interestShare, 1)}%</span>
          </div>
          <div className="flex h-3 overflow-hidden rounded-full bg-line">
            <div className="bg-accent" style={{ width: `${100 - interestShare}%` }} />
            <div className="bg-amber-500" style={{ width: `${interestShare}%` }} />
          </div>
        </div>
      </Panel>

      <Panel title="Yearly breakdown" description="How each year's payment is split.">
        <div className="max-h-80 overflow-y-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-raised text-left text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-3 py-2 font-semibold">Year</th>
                <th className="px-3 py-2 text-right font-semibold">Principal</th>
                <th className="px-3 py-2 text-right font-semibold">Interest</th>
                <th className="px-3 py-2 text-right font-semibold">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {schedule.map((row) => (
                <tr key={row.year}>
                  <td className="px-3 py-2 text-muted">{row.year}</td>
                  <td className="px-3 py-2 text-right font-mono text-fg">{formatCurrency(row.principal, currency, 0)}</td>
                  <td className="px-3 py-2 text-right font-mono text-amber-600 dark:text-amber-400">
                    {formatCurrency(row.interest, currency, 0)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-muted">{formatCurrency(row.balance, currency, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3">
          <ProgressBar value={Math.min(100, (schedule.length / Math.max(1, Math.ceil(months / 12))) * 100)} />
          <p className="mt-1.5 text-xs text-muted">
            A {formatNumber(round(annualRate, 2))}% loan over {formatNumber(months / 12, 2)} years costs{' '}
            {formatNumber(round(interestShare, 1))}% of the total in interest.
          </p>
        </div>
      </Panel>
    </div>
  );
}
