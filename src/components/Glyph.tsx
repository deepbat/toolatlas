import type { ToolMeta } from '../lib/types';
import { glyphFor } from '../lib/glyphs';
import { cn, tint } from '../lib/utils';

/**
 * Pictorial glyph chip: the app's emoji picture on a softly tinted, rounded
 * tile. Used anywhere a tool or category is listed so every tool is
 * recognisable before its label is read.
 */
export function Glyph({
  emoji,
  accent,
  className,
  emojiClassName = 'text-[20px]',
}: {
  emoji: string;
  accent?: string;
  className?: string;
  emojiClassName?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-xl border border-line/70',
        className
      )}
      style={accent ? { backgroundColor: tint(accent, 0.16) } : undefined}
    >
      <span className={cn('leading-none', emojiClassName)} style={{ filter: 'drop-shadow(0 1px 1px rgb(0 0 0 / 0.35))' }}>
        {emoji}
      </span>
    </span>
  );
}

export function ToolGlyph({
  tool,
  accent,
  className,
  emojiClassName,
}: {
  tool: ToolMeta;
  accent?: string;
  className?: string;
  emojiClassName?: string;
}) {
  return <Glyph emoji={glyphFor(tool)} accent={accent} className={className} emojiClassName={emojiClassName} />;
}
