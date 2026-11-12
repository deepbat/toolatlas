import {
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Check, Copy, Download, Upload, X } from 'lucide-react';
import { cn, copyText } from '../lib/utils';
import { Icon } from './Icon';

/* ------------------------------------------------------------------ layout */

export function Panel({
  children,
  className,
  title,
  description,
  actions,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className={cn('rounded-2xl border border-line bg-surface p-5 shadow-soft sm:p-6', className)}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-base font-semibold tracking-tight text-fg">{title}</h2>}
            {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-xs font-semibold uppercase tracking-wider text-muted">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Grid({ children, cols = 2, className }: { children: ReactNode; cols?: 1 | 2 | 3 | 4; className?: string }) {
  const map = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-2 lg:grid-cols-4',
  } as const;
  return <div className={cn('grid gap-4', map[cols], className)}>{children}</div>;
}

/* ------------------------------------------------------------------ inputs */

const inputBase =
  'w-full rounded-xl border border-line bg-raised/60 px-3.5 py-2.5 text-sm text-fg shadow-sm outline-none transition placeholder:text-muted/70 focus:border-accent/70 focus:bg-surface focus:ring-4 focus:ring-accent/10 disabled:cursor-not-allowed disabled:opacity-60';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputBase, className)} {...props} />;
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputBase, 'min-h-28 resize-y font-mono text-[13px] leading-relaxed', className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(inputBase, 'appearance-none pr-10', className)} {...props}>
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
      >
        <path d="m5 8 5 5 5-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
}) {
  const variants = {
    primary:
      'bg-accent text-white shadow-soft hover:brightness-110 active:brightness-95 focus-visible:ring-accent/40',
    secondary:
      'border border-line bg-surface text-fg hover:border-accent/40 hover:bg-raised focus-visible:ring-accent/30',
    ghost: 'text-muted hover:bg-raised hover:text-fg focus-visible:ring-accent/30',
    danger: 'bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 dark:text-rose-300 focus-visible:ring-rose-400/40',
  } as const;
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2.5 text-sm',
  } as const;
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition focus:outline-none focus-visible:ring-4 disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function CopyButton({
  value,
  label = 'Copy',
  className,
  size = 'md',
}: {
  value: string;
  label?: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size={size}
      className={className}
      onClick={async () => {
        const ok = await copyText(value);
        if (ok) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }
      }}
      aria-live="polite"
    >
      {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
      {copied ? 'Copied' : label}
    </Button>
  );
}

export function DownloadButton({
  onClick,
  label = 'Download',
  className,
  size = 'md',
}: {
  onClick: () => void;
  label?: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <Button type="button" variant="secondary" size={size} className={className} onClick={onClick}>
      <Download className="h-4 w-4" />
      {label}
    </Button>
  );
}

/* ------------------------------------------------------------------ display */

export function Result({
  label,
  value,
  hint,
  mono,
  size = 'md',
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  mono?: boolean;
  size?: 'md' | 'lg';
}) {
  return (
    <div className="rounded-xl border border-line bg-raised/50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p
        className={cn(
          'mt-1 font-semibold tracking-tight text-fg',
          mono && 'font-mono',
          size === 'lg' ? 'text-3xl sm:text-4xl' : 'text-xl'
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: ReactNode; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3 shadow-soft">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tracking-tight text-fg">{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Badge({
  children,
  tone = 'default',
}: {
  children: ReactNode;
  tone?: 'default' | 'accent' | 'success' | 'warning' | 'danger';
}) {
  const tones = {
    default: 'border-line bg-raised text-muted',
    accent: 'border-accent/30 bg-accent/10 text-accent',
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
    danger: 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}

export function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' | 'success' }) {
  const tones = {
    info: 'border-accent/25 bg-accent-soft/60 text-fg/80',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  } as const;
  return <div className={cn('rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed', tones[tone])}>{children}</div>;
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: Array<{ id: T; label: ReactNode }>;
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('inline-flex flex-wrap gap-1 rounded-xl border border-line bg-raised/60 p-1', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
            value === tab.id
              ? 'bg-surface text-fg shadow-sm'
              : 'text-muted hover:text-fg'
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-line bg-surface px-3.5 py-2.5">
      <span>
        <span className="block text-sm font-medium text-fg">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
      <span
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition',
          checked ? 'bg-accent' : 'bg-line'
        )}
      >
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
            checked ? 'left-[22px]' : 'left-0.5'
          )}
        />
      </span>
    </label>
  );
}

export function ProgressBar({ value, max = 100, className }: { value: number; max?: number; className?: string }) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-line', className)}>
      <div
        className="h-full rounded-full bg-[linear-gradient(90deg,rgb(var(--accent)),#22d3ee)] transition-all"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface/60 px-6 py-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-raised text-muted">
        <Icon name={icon} className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-fg">{title}</h3>
      {description && <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Dropzone({
  onFiles,
  accept,
  multiple = true,
  title = 'Drop files here',
  hint = 'or click to browse — files never leave your device',
  className,
}: {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  title?: string;
  hint?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const files = Array.from(event.dataTransfer.files);
        if (files.length) onFiles(files);
      }}
      className={cn(
        'rounded-2xl border-2 border-dashed p-8 text-center transition',
        over ? 'border-accent bg-accent/5' : 'border-line bg-raised/40',
        className
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length) onFiles(files);
          event.target.value = '';
        }}
      />
      <button type="button" onClick={() => inputRef.current?.click()} className="group block w-full">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-surface text-accent shadow-soft transition group-hover:scale-105">
          <Upload className="h-5 w-5" />
        </span>
        <span className="mt-3 block text-sm font-semibold text-fg">{title}</span>
        <span className="mt-0.5 block text-xs text-muted">{hint}</span>
      </button>
    </div>
  );
}

export function FileRow({
  name,
  meta,
  onRemove,
  icon = 'FileText',
}: {
  name: string;
  meta?: ReactNode;
  onRemove?: () => void;
  icon?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-raised text-accent">
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-fg">{name}</p>
        {meta && <p className="truncate text-xs text-muted">{meta}</p>}
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="rounded-lg p-1.5 text-muted transition hover:bg-raised hover:text-rose-500"
          aria-label={`Remove ${name}`}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
