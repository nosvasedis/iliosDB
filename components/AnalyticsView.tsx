import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Boxes,
  Coins,
  Eye,
  EyeOff,
  Gem,
  LayoutDashboard,
  Package,
  Printer,
  Receipt,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { Product } from '../types';
import { formatDecimal, formatNumber } from '../utils/numberFormat';
import { FinancePeriodMode } from '../utils/financeAnalytics';
import { useFinanceAnalytics } from '../hooks/api/useFinanceAnalytics';
import { requestRegistrySku } from '../utils/registryHandoff';
import type { AdminPage } from '../surfaces/pageIds';
import {
  buildMissingCostRows,
  buildProfitLoss,
  percentDelta,
  resolvePeriodComparison,
  summarizeEventsInWindow,
} from '../features/dashboard/dashboardCommandViewModels';
import {
  buildInsights,
  buildProfitabilityRows,
  buildTrendWithLastYear,
  eventsInWindow,
  forecastPeriod,
  summarizePareto,
  type Insight,
  type ProfitDimension,
} from '../features/analytics/analyticsViewModels';
import { DASHBOARD_TERM_HINTS } from '../features/dashboard/dashboardTermHints';
import FinancePeriodSelector from './FinancePeriodSelector';
import DesktopPageHeader, { HeaderPrimaryButton } from './DesktopPageHeader';
import IliosLoader from './ui/IliosLoader';
import { DashboardPrivacyContext, KpiTile, Money } from './dashboard/DashboardKit';
import MissingCostsModal from './dashboard/MissingCostsModal';
import {
  CostStructurePanel,
  CustomersPanel,
  InsightsPanel,
  LegalReconciliationPanel,
  PointsDelta,
  ProfitBridgePanel,
  ProfitabilityWorkspace,
  RankedMixPanel,
  RevenueHero,
  RevenueQualityPanel,
  SellersPanel,
  TrendChartPanel,
} from './analytics/AnalyticsPanels';

interface Props {
  products: Product[];
  onBack?: () => void;
  onPrint?: (stats: any) => void;
  onNavigate?: (page: AdminPage) => void;
}

type AnalyticsTab = 'overview' | 'profitability' | 'customers' | 'costs';

const TABS: Array<{ id: AnalyticsTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: 'Επισκόπηση', icon: LayoutDashboard },
  { id: 'profitability', label: 'Κερδοφορία', icon: Receipt },
  { id: 'customers', label: 'Πελάτες & Πλασιέ', icon: Users },
  { id: 'costs', label: 'Κόστος & Παραστατικά', icon: Coins },
];

const STORAGE = {
  tab: 'ilios.analytics.tab',
  period: 'ilios.analytics.period',
  hidden: 'ilios.analytics.hideAmounts',
  dimension: 'ilios.analytics.dimension',
};

const PERIODS: FinancePeriodMode[] = ['current_month', 'current_quarter', 'current_year', 'all_time'];
const DIMENSIONS: ProfitDimension[] = ['category', 'collection', 'product', 'customer'];

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return allowed.includes(value as T) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); the preference simply won't persist.
  }
}

export default function AnalyticsView({ products, onBack, onPrint, onNavigate }: Props) {
  const [periodMode, setPeriodMode] = useState<FinancePeriodMode>(() => readStored(STORAGE.period, PERIODS, 'current_year'));
  const [activeTab, setActiveTab] = useState<AnalyticsTab>(() => readStored(STORAGE.tab, TABS.map((tab) => tab.id), 'overview'));
  const [dimension, setDimension] = useState<ProfitDimension>(() => readStored(STORAGE.dimension, DIMENSIONS, 'category'));
  const [hideAmounts, setHideAmounts] = useState(() => readStored(STORAGE.hidden, ['true', 'false'] as const, 'false') === 'true');
  const [missingCostsOpen, setMissingCostsOpen] = useState(false);

  useEffect(() => writeStored(STORAGE.period, periodMode), [periodMode]);
  useEffect(() => writeStored(STORAGE.tab, activeTab), [activeTab]);
  useEffect(() => writeStored(STORAGE.dimension, dimension), [dimension]);
  useEffect(() => writeStored(STORAGE.hidden, String(hideAmounts)), [hideAmounts]);

  const period = useMemo(() => ({ mode: periodMode }), [periodMode]);
  const { analytics: stats, allRealizedEvents, isLoading, isError, error, refetch } = useFinanceAnalytics({ products, period });

  // ── Comparison with the same elapsed span of the previous period ─────────
  const comparison = useMemo(() => (stats ? resolvePeriodComparison(stats.period) : null), [stats]);
  const previousEvents = useMemo(
    () => (comparison ? eventsInWindow(allRealizedEvents, comparison.previous) : null),
    [comparison, allRealizedEvents],
  );
  const previous = useMemo(
    () => (comparison ? summarizeEventsInWindow(allRealizedEvents, comparison.previous) : null),
    [comparison, allRealizedEvents],
  );
  const comparisonLabel = comparison?.label ?? null;

  const trend = useMemo(() => buildTrendWithLastYear(allRealizedEvents), [allRealizedEvents]);
  const forecast = useMemo(
    () => (stats ? forecastPeriod(stats.period, stats.totals.realizedNet, stats.totals.estimatedProfit) : null),
    [stats],
  );

  const currentEvents = stats?.events.realized;
  const rowsFor = useCallback(
    (dim: ProfitDimension) => (currentEvents ? buildProfitabilityRows(currentEvents, previousEvents, dim) : []),
    [currentEvents, previousEvents],
  );
  const categoryRows = useMemo(() => rowsFor('category'), [rowsFor]);
  const collectionRows = useMemo(() => rowsFor('collection'), [rowsFor]);
  const productRows = useMemo(() => rowsFor('product'), [rowsFor]);
  const customerRows = useMemo(() => rowsFor('customer'), [rowsFor]);
  const dimensionRows = { category: categoryRows, collection: collectionRows, product: productRows, customer: customerRows }[dimension];
  const pareto = useMemo(() => summarizePareto(dimensionRows), [dimensionRows]);

  const missingCostRows = useMemo(
    () => (stats ? buildMissingCostRows(stats.events.realized, stats.events.backlog) : []),
    [stats],
  );
  const profitLoss = useMemo(() => (stats ? buildProfitLoss(stats) : []), [stats]);

  const monthlyRunRate = useMemo(() => {
    const first = trend.findIndex((point) => point.revenue > 0);
    if (first < 0) return 0;
    const active = trend.slice(first);
    return active.reduce((sum, point) => sum + point.revenue, 0) / active.length;
  }, [trend]);

  const insights = useMemo(
    () =>
      stats
        ? buildInsights({
            finance: stats,
            previous,
            comparisonLabel,
            forecast,
            categoryRows,
            customerRows,
            productRows,
            missingCostCount: missingCostRows.length,
            monthlyRunRate,
          })
        : [],
    [stats, previous, comparisonLabel, forecast, categoryRows, customerRows, productRows, missingCostRows.length, monthlyRunRate],
  );

  const deltas = useMemo(() => {
    if (!stats || !previous) return { revenue: null, profit: null, orders: null, margin: null };
    return {
      revenue: percentDelta(stats.totals.realizedNet, previous.revenue),
      profit: percentDelta(stats.totals.estimatedProfit, previous.profit),
      orders: percentDelta(stats.totals.realizedOrderCount, previous.orders),
      margin: previous.revenue > 0 ? stats.totals.margin - previous.margin : null,
    };
  }, [stats, previous]);

  const openProfitability = useCallback((dim: ProfitDimension) => {
    setDimension(dim);
    setActiveTab('profitability');
  }, []);

  const openSku = useCallback(
    (sku: string) => {
      if (!onNavigate) return;
      requestRegistrySku(sku);
      setMissingCostsOpen(false);
      onNavigate('registry');
    },
    [onNavigate],
  );

  const handleInsightAction = useCallback(
    (action: NonNullable<Insight['action']>) => {
      if (action === 'missing-costs') setMissingCostsOpen(true);
      else if (action === 'legal') setActiveTab('costs');
      else if (action === 'profitability-category') openProfitability('category');
      else if (action === 'profitability-customer') openProfitability('customer');
      else openProfitability('product');
    },
    [openProfitability],
  );

  const handlePrint = () => {
    if (!stats) return;
    onPrint?.({ ...stats, title: `Οικονομική Ανάλυση - ${stats.period.label}` });
  };

  if (isError && !stats) {
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-800">
        <h2 className="text-lg font-black">Δεν φορτώθηκαν τα οικονομικά στοιχεία</h2>
        <p className="mt-2 text-sm font-semibold">Δοκιμάστε ξανά. Αν συνεχιστεί, ελέγξτε τη σύνδεση και τα δεδομένα παραστατικών.</p>
        <p className="mt-4 rounded-xl bg-white/70 p-3 font-mono text-xs">{(error as Error)?.message || 'Άγνωστο σφάλμα'}</p>
        <button type="button" onClick={refetch} className="mt-4 rounded-xl bg-rose-700 px-4 py-2 text-sm font-bold text-white">
          Ανανέωση
        </button>
      </div>
    );
  }

  if (isLoading || !stats) {
    return <IliosLoader variant="section" detail="Οικονομικά" className="min-h-[420px]" />;
  }

  const { totals } = stats;

  return (
    <DashboardPrivacyContext.Provider value={hideAmounts}>
      <div className="mx-auto flex max-w-[1600px] flex-col space-y-5 pb-20 print:hidden">
        <DesktopPageHeader
          icon={BarChart3}
          title="Οικονομική Ανάλυση"
          subtitle={`${stats.period.label}${comparisonLabel ? ` · σύγκριση ${comparisonLabel}` : ''}`}
          leading={onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label="Πίσω στον πίνακα ελέγχου"
              className="-ml-1 rounded-2xl p-2.5 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-800 active:scale-95"
            >
              <ArrowLeft size={20} />
            </button>
          ) : undefined}
          tail={(
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <button
                type="button"
                onClick={() => setHideAmounts((value) => !value)}
                aria-pressed={hideAmounts}
                title={hideAmounts ? 'Εμφάνιση ποσών' : 'Απόκρυψη ποσών'}
                className={`inline-flex h-10 items-center gap-1.5 rounded-2xl border px-3 text-xs font-bold shadow-sm transition-colors ${
                  hideAmounts
                    ? 'border-slate-200 bg-white text-slate-500 hover:text-slate-800'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                {hideAmounts ? <EyeOff size={15} /> : <Eye size={15} />}
                <span className="hidden sm:inline">{hideAmounts ? 'Ποσά κρυφά' : 'Ποσά ορατά'}</span>
              </button>
              <button
                type="button"
                onClick={refetch}
                title="Ανανέωση δεδομένων"
                aria-label="Ανανέωση δεδομένων"
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:text-slate-800"
              >
                <RefreshCw size={15} />
              </button>
              <FinancePeriodSelector value={periodMode} onChange={setPeriodMode} />
              <HeaderPrimaryButton icon={Printer} onClick={handlePrint}>
                Αναφορά PDF
              </HeaderPrimaryButton>
            </div>
          )}
          tailClassName="flex min-w-0 items-center lg:shrink-0 lg:justify-end"
          below={(
            <nav className="flex w-full justify-center px-1" aria-label="Ενότητες ανάλυσης">
              <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-slate-200/60 bg-slate-50 p-1.5 shadow-sm">
                {TABS.map((tab) => {
                  const isActive = activeTab === tab.id;
                  const badge = tab.id === 'costs' ? missingCostRows.length + (stats.legal.issuedCount > 0 && Math.abs(stats.legal.netGap) >= 1 ? 1 : 0) : 0;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-[13px] font-bold transition-all duration-200 sm:px-5 sm:py-2.5 sm:text-sm ${
                        isActive ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-slate-200/90' : 'text-slate-500 hover:bg-white/70 hover:text-slate-700'
                      }`}
                    >
                      <tab.icon size={16} className={isActive ? 'text-emerald-600' : 'text-slate-400'} />
                      {tab.label}
                      {badge > 0 ? <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-black tabular-nums text-amber-700">{badge}</span> : null}
                    </button>
                  );
                })}
              </div>
            </nav>
          )}
        />

        {/* ── Executive summary (always visible) ─────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="xl:col-span-5">
            <RevenueHero
              finance={stats}
              revenueDelta={deltas.revenue}
              comparisonLabel={comparisonLabel}
              forecast={forecast}
              sparkline={trend.map((point) => point.revenue)}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:col-span-7">
            <KpiTile
              label="Μικτό κέρδος"
              icon={TrendingUp}
              tone="emerald"
              hint={DASHBOARD_TERM_HINTS.estimatedProfit}
              value={<Money value={totals.estimatedProfit} />}
              delta={comparisonLabel ? deltas.profit : undefined}
              deltaLabel={comparisonLabel ?? undefined}
              sub={<span>κόστος <Money value={totals.estimatedCost} decimals={false} /></span>}
              sparkline={trend.map((point) => point.profit)}
            />
            <KpiTile
              label="Περιθώριο"
              icon={Wallet}
              tone="sky"
              value={`${formatDecimal(totals.margin, 1)}%`}
              sub={comparisonLabel ? <><PointsDelta points={deltas.margin} /><span>{comparisonLabel}</span></> : <span>κέρδος / καθαρά έσοδα</span>}
              sparkline={trend.map((point) => point.margin)}
            />
            <KpiTile
              label="Παραγγελίες"
              icon={ShoppingBag}
              tone="violet"
              hint={DASHBOARD_TERM_HINTS.orderEconomics}
              value={formatNumber(totals.realizedOrderCount)}
              delta={comparisonLabel ? deltas.orders : undefined}
              deltaLabel={comparisonLabel ?? undefined}
              sub={<span>{formatDecimal(totals.averageBasketSize, 1)} τεμ. / παραγγελία</span>}
              sparkline={trend.map((point) => point.orders)}
            />
            <KpiTile
              label="Ανοιχτές παραγγελίες"
              icon={Package}
              tone="amber"
              hint={DASHBOARD_TERM_HINTS.backlogValue}
              value={<Money value={totals.backlogNet} />}
              sub={<span>{formatNumber(totals.activeOrderCount)} παραγγελίες · {formatNumber(totals.backlogPieces)} τεμ.</span>}
              onClick={onNavigate ? () => onNavigate('orders') : undefined}
            />
          </div>
        </div>

        <InsightsPanel insights={insights} onAction={handleInsightAction} />

        {/* ── Workspace ──────────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300 xl:grid-cols-12">
            <TrendChartPanel points={trend} periodStart={stats.period.start} periodEnd={stats.period.end} className="xl:col-span-8" />
            <ProfitBridgePanel lines={profitLoss} className="xl:col-span-4" />
            <RankedMixPanel
              title="Κατηγορίες"
              subtitle="Έσοδα, περιθώριο και μεταβολή"
              icon={Gem}
              tone="violet"
              rows={categoryRows}
              onOpenAll={() => openProfitability('category')}
              className="xl:col-span-4"
            />
            <RankedMixPanel
              title="Συλλογές"
              subtitle="Έσοδα, περιθώριο και μεταβολή"
              icon={Boxes}
              tone="sky"
              rows={collectionRows}
              onOpenAll={() => openProfitability('collection')}
              className="xl:col-span-4"
            />
            <RankedMixPanel
              title="Κορυφαίοι κωδικοί"
              subtitle="Με κατάταξη ABC"
              icon={TrendingUp}
              tone="emerald"
              rows={productRows}
              showAbc
              onOpenAll={() => openProfitability('product')}
              className="xl:col-span-4"
            />
          </div>
        )}

        {activeTab === 'profitability' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <ProfitabilityWorkspace
              key={dimension}
              rows={dimensionRows}
              dimension={dimension}
              onDimensionChange={setDimension}
              hasComparison={Boolean(previousEvents)}
              avgMargin={totals.margin}
              pareto={pareto}
              periodLabel={stats.period.label}
              onOpenSku={onNavigate ? openSku : undefined}
            />
          </div>
        )}

        {activeTab === 'customers' && (
          <div className="grid grid-cols-1 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300 xl:grid-cols-12">
            <div className="xl:col-span-7">
              <CustomersPanel rows={customerRows} hasComparison={Boolean(previousEvents)} onOpenAll={() => openProfitability('customer')} />
            </div>
            <div className="xl:col-span-5">
              <SellersPanel sellers={stats.topSellers} />
            </div>
          </div>
        )}

        {activeTab === 'costs' && (
          <div className="grid grid-cols-1 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300 lg:grid-cols-2">
            <CostStructurePanel finance={stats} missingCostCount={missingCostRows.length} onOpenMissingCosts={() => setMissingCostsOpen(true)} />
            <ProfitBridgePanel lines={profitLoss} />
            <LegalReconciliationPanel finance={stats} onOpenLegal={onNavigate ? () => onNavigate('legal') : undefined} />
            <RevenueQualityPanel finance={stats} />
          </div>
        )}

        {missingCostsOpen && (
          <MissingCostsModal
            rows={missingCostRows}
            periodLabel={stats.period.label}
            onOpenRegistry={openSku}
            onOpenOrders={() => {
              setMissingCostsOpen(false);
              onNavigate?.('orders');
            }}
            onClose={() => setMissingCostsOpen(false)}
          />
        )}
      </div>
    </DashboardPrivacyContext.Provider>
  );
}
