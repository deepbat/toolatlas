import { useState } from 'react';
import { Field, Grid, Input, Panel, Result, Tabs } from '../../components/ui';
import { formatNumber, round } from '../../lib/utils';
import { num } from '../shared';

type Mode = 'of' | 'is' | 'change';

export default function PercentageCalculator() {
  const [mode, setMode] = useState<Mode>('of');
  const [a, setA] = useState('25');
  const [b, setB] = useState('200');

  const x = num(a);
  const y = num(b);

  const output =
    mode === 'of'
      ? { value: (x / 100) * y, label: `${formatNumber(x)}% of ${formatNumber(y)}`, suffix: '' }
      : mode === 'is'
        ? { value: y === 0 ? 0 : (x / y) * 100, label: `${formatNumber(x)} is what percent of ${formatNumber(y)}?`, suffix: '%' }
        : {
            value: x === 0 ? 0 : ((y - x) / x) * 100,
            label: `Change from ${formatNumber(x)} to ${formatNumber(y)}`,
            suffix: '%',
          };

  const explanation =
    mode === 'of'
      ? `${formatNumber(x)} ÷ 100 × ${formatNumber(y)} = ${formatNumber(round(output.value, 4))}`
      : mode === 'is'
        ? `${formatNumber(x)} ÷ ${formatNumber(y)} × 100 = ${formatNumber(round(output.value, 4))}%`
        : `((${formatNumber(y)} − ${formatNumber(x)}) ÷ ${formatNumber(x)}) × 100 = ${formatNumber(round(output.value, 4))}%`;

  return (
    <div className="space-y-4">
      <Panel title="What would you like to work out?">
        <Tabs
          value={mode}
          onChange={setMode}
          tabs={[
            { id: 'of', label: 'X% of Y' },
            { id: 'is', label: 'X is what % of Y' },
            { id: 'change', label: 'Percentage change' },
          ]}
          className="mb-5"
        />

        <Grid>
          <Field label={mode === 'change' ? 'From value' : mode === 'of' ? 'Percentage (%)' : 'Part (X)'}>
            <Input
              type="number"
              inputMode="decimal"
              value={a}
              onChange={(event) => setA(event.target.value)}
            />
          </Field>
          <Field label={mode === 'change' ? 'To value' : 'Value (Y)'}>
            <Input
              type="number"
              inputMode="decimal"
              value={b}
              onChange={(event) => setB(event.target.value)}
            />
          </Field>
        </Grid>

        <div className="mt-5 grid gap-3 sm:grid-cols-[1.4fr_1fr]">
          <Result label="Result" size="lg" value={`${formatNumber(round(output.value, 4))}${output.suffix}`} />
          <div className="rounded-xl border border-line bg-raised/40 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Working</p>
            <p className="mt-1 font-mono text-xs leading-relaxed text-fg">{explanation}</p>
            <p className="mt-1 text-xs text-muted">{output.label}</p>
          </div>
        </div>
      </Panel>

      {mode === 'change' && (
        <Panel title="Increase or decrease?">
          <p className="text-sm text-muted">
            {output.value === 0
              ? 'The values are identical, so there is no change.'
              : output.value > 0
                ? `That is an increase of ${formatNumber(Math.abs(round(output.value, 2)))}%.`
                : `That is a decrease of ${formatNumber(Math.abs(round(output.value, 2)))}%.`}
          </p>
        </Panel>
      )}
    </div>
  );
}
