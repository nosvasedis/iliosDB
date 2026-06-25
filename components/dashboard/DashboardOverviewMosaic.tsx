import React from 'react';
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
} from '../../features/dashboard/dashboardMosaicViewModels';
import DashboardMosaicPane from './DashboardMosaicPane';
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

export interface DashboardMosaicData {
  periodLabel: string;
  colors: string[];
  materials: { silverSold: number; silverValue: number; stonesSold: number };
  productionPulse: ProductionPulseSummary;
  deliveryAttention: DeliveryAttentionEntry[];
  readyOrdersCount: number;
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
      <span className={`font-black ${dark ? 'text-white' : valueClass}`}>{value}</span>
    </div>
  );
}

export default function DashboardOverviewMosaic({ data, onNavigate, onOpenTopVariants }: Props) {
  const {
    periodLabel,
    colors,
    materials,
    productionPulse,
    deliveryAttention,
    readyOrdersCount,
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
  let delay = 0;
  const step = 40;

  return (
    <div>
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-lg font-bold text-slate-800">Επισκόπηση λειτουργίας</h2>
        <p className="text-sm font-medium text-slate-500">{periodLabel}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
        {/* Row 1 */}
        <DashboardMosaicPane
          title="Ασήμι & Υλικά"
          icon={Gem}
          accent="dark"
          colSpan={4}
          animationDelay={(delay += step) - step}
        >
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-200/60">Ασήμι Πωληθέν</p>
              <p className="mt-1 text-2xl font-black tracking-tight">
                {materials.silverSold.toFixed(3)}{' '}
                <span className="text-sm font-medium opacity-40">kg</span>
              </p>
              <p className="mt-1 text-sm font-bold text-emerald-300">≈ {formatCurrency(materials.silverValue)}</p>
            </div>
            <div className="h-px bg-white/10" />
            <div className="text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-200/60">Πέτρες & Υλικά</p>
              <p className="mt-1 text-xl font-black text-amber-400">
                {materials.stonesSold} <span className="text-sm font-medium opacity-40">τμχ</span>
              </p>
            </div>
          </div>
        </DashboardMosaicPane>

        <DashboardMosaicPane
          title="Παλμός Παραγωγής"
          icon={Factory}
          accent="amber"
          colSpan={4}
          animationDelay={(delay += step) - step}
          onNavigate={onNavigate ? () => onNavigate('production') : undefined}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Υγεία ροής</span>
              <span
                className={`text-2xl font-black ${
                  productionPulse.healthScore >= 80 ? 'text-emerald-600' : productionPulse.healthScore >= 50 ? 'text-amber-600' : 'text-red-600'
                }`}
              >
                {productionPulse.healthScore}%
              </span>
            </div>
            <div className="space-y-1.5">
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
          colSpan={4}
          animationDelay={(delay += step) - step}
          onNavigate={onNavigate ? () => onNavigate('deliveries') : undefined}
        >
          {deliveryAttention.length === 0 ? (
            <MosaicEmptyState message="Καμία επείγουσα υπενθύμιση." />
          ) : (
            <div className="space-y-1.5">
              {deliveryAttention.slice(0, 3).map((entry) => (
                <div
                  key={entry.reminder.id}
                  className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-2.5 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black text-slate-800">
                      {entry.item.order.customer_name}
                    </p>
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
              {deliveryAttention.length > 3 && (
                <p className="text-center text-[10px] font-bold text-slate-400">
                  +{deliveryAttention.length - 3} ακόμη
                </p>
              )}
            </div>
          )}
        </DashboardMosaicPane>

        {/* Row 2 */}
        <DashboardMosaicPane
          title="Έτοιμες Παραγγελίες"
          icon={CheckCircle}
          accent="emerald"
          colSpan={4}
          animationDelay={(delay += step) - step}
          onNavigate={onNavigate ? () => onNavigate('orders') : undefined}
        >
          <div className="flex flex-col items-center justify-center py-2">
            <p className="text-4xl font-black text-emerald-600">{readyOrdersCount}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">περιμένουν παράδοση</p>
          </div>
        </DashboardMosaicPane>

        <DashboardMosaicPane
          title="Μέσος Όρος Παραγγελίας"
          icon={Wallet}
          accent="emerald"
          colSpan={4}
          animationDelay={(delay += step) - step}
          onNavigate={onNavigate ? () => onNavigate('analytics') : undefined}
        >
          <div className="space-y-3 py-1">
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400">Μ.Ο. αξία</p>
              <p className="text-xl font-black text-slate-800">{formatCurrency(orderEconomics.averageOrderValue)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400">Μ.Ο. τεμάχια</p>
              <p className="text-xl font-black text-slate-800">{orderEconomics.averageBasketSize.toFixed(1)}</p>
            </div>
          </div>
        </DashboardMosaicPane>

        <DashboardMosaicPane
          title="Έκπτωση & ΦΠΑ"
          icon={Percent}
          accent="indigo"
          colSpan={4}
          animationDelay={(delay += step) - step}
          onNavigate={onNavigate ? () => onNavigate('financials') : undefined}
        >
          <div className="space-y-3 py-1">
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400">Έκπτωση περιόδου</p>
              <p className="text-xl font-black text-rose-600">{formatCurrency(discountVat.discount)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400">ΦΠΑ περιόδου</p>
              <p className="text-xl font-black text-slate-800">{formatCurrency(discountVat.vat)}</p>
            </div>
          </div>
        </DashboardMosaicPane>

        {/* Row 3 */}
        <DashboardMosaicPane
          title="Βάθος Εκκρεμοτήτων"
          icon={Activity}
          accent="slate"
          colSpan={4}
          animationDelay={(delay += step) - step}
          onNavigate={onNavigate ? () => onNavigate('orders') : undefined}
        >
          <div className="space-y-1.5">
            <StatLine label="Μικτή αξία" value={formatCurrency(backlogDepth.gross)} />
            <StatLine label="ΦΠΑ" value={formatCurrency(backlogDepth.vat)} />
            <StatLine label="Καθαρή αξία" value={formatCurrency(backlogDepth.net)} valueClass="text-slate-900" />
          </div>
        </DashboardMosaicPane>

        <DashboardMosaicPane
          title="Ανοιχτές Προσφορές"
          icon={Tag}
          accent="blue"
          colSpan={4}
          animationDelay={(delay += step) - step}
          onNavigate={onNavigate ? () => onNavigate('offers') : undefined}
        >
          <div className="flex flex-col items-center justify-center py-2">
            <p className="text-3xl font-black text-blue-600">{offersPipeline.count}</p>
            <p className="mt-1 text-sm font-bold text-slate-600">{formatCurrency(offersPipeline.totalValue)}</p>
            <p className="mt-0.5 text-[10px] text-slate-400">σε αναμονή απάντησης</p>
          </div>
        </DashboardMosaicPane>

        <DashboardMosaicPane
          title="Νομική Συμφωνία"
          icon={FileText}
          accent="indigo"
          colSpan={4}
          animationDelay={(delay += step) - step}
          onNavigate={onNavigate ? () => onNavigate('legal') : undefined}
        >
          <div className="space-y-2 py-1">
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400">Διαφορά καθαρής αξίας</p>
              <p
                className={`text-xl font-black ${
                  Math.abs(compliance.legalGap) < 1 ? 'text-emerald-600' : 'text-amber-600'
                }`}
              >
                {formatCurrency(compliance.legalGap)}
              </p>
            </div>
            <p className="text-xs text-slate-500">{compliance.issuedCount} εκδοθέντα παραστατικά</p>
          </div>
        </DashboardMosaicPane>

        {/* Row 4 - Sales */}
        <DashboardMosaicPane
          title="Πωλήσεις ανά Κατηγορία"
          icon={PieChart}
          accent="blue"
          colSpan={6}
          animationDelay={(delay += step) - step}
          headerExtra={
            <div className="relative">
              <Filter className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400" size={10} />
              <select
                value={categoryGenderFilter}
                onChange={(e) => onCategoryGenderFilterChange(e.target.value as 'All' | Gender)}
                onClick={(e) => e.stopPropagation()}
                className="cursor-pointer appearance-none rounded-md border border-slate-200 bg-slate-50 py-1 pl-5 pr-2 text-[10px] font-bold text-slate-600 outline-none"
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
            <MiniPiePanel data={categoryData} colors={colors} compact />
          )}
        </DashboardMosaicPane>

        <DashboardMosaicPane
          title="Πωλήσεις ανά Συλλογή"
          icon={Boxes}
          accent="violet"
          colSpan={6}
          animationDelay={(delay += step) - step}
          onNavigate={onNavigate ? () => onNavigate('collections') : undefined}
        >
          {collectionData.length === 0 ? (
            <MosaicEmptyState message={emptySales} />
          ) : (
            <MiniPiePanel
              data={collectionData}
              colors={colors}
              compact
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
          colSpan={6}
          animationDelay={(delay += step) - step}
        >
          {topVariants.length === 0 ? (
            <MosaicEmptyState message={emptySales} />
          ) : (
            <MiniVariantList items={topVariants.slice(0, 5)} onOpenFull={onOpenTopVariants} />
          )}
        </DashboardMosaicPane>

        <DashboardMosaicPane
          title="Πωλήσεις ανά Φύλο"
          icon={Users}
          accent="sky"
          colSpan={4}
          animationDelay={(delay += step) - step}
        >
          {genderData.length === 0 ? (
            <MosaicEmptyState message={emptySales} />
          ) : (
            <MiniPiePanel data={genderData} colors={colors} compact />
          )}
        </DashboardMosaicPane>

        <DashboardMosaicPane
          title="Πωλήσεις ανά Φινίρισμα"
          icon={Sparkles}
          accent="rose"
          colSpan={4}
          animationDelay={(delay += step) - step}
        >
          {finishData.length === 0 ? (
            <MosaicEmptyState message={emptySales} />
          ) : (
            <MiniPiePanel data={finishData} colors={colors} compact />
          )}
        </DashboardMosaicPane>

        <DashboardMosaicPane
          title="Κορυφαίοι Πελάτες"
          icon={UserCheck}
          accent="emerald"
          colSpan={4}
          animationDelay={(delay += step) - step}
          onNavigate={onNavigate ? () => onNavigate('customers') : undefined}
        >
          {topCustomers.length === 0 ? (
            <MosaicEmptyState message={emptySales} />
          ) : (
            <MiniCustomerList items={topCustomers.slice(0, 5)} />
          )}
        </DashboardMosaicPane>

        {/* Row 6 - Inventory */}
        <DashboardMosaicPane
          title="Χαμηλό Απόθεμα"
          icon={Package}
          accent="violet"
          colSpan={6}
          animationDelay={(delay += step) - step}
          onNavigate={onNavigate ? () => onNavigate('inventory') : undefined}
        >
          {inventoryRisk.totalLowStock === 0 ? (
            <MosaicEmptyState message="Όλα τα είδη έχουν επαρκές απόθεμα." />
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-bold text-violet-600">
                {inventoryRisk.totalLowStock} είδη &lt; 5 τεμ.
              </p>
              <div className="space-y-1.5">
                {inventoryRisk.rows.map((row) => (
                  <div
                    key={`${row.sku}::${row.suffix}`}
                    className="flex items-center justify-between rounded-xl bg-slate-50 px-2.5 py-2"
                  >
                    <span className="truncate text-xs font-bold text-slate-700">{row.label}</span>
                    <span className="shrink-0 text-xs font-black text-red-600">{row.stock} τεμ.</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DashboardMosaicPane>

        <DashboardMosaicPane
          title="Ζήτηση > Απόθεμα"
          icon={AlertTriangle}
          accent="amber"
          colSpan={6}
          animationDelay={(delay += step) - step}
          onNavigate={onNavigate ? () => onNavigate('inventory') : undefined}
        >
          {demandPressure.totalPressure === 0 ? (
            <MosaicEmptyState message="Η ζήτηση καλύπτεται από το απόθεμα." />
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-bold text-amber-600">{demandPressure.totalPressure} είδη με έλλειμμα</p>
              <div className="space-y-1.5">
                {demandPressure.rows.map((row) => (
                  <div
                    key={`${row.sku}::${row.suffix}`}
                    className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-2.5 py-2"
                  >
                    <span className="truncate text-xs font-bold text-slate-700">{row.label}</span>
                    <span className="shrink-0 text-[10px] font-black text-amber-700">
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
