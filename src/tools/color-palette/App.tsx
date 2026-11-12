import { useMemo, useState } from 'react';
import { Button, CopyButton, Field, Panel } from '../../components/ui';
import { hslToRgb, hexToRgb, readableTextColor, rgbToHex, rgbToHsl } from '../../lib/color';
import { copyText } from '../../lib/utils';

type Harmony = 'analogous' | 'complementary' | 'triadic' | 'tetradic' | 'monochrome';

const HARMONIES: Array<{ id: Harmony; label: string }> = [
  { id: 'analogous', label: 'Analogous' },
  { id: 'complementary', label: 'Complementary' },
  { id: 'triadic', label: 'Triadic' },
  { id: 'tetradic', label: 'Tetradic' },
  { id: 'monochrome', label: 'Monochrome' },
];

function buildPalette(base: string, harmony: Harmony): string[] {
  const rgb = hexToRgb(base);
  if (!rgb) return [];
  const { h, s, l } = rgbToHsl(rgb);
  const make = (hue: number, saturation: number, lightness: number) =>
    rgbToHex(hslToRgb({ h: hue, s: saturation, l: lightness }));

  switch (harmony) {
    case 'complementary':
      return [
        make(h, s, Math.max(12, l - 22)),
        make(h, s, l),
        make(h, s, Math.min(92, l + 18)),
        make(h + 180, s, l),
        make(h + 180, s, Math.max(12, l - 20)),
      ];
    case 'triadic':
      return [make(h, s, l), make(h + 120, s, l), make(h + 240, s, l), make(h + 120, Math.max(20, s - 25), Math.min(90, l + 22)), make(h + 240, Math.max(20, s - 25), Math.max(15, l - 18))];
    case 'tetradic':
      return [make(h, s, l), make(h + 90, s, l), make(h + 180, s, l), make(h + 270, s, l), make(h, s, Math.min(92, l + 22))];
    case 'monochrome':
      return [20, 35, 50, 65, 80].map((lightness) => make(h, s, lightness));
    default:
      return [make(h - 40, s, l), make(h - 20, s, l), make(h, s, l), make(h + 20, s, l), make(h + 40, s, l)];
  }
}

export default function ColorPalette() {
  const [base, setBase] = useState('#7c6cff');
  const [harmony, setHarmony] = useState<Harmony>('analogous');
  const [copied, setCopied] = useState('');

  const palette = useMemo(() => buildPalette(base, harmony), [base, harmony]);
  const css = palette.map((color, index) => `  --palette-${index + 1}: ${color};`).join('\n');

  const copy = async (value: string, label: string) => {
    if (await copyText(value)) {
      setCopied(label);
      setTimeout(() => setCopied(''), 1400);
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="Start with a colour">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Base colour" className="w-40">
            <input
              type="color"
              value={base}
              onChange={(event) => setBase(event.target.value)}
              className="h-11 w-full cursor-pointer rounded-xl border border-line bg-surface p-1"
              aria-label="Base colour"
            />
          </Field>
          <Field label="Hex value" className="w-36">
            <input
              value={base}
              onChange={(event) => setBase(event.target.value)}
              className="h-11 w-full rounded-xl border border-line bg-raised/60 px-3 font-mono text-sm uppercase text-fg outline-none focus:border-accent/70"
              aria-label="Hex value"
            />
          </Field>
          <Button
            type="button"
            variant="secondary"
            className="mb-0.5"
            onClick={() => {
              const random = Array.from(crypto.getRandomValues(new Uint8Array(3)), (value) =>
                value.toString(16).padStart(2, '0')
              ).join('');
              setBase(`#${random}`);
            }}
          >
            Random colour
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {HARMONIES.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setHarmony(option.id)}
              className={[
                'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                harmony === option.id
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-line text-muted hover:border-accent/30 hover:text-fg',
              ].join(' ')}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Panel>

      <Panel
        title="Palette"
        description={copied ? `Copied ${copied}` : 'Click a swatch to copy its hex value.'}
        actions={<CopyButton value={css} label="Copy CSS" size="sm" />}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {palette.map((color, index) => (
            <button
              key={`${color}-${index}`}
              type="button"
              onClick={() => copy(color, color)}
              className="group overflow-hidden rounded-xl border border-line text-left transition hover:-translate-y-0.5 hover:shadow-lift"
              style={{ backgroundColor: color }}
            >
              <span className="flex h-24 items-end p-2" style={{ color: readableTextColor(color) }}>
                <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
                  {index === 2 ? 'base' : `shade ${index + 1}`}
                </span>
              </span>
              <span
                className="flex items-center justify-between px-2.5 py-2 font-mono text-[11px] uppercase"
                style={{ backgroundColor: color, color: readableTextColor(color) }}
              >
                {color}
                <span className="opacity-0 transition group-hover:opacity-70">copy</span>
              </span>
            </button>
          ))}
        </div>

        <pre className="mt-4 overflow-x-auto rounded-xl bg-[#0f1117] p-3 font-mono text-[11px] leading-relaxed text-slate-300">
          {`:root {\n${css}\n}`}
        </pre>
      </Panel>

      <Panel title="How harmonies work">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li><span className="font-medium text-fg">Analogous</span> — neighbours on the colour wheel; calm and cohesive.</li>
          <li><span className="font-medium text-fg">Complementary</span> — opposite hues; high contrast and energy.</li>
          <li><span className="font-medium text-fg">Triadic</span> — three evenly spaced hues; vivid but balanced.</li>
          <li><span className="font-medium text-fg">Tetradic</span> — two complementary pairs; rich, needs a dominant colour.</li>
          <li><span className="font-medium text-fg">Monochrome</span> — one hue across lightness steps; always safe.</li>
        </ul>
      </Panel>
    </div>
  );
}
