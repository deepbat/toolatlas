import { useEffect, useMemo, useState } from 'react';
import { CopyButton, Panel, TextArea } from '../../components/ui';

const FLAGS = ['g', 'i', 'm', 's', 'u'] as const;
type Flag = (typeof FLAGS)[number];

interface Match {
  text: string;
  index: number;
  groups: string[];
}

export default function RegexTester() {
  const [pattern, setPattern] = useState('\\b[\\w.+-]+@[\\w-]+\\.[\\w.]+\\b');
  const [flags, setFlags] = useState<Record<Flag, boolean>>({ g: true, i: true, m: false, s: false, u: false });
  const [text, setText] = useState('Write to hello@toolatlas.dev or support@example.com for help.');

  const flagString = FLAGS.filter((flag) => flags[flag]).join('');

  const [result,setResult]=useState<{matches:Match[];error:string}>({matches:[],error:''});
  useEffect(()=>{
    if(!pattern){setResult({matches:[],error:''});return}
    const code=`onmessage=({data:{pattern,flags,text}})=>{try{const r=new RegExp(pattern,flags),matches=[];let m;while((m=r.exec(text))&&matches.length<500){matches.push({text:m[0],index:m.index,groups:m.slice(1)});if(!r.global)break;if(m[0]==='')r.lastIndex++}postMessage({matches,error:''})}catch(e){postMessage({matches:[],error:e.message})}}`;
    const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
    const worker=new Worker(url);const timeout=setTimeout(()=>{worker.terminate();setResult({matches:[],error:'Pattern took too long. Simplify it and try again.'})},800);
    worker.onmessage=e=>{clearTimeout(timeout);setResult(e.data);worker.terminate()};worker.postMessage({pattern,flags:flagString,text});
    return()=>{clearTimeout(timeout);worker.terminate();URL.revokeObjectURL(url)};
  },[flagString,pattern,text]);

  const highlighted = useMemo(() => {
    if (result.matches.length === 0) return [{ text, match: false }];
    const parts: Array<{ text: string; match: boolean }> = [];
    let cursor = 0;
    for (const match of result.matches) {
      if (match.index > cursor) parts.push({ text: text.slice(cursor, match.index), match: false });
      parts.push({ text: match.text, match: true });
      cursor = match.index + match.text.length;
    }
    if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
    return parts;
  }, [result.matches, text]);

  return (
    <div className="space-y-4">
      <Panel title="Pattern">
        <div className="flex overflow-hidden rounded-xl border border-line bg-raised/60 focus-within:border-accent/70">
          <span className="flex items-center px-3 text-sm text-muted">/</span>
          <input
            value={pattern}
            onChange={(event) => setPattern(event.target.value)}
            className="h-11 flex-1 bg-transparent font-mono text-sm text-fg outline-none"
            aria-label="Regular expression"
            spellCheck={false}
          />
          <span className="flex items-center px-3 font-mono text-sm text-muted">/{flagString}</span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {FLAGS.map((flag) => (
            <button
              key={flag}
              type="button"
              onClick={() => setFlags((current) => ({ ...current, [flag]: !current[flag] }))}
              className={[
                'h-7 w-7 rounded-md border font-mono text-xs font-semibold transition',
                flags[flag]
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-line text-muted hover:text-fg',
              ].join(' ')}
              aria-pressed={flags[flag]}
              title={{
                g: 'global',
                i: 'case-insensitive',
                m: 'multiline',
                s: 'dot matches newline',
                u: 'unicode',
              }[flag]}
            >
              {flag}
            </button>
          ))}
          <span className="ml-2 text-xs text-muted">
            {result.matches.length} {result.matches.length === 1 ? 'match' : 'matches'}
          </span>
        </div>

        {result.error && <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 font-mono text-xs text-rose-600 dark:text-rose-400">{result.error}</p>}
      </Panel>

      <Panel title="Test text">
        <TextArea
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="min-h-40"
          aria-label="Text to test"
          spellCheck={false}
        />
      </Panel>

      <Panel title="Highlighted result">
        <div className="whitespace-pre-wrap break-words rounded-xl border border-line bg-raised/40 p-3 text-sm leading-relaxed text-fg">
          {highlighted.map((part, index) =>
            part.match ? (
              <mark key={index} className="rounded bg-accent/25 px-0.5 text-fg">
                {part.text}
              </mark>
            ) : (
              <span key={index}>{part.text}</span>
            )
          )}
        </div>
      </Panel>

      {result.matches.length > 0 && (
        <Panel title="Matches" actions={<CopyButton value={JSON.stringify(result.matches, null, 2)} size="sm" />}>
          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {result.matches.map((match, index) => (
              <li key={`${match.index}-${index}`} className="rounded-xl border border-line bg-surface px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-sm text-fg">{match.text || '(empty)'}</span>
                  <span className="text-[11px] text-muted">index {match.index}</span>
                </div>
                {match.groups.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {match.groups.map((group, groupIndex) => (
                      <span key={groupIndex} className="rounded-md bg-raised px-1.5 py-0.5 font-mono text-[11px] text-muted">
                        ${groupIndex + 1}: {group ?? 'undefined'}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
