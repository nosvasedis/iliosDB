import React, { memo } from 'react';
import {
  PieChart as RePieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts';
import { ArrowUpRight, Trophy } from 'lucide-react';
import { formatCurrency } from '../../utils/pricingEngine';
import SkuColorizedText from '../SkuColorizedText';
import type { DashboardPieSlice, DashboardVariantRow } from '../../features/dashboard/dashboardAnalysisViewModels';
import { FinanceCustomerRanking } from '../../utils/financeAnalytics';

const PIE_SIZE = 120;

export const MosaicSpinner = memo(function MosaicSpinner({
  dark = false,
  light = false,
}: {
  dark?: boolean;
  light?: boolean;
}) {
  const ringClass = light
    ? 'border-white/25 border-t-white/80'
    : dark
      ? 'border-emerald-400/25 border-t-emerald-300/80'
      : 'border-slate-200 border-t-slate-400';

  return (
    <div
      className={`h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-t-transparent ${ringClass}`}
      role="status"
      aria-label="Φόρτωση"
    />
  );
});

export const MiniPiePanel = memo(function MiniPiePanel({
  data,
  colors,
  legendExtra,
}: {
  data: DashboardPieSlice[];
  colors: string[];
  compact?: boolean;
  legendExtra?: (item: DashboardPieSlice, idx: number) => React.ReactNode;
}) {
  return (
    <div className="grid h-full w-full grid-cols-1 items-center gap-3 lg:grid-cols-5">
      <div className="flex h-[7.5rem] w-full items-center justify-center lg:col-span-2">
        <RePieChart width={PIE_SIZE} height={PIE_SIZE}>
          <Pie
            data={data}
            cx={PIE_SIZE / 2}
            cy={PIE_SIZE / 2}
            innerRadius={24}
            outerRadius={52}
            dataKey="value"
            stroke="white"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip
            isAnimationActive={false}
            contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 12 }}
          />
        </RePieChart>
      </div>
      <div className="flex h-[7.5rem] w-full flex-col justify-center space-y-1 overflow-hidden lg:col-span-3">
        {data.map((item, idx) => (
          <div key={item.name} className="flex items-center justify-between gap-2 text-xs">
            <div className="flex min-w-0 items-center gap-1.5">
              <div
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: colors[idx % colors.length] }}
              />
              <span className="truncate font-bold text-slate-600">{item.name}</span>
            </div>
            <div className="shrink-0 text-right">
              <span className="font-black text-slate-400">{item.value}</span>
              {legendExtra?.(item, idx)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

export const MiniVariantList = memo(function MiniVariantList({
  items,
  onOpenFull,
}: {
  items: DashboardVariantRow[];
  onOpenFull?: () => void;
}) {
  return (
    <div className="flex h-full flex-col justify-between gap-2">
      <div className="flex min-h-[9.5rem] flex-col justify-center space-y-1.5 overflow-hidden pr-0.5">
        {items.map((item, index) => (
          <div
            key={`${item.sku}::${item.variantSuffix}`}
            className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-2.5 py-2"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-[10px] font-black text-slate-400">#{index + 1}</span>
              <SkuColorizedText
                sku={item.sku}
                suffix={item.variantSuffix}
                gender={item.gender}
                className="text-xs"
              />
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs font-black text-slate-800">{item.quantity} τεμ.</p>
              <p className="text-[10px] font-semibold text-slate-400">{formatCurrency(item.revenue)}</p>
            </div>
          </div>
        ))}
      </div>
      {onOpenFull && (
        <button
          type="button"
          onClick={onOpenFull}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800 hover:border-emerald-300"
        >
          <Trophy size={14} />
          Πλήρης ανάλυση
          <ArrowUpRight size={14} className="opacity-60" />
        </button>
      )}
    </div>
  );
});

export const MiniCustomerList = memo(function MiniCustomerList({ items }: { items: FinanceCustomerRanking[] }) {
  return (
    <div className="flex min-h-[9.5rem] flex-col justify-center space-y-1.5 overflow-hidden pr-0.5">
      {items.map((item, index) => (
        <div
          key={item.id}
          className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-2.5 py-2"
        >
          <div className="min-w-0">
            <p className="truncate text-xs font-black text-slate-900">
              #{index + 1} {item.name}
            </p>
            <p className="text-[10px] font-semibold text-slate-500">{item.orders} παραγγ.</p>
          </div>
          <p className="shrink-0 text-xs font-black text-slate-900">{formatCurrency(item.revenue)}</p>
        </div>
      ))}
    </div>
  );
});

export function MosaicEmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[inherit] flex-1 items-center justify-center py-2 text-center text-xs italic text-slate-400">
      {message}
    </div>
  );
}
