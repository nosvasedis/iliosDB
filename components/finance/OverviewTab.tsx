import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  ChevronLeft,
  CheckCircle2,
  HandCoins,
  Info,
  Landmark,
  PiggyBank,
  Receipt,
  Scale,
  TrendingUp,
  Truck,
  Wallet,
} from 'lucide-react';
import { buildCategoryTree, categoryColor, categoryIconKey } from '../../features/finance/categoryTree';
import type { CashflowForecast } from '../../features/finance/cashflowForecast';
import { summarizeExpenses, type ExpensePeriodSummary, type PartyBalance } from '../../features/finance/expenseLedger';
import { formatEuro, monthLabel, resolvePeriod } from '../../features/finance/financeMath';
import { summarizeReceipts, type CustomerBalance, type IncomePipeline, type MoneyPair, type ReceiptSummary } from '../../features/finance/incomeLedger';
import type { FinanceInsight, InsightTarget } from '../../features/finance/insights';
import type { FinanceBilling, FinanceWorkspace } from '../../features/finance/types';
import { CategoryGlyph, EmptyNote, KpiTile, SectionCard, SplitBar } from './financeUi';

// Validated pair (CVD ΔE 16.7, contrast ≥ 3:1 on white).
const INCOME_COLOR = '#0891b2';
const EXPENSE_COLOR = '#e11d48';

const axisTick = { fontSize: 11, fontWeight: 600, fill: '#94a3b8' };
const compact = (value: number) => (Math.abs(value) >= 1000 ? `${Math.round(value / 100) / 10}k` : String(Math.round(value)));

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-black text-slate-900">{label}</div>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center gap-2 font-semibold text-slate-600">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="flex-1">{entry.name}</span>
          <span className="font-black tabular-nums text-slate-900">{formatEuro(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

const INSIGHT_TONES = {
  good: { icon: CheckCircle2, tone: 'border-emerald-100 bg-emerald-50/60 text-emerald-900', iconTone: 'text-emerald-600' },
  warn: { icon: AlertTriangle, tone: 'border-amber-100 bg-amber-50/60 text-amber-900', iconTone: 'text-amber-600' },
  bad: { icon: AlertTriangle, tone: 'border-rose-100 bg-rose-50/60 text-rose-900', iconTone: 'text-rose-600' },
  info: { icon: Info, tone: 'border-sky-100 bg-sky-50/60 text-sky-900', iconTone: 'text-sky-600' },
};

export default function OverviewTab({
  workspace, receiptSummary, expenseSummary, previousExpenseSummary, previousReceiptSummary, delivered, pipeline,
  customerBalances, partyBalances, paidOut, forecast, insights, billingFilter, today, onNavigate,
}: {
  workspace: FinanceWorkspace;
  receiptSummary: ReceiptSummary;
  previousReceiptSummary: ReceiptSummary;
  expenseSummary: ExpensePeriodSummary;
  previousExpenseSummary: ExpensePeriodSummary;
  delivered: MoneyPair;
  pipeline: IncomePipeline;
  customerBalances: CustomerBalance[];
  partyBalances: PartyBalance[];
  paidOut: number;
  forecast: CashflowForecast;
  insights: FinanceInsight[];
  billingFilter: FinanceBilling | 'all';
  today: string;
  onNavigate: (target: InsightTarget) => void;
}) {
  const [drillId, setDrillId] = useState<string | null>(null);
  const pick = (value: MoneyPair) => (billingFilter === 'all' ? value.T + value.X : value[billingFilter]);

  const receivables = customerBalances.reduce((sum, balance) => sum + Math.max(0, pick(balance.balance)), 0);
  const payables = partyBalances.reduce((sum, balance) => sum + Math.max(0, balance.balance), 0);
  const result = receiptSummary.total - expenseSummary.total;
  const change = (now: number, before: number) => (before > 0 ? (now - before) / before : null);
  const receiptsChange = change(receiptSummary.total, previousReceiptSummary.total);
  const expensesChange = change(expenseSummary.total, previousExpenseSummary.total);

  // The trend always spans the last 12 months so a single-month view still shows context.
  const trend = useMemo(() => {
    const window = resolvePeriod('last12', today);
    const receipts = summarizeReceipts(
      billingFilter === 'all' ? workspace.receipts : workspace.receipts.filter((receipt) => receipt.billing === billingFilter),
      window,
    );
    const expenses = summarizeExpenses(workspace.expenses, workspace.categories, window, billingFilter);
    return receipts.byMonth.map((month, index) => ({
      label: monthLabel(month.month),
      income: month.total,
      expense: expenses.byMonth[index]?.total || 0,
    }));
  }, [workspace, billingFilter, today]);
  const hasTrend = trend.some((row) => row.income || row.expense);

  const tree = useMemo(() => buildCategoryTree(workspace.categories), [workspace.categories]);
  const drillNode = useMemo(() => {
    const find = (nodes: typeof tree): (typeof tree)[number] | undefined => {
      for (const node of nodes) {
        if (node.category.id === drillId) return node;
        const inner = find(node.children);
        if (inner) return inner;
      }
      return undefined;
    };
    return drillId ? find(tree) : undefined;
  }, [tree, drillId]);
  const breakdown = (drillNode ? drillNode.children : tree)
    .map((node) => ({ node, total: expenseSummary.byCategory.get(node.category.id) || 0 }))
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);
  const breakdownMax = Math.max(1, ...breakdown.map((row) => row.total));
  const breakdownTotal = drillNode ? (expenseSummary.byCategory.get(drillNode.category.id) || 0) : expenseSummary.total;

  const forecastData = forecast.points.filter((_, index) => index % 2 === 0 || index === forecast.points.length - 1).map((point) => ({
    label: point.date.slice(8, 10) + '/' + point.date.slice(5, 7),
    value: point.cumulative,
  }));
  const upcoming = forecast.events.slice(0, 8);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <KpiTile icon={HandCoins} label="Εισπράξεις" tone="sky" value={formatEuro(receiptSummary.total, 0)}
          hint={receiptsChange !== null ? <Trend value={receiptsChange} /> : `${receiptSummary.count} κινήσεις`} onClick={() => onNavigate('income')}>
          <SplitBar t={receiptSummary.byBilling.T} x={receiptSummary.byBilling.X} collectedT={receiptSummary.byBilling.T} collectedX={receiptSummary.byBilling.X} />
          <div className="flex justify-between text-[11px] font-black tabular-nums"><span className="text-indigo-700">Τ {formatEuro(receiptSummary.byBilling.T, 0)}</span><span className="text-amber-700">Χ {formatEuro(receiptSummary.byBilling.X, 0)}</span></div>
        </KpiTile>
        <KpiTile icon={Receipt} label="Έξοδα" tone="rose" value={formatEuro(expenseSummary.total, 0)}
          hint={expensesChange !== null ? <Trend value={expensesChange} inverse /> : `${expenseSummary.count} εγγραφές`} onClick={() => onNavigate('expenses')}>
          <SplitBar t={expenseSummary.byBilling.T} x={expenseSummary.byBilling.X} collectedT={expenseSummary.byBilling.T} collectedX={expenseSummary.byBilling.X} />
          <div className="flex justify-between text-[11px] font-black tabular-nums"><span className="text-indigo-700">Τ {formatEuro(expenseSummary.byBilling.T, 0)}</span><span className="text-amber-700">Χ {formatEuro(expenseSummary.byBilling.X, 0)}</span></div>
        </KpiTile>
        <KpiTile icon={Scale} label="Αποτέλεσμα" tone={result >= 0 ? 'emerald' : 'rose'} value={formatEuro(result, 0)} hint="Εισπράξεις − Έξοδα περιόδου" />
        <KpiTile icon={Truck} label="Τζίρος παραδόσεων" tone="indigo" value={formatEuro(pick(delivered), 0)} hint={`Ανεκτέλεστα ${formatEuro(pick(pipeline.backlog), 0)} · Προσφορές ${formatEuro(pick(pipeline.offers), 0)}`} />
        <KpiTile icon={Landmark} label="Απαιτήσεις" tone="amber" value={formatEuro(receivables, 0)} hint={`${customerBalances.filter((balance) => balance.total > 0.01).length} πελάτες με υπόλοιπο`} onClick={() => onNavigate('income')} />
        <KpiTile icon={Wallet} label="Υποχρεώσεις" tone="violet" value={formatEuro(payables, 0)} hint={`Πληρώθηκαν ${formatEuro(paidOut, 0)} στην περίοδο`} onClick={() => onNavigate('partners')} />
      </div>

      {insights.length > 0 && (
        <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
          {insights.slice(0, 6).map((insight) => {
            const meta = INSIGHT_TONES[insight.tone];
            const Icon = meta.icon;
            return (
              <button key={insight.id} type="button" onClick={() => onNavigate(insight.target)} className={`flex items-start gap-3 rounded-2xl border p-3 text-left transition hover:shadow-xs ${meta.tone}`}>
                <Icon size={18} className={`mt-0.5 shrink-0 ${meta.iconTone}`} />
                <span className="min-w-0">
                  <span className="block text-sm font-black">{insight.title}</span>
                  <span className="block text-xs font-semibold opacity-80">{insight.detail}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <SectionCard
          title="Εισπράξεις και έξοδα ανά μήνα"
          subtitle="Τελευταίοι 12 μήνες"
          icon={TrendingUp}
          actions={(
            <div className="flex items-center gap-3 text-xs font-bold text-slate-600">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-xs" style={{ backgroundColor: INCOME_COLOR }} /> Εισπράξεις</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-xs" style={{ backgroundColor: EXPENSE_COLOR }} /> Έξοδα</span>
            </div>
          )}
        >
          {hasTrend ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="22%">
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                  <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} interval={0} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} tickFormatter={compact} width={44} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f1f5f9' }} />
                  <Bar dataKey="income" name="Εισπράξεις" fill={INCOME_COLOR} radius={[4, 4, 0, 0]} maxBarSize={22} />
                  <Bar dataKey="expense" name="Έξοδα" fill={EXPENSE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyNote icon={TrendingUp} title="Δεν υπάρχουν ακόμη κινήσεις" detail="Καταχωρίστε εισπράξεις και έξοδα για να δείτε την τάση." />}
        </SectionCard>

        <SectionCard
          title={drillNode ? drillNode.category.name : 'Πού πάνε τα χρήματα'}
          subtitle={`${formatEuro(breakdownTotal)} στην περίοδο`}
          icon={PiggyBank}
          actions={drillNode ? (
            <button type="button" onClick={() => setDrillId(drillNode.category.parent_id)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-black text-slate-500 hover:bg-slate-100"><ChevronLeft size={14} /> Πίσω</button>
          ) : null}
        >
          {breakdown.length === 0 ? <EmptyNote title="Κανένα έξοδο εδώ" /> : (
            <div className="space-y-2.5">
              {breakdown.map(({ node, total }) => {
                const color = categoryColor(node.category.id, workspace.categories);
                const canDrill = node.children.some((child) => (expenseSummary.byCategory.get(child.category.id) || 0) > 0);
                return (
                  <button key={node.category.id} type="button" disabled={!canDrill} onClick={() => setDrillId(node.category.id)} className="group flex w-full items-center gap-3 text-left disabled:cursor-default">
                    <CategoryGlyph icon={categoryIconKey(node.category.id, workspace.categories)} color={color} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="mb-1 flex items-center justify-between gap-2 text-sm">
                        <span className="truncate font-bold text-slate-800 group-hover:group-enabled:underline">{node.category.name}</span>
                        <span className="shrink-0 font-black tabular-nums text-slate-900">{formatEuro(total, 0)} <span className="text-xs font-bold text-slate-400">{Math.round((total / Math.max(1, breakdownTotal)) * 100)}%</span></span>
                      </span>
                      <span className="block h-2 overflow-hidden rounded-full bg-slate-100">
                        <span className="block h-full rounded-full" style={{ width: `${(total / breakdownMax) * 100}%`, backgroundColor: color }} />
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <SectionCard
          title="Ταμειακή πρόβλεψη 90 ημερών"
          subtitle={`Αναμενόμενα +${formatEuro(forecast.totalIn, 0)} / −${formatEuro(forecast.totalOut, 0)}${forecast.lowestPoint && forecast.lowestPoint.cumulative < 0 ? ` · χαμηλότερο σημείο ${formatEuro(forecast.lowestPoint.cumulative, 0)} στις ${forecast.lowestPoint.date}` : ''}`}
          icon={CalendarClock}
        >
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={forecastData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="financeForecastFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={INCOME_COLOR} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={INCOME_COLOR} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} tickFormatter={compact} width={44} />
                <ReferenceLine y={0} stroke="#cbd5e1" />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="value" name="Σωρευτική μεταβολή" stroke={INCOME_COLOR} strokeWidth={2} fill="url(#financeForecastFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-[11px] font-semibold text-slate-500">Εισπράξεις από υπόλοιπα πελατών στη λήξη τους, μείον απλήρωτους και επαναλαμβανόμενους λογαριασμούς. Τα ληξιπρόθεσμα μετρούν από σήμερα.</p>
        </SectionCard>

        <SectionCard title="Επόμενες κινήσεις" icon={CalendarClock} bodyClassName="p-0">
          {upcoming.length === 0 ? <div className="p-4"><EmptyNote title="Τίποτα προγραμματισμένο" /></div> : (
            <div className="divide-y divide-slate-50">
              {upcoming.map((event, index) => (
                <div key={`${event.kind}-${event.label}-${index}`} className="flex items-center gap-3 px-4 py-2.5">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${event.kind === 'collection' ? 'bg-cyan-50 text-cyan-700' : 'bg-rose-50 text-rose-600'}`}>
                    {event.kind === 'collection' ? <ArrowDownRight size={15} /> : <ArrowUpRight size={15} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-800">{event.label}</span>
                    <span className={`text-xs font-semibold ${event.overdue ? 'text-rose-600' : 'text-slate-500'}`}>
                      {event.overdue ? 'Ληξιπρόθεσμο' : event.date}{event.kind === 'recurring' ? ' · εκτίμηση' : ''}
                    </span>
                  </span>
                  <span className={`text-sm font-black tabular-nums ${event.kind === 'collection' ? 'text-cyan-700' : 'text-slate-900'}`}>
                    {event.kind === 'collection' ? '+' : '−'}{formatEuro(event.amount, 0)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function Trend({ value, inverse = false }: { value: number; inverse?: boolean }) {
  const up = value > 0;
  const good = inverse ? !up : up;
  return (
    <span className={`inline-flex items-center gap-1 font-black ${good ? 'text-emerald-700' : 'text-rose-700'}`}>
      {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {up ? '+' : ''}{Math.round(value * 100)}% <span className="font-semibold text-slate-400">έναντι προηγ.</span>
    </span>
  );
}
