import React, { memo, useContext, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Factory,
  Info,
  PackageCheck,
  PauseCircle,
  Send,
  Timer,
  Truck,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCurrency } from '../../utils/pricingEngine';
import { formatDecimal, formatNumber } from '../../utils/numberFormat';
import type { AdminPage } from '../../surfaces/pageIds';
import type {
  AttentionItem,
  AttentionSeverity,
  MonthlyTrendPoint,
  PipelineStep,
  StageLoadRow,
  StuckBatchRow,
} from '../../features/dashboard/dashboardCommandViewModels';
import type { ReadyOrdersSummary } from '../../features/dashboard/dashboardMosaicViewModels';
import type { DeliveryAttentionEntry } from '../../utils/deliveryScheduling';
import { VIBRANT_STAGES } from '../production/stageConstants';
import { DASHBOARD_TERM_HINTS } from '../../features/dashboard/dashboardTermHints';
import OrderCustomerName from '../orders/OrderCustomerName';
import { DashboardPrivacyContext, EmptyNote, Money, Panel, Segmented, Shimmer } from './DashboardKit';

type Navigate = (page: AdminPage) => void;

// ─── Attention strip ───────────────────────────────────────────────────────────

const SEVERITY_STYLE: Record<AttentionSeverity, { card: string; count: string; icon: LucideIcon; iconClass: string }> = {
  critical: { card: 'border-rose-200 bg-rose-50/70 hover:border-rose-300', count: 'text-rose-700', icon: AlertOctagon, iconClass: 'text-rose-500' },
  warning: { card: 'border-amber-200 bg-amber-50/60 hover:border-amber-300', count: 'text-amber-700', icon: AlertTriangle, iconClass: 'text-amber-500' },
  action: { card: 'border-emerald-200 bg-emerald-50/70 hover:border-emerald-300', count: 'text-emerald-700', icon: PackageCheck, iconClass: 'text-emerald-500' },
  info: { card: 'border-slate-200 bg-white hover:border-slate-300', count: 'text-slate-700', icon: Info, iconClass: 'text-slate-400' },
};

export const AttentionStrip = memo(function AttentionStrip({
  items,
  isLoading,
  onSelect,
}: {
  items: AttentionItem[];
  isLoading: boolean;
  onSelect: (item: AttentionItem) => void;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,13.5rem),1fr))] gap-3">
        {Array.from({ length: 4 }, (_, index) => (
          <Shimmer key={index} className="h-[4.5rem] rounded-2xl" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-5 py-4">
        <CheckCircle2 size={20} className="shrink-0 text-emerald-500" />
        <div>
          <p className="text-sm font-bold text-emerald-900">Όλα υπό έλεγχο</p>
          <p className="text-xs font-medium text-emerald-700/80">Καμία εκκρεμότητα που χρειάζεται προσοχή αυτή τη στιγμή.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,13.5rem),1fr))] gap-3" role="list" aria-label="Χρειάζονται προσοχή">
      {items.map((item) => {
        const style = SEVERITY_STYLE[item.severity];
        const Icon = style.icon;
        return (
          <button
            key={item.id}
            type="button"
            role="listitem"
            onClick={() => onSelect(item)}
            className={`group flex min-w-0 items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm ${style.card}`}
          >
            <Icon size={16} className={`mt-1 shrink-0 ${style.iconClass}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className={`text-xl font-black tabular-nums leading-none ${style.count}`}>
                  {item.id === 'legal' ? '!' : formatNumber(item.count)}
                </span>
                <span className="truncate text-xs font-bold text-slate-800">{item.title}</span>
              </div>
              <p className="mt-1 truncate text-[11px] font-medium text-slate-500">{item.detail}</p>
            </div>
            <ArrowRight size={14} className="mt-1 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
          </button>
        );
      })}
    </div>
  );
});

// ─── Revenue trend ─────────────────────────────────────────────────────────────

type TrendMetric = 'revenue' | 'pieces';

function TrendTooltip({ active, payload, metric, hidden }: { active?: boolean; payload?: Array<{ payload: MonthlyTrendPoint }>; metric: TrendMetric; hidden: boolean }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const money = (value: number) => (hidden ? '•••' : formatCurrency(value));
  return (
    <div className="min-w-[11rem] rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-xs shadow-xl">
      <p className="mb-1.5 font-black text-slate-800">{point.label}</p>
      {metric === 'revenue' ? (
        <>
          <TooltipLine color="#0f766e" label="Καθαρά έσοδα" value={money(point.revenue)} />
          <TooltipLine color="#f59e0b" label="Μικτό κέρδος" value={money(point.profit)} />
          <TooltipLine label="Περιθώριο" value={`${formatDecimal(point.margin, 1)}%`} />
        </>
      ) : (
        <>
          <TooltipLine color="#0f766e" label="Τεμάχια" value={formatNumber(point.pieces)} />
          <TooltipLine color="#f59e0b" label="Παραγγελίες" value={formatNumber(point.orders)} />
        </>
      )}
    </div>
  );
}

function TooltipLine({ color, label, value }: { color?: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="flex items-center gap-1.5 text-slate-500">
        {color ? <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} /> : <span className="w-2" />}
        {label}
      </span>
      <span className="font-black tabular-nums text-slate-800">{value}</span>
    </div>
  );
}

function compactEuro(value: number): string {
  if (Math.abs(value) >= 1000) return `${formatDecimal(value / 1000, value >= 10000 ? 0 : 1)}k`;
  return formatNumber(Math.round(value));
}

export const TrendPanel = memo(function TrendPanel({
  data,
  isLoading,
  className = '',
  onOpenAnalytics,
}: {
  data: MonthlyTrendPoint[];
  isLoading: boolean;
  className?: string;
  onOpenAnalytics?: () => void;
}) {
  const hidden = useContext(DashboardPrivacyContext);
  const [metric, setMetric] = useState<TrendMetric>('revenue');
  const total = data.reduce((sum, point) => sum + point.revenue, 0);
  const totalPieces = data.reduce((sum, point) => sum + point.pieces, 0);
  const hasData = data.some((point) => point.revenue !== 0 || point.pieces !== 0);
  const primaryKey = metric === 'revenue' ? 'revenue' : 'pieces';
  const secondaryKey = metric === 'revenue' ? 'profit' : 'orders';

  return (
    <Panel
      title="Πορεία 12 μηνών"
      subtitle={metric === 'revenue' ? 'Καθαρά έσοδα & μικτό κέρδος ανά μήνα' : 'Τεμάχια & παραγγελίες με αποστολή ανά μήνα'}
      icon={Workflow}
      tone="emerald"
      className={className}
      isLoading={isLoading}
      skeletonRows={6}
      action={onOpenAnalytics ? { label: 'Αναλυτικά', onClick: onOpenAnalytics } : undefined}
      headerExtra={
        <Segmented<TrendMetric>
          value={metric}
          onChange={setMetric}
          ariaLabel="Μέτρο γραφήματος"
          options={[
            { value: 'revenue', label: 'Αξία' },
            { value: 'pieces', label: 'Όγκος' },
          ]}
        />
      }
    >
      {!hasData ? (
        <EmptyNote message="Δεν υπάρχουν αποστολές τους τελευταίους 12 μήνες." />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Σύνολο 12μήνου</span>
              <div className="text-xl font-black text-slate-900">
                {metric === 'revenue' ? <Money value={total} /> : `${formatNumber(totalPieces)} τεμ.`}
              </div>
            </div>
            <div className="flex items-center gap-4 text-[11px] font-semibold text-slate-500">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-teal-700" />{metric === 'revenue' ? 'Έσοδα' : 'Τεμάχια'}</span>
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 rounded-full bg-amber-500" />{metric === 'revenue' ? 'Κέρδος' : 'Παραγγελίες'}</span>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                  tickFormatter={(value: number) => (metric === 'revenue' ? (hidden ? '•' : compactEuro(value)) : formatNumber(value))}
                />
                {metric === 'pieces' ? <YAxis yAxisId="right" orientation="right" hide /> : null}
                <Tooltip content={<TrendTooltip metric={metric} hidden={hidden} />} cursor={{ fill: '#f8fafc' }} />
                <Bar yAxisId="left" dataKey={primaryKey} fill="#0f766e" radius={[6, 6, 0, 0]} maxBarSize={34} isAnimationActive={false} />
                <Line
                  yAxisId={metric === 'revenue' ? 'left' : 'right'}
                  type="monotone"
                  dataKey={secondaryKey}
                  stroke="#f59e0b"
                  strokeWidth={2.25}
                  dot={{ r: 2.5, fill: '#f59e0b', strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Panel>
  );
});

// ─── Order pipeline ────────────────────────────────────────────────────────────

const PIPELINE_DOT: Record<PipelineStep['id'], string> = {
  offers: 'bg-sky-400',
  pending: 'bg-slate-400',
  production: 'bg-amber-500',
  ready: 'bg-emerald-500',
  partial: 'bg-violet-500',
  shipped: 'bg-teal-700',
};

export const PipelinePanel = memo(function PipelinePanel({
  steps,
  isLoading,
  onNavigate,
  className = '',
}: {
  steps: PipelineStep[];
  isLoading: boolean;
  onNavigate: Navigate;
  className?: string;
}) {
  const max = Math.max(1, ...steps.map((step) => step.count));
  return (
    <Panel
      title="Ροή παραγγελιών"
      subtitle="Από την προσφορά ως την αποστολή"
      icon={Send}
      tone="sky"
      className={className}
      isLoading={isLoading}
      skeletonRows={6}
      hint="Ανοιχτές προσφορές και παραγγελίες ανά φάση. Η αξία είναι η καθαρή αξία που απομένει προς αποστολή."
    >
      <ol className="relative grid flex-1 grid-cols-1 gap-1 md:grid-cols-2 md:gap-x-6 xl:flex xl:flex-col xl:justify-between">
        <span className="absolute bottom-5 left-[0.6rem] top-5 w-px bg-slate-200 md:hidden xl:block" aria-hidden />
        {steps.map((step) => (
          <li key={step.id}>
            <button
              type="button"
              onClick={() => onNavigate(step.page)}
              className="group relative flex w-full items-center gap-3 rounded-2xl py-2 pl-0 pr-2 text-left transition-colors hover:bg-slate-50"
            >
              <span className="relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-slate-200">
                <span className={`h-2 w-2 rounded-full ${PIPELINE_DOT[step.id]}`} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-xs font-bold text-slate-800">{step.label}</span>
                  <span className="shrink-0 text-base font-black tabular-nums text-slate-900">{formatNumber(step.count)}</span>
                </div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${PIPELINE_DOT[step.id]}`} style={{ width: `${(step.count / max) * 100}%` }} />
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-[10px] font-semibold text-slate-400">
                  <span className="truncate">{step.caption}</span>
                  {step.value !== null && step.value > 0 ? <Money value={step.value} decimals={false} className="shrink-0 text-slate-500" /> : null}
                </div>
              </div>
            </button>
          </li>
        ))}
      </ol>
    </Panel>
  );
});

// ─── Production load ───────────────────────────────────────────────────────────

export const StageLoadPanel = memo(function StageLoadPanel({
  rows,
  healthScore,
  isLoading,
  onNavigate,
  className = '',
  compact = false,
}: {
  rows: StageLoadRow[];
  healthScore: number;
  isLoading: boolean;
  onNavigate: Navigate;
  className?: string;
  compact?: boolean;
}) {
  const active = rows.filter((row) => row.pieces > 0);
  const total = active.reduce((sum, row) => sum + row.pieces, 0);
  const max = Math.max(1, ...rows.map((row) => row.pieces));
  const healthTone = healthScore >= 80 ? 'text-emerald-600' : healthScore >= 50 ? 'text-amber-600' : 'text-rose-600';

  return (
    <Panel
      title="Φόρτος παραγωγής"
      subtitle={`${formatNumber(total)} τεμ. σε ${formatNumber(active.reduce((sum, row) => sum + row.batches, 0))} παρτίδες`}
      icon={Factory}
      tone="amber"
      className={className}
      isLoading={isLoading}
      action={{ label: 'Παραγωγή', onClick: () => onNavigate('production') }}
      hint={`Τρέχουσα κατανομή όλων των παρτίδων ανά στάδιο. Υγεία ροής = ποσοστό ενεργών παρτίδων που κινήθηκαν τις τελευταίες 48 ώρες.`}
    >
      {total === 0 ? (
        <EmptyNote message="Δεν υπάρχουν παρτίδες στην παραγωγή." icon={Factory} />
      ) : (
        <>
          <div className="mb-3 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden>
            {active.map((row) => (
              <div key={row.stage} className={VIBRANT_STAGES[row.stage]} style={{ width: `${(row.pieces / total) * 100}%` }} title={`${row.label}: ${row.pieces}`} />
            ))}
          </div>
          <ul className={compact ? 'space-y-1' : 'space-y-1.5'}>
            {(compact ? active : rows).map((row) => (
              <li key={row.stage} className="flex items-center gap-2.5 text-xs">
                <span className={`h-2 w-2 shrink-0 rounded-full ${VIBRANT_STAGES[row.stage]}`} />
                <span className="w-24 shrink-0 truncate font-semibold text-slate-600">{compact ? row.shortLabel : row.label}</span>
                {!compact ? (
                  <>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${VIBRANT_STAGES[row.stage]}`} style={{ width: `${(row.pieces / max) * 100}%` }} />
                    </div>
                    <span className="hidden w-14 shrink-0 text-right text-[10px] font-semibold tabular-nums text-slate-400 sm:block">
                      {row.batches > 0 ? `${formatNumber(row.batches)} παρτ.` : '—'}
                    </span>
                  </>
                ) : (
                  <span className="flex-1" />
                )}
                <span className="flex shrink-0 items-center gap-1.5">
                  {row.delayed > 0 ? (
                    <span className="inline-flex items-center gap-0.5 rounded-md bg-rose-50 px-1 text-[10px] font-black text-rose-600" title="Καθυστερημένες παρτίδες">
                      <Timer size={10} />{row.delayed}
                    </span>
                  ) : null}
                  {row.onHold > 0 ? (
                    <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-50 px-1 text-[10px] font-black text-amber-700" title="Σε αναμονή">
                      <PauseCircle size={10} />{row.onHold}
                    </span>
                  ) : null}
                  <span className="w-10 text-right font-black tabular-nums text-slate-800">{formatNumber(row.pieces)}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
            <span className="font-semibold text-slate-500">Υγεία ροής</span>
            <span className={`text-sm font-black tabular-nums ${healthTone}`}>{formatNumber(healthScore)}%</span>
          </div>
        </>
      )}
    </Panel>
  );
});

// ─── Delivery reminders ────────────────────────────────────────────────────────

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleDateString('el-GR', { day: 'numeric', month: 'short' });
}

export const DeliveryRemindersPanel = memo(function DeliveryRemindersPanel({
  entries,
  isLoading,
  onNavigate,
  className = '',
}: {
  entries: DeliveryAttentionEntry[];
  isLoading: boolean;
  onNavigate: Navigate;
  className?: string;
}) {
  return (
    <Panel
      title="Παραδόσεις προς χειρισμό"
      subtitle={entries.length > 0 ? `${formatNumber(entries.length)} υπενθυμίσεις σήμερα ή εκπρόθεσμες` : 'Σήμερα & εκπρόθεσμες'}
      icon={Truck}
      tone="sky"
      className={className}
      isLoading={isLoading}
      hint={DASHBOARD_TERM_HINTS.deliveryAttention}
      action={{ label: 'Παραδόσεις', onClick: () => onNavigate('deliveries') }}
    >
      {entries.length === 0 ? (
        <EmptyNote message="Καμία υπενθύμιση για σήμερα." icon={CheckCircle2} />
      ) : (
        <ul className="space-y-1.5">
          {entries.slice(0, 5).map((entry) => (
            <li key={entry.reminder.id}>
              <button
                type="button"
                onClick={() => onNavigate('deliveries')}
                className="flex w-full items-center gap-3 rounded-2xl bg-slate-50/80 px-3 py-2.5 text-left transition-colors hover:bg-slate-100"
              >
                <span className={`h-8 w-1 shrink-0 rounded-full ${entry.urgency === 'overdue' ? 'bg-rose-500' : 'bg-amber-400'}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-800"><OrderCustomerName order={entry.item.order} /></p>
                  <p className="truncate text-[11px] font-medium text-slate-500">{entry.reminder.reason || `Παραγγελία #${entry.item.order.id.slice(0, 8)}`}</p>
                </div>
                <div className="shrink-0 text-right">
                  <span className={`block text-[10px] font-black uppercase ${entry.urgency === 'overdue' ? 'text-rose-600' : 'text-amber-600'}`}>
                    {entry.urgency === 'overdue' ? 'Εκπρόθεσμο' : 'Σήμερα'}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-400">{formatShortDate(entry.reminder.trigger_at)}</span>
                </div>
              </button>
            </li>
          ))}
          {entries.length > 5 ? (
            <li className="pt-1 text-center text-[11px] font-bold text-slate-400">+{formatNumber(entries.length - 5)} ακόμη</li>
          ) : null}
        </ul>
      )}
    </Panel>
  );
});

// ─── Ready orders ──────────────────────────────────────────────────────────────

export const ReadyOrdersPanel = memo(function ReadyOrdersPanel({
  summary,
  isLoading,
  onNavigate,
  className = '',
}: {
  summary: ReadyOrdersSummary;
  isLoading: boolean;
  onNavigate: Navigate;
  className?: string;
}) {
  const entries = [...summary.entries].sort((a, b) => b.readyQty - a.readyQty);
  return (
    <Panel
      title="Έτοιμες για αποστολή"
      subtitle={
        summary.total > 0
          ? `${formatNumber(summary.fullCount)} πλήρεις · ${formatNumber(summary.partialCount)} μερικές`
          : 'Παραγγελίες 100% έτοιμες'
      }
      icon={PackageCheck}
      tone="emerald"
      className={className}
      isLoading={isLoading}
      action={{ label: 'Παραγγελίες', onClick: () => onNavigate('orders') }}
      hint={DASHBOARD_TERM_HINTS.readyOrders}
    >
      {entries.length === 0 ? (
        <EmptyNote message="Καμία παραγγελία έτοιμη αυτή τη στιγμή." icon={PackageCheck} />
      ) : (
        <ul className="space-y-1.5">
          {entries.slice(0, 5).map((entry) => {
            const progress = entry.totalQty > 0 ? ((entry.shippedQty + entry.readyQty) / entry.totalQty) * 100 : 100;
            return (
              <li key={entry.orderId}>
                <button
                  type="button"
                  onClick={() => onNavigate('orders')}
                  className="w-full rounded-2xl bg-slate-50/80 px-3 py-2.5 text-left transition-colors hover:bg-slate-100"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-bold text-slate-800">{entry.customerName}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${
                        entry.kind === 'partial' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {entry.kind === 'partial' ? 'Μερική' : 'Πλήρης'}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, progress)}%` }} />
                    </div>
                    <span className="shrink-0 text-[10px] font-bold tabular-nums text-slate-500">
                      {formatNumber(entry.readyQty)} έτοιμα / {formatNumber(entry.totalQty)}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
          {entries.length > 5 ? (
            <li className="pt-1 text-center text-[11px] font-bold text-slate-400">+{formatNumber(entries.length - 5)} ακόμη</li>
          ) : null}
        </ul>
      )}
    </Panel>
  );
});

// ─── Stuck batches ─────────────────────────────────────────────────────────────

export const StuckBatchesPanel = memo(function StuckBatchesPanel({
  total,
  rows,
  stageLabel,
  isLoading,
  onNavigate,
  className = '',
}: {
  total: number;
  rows: StuckBatchRow[];
  stageLabel: (stage: string) => string;
  isLoading: boolean;
  onNavigate: Navigate;
  className?: string;
}) {
  return (
    <Panel
      title="Κολλημένες παρτίδες"
      subtitle={total > 0 ? `${formatNumber(total)} σε αναμονή ή ακίνητες >48ω` : 'Αναμονή ή ακίνητες >48ω'}
      icon={Timer}
      tone="rose"
      className={className}
      isLoading={isLoading}
      action={{ label: 'Παραγωγή', onClick: () => onNavigate('production') }}
    >
      {rows.length === 0 ? (
        <EmptyNote message="Όλες οι παρτίδες κινούνται κανονικά." icon={CheckCircle2} />
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 rounded-2xl bg-slate-50/80 px-3 py-2.5">
              <span className={`h-2 w-2 shrink-0 rounded-full ${VIBRANT_STAGES[row.stage]}`} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-xs font-bold text-slate-800">
                  {row.label}
                  {row.priority ? <span className="rounded bg-rose-100 px-1 text-[9px] font-black uppercase text-rose-600">Επείγον</span> : null}
                </p>
                <p className="truncate text-[11px] font-medium text-slate-500">
                  {stageLabel(row.stage)} · {formatNumber(row.quantity)} τεμ.{row.customerName ? ` · ${row.customerName}` : ''}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {row.onHold ? (
                  <span className="block text-[10px] font-black uppercase text-amber-600" title={row.holdReason}>Αναμονή</span>
                ) : null}
                <span className="text-[11px] font-black tabular-nums text-rose-600">{formatNumber(row.idleDays)} ημ.</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
});
