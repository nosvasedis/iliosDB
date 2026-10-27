import React, { memo, useMemo } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Boxes,
  CalendarRange,
  Coins,
  Crown,
  Factory,
  FileCheck2,
  Gem,
  Hourglass,
  Layers,
  Package,
  PackageCheck,
  PieChart,
  Receipt,
  Scale,
  Sparkles,
  Trophy,
  UserCheck,
  Users,
  Warehouse,
} from 'lucide-react';
import { Gender, Product } from '../../types';
import { formatCurrency } from '../../utils/pricingEngine';
import { formatDecimal, formatNumber } from '../../utils/numberFormat';
import type { FinanceAnalytics } from '../../utils/financeAnalytics';
import type { AdminPage } from '../../surfaces/pageIds';
import type { DashboardPieSlice, DashboardVariantRow } from '../../features/dashboard/dashboardAnalysisViewModels';
import type { DemandPressureRow, InventoryRiskRow } from '../../features/dashboard/dashboardMosaicViewModels';
import {
  buildProfitLoss,
  type InventoryValuation,
  type MonthlyTrendPoint,
  type StageLoadRow,
  type StuckBatchRow,
} from '../../features/dashboard/dashboardCommandViewModels';
import { DASHBOARD_TERM_HINTS } from '../../features/dashboard/dashboardTermHints';
import SkuColorizedText from '../SkuColorizedText';
import SpecialCreationNote from '../SpecialCreationNote';
import { BarList, DeltaBadge, EmptyNote, KpiTile, MiniStat, Money, Panel, RankRow, Segmented } from './DashboardKit';
import { StageLoadPanel, StuckBatchesPanel } from './DashboardOverviewPanels';

type Navigate = (page: AdminPage) => void;

const TAB_ANIMATION = 'space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300';

// ═══ Πωλήσεις ═══════════════════════════════════════════════════════════════

interface SalesTabProps {
  isLoading: boolean;
  periodLabel: string;
  finance: FinanceAnalytics | null;
  deltas: { revenue: number | null; profit: number | null; pieces: number | null; orders: number | null };
  comparisonLabel?: string;
  categoryData: DashboardPieSlice[];
  categoryGenderFilter: 'All' | Gender;
  onCategoryGenderFilterChange: (value: 'All' | Gender) => void;
  collectionData: DashboardPieSlice[];
  genderData: DashboardPieSlice[];
  finishData: DashboardPieSlice[];
  topVariants: DashboardVariantRow[];
  onOpenTopVariants: () => void;
  onNavigate: Navigate;
}

const GENDER_FILTER_OPTIONS: Array<{ value: 'All' | Gender; label: string }> = [
  { value: 'All', label: 'Όλα' },
  { value: Gender.Women, label: 'Γυν.' },
  { value: Gender.Men, label: 'Ανδρ.' },
  { value: Gender.Unisex, label: 'Unisex' },
];

const toBarRows = (data: DashboardPieSlice[]) => data.map((slice) => ({ key: slice.name, label: slice.name, value: slice.value }));

export const SalesTab = memo(function SalesTab({
  isLoading,
  periodLabel,
  finance,
  deltas,
  comparisonLabel,
  categoryData,
  categoryGenderFilter,
  onCategoryGenderFilterChange,
  collectionData,
  genderData,
  finishData,
  topVariants,
  onOpenTopVariants,
  onNavigate,
}: SalesTabProps) {
  const totals = finance?.totals;
  const emptySales = `Δεν βρέθηκαν πωλήσεις για ${periodLabel.toLowerCase()}.`;
  const collectionRevenue = useMemo(
    () => new Map((finance?.topCollections ?? []).map((collection) => [collection.name, collection.revenue])),
    [finance?.topCollections],
  );
  const listValue = (totals?.realizedNet ?? 0) + (totals?.discount ?? 0);
  const discountShare = listValue > 0 ? ((totals?.discount ?? 0) / listValue) * 100 : 0;
  const sellers = (finance?.topSellers ?? []).filter((seller) => seller.revenue > 0 || seller.pendingRevenue > 0);

  return (
    <div className={TAB_ANIMATION}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Τεμάχια πωληθέντα"
          icon={Package}
          tone="emerald"
          isLoading={isLoading}
          value={formatNumber(totals?.shippedPieces ?? 0)}
          delta={comparisonLabel ? deltas.pieces : undefined}
          deltaLabel={comparisonLabel}
          sub={<span>{periodLabel}</span>}
        />
        <KpiTile
          label="Παραγγελίες με αποστολή"
          icon={PackageCheck}
          tone="sky"
          isLoading={isLoading}
          value={formatNumber(totals?.realizedOrderCount ?? 0)}
          delta={comparisonLabel ? deltas.orders : undefined}
          deltaLabel={comparisonLabel}
          sub={<span>{formatDecimal(totals?.averageBasketSize ?? 0, 1)} τεμ. ανά παραγγελία</span>}
        />
        <KpiTile
          label="Μέση αξία παραγγελίας"
          icon={Receipt}
          tone="indigo"
          isLoading={isLoading}
          value={<Money value={totals?.averageOrderValue ?? 0} />}
          sub={<span>καθαρή, χωρίς ΦΠΑ</span>}
          hint={DASHBOARD_TERM_HINTS.orderEconomics}
        />
        <KpiTile
          label="Εκπτώσεις"
          icon={Coins}
          tone="rose"
          isLoading={isLoading}
          value={<Money value={totals?.discount ?? 0} />}
          sub={<span>{formatDecimal(discountShare, 1)}% της αξίας προ έκπτωσης</span>}
          hint={DASHBOARD_TERM_HINTS.discountVat}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel
          title="Πωλήσεις ανά κατηγορία"
          subtitle="Τεμάχια"
          icon={PieChart}
          tone="sky"
          isLoading={isLoading}
          hint={DASHBOARD_TERM_HINTS.categorySales}
          headerExtra={
            <Segmented
              value={categoryGenderFilter}
              onChange={onCategoryGenderFilterChange}
              options={GENDER_FILTER_OPTIONS}
              ariaLabel="Φίλτρο φύλου"
            />
          }
        >
          {categoryData.length === 0 ? <EmptyNote message={emptySales} /> : <BarList rows={toBarRows(categoryData)} tone="sky" />}
        </Panel>
        <Panel
          title="Πωλήσεις ανά συλλογή"
          subtitle="Τεμάχια · καθαρά έσοδα"
          icon={Boxes}
          tone="violet"
          isLoading={isLoading}
          hint={DASHBOARD_TERM_HINTS.collectionSales}
          action={{ label: 'Συλλογές', onClick: () => onNavigate('collections') }}
        >
          {collectionData.length === 0 ? (
            <EmptyNote message={emptySales} />
          ) : (
            <BarList
              tone="violet"
              rows={collectionData.map((slice) => ({
                key: slice.name,
                label: slice.name,
                value: slice.value,
                secondary: <Money value={collectionRevenue.get(slice.name) ?? 0} decimals={false} />,
              }))}
            />
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Panel title="Ανά φύλο" subtitle="Τεμάχια" icon={Users} tone="indigo" isLoading={isLoading} hint={DASHBOARD_TERM_HINTS.genderSales}>
          {genderData.length === 0 ? <EmptyNote message={emptySales} /> : <BarList rows={toBarRows(genderData)} tone="indigo" />}
        </Panel>
        <Panel title="Ανά φινίρισμα" subtitle="Τεμάχια" icon={Sparkles} tone="amber" isLoading={isLoading} hint={DASHBOARD_TERM_HINTS.finishSales}>
          {finishData.length === 0 ? <EmptyNote message={emptySales} /> : <BarList rows={toBarRows(finishData.slice(0, 8))} tone="amber" />}
        </Panel>
        <Panel
          title="Πωλητές"
          subtitle="Έσοδα & προμήθειες περιόδου"
          icon={UserCheck}
          tone="emerald"
          isLoading={isLoading}
          className="md:col-span-2 xl:col-span-1"
          action={{ label: 'Πωλητές', onClick: () => onNavigate('sellers') }}
        >
          {sellers.length === 0 ? (
            <EmptyNote message="Καμία πώληση μέσω πωλητών στην περίοδο." />
          ) : (
            <div className="-mx-3">
              {sellers.slice(0, 6).map((seller, index) => (
                <RankRow
                  key={seller.id}
                  rank={index + 1}
                  title={seller.name}
                  subtitle={`${formatNumber(seller.orders)} παραγγελίες`}
                  value={<Money value={seller.revenue} />}
                  valueSub={<span>προμ. <Money value={seller.earnedCommission} /></span>}
                />
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Panel
          title="Κορυφαία SKU"
          subtitle={`Τεμάχια, έσοδα και περιθώριο · ${periodLabel}`}
          icon={Trophy}
          tone="amber"
          isLoading={isLoading}
          className="lg:col-span-7"
          hint={DASHBOARD_TERM_HINTS.topVariants}
          action={{ label: 'Πλήρης ανάλυση', onClick: onOpenTopVariants }}
        >
          {topVariants.length === 0 ? (
            <EmptyNote message={emptySales} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[30rem] text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    <th className="py-2 pr-2 font-bold">#</th>
                    <th className="py-2 pr-2 font-bold">SKU</th>
                    <th className="py-2 pr-2 text-right font-bold">Τεμ.</th>
                    <th className="py-2 pr-2 text-right font-bold">Έσοδα</th>
                    <th className="py-2 text-right font-bold">Περιθ.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {topVariants.map((row, index) => (
                    <tr key={row.key} className="cursor-pointer transition-colors hover:bg-slate-50" onClick={onOpenTopVariants}>
                      <td className="py-2.5 pr-2 font-black tabular-nums text-slate-400">{index + 1}</td>
                      <td className="py-2.5 pr-2">
                        <SkuColorizedText sku={row.sku} suffix={row.variantSuffix} gender={row.gender} className="text-xs" />
                        <SpecialCreationNote sku={row.sku} note={row.itemNote} compact className="mt-0.5" />
                        <span className="block text-[10px] font-medium text-slate-400">{row.category}</span>
                      </td>
                      <td className="py-2.5 pr-2 text-right font-black tabular-nums text-slate-800">{formatNumber(row.quantity)}</td>
                      <td className="py-2.5 pr-2 text-right font-semibold text-slate-600"><Money value={row.revenue} /></td>
                      <td className={`py-2.5 text-right font-black tabular-nums ${row.margin >= 40 ? 'text-emerald-600' : row.margin >= 20 ? 'text-amber-600' : 'text-rose-600'}`}>
                        {formatDecimal(row.margin, 0)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel
          title="Κορυφαίοι πελάτες"
          subtitle={`Καθαρά έσοδα · ${periodLabel}`}
          icon={Crown}
          tone="emerald"
          isLoading={isLoading}
          className="lg:col-span-5"
          hint={DASHBOARD_TERM_HINTS.topCustomers}
          action={{ label: 'Πελάτες', onClick: () => onNavigate('customers') }}
        >
          {(finance?.topCustomers.length ?? 0) === 0 ? (
            <EmptyNote message={emptySales} />
          ) : (
            <BarList
              tone="emerald"
              showShare={false}
              formatValue={(value) => formatNumber(value)}
              rows={finance!.topCustomers.slice(0, 8).map((customer) => ({
                key: customer.id,
                label: customer.name,
                value: customer.orders,
                secondary: <Money value={customer.revenue} decimals={false} />,
              }))}
            />
          )}
          {(finance?.topCustomers.length ?? 0) > 0 ? (
            <p className="mt-3 text-[10px] font-medium text-slate-400">Δεξιά: αριθμός παραγγελιών με αποστολή.</p>
          ) : null}
        </Panel>
      </div>
    </div>
  );
});

// ═══ Οικονομικά ═════════════════════════════════════════════════════════════

export type SilverOrderScope = 'active' | 'delivered' | 'all_non_cancelled';

const SILVER_SCOPE_OPTIONS: Array<{ value: SilverOrderScope; label: string }> = [
  { value: 'active', label: 'Ενεργές' },
  { value: 'delivered', label: 'Σταλμένα περιόδου' },
  { value: 'all_non_cancelled', label: 'Όλες' },
];

interface FinanceTabProps {
  isLoading: boolean;
  periodLabel: string;
  finance: FinanceAnalytics | null;
  trend: MonthlyTrendPoint[];
  activeOrderCount: number;
  silverPrice: number;
  stonesSold: number;
  silverForProduction: Record<SilverOrderScope, number>;
  silverScope: SilverOrderScope;
  onSilverScopeChange: (scope: SilverOrderScope) => void;
  onNavigate: Navigate;
}

export const FinanceTab = memo(function FinanceTab({
  isLoading,
  periodLabel,
  finance,
  trend,
  activeOrderCount,
  silverPrice,
  stonesSold,
  silverForProduction,
  silverScope,
  onSilverScopeChange,
  onNavigate,
}: FinanceTabProps) {
  const totals = finance?.totals;
  const profitLoss = useMemo(() => (finance ? buildProfitLoss(finance) : []), [finance]);
  const plBase = profitLoss[0]?.value || 1;
  const legal = finance?.legal;
  const legalAligned = legal ? Math.abs(legal.netGap) < 1 : true;
  const reversedTrend = useMemo(() => [...trend].reverse(), [trend]);
  const trendTotals = useMemo(
    () => trend.reduce((acc, point) => ({ revenue: acc.revenue + point.revenue, profit: acc.profit + point.profit, pieces: acc.pieces + point.pieces }), { revenue: 0, profit: 0, pieces: 0 }),
    [trend],
  );
  const bestRevenue = Math.max(0, ...trend.map((point) => point.revenue));

  return (
    <div className={TAB_ANIMATION}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Panel
          title="Αποτελέσματα περιόδου"
          subtitle={`Από αποστολές · ${periodLabel} · χωρίς ΦΠΑ`}
          icon={Scale}
          tone="emerald"
          isLoading={isLoading}
          skeletonRows={8}
          className="lg:col-span-7"
          hint="Κατάσταση αποτελεσμάτων από τα πραγματικά τεμάχια που στάλθηκαν. Το κόστος είναι εκτίμηση από τις συνταγές και τις τρέχουσες τιμές."
        >
          {!totals || totals.realizedNet === 0 ? (
            <EmptyNote message={`Δεν υπάρχουν αποστολές για ${periodLabel.toLowerCase()}.`} />
          ) : (
            <>
              <ul className="space-y-1">
                {profitLoss.map((line) => {
                  const isTotal = line.kind === 'subtotal' || line.kind === 'result';
                  const share = Math.min(100, (Math.abs(line.value) / plBase) * 100);
                  const barClass =
                    line.kind === 'result' ? 'bg-emerald-500' : line.kind === 'minus' ? 'bg-rose-300' : line.kind === 'subtotal' ? 'bg-teal-600' : 'bg-slate-300';
                  return (
                    <li
                      key={line.id}
                      className={`grid grid-cols-[minmax(0,1fr)_7rem_6.5rem] items-center gap-3 rounded-xl px-3 py-2 ${
                        line.kind === 'result' ? 'bg-emerald-50' : line.kind === 'subtotal' ? 'bg-slate-50' : ''
                      }`}
                    >
                      <span className={`truncate text-xs ${isTotal ? 'font-black text-slate-900' : 'font-semibold text-slate-600'}`}>
                        {line.kind === 'minus' ? <span className="mr-1 text-slate-300">−</span> : null}
                        {line.label}
                      </span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <span className={`block h-full rounded-full ${barClass}`} style={{ width: `${share}%` }} />
                      </span>
                      <Money
                        value={line.value}
                        className={`text-right text-xs ${line.kind === 'result' ? 'font-black text-emerald-700' : isTotal ? 'font-black text-slate-900' : 'font-bold text-slate-600'}`}
                      />
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MiniStat label="Περιθώριο" value={`${formatDecimal(totals.margin, 1)}%`} tone="emerald" />
                <MiniStat label="Κόστος / έσοδα" value={`${formatDecimal(totals.realizedNet > 0 ? (totals.estimatedCost / totals.realizedNet) * 100 : 0, 1)}%`} />
                <MiniStat label="ΦΠΑ περιόδου" value={<Money value={totals.vat} />} />
                <MiniStat label="Μικτή αξία" value={<Money value={totals.realizedGross} />} sub="με ΦΠΑ" />
              </div>
              {finance && finance.costWarnings.length > 0 ? (
                <button
                  type="button"
                  onClick={() => onNavigate('registry')}
                  className="mt-3 flex w-full items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
                >
                  <AlertTriangle size={13} className="shrink-0" />
                  {formatNumber(finance.costWarnings.length)} γραμμές χωρίς πλήρες κόστος — το κέρδος μπορεί να υπερεκτιμάται.
                </button>
              ) : null}
            </>
          )}
        </Panel>

        <div className="flex flex-col gap-4 lg:col-span-5">
          <Panel
            title="Ανοιχτές παραγγελίες"
            subtitle="Αξία που δεν έχει σταλεί ακόμη"
            icon={Hourglass}
            tone="sky"
            isLoading={isLoading}
            hint={DASHBOARD_TERM_HINTS.backlogDepth}
            action={{ label: 'Παραγγελίες', onClick: () => onNavigate('orders') }}
          >
            <div className="text-2xl font-black text-slate-900"><Money value={totals?.backlogNet ?? 0} /></div>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {formatNumber(activeOrderCount)} παραγγελίες · {formatNumber(totals?.backlogPieces ?? 0)} τεμάχια
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <MiniStat label="ΦΠΑ" value={<Money value={totals?.backlogVat ?? 0} />} />
              <MiniStat label="Με ΦΠΑ" value={<Money value={totals?.backlogGross ?? 0} />} />
            </div>
          </Panel>

          <Panel
            title="Συμφωνία με παραστατικά"
            subtitle="Έσοδα περιόδου έναντι εκδοθέντων"
            icon={FileCheck2}
            tone={legalAligned ? 'emerald' : 'amber'}
            isLoading={isLoading}
            hint={DASHBOARD_TERM_HINTS.documents}
            action={{ label: 'Παραστατικά', onClick: () => onNavigate('legal') }}
          >
            {!legal || legal.issuedCount === 0 ? (
              <EmptyNote message="Δεν έχουν εκδοθεί παραστατικά στην περίοδο." />
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Διαφορά</p>
                    <Money value={legal.netGap} className={`text-xl font-black ${legalAligned ? 'text-emerald-600' : 'text-amber-600'}`} />
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${legalAligned ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {legalAligned ? 'Σε συμφωνία' : 'Χρειάζεται έλεγχο'}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <MiniStat label="Παραστατικά" value={formatNumber(legal.issuedCount)} />
                  <MiniStat label="Καθαρή αξία" value={<Money value={legal.issuedNet} />} />
                </div>
              </>
            )}
          </Panel>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Panel
          title="Μηνιαία απόδοση"
          subtitle="Τελευταίοι 12 μήνες, πιο πρόσφατος πρώτος"
          icon={CalendarRange}
          tone="indigo"
          isLoading={isLoading}
          skeletonRows={8}
          className="lg:col-span-7"
          action={{ label: 'Αναλυτικά', onClick: () => onNavigate('analytics') }}
        >
          <div className="max-h-[26rem] overflow-auto">
            <table className="w-full min-w-[28rem] text-left text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-2 font-bold">Μήνας</th>
                  <th className="py-2 pr-2 text-right font-bold">Έσοδα</th>
                  <th className="py-2 pr-2 text-right font-bold">Κέρδος</th>
                  <th className="py-2 pr-2 text-right font-bold">Περιθ.</th>
                  <th className="py-2 text-right font-bold">Τεμ.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {reversedTrend.map((point, index) => {
                  const previous = reversedTrend[index + 1];
                  const change = previous && previous.revenue > 0 ? ((point.revenue - previous.revenue) / previous.revenue) * 100 : null;
                  return (
                    <tr key={point.key} className={point.revenue === bestRevenue && bestRevenue > 0 ? 'bg-emerald-50/50' : ''}>
                      <td className="py-2 pr-2 font-bold text-slate-700">
                        {point.label}
                        {point.revenue === bestRevenue && bestRevenue > 0 ? <span className="ml-1.5 text-[9px] font-black uppercase text-emerald-600">κορυφή</span> : null}
                      </td>
                      <td className="py-2 pr-2 text-right">
                        <span className="inline-flex items-center gap-1.5">
                          {index < reversedTrend.length - 1 && point.revenue > 0 ? <DeltaBadge delta={change} /> : null}
                          <Money value={point.revenue} decimals={false} className="font-black text-slate-800" />
                        </span>
                      </td>
                      <td className="py-2 pr-2 text-right"><Money value={point.profit} decimals={false} className="font-semibold text-slate-600" /></td>
                      <td className="py-2 pr-2 text-right font-bold tabular-nums text-slate-500">{point.revenue > 0 ? `${formatDecimal(point.margin, 0)}%` : '—'}</td>
                      <td className="py-2 text-right font-bold tabular-nums text-slate-600">{formatNumber(point.pieces)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-100 text-slate-900">
                  <td className="py-2 pr-2 font-black">Σύνολο</td>
                  <td className="py-2 pr-2 text-right"><Money value={trendTotals.revenue} decimals={false} className="font-black" /></td>
                  <td className="py-2 pr-2 text-right"><Money value={trendTotals.profit} decimals={false} className="font-black" /></td>
                  <td className="py-2 pr-2 text-right font-black tabular-nums">
                    {trendTotals.revenue > 0 ? `${formatDecimal((trendTotals.profit / trendTotals.revenue) * 100, 0)}%` : '—'}
                  </td>
                  <td className="py-2 text-right font-black tabular-nums">{formatNumber(trendTotals.pieces)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Panel>

        <div className="flex flex-col gap-4 lg:col-span-5">
          <Panel title="Υλικά πωλήσεων" subtitle={periodLabel} icon={Gem} tone="violet" isLoading={isLoading} hint={DASHBOARD_TERM_HINTS.materials}>
            <div className="grid grid-cols-2 gap-3">
              <MiniStat
                label="Ασήμι πωληθέν"
                value={`${formatDecimal(totals?.silverWeightKg ?? 0, 3)} kg`}
                sub={<span>≈ <Money value={(totals?.silverWeightGrams ?? 0) * silverPrice} decimals={false} /></span>}
                tone="slate"
              />
              <MiniStat label="Πέτρες & υλικά" value={`${formatNumber(stonesSold)} τεμ.`} sub="σε πωληθέντα είδη" tone="violet" />
            </div>
            {finance ? (
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                {[
                  { label: 'Ασήμι', value: finance.costBreakdown.silver },
                  { label: 'Εργατικά', value: finance.costBreakdown.labor },
                  { label: 'Υλικά', value: finance.costBreakdown.materials },
                ].map((item) => {
                  const sum = finance.costBreakdown.silver + finance.costBreakdown.labor + finance.costBreakdown.materials;
                  return (
                    <div key={item.label} className="rounded-xl border border-slate-100 px-2 py-2">
                      <p className="text-[10px] font-bold uppercase text-slate-400">{item.label}</p>
                      <p className="text-sm font-black tabular-nums text-slate-800">{sum > 0 ? formatDecimal((item.value / sum) * 100, 0) : 0}%</p>
                      <p className="text-[10px] font-medium text-slate-400">του κόστους</p>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </Panel>

          <Panel
            title="Ασήμι για παραγωγή"
            subtitle="Μόνο in-house είδη, χωρίς εισαγόμενα και εξαρτήματα"
            icon={Coins}
            tone="slate"
            isLoading={isLoading}
          >
            <Segmented value={silverScope} onChange={onSilverScopeChange} options={SILVER_SCOPE_OPTIONS} ariaLabel="Εύρος παραγγελιών για ασήμι" />
            <div className="mt-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-2xl font-black tabular-nums text-slate-900">
                  {formatDecimal(silverForProduction[silverScope] / 1000, 3)} <span className="text-sm font-bold text-slate-400">kg</span>
                </p>
                <p className="text-[11px] font-semibold text-slate-400">{formatDecimal(silverForProduction[silverScope], 1)} g</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase text-slate-400">Αξία σε τρέχουσα τιμή</p>
                <Money value={silverForProduction[silverScope] * silverPrice} className="text-sm font-black text-slate-700" />
              </div>
            </div>
          </Panel>

          <button
            type="button"
            onClick={() => onNavigate('analytics')}
            className="group flex items-center justify-between gap-4 rounded-3xl bg-gradient-to-br from-[#1c2812] via-[#0b1204] to-[#060b00] p-5 text-left text-white shadow-md transition-transform hover:-translate-y-0.5"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10"><BarChart3 size={18} /></span>
              <div>
                <p className="text-sm font-bold">Προηγμένη ανάλυση</p>
                <p className="text-xs text-white/60">Τάσεις, κερδοφορία ανά κατηγορία, εξαγωγές.</p>
              </div>
            </div>
            <ArrowUpRight size={18} className="text-white/60 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
});

// ═══ Παραγωγή & Αποθήκη ═══════════════════════════════════════════════════════

interface OperationsTabProps {
  batchesLoading: boolean;
  inventoryLoading: boolean;
  stageLoad: StageLoadRow[];
  healthScore: number;
  readyBatches: number;
  inProduction: { pieces: number; batches: number };
  stuckBatches: { total: number; rows: StuckBatchRow[] };
  stageLabel: (stage: string) => string;
  valuation: InventoryValuation;
  lowStock: { totalLowStock: number; rows: InventoryRiskRow[] };
  demandPressure: { totalPressure: number; rows: DemandPressureRow[] };
  productBySku: Map<string, Product>;
  onNavigate: Navigate;
}

export const OperationsTab = memo(function OperationsTab({
  batchesLoading,
  inventoryLoading,
  stageLoad,
  healthScore,
  readyBatches,
  inProduction,
  stuckBatches,
  stageLabel,
  valuation,
  lowStock,
  demandPressure,
  productBySku,
  onNavigate,
}: OperationsTabProps) {
  const delayed = stageLoad.reduce((sum, row) => sum + row.delayed, 0);
  const onHold = stageLoad.reduce((sum, row) => sum + row.onHold, 0);

  return (
    <div className={TAB_ANIMATION}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Σε παραγωγή"
          icon={Factory}
          tone="amber"
          isLoading={batchesLoading}
          value={formatNumber(inProduction.pieces)}
          sub={<span>{formatNumber(inProduction.batches)} ενεργές παρτίδες · {formatNumber(readyBatches)} έτοιμες</span>}
          hint={DASHBOARD_TERM_HINTS.inProduction}
          onClick={() => onNavigate('production')}
        />
        <KpiTile
          label="Υγεία ροής"
          icon={Layers}
          tone={healthScore >= 80 ? 'emerald' : healthScore >= 50 ? 'amber' : 'rose'}
          isLoading={batchesLoading}
          value={`${formatNumber(healthScore)}%`}
          sub={<span>{formatNumber(delayed)} καθυστερ. · {formatNumber(onHold)} σε αναμονή</span>}
          hint={DASHBOARD_TERM_HINTS.productionPulse}
          onClick={() => onNavigate('production')}
        />
        <KpiTile
          label="Απόθεμα"
          icon={Warehouse}
          tone="slate"
          isLoading={inventoryLoading}
          value={formatNumber(valuation.pieces)}
          sub={<span>{formatNumber(valuation.skuCount)} κωδικοί · {formatNumber(valuation.reserved)} δεσμευμένα</span>}
          onClick={() => onNavigate('inventory')}
        />
        <KpiTile
          label="Αξία αποθέματος"
          icon={Scale}
          tone="violet"
          isLoading={inventoryLoading}
          value={<Money value={valuation.costValue} />}
          sub={<span>σε κόστος · χονδρική <Money value={valuation.wholesaleValue} decimals={false} /></span>}
          hint="Αξία κόστους των τεμαχίων στην αποθήκη. Η χονδρική αξία βασίζεται στις τρέχουσες τιμές πώλησης."
          onClick={() => onNavigate('inventory')}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <StageLoadPanel rows={stageLoad} healthScore={healthScore} isLoading={batchesLoading} onNavigate={onNavigate} className="lg:col-span-7" />
        <StuckBatchesPanel
          total={stuckBatches.total}
          rows={stuckBatches.rows}
          stageLabel={stageLabel}
          isLoading={batchesLoading}
          onNavigate={onNavigate}
          className="lg:col-span-5"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel
          title="Χαμηλό απόθεμα"
          subtitle={lowStock.totalLowStock > 0 ? `${formatNumber(lowStock.totalLowStock)} είδη στο ή κάτω από το σημείο αναπαραγγελίας` : 'Σημείο αναπαραγγελίας'}
          icon={AlertTriangle}
          tone="rose"
          isLoading={inventoryLoading}
          hint={DASHBOARD_TERM_HINTS.inventoryRisk}
          action={{ label: 'Αποθήκη', onClick: () => onNavigate('inventory') }}
        >
          {lowStock.rows.length === 0 ? (
            <EmptyNote message="Κανένα είδος κάτω από το σημείο αναπαραγγελίας." icon={PackageCheck} />
          ) : (
            <StockTable
              rows={lowStock.rows.map((row) => ({
                key: `${row.label}`,
                label: row.label,
                category: productBySku.get(row.sku)?.category,
                primary: row.stock,
                status: row.stock <= 0 ? 'Εξαντλήθηκε' : 'Αναπαραγγελία',
                critical: row.stock <= 0,
              }))}
              primaryLabel="Διαθ."
              more={lowStock.totalLowStock - lowStock.rows.length}
            />
          )}
        </Panel>
        <Panel
          title="Ζήτηση πάνω από διαθέσιμο"
          subtitle={demandPressure.totalPressure > 0 ? `${formatNumber(demandPressure.totalPressure)} είδη θα καλυφθούν από παραγωγή` : 'Ανοιχτές παραγγελίες έναντι αποθέματος'}
          icon={Boxes}
          tone="amber"
          isLoading={inventoryLoading}
          hint={DASHBOARD_TERM_HINTS.demandPressure}
          action={{ label: 'Αποθήκη', onClick: () => onNavigate('inventory') }}
        >
          {demandPressure.rows.length === 0 ? (
            <EmptyNote message="Η ζήτηση καλύπτεται από το διαθέσιμο απόθεμα." icon={PackageCheck} />
          ) : (
            <StockTable
              rows={demandPressure.rows.map((row) => ({
                key: row.label,
                label: row.label,
                category: productBySku.get(row.sku)?.category,
                primary: row.gap,
                status: `${formatNumber(row.demand)} ζήτ. / ${formatNumber(row.stock)} διαθ.`,
                critical: false,
              }))}
              primaryLabel="Έλλειμμα"
              more={demandPressure.totalPressure - demandPressure.rows.length}
            />
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Panel
          title="Απόθεμα υψηλής αξίας"
          subtitle="Κωδικοί με τη μεγαλύτερη δεσμευμένη αξία κόστους"
          icon={Crown}
          tone="violet"
          isLoading={inventoryLoading}
          className="lg:col-span-7"
        >
          {valuation.topValue.length === 0 ? (
            <EmptyNote message="Δεν βρέθηκε απόθεμα." icon={Package} />
          ) : (
            <BarList
              tone="violet"
              showShare={false}
              formatValue={(value) => `${formatNumber(value)} τεμ.`}
              rows={valuation.topValue.map((row) => ({
                key: row.sku,
                label: <span>{row.sku} <span className="font-medium text-slate-400">· {row.category}</span></span>,
                value: row.qty,
                secondary: <Money value={row.value} decimals={false} />,
              }))}
            />
          )}
        </Panel>
        <Panel title="Σύνθεση αποθέματος" subtitle="Αξία και δυνητικό περιθώριο" icon={Scale} tone="slate" isLoading={inventoryLoading} className="lg:col-span-5">
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Αξία κόστους" value={<Money value={valuation.costValue} decimals={false} />} />
            <MiniStat label="Αξία χονδρικής" value={<Money value={valuation.wholesaleValue} decimals={false} />} />
            <MiniStat label="Δυνητικό περιθώριο" value={<Money value={valuation.potentialMargin} decimals={false} />} sub={`${formatDecimal(valuation.marginPercent, 1)}%`} tone="emerald" />
            <MiniStat label="Ασήμι σε απόθεμα" value={`${formatDecimal(valuation.silverGrams / 1000, 2)} kg`} sub={`${formatNumber(valuation.incoming)} τεμ. αναμένονται`} />
          </div>
        </Panel>
      </div>
    </div>
  );
});

function StockTable({
  rows,
  primaryLabel,
  more,
}: {
  rows: Array<{ key: string; label: string; category?: string; primary: number; status: string; critical: boolean }>;
  primaryLabel: string;
  more: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[26rem] text-left text-xs">
        <thead>
          <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            <th className="py-2 pr-2 font-bold">Είδος</th>
            <th className="py-2 pr-2 text-right font-bold">{primaryLabel}</th>
            <th className="py-2 text-right font-bold">Κατάσταση</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="py-2 pr-2">
                <span className="block truncate font-bold text-slate-800">{row.label}</span>
                {row.category ? <span className="text-[10px] font-medium text-slate-400">{row.category}</span> : null}
              </td>
              <td className={`py-2 pr-2 text-right font-black tabular-nums ${row.critical ? 'text-rose-600' : 'text-slate-800'}`}>{formatNumber(row.primary)}</td>
              <td className="py-2 text-right">
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-black ${row.critical ? 'bg-rose-100 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{row.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {more > 0 ? <p className="mt-2 text-center text-[11px] font-bold text-slate-400">+{formatNumber(more)} ακόμη στην Αποθήκη</p> : null}
    </div>
  );
}
