import React, { memo, useMemo, useState, useCallback, useRef, useDeferredValue, useTransition } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Search,
  Copy,
  Check,
  ExternalLink,
  ImageIcon,
  Gift,
  Loader2,
} from 'lucide-react';
import { Gender, Order, Product } from '../../types';
import { resolveImageUrl } from '../../lib/supabase';
import { formatCurrency, splitSkuComponents } from '../../utils/pricingEngine';
import { FinanceLineEvent } from '../../utils/financeAnalytics';
import SkuColorizedText from '../SkuColorizedText';
import SkuVariantDetailPanel from './SkuVariantDetailPanel';
import SkuModalFiltersPanel from './SkuModalFiltersPanel';
import {
  ModalDetailSkeleton,
  ModalListSkeleton,
  SkuModalShell,
  useDeferredModalMount,
} from './SkuModalSkeleton';
import {
  type EnrichedVariantAnalyticsRow,
  type VariantAnalyticsSort,
} from '../../features/dashboard/dashboardAnalysisViewModels';
import {
  buildSkuVariantDetail,
  buildSkuVariantDetailFromSelection,
  type SkuVariantDetail,
} from '../../features/dashboard/skuVariantAnalytics';
import {
  buildOrderMetaIndex,
  buildFilterFacets,
  buildSlimEnrichedRowsFromEvents,
  createEmptySkuModalFilters,
  describeNegativeProfit,
  filterFinanceEventsForModal,
  formatVariantMargin,
  type SkuModalFilterSelection,
} from '../../features/dashboard/skuModalFilters';
import { variantRankingKey } from '../../utils/financeLineSku';

const SORT_OPTIONS: { id: VariantAnalyticsSort; label: string }[] = [
  { id: 'quantity', label: 'Τεμάχια' },
  { id: 'revenue', label: 'Έσοδα' },
  { id: 'profit', label: 'Κέρδος' },
  { id: 'margin', label: 'Περιθώριο' },
];

const RANK_STYLES: Record<number, string> = {
  1: 'bg-amber-500 text-white ring-2 ring-amber-200',
  2: 'bg-slate-400 text-white ring-2 ring-slate-200',
  3: 'bg-orange-400 text-white ring-2 ring-orange-200',
};

/** Fixed virtual row slot — content + gap between cards */
const ROW_HEIGHT = 132;

interface Props {
  realizedEvents: FinanceLineEvent[];
  backlogEvents: FinanceLineEvent[];
  products: Product[];
  orders: Order[];
  periodLabel: string;
  onClose: () => void;
  onOpenRegistry?: () => void;
}

const VariantListRow = memo(function VariantListRow({
  row,
  isSelected,
  isCopied,
  onSelect,
  onCopy,
}: {
  row: EnrichedVariantAnalyticsRow;
  isSelected: boolean;
  isCopied: boolean;
  onSelect: () => void;
  onCopy: () => void;
}) {
  const src = resolveImageUrl(row.image);
  const profitNote = describeNegativeProfit(row);
  const marginLabel = formatVariantMargin(row);
  const rankStyle = RANK_STYLES[row.rank];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition-colors ${
        isSelected
          ? 'border-emerald-400 ring-2 ring-emerald-500/25'
          : 'border-slate-100 hover:border-emerald-200 hover:shadow-md'
      }`}
    >
      <div className="flex gap-4">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-black ${
            rankStyle ?? 'bg-slate-100 text-slate-500'
          }`}
        >
          {row.rank}
        </div>

        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-50 shadow-sm">
          {src ? (
            <img src={src} alt={row.sku} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-300">
              <ImageIcon size={20} />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SkuColorizedText
              sku={row.sku}
              suffix={row.variantSuffix}
              gender={row.gender}
              className="text-sm"
            />
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onCopy(); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onCopy(); }
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-500 opacity-0 transition-opacity group-hover:opacity-100"
            >
              {isCopied ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
              {row.category.split(' ')[0]}
            </span>
            {(row.giftQuantity ?? 0) > 0 && (
              <span
                className="inline-flex items-center gap-0.5 rounded-md bg-fuchsia-50 px-2 py-0.5 text-[10px] font-bold text-fuchsia-700 ring-1 ring-fuchsia-100"
                title="Δώρα με τιμή 0€"
              >
                <Gift size={10} />
                {row.giftQuantity} δώρο
              </span>
            )}
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2">
            <div className="rounded-xl bg-emerald-50/80 px-2 py-1.5 ring-1 ring-emerald-100">
              <p className="text-[9px] font-bold uppercase text-emerald-600/80">Τεμ.</p>
              <p className="text-sm font-black text-emerald-900">{row.quantity}</p>
            </div>
            <div className="rounded-xl bg-blue-50/80 px-2 py-1.5 ring-1 ring-blue-100">
              <p className="text-[9px] font-bold uppercase text-blue-600/80">Έσοδα</p>
              <p className="text-sm font-black text-blue-900">{formatCurrency(row.revenue)}</p>
            </div>
            <div
              className={`rounded-xl px-2 py-1.5 ring-1 ${row.profit >= 0 ? 'bg-teal-50/80 ring-teal-100' : 'bg-red-50/80 ring-red-100'}`}
              title={profitNote ?? undefined}
            >
              <p className={`text-[9px] font-bold uppercase ${row.profit >= 0 ? 'text-teal-600/80' : 'text-red-600/80'}`}>Κέρδος</p>
              <p className={`text-sm font-black ${row.profit >= 0 ? 'text-teal-900' : 'text-red-700'}`}>
                {formatCurrency(row.profit)}
              </p>
            </div>
            <div className="rounded-xl bg-amber-50/80 px-2 py-1.5 ring-1 ring-amber-100" title={profitNote ?? undefined}>
              <p className="text-[9px] font-bold uppercase text-amber-700/80">Περιθ.</p>
              <p className="text-sm font-black text-amber-900">{marginLabel}</p>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
});

function TopVariantsModalBody({
  realizedEvents,
  backlogEvents,
  products,
  orders,
  periodLabel,
  onOpenRegistry,
}: Omit<Props, 'onClose'>) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [sort, setSort] = useState<VariantAnalyticsSort>('quantity');
  const [copiedSku, setCopiedSku] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [filters, setFilters] = useState<SkuModalFilterSelection>(createEmptySkuModalFilters);
  const deferredFilters = useDeferredValue(filters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const listParentRef = useRef<HTMLDivElement>(null);

  const orderMeta = useMemo(() => buildOrderMetaIndex(orders), [orders]);
  const productsMap = useMemo(() => new Map(products.map((p) => [p.sku, p])), [products]);

  const facets = useMemo(
    () => buildFilterFacets(realizedEvents, orderMeta, products),
    [realizedEvents, orderMeta, products],
  );

  const filteredRealized = useMemo(
    () => filterFinanceEventsForModal(realizedEvents, deferredFilters, orderMeta, products),
    [realizedEvents, deferredFilters, orderMeta, products],
  );

  const filteredBacklog = useMemo(
    () => filterFinanceEventsForModal(backlogEvents, deferredFilters, orderMeta, products),
    [backlogEvents, deferredFilters, orderMeta, products],
  );

  const displayed = useMemo(
    () => buildSlimEnrichedRowsFromEvents(filteredRealized, products, sort, deferredQuery),
    [filteredRealized, products, sort, deferredQuery],
  );

  const selectedRow = useMemo(
    () => (selectedKey ? displayed.find((r) => variantRankingKey(r.sku, r.variantSuffix) === selectedKey) : null),
    [displayed, selectedKey],
  );

  const inspectDetail = useMemo((): SkuVariantDetail | null => {
    const q = deferredQuery.trim();
    if (q.length >= 2) {
      return buildSkuVariantDetail({ realized: filteredRealized, backlog: filteredBacklog, query: q });
    }
    if (selectedRow) {
      return buildSkuVariantDetailFromSelection({
        realized: filteredRealized,
        backlog: filteredBacklog,
        sku: selectedRow.sku,
        variantSuffix: selectedRow.variantSuffix,
        isMasterAggregate: false,
      });
    }
    return null;
  }, [deferredQuery, selectedRow, filteredRealized, filteredBacklog]);

  const inspectGender = inspectDetail ? productsMap.get(inspectDetail.sku)?.gender : undefined;

  const virtualizer = useVirtualizer({
    count: displayed.length,
    getScrollElement: () => listParentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  const handleCopy = useCallback(async (fullSku: string) => {
    try {
      await navigator.clipboard.writeText(fullSku);
      setCopiedSku(fullSku);
      window.setTimeout(() => setCopiedSku((c) => (c === fullSku ? null : c)), 1600);
    } catch { /* clipboard unavailable */ }
  }, []);

  const handleSelectRow = useCallback((row: EnrichedVariantAnalyticsRow) => {
    startTransition(() => {
      setSelectedKey(variantRankingKey(row.sku, row.variantSuffix));
      setQuery('');
    });
  }, []);

  const handleSelectVariant = useCallback((variantSuffix: string) => {
    if (!inspectDetail) return;
    startTransition(() => {
      setSelectedKey(variantRankingKey(inspectDetail.sku, variantSuffix));
      setQuery(inspectDetail.sku + variantSuffix);
    });
  }, [inspectDetail]);

  const previewComponents = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return { master: '', suffix: '' };
    return splitSkuComponents(q);
  }, [query]);

  const isStale = isPending || deferredQuery !== query || deferredFilters !== filters;

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-slate-100 lg:w-[45%] lg:border-b-0 lg:border-r">
          <div className="shrink-0 space-y-3 border-b border-slate-100 bg-white px-5 py-3 sm:px-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    if (e.target.value.trim().length >= 2) setSelectedKey(null);
                  }}
                  placeholder="Αναζήτηση κωδικού…"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm font-medium text-slate-700 outline-none focus:border-emerald-300 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
                />
              </div>
              {onOpenRegistry && (
                <button
                  type="button"
                  onClick={onOpenRegistry}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:border-emerald-200 hover:bg-emerald-50"
                >
                  <ExternalLink size={15} />
                  Μητρώο
                </button>
              )}
            </div>

            {previewComponents.master && (
              <div className="flex items-center gap-2">
                <SkuColorizedText
                  sku={previewComponents.master}
                  suffix={previewComponents.suffix}
                  gender={productsMap.get(previewComponents.master)?.gender}
                  className="text-sm"
                />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {SORT_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSort(option.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                    sort === option.id ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
              {displayed.length > 0 && (
                <span className="ml-auto text-[10px] font-bold text-slate-400">
                  {displayed.length} παραλλαγές
                </span>
              )}
            </div>
          </div>

          <SkuModalFiltersPanel
            facets={facets}
            filters={filters}
            onChange={setFilters}
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
          />

          <div ref={listParentRef} className="relative min-h-0 flex-1 overflow-y-auto bg-slate-50/60 px-4 py-4">
            {isStale && (
              <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 text-[10px] font-bold text-slate-500 shadow-sm ring-1 ring-slate-100">
                  <Loader2 size={12} className="animate-spin text-emerald-500" />
                  Ενημέρωση…
                </span>
              </div>
            )}

            {displayed.length === 0 ? (
              <div className="py-16 text-center text-sm text-slate-400">
                Δεν βρέθηκαν αποτελέσματα με τα τρέχοντα φίλτρα.
              </div>
            ) : (
              <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const row = displayed[virtualRow.index];
                  const rowKey = variantRankingKey(row.sku, row.variantSuffix);
                  return (
                    <div
                      key={rowKey}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: ROW_HEIGHT,
                        transform: `translateY(${virtualRow.start}px)`,
                        paddingBottom: 12,
                      }}
                    >
                      <VariantListRow
                        row={row}
                        isSelected={selectedKey === rowKey}
                        isCopied={copiedSku === row.fullSku}
                        onSelect={() => handleSelectRow(row)}
                        onCopy={() => handleCopy(row.fullSku)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex min-h-[280px] min-w-0 flex-col border-l border-slate-100 bg-gradient-to-b from-slate-50/40 to-white lg:w-[55%] lg:min-h-0">
          <SkuVariantDetailPanel
            detail={inspectDetail}
            gender={inspectGender as Gender | undefined}
            onSelectVariant={handleSelectVariant}
          />
        </div>
      </div>
    </>
  );
}

export default function TopVariantsAnalyticsModal(props: Props) {
  const contentReady = useDeferredModalMount();

  return (
    <SkuModalShell periodLabel={props.periodLabel} onClose={props.onClose}>
      {contentReady ? (
        <TopVariantsModalBody {...props} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="min-h-[320px] flex-1 border-b border-slate-100 lg:w-[45%] lg:border-b-0 lg:border-r">
            <ModalListSkeleton />
          </div>
          <div className="min-h-[280px] flex-1 bg-gradient-to-b from-slate-50/40 to-white lg:w-[55%]">
            <ModalDetailSkeleton />
          </div>
        </div>
      )}
    </SkuModalShell>
  );
}
