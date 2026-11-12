import { useMemo, useState } from 'react';
import { Button, CopyButton, Field, Panel } from '../../components/ui';
import { hexToRgb, normalizeHex, rgbToCmyk, rgbToHex, rgbToHsl, rgbToHsv, type RGB } from '../../lib/color';

export default function ColorConverter() {
  const [value, setValue] = useState('#7c6cff');
  const [lastValid, setLastValid] = useState('#7c6cff');

  const rgb = useMemo(() => hexToRgb(value) ?? hexToRgb(lastValid), [lastValid, value]);
  const valid = Boolean(normalizeHex(value));

  if (!rgb) return null;

  const hex = rgbToHex(rgb);
  const hsl = rgbToHsl(rgb);
  const hsv = rgbToHsv(rgb);
  const cmyk = rgbToCmyk(rgb);

  const update = (next: string) => {
    setValue(next);
    if (normalizeHex(next)) setLastValid(normalizeHex(next) as string);
  };

  const rows = [
    { label: 'HEX', value: hex.toUpperCase() },
    { label: 'RGB', value: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` },
    { label: 'HSL', value: `hsl(${Math.round(hsl.h)}, ${Math.round(hsl.s)}%, ${Math.round(hsl.l)}%)` },
    { label: 'HSV', value: `hsv(${Math.round(hsv.h)}, ${Math.round(hsv.s)}%, ${Math.round(hsv.v)}%)` },
    {
      label: 'CMYK',
      value: `cmyk(${Math.round(cmyk.c)}%, ${Math.round(cmyk.m)}%, ${Math.round(cmyk.y)}%, ${Math.round(cmyk.k)}%)`,
    },
  ];

  return (
    <div className="space-y-4">
      <Panel title="Pick a colour">
        <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
          <div
            className="h-32 rounded-xl border border-line shadow-inner"
            style={{ backgroundColor: hex }}
            aria-label={`Preview of ${hex}`}
          />
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Hex value" className="w-40">
                <input
                  value={value}
                  onChange={(event) => update(event.target.value)}
                  className="h-11 w-full rounded-xl border border-line bg-raised/60 px-3 font-mono text-sm uppercase text-fg outline-none focus:border-accent/70"
                  aria-label="Hex colour"
                  spellCheck={false}
                />
              </Field>
              <Field label="Colour picker" className="w-24">
                <input
                  type="color"
                  value={hex}
                  onChange={(event) => update(event.target.value)}
                  className="h-11 w-full cursor-pointer rounded-xl border border-line bg-surface p-1"
                  aria-label="Colour picker"
                />
              </Field>
              <Button
                type="button"
                variant="secondary"
                className="mb-0.5"
                onClick={() => {
                  const random = Array.from(crypto.getRandomValues(new Uint8Array(3)), (byte) =>
                    byte.toString(16).padStart(2, '0')
                  ).join('');
                  update(`#${random}`);
                }}
              >
                Random
              </Button>
            </div>
            {!valid && (
              <p className="text-xs text-rose-500">
                “{value}” is not a valid hex colour. Showing the last valid colour.
              </p>
            )}
          </div>
        </div>
      </Panel>

      <Panel title="Conversions">
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-raised/40 px-3.5 py-2.5"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{row.label}</span>
              <div className="flex items-center gap-2">
                <code className="font-mono text-sm text-fg">{row.value}</code>
                <CopyButton value={row.value} size="sm" label="" />
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Channels">
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              { label: 'Red', value: rgb.r, color: '#ef4444' },
              { label: 'Green', value: rgb.g, color: '#22c55e' },
              { label: 'Blue', value: rgb.b, color: '#3b82f6' },
            ] as Array<{ label: string; value: number; color: string }>
          ).map((channel: { label: string; value: number; color: string }) => (
            <div key={channel.label} className="rounded-xl border border-line bg-surface p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">{channel.label}</span>
                <span className="font-mono text-fg">{channel.value}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(channel.value / 255) * 100}%`, backgroundColor: channel.color }}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          Alpha is not included: these are opaque colours. Add it in CSS with{' '}
          <code className="font-mono">rgb(… / 0.5)</code> or an eight-digit hex.
        </p>
      </Panel>
    </div>
  );
}
