import React, { useState, useMemo, useCallback } from 'react';
import { Product, GlobalSettings, Order, OrderStatus, ProductionStage, Gender, ProductionType } from '../types';
import { 
  TrendingUp, 
  Package, 
  AlertTriangle, 
  ArrowUpRight, 
  DollarSign, 
  Factory, 
  Activity, 
  BarChart3, 
  Coins, 
  Wallet, 
  Scale, 
  Target, 
  Trophy,
  ShoppingBag,
  Crown,
  Gem,
  HelpCircle,
  ChevronDown,
  FileText,
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
} from 'recharts';
import { formatCurrency, formatDecimal } from '../utils/pricingEngine';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { productionKeys, productionRepository } from '../features/production';
import { orderKeys } from '../features/orders';
import { useOrdersWithItems } from '../hooks/api/useOrders';
import { useSellers } from '../hooks/api/useSellers';
import { getProductionStageLabel } from '../utils/productionStages';
import DesktopPageHeader from './DesktopPageHeader';
import FinancePeriodSelector from './FinancePeriodSelector';
import DashboardStatCarousel, { type DashboardStatSlide } from './dashboard/DashboardStatCarousel';
import DashboardOverviewMosaic, { type DashboardNavigatePage, type MosaicLoadingFlags } from './dashboard/DashboardOverviewMosaic';
import TopVariantsAnalyticsModal from './dashboard/TopVariantsAnalyticsModal';
import { useOrderDeliveryPlans } from '../hooks/api/useOrderDeliveryPlans';
import { getAttentionItems } from '../utils/deliveryScheduling';
import { api } from '../lib/supabase';
import {
  buildProductionPulse,
  buildInventoryRiskRows,
  buildDemandPressureRows,
  buildOffersSummary,
  countReadyOrders,
} from '../features/dashboard/dashboardMosaicViewModels';
import { useCollections } from '../hooks/api/useCollections';
import {
  buildCategoryChartData,
  buildCollectionChartData,
  buildGenderChartData,
  buildFinishChartData,
  buildTopVariantRows,
  buildTopCustomerRows,
} from '../features/dashboard/dashboardAnalysisViewModels';
import { useFinanceAnalytics } from '../hooks/api/useFinanceAnalytics';
import { FinancePeriodMode, isWithinFinancePeriod } from '../utils/financeAnalytics';

interface Props {
  products: Product[];
  settings: GlobalSettings;
  onNavigate?: (page: 'dashboard' | 'registry' | 'inventory' | 'pricing' | 'settings' | 'resources' | 'collections' | 'batch-print' | 'orders' | 'production' | 'customers' | 'ai-studio' | 'pricelist' | 'analytics' | 'offers' | 'deliveries' | 'legal') => void;
}

const STAGE_LABELS: Record<string, string> = {
    [ProductionStage.AwaitingDelivery]: getProductionStageLabel(ProductionStage.AwaitingDelivery),
    [ProductionStage.Waxing]: getProductionStageLabel(ProductionStage.Waxing),
    [ProductionStage.Casting]: getProductionStageLabel(ProductionStage.Casting),
    [ProductionStage.Setting]: getProductionStageLabel(ProductionStage.Setting),
    [ProductionStage.Polishing]: getProductionStageLabel(ProductionStage.Polishing),
    [ProductionStage.Assembly]: getProductionStageLabel(ProductionStage.Assembly),
    [ProductionStage.Labeling]: getProductionStageLabel(ProductionStage.Labeling),
    [ProductionStage.Ready]: getProductionStageLabel(ProductionStage.Ready)
};

const COLORS = ['#059669', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#6366f1', '#ec4899', '#14b8a6'];

type SilverOrderScope = 'active' | 'delivered' | 'all_non_cancelled';

const SILVER_SCOPE_LABELS: Record<SilverOrderScope, string> = {
    active: 'Ενεργές παραγγελίες',
    delivered: 'Αποσταλμένα περιόδου',
    all_non_cancelled: 'Όλες εκτός ακυρωμένων',
};

const DASHBOARD_TABS = [
  { id: 'overview' as const, label: 'Επισκόπηση', icon: Activity },
  { id: 'financials' as const, label: 'Οικονομικά', icon: DollarSign },
  { id: 'production' as const, label: 'Παραγωγή', icon: Factory },
  { id: 'inventory' as const, label: 'Αποθήκη', icon: Package },
];

export default function Dashboard({ products, settings, onNavigate }: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'financials' | 'production' | 'inventory'>('overview');
  const [categoryGenderFilter, setCategoryGenderFilter] = useState<'All' | Gender>('All');
  const [showPendingRevenue, setShowPendingRevenue] = useState(false);
  const [showRealizedRevenue, setShowRealizedRevenue] = useState(false);
  const [showEstimatedProfit, setShowEstimatedProfit] = useState(false);
  const [statFinanceIndex, setStatFinanceIndex] = useState(0);
  const [statOpsIndex, setStatOpsIndex] = useState(0);
  const [topVariantsModalOpen, setTopVariantsModalOpen] = useState(false);
  const [silverOrderScope, setSilverOrderScope] = useState<SilverOrderScope>('active');
  const [financePeriodMode, setFinancePeriodMode] = useState<FinancePeriodMode>('current_year');
  const [legalReconciliationOpen, setLegalReconciliationOpen] = useState(false);

  const queryClient = useQueryClient();
  const { data: orders, isLoading: ordersLoading, isError: ordersError, error: ordersErr, refetch: refetchOrders } = useOrdersWithItems();
  const { data: sellers } = useSellers();
  const { data: batches, isLoading: batchesLoading, isError: batchesError, error: batchesErr, refetch: refetchBatches } = useQuery({
    queryKey: productionKeys.batches(),
    queryFn: productionRepository.getProductionBatches,
  });
  const { data: collections } = useCollections();
  const { enrichedItems: deliveryItems, isLoading: deliveryLoading } = useOrderDeliveryPlans();
  const { data: offers, isLoading: offersLoading } = useQuery({
    queryKey: ['offers'],
    queryFn: api.getOffers,
  });
  const { analytics: financeStats, isLoading: financeLoading } = useFinanceAnalytics({
    products,
    settings,
    period: { mode: financePeriodMode },
  });
  const periodLabel = financeStats?.period.label ?? 'την επιλεγμένη περίοδο';

  const handleOpenTopVariants = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: orderKeys.all });
    setTopVariantsModalOpen(true);
  }, [queryClient]);

  if (ordersError || batchesError) {
    const err = ordersErr || batchesErr;
    return (
      <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-6 rounded-r-xl max-w-2xl" role="alert">
        <p className="font-bold mb-2">Σφάλμα φόρτωσης</p>
        <p>Δεν ήταν δυνατή η φόρτωση δεδομένων πίνακα ελέγχου.</p>
        <p className="text-sm mt-4 font-mono bg-red-100/50 p-2 rounded">{(err as Error)?.message}</p>
        <div className="mt-4 flex gap-2">
          <button onClick={() => { refetchOrders(); refetchBatches(); }} className="px-4 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors">
            Ανανέωση
          </button>
        </div>
      </div>
    );
  }

  const stats = useMemo(() => {
    const totalStockQty = products.reduce((acc, p) => acc + p.stock_qty, 0);
    
    let totalCostValue = 0; 
    let totalPotentialRevenue = 0; 
    let totalSilverWeight = 0;
    const productBySku = new Map(products.map(p => [p.sku, p]));

    products.forEach(p => {
        totalCostValue += (p.active_price * p.stock_qty);
        totalSilverWeight += (p.weight_g * p.stock_qty);
        if (!p.is_component) {
            if (p.variants && p.variants.length > 0) {
                const maxVarPrice = Math.max(...p.variants.map(v => v.selling_price || 0));
                totalPotentialRevenue += (maxVarPrice > 0 ? maxVarPrice : p.selling_price) * p.stock_qty;
            } else {
                totalPotentialRevenue += p.selling_price * p.stock_qty;
            }
        }
    });

    const potentialMargin = totalPotentialRevenue - totalCostValue;
    const marginPercent = totalPotentialRevenue > 0 ? (potentialMargin / totalPotentialRevenue) * 100 : 0;

    const activeOrders = orders?.filter(o => o.status === OrderStatus.Pending || o.status === OrderStatus.InProduction || o.status === OrderStatus.Ready || o.status === OrderStatus.PartiallyDelivered) || [];
    const allNonCancelledOrders = orders?.filter(o => o.status !== OrderStatus.Cancelled) || [];
    const activeBatches = batches?.filter(b => b.current_stage !== ProductionStage.Ready) || [];

    const calculateInHouseSilverGrams = (orderList: Order[]) =>
        orderList.reduce((orderAcc, order) => {
            return orderAcc + order.items.reduce((itemAcc, item) => {
                const product = productBySku.get(item.sku);
                if (!product || product.production_type === ProductionType.Imported || product.is_component) {
                    return itemAcc;
                }

                return itemAcc + ((product.weight_g || 0) + (product.secondary_weight_g || 0)) * item.quantity;
            }, 0);
        }, 0);
    
    let stonesSold = 0;
    financeStats?.events.realized.forEach(event => {
        const p = products.find(prod => prod.sku === event.sku);
        if (p) {
            p.recipe.forEach(ri => {
               if (ri.type === 'raw') stonesSold += (ri.quantity * event.quantity);
            });
        }
    });
    if (!financeStats) {
      const completedOrders = orders?.filter(o => o.status === OrderStatus.Delivered) || [];
      completedOrders.forEach(o => {
        o.items.forEach(i => {
            const p = products.find(prod => prod.sku === i.sku);
            if (p) {
                p.recipe.forEach(ri => {
                   if (ri.type === 'raw') stonesSold += (ri.quantity * i.quantity);
                });
            }
        });
      });
    }

    const stockValueBySku = products
        .filter(p => !p.is_component)
        .flatMap(p => {
            if (p.variants && p.variants.length > 0) {
                return p.variants.map(v => ({
                    sku: p.sku + v.suffix,
                    category: p.category,
                    value: (v.active_price || p.active_price) * v.stock_qty,
                    qty: v.stock_qty
                }));
            }
            return [{
                sku: p.sku,
                category: p.category,
                value: p.active_price * p.stock_qty,
                qty: p.stock_qty
            }];
        })
        .filter(i => i.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

    return {
        totalStockQty,
        totalCostValue,
        totalPotentialRevenue,
        totalSilverWeight,
        potentialMargin,
        marginPercent,
        activeOrdersCount: financeStats?.totals.activeOrderCount ?? activeOrders.length,
        inHouseSilverUsed: {
            active: calculateInHouseSilverGrams(activeOrders),
            delivered: financeStats?.totals.silverWeightGrams ?? 0,
            all_non_cancelled: calculateInHouseSilverGrams(allNonCancelledOrders),
        },
        pendingRevenue: financeStats?.totals.backlogNet ?? 0,
        totalRevenue: financeStats?.totals.realizedNet ?? 0,
        realizedGross: financeStats?.totals.realizedGross ?? 0,
        realizedVat: financeStats?.totals.vat ?? 0,
        realizedDiscount: financeStats?.totals.discount ?? 0,
        financeCost: financeStats?.totals.estimatedCost ?? 0,
        financeProfit: financeStats?.totals.estimatedProfit ?? 0,
        financeMargin: financeStats?.totals.margin ?? 0,
        shippedPieces: financeStats?.totals.shippedPieces ?? 0,
        backlogPieces: financeStats?.totals.backlogPieces ?? 0,
        legalGap: financeStats?.legal.netGap ?? 0,
        legalIssuedNet: financeStats?.legal.issuedNet ?? 0,
        activeBatchesCount: activeBatches.length,
        totalItemsInProduction: activeBatches.reduce((acc, b) => acc + b.quantity, 0),
        topStockValue: stockValueBySku,
        silverSold: financeStats?.totals.silverWeightKg ?? 0,
        stonesSold
    };
  }, [products, orders, batches, financeStats]);

  const categoryData = useMemo(() => {
      if (!financeStats) return [];
      return buildCategoryChartData(
        financeStats.events.realized,
        products,
        categoryGenderFilter,
      );
  }, [financeStats, products, categoryGenderFilter]);

  const collectionChartData = useMemo(() => {
      if (!financeStats) return [];
      return buildCollectionChartData(financeStats.topCollections);
  }, [financeStats]);

  const genderChartData = useMemo(() => {
      if (!financeStats) return [];
      return buildGenderChartData(financeStats.events.realized, products);
  }, [financeStats, products]);

  const finishChartData = useMemo(() => {
      if (!financeStats) return [];
      return buildFinishChartData(financeStats.events.realized, products);
  }, [financeStats, products]);

  const topVariantRows = useMemo(() => {
      if (!financeStats) return [];
      return buildTopVariantRows(financeStats.topVariants, products);
  }, [financeStats, products]);

  const topCustomerRows = useMemo(() => {
      if (!financeStats) return [];
      return buildTopCustomerRows(financeStats.topCustomers);
  }, [financeStats]);

  const collectionRankings = useMemo(() => {
      return (financeStats?.topCollections ?? []).slice(0, 8);
  }, [financeStats?.topCollections]);

  const productionStageData = useMemo(() => {
      if (!batches) return [];
      const period = financeStats?.period;
      const stages: Record<string, number> = {};
      batches.forEach(b => {
          if (b.current_stage === ProductionStage.Ready) return;
          if (period && !isWithinFinancePeriod(b.created_at, period)) return;
          const label = STAGE_LABELS[b.current_stage] || b.current_stage;
          stages[label] = (stages[label] || 0) + b.quantity;
      });
      return Object.entries(stages).map(([name, value]) => ({ name, value }));
  }, [batches, financeStats?.period]);

  const topSoldProducts = useMemo(() => {
      return (financeStats?.topProducts ?? []).slice(0, 5);
  }, [financeStats?.topProducts]);

  const financeStatSlides: DashboardStatSlide[] = useMemo(() => [
    {
      id: 'revenue',
      title: 'Πραγματοποιημένα έσοδα',
      value: formatCurrency(stats.totalRevenue),
      sub: `${stats.shippedPieces} τεμ. απεστάλησαν`,
      icon: DollarSign,
      bg: 'bg-emerald-600',
      text: 'text-white',
      blurValue: !showRealizedRevenue,
      showEyeToggle: true,
      isValueVisible: showRealizedRevenue,
      onToggleVisibility: () => setShowRealizedRevenue((v) => !v),
    },
    {
      id: 'profit',
      title: 'Εκτιμώμενο κέρδος',
      value: formatCurrency(stats.financeProfit),
      sub: `${stats.financeMargin.toFixed(1)}% περιθώριο`,
      icon: TrendingUp,
      bg: 'bg-blue-600',
      text: 'text-white',
      blurValue: !showEstimatedProfit,
      showEyeToggle: true,
      isValueVisible: showEstimatedProfit,
      onToggleVisibility: () => setShowEstimatedProfit((v) => !v),
    },
  ], [stats, showRealizedRevenue, showEstimatedProfit]);

  const opsStatSlides: DashboardStatSlide[] = useMemo(() => [
    {
      id: 'pending',
      title: 'Εκκρεμής αξία',
      value: formatCurrency(stats.pendingRevenue),
      sub: `${stats.activeOrdersCount} ανοιχτές παραγγελίες · ${stats.backlogPieces} τεμ.`,
      icon: Activity,
      bg: 'bg-slate-900',
      text: 'text-white',
      blurValue: !showPendingRevenue,
      showEyeToggle: true,
      isValueVisible: showPendingRevenue,
      onToggleVisibility: () => setShowPendingRevenue((v) => !v),
    },
    {
      id: 'production',
      title: 'Σε Παραγωγή',
      value: stats.totalItemsInProduction.toString(),
      sub: `${stats.activeBatchesCount} παρτίδες ενεργές`,
      icon: Factory,
      bg: 'bg-amber-500',
      text: 'text-white',
    },
  ], [stats, showPendingRevenue]);

  const goToPrevFinanceStat = () => setStatFinanceIndex((i) => (i - 1 + financeStatSlides.length) % financeStatSlides.length);
  const goToNextFinanceStat = () => setStatFinanceIndex((i) => (i + 1) % financeStatSlides.length);
  const goToPrevOpsStat = () => setStatOpsIndex((i) => (i - 1 + opsStatSlides.length) % opsStatSlides.length);
  const goToNextOpsStat = () => setStatOpsIndex((i) => (i + 1) % opsStatSlides.length);

  const deliveryAttention = useMemo(() => getAttentionItems(deliveryItems), [deliveryItems]);
  const productionPulse = useMemo(() => buildProductionPulse(batches), [batches]);
  const inventoryRisk = useMemo(() => buildInventoryRiskRows(products), [products]);
  const demandPressure = useMemo(() => buildDemandPressureRows(products, orders), [products, orders]);
  const offersPipeline = useMemo(() => buildOffersSummary(offers), [offers]);
  const readyOrdersCount = useMemo(() => countReadyOrders(orders), [orders]);

  const mosaicLoading: MosaicLoadingFlags = useMemo(() => ({
    finance: financeLoading,
    orders: ordersLoading,
    batches: batchesLoading,
    delivery: deliveryLoading,
    offers: offersLoading,
  }), [financeLoading, ordersLoading, batchesLoading, deliveryLoading, offersLoading]);

  const mosaicData = useMemo(() => ({
    periodLabel,
    colors: COLORS,
    materials: {
      silverSold: stats.silverSold,
      silverValue: stats.silverSold * 1000 * settings.silver_price_gram,
      stonesSold: stats.stonesSold,
    },
    productionPulse,
    deliveryAttention,
    readyOrdersCount,
    orderEconomics: {
      averageOrderValue: financeStats?.totals.averageOrderValue ?? 0,
      averageBasketSize: financeStats?.totals.averageBasketSize ?? 0,
    },
    discountVat: {
      discount: stats.realizedDiscount,
      vat: stats.realizedVat,
    },
    backlogDepth: {
      gross: financeStats?.totals.backlogGross ?? 0,
      vat: financeStats?.totals.backlogVat ?? 0,
      net: stats.pendingRevenue,
    },
    offersPipeline,
    compliance: {
      legalGap: stats.legalGap,
      issuedCount: financeStats?.legal.issuedCount ?? 0,
    },
    categoryData,
    collectionData: collectionChartData,
    collectionRankings,
    topVariants: topVariantRows,
    genderData: genderChartData,
    finishData: finishChartData,
    topCustomers: topCustomerRows,
    inventoryRisk,
    demandPressure,
    categoryGenderFilter,
    onCategoryGenderFilterChange: setCategoryGenderFilter,
  }), [
    periodLabel,
    stats,
    settings.silver_price_gram,
    productionPulse,
    deliveryAttention,
    readyOrdersCount,
    financeStats,
    offersPipeline,
    categoryData,
    collectionChartData,
    collectionRankings,
    topVariantRows,
    genderChartData,
    finishChartData,
    topCustomerRows,
    inventoryRisk,
    demandPressure,
    categoryGenderFilter,
  ]);

  const handleMosaicNavigate = (page: DashboardNavigatePage) => {
    if (page === 'financials') {
      setActiveTab('financials');
      return;
    }
    onNavigate?.(page);
  };

  const KPICard = ({ title, value, subValue, icon, colorClass, hint }: { title: string, value: string, subValue?: string, icon: React.ReactNode, colorClass: string, hint?: string }) => (
      <div 
        className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-all relative overflow-hidden group"
        title={hint}
      >
          <div className={`absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-500 ${colorClass}`}>
              {React.cloneElement(icon as React.ReactElement<any>, { size: 64 })}
          </div>
          <div>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5 cursor-help">
                {title}
                {hint && <HelpCircle size={12} className="text-slate-300 group-hover:text-slate-500 transition-colors pointer-events-none" />}
              </p>
              <h3 className="text-3xl font-black text-slate-800 tracking-tight">{value}</h3>
          </div>
          {subValue && (
              <div className="mt-4">
                  <div className={`text-xs font-bold px-2 py-1 rounded-full bg-slate-50 inline-flex items-center gap-1 ${colorClass}`}>
                      {subValue}
                  </div>
              </div>
          )}
      </div>
  );

  return (
    <div className="flex flex-col space-y-6">
      <DesktopPageHeader
        icon={Activity}
        title="Πίνακας Ελέγχου"
        subtitle="Έξυπνη επισκόπηση και ανάλυση κερδοφορίας"
        tail={(
          <FinancePeriodSelector value={financePeriodMode} onChange={setFinancePeriodMode} />
        )}
        tailClassName="flex shrink-0 items-center justify-end"
        below={(
          <nav className="flex w-full justify-center px-1" aria-label="Ενότητες πίνακα ελέγχου">
            <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-slate-200/70 bg-slate-50/90 p-1.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {DASHBOARD_TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold transition-all sm:px-5 ${
                      isActive
                        ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-slate-200/90'
                        : 'text-slate-500 hover:bg-white/70 hover:text-slate-700'
                    }`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <tab.icon size={16} className={isActive ? 'text-emerald-600' : 'text-slate-400'} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </nav>
        )}
      />

      {activeTab === 'overview' && (
          <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <DashboardStatCarousel
                  variant="desktop"
                  slides={financeStatSlides}
                  activeIndex={statFinanceIndex}
                  onPrev={goToPrevFinanceStat}
                  onNext={goToNextFinanceStat}
                  isLoading={financeLoading}
                />
                <DashboardStatCarousel
                  variant="desktop"
                  slides={opsStatSlides}
                  activeIndex={statOpsIndex}
                  onPrev={goToPrevOpsStat}
                  onNext={goToNextOpsStat}
                  isLoading={ordersLoading || batchesLoading}
                />
              </div>

              <DashboardOverviewMosaic
                data={mosaicData}
                loading={mosaicLoading}
                onNavigate={handleMosaicNavigate}
                onOpenTopVariants={handleOpenTopVariants}
              />

              {topVariantsModalOpen && (
                <TopVariantsAnalyticsModal
                  realizedEvents={financeStats?.events.realized ?? []}
                  backlogEvents={financeStats?.events.backlog ?? []}
                  products={products}
                  orders={orders ?? []}
                  sellers={sellers ?? []}
                  periodLabel={periodLabel}
                  onClose={() => setTopVariantsModalOpen(false)}
                  onOpenRegistry={onNavigate ? () => { setTopVariantsModalOpen(false); onNavigate('registry'); } : undefined}
                />
              )}
          </div>
      )}

      {activeTab === 'financials' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <KPICard title="Πραγματοποιημένα έσοδα" value={formatCurrency(stats.totalRevenue)} subValue={`${stats.shippedPieces} τεμ. απεστάλησαν`} icon={<DollarSign/>} colorClass="text-emerald-600" hint="Καθαρή αξία που έχει αποσταλεί ή παραδοθεί, μετά την έκπτωση και χωρίς ΦΠΑ." />
                  <KPICard title="Εκτιμώμενο μικτό κέρδος" value={formatCurrency(stats.financeProfit)} subValue={`${stats.financeMargin.toFixed(1)}% Περιθώριο`} icon={<TrendingUp/>} colorClass="text-blue-600" hint="Πραγματοποιημένα έσοδα μείον εκτιμώμενο κόστος παραγωγής." />
                  <KPICard title="Εκτιμώμενο κόστος" value={formatCurrency(stats.financeCost)} subValue={`ΦΠΑ ${formatCurrency(stats.realizedVat)}`} icon={<Scale/>} colorClass="text-slate-600" hint="Κόστος για όσα έχουν αποσταλεί στην επιλεγμένη περίοδο. Το ΦΠΑ εμφανίζεται ξεχωριστά." />
              </div>

              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 flex flex-col md:flex-row md:items-center justify-between gap-5">
                  <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-slate-100 text-slate-600 rounded-2xl flex items-center justify-center">
                          <Coins size={24}/>
                      </div>
                      <div>
                          <div className="font-black text-slate-800 uppercase text-[10px] tracking-widest">Ασήμι για Παραγωγή</div>
                          <div className="text-slate-500 text-xs mt-0.5">Μόνο in-house είδη, χωρίς εισαγόμενα και STX.</div>
                          <div className="mt-3">
                              <select
                                  value={silverOrderScope}
                                  onChange={e => setSilverOrderScope(e.target.value as SilverOrderScope)}
                                  className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-black rounded-xl py-2 px-3 outline-none cursor-pointer hover:border-slate-300 focus:ring-2 focus:ring-slate-200"
                                  aria-label="Εύρος παραγγελιών για ασήμι παραγωγής"
                              >
                                  {(Object.keys(SILVER_SCOPE_LABELS) as SilverOrderScope[]).map(scope => (
                                      <option key={scope} value={scope}>{SILVER_SCOPE_LABELS[scope]}</option>
                                  ))}
                              </select>
                          </div>
                      </div>
                  </div>
                  <div className="text-right">
                      <div className="font-black text-slate-900 text-3xl">
                          {formatDecimal(stats.inHouseSilverUsed[silverOrderScope] / 1000, 3)} <span className="text-base text-slate-400 font-bold">kg</span>
                      </div>
                      <div className="text-[11px] font-bold text-slate-400 mt-1">
                          {formatDecimal(stats.inHouseSilverUsed[silverOrderScope], 1)} g
                      </div>
                  </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <KPICard title="Εκκρεμής αξία παραγγελιών" value={formatCurrency(stats.pendingRevenue)} subValue={`${stats.activeOrdersCount} ανοιχτές παραγγελίες`} icon={<Package/>} colorClass="text-indigo-600" hint="Καθαρή αξία τεμαχίων που δεν έχουν αποσταλεί ακόμη. Δεν μετράει στα έσοδα." />
                  <KPICard title="Αξία αποθέματος (λιανική)" value={formatCurrency(stats.totalPotentialRevenue * 3)} icon={<Target/>} colorClass="text-purple-600" hint="Η συνολική αξία του αποθέματος σε τιμές λιανικής (εκτίμηση x3)." />
              </div>

              <div className="rounded-3xl border border-slate-100 bg-white shadow-sm overflow-hidden">
                  <button
                      type="button"
                      onClick={() => setLegalReconciliationOpen((open) => !open)}
                      aria-expanded={legalReconciliationOpen}
                      className="flex w-full items-center justify-between gap-4 p-6 text-left transition-colors hover:bg-slate-50/80"
                  >
                      <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-slate-100 text-slate-600 rounded-2xl flex items-center justify-center shrink-0">
                              <FileText size={24}/>
                          </div>
                          <div>
                              <div className="font-black text-slate-800 uppercase text-[10px] tracking-widest">Συμφωνία με παραστατικά</div>
                              <div className="text-slate-500 text-xs mt-0.5">Σύγκριση πραγματοποιημένων εσόδων με εκδοθέντα παραστατικά.</div>
                          </div>
                      </div>
                      <ChevronDown size={20} className={`shrink-0 text-slate-400 transition-transform ${legalReconciliationOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {legalReconciliationOpen && (
                      <div className="border-t border-slate-100 px-6 pb-6">
                          <KPICard title="Συμφωνία με παραστατικά" value={formatCurrency(stats.legalGap)} subValue={`Εκδόθηκαν ${formatCurrency(stats.legalIssuedNet)}`} icon={<Wallet/>} colorClass={Math.abs(stats.legalGap) < 0.01 ? 'text-emerald-600' : 'text-amber-600'} hint="Διαφορά ανάμεσα στα πραγματοποιημένα έσοδα και την καθαρή αξία εκδομένων παραστατικών." />
                      </div>
                  )}
              </div>

              <div className="bg-indigo-50 border border-indigo-100 rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                      <div className="p-4 bg-indigo-100 text-indigo-600 rounded-2xl">
                          <BarChart3 size={32} />
                      </div>
                      <div>
                          <h3 className="font-black text-indigo-900 text-lg">Προηγμένη Ανάλυση Δεδομένων</h3>
                          <p className="text-sm text-indigo-600/80">Δείτε αναλυτικά γραφήματα, τάσεις πωλήσεων και κερδοφορία ανά κατηγορία.</p>
                      </div>
                  </div>
                  <button 
                    onClick={() => onNavigate?.('analytics')}
                    className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all flex items-center gap-2 whitespace-nowrap"
                  >
                      Άνοιγμα Αναλυτικών <ArrowUpRight size={18}/>
                  </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                      <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                          <Gem size={20} className="text-emerald-500" /> Ανάλυση Κατανάλωσης Υλικών
                      </h3>
                      <div className="space-y-4">
                          <div className="flex items-center justify-between p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
                                        <Scale size={20}/>
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-800 uppercase text-[10px] tracking-widest">Συνολικό Ασήμι</div>
                                        <div className="text-slate-500 text-xs">Από πωληθέντα είδη</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-black text-emerald-700 text-xl">{stats.silverSold.toFixed(3)} kg</div>
                                </div>
                          </div>
                          <div className="flex items-center justify-between p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
                                        <Gem size={20}/>
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-800 uppercase text-[10px] tracking-widest">Πέτρες & Υλικά</div>
                                        <div className="text-slate-500 text-xs">Συνολικά τεμάχια</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-black text-blue-700 text-xl">{stats.stonesSold} <span className="text-xs font-normal">τμχ</span></div>
                                </div>
                          </div>
                      </div>
                  </div>
                  
                  <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                      <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                          <Crown size={20} className="text-purple-500" /> Απόθεμα Υψηλής Αξίας
                      </h3>
                      <div className="space-y-4">
                          {stats.topStockValue.map((item, index) => (
                              <div key={item.sku} className="flex items-center justify-between p-4 bg-purple-50/50 rounded-2xl border border-purple-100">
                                  <div>
                                      <div className="font-bold text-slate-800">{item.sku}</div>
                                      <div className="text-[10px] text-slate-500">{item.category}</div>
                                  </div>
                                  <div className="text-right">
                                      <div className="font-black text-purple-700">{formatCurrency(item.value)}</div>
                                      <div className="text-[10px] text-slate-400 font-bold">{item.qty} τμχ (Stock)</div>
                                  </div>
                              </div>
                          ))}
                          {stats.topStockValue.length === 0 && <div className="text-slate-400 text-sm text-center py-4">Δεν βρέθηκε απόθεμα.</div>}
                      </div>
                  </div>
              </div>
          </div>
      )}

      {activeTab === 'production' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                  <div className="mb-8 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2">
                          <Factory size={20} className="text-amber-500" /> Φόρτος Εργασίας ανά Στάδιο
                      </h3>
                      <p className="text-xs font-semibold text-slate-500">Παρτίδες που ξεκίνησαν {periodLabel.toLowerCase()}.</p>
                  </div>
                  <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={productionStageData}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                              <XAxis dataKey="name" tick={{fontSize: 11, fontWeight: 'bold'}} interval={0} height={50}/>
                              <YAxis tick={{fontSize: 12}} allowDecimals={false} />
                              <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                              <Bar dataKey="value" fill="#f59e0b" radius={[6, 6, 0, 0]} name="Τεμάχια" barSize={60} />
                          </BarChart>
                      </ResponsiveContainer>
                  </div>
              </div>
          </div>
      )}

      {activeTab === 'inventory' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <KPICard title="Τεμάχια Πωληθέντα" value={stats.shippedPieces.toString()} subValue={periodLabel} icon={<ShoppingBag/>} colorClass="text-emerald-600" hint={`Συνολικά τεμάχια που αποστάλθηκαν ${periodLabel.toLowerCase()}.`} />
                  <KPICard title="Έσοδα Περιόδου" value={formatCurrency(stats.totalRevenue)} subValue={`${stats.financeMargin.toFixed(1)}% περιθώριο`} icon={<DollarSign/>} colorClass="text-blue-600" hint={`Πραγματοποιημένα έσοδα για ${periodLabel.toLowerCase()}.`} />
                  <KPICard title="Τρέχον Απόθεμα" value={stats.totalStockQty.toString()} subValue={`${products.length} κωδικοί`} icon={<Package/>} colorClass="text-slate-600" hint="Συνολικά τεμάχια στην αποθήκη αυτή τη στιγμή." />
                  <KPICard title="Αξία Αποθέματος" value={formatCurrency(stats.totalCostValue)} subValue={`${formatDecimal(stats.totalSilverWeight, 0)}g ασήμι`} icon={<Scale/>} colorClass="text-amber-600" hint="Τρέχουσα αξία κόστους αποθέματος." />
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                  <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                      <Trophy size={20} className="text-emerald-500" /> Κορυφαία Πωλήσεις ({periodLabel})
                  </h3>
                  <div className="space-y-4">
                      {topSoldProducts.map((item) => (
                          <div key={item.sku} className="flex items-center justify-between p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100">
                              <div>
                                  <div className="font-bold text-slate-800">{item.sku}</div>
                                  <div className="text-[10px] text-slate-500">{item.quantity} τμχ</div>
                              </div>
                              <div className="text-right">
                                  <div className="font-black text-emerald-700">{formatCurrency(item.revenue)}</div>
                                  <div className="text-[10px] text-slate-400 font-bold">{item.margin.toFixed(1)}% περιθώριο</div>
                              </div>
                          </div>
                      ))}
                      {topSoldProducts.length === 0 && <div className="text-slate-400 text-sm text-center py-4">Δεν βρέθηκαν πωλήσεις για {periodLabel.toLowerCase()}.</div>}
                  </div>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                  <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                      <AlertTriangle size={20} className="text-amber-500" /> Χαμηλό Απόθεμα
                  </h3>
                  <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                          <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                              <tr>
                                  <th className="p-4 rounded-l-xl">SKU</th>
                                  <th className="p-4">Κατηγορία</th>
                                  <th className="p-4 text-center">Στοκ</th>
                                  <th className="p-4 rounded-r-xl">Κατάσταση</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                              {products.filter(p => p.stock_qty < 5).slice(0, 10).map(p => (
                                  <tr key={p.sku} className="hover:bg-slate-50/50 transition-colors">
                                      <td className="p-4 font-bold text-slate-800">{p.sku}</td>
                                      <td className="p-4 text-slate-500">{p.category}</td>
                                      <td className="p-4 text-center font-black">{p.stock_qty}</td>
                                      <td className="p-4">
                                          <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase ${p.stock_qty === 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                              {p.stock_qty === 0 ? 'Εξαντλημένο' : 'Χαμηλό'}
                                          </span>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}
