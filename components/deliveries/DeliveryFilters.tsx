import React from 'react';
import { Search } from 'lucide-react';

export type DeliveryFilterKey = 'all' | 'overdue' | 'today' | 'week' | 'month' | 'holiday' | 'call_needed' | 'completed';

interface Props {
  filter: DeliveryFilterKey;
  search: string;
  onFilterChange: (filter: DeliveryFilterKey) => void;
  onSearchChange: (search: string) => void;
}

const FILTERS: Array<{ key: DeliveryFilterKey; label: string }> = [
  { key: 'all', label: 'Όλα' },
  { key: 'overdue', label: 'Εκπρόθεσμα' },
  { key: 'today', label: 'Σήμερα' },
  { key: 'week', label: '7 ημέρες' },
  { key: 'month', label: 'Μήνας' },
  { key: 'holiday', label: 'Γιορτές' },
  { key: 'call_needed', label: 'Κλήση' },
  { key: 'completed', label: 'Ολοκληρωμένα' }
];

export default function DeliveryFilters({ filter, search, onFilterChange, onSearchChange }: Props) {
  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 space-y-4">
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Αναζήτηση πελάτη, παραγγελίας ή λόγου..."
          className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-amber-400/30 text-sm font-medium"
        />
      </div>
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            onClick={() => onFilterChange(item.key)}
            className={`px-4 py-2 rounded-2xl text-xs font-black whitespace-nowrap border transition-all ${
              filter === item.key
                ? 'bg-[#060b00] text-white border-[#060b00] shadow-sm'
                : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
