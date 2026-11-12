import { useState } from 'react';
import { Field, Grid, Input, Panel, Result, Tabs } from '../../components/ui';
import { formatNumber, round } from '../../lib/utils';
import { num } from '../shared';

type Units = 'metric' | 'imperial';

const RANGES = [
  { label: 'Underweight', max: 18.5, tone: 'bg-sky-500', text: 'text-sky-600 dark:text-sky-400' },
  { label: 'Healthy weight', max: 25, tone: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  { label: 'Overweight', max: 30, tone: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  { label: 'Obese', max: Number.POSITIVE_INFINITY, tone: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400' },
];

export default function BmiCalculator() {
  const [units, setUnits] = useState<Units>('metric');
  const [heightCm, setHeightCm] = useState('175');
  const [weightKg, setWeightKg] = useState('70');
  const [feet, setFeet] = useState('5');
  const [inches, setInches] = useState('9');
  const [pounds, setPounds] = useState('154');

  const heightMeters =
    units === 'metric' ? num(heightCm) / 100 : ((num(feet) * 12 + num(inches)) * 2.54) / 100;
  const weightKgValue = units === 'metric' ? num(weightKg) : num(pounds) * 0.45359237;
  const bmi = heightMeters > 0 ? weightKgValue / (heightMeters * heightMeters) : 0;
  const valid = heightMeters > 0 && weightKgValue > 0;
  const index = RANGES.findIndex((range) => bmi < range.max);
  const range = RANGES[index] ?? RANGES[RANGES.length - 1];

  const healthyMinKg = 18.5 * heightMeters * heightMeters;
  const healthyMaxKg = 24.9 * heightMeters * heightMeters;
  const healthyMin = units === 'metric' ? healthyMinKg : healthyMinKg / 0.45359237;
  const healthyMax = units === 'metric' ? healthyMaxKg : healthyMaxKg / 0.45359237;

  const percent = Math.min(100, Math.max(0, ((bmi - 15) / (40 - 15)) * 100));

  return (
    <div className="space-y-4">
      <Panel title="Your measurements">
        <Tabs
          value={units}
          onChange={setUnits}
          tabs={[
            { id: 'metric', label: 'Metric (cm / kg)' },
            { id: 'imperial', label: 'Imperial (ft / lb)' },
          ]}
          className="mb-5"
        />

        {units === 'metric' ? (
          <Grid>
            <Field label="Height (cm)" hint="1 cm – 260 cm">
              <Input type="number" inputMode="decimal" value={heightCm} onChange={(event) => setHeightCm(event.target.value)} />
            </Field>
            <Field label="Weight (kg)" hint="1 kg – 400 kg">
              <Input type="number" inputMode="decimal" value={weightKg} onChange={(event) => setWeightKg(event.target.value)} />
            </Field>
          </Grid>
        ) : (
          <div className="space-y-4">
            <Grid cols={3}>
              <Field label="Feet">
                <Input type="number" value={feet} onChange={(event) => setFeet(event.target.value)} />
              </Field>
              <Field label="Inches">
                <Input type="number" value={inches} onChange={(event) => setInches(event.target.value)} />
              </Field>
              <Field label="Weight (lb)">
                <Input type="number" value={pounds} onChange={(event) => setPounds(event.target.value)} />
              </Field>
            </Grid>
          </div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Result
            label="Body mass index"
            size="lg"
            value={valid ? formatNumber(round(bmi, 1)) : '—'}
            hint={valid ? range.label : 'Enter a height and weight'}
          />
          <div className="rounded-xl border border-line bg-raised/40 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Healthy weight for this height</p>
            <p className="mt-1 text-xl font-semibold tracking-tight text-fg">
              {valid
                ? `${formatNumber(round(healthyMin, 1))} – ${formatNumber(round(healthyMax, 1))} ${units === 'metric' ? 'kg' : 'lb'}`
                : '—'}
            </p>
            <p className="mt-1 text-xs text-muted">Based on a BMI between 18.5 and 24.9.</p>
          </div>
        </div>

        {valid && (
          <div className="mt-5">
            <div className="relative h-3 overflow-hidden rounded-full bg-[linear-gradient(90deg,#38bdf8_0%,#38bdf8_14%,#22c55e_14%,#22c55e_40%,#f59e0b_40%,#f59e0b_60%,#f43f5e_60%,#f43f5e_100%)]">
              <div
                className="absolute top-1/2 h-5 w-1.5 -translate-y-1/2 rounded-full bg-white shadow ring-2 ring-slate-900/40 transition-all"
                style={{ left: `calc(${percent}% - 3px)` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-muted">
              <span>15</span>
              <span>18.5</span>
              <span>25</span>
              <span>30</span>
              <span>40</span>
            </div>
          </div>
        )}
      </Panel>

      <Panel title="What this means">
        <p className={`text-sm font-semibold ${valid ? range.text : 'text-muted'}`}>
          {valid ? range.label : 'Waiting for measurements'}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          BMI is a rough screening measure, not a diagnosis. It does not distinguish muscle from fat,
          and it is less reliable for athletes, children, older adults and during pregnancy. Use it as
          a starting point for a conversation with a clinician.
        </p>
      </Panel>
    </div>
  );
}
