import React, { useState } from 'react';
import { ChevronDown, ChevronUp, SlidersHorizontal, X, Calendar, Tag, User, Activity } from 'lucide-react';
import { OrderStatus } from '../../types';
import { getDeterministicTagColor } from '../../features/orders/tagColors';
import { getOrderStatusClasses, getOrderStatusIcon, getOrderStatusLabel } from '../../features/orders/statusPresentation';

export interface OrderFilters {
  statuses: Set<OrderStatus>;
  datePreset: 'all' | 'today' | 'week' | 'month' | 'custom';
  dateFrom: string | null;
  dateTo: string | null;
  sellers: Set<string>;
  tags: Set<string>;
  tagLogic: 'AND' | 'OR';
}

export const DEFAULT_FILTERS: OrderFilters = {
  statuses: new Set(),
  datePreset: 'all',
  dateFrom: null,
  dateTo: null,
  sellers: new Set(),
  tags: new Set(),
  tagLogic: 'AND',
};

export function countActiveFilters(f: OrderFilters): number {
  let count = 0;
  if (f.statuses.size > 0) count += f.statuses.size;
  if (f.datePreset !== 'all') count += 1;
  if (f.sellers.size > 0) count += f.sellers.size;
  if (f.tags.size > 0) count += f.tags.size;
  return count;
}

interface OrdersFilterPanelProps {
  allTags: string[];
  allSellers: string[];
  filters: OrderFilters;
  onChange: (f: OrderFilters) => void;
}

const ALL_STATUSES: OrderStatus[] = [
  OrderStatus.Pending,
  OrderStatus.InProduction,
  OrderStatus.Ready,
  OrderStatus.PartiallyDelivered,
  OrderStatus.Delivered,
  OrderStatus.Cancelled,
];

const DATE_PRESETS: Array<{ id: OrderFilters['datePreset']; label: string }> = [
  { id: 'all', label: 'Όλες' },
  { id: 'today', label: 'Σήμερα' },
  { id: 'week', label: 'Εβδομάδα' },
  { id: 'month', label: 'Μήνας' },
  { id: 'custom', label: 'Προσαρμ.' },
];

export function OrdersFilterPanel({ allTags, allSellers, filters, onChange }: OrdersFilterPanelProps) {
  const [open, setOpen] = useState(true);
  const activeCount = countActiveFilters(filters);

  const toggleStatus = (s: OrderStatus) => {
    const next = new Set(filters.statuses);
    if (next.has(s)) next.delete(s); else next.add(s);
    onChange({ ...filters, statuses: next });
  };

  const setDatePreset = (preset: OrderFilters['datePreset']) => {
    const isCustom = preset === 'custom';
    onChange({
      ...filters,
      datePreset: preset,
      dateFrom: isCustom ? (filters.dateFrom ?? '') : null,
      dateTo: isCustom ? (filters.dateTo ?? '') : null,
    });
  };

  const toggleSeller = (seller: string) => {
    const next = new Set(filters.sellers);
    if (next.has(seller)) next.delete(seller); else next.add(seller);
    onChange({ ...filters, sellers: next });
  };

  const toggleTag = (tag: string) => {
    const next = new Set(filters.tags);
    if (next.has(tag)) next.delete(tag); else next.add(tag);
    onChange({ ...filters, tags: next });
  };

  const setTagLogic = (logic: 'AND' | 'OR') => onChange({ ...filters, tagLogic: logic });

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden transition-all">
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50/70 transition-colors"
      >
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={14} className="text-slate-500" />
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Φίλτρα</span>
          {activeCount > 0 && (
            <span className="bg-emerald-500 text-white text-[9px] font-black min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center">
              {activeCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <span
              role="button"
              tabIndex={0}
              onClick={e => { e.stopPropagation(); onChange({ ...DEFAULT_FILTERS }); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onChange({ ...DEFAULT_FILTERS }); } }}
              className="text-[10px] font-bold text-slate-400 hover:text-rose-500 flex items-center gap-0.5 transition-colors"
            >
              <X size={10} /> Καθαρισμός
            </span>
          )}
          {open ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
        </div>
      </button>

      {/* Body */}
      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${open ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="px-4 pb-4 space-y-4 border-t border-slate-50 pt-3">

          {/* STATUS */}
          <FilterSection icon={<Activity size={12} />} label="Κατάσταση">
            <div className="flex flex-wrap gap-1.5">
              {ALL_STATUSES.map(s => {
                const active = filters.statuses.has(s);
                const colorClass = active
                  ? getOrderStatusClasses(s)
                  : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600';
                return (
                  <button
                    key={s}
                    onClick={() => toggleStatus(s)}
                    className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border font-bold transition-all ${colorClass} ${active ? 'shadow-sm ring-2 ring-offset-1 ring-current/25' : ''}`}
                  >
                    {getOrderStatusIcon(s, 10)}
                    {getOrderStatusLabel(s)}
                  </button>
                );
              })}
            </div>
          </FilterSection>

          {/* DATE */}
          <FilterSection icon={<Calendar size={12} />} label="Ημερομηνία">
            <div className="flex flex-wrap gap-1.5">
              {DATE_PRESETS.map(preset => {
                const active = filters.datePreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => setDatePreset(preset.id)}
                    className={`text-[11px] px-3 py-1 rounded-full border font-bold transition-all ${
                      active
                        ? 'bg-violet-500 text-white border-violet-600 shadow-sm ring-2 ring-offset-1 ring-violet-300'
                        : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            {filters.datePreset === 'custom' && (
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="date"
                  value={filters.dateFrom ?? ''}
                  onChange={e => onChange({ ...filters, dateFrom: e.target.value || null })}
                  className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-400 transition-all"
                />
                <span className="text-slate-400 text-xs font-bold">—</span>
                <input
                  type="date"
                  value={filters.dateTo ?? ''}
                  onChange={e => onChange({ ...filters, dateTo: e.target.value || null })}
                  className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-400 transition-all"
                />
              </div>
            )}
          </FilterSection>

          {/* SELLERS — only shown when sellers exist */}
          {allSellers.length > 0 && (
            <FilterSection icon={<User size={12} />} label="Πλάσιε">
              <div className="flex flex-wrap gap-1.5">
                {allSellers.map(seller => {
                  const active = filters.sellers.has(seller);
                  return (
                    <button
                      key={seller}
                      onClick={() => toggleSeller(seller)}
                      className={`text-[11px] px-2.5 py-1 rounded-full border font-bold transition-all ${
                        active
                          ? 'bg-sky-500 text-white border-sky-600 shadow-sm ring-2 ring-offset-1 ring-sky-300'
                          : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600'
                      }`}
                    >
                      {seller}
                    </button>
                  );
                })}
              </div>
            </FilterSection>
          )}

          {/* TAGS — only shown when tags exist */}
          {allTags.length > 0 && (
            <FilterSection icon={<Tag size={12} />} label="Ετικέτες">
              <div className="flex flex-wrap gap-1.5 items-center">
                {/* AND/OR toggle */}
                <div className="flex bg-slate-100 rounded-lg p-0.5 mr-1">
                  {(['AND', 'OR'] as const).map(logic => (
                    <button
                      key={logic}
                      onClick={() => setTagLogic(logic)}
                      className={`text-[10px] px-2 py-0.5 rounded-md font-black transition-all ${
                        filters.tagLogic === logic
                          ? 'bg-white text-slate-700 shadow-sm'
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      {logic}
                    </button>
                  ))}
                </div>
                {allTags.map(tag => {
                  const active = filters.tags.has(tag);
                  const c = getDeterministicTagColor(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={`text-[11px] px-2.5 py-1 rounded-full border font-bold transition-all ${
                        active
                          ? `${c.activeBg} ${c.activeText} ${c.activeBorder} shadow-sm ring-2 ring-offset-1 ${c.ring}`
                          : `${c.bg} ${c.text} ${c.border} hover:opacity-80`
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
                {filters.tags.size > 0 && (
                  <button
                    onClick={() => onChange({ ...filters, tags: new Set() })}
                    className="text-[10px] font-bold text-slate-400 hover:text-rose-500 flex items-center gap-0.5 ml-1 transition-colors"
                  >
                    <X size={10} /> Όλα
                  </button>
                )}
              </div>
              {filters.tags.size > 1 && (
                <p className="text-[10px] text-slate-400 mt-1.5 ml-0.5">
                  {filters.tagLogic === 'AND'
                    ? 'Εμφάνιση παραγγελιών που έχουν ΟΛΑ τα επιλεγμένα tags'
                    : 'Εμφάνιση παραγγελιών που έχουν ΤΟΥΛΑΧΙΣΤΟΝ ΕΝΑ από τα επιλεγμένα tags'}
                </p>
              )}
            </FilterSection>
          )}

        </div>
      </div>
    </div>
  );
}

function FilterSection({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}
