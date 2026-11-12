import { useCallback, useEffect, useState } from 'react';
import { Button, CopyButton, Field, Input, Panel, ProgressBar, Toggle } from '../../components/ui';
import { clampNumber } from '../shared';

const SETS = {
  lower: 'abcdefghijkmnopqrstuvwxyz',
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  digits: '23456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?/',
};

const AMBIGUOUS = /[Il1O0o]/g;

function randomInts(length: number): Uint32Array {
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return values;
}

export default function PasswordGenerator() {
  const [length, setLength] = useState(20);
  const [options, setOptions] = useState({
    lower: true,
    upper: true,
    digits: true,
    symbols: true,
    avoidAmbiguous: true,
  });
  const [password, setPassword] = useState('');

  const generate = useCallback(() => {
    const selected = (Object.keys(SETS) as Array<keyof typeof SETS>)
      .filter((key) => options[key])
      .map((key) => SETS[key]);
    if (selected.length === 0) {
      setPassword('');
      return;
    }

    let alphabet = selected.join('');
    if (options.avoidAmbiguous) alphabet = alphabet.replace(AMBIGUOUS, '');
    if (!alphabet) alphabet = selected.join('');

    const chars: string[] = [];
    const random = randomInts(length * 2);
    let cursor = 0;

    // Guarantee at least one character from every selected set.
    for (const set of selected) {
      const cleaned = options.avoidAmbiguous ? set.replace(AMBIGUOUS, '') || set : set;
      chars.push(cleaned[random[cursor++] % cleaned.length]);
    }

    while (chars.length < length) {
      chars.push(alphabet[random[cursor++ % random.length] % alphabet.length]);
    }

    // Fisher–Yates with cryptographic randomness for the final order.
    const order = randomInts(chars.length);
    for (let i = chars.length - 1; i > 0; i -= 1) {
      const j = order[i] % (i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }

    setPassword(chars.slice(0, length).join(''));
  }, [length, options]);

  useEffect(() => {
    generate();
  }, [generate]);

  const alphabetSize = (Object.keys(SETS) as Array<keyof typeof SETS>)
    .filter((key) => options[key])
    .reduce((total, key) => total + SETS[key].length, 0);
  const entropy = Math.round(length * Math.log2(Math.max(2, alphabetSize)));
  const strength =
    entropy >= 100 ? { label: 'Excellent', tone: 'text-emerald-600 dark:text-emerald-400' } :
    entropy >= 70 ? { label: 'Strong', tone: 'text-emerald-600 dark:text-emerald-400' } :
    entropy >= 50 ? { label: 'Good', tone: 'text-amber-600 dark:text-amber-400' } :
    { label: 'Weak', tone: 'text-rose-500' };

  return (
    <div className="space-y-4">
      <Panel title="Your password">
        <div className="rounded-xl border border-line bg-raised/50 p-4">
          <p className="break-all font-mono text-lg leading-relaxed text-fg">
            {password || 'Select at least one character set.'}
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" onClick={generate}>
            Generate new
          </Button>
          <CopyButton value={password} />
          <span className={`ml-auto self-center text-xs font-semibold ${strength.tone}`}>
            {strength.label} · {entropy} bits
          </span>
        </div>
        <div className="mt-3">
          <ProgressBar value={clampNumber((entropy / 128) * 100, 0, 100)} />
        </div>
      </Panel>

      <Panel title="Options">
        <Field label={`Length — ${length} characters`}>
          <input
            type="range"
            min={8}
            max={64}
            value={length}
            onChange={(event) => setLength(Number(event.target.value))}
            className="w-full"
          />
        </Field>
        <div className="mt-2 flex justify-between text-[11px] text-muted">
          <span>8</span>
          <span>32</span>
          <span>64</span>
        </div>

        <div className="mt-4">
          <Field label="Custom length">
            <Input
              type="number"
              min={8}
              max={64}
              value={length}
              onChange={(event) => setLength(clampNumber(Number(event.target.value) || 8, 8, 64))}
              className="max-w-28"
            />
          </Field>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {(
            [
              ['lower', 'Lowercase (a–z)'],
              ['upper', 'Uppercase (A–Z)'],
              ['digits', 'Numbers (0–9)'],
              ['symbols', 'Symbols (!@#$…)'],
              ['avoidAmbiguous', 'Avoid look-alikes (Il1O0)'],
            ] as const
          ).map(([key, label]) => (
            <Toggle
              key={key}
              checked={options[key]}
              onChange={(checked) => setOptions((current) => ({ ...current, [key]: checked }))}
              label={label}
            />
          ))}
        </div>
      </Panel>

      <Panel title="Keep it safe">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Generated locally with the Web Crypto API — nothing is transmitted or logged.</li>
          <li>Use a password manager; you should never need to memorise a password like this.</li>
          <li>Never reuse a password across sites, and enable two-factor authentication where possible.</li>
        </ul>
      </Panel>
    </div>
  );
}
