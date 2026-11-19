import { useMemo, useState } from 'react';
import { Button, Field, Grid, Input, Panel, Result, Select } from '../../components/ui';
import { formatCurrency } from '../../lib/utils';


type Freq = 'daily' | 'weekly' | 'monthly' | 'yearly';


interface HabitItem {
  id: string;
  label: string;
  amount: string;
  freq: Freq;
}


const INITIAL: HabitItem[] = [
  { id: '1', label: 'Streaming & OTT bundle', amount: '649', freq: 'monthly' },
  { id: '2', label: 'Daily takeaway coffee / snack', amount: '120', freq: 'daily' },
  { id: '3', label: 'Unused cloud / app subscription', amount: '299', freq: 'monthly' },
];


function toMonthly(amount: number, freq: Freq): number {
  if (freq === 'daily') return amount * 30.4375;
  if (freq === 'weekly') return amount * 4.345;
  if (freq === 'yearly') return amount / 12;
  return amount;
}


function futureValueSip(monthly: number, annualRatePct: number, years: number): number {
  const n = years * 12;
  const r = annualRatePct / 100 / 12;
  if (r <= 0) return monthly * n;
  return monthly * (((Math.pow(1 + r, n) - 1) / r) * (1 + r));
}


export default function SubscriptionBurn() {
  const [items, setItems] = useState<HabitItem[]>(INITIAL);
  const [currency, setCurrency] = useState('INR');
  const [returnRate, setReturnRate] = useState('12');


  const rate = Math.max(0, Number(returnRate) || 0);


  const summary = useMemo(() => {
    const monthly = items.reduce((sum, item) => {
      const val = Math.max(0, Number(item.amount) || 0);
      return sum + toMonthly(val, item.freq);
    }, 0);
    const yearly = monthly * 12;
    const cost5y = yearly * 5;
    const cost10y = yearly * 10;
    const invested5y = futureValueSip(monthly, rate, 5);
    const invested10y = futureValueSip(monthly, rate, 10);
    return { monthly, yearly, cost5y, cost10y, invested5y, invested10y };
  }, [items, rate]);


  const updateItem = (id: string, patch: Partial<HabitItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };


  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { id: String(Date.now()), label: 'New recurring expense', amount: '500', freq: 'monthly' },
    ]);
  };


  return (
    <div className="space-y-4">
      <Panel
        title="Your small recurring spends"
        description="Add subscriptions, deliveries or daily habits to see their true long-term opportunity cost."
        actions={
          <Button type="button" size="sm" onClick={addItem}>
            + Add item
          </Button>
        }
      >
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="grid gap-2 border border-line bg-raised/40 p-3 sm:grid-cols-[1.6fr_0.9fr_0.9fr_auto]">
              <Input
                aria-label="Expense label"
                value={item.label}
                onChange={(e) => updateItem(item.id, { label: e.target.value })}
              />
              <Input
                aria-label="Amount"
                type="number"
                min="0"
                value={item.amount}
                onChange={(e) => updateItem(item.id, { amount: e.target.value })}
              />
              <Select
                aria-label="Frequency"
                value={item.freq}
                onChange={(e) => updateItem(item.id, { freq: e.target.value as Freq })}
              >
                <option value="daily">Per day</option>
                <option value="weekly">Per week</option>
                <option value="monthly">Per month</option>
                <option value="yearly">Per year</option>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setItems((prev) => prev.filter((x) => x.id !== item.id))}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>


        <div className="mt-4">
          <Grid cols={2}>
            <Field label="Currency">
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="INR">INR (₹)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </Select>
            </Field>
            <Field label="Expected annual return if invested (%)" hint="e.g. 12% equity SIP or 7% FD">
              <Input type="number" step="0.5" min="0" max="30" value={returnRate} onChange={(e) => setReturnRate(e.target.value)} />
            </Field>
          </Grid>
        </div>
      </Panel>


      <Panel title="The real silent drain">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Result label="Monthly burn" value={formatCurrency(summary.monthly, currency, 0)} />
          <Result label="Yearly burn" value={formatCurrency(summary.yearly, currency, 0)} />
          <Result
            label="5-year opportunity cost"
            value={formatCurrency(summary.invested5y, currency, 0)}
            hint={`Out of pocket: ${formatCurrency(summary.cost5y, currency, 0)}`}
          />
          <Result
            label="10-year opportunity cost"
            size="lg"
            value={formatCurrency(summary.invested10y, currency, 0)}
            hint={`Out of pocket: ${formatCurrency(summary.cost10y, currency, 0)}`}
          />
        </div>
        <p className="mt-4 text-xs leading-relaxed text-muted">
          Opportunity cost assumes the same monthly cash flow is invested at {rate}% nominal annual return, compounded monthly. Illustration only, not financial advice.
        </p>
      </Panel>
    </div>
  );
}
