import React, { useDeferredValue, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Download,
  History,
  Loader2,
  LockKeyhole,
  MapPin,
  RotateCcw,
  Search,
  UserRound,
  X,
} from 'lucide-react';
import type { Warehouse } from '../../types';
import type { InventoryEvent } from '../../features/inventory';
import {
  formatInventoryDateTime,
  formatInventoryInteger,
  getInventoryEventReversalState,
  getInventoryOperationCategory,
  getInventoryOperationLabel,
  INVENTORY_OPERATION_CATEGORIES,
  type InventoryOperationCategory,
} from '../../features/inventory';
import { BTN_SECONDARY, CARD } from '../ui/designTokens';
import { downloadInventoryCsv } from './inventoryCsv';

interface InventoryMovementsPanelProps {
  events: InventoryEvent[];
  loading: boolean;
  fetching: boolean;
  limit: number;
  warehouses: Warehouse[];
  isAdmin: boolean;
  onLoadMore: () => void;
  onReverse: (event: InventoryEvent) => void;
}

type CategoryFilter = 'all' | InventoryOperationCategory['id'];

function deltaTone(value: number): string {
  if (value > 0) return 'text-emerald-700';
  if (value < 0) return 'text-rose-700';
  return 'text-slate-500';
}

function signed(value: number): string {
  return `${value > 0 ? '+' : ''}${formatInventoryInteger(value)}`;
}

function MovementIcon({ event, reversed, reversal }: { event: InventoryEvent; reversed: boolean; reversal: boolean }) {
  const base = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl';
  if (reversal) return <span className={`${base} bg-blue-50 text-blue-700`}><RotateCcw size={18} aria-hidden="true" /></span>;
  if (reversed) return <span className={`${base} bg-slate-200 text-slate-500`}><History size={18} aria-hidden="true" /></span>;
  if (event.operationType === 'transfer_out' || event.operationType === 'transfer_in') {
    return <span className={`${base} bg-violet-50 text-violet-700`}><ArrowLeftRight size={18} aria-hidden="true" /></span>;
  }
  if (event.onHandDelta > 0) return <span className={`${base} bg-emerald-50 text-emerald-700`}><ArrowDownLeft size={18} aria-hidden="true" /></span>;
  if (event.onHandDelta < 0) return <span className={`${base} bg-rose-50 text-rose-700`}><ArrowUpRight size={18} aria-hidden="true" /></span>;
  return <span className={`${base} bg-indigo-50 text-indigo-700`}><LockKeyhole size={17} aria-hidden="true" /></span>;
}

export default function InventoryMovementsPanel({
  events,
  loading,
  fetching,
  limit,
  warehouses,
  isAdmin,
  onLoadMore,
  onReverse,
}: InventoryMovementsPanelProps) {
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [warehouseId, setWarehouseId] = useState('all');
  const warehouseNames = useMemo(
    () => new Map(warehouses.map((warehouse) => [warehouse.id, warehouse.name])),
    [warehouses],
  );

  const filtered = useMemo(() => {
    const term = deferredSearch.trim().toLocaleLowerCase('el-GR');
    return events.filter((event) => {
      if (category !== 'all' && getInventoryOperationCategory(event.operationType) !== category) return false;
      if (warehouseId !== 'all' && event.warehouseId !== warehouseId) return false;
      if (!term) return true;
      return [
        `${event.productSku}${event.variantSuffix}`,
        event.sizeInfo,
        event.reason,
        event.actorName,
        event.referenceId,
        getInventoryOperationLabel(event.operationType),
      ].some((value) => String(value || '').toLocaleLowerCase('el-GR').includes(term));
    });
  }, [category, deferredSearch, events, warehouseId]);

  const summary = useMemo(() => filtered.reduce(
    (totals, event) => ({
      inbound: totals.inbound + Math.max(0, event.onHandDelta),
      outbound: totals.outbound + Math.min(0, event.onHandDelta),
    }),
    { inbound: 0, outbound: 0 },
  ), [filtered]);

  const hasFilters = Boolean(search.trim()) || category !== 'all' || warehouseId !== 'all';
  const canLoadMore = events.length >= limit;

  const exportCsv = () => {
    downloadInventoryCsv(
      `kiniseis-apothematos-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Ημερομηνία', 'Πράξη', 'SKU', 'Μέγεθος', 'Αποθήκη', 'Μεταβολή Φυσικού', 'Μεταβολή Δεσμευμένου', 'Υπόλοιπο μετά', 'Δεσμευμένο μετά', 'Αιτιολογία', 'Χειριστής', 'Αναφορά'],
      filtered.map((event) => [
        formatInventoryDateTime(event.createdAt),
        getInventoryOperationLabel(event.operationType),
        `${event.productSku}${event.variantSuffix}`,
        event.sizeInfo,
        warehouseNames.get(event.warehouseId) || '',
        event.onHandDelta,
        event.reservedDelta,
        event.onHandAfter,
        event.reservedAfter,
        event.reason,
        event.actorName || '',
        event.referenceId || '',
      ]),
    );
  };

  return (
    <div className="space-y-4">
      <section className={`${CARD} p-3 sm:p-4`} aria-label="Φίλτρα ιστορικού κινήσεων">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-50">
            <Search size={17} className="shrink-0 text-slate-400" aria-hidden="true" />
            <span className="sr-only">Αναζήτηση στο ιστορικό κινήσεων</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="SKU, αιτιολογία, χειριστής ή αναφορά…"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Καθαρισμός αναζήτησης" className="rounded-md p-1 text-slate-400 hover:text-slate-700">
                <X size={15} />
              </button>
            )}
          </label>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <select value={category} onChange={(event) => setCategory(event.target.value as CategoryFilter)} aria-label="Φίλτρο είδους κίνησης" className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700">
              <option value="all">Όλες οι πράξεις</option>
              {INVENTORY_OPERATION_CATEGORIES.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
            <select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} aria-label="Φίλτρο αποθήκης κινήσεων" className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700">
              <option value="all">Όλες οι αποθήκες</option>
              {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
            </select>
            {hasFilters && (
              <button type="button" onClick={() => { setSearch(''); setCategory('all'); setWarehouseId('all'); }} className={`${BTN_SECONDARY} justify-center text-rose-700`}>
                <X size={16} aria-hidden="true" /> Καθαρισμός
              </button>
            )}
            <button type="button" onClick={exportCsv} disabled={filtered.length === 0} className={`${BTN_SECONDARY} justify-center disabled:opacity-40`}>
              <Download size={16} aria-hidden="true" /> CSV
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-100 pt-3 text-xs font-bold text-slate-500">
          <span>{formatInventoryInteger(filtered.length)} από {formatInventoryInteger(events.length)} κινήσεις</span>
          <span className="text-emerald-700">Εισροές {signed(summary.inbound)}</span>
          <span className="text-rose-700">Εκροές {signed(summary.outbound)}</span>
          {fetching && !loading && <span className="inline-flex items-center gap-1 text-slate-400"><Loader2 size={12} className="animate-spin" /> Ενημέρωση…</span>}
        </div>
      </section>

      <section className={`${CARD} overflow-hidden`} aria-label="Ιστορικό Κινήσεων">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-slate-500"><Loader2 size={18} className="animate-spin" /> Φόρτωση ιστορικού κινήσεων...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-slate-500">
            <History className="mx-auto mb-3 text-slate-300" />
            <p className="font-bold">{events.length === 0 ? 'Δεν υπάρχουν καταχωρισμένες κινήσεις.' : 'Καμία κίνηση δεν ταιριάζει με τα φίλτρα.'}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((event) => {
              const reversalState = getInventoryEventReversalState(event, events, isAdmin);
              return (
                <article key={event.id} className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center ${reversalState.isReversed ? 'bg-slate-50/80' : ''}`}>
                  <MovementIcon event={event} reversed={reversalState.isReversed} reversal={reversalState.isReversal} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={`font-black ${reversalState.isReversed ? 'text-slate-500 line-through decoration-slate-300' : 'text-slate-900'}`}>{getInventoryOperationLabel(event.operationType)}</p>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-700">{event.productSku}{event.variantSuffix}</span>
                      {event.sizeInfo && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">Μέγεθος {event.sizeInfo}</span>}
                      {reversalState.isReversed && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-black uppercase text-slate-600">Ακυρωμένη</span>}
                      {reversalState.isReversal && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black uppercase text-blue-700">Αντιλογιστική</span>}
                    </div>
                    <p className="mt-1 break-words text-sm text-slate-600">{event.reason}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span className="tabular-nums">{formatInventoryDateTime(event.createdAt)}</span>
                      <span className="inline-flex items-center gap-1"><MapPin size={12} aria-hidden="true" /> {warehouseNames.get(event.warehouseId) || 'Μη αναγνωρισμένη αποθήκη'}</span>
                      <span className="inline-flex items-center gap-1"><UserRound size={12} aria-hidden="true" /> {event.actorName || 'Χρήστης συστήματος'}</span>
                      {event.referenceId && <span className="max-w-[16rem] truncate">Αναφορά {event.referenceId}</span>}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4 sm:justify-end">
                    <div className="grid grid-cols-2 gap-x-4 text-right">
                      <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">Φυσικό</span>
                      <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">Δεσμ.</span>
                      <span className={`font-black tabular-nums ${deltaTone(event.onHandDelta)}`}>{signed(event.onHandDelta)}</span>
                      <span className={`font-black tabular-nums ${event.reservedDelta === 0 ? 'text-slate-400' : 'text-indigo-700'}`}>{signed(event.reservedDelta)}</span>
                      <span className="text-[11px] tabular-nums text-slate-400">→ {formatInventoryInteger(event.onHandAfter)}</span>
                      <span className="text-[11px] tabular-nums text-slate-400">→ {formatInventoryInteger(event.reservedAfter)}</span>
                    </div>
                    {reversalState.canReverse ? (
                      <button
                        type="button"
                        onClick={() => onReverse(event)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-black text-rose-700 transition hover:bg-rose-50"
                        aria-label={`Ακύρωση κίνησης ${event.productSku}${event.variantSuffix}`}
                      >
                        <RotateCcw size={14} aria-hidden="true" /> Ακύρωση
                      </button>
                    ) : !reversalState.isReversal && !reversalState.isReversed ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-500" title={reversalState.explanation}>
                        <LockKeyhole size={13} aria-hidden="true" /> {isAdmin ? 'Αναίρεση από το έγγραφο' : 'Μόνο προβολή'}
                      </span>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {!loading && canLoadMore && (
          <div className="border-t border-slate-100 bg-slate-50/70 p-3 text-center">
            <button type="button" onClick={onLoadMore} disabled={fetching} className={`${BTN_SECONDARY} mx-auto justify-center disabled:opacity-50`}>
              {fetching ? <Loader2 size={16} className="animate-spin" /> : <History size={16} aria-hidden="true" />}
              Φόρτωση παλαιότερων κινήσεων
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
