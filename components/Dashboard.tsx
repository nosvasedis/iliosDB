import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Eye,
  EyeOff,
  Factory,
  Landmark,
  LayoutDashboard,
  Package,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  Trophy,
  UserCheck,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Gender, GlobalSettings, OrderStatus, Product, ProductionStage } from '../types';
import { formatNumber, formatDecimal } from '../utils/numberFormat';
import { productionKeys, productionRepository } from '../features/production';
import { useAllShipmentItems, useAllShipments, useOrdersWithItems } from '../hooks/api/useOrders';
import { getProductionStageLabel } from '../utils/productionStages';
import DesktopPageHeader from './DesktopPageHeader';
import FinancePeriodSelector from './FinancePeriodSelector';
import TopVariantsAnalyticsModal from './dashboard/TopVariantsAnalyticsModal';
import { useOrderDeliveryPlans } from '../hooks/api/useOrderDeliveryPlans';
import { getAttentionItems } from '../utils/deliveryScheduling';
import { api } from '../lib/supabase';
import {
  buildProductionPulse,
  buildCanonicalInventoryRiskRows,
  buildCanonicalDemandPressureRows,
  buildReadyOrdersSummary,
} from '../features/dashboard/dashboardMosaicViewModels';
import {
  buildAttentionItems,
  buildInventoryValuation,
  buildMissingCostRows,
  type AttentionItem,
  buildMonthlyTrend,
  buildOrderPipeline,
  buildStageLoad,
  buildStuckBatches,
  countStonesSold,
  inHouseSilverGrams,
  percentDelta,
  resolvePeriodComparison,
  summarizeEventsInWindow,
} from '../features/dashboard/dashboardCommandViewModels';
import { useInventoryAvailability } from '../hooks/api/useInventory';
import { DASHBOARD_TERM_HINTS } from '../features/dashboard/dashboardTermHints';
import { buildShippedQtyByOrderId } from '../utils/shipmentUtils';
import { useSellers } from '../hooks/api/useSellers';
import {
  buildCategoryChartData,
  buildCollectionChartData,
  buildFinishChartData,
  buildGenderChartData,
  buildTopVariantRows,
} from '../features/dashboard/dashboardAnalysisViewModels';
import { useFinanceAnalytics } from '../hooks/api/useFinanceAnalytics';
import { FinancePeriodMode } from '../utils/financeAnalytics';
import { isInternalOrder } from '../utils/orderCustomer';
import PageErrorState from './ui/PageErrorState';
import MissingCostsModal from './dashboard/MissingCostsModal';
import { requestRegistrySku } from '../utils/registryHandoff';
import SkuColorizedText from './SkuColorizedText';
import SpecialCreationNote from './SpecialCreationNote';
import type { AdminPage } from '../surfaces/pageIds';
import { DashboardPrivacyContext, EmptyNote, KpiTile, Money, Panel, RankRow } from './dashboard/DashboardKit';
import {
  AttentionStrip,
  DeliveryRemindersPanel,
  PipelinePanel,
  ReadyOrdersPanel,
  StageLoadPanel,
  TrendPanel,
} from './dashboard/DashboardOverviewPanels';
import { FinanceTab, OperationsTab, SalesTab, type SilverOrderScope } from './dashboard/DashboardTabs';

interface Props {
  products: Product[];
  settings: GlobalSettings;
  onNavigate?: (page: AdminPage) => void;
}

type DashboardTab = 'overview' | 'sales' | 'finance' | 'operations';

const DASHBOARD_TABS: Array<{ id: DashboardTab; label: string; icon: typeof Activity }> = [
  { id: 'overview', label: 'Επισκόπηση', icon: LayoutDashboard },
  { id: 'sales', label: 'Πωλήσεις', icon: ShoppingBag },
  { id: 'finance', label: 'Οικονομικά', icon: Landmark },
  { id: 'operations', label: 'Παραγωγή & Αποθήκη', icon: Factory },
];

const PRIVACY_STORAGE_KEY = 'ilios.dashboard.hideAmounts';
const TAB_STORAGE_KEY = 'ilios.dashboard.tab';

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); the preference simply won't persist.
  }
}

function todayLabel(): string {
  const label = new Date().toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function Dashboard({ products, settings, onNavigate }: Props) {
  const [activeTab, setActiveTab] = useState<DashboardTab>(() => {
    const stored = readStored(TAB_STORAGE_KEY);
    return DASHBOARD_TABS.some((tab) => tab.id === stored) ? (stored as DashboardTab) : 'overview';
  });
  const [hideAmounts, setHideAmounts] = useState(() => readStored(PRIVACY_STORAGE_KEY) !== 'false');
  const [financePeriodMode, setFinancePeriodMode] = useState<FinancePeriodMode>('current_year');
  const [categoryGenderFilter, setCategoryGenderFilter] = useState<'All' | Gender>('All');
  const [silverOrderScope, setSilverOrderScope] = useState<SilverOrderScope>('active');
  const [topVariantsModalOpen, setTopVariantsModalOpen] = useState(false);
  const [missingCostsOpen, setMissingCostsOpen] = useState(false);

  useEffect(() => writeStored(TAB_STORAGE_KEY, activeTab), [activeTab]);
  useEffect(() => writeStored(PRIVACY_STORAGE_KEY, String(hideAmounts)), [hideAmounts]);

  const ordersQuery = useOrdersWithItems();
  const { data: orders, isLoading: ordersLoading } = ordersQuery;
  const { data: allShipments, isLoading: shipmentsLoading } = useAllShipments();
  const { data: allShipmentItems, isLoading: shipmentItemsLoading } = useAllShipmentItems();
  const { data: sellers } = useSellers();
  const batchesQuery = useQuery({
    queryKey: productionKeys.batches(),
    queryFn: productionRepository.getProductionBatches,
  });
  const { data: batches, isLoading: batchesLoading } = batchesQuery;
  const { enrichedItems: deliveryItems, isLoading: deliveryLoading } = useOrderDeliveryPlans();
  const offersQuery = useQuery({ queryKey: ['offers'], queryFn: api.getOffers });
  const { data: offers, isLoading: offersLoading } = offersQuery;
  const { data: inventoryAvailability = [], isLoading: inventoryLoading } = useInventoryAvailability();
  const {
    analytics: finance,
    allRealizedEvents,
    isLoading: financeLoading,
    refetch: refetchFinance,
  } = useFinanceAnalytics({ products, settings, period: { mode: financePeriodMode } });

  const navigate = useCallback((page: AdminPage) => onNavigate?.(page), [onNavigate]);
  const openTopVariants = useCallback(() => setTopVariantsModalOpen(true), []);
  const periodLabel = finance?.period.label ?? 'Επιλεγμένη περίοδος';

  const productBySku = useMemo(() => new Map(products.map((product) => [product.sku, product])), [products]);

  // ── Sales & comparisons ──────────────────────────────────────────────────
  const comparison = useMemo(() => (finance ? resolvePeriodComparison(finance.period) : null), [finance]);
  const previous = useMemo(
    () => (comparison ? summarizeEventsInWindow(allRealizedEvents, comparison.previous) : null),
    [comparison, allRealizedEvents],
  );
  const trend = useMemo(() => buildMonthlyTrend(allRealizedEvents), [allRealizedEvents]);

  const totals = finance?.totals;
  const deltas = useMemo(() => {
    if (!totals || !previous) return { revenue: null, profit: null, pieces: null, orders: null };
    return {
      revenue: percentDelta(totals.realizedNet, previous.revenue),
      profit: percentDelta(totals.estimatedProfit, previous.profit),
      pieces: percentDelta(totals.shippedPieces, previous.pieces),
      orders: percentDelta(totals.realizedOrderCount, previous.orders),
    };
  }, [totals, previous]);

  // ── Operations ───────────────────────────────────────────────────────────
  const shippedQtyByOrderId = useMemo(
    () => buildShippedQtyByOrderId(allShipments, allShipmentItems),
    [allShipments, allShipmentItems],
  );
  const readyOrders = useMemo(
    () => buildReadyOrdersSummary(orders, batches, shippedQtyByOrderId),
    [orders, batches, shippedQtyByOrderId],
  );
  const deliveryAttention = useMemo(() => getAttentionItems(deliveryItems), [deliveryItems]);
  const productionPulse = useMemo(() => buildProductionPulse(batches), [batches]);
  const stageLoad = useMemo(() => buildStageLoad(batches), [batches]);
  const stuckBatches = useMemo(() => buildStuckBatches(batches), [batches]);
  const inProduction = useMemo(() => {
    const active = (batches ?? []).filter((batch) => batch.current_stage !== ProductionStage.Ready);
    return { pieces: active.reduce((sum, batch) => sum + batch.quantity, 0), batches: active.length };
  }, [batches]);

  const lowStock = useMemo(() => buildCanonicalInventoryRiskRows(inventoryAvailability, 8), [inventoryAvailability]);
  const demandPressure = useMemo(() => buildCanonicalDemandPressureRows(inventoryAvailability, 8), [inventoryAvailability]);
  const valuation = useMemo(
    () => buildInventoryValuation(inventoryAvailability, productBySku),
    [inventoryAvailability, productBySku],
  );

  const pipeline = useMemo(
    () =>
      buildOrderPipeline({
        orders,
        offers,
        backlogEvents: finance?.events.backlog ?? [],
        readyOrders,
        realizedOrderCount: totals?.realizedOrderCount ?? 0,
        realizedRevenue: totals?.realizedNet ?? 0,
      }),
    [orders, offers, finance, readyOrders, totals],
  );

  const missingCostRows = useMemo(
    () => (finance ? buildMissingCostRows(finance.events.realized, finance.events.backlog) : []),
    [finance],
  );

  const attentionItems = useMemo(
    () =>
      buildAttentionItems({
        deliveryAttention,
        stageLoad,
        readyOrders,
        lowStockCount: lowStock.totalLowStock,
        demandPressureCount: demandPressure.totalPressure,
        pendingOffers: pipeline[0]?.count ?? 0,
        legalGap: finance && finance.legal.issuedCount > 0 ? finance.legal.netGap : null,
        costWarningCount: missingCostRows.length,
      }),
    [deliveryAttention, stageLoad, readyOrders, lowStock.totalLowStock, demandPressure.totalPressure, pipeline, finance, missingCostRows.length],
  );

  const handleAttentionSelect = useCallback(
    (item: AttentionItem) => {
      if (item.opens === 'missing-costs') setMissingCostsOpen(true);
      else navigate(item.page);
    },
    [navigate],
  );
  const openRegistryForSku = useCallback(
    (sku: string) => {
      requestRegistrySku(sku);
      setMissingCostsOpen(false);
      navigate('registry');
    },
    [navigate],
  );

  // ── Sales breakdowns ─────────────────────────────────────────────────────
  const realizedEvents = finance?.events.realized;
  const categoryData = useMemo(
    () => (realizedEvents ? buildCategoryChartData(realizedEvents, products, categoryGenderFilter, 10) : []),
    [realizedEvents, products, categoryGenderFilter],
  );
  const collectionData = useMemo(() => (finance ? buildCollectionChartData(finance.topCollections, 10) : []), [finance]);
  const genderData = useMemo(() => (realizedEvents ? buildGenderChartData(realizedEvents, products) : []), [realizedEvents, products]);
  const finishData = useMemo(() => (realizedEvents ? buildFinishChartData(realizedEvents, products) : []), [realizedEvents, products]);
  const topVariants = useMemo(() => (finance ? buildTopVariantRows(finance.topVariants, products, 8) : []), [finance, products]);

  // ── Materials ────────────────────────────────────────────────────────────
  const stonesSold = useMemo(
    () => (realizedEvents ? countStonesSold(realizedEvents, productBySku) : 0),
    [realizedEvents, productBySku],
  );
  const silverForProduction = useMemo(() => {
    const customer = (orders ?? []).filter((order) => order.status !== OrderStatus.Cancelled);
    const active = customer.filter(
      (order) =>
        order.status === OrderStatus.Pending ||
        order.status === OrderStatus.InProduction ||
        order.status === OrderStatus.Ready ||
        order.status === OrderStatus.PartiallyDelivered,
    );
    return {
      active: inHouseSilverGrams(active, productBySku),
      delivered: totals?.silverWeightGrams ?? 0,
      all_non_cancelled: inHouseSilverGrams(customer, productBySku),
    } satisfies Record<SilverOrderScope, number>;
  }, [orders, productBySku, totals?.silverWeightGrams]);

  const activeOrderCount = useMemo(
    () =>
      totals?.activeOrderCount ??
      (orders ?? []).filter((order) => !isInternalOrder(order) && order.status !== OrderStatus.Delivered && order.status !== OrderStatus.Cancelled).length,
    [totals?.activeOrderCount, orders],
  );

  const isRefreshing = ordersQuery.isFetching || batchesQuery.isFetching || offersQuery.isFetching;
  const refreshAll = () => {
    ordersQuery.refetch();
    batchesQuery.refetch();
    offersQuery.refetch();
    refetchFinance();
  };

  // Kept below every hook so a failed refetch never changes the hook order.
  if (ordersQuery.isError || batchesQuery.isError) {
    const err = ordersQuery.error || batchesQuery.error;
    return (
      <PageErrorState
        message="Δεν ήταν δυνατή η φόρτωση δεδομένων πίνακα ελέγχου."
        detail={(err as Error)?.message}
        onRetry={() => { ordersQuery.refetch(); batchesQuery.refetch(); }}
      />
    );
  }

  const opsLoading = ordersLoading || batchesLoading || shipmentsLoading || shipmentItemsLoading;
  const attentionLoading = opsLoading || deliveryLoading || inventoryLoading;
  const comparisonLabel = comparison?.label;

  return (
    <DashboardPrivacyContext.Provider value={hideAmounts}>
      <div className="flex flex-col space-y-5">
        <DesktopPageHeader
          icon={Activity}
          title="Πίνακας Ελέγχου"
          subtitle={`${todayLabel()} · ${periodLabel}`}
          tail={(
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <button
                type="button"
                onClick={() => setHideAmounts((value) => !value)}
                aria-pressed={!hideAmounts}
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
                onClick={refreshAll}
                title="Ανανέωση δεδομένων"
                aria-label="Ανανέωση δεδομένων"
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:text-slate-800"
              >
                <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
              </button>
              <FinancePeriodSelector value={financePeriodMode} onChange={setFinancePeriodMode} />
            </div>
          )}
          tailClassName="flex min-w-0 items-center lg:shrink-0 lg:justify-end"
          below={(
            <nav className="flex w-full justify-center px-1" aria-label="Ενότητες πίνακα ελέγχου">
              <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-slate-200/60 bg-slate-50 p-1.5 shadow-sm">
                {DASHBOARD_TABS.map((tab) => {
                  const isActive = activeTab === tab.id;
                  const badge = tab.id === 'overview' ? attentionItems.filter((item) => item.severity === 'critical' || item.severity === 'warning').length : 0;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-[13px] font-bold transition-all duration-200 sm:px-5 sm:py-2.5 sm:text-sm ${
                        isActive
                          ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-slate-200/90'
                          : 'text-slate-500 hover:bg-white/70 hover:text-slate-700'
                      }`}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <tab.icon size={16} className={isActive ? 'text-emerald-600' : 'text-slate-400'} />
                      {tab.label}
                      {badge > 0 && !attentionLoading ? (
                        <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-black tabular-nums text-amber-700">{badge}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </nav>
          )}
        />

        {activeTab === 'overview' && (
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <AttentionStrip items={attentionItems} isLoading={attentionLoading} onSelect={handleAttentionSelect} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiTile
                label="Καθαρά έσοδα"
                icon={TrendingUp}
                tone="emerald"
                isLoading={financeLoading}
                value={<Money value={totals?.realizedNet ?? 0} />}
                delta={comparison ? deltas.revenue : undefined}
                deltaLabel={comparisonLabel}
                sub={<span>{formatNumber(totals?.shippedPieces ?? 0)} τεμ. · {formatNumber(totals?.realizedOrderCount ?? 0)} παραγγ.</span>}
                sparkline={trend.map((point) => point.revenue)}
                hint={DASHBOARD_TERM_HINTS.realizedRevenue}
                onClick={() => setActiveTab('finance')}
              />
              <KpiTile
                label="Μικτό κέρδος"
                icon={Trophy}
                tone="indigo"
                isLoading={financeLoading}
                value={<Money value={totals?.estimatedProfit ?? 0} />}
                delta={comparison ? deltas.profit : undefined}
                deltaLabel={comparisonLabel}
                sub={<span>Περιθώριο {formatDecimal(totals?.margin ?? 0, 1)}%</span>}
                sparkline={trend.map((point) => point.profit)}
                hint={DASHBOARD_TERM_HINTS.estimatedProfit}
                onClick={() => setActiveTab('finance')}
              />
              <KpiTile
                label="Ανοιχτές παραγγελίες"
                icon={Package}
                tone="sky"
                isLoading={financeLoading}
                value={<Money value={totals?.backlogNet ?? 0} />}
                sub={<span>{formatNumber(activeOrderCount)} παραγγελίες · {formatNumber(totals?.backlogPieces ?? 0)} τεμ. προς αποστολή</span>}
                hint={DASHBOARD_TERM_HINTS.backlogValue}
                onClick={() => navigate('orders')}
              />
              <KpiTile
                label="Σε παραγωγή"
                icon={Factory}
                tone="amber"
                isLoading={batchesLoading}
                value={<span className="tabular-nums">{formatNumber(inProduction.pieces)} <span className="text-base font-bold text-slate-400">τεμ.</span></span>}
                sub={<span>{formatNumber(inProduction.batches)} παρτίδες · υγεία ροής {formatNumber(productionPulse.healthScore)}%</span>}
                hint={DASHBOARD_TERM_HINTS.inProduction}
                onClick={() => navigate('production')}
              />
            </div>

            {comparisonLabel && !financeLoading ? (
              <p className="-mt-2 px-1 text-[11px] font-medium text-slate-400">Οι μεταβολές % συγκρίνονται {comparisonLabel}.</p>
            ) : null}

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
              <TrendPanel data={trend} isLoading={financeLoading} className="xl:col-span-8" onOpenAnalytics={() => navigate('analytics')} />
              <PipelinePanel steps={pipeline} isLoading={opsLoading || offersLoading || financeLoading} onNavigate={navigate} className="xl:col-span-4" />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <StageLoadPanel rows={stageLoad} healthScore={productionPulse.healthScore} isLoading={batchesLoading} onNavigate={navigate} compact />
              <DeliveryRemindersPanel entries={deliveryAttention} isLoading={deliveryLoading} onNavigate={navigate} />
              <ReadyOrdersPanel summary={readyOrders} isLoading={opsLoading} onNavigate={navigate} className="md:col-span-2 xl:col-span-1" />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Panel
                title="Κορυφαία SKU"
                subtitle={`Σε τεμάχια · ${periodLabel}`}
                icon={Trophy}
                tone="amber"
                isLoading={financeLoading}
                hint={DASHBOARD_TERM_HINTS.topVariants}
                action={{ label: 'Πλήρης ανάλυση', onClick: openTopVariants }}
              >
                {topVariants.length === 0 ? (
                  <EmptyNote message={`Δεν βρέθηκαν πωλήσεις για ${periodLabel.toLowerCase()}.`} />
                ) : (
                  <div className="-mx-3">
                    {topVariants.slice(0, 6).map((row, index) => (
                      <RankRow
                        key={row.key}
                        rank={index + 1}
                        onClick={openTopVariants}
                        title={(
                          <>
                            <SkuColorizedText sku={row.sku} suffix={row.variantSuffix} gender={row.gender} className="text-xs" />
                            <SpecialCreationNote sku={row.sku} note={row.itemNote} compact className="mt-0.5" />
                          </>
                        )}
                        subtitle={row.category}
                        value={`${formatNumber(row.quantity)} τεμ.`}
                        valueSub={<Money value={row.revenue} />}
                      />
                    ))}
                  </div>
                )}
              </Panel>
              <Panel
                title="Κορυφαίοι πελάτες"
                subtitle={`Με βάση τα καθαρά έσοδα · ${periodLabel}`}
                icon={UserCheck}
                tone="emerald"
                isLoading={financeLoading}
                hint={DASHBOARD_TERM_HINTS.topCustomers}
                action={{ label: 'Πελάτες', onClick: () => navigate('customers') }}
              >
                {(finance?.topCustomers.length ?? 0) === 0 ? (
                  <EmptyNote message={`Δεν βρέθηκαν πωλήσεις για ${periodLabel.toLowerCase()}.`} />
                ) : (
                  <div className="-mx-3">
                    {finance!.topCustomers.slice(0, 6).map((customer, index) => {
                      const share = totals && totals.realizedNet > 0 ? (customer.revenue / totals.realizedNet) * 100 : 0;
                      return (
                        <RankRow
                          key={customer.id}
                          rank={index + 1}
                          title={customer.name}
                          subtitle={`${formatNumber(customer.orders)} παραγγελίες · ${formatDecimal(share, 1)}% των εσόδων`}
                          value={<Money value={customer.revenue} />}
                        />
                      );
                    })}
                  </div>
                )}
              </Panel>
            </div>
          </div>
        )}

        {activeTab === 'sales' && (
          <SalesTab
            isLoading={financeLoading}
            periodLabel={periodLabel}
            finance={finance}
            deltas={deltas}
            comparisonLabel={comparisonLabel}
            categoryData={categoryData}
            categoryGenderFilter={categoryGenderFilter}
            onCategoryGenderFilterChange={setCategoryGenderFilter}
            collectionData={collectionData}
            genderData={genderData}
            finishData={finishData}
            topVariants={topVariants}
            onOpenTopVariants={openTopVariants}
            onNavigate={navigate}
          />
        )}

        {activeTab === 'finance' && (
          <FinanceTab
            isLoading={financeLoading}
            periodLabel={periodLabel}
            finance={finance}
            trend={trend}
            activeOrderCount={activeOrderCount}
            silverPrice={settings.silver_price_gram}
            stonesSold={stonesSold}
            silverForProduction={silverForProduction}
            silverScope={silverOrderScope}
            onSilverScopeChange={setSilverOrderScope}
            missingCostCount={missingCostRows.length}
            onOpenMissingCosts={() => setMissingCostsOpen(true)}
            onNavigate={navigate}
          />
        )}

        {activeTab === 'operations' && (
          <OperationsTab
            batchesLoading={batchesLoading}
            inventoryLoading={inventoryLoading}
            stageLoad={stageLoad}
            healthScore={productionPulse.healthScore}
            readyBatches={productionPulse.ready}
            inProduction={inProduction}
            stuckBatches={stuckBatches}
            stageLabel={getProductionStageLabel}
            valuation={valuation}
            lowStock={lowStock}
            demandPressure={demandPressure}
            productBySku={productBySku}
            onNavigate={navigate}
          />
        )}

        {missingCostsOpen && (
          <MissingCostsModal
            rows={missingCostRows}
            periodLabel={periodLabel}
            onOpenRegistry={openRegistryForSku}
            onOpenOrders={() => { setMissingCostsOpen(false); navigate('orders'); }}
            onClose={() => setMissingCostsOpen(false)}
          />
        )}

        {topVariantsModalOpen && (
          <TopVariantsAnalyticsModal
            realizedEvents={finance?.events.realized ?? []}
            backlogEvents={finance?.events.backlog ?? []}
            products={products}
            orders={orders ?? []}
            sellers={sellers ?? []}
            periodLabel={periodLabel}
            periodMode={financePeriodMode}
            onPeriodChange={setFinancePeriodMode}
            onClose={() => setTopVariantsModalOpen(false)}
            onOpenRegistry={onNavigate ? () => { setTopVariantsModalOpen(false); onNavigate('registry'); } : undefined}
          />
        )}
      </div>
    </DashboardPrivacyContext.Provider>
  );
}
