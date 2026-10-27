import { formatDecimal, formatNumber } from '../../utils/numberFormat';
import React, { memo, useMemo, useState, useCallback, useRef, useDeferredValue, useTransition, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Search,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ImageIcon,
  Gift,
  Loader2,
} from 'lucide-react';
import { Gender, Order, Product, UserProfile } from '../../types';
import { resolveImageUrl } from '../../lib/supabase';
import { formatCurrency, splitSkuComponents } from '../../utils/pricingEngine';
import { FinanceLineEvent, FinancePeriodMode } from '../../utils/financeAnalytics';
import SkuColorizedText from '../SkuColorizedText';
import SpecialCreationNote from '../SpecialCreationNote';
import SkuVariantDetailPanel from './SkuVariantDetailPanel';
import SkuModalFiltersPanel from './SkuModalFiltersPanel';
import OrionDesignRankList from './OrionDesignRankList';
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
  countActiveSkuModalFilters,
  createEmptySkuModalFilters,
  describeNegativeProfit,
  filterFinanceEventsForModal,
  applyOrderMetaToFinanceEvents,
  formatVariantMargin,
  type SkuModalFilterSelection,
} from '../../features/dashboard/skuModalFilters';
import {
  aggregateOrionDesignRankings,
  filterEventsForOrionDesign,
  ORION_TYPE_CHIPS,
  parseOrionDesignFromSku,
  shouldShowOrionDesignView,
  type OrionJewelleryType,
} from '../../features/dashboard/orionDesignAnalytics';
import { buildSkuSalesPrintData, describeSkuModalFilters } from '../../features/dashboard/skuSalesPrint';
import { variantRankingKey } from '../../utils/financeLineSku';
import { isSpecialCreationSku } from '../../utils/specialCreationSku';
import { useCollections } from '../../hooks/api/useCollections';
import { useMolds } from '../../hooks/api/useMolds';
import { usePrint } from '../PrintContext';

const SORT_OPTIONS: { id: VariantAnalyticsSort; label: string }[] = [
  { id: 'quantity', label: 'Τεμάχια' },
  { id: 'revenue', label: 'Έσοδα' },
  { id: 'profit', label: 'Κέρδος' },
  { id: 'margin', label: 'Περιθώριο' },
];

const RANK_STYLES: Record<number, string> = {
  1: 'bg-amber-400 text-amber-950',
  2: 'bg-slate-300 text-slate-800',
  3: 'bg-orange-300 text-orange-950',
};

/** Estimated virtual row slot — content + gap between rows (rows are measured). */
const ROW_HEIGHT = 92;

function metricValue(row: Pick<EnrichedVariantAnalyticsRow, 'quantity' | 'revenue' | 'profit' | 'margin'>, sort: VariantAnalyticsSort): number {
  if (sort === 'revenue') return row.revenue;
  if (sort === 'profit') return row.profit;
  if (sort === 'margin') return row.margin;
  return row.quantity;
}

interface Props {
  realizedEvents: FinanceLineEvent[];
  backlogEvents: FinanceLineEvent[];
  products: Product[];
  orders: Order[];
  sellers?: UserProfile[];
  periodLabel: string;
  periodMode: FinancePeriodMode;
  onPeriodChange: (mode: FinancePeriodMode) => void;
  onClose: () => void;
  onOpenRegistry?: () => void;
}

const VariantListRow = memo(function VariantListRow({
  row,
  share,
  sort,
  isSelected,
  isCopied,
  onSelect,
  onCopy,
}: {
  row: EnrichedVariantAnalyticsRow;
  /** 0–100: this row's sort metric relative to the leader */
  share: number;
  sort: VariantAnalyticsSort;
  isSelected: boolean;
  isCopied: boolean;
  onSelect: () => void;
  onCopy: () => void;
}) {
  const src = resolveImageUrl(row.image);
  const profitNote = describeNegativeProfit(row);
  const marginLabel = formatVariantMargin(row);
  const rankStyle = RANK_STYLES[row.rank];
  const negative = row.profit < 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative w-full rounded-2xl bg-white p-3 text-left transition-all ${
        isSelected
          ? 'shadow-md ring-2 ring-emerald-500'
          : 'ring-1 ring-slate-200/70 hover:shadow-sm hover:ring-slate-300'
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-black tabular-nums ${
            rankStyle ?? 'bg-slate-100 text-slate-500'
          }`}
        >
          {formatNumber(row.rank)}
        </span>

        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200/60">
          {src ? (
            <img src={src} alt={row.sku} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-300">
              <ImageIcon size={18} />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <SkuColorizedText sku={row.sku} suffix={row.variantSuffix} gender={row.gender} className="truncate text-sm" />
            <span
              role="button"
              tabIndex={0}
              title="Αντιγραφή κωδικού"
              onClick={(e) => { e.stopPropagation(); onCopy(); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onCopy(); }
              }}
              className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition-opacity hover:bg-slate-100 hover:text-slate-700 ${
                isCopied ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
              }`}
            >
              {isCopied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
            </span>
          </div>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-medium text-slate-400">
            <span className="truncate">{row.category.split(' ')[0]}</span>
            {(row.giftQuantity ?? 0) > 0 && (
              <span className="inline-flex items-center gap-0.5 font-bold text-fuchsia-600" title="Δώρα με τιμή 0€">
                <Gift size={10} />
                {formatNumber(row.giftQuantity)} δώρο
              </span>
            )}
          </div>
          <SpecialCreationNote sku={row.sku} note={row.itemNote} compact className="mt-1" />
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden>
            <div
              className={`h-full rounded-full ${sort === 'profit' && negative ? 'bg-rose-400' : 'bg-emerald-500'}`}
              style={{ width: `${Math.max(2, share)}%` }}
            />
          </div>
        </div>

        <div className="hidden shrink-0 grid-cols-[3.25rem_5.75rem_5.75rem_3.25rem] items-center gap-2 text-right sm:grid">
          <Metric label="Τεμ." value={formatNumber(row.quantity)} active={sort === 'quantity'} />
          <Metric label="Έσοδα" value={formatCurrency(row.revenue)} active={sort === 'revenue'} />
          <Metric label="Κέρδος" value={formatCurrency(row.profit)} active={sort === 'profit'} tone={negative ? 'negative' : undefined} title={profitNote ?? undefined} />
          <Metric label="Περιθ." value={marginLabel} active={sort === 'margin'} title={profitNote ?? undefined} />
        </div>
      </div>

      <div className="mt-2.5 grid grid-cols-4 gap-1.5 text-center sm:hidden">
        <Metric label="Τεμ." value={formatNumber(row.quantity)} active={sort === 'quantity'} compact />
        <Metric label="Έσοδα" value={formatCurrency(row.revenue)} active={sort === 'revenue'} compact />
        <Metric label="Κέρδος" value={formatCurrency(row.profit)} active={sort === 'profit'} tone={negative ? 'negative' : undefined} compact />
        <Metric label="Περιθ." value={marginLabel} active={sort === 'margin'} compact />
      </div>
    </button>
  );
});

function Metric({
  label,
  value,
  active,
  tone,
  title,
  compact = false,
}: {
  label: string;
  value: string;
  active: boolean;
  tone?: 'negative';
  title?: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? 'rounded-lg bg-slate-50 px-1 py-1' : ''} title={title}>
      <p className={`text-[9px] font-bold uppercase tracking-wide ${active ? 'text-emerald-600' : 'text-slate-400'}`}>{label}</p>
      <p
        className={`truncate text-xs font-black tabular-nums ${
          tone === 'negative' ? 'text-rose-600' : active ? 'text-slate-900' : 'text-slate-600'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function SummaryStat({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'positive' | 'negative' }) {
  return (
    <div className="min-w-0 px-4 py-2.5 sm:px-5">
      <p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p
        className={`truncate text-base font-black tabular-nums sm:text-lg ${
          tone === 'negative' ? 'text-rose-600' : tone === 'positive' ? 'text-emerald-700' : 'text-slate-900'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function TopVariantsModalBody({
  realizedEvents,
  backlogEvents,
  products,
  orders,
  sellers,
  periodLabel,
  onOpenRegistry,
  onPrintReady,
}: Omit<Props, 'onClose' | 'periodMode' | 'onPeriodChange'> & { onPrintReady: (handler: () => void) => void }) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [sort, setSort] = useState<VariantAnalyticsSort>('quantity');
  const [copiedSku, setCopiedSku] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [filters, setFilters] = useState<SkuModalFilterSelection>(createEmptySkuModalFilters);
  const deferredFilters = useDeferredValue(filters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  /** Below `lg` the list and the detail share the screen one at a time. */
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');
  const listParentRef = useRef<HTMLDivElement>(null);

  const collectionsQuery = useCollections();
  const moldsQuery = useMolds();
  const { setSkuSalesPrintData } = usePrint();
  const collections = collectionsQuery.data || [];
  const molds = moldsQuery.data || [];

  const [jewelleryTypes, setJewelleryTypes] = useState<Set<OrionJewelleryType>>(new Set());
  const [forceSkuList, setForceSkuList] = useState(false);
  const [selectedDesignNo, setSelectedDesignNo] = useState<number | null>(null);

  const orderMeta = useMemo(() => buildOrderMetaIndex(orders, sellers), [orders, sellers]);
  const productsMap = useMemo(() => new Map(products.map((p) => [p.sku, p])), [products]);

  const realizedWithOrderMeta = useMemo(
    () => applyOrderMetaToFinanceEvents(realizedEvents, orderMeta),
    [realizedEvents, orderMeta],
  );

  const facets = useMemo(
    () => buildFilterFacets(realizedWithOrderMeta, orderMeta, products),
    [realizedWithOrderMeta, orderMeta, products],
  );

  const filteredRealized = useMemo(
    () => filterFinanceEventsForModal(realizedEvents, deferredFilters, orderMeta, products),
    [realizedEvents, deferredFilters, orderMeta, products],
  );

  const filteredBacklog = useMemo(
    () => filterFinanceEventsForModal(backlogEvents, deferredFilters, orderMeta, products),
    [backlogEvents, deferredFilters, orderMeta, products],
  );

  const orionEligible = shouldShowOrionDesignView(deferredFilters, filteredRealized, collections);

  useEffect(() => {
    if (!orionEligible) {
      setSelectedDesignNo(null);
      setForceSkuList(false);
      setJewelleryTypes(new Set());
    }
  }, [orionEligible]);

  const typeFilteredRealized = useMemo(() => {
    if (!orionEligible || jewelleryTypes.size === 0) return filteredRealized;
    return filteredRealized.filter((event) => {
      const parsed = parseOrionDesignFromSku(event.sku);
      return parsed ? jewelleryTypes.has(parsed.type) : false;
    });
  }, [filteredRealized, jewelleryTypes, orionEligible]);

  const typeFilteredBacklog = useMemo(() => {
    if (!orionEligible || jewelleryTypes.size === 0) return filteredBacklog;
    return filteredBacklog.filter((event) => {
      const parsed = parseOrionDesignFromSku(event.sku);
      return parsed ? jewelleryTypes.has(parsed.type) : false;
    });
  }, [filteredBacklog, jewelleryTypes, orionEligible]);

  const listRealized = useMemo(
    () => (selectedDesignNo == null ? typeFilteredRealized : filterEventsForOrionDesign(typeFilteredRealized, selectedDesignNo)),
    [selectedDesignNo, typeFilteredRealized],
  );
  const listBacklog = useMemo(
    () => (selectedDesignNo == null ? typeFilteredBacklog : filterEventsForOrionDesign(typeFilteredBacklog, selectedDesignNo)),
    [selectedDesignNo, typeFilteredBacklog],
  );

  const designRankings = useMemo(
    () => aggregateOrionDesignRankings(typeFilteredRealized, products, molds, jewelleryTypes, sort),
    [typeFilteredRealized, products, molds, jewelleryTypes, sort],
  );

  const showDesigns = orionEligible && !forceSkuList && selectedDesignNo == null;
  const selectedDesign = selectedDesignNo == null
    ? null
    : designRankings.find((row) => row.designNo === selectedDesignNo) || null;

  const displayed = useMemo(
    () => buildSlimEnrichedRowsFromEvents(listRealized, products, sort, deferredQuery),
    [listRealized, products, sort, deferredQuery],
  );

  const selectedRow = useMemo(
    () => (selectedKey ? displayed.find((r) => r.key === selectedKey) : null),
    [displayed, selectedKey],
  );

  const inspectDetail = useMemo((): SkuVariantDetail | null => {
    const q = deferredQuery.trim();
    if (q.length >= 2) {
      return buildSkuVariantDetail({ realized: listRealized, backlog: listBacklog, query: q });
    }
    if (selectedRow) {
      return buildSkuVariantDetailFromSelection({
        realized: listRealized,
        backlog: listBacklog,
        sku: selectedRow.sku,
        variantSuffix: selectedRow.variantSuffix,
        itemNote: selectedRow.itemNote,
        matchItemNote: isSpecialCreationSku(selectedRow.sku),
        isMasterAggregate: false,
      });
    }
    return null;
  }, [deferredQuery, selectedRow, listRealized, listBacklog]);

  const inspectGender = inspectDetail ? productsMap.get(inspectDetail.sku)?.gender : undefined;

  const virtualizer = useVirtualizer({
    count: showDesigns ? 0 : displayed.length,
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
      setSelectedKey(row.key);
      setQuery('');
    });
    setMobileView('detail');
  }, []);

  const metricMax = useMemo(
    () => Math.max(0.0001, ...displayed.map((row) => Math.abs(metricValue(row, sort)))),
    [displayed, sort],
  );

  const summary = useMemo(() => {
    const source = showDesigns ? designRankings : displayed;
    const totals = source.reduce(
      (acc, row) => ({ quantity: acc.quantity + row.quantity, revenue: acc.revenue + row.revenue, profit: acc.profit + row.profit }),
      { quantity: 0, revenue: 0, profit: 0 },
    );
    return { ...totals, count: source.length, margin: totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0 };
  }, [designRankings, displayed, showDesigns]);

  const handleSelectVariant = useCallback((variantSuffix: string, itemNote?: string | null) => {
    if (!inspectDetail) return;
    startTransition(() => {
      setSelectedKey(variantRankingKey(inspectDetail.sku, variantSuffix, itemNote));
      setQuery('');
    });
  }, [inspectDetail]);

  const previewComponents = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return { master: '', suffix: '' };
    return splitSkuComponents(q);
  }, [query]);

  const isStale = isPending || deferredQuery !== query || deferredFilters !== filters;

  const handleToggleJewelleryType = useCallback((type: OrionJewelleryType) => {
    setJewelleryTypes((prev) => {
      const current = prev.size === 0 ? new Set(ORION_TYPE_CHIPS.map((chip) => chip.id)) : new Set(prev);
      if (current.has(type)) current.delete(type);
      else current.add(type);
      if (current.size === 0 || current.size === ORION_TYPE_CHIPS.length) return new Set();
      return current;
    });
  }, []);

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (deferredFilters.collections.size > 0) {
      const names = facets.collections
        .filter((item) => deferredFilters.collections.has(item.id == null ? 'none' : String(item.id)))
        .map((item) => item.name);
      if (names.length) parts.push(`Συλλογή: ${names.join(', ')}`);
    }
    if (jewelleryTypes.size > 0) {
      parts.push(ORION_TYPE_CHIPS.filter((chip) => jewelleryTypes.has(chip.id)).map((chip) => chip.label).join(', '));
    }
    if (selectedDesign) parts.push(`Παράσταση ${selectedDesign.displayName}`);
    if (deferredFilters.categories.size > 0) parts.push(`Κατηγορία: ${[...deferredFilters.categories].join(', ')}`);
    if (deferredFilters.customers.size > 0) parts.push(`${deferredFilters.customers.size} πελάτες`);
    if (deferredFilters.sellers.size > 0) parts.push(`${deferredFilters.sellers.size} πλασιέ`);
    if (countActiveSkuModalFilters(deferredFilters) === 0 && parts.length === 0) {
      return describeSkuModalFilters([]);
    }
    return describeSkuModalFilters(parts);
  }, [deferredFilters, facets.collections, jewelleryTypes, selectedDesign]);

  const handlePrint = useCallback(() => {
    const sortLabel = SORT_OPTIONS.find((option) => option.id === sort)?.label || 'Τεμάχια';
    const skuRows = displayed.map((row) => ({
      rank: row.rank,
      sku: row.sku,
      variantSuffix: row.variantSuffix,
      name: '',
      quantity: row.quantity,
      revenue: row.revenue,
      profit: row.profit,
    }));
    const designRows = designRankings.map((row) => ({
      rank: row.rank,
      sku: row.label,
      variantSuffix: '',
      name: row.name,
      quantity: row.quantity,
      revenue: row.revenue,
      profit: row.profit,
    }));
    const activeRows = showDesigns ? designRows : skuRows;
    const kpis = activeRows.reduce(
      (acc, row) => {
        acc.quantity += row.quantity;
        acc.revenue += row.revenue;
        acc.profit += row.profit;
        return acc;
      },
      { quantity: 0, revenue: 0, profit: 0, skuCount: activeRows.length },
    );
    setSkuSalesPrintData(buildSkuSalesPrintData({
      periodLabel,
      sortLabel,
      filterSummary,
      view: showDesigns ? 'designs' : 'skus',
      kpis,
      skuRows,
      designRows,
    }));
  }, [designRankings, displayed, filterSummary, periodLabel, setSkuSalesPrintData, showDesigns, sort]);

  useEffect(() => {
    onPrintReady(handlePrint);
  }, [handlePrint, onPrintReady]);

  const sortLabel = SORT_OPTIONS.find((option) => option.id === sort)?.label ?? 'Τεμάχια';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid shrink-0 grid-cols-2 divide-x divide-y divide-slate-100 border-b border-slate-200/70 bg-white sm:grid-cols-5 sm:divide-y-0">
        <SummaryStat label={showDesigns ? 'Παραστάσεις' : 'Παραλλαγές'} value={formatNumber(summary.count)} />
        <SummaryStat label="Τεμάχια" value={formatNumber(summary.quantity)} />
        <SummaryStat label="Έσοδα" value={formatCurrency(summary.revenue)} />
        <SummaryStat label="Κέρδος" value={formatCurrency(summary.profit)} tone={summary.profit < 0 ? 'negative' : 'positive'} />
        <div className="col-span-2 sm:col-span-1">
          <SummaryStat label="Περιθώριο" value={summary.revenue > 0 ? `${formatDecimal(summary.margin, 1)}%` : '—'} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section
          className={`min-h-0 min-w-0 flex-1 flex-col border-slate-200/70 lg:flex lg:max-w-[46%] lg:border-r ${
            mobileView === 'list' ? 'flex' : 'hidden'
          }`}
          aria-label="Κατάταξη"
        >
          <div className="shrink-0 space-y-2.5 border-b border-slate-200/70 bg-white px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    if (e.target.value.trim().length >= 2) setSelectedKey(null);
                  }}
                  placeholder="Αναζήτηση κωδικού…"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-medium text-slate-700 outline-none transition-colors focus:border-emerald-300 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
                />
              </div>
              {onOpenRegistry && (
                <button
                  type="button"
                  onClick={onOpenRegistry}
                  title="Άνοιγμα Μητρώου Κωδικών"
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                >
                  <ExternalLink size={14} />
                  <span className="hidden sm:inline">Μητρώο</span>
                </button>
              )}
            </div>

            {previewComponents.master && (
              <SkuColorizedText
                sku={previewComponents.master}
                suffix={previewComponents.suffix}
                gender={productsMap.get(previewComponents.master)?.gender}
                className="text-sm"
              />
            )}

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl bg-slate-100 p-0.5" role="radiogroup" aria-label="Ταξινόμηση">
                {SORT_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={sort === option.id}
                    onClick={() => setSort(option.id)}
                    className={`rounded-[10px] px-2.5 py-1 text-[11px] font-bold transition-all ${
                      sort === option.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {orionEligible && (forceSkuList || selectedDesignNo != null) && (
                <button
                  type="button"
                  onClick={() => {
                    setForceSkuList(false);
                    setSelectedDesignNo(null);
                    setSelectedKey(null);
                  }}
                  className="rounded-lg bg-fuchsia-50 px-2.5 py-1 text-[11px] font-bold text-fuchsia-700 transition-colors hover:bg-fuchsia-100"
                >
                  Παραστάσεις
                </button>
              )}
              {!showDesigns && displayed.length > 0 && (
                <span className="ml-auto text-[11px] font-semibold text-slate-400">
                  {formatNumber(displayed.length)} παραλλαγές · κατά {sortLabel.toLowerCase()}
                </span>
              )}
            </div>

            {selectedDesign && (
              <div className="flex flex-wrap items-center gap-1 text-xs font-semibold text-slate-500">
                <button
                  type="button"
                  onClick={() => { setSelectedDesignNo(null); setSelectedKey(null); }}
                  className="rounded-md px-1.5 py-0.5 text-fuchsia-700 hover:bg-fuchsia-50"
                >
                  Παραστάσεις
                </button>
                <span className="text-slate-300">/</span>
                <span className="text-slate-800">{selectedDesign.displayName}</span>
              </div>
            )}
          </div>

          <SkuModalFiltersPanel
            facets={facets}
            filters={filters}
            onChange={setFilters}
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
          />

          {showDesigns ? (
            <OrionDesignRankList
              rows={designRankings}
              jewelleryTypes={jewelleryTypes}
              onToggleType={handleToggleJewelleryType}
              onSelectDesign={(designNo) => {
                startTransition(() => {
                  setSelectedDesignNo(designNo);
                  setSelectedKey(null);
                  setQuery('');
                });
              }}
              onShowSkus={() => {
                setForceSkuList(true);
                setSelectedDesignNo(null);
                setJewelleryTypes(new Set());
              }}
            />
          ) : (
            <div ref={listParentRef} className="relative min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
              {isStale && (
                <div className="pointer-events-none sticky top-0 z-10 flex justify-center">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 text-[10px] font-bold text-slate-500 shadow-sm ring-1 ring-slate-200">
                    <Loader2 size={12} className="animate-spin text-emerald-500" />
                    Ενημέρωση…
                  </span>
                </div>
              )}

              {displayed.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-16 text-center">
                  <Search size={20} className="text-slate-300" />
                  <p className="text-sm font-semibold text-slate-400">Δεν βρέθηκαν αποτελέσματα με τα τρέχοντα φίλτρα.</p>
                </div>
              ) : (
                <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
                  {virtualizer.getVirtualItems().map((virtualRow) => {
                    const row = displayed[virtualRow.index];
                    const rowKey = row.key;
                    return (
                      <div
                        key={rowKey}
                        ref={virtualizer.measureElement}
                        data-index={virtualRow.index}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${virtualRow.start}px)`,
                          paddingBottom: 8,
                        }}
                      >
                        <VariantListRow
                          row={row}
                          sort={sort}
                          share={(Math.abs(metricValue(row, sort)) / metricMax) * 100}
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
          )}

          {inspectDetail && (
            <button
              type="button"
              onClick={() => setMobileView('detail')}
              className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200/70 bg-white px-4 py-3 text-left lg:hidden"
            >
              <span className="min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Ανάλυση</span>
                <span className="block truncate text-sm font-black text-slate-900">{inspectDetail.sku}{inspectDetail.variantSuffix}</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white">
                Προβολή <ChevronRight size={14} />
              </span>
            </button>
          )}
        </section>

        <section
          className={`min-h-0 min-w-0 flex-1 flex-col bg-white lg:flex ${mobileView === 'detail' ? 'flex' : 'hidden'}`}
          aria-label="Ανάλυση κωδικού"
        >
          <button
            type="button"
            onClick={() => setMobileView('list')}
            className="flex shrink-0 items-center gap-1.5 border-b border-slate-200/70 px-4 py-2.5 text-xs font-bold text-slate-600 lg:hidden"
          >
            <ChevronLeft size={15} />
            Πίσω στην κατάταξη
          </button>
          <SkuVariantDetailPanel
            detail={inspectDetail}
            gender={inspectGender as Gender | undefined}
            onSelectVariant={handleSelectVariant}
          />
        </section>
      </div>
    </div>
  );
}

export default function TopVariantsAnalyticsModal(props: Props) {
  const contentReady = useDeferredModalMount();
  const printRef = useRef<() => void>(() => {});
  const bindPrint = useCallback((handler: () => void) => {
    printRef.current = handler;
  }, []);

  return (
    <SkuModalShell
      periodLabel={props.periodLabel}
      periodMode={props.periodMode}
      onPeriodChange={props.onPeriodChange}
      onPrint={() => printRef.current()}
      onClose={props.onClose}
    >
      {contentReady ? (
        <TopVariantsModalBody {...props} onPrintReady={bindPrint} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          <div className="min-h-0 flex-1 overflow-hidden lg:max-w-[46%] lg:border-r lg:border-slate-200/70">
            <ModalListSkeleton />
          </div>
          <div className="hidden min-h-0 flex-1 bg-white lg:block">
            <ModalDetailSkeleton />
          </div>
        </div>
      )}
    </SkuModalShell>
  );
}
