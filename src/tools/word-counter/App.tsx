import { useMemo, useState } from 'react';
import { Button, CopyButton, DownloadButton, Panel, Result, TextArea } from '../../components/ui';
import { formatNumber } from '../../lib/utils';
import { downloadText } from '../../lib/utils';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'than', 'that', 'this', 'these', 'those', 'of',
  'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been',
  'it', 'its', 'i', 'you', 'he', 'she', 'we', 'they', 'not', 'no', 'so', 'do', 'does', 'did', 'has',
  'have', 'had', 'will', 'would', 'can', 'could', 'should', 'about', 'into', 'over', 'after', 'also',
]);

export default function WordCounter() {
  const [text, setText] = useState('');

  const stats = useMemo(() => {
    const words = text.trim() ? text.trim().split(/\s+/) : [];
    const characters = text.length;
    const charactersNoSpaces = text.replace(/\s/g, '').length;
    const sentences = text.split(/[.!?]+/).filter((part) => part.trim().length > 0).length;
    const paragraphs = text.split(/\n{2,}/).filter((part) => part.trim().length > 0).length;
    const lines = text ? text.split('\n').length : 0;
    const readingSeconds = Math.round((words.length / 200) * 60);
    const speakingSeconds = Math.round((words.length / 130) * 60);
    const longest = words.reduce((longestWord, word) => (word.length > longestWord.length ? word : longestWord), '');

    const counts = new Map<string, number>();
    for (const raw of words) {
      const word = raw.toLowerCase().replace(/[^a-z0-9'-]/g, '');
      if (word.length < 3 || STOP_WORDS.has(word)) continue;
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
    const keywords = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

    return {
      words: words.length,
      characters,
      charactersNoSpaces,
      sentences,
      paragraphs,
      lines,
      readingSeconds,
      speakingSeconds,
      longest,
      keywords,
    };
  }, [text]);

  const time = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  };

  return (
    <div className="space-y-4">
      <Panel
        title="Your text"
        actions={
          <>
            <CopyButton value={text} size="sm" />
            <DownloadButton
              size="sm"
              label="Save"
              onClick={() => downloadText('toolatlas-text.txt', text)}
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => setText('')}>
              Clear
            </Button>
          </>
        }
      >
        <TextArea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Start typing or paste your text — the counts update as you go."
          className="min-h-56"
          aria-label="Text to analyse"
        />

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Result label="Words" value={formatNumber(stats.words, 0)} />
          <Result label="Characters" value={formatNumber(stats.characters, 0)} hint={`${formatNumber(stats.charactersNoSpaces, 0)} without spaces`} />
          <Result label="Sentences" value={formatNumber(stats.sentences, 0)} />
          <Result label="Paragraphs" value={formatNumber(stats.paragraphs, 0)} />
        </div>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2">
        <Panel title="Reading & speaking">
          <dl className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted">Reading time</dt>
              <dd className="font-semibold text-fg">{time(stats.readingSeconds)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted">Speaking time</dt>
              <dd className="font-semibold text-fg">{time(stats.speakingSeconds)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted">Lines</dt>
              <dd className="font-semibold text-fg">{formatNumber(stats.lines, 0)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted">Longest word</dt>
              <dd className="max-w-40 truncate font-mono text-fg">{stats.longest || '—'}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted">Based on 200 words per minute reading and 130 speaking.</p>
        </Panel>

        <Panel title="Most used words" description="Common words are skipped.">
          {stats.keywords.length === 0 ? (
            <p className="text-sm text-muted">Add a few sentences to see the keyword mix.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {stats.keywords.map(([word, count]) => (
                <span key={word} className="rounded-full border border-line bg-raised/60 px-3 py-1 text-xs text-fg">
                  {word} <span className="text-muted">×{count}</span>
                </span>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
