import React, { useId } from 'react';
import { AlertTriangle, Info, XCircle, type LucideIcon } from 'lucide-react';

/** Inline problem attached to a field: blocking error (red) or advisory warning (amber). */
export interface FieldProblem {
  severity: 'error' | 'warning';
  message: string;
}

export type Tone = 'slate' | 'emerald' | 'sky' | 'amber' | 'red' | 'violet' | 'indigo';

export const noticeToneClass: Record<Tone, string> = {
  slate: 'border-slate-200 bg-slate-50 text-slate-700',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  sky: 'border-sky-200 bg-sky-50 text-sky-900',
  amber: 'border-amber-200 bg-amber-50 text-amber-950',
  red: 'border-red-200 bg-red-50 text-red-800',
  violet: 'border-violet-200 bg-violet-50 text-violet-950',
  indigo: 'border-indigo-200 bg-indigo-50 text-indigo-950',
};

export const chipToneClass: Record<Tone, string> = {
  slate: 'border-slate-200 bg-slate-50 text-slate-600',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  sky: 'border-sky-200 bg-sky-50 text-sky-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  red: 'border-red-200 bg-red-50 text-red-700',
  violet: 'border-violet-200 bg-violet-50 text-violet-700',
  indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700',
};

export const iconToneClass: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-600',
  emerald: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
  sky: 'bg-sky-50 text-sky-700 ring-1 ring-sky-100',
  amber: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
  red: 'bg-red-50 text-red-700 ring-1 ring-red-100',
  violet: 'bg-violet-50 text-violet-700 ring-1 ring-violet-100',
  indigo: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100',
};

export const iconTextToneClass: Record<Tone, string> = {
  slate: 'text-slate-400',
  emerald: 'text-emerald-600',
  sky: 'text-sky-600',
  amber: 'text-amber-600',
  red: 'text-red-600',
  violet: 'text-violet-600',
  indigo: 'text-indigo-600',
};

export const InfoTip = ({ text }: { text: string }) => (
  <span
    title={text}
    className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
  >
    <Info size={11} />
  </span>
);

export const fieldLabelClass = 'mb-1 flex items-center gap-1 text-[11px] font-black uppercase tracking-wide text-slate-500';
export const inputBaseClass = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-hidden transition placeholder:font-medium placeholder:text-slate-400 hover:border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500';
/** Dense inputs used inside the line tables. */
export const cellInputClass = 'h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 outline-hidden transition hover:border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50';

const problemInputClass: Record<FieldProblem['severity'], string> = {
  error: 'border-red-300 bg-red-50/40 hover:border-red-400 focus:border-red-500 focus:ring-red-100',
  warning: 'border-amber-300 bg-amber-50/30 hover:border-amber-400 focus:border-amber-500 focus:ring-amber-100',
};

/** Extra classes for an input that carries a problem. */
export const problemClass = (problem?: FieldProblem | null) => (problem ? problemInputClass[problem.severity] : '');

export const FieldMessage = ({ id, problem }: { id?: string; problem?: FieldProblem | null }) => {
  if (!problem?.message) return null;
  const Icon = problem.severity === 'error' ? XCircle : AlertTriangle;
  return (
    <p
      id={id}
      role={problem.severity === 'error' ? 'alert' : undefined}
      className={`mt-1 flex items-start gap-1 text-[11px] font-bold leading-snug ${problem.severity === 'error' ? 'text-red-700' : 'text-amber-800'}`}
    >
      <Icon size={12} className="mt-px shrink-0" />
      <span>{problem.message}</span>
    </p>
  );
};

const FieldLabel = ({ htmlFor, label, help, required }: { htmlFor: string; label: React.ReactNode; help?: string; required?: boolean }) => (
  <label htmlFor={htmlFor} className={fieldLabelClass}>
    {label}
    {required ? <span className="text-red-500" aria-hidden>*</span> : null}
    {help ? <InfoTip text={help} /> : null}
  </label>
);

export const TextInput = ({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  help,
  disabled,
  min,
  max,
  problem,
  required,
  field,
  inputMode,
  className = '',
}: {
  label: React.ReactNode;
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  help?: string;
  disabled?: boolean;
  min?: string | number;
  max?: string | number;
  problem?: FieldProblem | null;
  required?: boolean;
  /** Validation field key; used to jump to the input from the review list. */
  field?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  className?: string;
}) => {
  const id = useId();
  const messageId = `${id}-message`;
  return (
    <div className="block min-w-0" data-legal-field={field}>
      <FieldLabel htmlFor={id} label={label} help={help} required={required} />
      <input
        id={id}
        type={type}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        min={min}
        max={max}
        inputMode={inputMode}
        aria-invalid={problem?.severity === 'error' || undefined}
        aria-describedby={problem ? messageId : undefined}
        className={`${inputBaseClass} ${problemClass(problem)} ${className}`}
      />
      <FieldMessage id={messageId} problem={problem} />
    </div>
  );
};

export const SelectInput = ({
  label,
  value,
  onChange,
  children,
  help,
  disabled,
  problem,
  required,
  field,
}: {
  label: React.ReactNode;
  value: string | number;
  onChange: (value: string) => void;
  children: React.ReactNode;
  help?: string;
  disabled?: boolean;
  problem?: FieldProblem | null;
  required?: boolean;
  field?: string;
}) => {
  const id = useId();
  const messageId = `${id}-message`;
  return (
    <div className="block min-w-0" data-legal-field={field}>
      <FieldLabel htmlFor={id} label={label} help={help} required={required} />
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={problem?.severity === 'error' || undefined}
        aria-describedby={problem ? messageId : undefined}
        className={`${inputBaseClass} pr-8 ${problemClass(problem)}`}
      >
        {children}
      </select>
      <FieldMessage id={messageId} problem={problem} />
    </div>
  );
};

export const ActionButton = ({
  children,
  onClick,
  disabled,
  variant = 'primary',
  type = 'button',
  title,
  size = 'md',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'quiet';
  type?: 'button' | 'submit';
  title?: string;
  size?: 'md' | 'lg';
}) => {
  const classes = {
    primary: 'bg-emerald-600 text-white shadow-xs shadow-emerald-900/10 hover:bg-emerald-700 disabled:bg-slate-300 disabled:shadow-none',
    secondary: 'bg-white text-slate-800 border border-slate-200 shadow-xs shadow-slate-900/3 hover:border-slate-300 hover:bg-slate-50 disabled:text-slate-400 disabled:shadow-none',
    danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-slate-300',
    quiet: 'bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:text-slate-400',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-black transition active:scale-[0.98] disabled:cursor-not-allowed ${size === 'lg' ? 'min-h-12 px-5 py-2.5 text-base' : 'min-h-10 px-4 py-2 text-sm'} ${classes[variant]}`}
    >
      {children}
    </button>
  );
};

export const Chip = ({ tone = 'slate', className = '', children }: { tone?: Tone | null; className?: string; children: React.ReactNode }) => (
  <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-black ${tone ? chipToneClass[tone] : ''} ${className}`}>
    {children}
  </span>
);

export const Notice = ({
  tone = 'slate',
  icon: Icon = Info,
  title,
  children,
  action,
  role,
  className = '',
}: {
  tone?: Tone;
  icon?: LucideIcon;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  role?: string;
  className?: string;
}) => (
  <div role={role} className={`flex flex-col gap-2 rounded-xl border px-3.5 py-3 text-sm sm:flex-row sm:items-start ${noticeToneClass[tone]} ${className}`}>
    <div className="flex min-w-0 flex-1 items-start gap-2.5">
      <Icon size={17} className="mt-0.5 shrink-0 opacity-80" />
      <div className="min-w-0 flex-1 leading-relaxed">
        {title ? <div className="font-black">{title}</div> : null}
        {children ? <div className={title ? 'mt-0.5 text-[13px] font-medium opacity-90' : 'font-medium'}>{children}</div> : null}
      </div>
    </div>
    {action ? <div className="shrink-0 pl-7 sm:self-center sm:pl-0">{action}</div> : null}
  </div>
);

/** Card used for every block of the creation workspace. Keeps no overflow clipping so pickers can float. */
export const EditorSection = ({
  icon: Icon,
  tone = 'slate',
  title,
  subtitle,
  action,
  children,
  className = '',
  bodyClassName = 'p-4 sm:p-5',
  id,
}: {
  icon: LucideIcon;
  tone?: Tone;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) => (
  <section id={id} className={`min-w-0 scroll-mt-32 rounded-2xl border border-slate-200/80 bg-white shadow-xs ${className}`}>
    <header className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5 ${children ? 'border-b border-slate-100' : ''}`}>
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${iconToneClass[tone]}`}><Icon size={16} /></span>
        <div className="min-w-0">
          <h3 className="text-sm font-black tracking-tight text-slate-900">{title}</h3>
          {subtitle ? <p className="text-xs font-medium leading-snug text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="min-w-0">{action}</div> : null}
    </header>
    {children ? <div className={bodyClassName}>{children}</div> : null}
  </section>
);

/** Small titled group inside a tab panel. */
export const FieldGroup = ({ title, hint, children, className = '' }: { title: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode; className?: string }) => (
  <fieldset className={`min-w-0 space-y-3 ${className}`}>
    <legend className="mb-2 flex w-full items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
      {title}
      <span className="h-px flex-1 bg-slate-100" />
      {hint ? <span className="normal-case tracking-normal text-slate-400">{hint}</span> : null}
    </legend>
    {children}
  </fieldset>
);

/** Scrolls to and focuses the first input tagged with `data-legal-field`. Returns false if not rendered. */
export function focusLegalField(field: string): boolean {
  if (typeof window === 'undefined') return false;
  const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(field) : field.replace(/"/g, '\\"');
  const container = window.document.querySelector<HTMLElement>(`[data-legal-field="${escaped}"]`);
  if (!container) return false;
  container.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const focusable = container.matches('input,select,textarea,button')
    ? container
    : container.querySelector<HTMLElement>('input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled])');
  focusable?.focus({ preventScroll: true });
  return true;
}
