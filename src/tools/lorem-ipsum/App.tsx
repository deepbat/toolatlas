import { useMemo, useState } from 'react';
import { Button, CopyButton, Field, Grid, Input, Panel, TextArea, Toggle } from '../../components/ui';
import { downloadText } from '../../lib/utils';
import { num } from '../shared';

const WORDS =
  'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'.split(
    ' '
  );

function pickWord(): string {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

function makeSentence(): string {
  const length = 8 + Math.floor(Math.random() * 8);
  const words = Array.from({ length }, pickWord);
  const sentence = words.join(' ');
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

export default function LoremIpsum() {
  const [paragraphs, setParagraphs] = useState('3');
  const [sentences, setSentences] = useState('4');
  const [startWithLorem, setStartWithLorem] = useState(true);
  const [asHtml, setAsHtml] = useState(false);
  const [seed, setSeed] = useState(0);

  const output = useMemo(() => {
    const paragraphCount = Math.min(20, Math.max(1, Math.round(num(paragraphs, 3))));
    const sentenceCount = Math.min(20, Math.max(1, Math.round(num(sentences, 4))));

    const blocks = Array.from({ length: paragraphCount }, (_, paragraphIndex) => {
      const lines = Array.from({ length: sentenceCount }, (_, sentenceIndex) => {
        if (startWithLorem && paragraphIndex === 0 && sentenceIndex === 0) {
          return 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';
        }
        if (startWithLorem && paragraphIndex === 0 && sentenceIndex === 1) {
          return 'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';
        }
        return makeSentence();
      });
      return lines.join(' ');
    });

    return asHtml
      ? blocks.map((block) => `<p>${block}</p>`).join('\n\n')
      : blocks.join('\n\n');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paragraphs, sentences, startWithLorem, asHtml, seed]);

  return (
    <div className="space-y-4">
      <Panel title="Preferences">
        <Grid cols={3}>
          <Field label="Paragraphs">
            <Input type="number" min={1} max={20} value={paragraphs} onChange={(event) => setParagraphs(event.target.value)} />
          </Field>
          <Field label="Sentences each">
            <Input type="number" min={1} max={20} value={sentences} onChange={(event) => setSentences(event.target.value)} />
          </Field>
          <div className="flex flex-col justify-end gap-2">
            <Toggle checked={startWithLorem} onChange={setStartWithLorem} label="Start with “Lorem ipsum”" />
            <Toggle checked={asHtml} onChange={setAsHtml} label="Wrap in <p> tags" />
          </div>
        </Grid>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={() => setSeed((value) => value + 1)}>
            Generate again
          </Button>
          <CopyButton value={output} />
          <Button type="button" variant="secondary" onClick={() => downloadText('lorem-ipsum.txt', output)}>
            Download
          </Button>
        </div>
      </Panel>

      <Panel title="Placeholder text">
        <TextArea value={output} readOnly className="min-h-64 bg-raised/40" aria-label="Generated text" />
      </Panel>
    </div>
  );
}
