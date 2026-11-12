import { useState } from 'react';
import { Button, CopyButton, Panel, TextArea } from '../../components/ui';

function words(value: string): string[] {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
}

const TRANSFORMS: Array<{ id: string; label: string; hint: string; run: (value: string) => string }> = [
  { id: 'upper', label: 'UPPER CASE', hint: 'Everything shouted', run: (value) => value.toUpperCase() },
  { id: 'lower', label: 'lower case', hint: 'Quiet and calm', run: (value) => value.toLowerCase() },
  {
    id: 'sentence',
    label: 'Sentence case',
    hint: 'First letter of each sentence',
    run: (value) =>
      value
        .toLowerCase()
        .replace(/(^\s*\w|[.!?]\s+\w)/g, (match) => match.toUpperCase()),
  },
  {
    id: 'title',
    label: 'Title Case',
    hint: 'Capitalise every word',
    run: (value) =>
      value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()),
  },
  {
    id: 'camel',
    label: 'camelCase',
    hint: 'For variables',
    run: (value) =>
      words(value)
        .map((word, index) =>
          index === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        )
        .join(''),
  },
  {
    id: 'pascal',
    label: 'PascalCase',
    hint: 'For components',
    run: (value) =>
      words(value)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(''),
  },
  {
    id: 'snake',
    label: 'snake_case',
    hint: 'For database keys',
    run: (value) => words(value).map((word) => word.toLowerCase()).join('_'),
  },
  {
    id: 'kebab',
    label: 'kebab-case',
    hint: 'For URLs and files',
    run: (value) => words(value).map((word) => word.toLowerCase()).join('-'),
  },
  {
    id: 'slug',
    label: 'URL slug',
    hint: 'ASCII, hyphenated',
    run: (value) =>
      value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
  },
  {
    id: 'alternate',
    label: 'aLtErNaTiNg',
    hint: 'Mild chaos',
    run: (value) =>
      value
        .split('')
        .map((char, index) => (index % 2 === 0 ? char.toLowerCase() : char.toUpperCase()))
        .join(''),
  },
];

export default function CaseConverter() {
  const [input, setInput] = useState('ToolAtlas makes small tools feel effortless.');
  const [output, setOutput] = useState(input);
  const [active, setActive] = useState('sentence');

  const apply = (id: string, run: (value: string) => string) => {
    setActive(id);
    setOutput(run(input));
  };

  return (
    <div className="space-y-4">
      <Panel title="Input text">
        <TextArea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Paste the text you want to transform…"
          className="min-h-36"
          aria-label="Input text"
        />
      </Panel>

      <Panel title="Choose a style" description="The result appears instantly below.">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {TRANSFORMS.map((transform) => (
            <button
              key={transform.id}
              type="button"
              onClick={() => apply(transform.id, transform.run)}
              className={[
                'rounded-xl border px-3 py-2.5 text-left transition',
                active === transform.id
                  ? 'border-accent/40 bg-accent/10'
                  : 'border-line bg-surface hover:border-accent/30 hover:bg-raised/60',
              ].join(' ')}
            >
              <span className="block text-xs font-semibold text-fg">{transform.label}</span>
              <span className="mt-0.5 block text-[10px] text-muted">{transform.hint}</span>
            </button>
          ))}
        </div>
      </Panel>

      <Panel
        title="Result"
        actions={<CopyButton value={output} size="sm" />}
      >
        <TextArea value={output} readOnly className="min-h-36 bg-raised/40" aria-label="Converted text" />
        <div className="mt-2 flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={() => apply(active, () => input)}>
            Reset
          </Button>
        </div>
      </Panel>
    </div>
  );
}
