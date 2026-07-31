import React from 'react';
import { Search } from 'lucide-react';
import { DeliveryFilterKey } from '../../utils/deliveryFilters';

export type { DeliveryFilterKey };

interface Props {
  filter: DeliveryFilterKey;
  search: string;
  onFilterChange: (filter: DeliveryFilterKey) => void;
  onSearchChange: (search: string) => void;
  compact?: boolean;
}

const FILTERS: Array<{ key: DeliveryFilterKey; label: string }> = [
  { key: 'all', label: 'Όλα' },
  { key: 'today', label: 'Σήμερα' },
  { key: 'overdue', label: 'Εκπρόθεσμα' },
  { key: 'attention', label: 'Προσοχή' },
  { key: 'completed', label: 'Ολοκληρωμένα' },
];

export default function DeliveryFilters({ filter, search, onFilterChange, onSearchChange, compact = false }: Props) {
  return (
    <div className={compact ? 'space-y-3' : 'space-y-3'}>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Αναζήτηση πελάτη ή παραγγελίας..."
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-emerald-500/10 text-sm font-medium"
        />
      </div>
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide rounded-xl bg-slate-100/80 p-1">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onFilterChange(item.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
              filter === item.key
                ? 'bg-white text-[#060b00] shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
