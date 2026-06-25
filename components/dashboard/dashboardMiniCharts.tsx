import React from 'react';
import {
  PieChart as RePieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { ArrowUpRight, Trophy } from 'lucide-react';
import SkuColorizedText from '../SkuColorizedText';
import type { DashboardPieSlice, DashboardVariantRow } from '../../features/dashboard/dashboardAnalysisViewModels';
import { FinanceCustomerRanking } from '../../utils/financeAnalytics';

export function MiniPiePanel({
  data,
  colors,
  legendExtra,
}: {
  data: DashboardPieSlice[];
  colors: string[];
  compact?: boolean;
  legendExtra?: (item: DashboardPieSlice, idx: number) => React.ReactNode;
}) {
  const outerRadius = 52;

  return (
    <div className="grid h-full grid-cols-1 items-center gap-2 lg:grid-cols-5">
      <div className="h-[7.5rem] lg:col-span-2">
        <ResponsiveContainer width="100%" height="100%">
          <RePieChart>
            <Pie
              data={data}
              innerRadius={24}
              outerRadius={outerRadius}
              dataKey="value"
              stroke="white"
              strokeWidth={2}
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 12 }}
            />
          </RePieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex h-[7.5rem] flex-col justify-center space-y-1 overflow-y-auto pr-0.5 lg:col-span-3">
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
}

export function MiniVariantList({
  items,
  onOpenFull,
}: {
  items: DashboardVariantRow[];
  onOpenFull?: () => void;
}) {
  return (
    <div className="flex h-full flex-col justify-between gap-2">
      <div className="flex min-h-[9.5rem] flex-col justify-center space-y-1.5 overflow-y-auto pr-0.5">
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
          className="group flex w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800 transition-all hover:border-emerald-300 hover:shadow-sm"
        >
          <Trophy size={14} />
          Πλήρης ανάλυση
          <ArrowUpRight size={14} className="opacity-60" />
        </button>
      )}
    </div>
  );
}

export function MiniCustomerList({ items }: { items: FinanceCustomerRanking[] }) {
  return (
    <div className="flex min-h-[9.5rem] flex-col justify-center space-y-1.5 overflow-y-auto pr-0.5">
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
}

export function MosaicEmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[inherit] flex-1 items-center justify-center py-2 text-center text-xs italic text-slate-400">
      {message}
    </div>
  );
}
