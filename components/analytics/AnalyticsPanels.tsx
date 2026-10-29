import React, { memo, useContext, useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  BadgeEuro,
  ChevronRight,
  Coins,
  Crosshair,
  Download,
  FileText,
  Gem,
  Lightbulb,
  Receipt,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users,
  Waypoints,
} from 'lucide-react';
import type { FinanceAnalytics, FinanceSellerRanking } from '../../utils/financeAnalytics';
import { formatDecimal, formatNumber } from '../../utils/numberFormat';
import { convertToCSV, downloadFile } from '../../utils/exportUtils';
import type { ProfitLossLine } from '../../features/dashboard/dashboardCommandViewModels';
import {
  PROFIT_DIMENSIONS,
  type AbcClass,
  type Insight,
  type InsightTone,
  type ParetoSummary,
  type PeriodForecast,
  type ProfitDimension,
  type ProfitabilityRow,
  type TrendPoint,
} from '../../features/analytics/analyticsViewModels';
import {
  DashboardPrivacyContext,
  DeltaBadge,
  EmptyNote,
  Money,
  Panel,
  Segmented,
  Sparkline,
} from '../dashboard/DashboardKit';

// ─── Shared bits ───────────────────────────────────────────────────────────────

const HIDDEN = '•••••';

function useHidden() {
  return useContext(DashboardPrivacyContext);
}

function compactEuro(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${formatDecimal(value / 1_000_000, 1)}M €`;
  if (abs >= 1_000) return `${formatDecimal(value / 1_000, abs >= 10_000 ? 0 : 1)}k €`;
  return `${formatNumber(Math.round(value))} €`;
}

export function marginTone(margin: number): string {
  if (margin >= 55) return 'bg-emerald-50 text-emerald-700 ring-emerald-200/70';
  if (margin >= 40) return 'bg-teal-50 text-teal-700 ring-teal-200/70';
  if (margin >= 25) return 'bg-amber-50 text-amber-700 ring-amber-200/70';
  return 'bg-rose-50 text-rose-700 ring-rose-200/70';
}

function MarginChip({ margin }: { margin: number }) {
  return (
    <span className={`inline-flex min-w-[3.25rem] justify-center rounded-lg px-1.5 py-0.5 text-[11px] font-black tabular-nums ring-1 ${marginTone(margin)}`}>
      {formatDecimal(margin, 1)}%
    </span>
  );
}

const ABC_STYLE: Record<AbcClass, string> = {
  A: 'bg-emerald-600 text-white',
  B: 'bg-sky-100 text-sky-700',
  C: 'bg-slate-100 text-slate-500',
};

function AbcBadge({ value }: { value: AbcClass }) {
  return (
    <span
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-black ${ABC_STYLE[value]}`}
      title={value === 'A' ? 'Κατηγορία A: φέρνει το πρώτο 80% των εσόδων' : value === 'B' ? 'Κατηγορία B: το επόμενο 15% των εσόδων' : 'Κατηγορία C: το τελευταίο 5% των εσόδων'}
    >
      {value}
    </span>
  );
}

/** Margin change expressed in percentage points. */
export function PointsDelta({ points }: { points: number | null }) {
  if (points === null || !Number.isFinite(points)) return <DeltaBadge delta={null} />;
  const flat = Math.abs(points) < 0.1;
  const classes = flat ? 'bg-slate-100 text-slate-500' : points > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700';
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-black tabular-nums ${classes}`} title="Μεταβολή σε ποσοστιαίες μονάδες">
      {points > 0 ? '+' : ''}
      {formatDecimal(points, 1)} μον.
    </span>
  );
}

// ─── Hero ──────────────────────────────────────────────────────────────────────

export const RevenueHero = memo(function RevenueHero({
  finance,
  revenueDelta,
  comparisonLabel,
  forecast,
  sparkline,
}: {
  finance: FinanceAnalytics;
  revenueDelta: number | null;
  comparisonLabel: string | null;
  forecast: PeriodForecast | null;
  sparkline: number[];
}) {
  const hidden = useHidden();
  const { totals } = finance;
  return (
    <section className="relative isolate flex min-w-0 flex-col overflow-hidden rounded-3xl bg-gradient-to-br from-[#1c2812] via-[#0b1204] to-[#060b00] p-5 text-white shadow-lg shadow-[#060b00]/20 ring-1 ring-inset ring-white/10 sm:p-6">
      <div className="pointer-events-none absolute -right-20 -top-24 -z-10 h-64 w-64 rounded-full bg-emerald-500/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-24 left-1/4 -z-10 h-56 w-56 rounded-full bg-amber-400/10 blur-3xl" aria-hidden />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-200/70">Καθαρά έσοδα · {finance.period.label}</p>
          <div className="mt-2 truncate text-4xl font-black tracking-tight sm:text-[2.6rem]">
            <Money value={totals.realizedNet} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-white/60">
            {comparisonLabel ? (
              <>
                <DeltaBadge delta={revenueDelta} title={comparisonLabel} />
                <span>{comparisonLabel}</span>
              </>
            ) : (
              <span>Από αποστολές, μετά την έκπτωση, χωρίς ΦΠΑ</span>
            )}
          </div>
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-inset ring-white/15">
          <BadgeEuro size={20} />
        </span>
      </div>

      <div className="mt-4 -mx-1">
        <Sparkline values={sparkline} color="#34d399" height={52} />
        <p className="mt-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-white/35">Τελευταίοι 12 μήνες</p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-4">
        {[
          { label: 'Μικτό κέρδος', value: <Money value={totals.estimatedProfit} decimals={false} /> },
          { label: 'Μέση παραγγελία', value: <Money value={totals.averageOrderValue} decimals={false} /> },
          { label: 'Τεμάχια', value: formatNumber(totals.shippedPieces) },
        ].map((item) => (
          <div key={item.label} className="min-w-0">
            <p className="truncate text-[10px] font-bold uppercase tracking-wide text-white/45">{item.label}</p>
            <p className="mt-0.5 truncate text-base font-black tabular-nums">{item.value}</p>
          </div>
        ))}
      </div>

      {forecast ? (
        <div className="mt-4 rounded-2xl bg-white/[0.06] p-3 ring-1 ring-inset ring-white/10">
          <div className="flex items-center justify-between gap-3 text-[11px] font-bold">
            <span className="flex items-center gap-1.5 text-white/70"><Crosshair size={13} /> Πρόβλεψη τέλους περιόδου</span>
            <span className="tabular-nums text-emerald-200">{hidden ? HIDDEN : compactEuro(forecast.projectedRevenue)}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300" style={{ width: `${forecast.elapsedPct}%` }} />
          </div>
          <p className="mt-1.5 text-[10px] font-semibold text-white/45">
            {formatDecimal(forecast.elapsedPct, 0)}% της περιόδου · απομένουν {formatNumber(forecast.daysLeft)} ημέρες
          </p>
        </div>
      ) : null}
    </section>
  );
});

// ─── Insights ──────────────────────────────────────────────────────────────────

const INSIGHT_STYLE: Record<InsightTone, { card: string; icon: string; Icon: typeof Lightbulb }> = {
  warning: { card: 'border-amber-200/80 bg-amber-50/60', icon: 'bg-amber-100 text-amber-700', Icon: AlertTriangle },
  negative: { card: 'border-rose-200/80 bg-rose-50/50', icon: 'bg-rose-100 text-rose-700', Icon: TrendingDown },
  positive: { card: 'border-emerald-200/80 bg-emerald-50/50', icon: 'bg-emerald-100 text-emerald-700', Icon: TrendingUp },
  info: { card: 'border-slate-200/80 bg-white', icon: 'bg-sky-50 text-sky-600', Icon: Lightbulb },
};

export const InsightsPanel = memo(function InsightsPanel({
  insights,
  onAction,
}: {
  insights: Insight[];
  onAction: (action: NonNullable<Insight['action']>) => void;
}) {
  const hidden = useHidden();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? insights : insights.slice(0, 6);

  return (
    <Panel
      title="Τι αξίζει να προσέξετε"
      subtitle="Αυτόματες παρατηρήσεις από τα δεδομένα της περιόδου"
      icon={Sparkles}
      tone="amber"
      headerExtra={insights.length > 6 ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="rounded-lg px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          {expanded ? 'Λιγότερα' : `Όλες (${insights.length})`}
        </button>
      ) : undefined}
    >
      {insights.length === 0 ? (
        <EmptyNote message="Όλα φαίνονται ομαλά — καμία ιδιαίτερη παρατήρηση για την περίοδο." icon={Sparkles} />
      ) : (
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 2xl:grid-cols-3">
          {visible.map((insight) => {
            const style = INSIGHT_STYLE[insight.tone];
            const Wrapper = insight.action ? 'button' : 'div';
            return (
              <Wrapper
                key={insight.id}
                {...(insight.action ? { type: 'button' as const, onClick: () => onAction(insight.action!) } : {})}
                className={`group flex min-w-0 items-start gap-3 rounded-2xl border p-3 text-left transition-all ${style.card} ${
                  insight.action ? 'hover:-translate-y-px hover:shadow-sm' : ''
                }`}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${style.icon}`}>
                  <style.Icon size={15} strokeWidth={2.25} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[13px] font-bold leading-snug text-slate-800 ${hidden && /€/.test(insight.title) ? 'blur-[5px]' : ''}`}>
                    {insight.title}
                  </span>
                  <span className={`mt-0.5 block text-xs font-medium leading-relaxed text-slate-500 ${hidden && /€/.test(insight.detail) ? 'blur-[5px]' : ''}`}>
                    {insight.detail}
                  </span>
                </span>
                {insight.action ? <ChevronRight size={15} className="mt-1 shrink-0 text-slate-300 transition-colors group-hover:text-slate-600" /> : null}
              </Wrapper>
            );
          })}
        </div>
      )}
    </Panel>
  );
});

// ─── Trend chart ───────────────────────────────────────────────────────────────

type TrendMetric = 'money' | 'pieces' | 'orders';

const TREND_OPTIONS: Array<{ value: TrendMetric; label: string }> = [
  { value: 'money', label: 'Έσοδα & κέρδος' },
  { value: 'pieces', label: 'Τεμάχια' },
  { value: 'orders', label: 'Παραγγελίες' },
];

function TrendTooltip({ active, payload, metric, hidden }: { active?: boolean; payload?: Array<{ payload: TrendPoint & { inPeriod: boolean } }>; metric: TrendMetric; hidden: boolean }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const money = (value: number) => (hidden ? HIDDEN : `${formatDecimal(value, 2)} €`);
  const yoy = point.lastYearRevenue > 0 ? ((point.revenue - point.lastYearRevenue) / point.lastYearRevenue) * 100 : null;
  return (
    <div className="min-w-[13rem] rounded-2xl border border-slate-200 bg-white/95 p-3 text-xs shadow-xl backdrop-blur">
      <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-slate-400">{point.label}</p>
      {metric === 'money' ? (
        <div className="space-y-1">
          <Row dot="#10b981" label="Έσοδα" value={money(point.revenue)} />
          <Row dot="#0f172a" label="Κέρδος" value={money(point.profit)} />
          <Row label="Περιθώριο" value={`${formatDecimal(point.margin, 1)}%`} />
          <div className="my-1.5 border-t border-slate-100" />
          <Row dot="#94a3b8" label="Ίδιος μήνας πέρσι" value={money(point.lastYearRevenue)} />
          {yoy !== null ? <Row label="Μεταβολή" value={<DeltaBadge delta={yoy} />} /> : null}
        </div>
      ) : (
        <div className="space-y-1">
          <Row dot="#10b981" label={metric === 'pieces' ? 'Τεμάχια' : 'Παραγγελίες'} value={formatNumber(metric === 'pieces' ? point.pieces : point.orders)} />
          <Row label="Έσοδα" value={money(point.revenue)} />
        </div>
      )}
    </div>
  );
}

function Row({ dot, label, value }: { dot?: string; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 font-semibold text-slate-500">
        {dot ? <span className="h-2 w-2 rounded-full" style={{ background: dot }} /> : null}
        {label}
      </span>
      <span className="font-black tabular-nums text-slate-800">{value}</span>
    </div>
  );
}

export const TrendChartPanel = memo(function TrendChartPanel({
  points,
  periodStart,
  periodEnd,
  className = '',
}: {
  points: TrendPoint[];
  periodStart: Date | null;
  periodEnd: Date | null;
  className?: string;
}) {
  const hidden = useHidden();
  const [metric, setMetric] = useState<TrendMetric>('money');
  const [showLastYear, setShowLastYear] = useState(true);

  const data = useMemo(
    () =>
      points.map((point) => {
        const [year, month] = point.key.split('-').map(Number);
        const date = new Date(year, month, 1);
        const inPeriod = !periodStart || !periodEnd || (date >= new Date(periodStart.getFullYear(), periodStart.getMonth(), 1) && date < periodEnd);
        return { ...point, inPeriod };
      }),
    [points, periodStart, periodEnd],
  );
  const hasData = points.some((point) => point.revenue !== 0 || point.lastYearRevenue !== 0);
  const total12 = points.reduce((sum, point) => sum + point.revenue, 0);
  const totalLastYear = points.reduce((sum, point) => sum + point.lastYearRevenue, 0);
  const yoy = totalLastYear > 0 ? ((total12 - totalLastYear) / totalLastYear) * 100 : null;
  const barKey = metric === 'money' ? 'revenue' : metric;

  return (
    <Panel
      title="Πορεία 12 μηνών"
      subtitle="Ανά μήνα αποστολής · τονισμένοι οι μήνες της επιλεγμένης περιόδου"
      icon={TrendingUp}
      tone="emerald"
      className={className}
      headerExtra={<Segmented<TrendMetric> value={metric} onChange={setMetric} options={TREND_OPTIONS} ariaLabel="Μέτρο γραφήματος" />}
    >
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-semibold text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> {metric === 'money' ? 'Έσοδα' : metric === 'pieces' ? 'Τεμάχια' : 'Παραγγελίες'}</span>
        {metric === 'money' ? <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-slate-900" /> Κέρδος</span> : null}
        {metric === 'money' ? (
          <button
            type="button"
            onClick={() => setShowLastYear((value) => !value)}
            aria-pressed={showLastYear}
            className={`flex items-center gap-1.5 rounded-lg px-1.5 py-0.5 transition-colors ${showLastYear ? 'text-slate-600' : 'text-slate-300 line-through'}`}
          >
            <span className="h-0 w-4 border-t-2 border-dashed border-slate-400" /> Πέρσι
          </button>
        ) : null}
        {metric === 'money' && yoy !== null ? (
          <span className="ml-auto flex items-center gap-1.5">12μηνο έναντι προηγούμενου <DeltaBadge delta={yoy} /></span>
        ) : null}
      </div>
      {hasData ? (
        <div className="h-72 min-h-[16rem] flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fontWeight: 600, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={0} minTickGap={0} />
              <YAxis
                width={metric === 'money' ? 56 : 40}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value: number) => (metric === 'money' ? (hidden ? '' : compactEuro(value)) : formatNumber(value))}
              />
              <Tooltip cursor={{ fill: 'rgba(15,23,42,0.04)' }} content={<TrendTooltip metric={metric} hidden={hidden} />} />
              <Bar dataKey={barKey} radius={[6, 6, 0, 0]} maxBarSize={36}>
                {data.map((point) => (
                  <Cell key={point.key} fill={point.inPeriod ? '#10b981' : '#a7f3d0'} />
                ))}
              </Bar>
              {metric === 'money' ? <Line type="monotone" dataKey="profit" stroke="#0f172a" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} /> : null}
              {metric === 'money' && showLastYear ? (
                <Line type="monotone" dataKey="lastYearRevenue" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 3 }} />
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyNote message="Δεν υπάρχουν αποστολές τους τελευταίους 12 μήνες." icon={TrendingUp} />
      )}
    </Panel>
  );
});

// ─── P&L waterfall ─────────────────────────────────────────────────────────────

export const ProfitBridgePanel = memo(function ProfitBridgePanel({ lines, className = '' }: { lines: ProfitLossLine[]; className?: string }) {
  const base = Math.max(1, ...lines.map((line) => Math.abs(line.value)));
  let level = 0;
  const bars = lines.map((line) => {
    let from = 0;
    let to = line.value;
    if (line.kind === 'minus') {
      from = level - line.value;
      to = level;
      level -= line.value;
    } else {
      level = line.value;
    }
    const left = (Math.max(0, Math.min(from, to)) / base) * 100;
    const width = Math.max(0.8, (Math.abs(to - from) / base) * 100);
    return { line, left, width };
  });
  const net = lines.find((line) => line.id === 'net')?.value ?? 0;

  return (
    <Panel title="Από τα έσοδα στο κέρδος" subtitle="Γέφυρα αποτελεσμάτων περιόδου" icon={Waypoints} tone="slate" className={className}>
      {net <= 0 ? (
        <EmptyNote message="Δεν υπάρχουν έσοδα στην περίοδο." icon={Waypoints} />
      ) : (
        <ul className="space-y-2.5">
          {bars.map(({ line, left, width }) => {
            const strong = line.kind === 'subtotal' || line.kind === 'result';
            const color = line.kind === 'minus' ? 'bg-rose-300' : line.kind === 'result' ? 'bg-slate-900' : line.kind === 'subtotal' ? 'bg-emerald-500' : 'bg-emerald-200';
            const share = net > 0 && line.id !== 'list' ? (line.value / net) * 100 : null;
            return (
              <li key={line.id} className={strong ? 'border-t border-dashed border-slate-200 pt-2.5' : ''}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                  <span className={strong ? 'font-black text-slate-800' : 'font-semibold text-slate-500'}>
                    {line.kind === 'minus' ? '− ' : ''}
                    {line.label}
                  </span>
                  <span className="flex items-baseline gap-2">
                    {share !== null && line.id !== 'net' ? (
                      <span className="text-[10px] font-bold tabular-nums text-slate-400">{formatDecimal(share, 1)}%</span>
                    ) : null}
                    <Money value={line.value} className={strong ? 'font-black text-slate-900' : 'font-bold text-slate-600'} />
                  </span>
                </div>
                <div className="relative h-2 rounded-full bg-slate-100">
                  <div className={`absolute inset-y-0 rounded-full ${color}`} style={{ left: `${left}%`, width: `${width}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
});

// ─── Compact ranked list (overview) ────────────────────────────────────────────

export const RankedMixPanel = memo(function RankedMixPanel({
  title,
  subtitle,
  icon,
  tone,
  rows,
  limit = 7,
  showAbc = false,
  onOpenAll,
  className = '',
}: {
  title: string;
  subtitle: string;
  icon: typeof Gem;
  tone: 'emerald' | 'violet' | 'sky' | 'amber';
  rows: ProfitabilityRow[];
  limit?: number;
  showAbc?: boolean;
  onOpenAll: () => void;
  className?: string;
}) {
  const top = rows.slice(0, limit);
  const max = Math.max(1, ...top.map((row) => row.revenue));
  const barColor = { emerald: 'bg-emerald-500', violet: 'bg-violet-500', sky: 'bg-sky-500', amber: 'bg-amber-500' }[tone];
  return (
    <Panel title={title} subtitle={subtitle} icon={icon} tone={tone} className={className} action={{ label: 'Ανάλυση', onClick: onOpenAll }}>
      {top.length === 0 ? (
        <EmptyNote message="Δεν υπάρχουν πωλήσεις στην περίοδο." icon={icon} />
      ) : (
        <ul className="space-y-3">
          {top.map((row) => (
            <li key={row.key} className="min-w-0">
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  {showAbc ? <AbcBadge value={row.abc} /> : null}
                  <span className="truncate text-xs font-bold text-slate-700" title={row.label}>{row.label}</span>
                  {row.missingCost ? <AlertTriangle size={12} className="shrink-0 text-amber-500" aria-label="Ελλιπές κόστος" /> : null}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {row.delta !== null ? <DeltaBadge delta={row.delta} /> : null}
                  <MarginChip margin={row.margin} />
                  <Money value={row.revenue} decimals={false} className="w-20 text-right text-xs font-black text-slate-800" />
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.max(2, (row.revenue / max) * 100)}%` }} />
                </div>
                <span className="w-10 text-right text-[10px] font-bold tabular-nums text-slate-400">{formatDecimal(row.share, 1)}%</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
});

// ─── Profitability workspace ───────────────────────────────────────────────────

type SortKey = 'label' | 'quantity' | 'orders' | 'revenue' | 'share' | 'profit' | 'margin' | 'delta';

const QUADRANTS = [
  { id: 'stars', label: 'Πυλώνες', hint: 'Μεγάλο μερίδιο, υψηλό περιθώριο — προστατέψτε τα.', color: '#059669' },
  { id: 'opportunities', label: 'Ευκαιρίες', hint: 'Υψηλό περιθώριο, μικρό μερίδιο — αξίζει προώθηση.', color: '#0ea5e9' },
  { id: 'volume', label: 'Όγκος χωρίς κέρδος', hint: 'Μεγάλο μερίδιο, χαμηλό περιθώριο — ελέγξτε τιμές/κόστη.', color: '#f59e0b' },
  { id: 'review', label: 'Υπό εξέταση', hint: 'Μικρό μερίδιο, χαμηλό περιθώριο.', color: '#94a3b8' },
] as const;

type QuadrantId = (typeof QUADRANTS)[number]['id'];

function quadrantOf(row: ProfitabilityRow, avgShare: number, avgMargin: number): QuadrantId {
  const highShare = row.share >= avgShare;
  const highMargin = row.margin >= avgMargin;
  if (highShare && highMargin) return 'stars';
  if (!highShare && highMargin) return 'opportunities';
  if (highShare) return 'volume';
  return 'review';
}

function ProfitMap({ rows, avgMargin }: { rows: ProfitabilityRow[]; avgMargin: number }) {
  const hidden = useHidden();
  const plotted = rows.filter((row) => row.revenue > 0).slice(0, 60);
  const avgShare = plotted.length > 0 ? 100 / plotted.length : 0;
  const counts = new Map<QuadrantId, number>();
  const data = plotted.map((row) => {
    const quadrant = quadrantOf(row, avgShare, avgMargin);
    counts.set(quadrant, (counts.get(quadrant) ?? 0) + 1);
    return { ...row, quadrant, x: row.share, y: row.margin, z: row.revenue };
  });

  if (data.length < 2) return <EmptyNote message="Χρειάζονται τουλάχιστον δύο εγγραφές για τον χάρτη." icon={Crosshair} />;

  return (
    <div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 16, bottom: 18, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis
              type="number"
              dataKey="x"
              name="Μερίδιο"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              tickFormatter={(value: number) => `${formatDecimal(value, 0)}%`}
              axisLine={false}
              tickLine={false}
              label={{ value: 'Μερίδιο εσόδων', position: 'insideBottom', offset: -10, fontSize: 11, fill: '#94a3b8' }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="Περιθώριο"
              width={44}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              tickFormatter={(value: number) => `${formatDecimal(value, 0)}%`}
              axisLine={false}
              tickLine={false}
            />
            <ZAxis type="number" dataKey="z" range={[40, 420]} />
            <ReferenceLine y={avgMargin} stroke="#cbd5e1" strokeDasharray="4 4" />
            <ReferenceLine x={avgShare} stroke="#cbd5e1" strokeDasharray="4 4" />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as (typeof data)[number];
                const quadrant = QUADRANTS.find((item) => item.id === row.quadrant)!;
                return (
                  <div className="min-w-[12rem] rounded-2xl border border-slate-200 bg-white/95 p-3 text-xs shadow-xl">
                    <p className="mb-1.5 truncate font-black text-slate-800">{row.label}</p>
                    <div className="space-y-1">
                      <Row label="Έσοδα" value={hidden ? HIDDEN : `${formatDecimal(row.revenue, 2)} €`} />
                      <Row label="Μερίδιο" value={`${formatDecimal(row.share, 1)}%`} />
                      <Row label="Περιθώριο" value={`${formatDecimal(row.margin, 1)}%`} />
                    </div>
                    <p className="mt-2 text-[10px] font-bold" style={{ color: quadrant.color }}>{quadrant.label}</p>
                  </div>
                );
              }}
            />
            <Scatter data={data}>
              {data.map((row) => (
                <Cell key={row.key} fill={QUADRANTS.find((item) => item.id === row.quadrant)!.color} fillOpacity={0.75} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {QUADRANTS.map((quadrant) => (
          <div key={quadrant.id} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
            <p className="flex items-center gap-1.5 text-[11px] font-black text-slate-700">
              <span className="h-2 w-2 rounded-full" style={{ background: quadrant.color }} />
              {quadrant.label}
              <span className="ml-auto tabular-nums text-slate-400">{formatNumber(counts.get(quadrant.id) ?? 0)}</span>
            </p>
            <p className="mt-0.5 text-[10px] font-medium leading-snug text-slate-500">{quadrant.hint}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ParetoStrip({ summary, dimensionLabel }: { summary: ParetoSummary; dimensionLabel: string }) {
  if (summary.count === 0) return null;
  const segments: Array<{ cls: AbcClass; count: number; color: string; text: string }> = [
    { cls: 'A', count: summary.aCount, color: 'bg-emerald-600', text: '80% εσόδων' },
    { cls: 'B', count: summary.bCount, color: 'bg-sky-300', text: '15% εσόδων' },
    { cls: 'C', count: summary.cCount, color: 'bg-slate-200', text: '5% εσόδων' },
  ];
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
      <p className="text-xs font-semibold text-slate-600">
        <span className="font-black text-slate-900">{formatNumber(summary.aCount)}</span> από {formatNumber(summary.count)} {dimensionLabel.toLowerCase()} (
        {formatDecimal(summary.aShareOfRows, 0)}%) φέρνουν το 80% των εσόδων.
      </p>
      <div className="mt-2 flex h-2.5 overflow-hidden rounded-full">
        {segments.map((segment) => (
          <div key={segment.cls} className={segment.color} style={{ width: `${(segment.count / summary.count) * 100}%` }} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-bold text-slate-500">
        {segments.map((segment) => (
          <span key={segment.cls} className="flex items-center gap-1.5">
            <AbcBadge value={segment.cls} /> {formatNumber(segment.count)} · {segment.text}
          </span>
        ))}
      </div>
    </div>
  );
}

export const ProfitabilityWorkspace = memo(function ProfitabilityWorkspace({
  rows,
  dimension,
  onDimensionChange,
  hasComparison,
  avgMargin,
  pareto,
  periodLabel,
  onOpenSku,
}: {
  rows: ProfitabilityRow[];
  dimension: ProfitDimension;
  onDimensionChange: (dimension: ProfitDimension) => void;
  hasComparison: boolean;
  avgMargin: number;
  pareto: ParetoSummary;
  periodLabel: string;
  onOpenSku?: (sku: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [sortDesc, setSortDesc] = useState(true);
  const [abcFilter, setAbcFilter] = useState<AbcClass | 'all'>('all');
  const [limit, setLimit] = useState(25);
  const dimensionMeta = PROFIT_DIMENSIONS.find((item) => item.value === dimension)!;

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('el-GR');
    const list = rows.filter(
      (row) => (abcFilter === 'all' || row.abc === abcFilter) && (!needle || row.label.toLocaleLowerCase('el-GR').includes(needle)),
    );
    const direction = sortDesc ? -1 : 1;
    return [...list].sort((a, b) => {
      if (sortKey === 'label') return direction * a.label.localeCompare(b.label, 'el');
      const av = sortKey === 'delta' ? a.delta ?? -Infinity : a[sortKey];
      const bv = sortKey === 'delta' ? b.delta ?? -Infinity : b[sortKey];
      return direction * (av - bv);
    });
  }, [rows, query, abcFilter, sortKey, sortDesc]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, row) => ({ revenue: acc.revenue + row.revenue, cost: acc.cost + row.cost, profit: acc.profit + row.profit, quantity: acc.quantity + row.quantity }),
        { revenue: 0, cost: 0, profit: 0, quantity: 0 },
      ),
    [filtered],
  );

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDesc((value) => !value);
    else {
      setSortKey(key);
      setSortDesc(key !== 'label');
    }
  };

  const exportCsv = () => {
    const data = filtered.map((row, index) => ({
      '#': index + 1,
      [dimensionMeta.singular]: row.label,
      ABC: row.abc,
      'Τεμάχια': row.quantity,
      'Παραγγελίες': row.orders,
      'Έσοδα (€)': row.revenue.toFixed(2),
      'Μερίδιο (%)': row.share.toFixed(1),
      'Κόστος (€)': row.cost.toFixed(2),
      'Κέρδος (€)': row.profit.toFixed(2),
      'Περιθώριο (%)': row.margin.toFixed(1),
      ...(hasComparison ? { 'Μεταβολή (%)': row.delta === null ? '' : row.delta.toFixed(1) } : {}),
    }));
    downloadFile(`﻿${convertToCSV(data)}`, `kerdoforia-${dimension}-${periodLabel.replace(/\s+/g, '-').toLowerCase()}.csv`, 'text/csv;charset=utf-8');
  };

  const header = (key: SortKey, label: string, align: 'left' | 'right' = 'right') => (
    <th className={`whitespace-nowrap px-3 py-2.5 text-[10px] font-black uppercase tracking-wide text-slate-400 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button type="button" onClick={() => toggleSort(key)} className={`inline-flex items-center gap-1 hover:text-slate-700 ${sortKey === key ? 'text-slate-800' : ''}`}>
        {label}
        {sortKey === key ? (sortDesc ? <ArrowDown size={11} /> : <ArrowUp size={11} />) : null}
      </button>
    </th>
  );

  const visible = filtered.slice(0, limit);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      <Panel
        title="Πίνακας κερδοφορίας"
        subtitle={`${dimensionMeta.label} · ${periodLabel}${hasComparison ? ' · με σύγκριση περιόδου' : ''}`}
        icon={Receipt}
        tone="emerald"
        className="xl:col-span-12"
        headerExtra={<Segmented value={dimension} onChange={onDimensionChange} options={PROFIT_DIMENSIONS.map(({ value, label }) => ({ value, label }))} ariaLabel="Διάσταση ανάλυσης" />}
      >
        <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative flex min-w-0 flex-1 items-center">
            <Search size={14} className="pointer-events-none absolute left-3 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Αναζήτηση ${dimensionMeta.label.toLowerCase()}…`}
              className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium text-slate-800 outline-none transition-shadow placeholder:text-slate-400 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<AbcClass | 'all'>
              value={abcFilter}
              onChange={setAbcFilter}
              options={[
                { value: 'all', label: 'Όλα' },
                { value: 'A', label: 'A' },
                { value: 'B', label: 'B' },
                { value: 'C', label: 'C' },
              ]}
              ariaLabel="Φίλτρο ABC"
            />
            <button
              type="button"
              onClick={exportCsv}
              disabled={filtered.length === 0}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 shadow-sm transition-colors hover:text-slate-900 disabled:opacity-40"
            >
              <Download size={14} /> CSV
            </button>
          </div>
        </div>

        <ParetoStrip summary={pareto} dimensionLabel={dimensionMeta.label} />

        {filtered.length === 0 ? (
          <div className="mt-3"><EmptyNote message="Δεν βρέθηκαν εγγραφές." icon={Search} /></div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-100">
            <table className="w-full min-w-[860px] border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50/95 backdrop-blur">
                <tr className="border-b border-slate-100">
                  <th className="w-10 px-3 py-2.5 text-left text-[10px] font-black uppercase text-slate-400">#</th>
                  {header('label', dimensionMeta.singular, 'left')}
                  {header('quantity', 'Τεμ.')}
                  {header('orders', 'Παραγγ.')}
                  {header('revenue', 'Έσοδα')}
                  {header('share', 'Μερίδιο')}
                  {header('profit', 'Κέρδος')}
                  {header('margin', 'Περιθώριο')}
                  {hasComparison ? header('delta', 'Μεταβολή') : null}
                </tr>
              </thead>
              <tbody>
                {visible.map((row, index) => {
                  const clickable = dimension === 'product' && !row.isSpecial && row.sku && onOpenSku;
                  return (
                    <tr key={row.key} className="group border-b border-slate-50 transition-colors last:border-0 hover:bg-emerald-50/30">
                      <td className="px-3 py-2.5 font-bold tabular-nums text-slate-400">{index + 1}</td>
                      <td className="max-w-[18rem] px-3 py-2.5">
                        <span className="flex min-w-0 items-center gap-2">
                          <AbcBadge value={row.abc} />
                          {clickable ? (
                            <button
                              type="button"
                              onClick={() => onOpenSku!(row.sku!)}
                              className="inline-flex min-w-0 items-center gap-1 truncate font-bold text-slate-800 hover:text-emerald-700"
                              title="Άνοιγμα στο Μητρώο"
                            >
                              <span className="truncate">{row.label}</span>
                              <ArrowUpRight size={12} className="shrink-0 text-slate-300 group-hover:text-emerald-600" />
                            </button>
                          ) : (
                            <span className="truncate font-bold text-slate-800" title={row.label}>{row.label}</span>
                          )}
                          {row.missingCost ? <AlertTriangle size={12} className="shrink-0 text-amber-500" aria-label="Ελλιπές κόστος" /> : null}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-600">{formatNumber(row.quantity)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-600">{formatNumber(row.orders)}</td>
                      <td className="px-3 py-2.5 text-right"><Money value={row.revenue} className="font-black text-slate-900" /></td>
                      <td className="px-3 py-2.5">
                        <div className="ml-auto flex w-28 items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, Math.max(2, row.share))}%` }} />
                          </div>
                          <span className="w-10 text-right text-[11px] font-bold tabular-nums text-slate-500">{formatDecimal(row.share, 1)}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right"><Money value={row.profit} className={`font-bold ${row.profit < 0 ? 'text-rose-600' : 'text-slate-700'}`} /></td>
                      <td className="px-3 py-2.5 text-right"><MarginChip margin={row.margin} /></td>
                      {hasComparison ? (
                        <td className="px-3 py-2.5 text-right">
                          {row.delta !== null ? (
                            <DeltaBadge delta={row.delta} />
                          ) : row.previousRevenue === 0 ? (
                            <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-black text-violet-600">Νέο</span>
                          ) : (
                            <DeltaBadge delta={null} />
                          )}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50/80">
                  <td />
                  <td className="px-3 py-2.5 text-[11px] font-black uppercase text-slate-500">
                    Σύνολο {filtered.length !== rows.length ? `(${formatNumber(filtered.length)} φιλτραρισμένα)` : ''}
                  </td>
                  <td className="px-3 py-2.5 text-right font-black tabular-nums text-slate-700">{formatNumber(totals.quantity)}</td>
                  <td />
                  <td className="px-3 py-2.5 text-right"><Money value={totals.revenue} className="font-black text-slate-900" /></td>
                  <td />
                  <td className="px-3 py-2.5 text-right"><Money value={totals.profit} className="font-black text-slate-900" /></td>
                  <td className="px-3 py-2.5 text-right"><MarginChip margin={totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0} /></td>
                  {hasComparison ? <td /> : null}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {filtered.length > limit ? (
          <button
            type="button"
            onClick={() => setLimit((value) => value + 50)}
            className="mt-3 w-full rounded-xl border border-dashed border-slate-200 py-2 text-xs font-bold text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-800"
          >
            Εμφάνιση περισσότερων ({formatNumber(filtered.length - limit)} ακόμη)
          </button>
        ) : null}
      </Panel>

      <Panel
        title="Χάρτης κερδοφορίας"
        subtitle={`Μερίδιο εσόδων × περιθώριο · γραμμές στον μέσο όρο (${formatDecimal(avgMargin, 1)}%)`}
        icon={Crosshair}
        tone="sky"
        className="xl:col-span-12"
      >
        <ProfitMap rows={rows} avgMargin={avgMargin} />
      </Panel>
    </div>
  );
});

// ─── Customers & sellers ───────────────────────────────────────────────────────

const CONCENTRATION_COLORS = ['#059669', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0'];

export const CustomersPanel = memo(function CustomersPanel({
  rows,
  hasComparison,
  onOpenAll,
}: {
  rows: ProfitabilityRow[];
  hasComparison: boolean;
  onOpenAll: () => void;
}) {
  const top5 = rows.slice(0, 5);
  const top5Share = top5.reduce((sum, row) => sum + row.share, 0);
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const avgPerCustomer = rows.length > 0 ? totalRevenue / rows.length : 0;
  const risk = (rows[0]?.share ?? 0) >= 25 || top5Share >= 70 ? 'Υψηλή' : top5Share >= 50 ? 'Μέτρια' : 'Χαμηλή';
  const riskClass = risk === 'Υψηλή' ? 'bg-rose-50 text-rose-700' : risk === 'Μέτρια' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700';

  return (
    <Panel title="Πελάτες" subtitle="Έσοδα, συχνότητα και κερδοφορία ανά πελάτη" icon={Users} tone="sky" action={{ label: 'Πλήρης πίνακας', onClick: onOpenAll }}>
      {rows.length === 0 ? (
        <EmptyNote message="Δεν υπάρχουν πωλήσεις σε πελάτες στην περίοδο." icon={Users} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Ενεργοί πελάτες</p>
              <p className="mt-0.5 text-lg font-black tabular-nums text-slate-900">{formatNumber(rows.length)}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Μ.Ο. ανά πελάτη</p>
              <p className="mt-0.5 text-lg font-black text-slate-900"><Money value={avgPerCustomer} decimals={false} /></p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Top 5 μερίδιο</p>
              <p className="mt-0.5 text-lg font-black tabular-nums text-slate-900">{formatDecimal(top5Share, 0)}%</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Εξάρτηση</p>
              <p className={`mt-1 inline-flex rounded-lg px-2 py-0.5 text-sm font-black ${riskClass}`}>{risk}</p>
            </div>
          </div>

          <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-100" aria-label="Συγκέντρωση εσόδων">
            {top5.map((row, index) => (
              <div key={row.key} style={{ width: `${row.share}%`, background: CONCENTRATION_COLORS[index] }} title={`${row.label}: ${formatDecimal(row.share, 1)}%`} />
            ))}
          </div>

          <ul className="mt-3 divide-y divide-slate-100">
            {rows.slice(0, 10).map((row, index) => (
              <li key={row.key} className="flex items-center gap-3 py-2.5">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-black tabular-nums ${
                    index < 5 ? 'text-white' : 'bg-slate-100 text-slate-400'
                  }`}
                  style={index < 5 ? { background: CONCENTRATION_COLORS[index] } : undefined}
                >
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-800">{row.label}</p>
                  <p className="text-[11px] font-medium text-slate-400">
                    {formatNumber(row.orders)} {row.orders === 1 ? 'παραγγελία' : 'παραγγελίες'} · μ.ο. <Money value={row.orders > 0 ? row.revenue / row.orders : 0} decimals={false} />
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {hasComparison ? (row.delta !== null ? <DeltaBadge delta={row.delta} /> : row.previousRevenue === 0 ? <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-black text-violet-600">Νέος</span> : null) : null}
                  <MarginChip margin={row.margin} />
                  <div className="w-24 text-right">
                    <Money value={row.revenue} decimals={false} className="block text-xs font-black text-slate-900" />
                    <span className="text-[10px] font-bold tabular-nums text-slate-400">{formatDecimal(row.share, 1)}%</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
});

export const SellersPanel = memo(function SellersPanel({ sellers }: { sellers: FinanceSellerRanking[] }) {
  const earned = sellers.reduce((sum, seller) => sum + seller.earnedCommission, 0);
  const pending = sellers.reduce((sum, seller) => sum + seller.pendingCommission, 0);
  const max = Math.max(1, ...sellers.map((seller) => seller.revenue + seller.pendingRevenue));
  return (
    <Panel title="Πλασιέ & προμήθειες" subtitle="Πραγματοποιημένα και εκκρεμή" icon={UserCheck} tone="violet">
      {sellers.length === 0 ? (
        <EmptyNote message="Δεν υπάρχουν πωλήσεις από πλασιέ στην περίοδο." icon={UserCheck} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-violet-50 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-violet-500">Κερδισμένες προμήθειες</p>
              <p className="mt-0.5 text-lg font-black text-slate-900"><Money value={earned} /></p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Εκκρεμείς προμήθειες</p>
              <p className="mt-0.5 text-lg font-black text-slate-900"><Money value={pending} /></p>
            </div>
          </div>
          <ul className="mt-3 space-y-3">
            {sellers.slice(0, 8).map((seller) => (
              <li key={seller.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-xs font-bold text-slate-800">{seller.name}</span>
                  <Money value={seller.revenue} decimals={false} className="text-xs font-black text-slate-900" />
                </div>
                <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="bg-violet-500" style={{ width: `${(seller.revenue / max) * 100}%` }} />
                  <div className="bg-violet-200" style={{ width: `${(seller.pendingRevenue / max) * 100}%` }} />
                </div>
                <p className="mt-1 text-[11px] font-medium text-slate-400">
                  {formatNumber(seller.orders)} παραγγ. · προμήθεια <Money value={seller.earnedCommission} /> · εκκρεμεί <Money value={seller.pendingCommission} />
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-4 text-[10px] font-bold text-slate-400">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-violet-500" /> Πραγματοποιημένα</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-violet-200" /> Σε ανοιχτές παραγγελίες</span>
          </div>
        </>
      )}
    </Panel>
  );
});

// ─── Cost structure ────────────────────────────────────────────────────────────

const COST_SLICES = [
  { key: 'silver', label: 'Ασήμι', color: '#64748b' },
  { key: 'labor', label: 'Εργατικά', color: '#3b82f6' },
  { key: 'materials', label: 'Πέτρες & υλικά', color: '#8b5cf6' },
  { key: 'other', label: 'Εκτιμήσεις (SP) / λοιπά', color: '#f59e0b' },
] as const;

export const CostStructurePanel = memo(function CostStructurePanel({
  finance,
  missingCostCount,
  onOpenMissingCosts,
}: {
  finance: FinanceAnalytics;
  missingCostCount: number;
  onOpenMissingCosts: () => void;
}) {
  const hidden = useHidden();
  const { totals, costBreakdown } = finance;
  const other = Math.max(0, totals.estimatedCost - costBreakdown.silver - costBreakdown.labor - costBreakdown.materials);
  const values: Record<(typeof COST_SLICES)[number]['key'], number> = { ...costBreakdown, other };
  const slices = COST_SLICES.map((slice) => ({ ...slice, value: values[slice.key] })).filter((slice) => slice.value > 0.005);
  const cogs = totals.realizedNet > 0 ? (totals.estimatedCost / totals.realizedNet) * 100 : 0;
  const costPerPiece = totals.shippedPieces > 0 ? totals.estimatedCost / totals.shippedPieces : 0;
  const revenuePerPiece = totals.shippedPieces > 0 ? totals.realizedNet / totals.shippedPieces : 0;

  return (
    <Panel title="Δομή κόστους" subtitle="Εκτιμώμενο κόστος παραγωγής πωληθέντων" icon={Coins} tone="slate">
      {totals.estimatedCost <= 0 ? (
        <EmptyNote message="Δεν υπάρχει κόστος για την περίοδο." icon={Coins} />
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative mx-auto h-44 w-44 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} dataKey="value" nameKey="label" innerRadius="66%" outerRadius="100%" paddingAngle={2} stroke="none" isAnimationActive={false}>
                  {slices.map((slice) => <Cell key={slice.key} fill={slice.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Κόστος / έσοδα</span>
              <span className="text-2xl font-black tabular-nums text-slate-900">{formatDecimal(cogs, 0)}%</span>
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            {slices.map((slice) => (
              <div key={slice.key} className="flex items-center justify-between gap-3 text-xs">
                <span className="flex min-w-0 items-center gap-2 font-semibold text-slate-600">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: slice.color }} />
                  <span className="truncate">{slice.label}</span>
                </span>
                <span className="flex items-baseline gap-2">
                  <span className="text-[10px] font-bold tabular-nums text-slate-400">{formatDecimal((slice.value / totals.estimatedCost) * 100, 0)}%</span>
                  <Money value={slice.value} className="font-black text-slate-800" />
                </span>
              </div>
            ))}
            <div className="mt-2 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Ασήμι</p>
                <p className="text-sm font-black tabular-nums text-slate-800">{formatDecimal(totals.silverWeightKg, 2)} kg</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Κόστος/τεμ.</p>
                <p className="text-sm font-black text-slate-800">{hidden ? HIDDEN : `${formatDecimal(costPerPiece, 2)} €`}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Τιμή/τεμ.</p>
                <p className="text-sm font-black text-slate-800">{hidden ? HIDDEN : `${formatDecimal(revenuePerPiece, 2)} €`}</p>
              </div>
            </div>
          </div>
        </div>
      )}
      {missingCostCount > 0 ? (
        <button
          type="button"
          onClick={onOpenMissingCosts}
          className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-left transition-colors hover:bg-amber-100/70"
        >
          <AlertTriangle size={16} className="shrink-0 text-amber-600" />
          <span className="min-w-0 flex-1 text-xs font-semibold text-amber-900">
            <b>{formatNumber(missingCostCount)}</b> {missingCostCount === 1 ? 'κωδικός δεν έχει' : 'κωδικοί δεν έχουν'} κόστος — το κέρδος υπερεκτιμάται.
          </span>
          <ChevronRight size={15} className="shrink-0 text-amber-500" />
        </button>
      ) : null}
    </Panel>
  );
});

// ─── Special creations, taxes, legal ───────────────────────────────────────────

export const RevenueQualityPanel = memo(function RevenueQualityPanel({ finance }: { finance: FinanceAnalytics }) {
  const { totals } = finance;
  const listValue = totals.realizedNet + totals.discount;
  const discountRate = listValue > 0 ? (totals.discount / listValue) * 100 : 0;
  const specialShare = totals.realizedNet > 0 ? (totals.specialNet / totals.realizedNet) * 100 : 0;
  const specialMargin = totals.specialNet > 0 ? (totals.specialProfit / totals.specialNet) * 100 : 0;
  return (
    <Panel title="Ποιότητα εσόδων" subtitle="Εκπτώσεις, ΦΠΑ και ειδικές κατασκευές" icon={Gem} tone="violet">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Εκπτώσεις</p>
          <p className="mt-0.5 text-base font-black text-slate-900"><Money value={totals.discount} /></p>
          <p className="text-[11px] font-semibold text-slate-500">{formatDecimal(discountRate, 1)}% της αξίας τιμοκαταλόγου</p>
        </div>
        <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">ΦΠΑ αποστολών</p>
          <p className="mt-0.5 text-base font-black text-slate-900"><Money value={totals.vat} /></p>
          <p className="text-[11px] font-semibold text-slate-500">Μικτά <Money value={totals.realizedGross} decimals={false} /></p>
        </div>
      </div>
      <div className="mt-3 rounded-2xl border border-violet-100 bg-violet-50/50 p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-black text-violet-900">Ειδικές κατασκευές (SP)</p>
          <span className="text-[10px] font-bold tabular-nums text-violet-500">{formatDecimal(specialShare, 1)}% των εσόδων</span>
        </div>
        {totals.specialPieces > 0 ? (
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-[10px] font-bold uppercase text-violet-400">Έσοδα</p>
              <Money value={totals.specialNet} decimals={false} className="font-black text-slate-900" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-violet-400">Κομμάτια</p>
              <p className="font-black tabular-nums text-slate-900">{formatNumber(totals.specialCreations)} · {formatNumber(totals.specialPieces)} τεμ.</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-violet-400">Εκτ. περιθώριο</p>
              <p className="font-black tabular-nums text-slate-900">{formatDecimal(specialMargin, 0)}%</p>
            </div>
          </div>
        ) : (
          <p className="mt-1 text-[11px] font-medium text-violet-700/70">Καμία ειδική κατασκευή στην περίοδο.</p>
        )}
      </div>
    </Panel>
  );
});

export const LegalReconciliationPanel = memo(function LegalReconciliationPanel({
  finance,
  onOpenLegal,
}: {
  finance: FinanceAnalytics;
  onOpenLegal?: () => void;
}) {
  const { legal, totals } = finance;
  const max = Math.max(1, totals.realizedNet, legal.issuedNet);
  const matched = Math.abs(legal.netGap) < 1;
  const coverage = totals.realizedNet > 0 ? (legal.issuedNet / totals.realizedNet) * 100 : 0;
  return (
    <Panel
      title="Συμφωνία με παραστατικά"
      subtitle="Αποστολές έναντι εκδοθέντων παραστατικών (χωρίς δελτία αποστολής)"
      icon={FileText}
      tone="indigo"
      action={onOpenLegal ? { label: 'Παραστατικά', onClick: onOpenLegal } : undefined}
    >
      {legal.issuedCount === 0 ? (
        <EmptyNote message="Δεν έχουν εκδοθεί παραστατικά στην περίοδο." icon={FileText} />
      ) : (
        <>
          <div className={`flex items-center justify-between gap-3 rounded-2xl px-3 py-2.5 ${matched ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
            <span className="text-xs font-bold">{matched ? 'Τα ποσά συμφωνούν' : legal.netGap > 0 ? 'Ατιμολόγητες αποστολές' : 'Τιμολογήθηκαν περισσότερα'}</span>
            <span className="text-sm font-black">
              Διαφορά <Money value={legal.netGap} />
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {[
              { label: 'Πραγματοποιημένα (αποστολές)', value: totals.realizedNet, color: 'bg-emerald-500' },
              { label: `Καθαρή αξία παραστατικών (${formatNumber(legal.issuedCount)})`, value: legal.issuedNet, color: 'bg-indigo-500' },
            ].map((item) => (
              <div key={item.label}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                  <span className="font-semibold text-slate-500">{item.label}</span>
                  <Money value={item.value} className="font-black text-slate-800" />
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${item.color}`} style={{ width: `${Math.max(1, (Math.max(0, item.value) / max) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-xs">
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400">Κάλυψη</p>
              <p className="font-black tabular-nums text-slate-800">{formatDecimal(coverage, 0)}%</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400">ΦΠΑ</p>
              <Money value={legal.issuedVat} decimals={false} className="font-black text-slate-800" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400">Μικτά</p>
              <Money value={legal.issuedGross} decimals={false} className="font-black text-slate-800" />
            </div>
          </div>
        </>
      )}
    </Panel>
  );
});
