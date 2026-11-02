import React from 'react';
import {
  Banknote,
  Building2,
  Car,
  Droplets,
  Flame,
  Gem,
  Hammer,
  Handshake,
  HardHat,
  Home,
  Landmark,
  Loader2,
  Megaphone,
  Package,
  Phone,
  Plane,
  Puzzle,
  Receipt,
  Shield,
  ShoppingBag,
  Sparkles,
  Store,
  Truck,
  UserRound,
  Wifi,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { formatEuro } from '../../features/finance/financeMath';
import type { FinanceBilling, FinancePartyKind } from '../../features/finance/types';

/** Icons the user can pick for a category; stored by key. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  building: Building2,
  zap: Zap,
  phone: Phone,
  wifi: Wifi,
  hammer: Hammer,
  gem: Gem,
  puzzle: Puzzle,
  plane: Plane,
  car: Car,
  handshake: Handshake,
  home: Home,
  flame: Flame,
  droplets: Droplets,
  truck: Truck,
  package: Package,
  wrench: Wrench,
  shield: Shield,
  megaphone: Megaphone,
  landmark: Landmark,
  sparkles: Sparkles,
  bag: ShoppingBag,
  receipt: Receipt,
  worker: HardHat,
  banknote: Banknote,
};

export const CATEGORY_COLORS = [
  '#0ea5e9', '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
  '#f59e0b', '#84cc16', '#10b981', '#14b8a6', '#64748b', '#0f172a',
];

export function CategoryGlyph({ icon, color, size = 'md' }: { icon?: string | null; color: string; size?: 'sm' | 'md' | 'lg' }) {
  const Icon = (icon && CATEGORY_ICONS[icon]) || Receipt;
  const box = size === 'sm' ? 'h-7 w-7 rounded-lg' : size === 'lg' ? 'h-12 w-12 rounded-2xl' : 'h-9 w-9 rounded-xl';
  return (
    <span className={`flex shrink-0 items-center justify-center ${box}`} style={{ backgroundColor: `${color}1f`, color }}>
      <Icon size={size === 'sm' ? 14 : size === 'lg' ? 22 : 17} strokeWidth={2.25} />
    </span>
  );
}

export const PARTY_KIND_META: Record<FinancePartyKind, { label: string; icon: LucideIcon; tone: string }> = {
  supplier: { label: 'Προμηθευτής', icon: Store, tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  worker: { label: 'Συνεργάτης', icon: HardHat, tone: 'bg-amber-50 text-amber-700 ring-amber-100' },
  utility: { label: 'Πάροχος', icon: Zap, tone: 'bg-sky-50 text-sky-700 ring-sky-100' },
  service: { label: 'Υπηρεσία', icon: Wrench, tone: 'bg-violet-50 text-violet-700 ring-violet-100' },
  person: { label: 'Πρόσωπο', icon: UserRound, tone: 'bg-slate-100 text-slate-700 ring-slate-200' },
};

export const BILLING_TONE: Record<FinanceBilling, { chip: string; bar: string; text: string; hex: string }> = {
  T: { chip: 'bg-indigo-50 text-indigo-700 ring-indigo-100', bar: 'bg-indigo-500', text: 'text-indigo-700', hex: '#6366f1' },
  X: { chip: 'bg-amber-50 text-amber-700 ring-amber-100', bar: 'bg-amber-400', text: 'text-amber-700', hex: '#f59e0b' },
};

export function BillingBadge({ billing, compact = false }: { billing: FinanceBilling; compact?: boolean }) {
  return (
    <span
      title={billing === 'T' ? 'Με παραστατικό' : 'Χωρίς παραστατικό'}
      className={`inline-flex items-center justify-center rounded-md px-1.5 py-0.5 text-[10px] font-black ring-1 ${BILLING_TONE[billing].chip}`}
    >
      {billing === 'T' ? 'Τ' : 'Χ'}{compact ? '' : billing === 'T' ? ' · τιμολόγιο' : ' · μετρητά'}
    </span>
  );
}

/** Two-tone Τ/Χ bar; the faded part shows what is still to come. */
export function SplitBar({ t, x, collectedT = 0, collectedX = 0, height = 'h-2' }: { t: number; x: number; collectedT?: number; collectedX?: number; height?: string }) {
  const total = Math.max(0.01, t + x);
  const tWidth = (Math.max(0, t) / total) * 100;
  const xWidth = (Math.max(0, x) / total) * 100;
  const fill = (part: number, collected: number) => (part > 0 ? Math.min(100, (Math.max(0, collected) / part) * 100) : 0);
  return (
    <div className={`flex w-full overflow-hidden rounded-full bg-slate-100 ${height}`}>
      {tWidth > 0 && (
        <div className="relative h-full bg-indigo-200" style={{ width: `${tWidth}%` }}>
          <div className="absolute inset-y-0 left-0 bg-indigo-500" style={{ width: `${fill(t, collectedT)}%` }} />
        </div>
      )}
      {xWidth > 0 && (
        <div className="relative h-full bg-amber-200" style={{ width: `${xWidth}%` }}>
          <div className="absolute inset-y-0 left-0 bg-amber-400" style={{ width: `${fill(x, collectedX)}%` }} />
        </div>
      )}
    </div>
  );
}

export function BillingToggle({ value, onChange, allowAll = false }: { value: FinanceBilling | 'all'; onChange: (value: any) => void; allowAll?: boolean }) {
  const options: Array<[FinanceBilling | 'all', string]> = allowAll ? [['all', 'Όλα'], ['T', 'Τ'], ['X', 'Χ']] : [['T', 'Τ · Τιμολόγιο'], ['X', 'Χ · Μετρητά']];
  return (
    <div className="inline-flex rounded-xl bg-slate-100 p-0.5 ring-1 ring-slate-200/60">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`rounded-lg px-3 py-1.5 text-xs font-black transition-all ${value === key
            ? key === 'T' ? 'bg-indigo-600 text-white shadow-sm' : key === 'X' ? 'bg-amber-400 text-amber-950 shadow-sm' : 'bg-white text-slate-900 shadow-sm'
            : 'text-slate-500 hover:text-slate-800'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function Money({ value, className = '', signed = false }: { value: number; className?: string; signed?: boolean }) {
  const negative = value < -0.004;
  return (
    <span className={`tabular-nums ${className}`}>
      {signed && value > 0.004 ? '+' : ''}{formatEuro(value)}
      {negative && !signed ? null : null}
    </span>
  );
}

export function KpiTile({ icon: Icon, label, value, hint, tone = 'slate', onClick, children }: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: 'slate' | 'emerald' | 'rose' | 'indigo' | 'amber' | 'sky' | 'violet';
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  const tones = {
    slate: 'from-slate-50 text-slate-700 ring-slate-200/70',
    emerald: 'from-emerald-50 text-emerald-700 ring-emerald-100',
    rose: 'from-rose-50 text-rose-700 ring-rose-100',
    indigo: 'from-indigo-50 text-indigo-700 ring-indigo-100',
    amber: 'from-amber-50 text-amber-700 ring-amber-100',
    sky: 'from-sky-50 text-sky-700 ring-sky-100',
    violet: 'from-violet-50 text-violet-700 ring-violet-100',
  }[tone];
  const Wrapper: any = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`group flex min-w-0 flex-col gap-2 rounded-3xl bg-gradient-to-br to-white p-4 text-left shadow-sm ring-1 ${tones} ${onClick ? 'transition-all hover:-translate-y-0.5 hover:shadow-md' : ''}`}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/80 shadow-sm ring-1 ring-black/5"><Icon size={16} /></span>
        <span className="truncate text-[11px] font-black uppercase tracking-wide opacity-80">{label}</span>
      </div>
      <div className="truncate text-2xl font-black tracking-tight text-slate-900 tabular-nums">{value}</div>
      {hint ? <div className="text-xs font-bold text-slate-500">{hint}</div> : null}
      {children}
    </Wrapper>
  );
}

export function SectionCard({ title, subtitle, icon: Icon, actions, children, className = '', bodyClassName = 'p-4' }: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm ${className}`}>
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
        {Icon ? <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-50 text-slate-600 ring-1 ring-slate-100"><Icon size={16} /></span> : null}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-black text-slate-900">{title}</h3>
          {subtitle ? <p className="truncate text-xs font-semibold text-slate-500">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function EmptyNote({ icon: Icon = Sparkles, title, detail, action }: { icon?: LucideIcon; title: string; detail?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-8 text-center">
      <Icon size={22} className="text-slate-300" />
      <p className="text-sm font-black text-slate-700">{title}</p>
      {detail ? <p className="max-w-sm text-xs font-semibold text-slate-500">{detail}</p> : null}
      {action}
    </div>
  );
}

export function ProgressBar({ ratio, tone }: { ratio: number; tone?: string }) {
  const color = tone || (ratio > 1 ? 'bg-rose-500' : ratio >= 0.9 ? 'bg-amber-400' : 'bg-emerald-500');
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }} />
    </div>
  );
}

export const inputClass =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none transition-all placeholder:font-medium placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-900/5';
export const labelClass = 'mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500';
export const primaryButton =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-[#060b00] px-4 py-2.5 text-sm font-black text-white shadow-sm transition-all hover:bg-black disabled:cursor-not-allowed disabled:opacity-50';
export const secondaryButton =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50';
export const ghostButton =
  'inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-black text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-800';

export function Field({ label, children, hint, className = '' }: { label: string; children: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className={labelClass}>{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] font-semibold text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function FinanceModal({ title, eyebrow, icon: Icon, onClose, busy = false, children, footer, size = 'md' }: {
  title: React.ReactNode;
  eyebrow?: string;
  icon?: LucideIcon;
  onClose: () => void;
  busy?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEscapeToClose(onClose, busy);
  const width = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' }[size];
  return (
    <div
      className="fixed inset-0 z-[150] flex items-end justify-center bg-slate-950/50 backdrop-blur-sm animate-in fade-in sm:items-center sm:p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
    >
      <div role="dialog" aria-modal="true" className={`flex max-h-[94vh] w-full ${width} flex-col overflow-hidden rounded-t-[2rem] border border-slate-100 bg-white shadow-2xl animate-in zoom-in-95 sm:rounded-[2rem]`}>
        <div className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white px-5 py-4">
          <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-amber-200/30 blur-3xl" />
          <div className="relative flex items-center gap-3">
            {Icon ? <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1c2812] via-[#0b1204] to-[#060b00] text-amber-300 shadow-sm"><Icon size={18} /></span> : null}
            <div className="min-w-0 flex-1">
              {eyebrow ? <p className="text-[11px] font-black uppercase tracking-[0.16em] text-amber-700">{eyebrow}</p> : null}
              <h2 className="truncate text-lg font-black text-slate-900">{title}</h2>
            </div>
            <button type="button" onClick={onClose} disabled={busy} className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" aria-label="Κλείσιμο">
              <X size={20} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">{children}</div>
        {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

export function SaveButton({ busy, disabled, onClick, children }: { busy?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={busy || disabled} className={primaryButton}>
      {busy ? <Loader2 size={16} className="animate-spin" /> : null}
      {children}
    </button>
  );
}

/** Parses Greek or dotted decimals ("12,5" / "12.5"). */
export function parseAmount(value: string): number {
  const normalized = value.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function AmountInput({ value, onChange, autoFocus, className = '', placeholder = '0,00' }: {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  className?: string;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <input
        inputMode="decimal"
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value.replace(/[^\d,.\-]/g, ''))}
        className={`${inputClass} pr-8 text-right font-black tabular-nums ${className}`}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">€</span>
    </div>
  );
}

export const amountToInput = (value: number | null | undefined): string =>
  value === null || value === undefined || value === 0 ? '' : String(Math.round(value * 100) / 100).replace('.', ',');
