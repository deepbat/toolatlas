import type { ReactNode } from 'react';
import {
  Download,
  Highlighter,
  Link2,
  Minus,
  Plus,
  Redo2,
  Search,
  Signature,
  Strikethrough,
  Type,
  Underline,
  Undo2,
  Image,
  PenLine,
  Pencil,
  Eraser,
  SquareDashed,
  MousePointer2,
  TextCursorInput,
  Ban,
  Shapes,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { ShapeKind } from './model';

export type ToolId =
  | 'select'
  | 'edit'
  | 'text'
  | 'highlight'
  | 'underline'
  | 'strike'
  | 'whiteout'
  | 'redact'
  | 'pen'
  | 'shape'
  | 'image'
  | 'sign'
  | 'link'
  | 'find';

export const TOOL_DEFS: { id: ToolId; label: string; icon: ReactNode }[] = [
  { id: 'select', label: 'Select', icon: <MousePointer2 className="h-3.5 w-3.5" /> },
  { id: 'edit', label: 'Edit text', icon: <TextCursorInput className="h-3.5 w-3.5" /> },
  { id: 'text', label: 'Add text', icon: <Type className="h-3.5 w-3.5" /> },
  { id: 'highlight', label: 'Highlight', icon: <Highlighter className="h-3.5 w-3.5" /> },
  { id: 'underline', label: 'Underline', icon: <Underline className="h-3.5 w-3.5" /> },
  { id: 'strike', label: 'Strike', icon: <Strikethrough className="h-3.5 w-3.5" /> },
  { id: 'whiteout', label: 'Whiteout', icon: <Eraser className="h-3.5 w-3.5" /> },
  { id: 'redact', label: 'Redact', icon: <Ban className="h-3.5 w-3.5" /> },
  { id: 'pen', label: 'Draw', icon: <Pencil className="h-3.5 w-3.5" /> },
  { id: 'shape', label: 'Shape', icon: <Shapes className="h-3.5 w-3.5" /> },
  { id: 'image', label: 'Image', icon: <Image className="h-3.5 w-3.5" /> },
  { id: 'sign', label: 'Sign', icon: <Signature className="h-3.5 w-3.5" /> },
  { id: 'link', label: 'Link', icon: <Link2 className="h-3.5 w-3.5" /> },
  { id: 'find', label: 'Find', icon: <Search className="h-3.5 w-3.5" /> },
];

export function ToolButton({
  active,
  onClick,
  label,
  title,
  disabled,
  children,
  testId,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  title?: string;
  disabled?: boolean;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      title={title ?? label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 border px-2.5 py-2 font-mono text-[10px] font-semibold uppercase tracking-label transition disabled:pointer-events-none disabled:opacity-40',
        active
          ? 'border-accent bg-accent text-on-accent'
          : 'border-line text-muted hover:border-accent hover:text-accent'
      )}
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

export function IconBtn({
  onClick,
  label,
  disabled,
  children,
  testId,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center justify-center border border-line p-2 text-muted transition hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export { Minus, Plus, Undo2, Redo2, Download, SquareDashed, PenLine };
