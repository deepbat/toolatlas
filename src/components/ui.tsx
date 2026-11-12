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
    <section
      className={cn(
        'relative border border-line bg-surface/90 p-5 backdrop-blur-sm sm:p-6',
        className
      )}
    >
      {(title || actions) && (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
          <div className="min-w-0">
            {title && <h2 className="label-strong text-accent">{title}</h2>}
            {description && (
              <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted">{description}</p>
            )}
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
    <div className={cn('space-y-2', className)}>
      <label htmlFor={htmlFor} className="label block text-muted">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] leading-relaxed text-muted/80">{hint}</p>}
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
  'w-full border border-line bg-raised/70 px-3.5 py-2.5 text-sm text-fg outline-none transition placeholder:text-muted/60 focus:border-accent focus:bg-raised focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputBase, className)} {...props} />;
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(inputBase, 'min-h-28 resize-y font-mono text-[13px] leading-relaxed', className)}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(inputBase, 'appearance-none pr-9', className)} {...props}>
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
      >
        <path d="m5 8 5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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
      'bg-accent text-on-accent shadow-soft hover:brightness-110 active:brightness-95 focus-visible:outline-accent',
    secondary:
      'border border-line text-fg hover:border-accent hover:text-accent focus-visible:outline-accent',
    ghost: 'text-muted hover:bg-raised hover:text-accent focus-visible:outline-accent',
    danger: 'border border-danger/40 text-danger hover:bg-danger/10 focus-visible:outline-danger',
  } as const;
  const sizes = {
    sm: 'px-3 py-1.5 text-[10px]',
    md: 'px-4 py-2.5 text-[11px]',
  } as const;
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 border border-transparent font-mono font-semibold uppercase tracking-label transition focus:outline-none focus-visible:outline focus-visible:outline-2 disabled:pointer-events-none disabled:opacity-40',
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
      {copied ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5" />}
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
      <Download className="h-3.5 w-3.5" />
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
    <div className="border border-line bg-raised/50 px-4 py-3">
      <p className="label text-muted">{label}</p>
      <p
        className={cn(
          'mt-1.5 font-display font-medium tracking-tight text-fg',
          mono && 'font-mono',
          size === 'lg' ? 'text-3xl sm:text-4xl' : 'text-xl'
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] leading-relaxed text-muted">{hint}</p>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: ReactNode; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="border border-line bg-surface px-4 py-3">
      <p className="label text-muted">{label}</p>
      <p className="mt-1 font-display text-lg font-medium tracking-tight text-fg">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
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
    default: 'border-line text-muted',
    accent: 'border-accent/40 text-accent',
    success: 'border-accent-2/40 text-accent-2',
    warning: 'border-warn/40 text-warn',
    danger: 'border-danger/40 text-danger',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 border px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-label',
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}

export function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' | 'success' }) {
  const tones = {
    info: 'border-l-accent text-muted',
    warning: 'border-l-warn text-muted',
    success: 'border-l-accent-2 text-muted',
  } as const;
  return (
    <div className={cn('border border-line border-l-2 bg-raised/40 px-4 py-3 text-xs leading-relaxed', tones[tone])}>
      {children}
    </div>
  );
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
    <div className={cn('inline-flex flex-wrap border border-line bg-raised/50 p-1', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            'px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-label transition',
            value === tab.id ? 'bg-accent text-on-accent' : 'text-muted hover:text-fg'
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
    <label className="flex cursor-pointer items-center justify-between gap-4 border border-line bg-raised/40 px-3.5 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm text-fg">{label}</span>
        {description && <span className="mt-0.5 block text-[11px] text-muted">{description}</span>}
      </span>
      <span className={cn('relative h-5 w-9 shrink-0 transition', checked ? 'bg-accent' : 'bg-line')}>
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 bg-on-accent transition-all',
            checked ? 'left-[18px]' : 'left-0.5'
          )}
        />
      </span>
    </label>
  );
}

export function ProgressBar({ value, max = 100, className }: { value: number; max?: number; className?: string }) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={cn('h-1.5 w-full overflow-hidden bg-line', className)}>
      <div className="h-full bg-accent transition-all" style={{ width: `${percent}%` }} />
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
    <div className="border border-dashed border-line bg-surface/50 px-6 py-14 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center border border-line bg-raised text-muted">
        <Icon name={icon} className="h-5 w-5" />
      </div>
      <h3 className="mt-4 font-display text-sm font-semibold tracking-tight text-fg">{title}</h3>
      {description && <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
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
        'border border-dashed p-8 text-center transition',
        over ? 'border-accent bg-accent/5' : 'border-line bg-raised/30',
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
        <span className="mx-auto flex h-11 w-11 items-center justify-center border border-line bg-surface text-accent transition group-hover:border-accent">
          <Upload className="h-4 w-4" />
        </span>
        <span className="mt-3 block font-mono text-[11px] font-semibold uppercase tracking-label text-fg">
          {title}
        </span>
        <span className="mt-1 block text-[11px] text-muted">{hint}</span>
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
    <div className="flex items-center gap-3 border border-line bg-surface px-3 py-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-line bg-raised text-accent">
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-fg">{name}</p>
        {meta && <p className="truncate text-[11px] text-muted">{meta}</p>}
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 text-muted transition hover:text-danger"
          aria-label={`Remove ${name}`}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
