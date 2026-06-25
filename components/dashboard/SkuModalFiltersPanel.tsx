import React, { useMemo } from 'react';
import { Filter, RotateCcw, ChevronDown } from 'lucide-react';
import { Gender } from '../../types';
import {
  type SkuModalFilterFacets,
  type SkuModalFilterSelection,
  countActiveSkuModalFilters,
  createEmptySkuModalFilters,
} from '../../features/dashboard/skuModalFilters';

interface Props {
  facets: SkuModalFilterFacets;
  filters: SkuModalFilterSelection;
  onChange: (filters: SkuModalFilterSelection) => void;
  open: boolean;
  onToggle: () => void;
}

function FilterGroup({
  title,
  items,
  selected,
  onToggle,
  getKey,
  getLabel,
}: {
  title: string;
  items: Array<{ key: string; label: string }>;
  selected: Set<string>;
  onToggle: (key: string) => void;
  getKey: (item: { key: string; label: string }) => string;
  getLabel: (item: { key: string; label: string }) => string;
}) {
  if (items.length === 0) return null;

  return (
    <div>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">{title}</p>
      <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
        {items.map((item) => {
          const key = getKey(item);
          const active = selected.has(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onToggle(key)}
              className={`rounded-lg px-2 py-1 text-[11px] font-bold transition-all ${
                active
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {getLabel(item)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function SkuModalFiltersPanel({ facets, filters, onChange, open, onToggle }: Props) {
  const activeCount = countActiveSkuModalFilters(filters);

  const toggleInSet = <T extends string>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  const customerItems = useMemo(
    () => facets.customers.map((c) => ({ key: c.id, label: c.name })),
    [facets.customers],
  );

  const sellerItems = useMemo(
    () => facets.sellers.map((s) => ({ key: s.id, label: s.name })),
    [facets.sellers],
  );

  const collectionItems = useMemo(
    () => facets.collections.map((c) => ({
      key: c.id === null ? 'none' : String(c.id),
      label: c.name,
    })),
    [facets.collections],
  );

  const genderItems = useMemo(
    () => facets.genders.map((g) => ({ key: g.id, label: g.label })),
    [facets.genders],
  );

  return (
    <div className="border-b border-slate-100 bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-5 py-2.5 text-left transition-colors hover:bg-slate-50 sm:px-6"
      >
        <span className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <Filter size={14} className="text-emerald-600" />
          Φίλτρα
          {activeCount > 0 && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">
              {activeCount}
            </span>
          )}
        </span>
        <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-100 px-5 pb-3 pt-2 sm:px-6">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => onChange(createEmptySkuModalFilters())}
              disabled={activeCount === 0}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-40"
            >
              <RotateCcw size={11} />
              Καθαρισμός
            </button>
          </div>

          <p className="text-[10px] font-medium text-slate-400">
            Επιλέξτε τιμές για να περιορίσετε τα αποτελέσματα. Χωρίς επιλογή = όλα.
          </p>

          <FilterGroup
            title="Πελάτες"
            items={customerItems}
            selected={filters.customers as Set<string>}
            onToggle={(key) => onChange({ ...filters, customers: toggleInSet(filters.customers, key) })}
            getKey={(i) => i.key}
            getLabel={(i) => i.label}
          />

          <FilterGroup
            title="Περιοχές / Ετικέτες"
            items={facets.tags.map((t) => ({ key: t, label: t }))}
            selected={filters.tags}
            onToggle={(key) => onChange({ ...filters, tags: toggleInSet(filters.tags, key) })}
            getKey={(i) => i.key}
            getLabel={(i) => i.label}
          />

          <FilterGroup
            title="Πλασιέδες"
            items={sellerItems}
            selected={filters.sellers as Set<string>}
            onToggle={(key) => onChange({ ...filters, sellers: toggleInSet(filters.sellers, key) })}
            getKey={(i) => i.key}
            getLabel={(i) => i.label}
          />

          <FilterGroup
            title="Κατηγορία"
            items={facets.categories.map((c) => ({ key: c, label: c }))}
            selected={filters.categories}
            onToggle={(key) => onChange({ ...filters, categories: toggleInSet(filters.categories, key) })}
            getKey={(i) => i.key}
            getLabel={(i) => i.label}
          />

          <FilterGroup
            title="Συλλογή"
            items={collectionItems}
            selected={filters.collections}
            onToggle={(key) => onChange({ ...filters, collections: toggleInSet(filters.collections, key) })}
            getKey={(i) => i.key}
            getLabel={(i) => i.label}
          />

          <FilterGroup
            title="Φινίρισμα"
            items={facets.finishes.map((f) => ({ key: f, label: f }))}
            selected={filters.finishes}
            onToggle={(key) => onChange({ ...filters, finishes: toggleInSet(filters.finishes, key) })}
            getKey={(i) => i.key}
            getLabel={(i) => i.label}
          />

          <FilterGroup
            title="Φύλο"
            items={genderItems}
            selected={filters.genders as unknown as Set<string>}
            onToggle={(key) => onChange({
              ...filters,
              genders: toggleInSet(filters.genders, key as Gender),
            })}
            getKey={(i) => i.key}
            getLabel={(i) => i.label}
          />
        </div>
      )}
    </div>
  );
}
