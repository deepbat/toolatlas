import { useState } from 'react';
import { Field, Grid, Input, Panel, Result, Select, Tabs } from '../../components/ui';
import { formatNumber, round } from '../../lib/utils';
import { num } from '../shared';

type Scale = 'c' | 'f' | 'k';

const REFERENCE = [
  { label: 'Absolute zero', c: -273.15 },
  { label: 'Water freezes', c: 0 },
  { label: 'Room temperature', c: 21 },
  { label: 'Body temperature', c: 37 },
  { label: 'Water boils', c: 100 },
  { label: 'Oven, moderate', c: 180 },
];

function toCelsius(value: number, scale: Scale): number {
  if (scale === 'c') return value;
  if (scale === 'f') return ((value - 32) * 5) / 9;
  return value - 273.15;
}

function fromCelsius(c: number, scale: Scale): number {
  if (scale === 'c') return c;
  if (scale === 'f') return (c * 9) / 5 + 32;
  return c + 273.15;
}

export default function TemperatureConverter() {
  const [scale, setScale] = useState<Scale>('c');
  const [value, setValue] = useState('21');

  const celsius = toCelsius(num(value), scale);
  const fahrenheit = fromCelsius(celsius, 'f');
  const kelvin = fromCelsius(celsius, 'k');

  const label = scale === 'c' ? 'Celsius (°C)' : scale === 'f' ? 'Fahrenheit (°F)' : 'Kelvin (K)';

  return (
    <div className="space-y-4">
      <Panel title="Temperature">
        <Tabs
          value={scale}
          onChange={setScale}
          tabs={[
            { id: 'c', label: '°C' },
            { id: 'f', label: '°F' },
            { id: 'k', label: 'K' },
          ]}
          className="mb-4"
        />

        <Grid>
          <Field label={`Input (${label})`}>
            <Input
              type="number"
              inputMode="decimal"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </Field>
          <Field label="Quick picks">
            <Select
              value=""
              onChange={(event) => {
                if (!event.target.value) return;
                setValue(String(REFERENCE[Number(event.target.value)].c));
                setScale('c');
              }}
            >
              <option value="">Choose a reference…</option>
              {REFERENCE.map((item, index) => (
                <option key={item.label} value={index}>
                  {item.label} ({item.c} °C)
                </option>
              ))}
            </Select>
          </Field>
        </Grid>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Result label="Celsius" value={`${formatNumber(round(celsius, 2))} °C`} />
          <Result label="Fahrenheit" value={`${formatNumber(round(fahrenheit, 2))} °F`} />
          <Result label="Kelvin" value={`${formatNumber(round(kelvin, 2))} K`} />
        </div>
      </Panel>

      <Panel title="Reference points">
        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-raised/60 text-left text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-3 py-2 font-semibold">Point</th>
                <th className="px-3 py-2 text-right font-semibold">°C</th>
                <th className="px-3 py-2 text-right font-semibold">°F</th>
                <th className="px-3 py-2 text-right font-semibold">K</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {REFERENCE.map((item) => (
                <tr key={item.label}>
                  <td className="px-3 py-2 text-muted">{item.label}</td>
                  <td className="px-3 py-2 text-right font-mono text-fg">{item.c}</td>
                  <td className="px-3 py-2 text-right font-mono text-fg">{formatNumber(fromCelsius(item.c, 'f'))}</td>
                  <td className="px-3 py-2 text-right font-mono text-fg">{formatNumber(fromCelsius(item.c, 'k'))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
