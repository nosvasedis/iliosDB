import React from 'react';
import { Search, X } from 'lucide-react';
import CustomerSearchSelect, { type CustomerSearchOption } from '../CustomerSearchSelect';
import { TAIL_TAB_CONTAINER, tailTabButtonCompact } from '../../ui/designTokens';

export interface ToolbarView<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

export default function ServiceToolbar<T extends string>({
  search,
  onSearch,
  searchPlaceholder,
  customers,
  customerId,
  onCustomer,
  views,
  view,
  onView,
  extra,
}: {
  search: string;
  onSearch: (value: string) => void;
  searchPlaceholder: string;
  customers: CustomerSearchOption[];
  customerId: string;
  onCustomer: (value: string) => void;
  views: Array<ToolbarView<T>>;
  view: T;
  onView: (value: T) => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
      <label className="relative min-w-0 flex-1">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm font-bold text-slate-800 shadow-sm outline-none placeholder:font-medium placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={searchPlaceholder}
        />
        {search && (
          <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-100" onClick={() => onSearch('')} aria-label="Καθαρισμός αναζήτησης"><X size={14} /></button>
        )}
      </label>
      <div className="flex min-w-0 items-center gap-1 lg:w-64">
        <div className="min-w-0 flex-1">
          <CustomerSearchSelect customers={customers} value={customerId} onChange={onCustomer} placeholder="Όλοι οι πελάτες" />
        </div>
        {customerId && <button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" onClick={() => onCustomer('')} aria-label="Όλοι οι πελάτες"><X size={14} /></button>}
      </div>
      <div className="flex items-center gap-2">
        {extra}
        <div className={TAIL_TAB_CONTAINER}>
          {views.map((entry) => (
            <button key={entry.value} type="button" className={tailTabButtonCompact(view === entry.value)} onClick={() => onView(entry.value)}>
              {entry.icon} {entry.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
