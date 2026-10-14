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
//  Στυλ — ουδέτερη παλέτα, χρώμα μόνο όπου χρειάζεται προσοχή
// ──────────────────────────────────────────────

export const SERVICE_INPUT =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-900/5 disabled:bg-slate-50 disabled:text-slate-500';

/** Κύριο κουμπί: ένα ανά οθόνη. */
export const ACTION_PRIMARY =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#060b00] px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50';

/** Δευτερεύον, ήσυχο κουμπί. */
export const ACTION_QUIET =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

export const DANGER_BUTTON =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-bold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50';

/** Μικρό κουμπί κειμένου μέσα σε γραμμές λίστας. */
export const ROW_BUTTON =
  'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50';

/** Κουμπί-σύνδεσμος για επικεφαλίδες ενοτήτων. */
export const GHOST_BUTTON =
  'inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50';

export function IconButton({ label, onClick, children, disabled }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={(event) => { event.stopPropagation(); onClick(); }} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40">
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children, className = '' }: { label: string; hint?: string; error?: string | null; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-[11px] font-bold text-rose-600">{error}</span> : hint ? <span className="mt-1 block text-[11px] text-slate-400">{hint}</span> : null}
    </label>
  );
}

/** Επιλογή σε μορφή segmented control, για 2–4 επιλογές. */
export function ChoicePills<T extends string>({ value, options, onChange, size = 'md' }: { value: T; options: Array<{ value: T; label: string; hint?: string }>; onChange: (value: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div className="inline-flex max-w-full flex-wrap gap-1 rounded-xl bg-slate-100 p-1" role="radiogroup">
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
            className={`rounded-lg font-bold transition ${size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'} ${active ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800'}`}
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
      <div className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-950/40 sm:items-center sm:p-4 print:hidden" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
        <div className={`flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200 sm:rounded-2xl ${width}`}>
          <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
            <div className="flex min-w-0 items-start gap-3">
              {icon && <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">{icon}</div>}
              <div className="min-w-0">
                <h2 className="text-base font-black text-slate-900">{title}</h2>
                {subtitle && <div className="mt-0.5 text-xs text-slate-500">{subtitle}</div>}
              </div>
            </div>
            <IconButton label="Κλείσιμο" onClick={onClose} disabled={busy}><X size={18} /></IconButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-1">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
        </div>
      </div>
    </ViewportPortal>
  );
}

export function ServiceDrawer({
  eyebrow,
  title,
  subtitle,
  headerActions,
  onClose,
  children,
  footer,
}: {
  /** Μικρή γραμμή πάνω από τον τίτλο (κωδικός, κατάσταση). */
  eyebrow?: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  headerActions?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  /** Ένα κύριο κουμπί και (προαιρετικά) ένα δευτερεύον· μοιράζονται ισότιμα το πλάτος. */
  footer?: React.ReactNode;
}) {
  useTopmostEscape(onClose);
  return (
    <ViewportPortal>
      <div className="fixed inset-0 z-[180] flex justify-end bg-slate-950/30 print:hidden" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <aside className="flex h-full w-full max-w-[600px] flex-col bg-slate-50 shadow-2xl animate-in slide-in-from-right duration-200">
          <header className="border-b border-slate-200 bg-white px-5 pb-4 pt-3 sm:px-6">
            <div className="flex min-h-9 items-center justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">{eyebrow}</div>
              <div className="flex shrink-0 items-center gap-0.5">
                {headerActions}
                <IconButton label="Κλείσιμο" onClick={onClose}><X size={18} /></IconButton>
              </div>
            </div>
            <h2 className="mt-1 truncate text-xl font-black tracking-tight text-slate-900">{title}</h2>
            {subtitle && <div className="mt-0.5 text-sm text-slate-500">{subtitle}</div>}
          </header>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6">{children}</div>
          {footer && <footer className="grid gap-2 border-t border-slate-200 bg-white px-5 py-3 sm:auto-cols-fr sm:grid-flow-col sm:px-6">{footer}</footer>}
        </aside>
      </div>
    </ViewportPortal>
  );
}

export function DrawerSection({ title, action, children, tone = 'white' }: { title: string; action?: React.ReactNode; children: React.ReactNode; tone?: 'white' | 'muted' }) {
  return (
    <section className={`rounded-xl px-4 py-3.5 ${tone === 'white' ? 'border border-slate-200/70 bg-white' : ''}`}>
      <div className="mb-2.5 flex min-h-7 items-center justify-between gap-3">
        <h3 className="text-xs font-bold text-slate-500">{title}</h3>
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

const TONE_DOT: Record<PillTone, string> = {
  slate: 'bg-slate-300',
  indigo: 'bg-indigo-400',
  blue: 'bg-sky-400',
  amber: 'bg-amber-400',
  emerald: 'bg-emerald-500',
  rose: 'bg-rose-500',
  violet: 'bg-violet-400',
};

const TONE_TEXT: Record<PillTone, string> = {
  slate: 'text-slate-500',
  indigo: 'text-slate-600',
  blue: 'text-slate-600',
  amber: 'text-amber-700',
  emerald: 'text-emerald-700',
  rose: 'text-rose-600',
  violet: 'text-slate-600',
};

/** Διακριτική ετικέτα: χρωματιστή κουκκίδα + ουδέτερο κείμενο. */
export function StatusPill({ tone = 'slate', children }: { tone?: PillTone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold ${TONE_TEXT[tone]}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[tone]}`} />
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

const MENU_WIDTH = 232;

/**
 * Μενού «⋯». Αποδίδεται σε portal με fixed θέση, ώστε να μην κόβεται μέσα σε
 * περιοχές που κυλάνε (drawer, στήλες) και ανοίγει προς τα πάνω όταν δεν χωράει.
 */
export function ActionMenu({ actions, label = 'Περισσότερες ενέργειες' }: { actions: MenuAction[]; label?: string }) {
  const [position, setPosition] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const visible = actions.filter((action) => !action.hidden);
  const open = position !== null;

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setPosition(null);
    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    const scroll = (event: Event) => { if (!menuRef.current?.contains(event.target as Node)) close(); };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [open]);

  if (visible.length === 0) return null;

  const toggle = () => {
    if (open || !buttonRef.current) { setPosition(null); return; }
    const rect = buttonRef.current.getBoundingClientRect();
    const estimatedHeight = visible.length * 40 + 16;
    const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    const fitsBelow = window.innerHeight - rect.bottom > estimatedHeight + 8;
    setPosition(fitsBelow ? { top: rect.bottom + 4, left } : { bottom: window.innerHeight - rect.top + 4, left });
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => { event.stopPropagation(); toggle(); }}
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition ${open ? 'bg-slate-100 text-slate-800' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'}`}
      >
        <MoreHorizontal size={18} />
      </button>
      {position && (
        <ViewportPortal>
          <div
            ref={menuRef}
            role="menu"
            style={{ position: 'fixed', top: position.top, bottom: position.bottom, left: position.left, width: MENU_WIDTH }}
            className="z-[260] max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            {visible.map((action, index) => (
              <React.Fragment key={action.key}>
                {action.danger && index > 0 && !visible[index - 1].danger && <div className="my-1 h-px bg-slate-100" />}
                <button
                  type="button"
                  role="menuitem"
                  disabled={action.disabled}
                  onClick={() => { setPosition(null); action.onSelect(); }}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition disabled:opacity-40 ${action.danger ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-50'}`}
                >
                  <span className={`flex w-4 shrink-0 justify-center ${action.danger ? '' : 'text-slate-400'}`}>{action.icon}</span>
                  {action.label}
                </button>
              </React.Fragment>
            ))}
          </div>
        </ViewportPortal>
      )}
    </>
  );
}

export function KanbanBoard({ children }: { children: React.ReactNode }) {
  return <div className="-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-2 sm:mx-0 sm:px-0 xl:snap-none">{children}</div>;
}

const COLUMN_PREVIEW = 30;

export function KanbanColumn<T>({ title, hint, tone, items, renderItem, emptyText }: { title: string; hint?: string; tone: PillTone; items: T[]; renderItem: (item: T) => React.ReactNode; emptyText?: string }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, COLUMN_PREVIEW);
  return (
    <section className="flex w-[86vw] shrink-0 snap-start flex-col rounded-2xl bg-slate-100/60 p-2 sm:w-[300px] xl:w-auto xl:min-w-[230px] xl:flex-1">
      <header className="flex items-center justify-between gap-2 px-2 pb-2 pt-1" title={hint}>
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[tone]}`} />
          <h3 className="truncate text-xs font-bold text-slate-600">{title}</h3>
        </div>
        <span className="text-[11px] font-bold tabular-nums text-slate-400">{formatNumber(items.length)}</span>
      </header>
      <div className="flex flex-col gap-2">
        {items.length === 0
          ? <div className="px-3 py-6 text-center text-[11px] text-slate-400">{emptyText || 'Τίποτα εδώ'}</div>
          : visible.map(renderItem)}
        {items.length > visible.length && (
          <button type="button" onClick={() => setExpanded(true)} className="rounded-xl py-2 text-xs font-bold text-slate-500 hover:bg-white">
            Εμφάνιση όλων ({formatNumber(items.length)})
          </button>
        )}
      </div>
    </section>
  );
}

/** Ουδέτερο μετρικό πλακίδιο· χρώμα μόνο στην κουκκίδα και, όταν χρειάζεται προσοχή, στον αριθμό. */
export function KpiChip({ label, value, tone = 'slate', onClick, active = false, alert = false }: { label: string; value: React.ReactNode; tone?: PillTone; onClick?: () => void; active?: boolean; alert?: boolean }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={`flex min-w-0 flex-col items-start rounded-xl border bg-white px-3.5 py-2.5 text-left transition ${active ? 'border-slate-400 ring-1 ring-slate-300' : 'border-slate-200/80'} ${onClick ? 'hover:border-slate-300' : ''}`}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500"><span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} />{label}</span>
      <span className={`mt-0.5 text-lg font-black leading-tight tabular-nums ${alert ? TONE_TEXT[tone] : 'text-slate-900'}`}>{value}</span>
    </Tag>
  );
}

export function EmptyBoard({ icon, title, text, action }: { icon: React.ReactNode; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <div className="mb-3 rounded-xl bg-slate-100 p-3.5 text-slate-400">{icon}</div>
      <h3 className="font-black text-slate-800">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-slate-500">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function TimelineList({ events }: { events: Array<{ id: string; label: string; at: string; note?: string | null }> }) {
  if (events.length === 0) return <p className="text-xs text-slate-400">Δεν υπάρχουν κινήσεις.</p>;
  return (
    <ol className="space-y-2.5">
      {events.map((event) => (
        <li key={event.id} className="flex items-baseline justify-between gap-3 text-xs">
          <div className="min-w-0">
            <span className="font-bold text-slate-700">{event.label}</span>
            {event.note && <span className="text-slate-500"> · {event.note}</span>}
          </div>
          <span className="shrink-0 tabular-nums text-[11px] text-slate-400">{event.at}</span>
        </li>
      ))}
    </ol>
  );
}

/** Γραμμή «ετικέτα — τιμή» για σύνοψη μέσα σε drawer. */
export function SummaryGrid({ items }: { items: Array<{ label: string; value: React.ReactNode; tone?: 'default' | 'muted' | 'alert' }> }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200/70 bg-slate-200/70 sm:grid-cols-[repeat(auto-fit,minmax(120px,1fr))]">
      {items.map((item) => (
        <div key={item.label} className="bg-white px-3.5 py-2.5">
          <dt className="text-[11px] text-slate-500">{item.label}</dt>
          <dd className={`mt-0.5 text-base font-black tabular-nums ${item.tone === 'alert' ? 'text-rose-600' : item.tone === 'muted' ? 'text-slate-400' : 'text-slate-900'}`}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
