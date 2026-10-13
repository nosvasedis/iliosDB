import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, X } from 'lucide-react';
import ViewportPortal from '../ViewportPortal';
import { formatNumber } from '../../../utils/numberFormat';

// Μόνο το πάνω-πάνω παράθυρο κλείνει με Escape (π.χ. modal πάνω σε drawer).
const overlayStack: symbol[] = [];

function useTopmostEscape(onClose: () => void, disabled = false): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  useEffect(() => {
    const id = Symbol('overlay');
    overlayStack.push(id);
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (overlayStack[overlayStack.length - 1] !== id || disabledRef.current) return;
      event.preventDefault();
      closeRef.current();
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      const index = overlayStack.indexOf(id);
      if (index >= 0) overlayStack.splice(index, 1);
    };
  }, []);
}

// ──────────────────────────────────────────────
//  Στυλ πεδίων — μία πηγή για όλες τις φόρμες εξυπηρέτησης
// ──────────────────────────────────────────────

export const SERVICE_INPUT =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 disabled:bg-slate-50 disabled:text-slate-500';

export const DANGER_BUTTON =
  'inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700 shadow-sm transition-all hover:bg-rose-100 disabled:opacity-50';

export const GHOST_BUTTON =
  'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50';

export function Field({ label, hint, error, children, className = '' }: { label: string; hint?: string; error?: string | null; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[11px] font-bold text-slate-500">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-[11px] font-bold text-rose-600">{error}</span> : hint ? <span className="mt-1 block text-[11px] text-slate-400">{hint}</span> : null}
    </label>
  );
}

/** Επιλογή με «κουμπιά» αντί για dropdown, για 2–4 επιλογές. */
export function ChoicePills<T extends string>({ value, options, onChange, size = 'md' }: { value: T; options: Array<{ value: T; label: string; hint?: string }>; onChange: (value: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.hint}
            onClick={() => onChange(option.value)}
            className={`rounded-xl border font-bold transition ${size === 'sm' ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'} ${active ? 'border-[#060b00] bg-[#060b00] text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────
//  Παράθυρο (modal) & πλαϊνό πάνελ (drawer)
// ──────────────────────────────────────────────

export function ServiceModal({
  title,
  subtitle,
  icon,
  onClose,
  children,
  footer,
  size = 'md',
  busy = false,
}: {
  title: string;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  busy?: boolean;
}) {
  useTopmostEscape(onClose, busy);
  const width = size === 'sm' ? 'sm:max-w-md' : size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-xl';
  return (
    <ViewportPortal>
      <div className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-950/50 backdrop-blur-sm sm:items-center sm:p-4 print:hidden" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
        <div className={`flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200 sm:rounded-3xl ${width}`}>
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="flex min-w-0 items-start gap-3">
              {icon && <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">{icon}</div>}
              <div className="min-w-0">
                <h2 className="text-base font-black text-slate-900">{title}</h2>
                {subtitle && <div className="mt-0.5 text-xs text-slate-500">{subtitle}</div>}
              </div>
            </div>
            <button type="button" onClick={onClose} disabled={busy} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Κλείσιμο"><X size={18} /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3">{footer}</div>}
        </div>
      </div>
    </ViewportPortal>
  );
}

export function ServiceDrawer({
  title,
  subtitle,
  badges,
  headerActions,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle?: React.ReactNode;
  badges?: React.ReactNode;
  headerActions?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useTopmostEscape(onClose);
  return (
    <ViewportPortal>
      <div className="fixed inset-0 z-[180] flex justify-end bg-slate-950/40 backdrop-blur-[2px] print:hidden" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <aside className="flex h-full w-full max-w-2xl flex-col bg-slate-50 shadow-2xl animate-in slide-in-from-right duration-200">
          <header className="border-b border-slate-200 bg-white px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-mono text-lg font-black text-slate-900">{title}</h2>
                  {badges}
                </div>
                {subtitle && <div className="mt-1 text-sm text-slate-600">{subtitle}</div>}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {headerActions}
                <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Κλείσιμο"><X size={19} /></button>
              </div>
            </div>
          </header>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">{children}</div>
          {footer && <footer className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white px-5 py-3">{footer}</footer>}
        </aside>
      </div>
    </ViewportPortal>
  );
}

export function DrawerSection({ title, action, children, tone = 'white' }: { title: string; action?: React.ReactNode; children: React.ReactNode; tone?: 'white' | 'muted' }) {
  return (
    <section className={`rounded-2xl border border-slate-100 p-4 ${tone === 'white' ? 'bg-white' : 'bg-slate-100/60'}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

// ──────────────────────────────────────────────
//  Ετικέτες, μενού, στήλες
// ──────────────────────────────────────────────

export type PillTone = 'slate' | 'indigo' | 'blue' | 'amber' | 'emerald' | 'rose' | 'violet';

const PILL_TONES: Record<PillTone, string> = {
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
};

export function StatusPill({ tone = 'slate', children, icon }: { tone?: PillTone; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-black ${PILL_TONES[tone]}`}>
      {icon}
      {children}
    </span>
  );
}

export interface MenuAction {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
  hidden?: boolean;
  disabled?: boolean;
}

export function ActionMenu({ actions, label = 'Περισσότερες ενέργειες', align = 'right' }: { actions: MenuAction[]; label?: string; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const visible = actions.filter((action) => !action.hidden);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false); } };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape, true); };
  }, [open]);
  if (visible.length === 0) return null;
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label={label} title={label} aria-expanded={open} onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div className={`absolute z-50 mt-1 min-w-[220px] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {visible.map((action) => (
            <button
              key={action.key}
              type="button"
              disabled={action.disabled}
              onClick={(event) => { event.stopPropagation(); setOpen(false); action.onSelect(); }}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-bold transition disabled:opacity-40 ${action.danger ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-50'}`}
            >
              <span className="w-4 shrink-0">{action.icon}</span>
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const COLUMN_DOTS: Record<PillTone, string> = {
  slate: 'bg-slate-400',
  indigo: 'bg-indigo-500',
  blue: 'bg-blue-500',
  amber: 'bg-amber-500',
  emerald: 'bg-emerald-500',
  rose: 'bg-rose-500',
  violet: 'bg-violet-500',
};

export function KanbanBoard({ children }: { children: React.ReactNode }) {
  return <div className="-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-2 sm:mx-0 sm:px-0 xl:snap-none">{children}</div>;
}

const COLUMN_PREVIEW = 30;

export function KanbanColumn<T>({ title, hint, tone, items, renderItem, emptyText, footer }: { title: string; hint?: string; tone: PillTone; items: T[]; renderItem: (item: T) => React.ReactNode; emptyText?: string; footer?: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, COLUMN_PREVIEW);
  return (
    <section className="flex w-[86vw] shrink-0 snap-start flex-col rounded-2xl bg-slate-100/70 p-2 sm:w-[310px] xl:w-auto xl:min-w-[240px] xl:flex-1">
      <header className="flex items-center justify-between gap-2 px-2 pb-2 pt-1" title={hint}>
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${COLUMN_DOTS[tone]}`} />
          <h3 className="truncate text-xs font-black uppercase tracking-wide text-slate-600">{title}</h3>
        </div>
        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-black text-slate-600 shadow-sm">{formatNumber(items.length)}</span>
      </header>
      <div className="flex flex-col gap-2">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-[11px] font-medium text-slate-400">{emptyText || 'Τίποτα εδώ'}</div>
        ) : visible.map(renderItem)}
        {items.length > visible.length && (
          <button type="button" onClick={() => setExpanded(true)} className="rounded-xl py-2 text-xs font-bold text-slate-500 hover:bg-white">
            Εμφάνιση όλων ({formatNumber(items.length)})
          </button>
        )}
        {footer}
      </div>
    </section>
  );
}

export function KpiChip({ label, value, tone = 'slate', onClick, active = false }: { label: string; value: React.ReactNode; tone?: PillTone; onClick?: () => void; active?: boolean }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={`flex min-w-0 flex-col items-start rounded-xl border px-3 py-2 text-left transition ${PILL_TONES[tone]} ${onClick ? 'hover:shadow-sm' : ''} ${active ? 'ring-2 ring-offset-1 ring-slate-900/20' : ''}`}
    >
      <span className="text-[10px] font-bold uppercase tracking-wide opacity-80">{label}</span>
      <span className="text-base font-black leading-tight">{value}</span>
    </Tag>
  );
}

export function EmptyBoard({ icon, title, text, action }: { icon: React.ReactNode; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <div className="mb-3 rounded-2xl bg-slate-100 p-4 text-slate-500">{icon}</div>
      <h3 className="font-black text-slate-800">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-slate-500">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function TimelineList({ events }: { events: Array<{ id: string; label: string; at: string; note?: string | null }> }) {
  if (events.length === 0) return <p className="text-xs text-slate-400">Δεν υπάρχουν κινήσεις.</p>;
  return (
    <ol className="relative space-y-3 border-l border-slate-200 pl-4">
      {events.map((event) => (
        <li key={event.id} className="relative">
          <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-slate-300" />
          <div className="text-xs font-black text-slate-700">{event.label}</div>
          {event.note && <div className="text-[11px] text-slate-500">{event.note}</div>}
          <div className="text-[10px] text-slate-400">{event.at}</div>
        </li>
      ))}
    </ol>
  );
}
