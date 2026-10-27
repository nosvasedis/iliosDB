import { formatNumber } from '../../utils/numberFormat';
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

type FilterScheme = {
  title: string;
  active: string;
  inactive: string;
};

const CHIP_SCHEME: FilterScheme = {
  title: 'text-slate-500',
  active: 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-600',
  inactive: 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300 hover:text-slate-900',
};

const SCHEMES = {
  customers: CHIP_SCHEME,
  tags: CHIP_SCHEME,
  sellers: CHIP_SCHEME,
  categories: CHIP_SCHEME,
  collections: CHIP_SCHEME,
  finishes: CHIP_SCHEME,
  genders: CHIP_SCHEME,
} satisfies Record<string, FilterScheme>;

function FilterGroup({
  title,
  scheme,
  items,
  selected,
  onToggle,
  headerActions,
}: {
  title: string;
  scheme: FilterScheme;
  items: Array<{ key: string; label: string }>;
  selected: Set<string>;
  onToggle: (key: string) => void;
  headerActions?: React.ReactNode;
}) {
  if (items.length === 0) return null;

  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className={`text-[10px] font-bold uppercase tracking-wide ${scheme.title}`}>
          {title}
          {selected.size > 0 ? <span className="ml-1.5 text-emerald-600">· {formatNumber(selected.size)}</span> : null}
        </p>
        {headerActions}
      </div>
      <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto p-px">
        {items.map((item) => {
          const active = selected.has(item.key);
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onToggle(item.key)}
              aria-pressed={active}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                active ? scheme.active : scheme.inactive
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BulkToggleButtons({
  onSelectAll,
  onDeselectAll,
  colorClass,
}: {
  onSelectAll: () => void;
  onDeselectAll: () => void;
  colorClass: string;
}) {
  return (
    <div className="flex shrink-0 gap-1">
      <button
        type="button"
        onClick={onSelectAll}
        className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold ${colorClass} hover:opacity-80`}
      >
        Όλοι
      </button>
      <button
        type="button"
        onClick={onDeselectAll}
        className="rounded-md px-1.5 py-0.5 text-[9px] font-bold text-slate-400 hover:bg-slate-200/80 hover:text-slate-600"
      >
        Κανένας
      </button>
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

  const allCustomerKeys = useMemo(() => new Set(customerItems.map((c) => c.key)), [customerItems]);

  return (
    <div
      className={`border-b border-slate-200/70 bg-white ${
        open ? 'flex min-h-0 max-h-[min(42vh,24rem)] flex-col overflow-hidden' : 'shrink-0'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full shrink-0 items-center justify-between gap-2 px-4 py-2.5 text-left transition-colors hover:bg-slate-50 sm:px-5"
      >
        <span className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <Filter size={14} className={activeCount > 0 ? 'text-emerald-600' : 'text-slate-400'} />
          Φίλτρα
          {activeCount > 0 ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">
              {formatNumber(activeCount)} ενεργά
            </span>
          ) : (
            <span className="hidden truncate text-[11px] font-medium text-slate-400 sm:inline">πελάτες, πλασιέ, κατηγορία, συλλογή…</span>
          )}
        </span>
        <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain border-t border-slate-100 px-4 pb-3 pt-2 sm:px-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-medium text-slate-400">
              Επιλέξτε τιμές για περιορισμό. Χωρίς επιλογή = όλα.
            </p>
            <button
              type="button"
              onClick={() => onChange(createEmptySkuModalFilters())}
              disabled={activeCount === 0}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-40"
            >
              <RotateCcw size={11} />
              Καθαρισμός
            </button>
          </div>

          <FilterGroup
            title="Πελάτες"
            scheme={SCHEMES.customers}
            items={customerItems}
            selected={filters.customers as Set<string>}
            onToggle={(key) => onChange({ ...filters, customers: toggleInSet(filters.customers, key) })}
            headerActions={customerItems.length > 0 ? (
              <BulkToggleButtons
                colorClass="text-emerald-700 bg-emerald-50"
                onSelectAll={() => onChange({ ...filters, customers: new Set(allCustomerKeys) })}
                onDeselectAll={() => onChange({ ...filters, customers: new Set() })}
              />
            ) : undefined}
          />

          <FilterGroup
            title="Περιοχές / Ετικέτες"
            scheme={SCHEMES.tags}
            items={facets.tags.map((t) => ({ key: t, label: t }))}
            selected={filters.tags}
            onToggle={(key) => onChange({ ...filters, tags: toggleInSet(filters.tags, key) })}
          />

          <FilterGroup
            title="Πλασιέδες"
            scheme={SCHEMES.sellers}
            items={sellerItems}
            selected={filters.sellers as Set<string>}
            onToggle={(key) => onChange({ ...filters, sellers: toggleInSet(filters.sellers, key) })}
          />

          <FilterGroup
            title="Κατηγορία"
            scheme={SCHEMES.categories}
            items={facets.categories.map((c) => ({ key: c, label: c }))}
            selected={filters.categories}
            onToggle={(key) => onChange({ ...filters, categories: toggleInSet(filters.categories, key) })}
          />

          <FilterGroup
            title="Συλλογή"
            scheme={SCHEMES.collections}
            items={collectionItems}
            selected={filters.collections}
            onToggle={(key) => onChange({ ...filters, collections: toggleInSet(filters.collections, key) })}
          />

          <FilterGroup
            title="Φινίρισμα"
            scheme={SCHEMES.finishes}
            items={facets.finishes.map((f) => ({ key: f, label: f }))}
            selected={filters.finishes}
            onToggle={(key) => onChange({ ...filters, finishes: toggleInSet(filters.finishes, key) })}
          />

          <FilterGroup
            title="Φύλο"
            scheme={SCHEMES.genders}
            items={genderItems}
            selected={filters.genders as unknown as Set<string>}
            onToggle={(key) => onChange({
              ...filters,
              genders: toggleInSet(filters.genders, key as Gender),
            })}
          />
        </div>
      )}
    </div>
  );
}
