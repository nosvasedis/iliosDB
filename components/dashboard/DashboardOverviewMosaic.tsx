import React, { memo } from 'react';
import {
  Activity,
  AlertTriangle,
  Boxes,
  CheckCircle,
  Factory,
  FileText,
  Filter,
  Gem,
  Package,
  Percent,
  PieChart,
  Sparkles,
  Tag,
  Truck,
  Trophy,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { Gender } from '../../types';
import { FinanceCollectionRanking, FinanceCustomerRanking } from '../../utils/financeAnalytics';
import { formatCurrency } from '../../utils/pricingEngine';
import { DeliveryAttentionEntry } from '../../utils/deliveryScheduling';
import type { DashboardPieSlice, DashboardVariantRow } from '../../features/dashboard/dashboardAnalysisViewModels';
import type {
  DemandPressureRow,
  InventoryRiskRow,
  OffersPipelineSummary,
  ProductionPulseSummary,
  ReadyOrdersSummary,
} from '../../features/dashboard/dashboardMosaicViewModels';
import DashboardMosaicPane, { MOSAIC_LAYOUT } from './DashboardMosaicPane';
import { DASHBOARD_TERM_HINTS } from '../../features/dashboard/dashboardTermHints';
import {
  MiniCustomerList,
  MiniPiePanel,
  MiniVariantList,
  MosaicEmptyState,
} from './dashboardMiniCharts';

export type DashboardNavigatePage =
  | 'production'
  | 'deliveries'
  | 'orders'
  | 'analytics'
  | 'financials'
  | 'collections'
  | 'customers'
  | 'inventory'
  | 'offers'
  | 'legal';

export interface MosaicLoadingFlags {
  finance: boolean;
  orders: boolean;
  batches: boolean;
  shipments: boolean;
  delivery: boolean;
  offers: boolean;
}

export interface DashboardMosaicData {
  periodLabel: string;
  colors: string[];
  materials: { silverSold: number; silverValue: number; stonesSold: number };
  productionPulse: ProductionPulseSummary;
  deliveryAttention: DeliveryAttentionEntry[];
  readyOrdersSummary: ReadyOrdersSummary;
  orderEconomics: { averageOrderValue: number; averageBasketSize: number };
  discountVat: { discount: number; vat: number };
  backlogDepth: { gross: number; vat: number; net: number };
  offersPipeline: OffersPipelineSummary;
  compliance: { legalGap: number; issuedCount: number };
  categoryData: DashboardPieSlice[];
  collectionData: DashboardPieSlice[];
  collectionRankings: FinanceCollectionRanking[];
  topVariants: DashboardVariantRow[];
  genderData: DashboardPieSlice[];
  finishData: DashboardPieSlice[];
  topCustomers: FinanceCustomerRanking[];
  inventoryRisk: { totalLowStock: number; rows: InventoryRiskRow[] };
  demandPressure: { totalPressure: number; rows: DemandPressureRow[] };
  categoryGenderFilter: 'All' | Gender;
  onCategoryGenderFilterChange: (value: 'All' | Gender) => void;
}

interface Props {
  data: DashboardMosaicData;
  loading: MosaicLoadingFlags;
  onNavigate?: (page: DashboardNavigatePage) => void;
  onOpenTopVariants?: () => void;
}

function StatLine({
  label,
  value,
  valueClass = 'text-slate-800',
  dark = false,
}: {
  label: string;
  value: string;
  valueClass?: string;
  dark?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className={dark ? 'text-emerald-200/70' : 'text-slate-500'}>{label}</span>
      <span className={`font-black tabular-nums ${dark ? 'text-white' : valueClass}`}>{value}</span>
    </div>
  );
}

function DocumentsPaneContent({
  issuedCount,
  isAligned,
}: {
  issuedCount: number;
  isAligned: boolean;
}) {
  return (
    <div className="flex h-full flex-col justify-center gap-2">
      <p className="text-xs leading-relaxed text-slate-500">
        {issuedCount > 0
          ? `${issuedCount} παραστατικά στην επιλεγμένη περίοδο.`
          : 'Δεν έχουν εκδοθεί παραστατικά για την περίοδο.'}
      </p>
      <span
        className={`inline-flex w-fit rounded-full px-2.5 py-1 text-[10px] font-semibold ${
          isAligned ? 'bg-slate-100 text-slate-500' : 'bg-slate-100 text-slate-600'
        }`}
      >
        {isAligned ? 'Αρχειοθέτηση εντάξει' : 'Ελέγξτε τα στοιχεία'}
      </span>
      <p className="text-[10px] text-slate-400">Πατήστε για πλήρη αρχείο.</p>
    </div>
  );
}

function DashboardOverviewMosaic({ data, loading, onNavigate, onOpenTopVariants }: Props) {
  const {
    periodLabel,
    colors,
    materials,
    productionPulse,
    deliveryAttention,
    readyOrdersSummary,
    orderEconomics,
    discountVat,
    backlogDepth,
    offersPipeline,
    compliance,
    categoryData,
    collectionData,
    collectionRankings,
    topVariants,
    genderData,
    finishData,
    topCustomers,
    inventoryRisk,
    demandPressure,
    categoryGenderFilter,
    onCategoryGenderFilterChange,
  } = data;

  const collectionRevenueByName = new Map(collectionRankings.map((c) => [c.name, c.revenue]));
  const emptySales = `Δεν βρέθηκαν πωλήσεις για ${periodLabel.toLowerCase()}.`;
  const documentsAligned = Math.abs(compliance.legalGap) < 1;

  return (
    <div>
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-lg font-bold text-slate-800">Επισκόπηση λειτουργίας</h2>
        <p className="text-sm font-medium text-slate-500">{periodLabel}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:gap-3.5 [contain:layout]">
        {/* Row 1: 4+3+3+2 */}
        <DashboardMosaicPane
          title="Ασήμι & Υλικά"
          icon={Gem}
          accent="dark"
          size="md"
          layoutClass={MOSAIC_LAYOUT.materials}
          hint={DASHBOARD_TERM_HINTS.materials}
          isLoading={loading.finance}
        >
          <div className="flex h-full flex-col justify-center gap-3">
            <div className="text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-200/60">Ασήμι Πωληθέν</p>
              <p className="mt-0.5 text-xl font-black tracking-tight tabular-nums">
                {materials.silverSold.toFixed(3)}{' '}
                <span className="text-sm font-medium opacity-40">kg</span>
              </p>
              <p className="mt-0.5 text-xs font-bold text-emerald-300 tabular-nums">≈ {formatCurrency(materials.silverValue)}</p>
            </div>
            <div className="h-px bg-white/10" />
            <div className="text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-200/60">Πέτρες & Υλικά</p>
              <p className="mt-0.5 text-lg font-black text-amber-400 tabular-nums">
                {materials.stonesSold} <span className="text-sm font-medium opacity-40">τμχ</span>
              </p>
            </div>
          </div>
        </DashboardMosaicPane>

        <DashboardMosaicPane
          title="Παλμός Παραγωγής"
          icon={Factory}
          accent="amber"
          size="md"
          layoutClass={MOSAIC_LAYOUT.production}
          hint={DASHBOARD_TERM_HINTS.productionPulse}
          isLoading={loading.batches}
          onNavigate={onNavigate ? () => onNavigate('production') : undefined}
        >
          <div className="flex h-full flex-col justify-center gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Υγεία ροής</span>
              <span
                className={`text-2xl font-black tabular-nums ${
                  productionPulse.healthScore >= 80 ? 'text-emerald-600' : productionPulse.healthScore >= 50 ? 'text-amber-600' : 'text-red-600'
                }`}
              >
                {productionPulse.healthScore}%
              </span>
            </div>
            <div className="space-y-1">
              <StatLine label="Καθυστερήσεις (>48ω)" value={String(productionPulse.delayed)} valueClass="text-red-600" />
              <StatLine label="Σε αναμονή" value={String(productionPulse.onHold)} valueClass="text-amber-600" />
              <StatLine label="Έτοιμες παρτίδες" value={String(productionPulse.ready)} valueClass="text-emerald-600" />
            </div>
          </div>
        </DashboardMosaicPane>

        <DashboardMosaicPane
          title="Υπενθυμίσεις Παράδοσης"
          icon={Truck}
          accent="sky"
          size="md"
          layoutClass={MOSAIC_LAYOUT.delivery}
          hint={DASHBOARD_TERM_HINTS.deliveryAttention}
          isLoading={loading.delivery}
          onNavigate={onNavigate ? () => onNavigate('deliveries') : undefined}
        >
          {deliveryAttention.length === 0 ? (
            <MosaicEmptyState message="Καμία επείγουσα υπενθύμιση." />
          ) : (
            <div className="flex flex-col justify-center gap-1.5">
              {deliveryAttention.slice(0, 3).map((entry) => (
                <div
                  key={entry.reminder.id}
                  className="flex h-10 items-center justify-between gap-2 rounded-xl bg-slate-50 px-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black text-slate-800">{entry.item.order.customer_name}</p>
                    <p className="text-[10px] text-slate-500">#{entry.item.order.id.slice(0, 8)}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${
                      entry.urgency === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {entry.urgency === 'overdue' ? 'Εκπρόθεσμο' : 'Σήμερα'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </DashboardMosaicPane>

        <DashboardMosaicPane
          title="Έτοιμες Παραγγελίες"
          icon={CheckCircle}
          accent="emerald"
          size="sm"
          layoutClass={MOSAIC_LAYOUT.readyOrders}
          hint={DASHBOARD_TERM_HINTS.readyOrders}
          isLoading={loading.orders || loading.batches || loading.shipments}
          onNavigate={onNavigate ? () => onNavigate('orders') : undefined}
        >
          <div className="flex h-full flex-col items-center justify-center gap-2 px-1">
            <p className="text-4xl font-black text-emerald-600 tabular-nums">{readyOrdersSummary.total}</p>
            {readyOrdersSummary.total > 0 ? (
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {readyOrdersSummary.fullCount > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                    {readyOrdersSummary.fullCount} πλήρεις
                  </span>
                ) : null}
                {readyOrdersSummary.partialCount > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
                    {readyOrdersSummary.partialCount} μερική
                  </span>
                ) : null}
              </div>
            ) : null}
            <p className="text-center text-[10px] font-semibold leading-snug text-slate-500">
              έτοιμες προς αποστολή
              <span className="block text-slate-400">ίδιο κριτήριο με «Αποστολή 100%»</span>
            </p>
          </div>
        </DashboardMosaicPane>

        {/* Row 2: 4+3+3+2 */}
        <DashboardMosaicPane
          title="Μέσος Όρος Παραγγελίας"
          icon={Wallet}
          accent="emerald"
          size="md"
          layoutClass={MOSAIC_LAYOUT.orderEconomics}
          hint={DASHBOARD_TERM_HINTS.orderEconomics}
          isLoading={loading.finance}
          onNavigate={onNavigate ? () => onNavigate('analytics') : undefined}
        >
          <div className="flex h-full flex-col justify-center gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400">Μ.Ο. αξία</p>
              <p className="text-xl font-black text-slate-800 tabular-nums">{formatCurrency(orderEconomics.averageOrderValue)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400">Μ.Ο. τεμάχια</p>
              <p className="text-xl font-black text-slate-800 tabular-nums">{orderEconomics.averageBasketSize.toFixed(1)}</p>
            </div>
          </div>
        </DashboardMosaicPane>

        <DashboardMosaicPane
          title="Έκπτωση & ΦΠΑ"
          icon={Percent}
          accent="indigo"
          size="md"
          layoutClass={MOSAIC_LAYOUT.discountVat}
          hint={DASHBOARD_TERM_HINTS.discountVat}
          isLoading={loading.finance}
          onNavigate={onNavigate ? () => onNavigate('financials') : undefined}
        >
          <div className="flex h-full flex-col justify-center gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400">Έκπτωση περιόδου</p>
              <p className="text-xl font-black text-rose-600 tabular-nums">{formatCurrency(discountVat.discount)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400">ΦΠΑ περιόδου</p>
              <p className="text-xl font-black text-slate-800 tabular-nums">{formatCurrency(discountVat.vat)}</p>
            </div>
          </div>
        </DashboardMosaicPane>

        <DashboardMosaicPane
          title="Βάθος Εκκρεμοτήτων"
          icon={Activity}
          accent="slate"
          size="md"
          layoutClass={MOSAIC_LAYOUT.backlog}
          hint={DASHBOARD_TERM_HINTS.backlogDepth}
          isLoading={loading.finance}
          onNavigate={onNavigate ? () => onNavigate('orders') : undefined}
        >
          <div className="flex h-full flex-col justify-center space-y-1">
            <StatLine label="Μικτή αξία" value={formatCurrency(backlogDepth.gross)} />
            <StatLine label="ΦΠΑ" value={formatCurrency(backlogDepth.vat)} />
            <StatLine label="Καθαρή αξία" value={formatCurrency(backlogDepth.net)} valueClass="text-slate-900" />
          </div>
        </DashboardMosaicPane>

        <DashboardMosaicPane
          title="Ανοιχτές Προσφορές"
          icon={Tag}
          accent="blue"
          size="sm"
          layoutClass={MOSAIC_LAYOUT.offers}
          hint={DASHBOARD_TERM_HINTS.offers}
          isLoading={loading.offers}
          onNavigate={onNavigate ? () => onNavigate('offers') : undefined}
        >
          <div className="flex h-full flex-col items-center justify-center">
            <p className="text-3xl font-black text-blue-600 tabular-nums">{offersPipeline.count}</p>
            <p className="mt-1 text-sm font-bold text-slate-600 tabular-nums">{formatCurrency(offersPipeline.totalValue)}</p>
            <p className="mt-0.5 text-[10px] text-slate-400">σε αναμονή απάντησης</p>
          </div>
        </DashboardMosaicPane>

        {/* Row 3: 3+9 — category fills the row */}
        <DashboardMosaicPane
          title="Παραστατικά"
          icon={FileText}
          accent="slate"
          size="md"
          layoutClass={MOSAIC_LAYOUT.documents}
          hint={DASHBOARD_TERM_HINTS.documents}
          isLoading={loading.finance}
          onNavigate={onNavigate ? () => onNavigate('legal') : undefined}
        >
          <DocumentsPaneContent issuedCount={compliance.issuedCount} isAligned={documentsAligned} />
        </DashboardMosaicPane>

        <DashboardMosaicPane
          title="Πωλήσεις ανά Κατηγορία"
          icon={PieChart}
          accent="blue"
          size="chart"
          layoutClass={MOSAIC_LAYOUT.category}
          hint={DASHBOARD_TERM_HINTS.categorySales}
          isLoading={loading.finance}
          headerExtra={
            <div className="relative">
              <Filter className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400" size={10} />
              <select
                value={categoryGenderFilter}
                onChange={(e) => onCategoryGenderFilterChange(e.target.value as 'All' | Gender)}
                onClick={(e) => e.stopPropagation()}
                className="cursor-pointer appearance-none rounded-md border border-slate-200 bg-white py-1 pl-5 pr-2 text-[10px] font-bold text-slate-600 outline-none shadow-sm"
              >
                <option value="All">Όλα</option>
                <option value={Gender.Women}>Γυν.</option>
                <option value={Gender.Men}>Ανδρ.</option>
                <option value={Gender.Unisex}>Unisex</option>
              </select>
            </div>
          }
        >
          {categoryData.length === 0 ? (
            <MosaicEmptyState message={emptySales} />
          ) : (
            <MiniPiePanel data={categoryData} colors={colors} />
          )}
        </DashboardMosaicPane>

        {/* Row 4: 5+7 */}
        <DashboardMosaicPane
          title="Πωλήσεις ανά Συλλογή"
          icon={Boxes}
          accent="violet"
          size="chart"
          layoutClass={MOSAIC_LAYOUT.collection}
          hint={DASHBOARD_TERM_HINTS.collectionSales}
          isLoading={loading.finance}
          onNavigate={onNavigate ? () => onNavigate('collections') : undefined}
        >
          {collectionData.length === 0 ? (
            <MosaicEmptyState message={emptySales} />
          ) : (
            <MiniPiePanel
              data={collectionData}
              colors={colors}
              legendExtra={(item) => (
                <p className="text-[9px] font-semibold text-slate-400">
                  {formatCurrency(collectionRevenueByName.get(item.name) ?? 0)}
                </p>
              )}
            />
          )}
        </DashboardMosaicPane>

        <DashboardMosaicPane
          title="Κορυφαία SKU"
          icon={Trophy}
          accent="amber"
          size="list"
          layoutClass={MOSAIC_LAYOUT.variants}
          hint={DASHBOARD_TERM_HINTS.topVariants}
          isLoading={loading.finance}
        >
          {topVariants.length === 0 ? (
            <MosaicEmptyState message={emptySales} />
          ) : (
            <MiniVariantList items={topVariants.slice(0, 5)} onOpenFull={onOpenTopVariants} />
          )}
        </DashboardMosaicPane>

        {/* Row 5: 4+3+5 */}
        <DashboardMosaicPane
          title="Πωλήσεις ανά Φύλο"
          icon={Users}
          accent="sky"
          size="chart"
          layoutClass={MOSAIC_LAYOUT.gender}
          hint={DASHBOARD_TERM_HINTS.genderSales}
          isLoading={loading.finance}
        >
          {genderData.length === 0 ? (
            <MosaicEmptyState message={emptySales} />
          ) : (
            <MiniPiePanel data={genderData} colors={colors} />
          )}
        </DashboardMosaicPane>

        <DashboardMosaicPane
          title="Πωλήσεις ανά Φινίρισμα"
          icon={Sparkles}
          accent="rose"
          size="chart"
          layoutClass={MOSAIC_LAYOUT.finish}
          hint={DASHBOARD_TERM_HINTS.finishSales}
          isLoading={loading.finance}
        >
          {finishData.length === 0 ? (
            <MosaicEmptyState message={emptySales} />
          ) : (
            <MiniPiePanel data={finishData} colors={colors} />
          )}
        </DashboardMosaicPane>

        <DashboardMosaicPane
          title="Κορυφαίοι Πελάτες"
          icon={UserCheck}
          accent="emerald"
          size="list"
          layoutClass={MOSAIC_LAYOUT.customers}
          hint={DASHBOARD_TERM_HINTS.topCustomers}
          isLoading={loading.finance}
          onNavigate={onNavigate ? () => onNavigate('customers') : undefined}
        >
          {topCustomers.length === 0 ? (
            <MosaicEmptyState message={emptySales} />
          ) : (
            <MiniCustomerList items={topCustomers.slice(0, 5)} />
          )}
        </DashboardMosaicPane>

        {/* Row 6: 7+5 */}
        <DashboardMosaicPane
          title="Χαμηλό Απόθεμα"
          icon={Package}
          accent="violet"
          size="lg"
          layoutClass={MOSAIC_LAYOUT.inventoryRisk}
          hint={DASHBOARD_TERM_HINTS.inventoryRisk}
          onNavigate={onNavigate ? () => onNavigate('inventory') : undefined}
        >
          {inventoryRisk.totalLowStock === 0 ? (
            <MosaicEmptyState message="Όλα τα είδη έχουν επαρκές απόθεμα." />
          ) : (
            <div className="flex h-full flex-col justify-center gap-2">
              <p className="text-xs font-bold text-violet-600">{inventoryRisk.totalLowStock} είδη &lt; 5 τεμ.</p>
              <div className="space-y-1.5">
                {inventoryRisk.rows.map((row) => (
                  <div
                    key={`${row.sku}::${row.suffix}`}
                    className="flex h-9 items-center justify-between rounded-xl bg-slate-50 px-2.5"
                  >
                    <span className="truncate text-xs font-bold text-slate-700">{row.label}</span>
                    <span className="shrink-0 text-xs font-black text-red-600 tabular-nums">{row.stock} τεμ.</span>
                  </div>
                ))}
                {inventoryRisk.totalLowStock > inventoryRisk.rows.length && (
                  <p className="text-center text-[10px] font-bold text-slate-400">
                    +{inventoryRisk.totalLowStock - inventoryRisk.rows.length} ακόμη
                  </p>
                )}
              </div>
            </div>
          )}
        </DashboardMosaicPane>

        <DashboardMosaicPane
          title="Ζήτηση > Απόθεμα"
          icon={AlertTriangle}
          accent="amber"
          size="lg"
          layoutClass={MOSAIC_LAYOUT.demandPressure}
          hint={DASHBOARD_TERM_HINTS.demandPressure}
          isLoading={loading.orders}
          onNavigate={onNavigate ? () => onNavigate('inventory') : undefined}
        >
          {demandPressure.totalPressure === 0 ? (
            <MosaicEmptyState message="Η ζήτηση καλύπτεται από το απόθεμα." />
          ) : (
            <div className="flex h-full flex-col justify-center gap-2">
              <p className="text-xs font-bold text-amber-600">{demandPressure.totalPressure} είδη με έλλειμμα</p>
              <div className="space-y-1.5">
                {demandPressure.rows.map((row) => (
                  <div
                    key={`${row.sku}::${row.suffix}`}
                    className="flex h-9 items-center justify-between gap-2 rounded-xl bg-slate-50 px-2.5"
                  >
                    <span className="truncate text-xs font-bold text-slate-700">{row.label}</span>
                    <span className="shrink-0 text-[10px] font-black text-amber-700 tabular-nums">
                      {row.demand} ζήτ. / {row.stock} αποθ.
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DashboardMosaicPane>
      </div>
    </div>
  );
}

export default memo(DashboardOverviewMosaic);
