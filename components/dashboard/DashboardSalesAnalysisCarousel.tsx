import React, { useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  PieChart,
  Boxes,
  Trophy,
  Users,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { Gender } from '../../types';
import { FinanceCollectionRanking, FinanceCustomerRanking } from '../../utils/financeAnalytics';
import { formatCurrency } from '../../utils/pricingEngine';
import type { DashboardPieSlice, DashboardVariantRow } from '../../features/dashboard/dashboardAnalysisViewModels';
import {
  MiniCustomerList,
  MiniPiePanel,
  MiniVariantList,
  MosaicEmptyState,
} from './dashboardMiniCharts';

const PANEL_COUNT = 6;

const PANELS = [
  { id: 'category', title: 'Πωλήσεις ανά Κατηγορία', icon: PieChart, type: 'pie' as const },
  { id: 'collection', title: 'Πωλήσεις ανά Συλλογή', icon: Boxes, type: 'pie' as const },
  { id: 'variants', title: 'Κορυφαία SKU', icon: Trophy, type: 'variants' as const },
  { id: 'gender', title: 'Πωλήσεις ανά Φύλο', icon: Users, type: 'pie' as const },
  { id: 'finish', title: 'Πωλήσεις ανά Φινίρισμα', icon: Sparkles, type: 'pie' as const },
  { id: 'customers', title: 'Κορυφαίοι Πελάτες', icon: UserCheck, type: 'customers' as const },
];

interface Props {
  activeIndex: number;
  onPrev: () => void;
  onNext: () => void;
  categoryData: DashboardPieSlice[];
  collectionData: DashboardPieSlice[];
  collectionRankings: FinanceCollectionRanking[];
  genderData: DashboardPieSlice[];
  finishData: DashboardPieSlice[];
  topVariants: DashboardVariantRow[];
  topCustomers: FinanceCustomerRanking[];
  categoryGenderFilter: 'All' | Gender;
  onCategoryGenderFilterChange: (value: 'All' | Gender) => void;
  periodLabel: string;
  colors: string[];
  onOpenTopVariants?: () => void;
}

export default function DashboardSalesAnalysisCarousel({
  activeIndex,
  onPrev,
  onNext,
  categoryData,
  collectionData,
  collectionRankings,
  genderData,
  finishData,
  topVariants,
  topCustomers,
  categoryGenderFilter,
  onCategoryGenderFilterChange,
  periodLabel,
  colors,
  onOpenTopVariants,
}: Props) {
  const panel = PANELS[activeIndex];
  const Icon = panel.icon;

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onPrev();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        onNext();
      }
    },
    [onPrev, onNext],
  );

  const collectionRevenueByName = new Map(collectionRankings.map((c) => [c.name, c.revenue]));

  const pieDataByPanel: Record<string, DashboardPieSlice[]> = {
    category: categoryData,
    collection: collectionData,
    gender: genderData,
    finish: finishData,
  };

  const currentPieData = pieDataByPanel[panel.id] ?? [];

  const emptyMessage = (
    <MosaicEmptyState message={`Δεν βρέθηκαν πωλήσεις για ${periodLabel.toLowerCase()}.`} />
  );

  const renderContent = () => {
    if (panel.type === 'pie') {
      const data = currentPieData;
      if (data.length === 0) return emptyMessage;

      return (
        <MiniPiePanel
          data={data}
          colors={colors}
          legendExtra={
            panel.id === 'collection'
              ? (item) => (
                  <p className="text-[10px] font-semibold text-slate-400">
                    {formatCurrency(collectionRevenueByName.get(item.name) ?? 0)}
                  </p>
                )
              : undefined
          }
        />
      );
    }

    if (panel.type === 'variants') {
      if (topVariants.length === 0) return emptyMessage;
      return <MiniVariantList items={topVariants} onOpenFull={onOpenTopVariants} />;
    }

    if (topCustomers.length === 0) return emptyMessage;
    return <MiniCustomerList items={topCustomers} />;
  };

  return (
    <div
      className="rounded-3xl border border-slate-200/80 bg-white p-8 shadow-sm"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      role="region"
      aria-label="Ανάλυση πωλήσεων περιόδου"
      aria-live="polite"
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-xl font-bold text-slate-800">
          <Icon size={20} className="text-blue-500" />
          {panel.title}
        </h3>
        <div className="flex items-center gap-2">
          {panel.id === 'category' && (
            <div className="relative">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
              <select
                value={categoryGenderFilter}
                onChange={(e) => onCategoryGenderFilterChange(e.target.value as 'All' | Gender)}
                className="cursor-pointer appearance-none rounded-lg border border-slate-200 bg-slate-50 py-2 pl-7 pr-3 text-xs font-bold text-slate-600 outline-none transition-all hover:border-blue-300"
              >
                <option value="All">Όλα τα Φύλα</option>
                <option value={Gender.Women}>Γυναικεία</option>
                <option value={Gender.Men}>Ανδρικά</option>
                <option value={Gender.Unisex}>Unisex</option>
              </select>
            </div>
          )}
          <button
            type="button"
            onClick={onPrev}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            aria-label="Προηγούμενο"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            onClick={onNext}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            aria-label="Επόμενο"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {renderContent()}

      <div className="mt-6 flex justify-center overflow-x-auto pb-1">
        <div className="flex items-center gap-1.5">
          {PANELS.map((p, i) => (
            <div
              key={p.id}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === activeIndex ? 'w-4 bg-blue-500' : 'w-1.5 bg-slate-200'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export { PANEL_COUNT };
