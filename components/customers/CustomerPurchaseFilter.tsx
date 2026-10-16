import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Gem, Search, ShoppingBag, X } from 'lucide-react';
import {
  EMPTY_PURCHASE_FILTER,
  FACET_META,
  facetItemLabel,
  purchaseFacetOptions,
  searchSkuOptions,
  WINDOW_OPTIONS,
  type AssortmentIndex,
  type FacetOption,
  type PurchaseFacet,
  type PurchaseFilter,
  type PurchaseFilterItem,
} from '../../features/customers/customerAssortment';
import { formatNumber } from '../../utils/numberFormat';
import { placeKey } from '../../features/customers/customerLocation';
import { ProductThumb } from './customerUi';

interface Props {
  index: AssortmentIndex | null;
  value: PurchaseFilter;
  onChange: (next: PurchaseFilter) => void;
  /** Customers matching right now (shown on the button / footer). */
  matchCount?: number;
}

const FACETS: PurchaseFacet[] = ['kind', 'collection', 'category', 'sku'];

const sameItem = (a: PurchaseFilterItem, b: PurchaseFilterItem) => a.facet === b.facet && a.key === b.key;

export function purchaseFilterSummary(index: AssortmentIndex | null, filter: PurchaseFilter): string {
  if (!index || filter.items.length === 0) return '';
  const names = filter.items.map(item => facetItemLabel(index, item));
  const joined = names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(filter.match === 'all' ? ' και ' : ' ή ');
  const period = filter.window === 'all' ? '' : ` · ${WINDOW_OPTIONS.find(o => o.id === filter.window)?.short}`;
  return `${filter.mode === 'bought' ? 'Πήραν' : 'Δεν πήραν'}: ${joined}${period}`;
}

/** «Αγορές» filter: customers that bought (or never bought) kinds, collections, categories or SKUs. */
export default function CustomerPurchaseFilter({ index, value, onChange, matchCount }: Props) {
  const [open, setOpen] = useState(false);
  const [facet, setFacet] = useState<PurchaseFacet>('collection');
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey, true); };
  }, [open]);

  const facetOptions = useMemo(() => (index && open ? purchaseFacetOptions(index, value.window) : null), [index, open, value.window]);
  const options: FacetOption[] = useMemo(() => {
    if (!index || !open) return [];
    if (facet === 'sku') return searchSkuOptions(index, query, value.window, 40);
    const list = facetOptions?.[facet] ?? [];
    const q = placeKey(query);
    return q ? list.filter(o => placeKey(o.label).includes(q)) : list;
  }, [index, open, facet, query, value.window, facetOptions]);

  const active = value.items.length > 0;
  const toggle = (item: PurchaseFilterItem) => {
    const exists = value.items.some(i => sameItem(i, item));
    onChange({ ...value, items: exists ? value.items.filter(i => !sameItem(i, item)) : [...value.items, item] });
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold shadow-sm transition ${active || open
          ? 'border-violet-200 bg-violet-50 text-violet-800'
          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
        title="Φίλτρο με βάση τι έχουν αγοράσει"
      >
        <ShoppingBag size={15} /> Αγορές
        {active && <span className="rounded-full bg-violet-600 px-1.5 text-[10px] text-white">{value.items.length}</span>}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 flex max-h-[min(70vh,560px)] w-[min(92vw,440px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="space-y-2.5 border-b border-slate-100 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm font-black text-slate-800"><Gem size={15} className="text-violet-500" /> Τι έχουν αγοράσει</span>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Κλείσιμο"><X size={15} /></button>
            </div>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
              {(['bought', 'not_bought'] as const).map(mode => (
                <button key={mode} type="button" onClick={() => onChange({ ...value, mode })} aria-pressed={value.mode === mode}
                  className={`rounded-lg py-1.5 text-[11px] font-black transition ${value.mode === mode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                  {mode === 'bought' ? 'Έχουν πάρει' : 'Δεν έχουν πάρει'}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <select value={value.window} onChange={e => onChange({ ...value, window: e.target.value as PurchaseFilter['window'] })}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 outline-none" aria-label="Περίοδος">
                {WINDOW_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              {value.items.length > 1 && (
                <select value={value.match} onChange={e => onChange({ ...value, match: e.target.value as PurchaseFilter['match'] })}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 outline-none" aria-label="Συνδυασμός">
                  <option value="any">{value.mode === 'bought' ? 'τουλάχιστον ένα' : 'λείπει έστω ένα'}</option>
                  <option value="all">{value.mode === 'bought' ? 'όλα μαζί' : 'κανένα από αυτά'}</option>
                </select>
              )}
            </div>
            {value.items.length > 0 && index && (
              <div className="flex flex-wrap gap-1">
                {value.items.map(item => (
                  <span key={`${item.facet}:${item.key}`} className="inline-flex items-center gap-1 rounded-full bg-violet-600 py-0.5 pl-2 pr-0.5 text-[10px] font-bold text-white">
                    <span className="opacity-70">{FACET_META[item.facet].label}:</span> {facetItemLabel(index, item)}
                    <button type="button" onClick={() => toggle(item)} className="rounded-full p-0.5 hover:bg-white/20" aria-label="Αφαίρεση"><X size={10} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-1 border-b border-slate-100 px-3 pt-2">
            {FACETS.map(f => (
              <button key={f} type="button" onClick={() => { setFacet(f); setQuery(''); }}
                className={`-mb-px border-b-2 px-2 pb-2 text-[11px] font-black transition ${facet === f ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>
                {FACET_META[f].plural}
              </button>
            ))}
          </div>
          <div className="relative px-3 pt-2.5">
            <Search size={14} className="absolute left-5 top-1/2 mt-[5px] -translate-y-1/2 text-slate-400" />
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
              placeholder={facet === 'sku' ? 'Πληκτρολογήστε κωδικό ή περιγραφή…' : `Αναζήτηση σε ${FACET_META[facet].plural.toLowerCase()}…`}
              className="w-full rounded-xl border border-slate-200 py-2 pl-8 pr-3 text-xs font-semibold outline-none focus:border-slate-400" />
          </div>
          <div className="min-h-[120px] flex-1 overflow-y-auto p-2 custom-scrollbar">
            {!index ? (
              <p className="py-8 text-center text-xs text-slate-400">Φόρτωση καταλόγου…</p>
            ) : options.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-400">{facet === 'sku' && !query.trim() ? 'Γράψτε για να βρείτε κωδικό.' : 'Δεν βρέθηκαν αποτελέσματα.'}</p>
            ) : options.map(option => {
              const item = { facet: option.facet, key: option.key };
              const selected = value.items.some(i => sameItem(i, item));
              return (
                <button key={`${option.facet}:${option.key}`} type="button" onClick={() => toggle(item)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition ${selected ? 'bg-violet-50' : 'hover:bg-slate-50'}`}>
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300 bg-white'}`}>{selected && <Check size={11} strokeWidth={3} />}</span>
                  {option.facet === 'sku' && <ProductThumb src={option.image ?? null} size={28} />}
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-xs font-bold ${option.facet === 'sku' ? 'font-mono' : ''} text-slate-800`}>{option.label}</span>
                    {option.sub && <span className="block truncate text-[10px] text-slate-400">{option.sub}</span>}
                  </span>
                  <span className="shrink-0 rounded-full bg-slate-100 px-1.5 text-[10px] font-black tabular-nums text-slate-500" title="Πελάτες που το αγόρασαν στην περίοδο">{formatNumber(option.customerCount)}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/80 px-3 py-2">
            <button type="button" disabled={!active} onClick={() => onChange({ ...EMPTY_PURCHASE_FILTER, window: value.window, mode: value.mode })}
              className="rounded-lg px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-200/60 disabled:opacity-40">Καθαρισμός</button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-[#060b00] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-black">
              {active && matchCount !== undefined ? `Εμφάνιση ${formatNumber(matchCount)} πελατών` : 'Κλείσιμο'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
