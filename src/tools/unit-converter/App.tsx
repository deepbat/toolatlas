import { useMemo, useState } from 'react';
import { Button, Field, Grid, Input, Panel, Result, Select } from '../../components/ui';
import { formatNumber } from '../../lib/utils';
import { num, shortNumber } from '../shared';

interface Unit {
  label: string;
  factor: number;
}

interface Group {
  label: string;
  units: Record<string, Unit>;
  defaults: [string, string];
}

const GROUPS: Record<string, Group> = {
  length: {
    label: 'Length',
    defaults: ['m', 'ft'],
    units: {
      mm: { label: 'Millimetre (mm)', factor: 0.001 },
      cm: { label: 'Centimetre (cm)', factor: 0.01 },
      m: { label: 'Metre (m)', factor: 1 },
      km: { label: 'Kilometre (km)', factor: 1000 },
      in: { label: 'Inch (in)', factor: 0.0254 },
      ft: { label: 'Foot (ft)', factor: 0.3048 },
      yd: { label: 'Yard (yd)', factor: 0.9144 },
      mi: { label: 'Mile (mi)', factor: 1609.344 },
      nmi: { label: 'Nautical mile (nmi)', factor: 1852 },
    },
  },
  mass: {
    label: 'Mass',
    defaults: ['kg', 'lb'],
    units: {
      mg: { label: 'Milligram (mg)', factor: 0.000001 },
      g: { label: 'Gram (g)', factor: 0.001 },
      kg: { label: 'Kilogram (kg)', factor: 1 },
      t: { label: 'Tonne (t)', factor: 1000 },
      oz: { label: 'Ounce (oz)', factor: 0.028349523125 },
      lb: { label: 'Pound (lb)', factor: 0.45359237 },
      st: { label: 'Stone (st)', factor: 6.35029318 },
    },
  },
  area: {
    label: 'Area',
    defaults: ['m2', 'ft2'],
    units: {
      mm2: { label: 'Square millimetre (mm²)', factor: 0.000001 },
      cm2: { label: 'Square centimetre (cm²)', factor: 0.0001 },
      m2: { label: 'Square metre (m²)', factor: 1 },
      ha: { label: 'Hectare (ha)', factor: 10000 },
      km2: { label: 'Square kilometre (km²)', factor: 1000000 },
      in2: { label: 'Square inch (in²)', factor: 0.00064516 },
      ft2: { label: 'Square foot (ft²)', factor: 0.09290304 },
      yd2: { label: 'Square yard (yd²)', factor: 0.83612736 },
      acre: { label: 'Acre', factor: 4046.8564224 },
    },
  },
  volume: {
    label: 'Volume',
    defaults: ['l', 'gal'],
    units: {
      ml: { label: 'Millilitre (ml)', factor: 0.001 },
      l: { label: 'Litre (l)', factor: 1 },
      m3: { label: 'Cubic metre (m³)', factor: 1000 },
      tsp: { label: 'Teaspoon (US)', factor: 0.00492892159375 },
      tbsp: { label: 'Tablespoon (US)', factor: 0.01478676478125 },
      cup: { label: 'Cup (US)', factor: 0.2365882365 },
      pt: { label: 'Pint (US)', factor: 0.473176473 },
      gal: { label: 'Gallon (US)', factor: 3.785411784 },
      floz: { label: 'Fluid ounce (US)', factor: 0.0295735295625 },
    },
  },
  speed: {
    label: 'Speed',
    defaults: ['kmh', 'mph'],
    units: {
      ms: { label: 'Metre / second (m/s)', factor: 1 },
      kmh: { label: 'Kilometre / hour (km/h)', factor: 0.2777777778 },
      mph: { label: 'Mile / hour (mph)', factor: 0.44704 },
      kn: { label: 'Knot (kn)', factor: 0.5144444444 },
      fts: { label: 'Foot / second (ft/s)', factor: 0.3048 },
    },
  },
  data: {
    label: 'Digital storage',
    defaults: ['mb', 'mib'],
    units: {
      bit: { label: 'Bit (b)', factor: 0.125 },
      byte: { label: 'Byte (B)', factor: 1 },
      kb: { label: 'Kilobyte (kB)', factor: 1000 },
      mb: { label: 'Megabyte (MB)', factor: 1_000_000 },
      gb: { label: 'Gigabyte (GB)', factor: 1_000_000_000 },
      tb: { label: 'Terabyte (TB)', factor: 1_000_000_000_000 },
      kib: { label: 'Kibibyte (KiB)', factor: 1024 },
      mib: { label: 'Mebibyte (MiB)', factor: 1_048_576 },
      gib: { label: 'Gibibyte (GiB)', factor: 1_073_741_824 },
    },
  },
  time: {
    label: 'Time',
    defaults: ['h', 'min'],
    units: {
      ms: { label: 'Millisecond (ms)', factor: 0.001 },
      s: { label: 'Second (s)', factor: 1 },
      min: { label: 'Minute (min)', factor: 60 },
      h: { label: 'Hour (h)', factor: 3600 },
      d: { label: 'Day', factor: 86400 },
      wk: { label: 'Week', factor: 604800 },
    },
  },
};

export default function UnitConverter() {
  const [groupKey, setGroupKey] = useState('length');
  const group = GROUPS[groupKey];
  const [from, setFrom] = useState(group.defaults[0]);
  const [to, setTo] = useState(group.defaults[1]);
  const [value, setValue] = useState('1');

  const changeGroup = (key: string) => {
    setGroupKey(key);
    setFrom(GROUPS[key].defaults[0]);
    setTo(GROUPS[key].defaults[1]);
  };

  const result = useMemo(() => {
    const amount = num(value);
    const fromUnit = group.units[from];
    const toUnit = group.units[to];
    if (!fromUnit || !toUnit) return 0;
    return (amount * fromUnit.factor) / toUnit.factor;
  }, [group, from, to, value]);

  return (
    <div className="space-y-4">
      <Panel title="Convert anything measurable">
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(GROUPS).map(([key, item]) => (
            <button
              key={key}
              type="button"
              onClick={() => changeGroup(key)}
              className={[
                'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                groupKey === key
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-line text-muted hover:border-accent/30 hover:text-fg',
              ].join(' ')}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-5 grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <div className="space-y-1.5">
            <Field label="From">
              <Input
                type="number"
                inputMode="decimal"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                aria-label="Value to convert"
              />
            </Field>
            <Select value={from} onChange={(event) => setFrom(event.target.value)} aria-label="Source unit">
              {Object.entries(group.units).map(([key, unit]) => (
                <option key={key} value={key}>
                  {unit.label}
                </option>
              ))}
            </Select>
          </div>

          <Button
            type="button"
            variant="secondary"
            className="mb-1 h-10 w-full sm:w-10"
            onClick={() => {
              setFrom(to);
              setTo(from);
            }}
            aria-label="Swap units"
          >
            ⇄
          </Button>

          <div className="space-y-1.5">
            <Field label="To">
              <div className="flex h-[42px] items-center rounded-xl border border-line bg-raised/60 px-3.5 font-mono text-sm text-fg">
                {shortNumber(result)}
              </div>
            </Field>
            <Select value={to} onChange={(event) => setTo(event.target.value)} aria-label="Target unit">
              {Object.entries(group.units).map(([key, unit]) => (
                <option key={key} value={key}>
                  {unit.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="mt-5">
          <Result
            label="Converted value"
            size="lg"
            value={`${formatNumber(result, 6)} ${to}`}
            hint={`${formatNumber(num(value), 6)} ${from} = ${formatNumber(result, 6)} ${to}`}
          />
        </div>
      </Panel>

      <Panel title={`All ${group.label.toLowerCase()} units`} description="Equivalent values for your input.">
        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line">
              {Object.entries(group.units).map(([key, unit]) => {
                const converted = (num(value) * group.units[from].factor) / unit.factor;
                return (
                  <tr key={key} className={key === to ? 'bg-accent/5' : undefined}>
                    <td className="px-3 py-2 text-muted">{unit.label}</td>
                    <td className="px-3 py-2 text-right font-mono text-fg">{formatNumber(converted, 6)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
