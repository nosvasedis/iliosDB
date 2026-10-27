import React, { createContext, memo, useContext, useId } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronRight, Minus, type LucideIcon } from 'lucide-react';
import { formatCurrency } from '../../utils/pricingEngine';
import { formatDecimal, formatNumber } from '../../utils/numberFormat';
import DashboardTermHint from './DashboardTermHint';

// ─── Privacy ───────────────────────────────────────────────────────────────────

/** When true every monetary figure on the dashboard is blurred (showroom / shared screen). */
export const DashboardPrivacyContext = createContext(false);

export function Money({ value, className = '', decimals }: { value: number; className?: string; decimals?: boolean }) {
  const hidden = useContext(DashboardPrivacyContext);
  const text = decimals === false ? `${formatNumber(Math.round(value))} €` : formatCurrency(value);
  return (
    <span
      className={`tabular-nums transition-[filter] duration-200 ${hidden ? 'select-none blur-[7px]' : ''} ${className}`}
      aria-label={hidden ? 'Κρυφό ποσό' : undefined}
    >
      {text}
    </span>
  );
}

// ─── Tones ─────────────────────────────────────────────────────────────────────

export type DashboardTone = 'emerald' | 'sky' | 'amber' | 'violet' | 'slate' | 'rose' | 'indigo';

export const TONE: Record<DashboardTone, { icon: string; soft: string; bar: string; stroke: string; text: string }> = {
  emerald: { icon: 'bg-emerald-50 text-emerald-600 ring-emerald-100', soft: 'bg-emerald-50', bar: 'bg-emerald-500', stroke: '#10b981', text: 'text-emerald-700' },
  sky: { icon: 'bg-sky-50 text-sky-600 ring-sky-100', soft: 'bg-sky-50', bar: 'bg-sky-500', stroke: '#0ea5e9', text: 'text-sky-700' },
  amber: { icon: 'bg-amber-50 text-amber-600 ring-amber-100', soft: 'bg-amber-50', bar: 'bg-amber-500', stroke: '#f59e0b', text: 'text-amber-700' },
  violet: { icon: 'bg-violet-50 text-violet-600 ring-violet-100', soft: 'bg-violet-50', bar: 'bg-violet-500', stroke: '#8b5cf6', text: 'text-violet-700' },
  slate: { icon: 'bg-slate-100 text-slate-600 ring-slate-200', soft: 'bg-slate-50', bar: 'bg-slate-500', stroke: '#64748b', text: 'text-slate-700' },
  rose: { icon: 'bg-rose-50 text-rose-600 ring-rose-100', soft: 'bg-rose-50', bar: 'bg-rose-500', stroke: '#f43f5e', text: 'text-rose-700' },
  indigo: { icon: 'bg-indigo-50 text-indigo-600 ring-indigo-100', soft: 'bg-indigo-50', bar: 'bg-indigo-500', stroke: '#6366f1', text: 'text-indigo-700' },
};

// ─── Building blocks ───────────────────────────────────────────────────────────

export function Shimmer({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-100 ${className}`} />;
}

export function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2.5 py-1" role="status" aria-label="Φόρτωση">
      {Array.from({ length: rows }, (_, index) => (
        <Shimmer key={index} className="h-9" />
      ))}
    </div>
  );
}

export function EmptyNote({ message, icon: Icon }: { message: string; icon?: LucideIcon }) {
  return (
    <div className="flex min-h-[7rem] flex-1 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center">
      {Icon ? <Icon size={18} className="text-slate-300" /> : null}
      <p className="text-xs font-semibold text-slate-400">{message}</p>
    </div>
  );
}

interface PanelProps {
  title: string;
  icon?: LucideIcon;
  tone?: DashboardTone;
  subtitle?: string;
  hint?: string;
  /** Header link, e.g. «Όλες» → navigates to the full page */
  action?: { label: string; onClick: () => void };
  headerExtra?: React.ReactNode;
  isLoading?: boolean;
  skeletonRows?: number;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

export const Panel = memo(function Panel({
  title,
  icon: Icon,
  tone = 'slate',
  subtitle,
  hint,
  action,
  headerExtra,
  isLoading = false,
  skeletonRows,
  className = '',
  bodyClassName = '',
  children,
}: PanelProps) {
  return (
    <section className={`flex min-w-0 flex-col rounded-3xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}>
      <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon ? (
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-1 ${TONE[tone].icon}`}>
              <Icon size={15} strokeWidth={2.25} />
            </span>
          ) : null}
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 truncate text-sm font-bold text-slate-800">
              {title}
              {hint ? <DashboardTermHint text={hint} /> : null}
            </h3>
            {subtitle ? <p className="truncate text-[11px] font-medium text-slate-400">{subtitle}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {headerExtra}
          {action ? (
            <button
              type="button"
              onClick={action.onClick}
              className="inline-flex items-center gap-0.5 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            >
              {action.label}
              <ChevronRight size={13} />
            </button>
          ) : null}
        </div>
      </header>
      <div className={`flex flex-1 flex-col px-5 pb-5 ${bodyClassName}`}>
        {isLoading ? <PanelSkeleton rows={skeletonRows} /> : children}
      </div>
    </section>
  );
});

// ─── Delta & sparkline ─────────────────────────────────────────────────────────

export function DeltaBadge({ delta, inverse = false, title }: { delta: number | null; inverse?: boolean; title?: string }) {
  if (delta === null || !Number.isFinite(delta)) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-400" title={title}>
        <Minus size={10} /> —
      </span>
    );
  }
  const flat = Math.abs(delta) < 0.5;
  const good = inverse ? delta < 0 : delta > 0;
  const classes = flat
    ? 'bg-slate-100 text-slate-500'
    : good
      ? 'bg-emerald-50 text-emerald-700'
      : 'bg-rose-50 text-rose-700';
  const Icon = flat ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-black tabular-nums ${classes}`} title={title}>
      <Icon size={11} strokeWidth={2.75} />
      {delta > 0 ? '+' : ''}
      {formatDecimal(delta, Math.abs(delta) >= 100 ? 0 : 1)}%
    </span>
  );
}

export const Sparkline = memo(function Sparkline({
  values,
  color,
  height = 36,
}: {
  values: number[];
  color: string;
  height?: number;
}) {
  const gradientId = useId();
  if (values.length < 2 || values.every((value) => value === 0)) return <div style={{ height }} />;
  const width = 120;
  const max = Math.max(...values);
  const min = Math.min(0, ...values);
  const range = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - 3 - ((value - min) / range) * (height - 6);
    return [x, y] as const;
  });
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `0,${height} ${line} ${width},${height}`;
  const [lastX, lastY] = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full overflow-visible" style={{ height }} aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradientId})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lastX} cy={lastY} r={2.5} fill={color} />
    </svg>
  );
});

// ─── KPI tile ──────────────────────────────────────────────────────────────────

interface KpiTileProps {
  label: string;
  icon: LucideIcon;
  tone: DashboardTone;
  value: React.ReactNode;
  sub?: React.ReactNode;
  delta?: number | null;
  deltaLabel?: string;
  inverseDelta?: boolean;
  sparkline?: number[];
  hint?: string;
  isLoading?: boolean;
  onClick?: () => void;
}

export const KpiTile = memo(function KpiTile({
  label,
  icon: Icon,
  tone,
  value,
  sub,
  delta,
  deltaLabel,
  inverseDelta,
  sparkline,
  hint,
  isLoading = false,
  onClick,
}: KpiTileProps) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={`group relative flex min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all ${
        onClick ? 'hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-1 ${TONE[tone].icon}`}>
            <Icon size={15} strokeWidth={2.25} />
          </span>
          <span className="flex min-w-0 items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <span className="truncate">{label}</span>
            {hint ? <DashboardTermHint text={hint} /> : null}
          </span>
        </div>
        {onClick ? (
          <ArrowUpRight size={15} className="shrink-0 text-slate-300 transition-colors group-hover:text-slate-500" />
        ) : null}
      </div>

      {isLoading ? (
        <div className="mt-4 space-y-2">
          <Shimmer className="h-8 w-2/3" />
          <Shimmer className="h-4 w-1/2" />
        </div>
      ) : (
        <>
          <div className="mt-4 text-[1.7rem] font-black leading-none tracking-tight text-slate-900">{value}</div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-slate-500">
            {delta !== undefined ? <DeltaBadge delta={delta} inverse={inverseDelta} title={deltaLabel} /> : null}
            {sub}
          </div>
          {sparkline ? (
            <div className="mt-3 -mb-1">
              <Sparkline values={sparkline} color={TONE[tone].stroke} />
            </div>
          ) : null}
        </>
      )}
    </Wrapper>
  );
});

// ─── Small stat ────────────────────────────────────────────────────────────────

export function MiniStat({
  label,
  value,
  sub,
  tone = 'slate',
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: DashboardTone;
}) {
  return (
    <div className={`min-w-0 rounded-2xl ${TONE[tone].soft} px-4 py-3`}>
      <p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 truncate text-lg font-black tabular-nums text-slate-900">{value}</p>
      {sub ? <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">{sub}</p> : null}
    </div>
  );
}

// ─── Horizontal bar list ───────────────────────────────────────────────────────

export interface BarListRow {
  key: string;
  label: React.ReactNode;
  value: number;
  /** Right-hand secondary text (e.g. revenue) */
  secondary?: React.ReactNode;
}

export const BarList = memo(function BarList({
  rows,
  tone = 'emerald',
  formatValue = formatNumber,
  showShare = true,
}: {
  rows: BarListRow[];
  tone?: DashboardTone;
  formatValue?: (value: number) => string;
  showShare?: boolean;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        const width = Math.max(2, (row.value / max) * 100);
        return (
          <li key={row.key} className="relative overflow-hidden rounded-xl">
            <div className={`absolute inset-y-0 left-0 rounded-xl ${TONE[tone].soft}`} style={{ width: `${width}%` }} aria-hidden />
            <div className={`absolute bottom-0 left-0 h-0.5 rounded-full ${TONE[tone].bar} opacity-60`} style={{ width: `${width}%` }} aria-hidden />
            <div className="relative flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0 truncate text-xs font-bold text-slate-700">{row.label}</span>
              <span className="flex shrink-0 items-baseline gap-2 text-xs">
                {row.secondary ? <span className="font-semibold text-slate-400">{row.secondary}</span> : null}
                <span className="font-black tabular-nums text-slate-800">{formatValue(row.value)}</span>
                {showShare && total > 0 ? (
                  <span className="w-9 text-right text-[10px] font-bold tabular-nums text-slate-400">
                    {formatDecimal((row.value / total) * 100, 0)}%
                  </span>
                ) : null}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
});

// ─── Ranked row ────────────────────────────────────────────────────────────────

export function RankRow({
  rank,
  title,
  subtitle,
  value,
  valueSub,
  onClick,
}: {
  rank?: number;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  value: React.ReactNode;
  valueSub?: React.ReactNode;
  onClick?: () => void;
}) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${onClick ? 'hover:bg-slate-50' : ''}`}
    >
      {rank !== undefined ? (
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-black tabular-nums ${
            rank === 1 ? 'bg-amber-100 text-amber-700' : rank <= 3 ? 'bg-slate-200/70 text-slate-600' : 'bg-slate-100 text-slate-400'
          }`}
        >
          {rank}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-bold text-slate-800">{title}</div>
        {subtitle ? <div className="truncate text-[11px] font-medium text-slate-400">{subtitle}</div> : null}
      </div>
      <div className="shrink-0 text-right">
        <div className="text-xs font-black tabular-nums text-slate-800">{value}</div>
        {valueSub ? <div className="text-[10px] font-semibold text-slate-400">{valueSub}</div> : null}
      </div>
    </Wrapper>
  );
}

// ─── Segmented control ─────────────────────────────────────────────────────────

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="inline-flex rounded-xl bg-slate-100 p-0.5" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-[10px] px-2.5 py-1 text-[11px] font-bold transition-all ${
            value === option.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
