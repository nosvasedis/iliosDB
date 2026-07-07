import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  Factory,
  Filter,
  Gem,
  Hash,
  Image as ImageIcon,
  Layers3,
  Package,
  PackageCheck,
  Palette,
  RotateCcw,
  Search,
  ShoppingCart,
  Sparkles,
  StickyNote,
  Tag,
  Truck,
  User,
  X,
} from 'lucide-react';
import { Order, OrderItem, OrderShipment, OrderShipmentItem, Product, ProductionBatch, ProductionStage } from '../../types';
import SkuColorizedText from '../SkuColorizedText';
import { formatCurrency, splitSkuComponents } from '../../utils/pricingEngine';
import { getSkuFinishTextColor, getSkuStoneTextColor } from '../../utils/skuColoring';
import { getOrderStatusClasses, getOrderStatusIcon, getOrderStatusLabel } from '../../features/orders/statusPresentation';
import { getProductionStageLabel, PRODUCTION_STAGE_ORDER_INDEX } from '../../utils/productionStages';
import {
  buildSkuOrderSearchFacets,
  buildSkuOrderSearchResults,
  countActiveSkuOrderSearchFilters,
  createEmptySkuOrderSearchFilters,
  type SkuOrderSearchFacetItem,
  type SkuOrderSearchFilterSelection,
  type SkuOrderSearchMatchedItem,
  type SkuOrderSearchProductionStageSummary,
} from '../../features/orders/skuOrderSearch';

interface SkuOrderSearchModalProps {
  onClose: () => void;
  orders: Order[];
  products: Product[];
  batches?: ProductionBatch[];
  shipments?: OrderShipment[];
  shipmentItems?: OrderShipmentItem[];
  /** If true, renders a mobile-optimised bottom-sheet layout */
  mobile?: boolean;
}

const FILTER_SCHEMES = {
  customers: {
    title: 'text-blue-600',
    active: 'bg-blue-600 text-white ring-blue-600/20',
    inactive: 'bg-blue-50 text-blue-800 border-blue-100 hover:bg-blue-100',
  },
  sellers: {
    title: 'text-amber-700',
    active: 'bg-amber-500 text-white ring-amber-500/20',
    inactive: 'bg-amber-50 text-amber-900 border-amber-100 hover:bg-amber-100',
  },
  tags: {
    title: 'text-violet-600',
    active: 'bg-violet-600 text-white ring-violet-600/20',
    inactive: 'bg-violet-50 text-violet-800 border-violet-100 hover:bg-violet-100',
  },
  statuses: {
    title: 'text-emerald-700',
    active: 'bg-emerald-600 text-white ring-emerald-600/20',
    inactive: 'bg-emerald-50 text-emerald-800 border-emerald-100 hover:bg-emerald-100',
  },
  finishes: {
    title: 'text-orange-600',
    active: 'bg-orange-500 text-white ring-orange-500/20',
    inactive: 'bg-orange-50 text-orange-800 border-orange-100 hover:bg-orange-100',
  },
  stones: {
    title: 'text-cyan-700',
    active: 'bg-cyan-600 text-white ring-cyan-600/20',
    inactive: 'bg-cyan-50 text-cyan-900 border-cyan-100 hover:bg-cyan-100',
  },
} as const;

function getStageBadgeClassName(stage: SkuOrderSearchProductionStageSummary): string {
  if (stage.stage === ProductionStage.Polishing) {
    return stage.pendingDispatch
      ? 'bg-teal-50 text-teal-700 border-teal-200'
      : 'bg-blue-50 text-blue-700 border-blue-200';
  }

  const stageClassMap: Partial<Record<ProductionStage, string>> = {
    [ProductionStage.AwaitingDelivery]: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    [ProductionStage.Waxing]: 'bg-slate-50 text-slate-700 border-slate-200',
    [ProductionStage.Casting]: 'bg-orange-50 text-orange-700 border-orange-200',
    [ProductionStage.Setting]: 'bg-purple-50 text-purple-700 border-purple-200',
    [ProductionStage.Assembly]: 'bg-pink-50 text-pink-700 border-pink-200',
    [ProductionStage.Labeling]: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    [ProductionStage.Ready]: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };

  return stageClassMap[stage.stage] ?? 'bg-slate-50 text-slate-700 border-slate-200';
}

function cloneAndToggleFilter(
  filters: SkuOrderSearchFilterSelection,
  group: keyof SkuOrderSearchFilterSelection,
  key: string,
): SkuOrderSearchFilterSelection {
  const current = filters[group] as Set<string>;
  const next = new Set(current);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return { ...filters, [group]: next };
}

function getFilterSet(filters: SkuOrderSearchFilterSelection, group: keyof SkuOrderSearchFilterSelection): Set<string> {
  return filters[group] as Set<string>;
}

function FilterFacetGroup({
  title,
  icon,
  items,
  selected,
  scheme,
  onToggle,
  formatLabel,
}: {
  title: string;
  icon: React.ReactNode;
  items: SkuOrderSearchFacetItem[];
  selected: Set<string>;
  scheme: typeof FILTER_SCHEMES[keyof typeof FILTER_SCHEMES];
  onToggle: (key: string) => void;
  formatLabel?: (item: SkuOrderSearchFacetItem) => React.ReactNode;
}) {
  if (items.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-2.5">
      <div className="mb-2 flex items-center gap-1.5">
        <span className={scheme.title}>{icon}</span>
        <p className={`text-[10px] font-bold uppercase tracking-wide ${scheme.title}`}>{title}</p>
      </div>
      <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto">
        {items.map((item) => {
          const active = selected.has(item.key);
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onToggle(item.key)}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-all ${
                active ? `${scheme.active} border-transparent shadow-sm ring-1` : scheme.inactive
              }`}
            >
              {formatLabel ? formatLabel(item) : item.label}
              <span className={active ? 'text-white/70' : 'text-slate-400'}>{item.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FinishLabel({ item }: { item: SkuOrderSearchFacetItem }) {
  const code = item.key || 'L';
  return (
    <>
      <span className={`font-black ${getSkuFinishTextColor(item.colorCode || item.key)}`}>{code}</span>
      <span>{item.label}</span>
    </>
  );
}

function StoneLabel({ item }: { item: SkuOrderSearchFacetItem }) {
  return (
    <>
      <span className={`font-black ${getSkuStoneTextColor(item.colorCode || item.key)}`}>{item.key}</span>
      <span>{item.label}</span>
    </>
  );
}

function SuffixBadges({ match }: { match: SkuOrderSearchMatchedItem }) {
  const finishCode = match.finishCode || 'L';
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 rounded-lg border border-orange-100 bg-orange-50 px-2 py-0.5 text-[10px] font-black text-orange-800">
        <Palette size={10} />
        <span className={getSkuFinishTextColor(match.finishCode)}>{finishCode}</span>
        <span className="font-bold">{match.finishName}</span>
      </span>
      {match.stoneCode ? (
        <span className="inline-flex items-center gap-1 rounded-lg border border-cyan-100 bg-cyan-50 px-2 py-0.5 text-[10px] font-black text-cyan-900">
          <Gem size={10} />
          <span className={getSkuStoneTextColor(match.stoneCode)}>{match.stoneCode}</span>
          <span className="font-bold">{match.stoneName}</span>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-lg border border-slate-100 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-400">
          <Gem size={10} />
          χωρίς πέτρα
        </span>
      )}
    </div>
  );
}

function formatShipmentNumbers(match: SkuOrderSearchMatchedItem): string {
  if (match.shipmentAllocations.length === 0) return '';
  return match.shipmentAllocations.map((allocation) => `#${allocation.shipmentNumber}`).join(', ');
}

function formatProductionStageSummary(match: SkuOrderSearchMatchedItem): string {
  if (match.productionStages.length === 0) return '';
  return match.productionStages
    .map((stage) => `${stage.label}${match.productionStages.length > 1 ? ` x${stage.qty}` : ''}`)
    .join(', ');
}

function FulfillmentBadge({ match }: { match: SkuOrderSearchMatchedItem }) {
  const shipmentLabel = formatShipmentNumbers(match);
  const productionStageLabel = formatProductionStageSummary(match);

  if (match.fulfillmentKind === 'fully_delivered') {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg border border-slate-900 bg-slate-800 px-2 py-0.5 text-[10px] font-black text-white shadow-sm">
        <Truck size={10} strokeWidth={2.5} />
        {shipmentLabel ? `Παράδοση ${shipmentLabel}` : 'Παραδόθηκε'}
        <span className="text-white/70">{match.shippedQty}/{match.totalQty}</span>
      </span>
    );
  }

  if (match.fulfillmentKind === 'partially_delivered') {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-900 shadow-sm">
        <PackageCheck size={10} strokeWidth={2.5} />
        {shipmentLabel ? `Μερική Παράδοση ${shipmentLabel}` : 'Μερική Παράδοση'}
        <span className="text-amber-700">{match.shippedQty}/{match.totalQty}</span>
      </span>
    );
  }

  if (match.fulfillmentKind === 'in_production') {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-800">
        <Factory size={10} strokeWidth={2.5} />
        {productionStageLabel ? `Στην παραγωγή: ${productionStageLabel}` : 'Στην παραγωγή'}
        <span className="text-blue-600">{match.inProductionQty}/{match.totalQty}</span>
      </span>
    );
  }

  if (match.remainingQty > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-black text-slate-500">
        <Package size={10} strokeWidth={2.5} />
        Υπόλοιπο προς παραγωγή {match.remainingQty}
      </span>
    );
  }

  return null;
}

export default function SkuOrderSearchModal({
  onClose,
  orders,
  products,
  batches,
  shipments,
  shipmentItems,
  mobile = false,
}: SkuOrderSearchModalProps) {
  const [rawQuery, setRawQuery] = useState('');
  const [filters, setFilters] = useState<SkuOrderSearchFilterSelection>(() => createEmptySkuOrderSearchFilters());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const query = useDeferredValue(rawQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  const productsMap = useMemo(() => new Map(products.map((p) => [p.sku, p])), [products]);

  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const baseResults = useMemo(
    () => buildSkuOrderSearchResults(orders, products, query, createEmptySkuOrderSearchFilters(), { shipments, shipmentItems, batches }),
    [orders, products, query, shipments, shipmentItems, batches],
  );

  const facets = useMemo(() => buildSkuOrderSearchFacets(baseResults), [baseResults]);

  const results = useMemo(
    () => buildSkuOrderSearchResults(orders, products, query, filters, { shipments, shipmentItems, batches }),
    [orders, products, query, filters, shipments, shipmentItems, batches],
  );

  const { master: previewMaster, suffix: previewSuffix } = useMemo(() => {
    const q = rawQuery.trim().toUpperCase();
    if (!q) return { master: '', suffix: '' };
    return splitSkuComponents(q);
  }, [rawQuery]);

  const totalOrders = results.length;
  const totalQty = results.reduce((s, r) => s + r.totalMatchedQty, 0);
  const totalVariants = useMemo(
    () => new Set(results.flatMap((r) => r.matchedItems.map((m) => m.fullSku))).size,
    [results],
  );
  const activeFilters = countActiveSkuOrderSearchFilters(filters);
  const hasQuery = rawQuery.trim().length >= 2;

  const variantSummary = useMemo(() => {
    const rows = new Map<string, { match: SkuOrderSearchMatchedItem; qty: number; orders: number }>();
    results.forEach((result) => {
      const seenInOrder = new Set<string>();
      result.matchedItems.forEach((match) => {
        const row = rows.get(match.fullSku) || { match, qty: 0, orders: 0 };
        row.qty += match.totalQty;
        if (!seenInOrder.has(match.fullSku)) {
          row.orders += 1;
          seenInOrder.add(match.fullSku);
        }
        rows.set(match.fullSku, row);
      });
    });
    return Array.from(rows.values()).sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [results]);

  const toggleFilter = (group: keyof SkuOrderSearchFilterSelection, key: string) => {
    setFilters((current) => cloneAndToggleFilter(current, group, key));
  };

  const inputSection = (
    <div className="space-y-2">
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          type="search"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          value={rawQuery}
          onChange={(e) => setRawQuery(e.target.value)}
          placeholder="π.χ. RN045, RN045D ή RN045DLE"
          className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-11 text-base font-black tracking-wide text-slate-900 outline-none transition-all placeholder:text-sm placeholder:font-medium placeholder:tracking-normal placeholder:text-slate-400 focus:border-emerald-300 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
        />
        {rawQuery && (
          <button
            type="button"
            onClick={() => { setRawQuery(''); inputRef.current?.focus(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
            aria-label="Καθαρισμός αναζήτησης"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {previewMaster && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Αναζήτηση</span>
          <SkuColorizedText
            sku={previewMaster}
            suffix={previewSuffix}
            gender={productsMap.get(previewMaster)?.gender}
            className="text-sm"
            masterClassName="text-slate-800"
          />
          {previewSuffix === '' && hasQuery && (
            <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
              όλες οι παραλλαγές
            </span>
          )}
        </div>
      )}
    </div>
  );

  const filterPanel = hasQuery && (
    <div className="border-b border-slate-100 bg-white">
      <button
        type="button"
        onClick={() => setFiltersOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-5 py-2.5 text-left transition-colors hover:bg-slate-50 sm:px-6"
      >
        <span className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <Filter size={14} className="text-emerald-600" />
          Φίλτρα αποτελεσμάτων
          {activeFilters > 0 && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">
              {activeFilters}
            </span>
          )}
        </span>
        <ChevronDown size={16} className={`text-slate-400 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
      </button>

      {filtersOpen && (
        <div className="space-y-2.5 border-t border-slate-100 px-5 pb-3 pt-2 sm:px-6">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-medium text-slate-400">
              Περιορίστε τις παραγγελίες χωρίς να χάσετε την χρωματική ανάλυση SKU.
            </p>
            <button
              type="button"
              onClick={() => setFilters(createEmptySkuOrderSearchFilters())}
              disabled={activeFilters === 0}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-40"
            >
              <RotateCcw size={11} />
              Καθαρισμός
            </button>
          </div>

          <div className="grid gap-2.5 lg:grid-cols-2">
            <FilterFacetGroup
              title="Πελάτες"
              icon={<User size={12} />}
              items={facets.customers}
              selected={getFilterSet(filters, 'customers')}
              scheme={FILTER_SCHEMES.customers}
              onToggle={(key) => toggleFilter('customers', key)}
            />
            <FilterFacetGroup
              title="Πλασιέ"
              icon={<User size={12} />}
              items={facets.sellers}
              selected={getFilterSet(filters, 'sellers')}
              scheme={FILTER_SCHEMES.sellers}
              onToggle={(key) => toggleFilter('sellers', key)}
            />
            <FilterFacetGroup
              title="Ετικέτες"
              icon={<Tag size={12} />}
              items={facets.tags}
              selected={getFilterSet(filters, 'tags')}
              scheme={FILTER_SCHEMES.tags}
              onToggle={(key) => toggleFilter('tags', key)}
            />
            <FilterFacetGroup
              title="Κατάσταση"
              icon={<ShoppingCart size={12} />}
              items={facets.statuses}
              selected={getFilterSet(filters, 'statuses')}
              scheme={FILTER_SCHEMES.statuses}
              onToggle={(key) => toggleFilter('statuses', key)}
              formatLabel={(item) => getOrderStatusLabel(item.key as Order['status'])}
            />
            <FilterFacetGroup
              title="Μέταλλο / φινίρισμα"
              icon={<Palette size={12} />}
              items={facets.finishes}
              selected={getFilterSet(filters, 'finishes')}
              scheme={FILTER_SCHEMES.finishes}
              onToggle={(key) => toggleFilter('finishes', key)}
              formatLabel={(item) => <FinishLabel item={item} />}
            />
            <FilterFacetGroup
              title="Πέτρες"
              icon={<Gem size={12} />}
              items={facets.stones}
              selected={getFilterSet(filters, 'stones')}
              scheme={FILTER_SCHEMES.stones}
              onToggle={(key) => toggleFilter('stones', key)}
              formatLabel={(item) => <StoneLabel item={item} />}
            />
          </div>
        </div>
      )}
    </div>
  );

  const summaryBar = hasQuery && (
    <div className="space-y-2.5 border-b border-slate-100 bg-slate-50/60 px-5 py-3 sm:px-6">
      {totalOrders > 0 ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-emerald-600/80">Παραγγελίες</p>
              <p className="text-base font-black text-emerald-900">{totalOrders}</p>
            </div>
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-blue-600/80">Τεμάχια</p>
              <p className="text-base font-black text-blue-900">{totalQty}</p>
            </div>
            <div className="rounded-xl border border-cyan-100 bg-cyan-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-cyan-700/80">Παραλλαγές</p>
              <p className="text-base font-black text-cyan-950">{totalVariants}</p>
            </div>
          </div>

          {variantSummary.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {variantSummary.map(({ match, qty, orders: orderCount }) => (
                <span key={match.fullSku} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 shadow-sm">
                  <SkuColorizedText sku={match.item.sku} suffix={match.item.variant_suffix || ''} className="text-[11px]" />
                  <span className="text-slate-300">·</span>
                  <Package size={11} className="text-emerald-600" />
                  {qty}
                  <span className="text-slate-300">/</span>
                  <ShoppingCart size={11} className="text-blue-600" />
                  {orderCount}
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        <span className="text-xs font-medium italic text-slate-400">
          Δεν βρέθηκαν παραγγελίες με αυτό το SKU και τα ενεργά φίλτρα.
        </span>
      )}
    </div>
  );

  const resultsList = (
    <div className={`min-h-0 flex-1 overflow-y-auto ${mobile ? 'px-4 pb-[max(1rem,env(safe-area-inset-bottom))]' : 'px-6 pb-6'}`}>
      {hasQuery && results.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <Search size={22} className="text-slate-400" />
          </div>
          <p className="text-sm font-bold text-slate-500">Δεν βρέθηκαν παραγγελίες</p>
          <p className="max-w-[260px] text-xs text-slate-400">
            Δοκιμάστε master SKU για όλες τις παραλλαγές ή καθαρίστε τα φίλτρα μετάλλου/πέτρας.
          </p>
        </div>
      )}

      {!hasQuery && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50">
            <Hash size={22} className="text-emerald-500" />
          </div>
          <p className="text-sm font-bold text-slate-600">Αναζήτηση SKU σε Παραγγελίες</p>
          <p className="max-w-[270px] text-xs text-slate-400">
            Πληκτρολογήστε master SKU ή πλήρη παραλλαγή για να δείτε πελάτες, ποσότητες, στάδιο παραγωγής, μέταλλο και πέτρα.
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-3 space-y-3">
          {results.map(({ order, matchedItems, totalMatchedQty, uniqueVariantCount }) => (
            <OrderResultCard
              key={order.id}
              order={order}
              matchedItems={matchedItems}
              totalMatchedQty={totalMatchedQty}
              uniqueVariantCount={uniqueVariantCount}
              productsMap={productsMap}
              allBatches={batches}
              mobile={mobile}
            />
          ))}
        </div>
      )}
    </div>
  );

  if (!mobile) {
    return (
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          className="flex w-full max-w-5xl animate-in flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl duration-200 zoom-in-95"
          style={{ maxHeight: 'min(88vh, 860px)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="shrink-0 border-b border-slate-100 bg-white px-6 pb-4 pt-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20">
                  <Sparkles size={19} strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900">Αναζήτηση SKU σε Παραγγελίες</h2>
                  <p className="mt-0.5 text-xs font-medium text-slate-500">
                    Master SKU, παραλλαγές, φινιρίσματα, πέτρες και παραγωγή σε μία εικόνα.
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="shrink-0 rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100"
                aria-label="Κλείσιμο"
              >
                <X size={18} />
              </button>
            </div>
            {inputSection}
          </div>

          {filterPanel}
          {summaryBar}
          {resultsList}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col justify-end bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex animate-in flex-col rounded-t-[2rem] bg-white duration-300 slide-in-from-bottom-full"
        style={{ maxHeight: '92dvh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 justify-center pb-1 pt-3">
          <div className="h-1 w-10 rounded-full bg-slate-200" />
        </div>

        <div className="shrink-0 border-b border-slate-100 px-4 pb-4 pt-1">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                <Sparkles size={16} strokeWidth={2.5} />
              </div>
              <div>
                <h2 className="text-base font-black leading-tight text-slate-900">Αναζήτηση SKU</h2>
                <p className="text-[11px] font-medium text-slate-500">σε παραγγελίες</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-full bg-slate-100 p-2 text-slate-500 transition-transform active:scale-95"
              aria-label="Κλείσιμο"
            >
              <X size={18} />
            </button>
          </div>
          {inputSection}
        </div>

        {filterPanel}
        {summaryBar}
        {resultsList}
      </div>
    </div>
  );
}

interface OrderResultCardProps {
  order: Order;
  matchedItems: SkuOrderSearchMatchedItem[];
  totalMatchedQty: number;
  uniqueVariantCount: number;
  productsMap: Map<string, Product>;
  allBatches?: ProductionBatch[];
  mobile: boolean;
}

function OrderResultCard({
  order,
  matchedItems,
  totalMatchedQty,
  uniqueVariantCount,
  productsMap,
  allBatches,
  mobile,
}: OrderResultCardProps) {
  const [expanded, setExpanded] = useState(true);

  const dateStr = new Date(order.created_at).toLocaleDateString('el-GR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100"
      >
        <div className="flex items-start gap-3">
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${getOrderStatusClasses(order.status)}`}>
            {getOrderStatusIcon(order.status, 10)}
            {getOrderStatusLabel(order.status)}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-black text-slate-900">{order.customer_name}</span>
              {order.seller_name && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                  <User size={9} />
                  {order.seller_name}
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-400">
              <span className="font-mono">#{order.id.slice(-8)}</span>
              <span className="inline-flex items-center gap-1">
                <Calendar size={9} />
                {dateStr}
              </span>
              {order.tags?.slice(0, mobile ? 1 : 3).map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 rounded-md border border-violet-100 bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
                  <Tag size={8} />
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-1.5 text-right">
            <span className="rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-800">
              {totalMatchedQty} τεμ.
            </span>
            <span className="rounded-lg bg-cyan-50 px-2 py-1 text-[11px] font-black text-cyan-900">
              {uniqueVariantCount} SKU
            </span>
            <span className="col-span-2 text-[10px] font-bold text-slate-400">
              {formatCurrency(order.total_price)}
            </span>
          </div>

          <ChevronDown size={16} className={`mt-1 shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {expanded && (
        <div className="divide-y divide-slate-100 border-t border-slate-100 bg-slate-50/60">
          {matchedItems.map((match, idx) => (
            <MatchedItemRow
              key={`${match.item.sku}-${match.item.variant_suffix ?? ''}-${match.item.line_id ?? idx}`}
              order={order}
              match={match}
              product={productsMap.get(match.item.sku)}
              allBatches={allBatches}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MatchedItemRow({
  order,
  match,
  product,
}: {
  order: Order;
  match: SkuOrderSearchMatchedItem;
  product?: Product;
  allBatches?: ProductionBatch[];
}) {
  const item = match.item;

  return (
    <div className="flex gap-3 px-4 py-3">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {product?.image_url ? (
          <img src={product.image_url} alt={item.sku} className="h-full w-full object-cover" />
        ) : (
          <ImageIcon size={18} className="text-slate-300" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <SkuColorizedText
            sku={item.sku}
            suffix={item.variant_suffix ?? ''}
            gender={product?.gender}
            className="text-sm font-black"
            masterClassName="text-slate-900"
          />
          <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">
            <Layers3 size={10} />
            {match.totalQty} τεμ.
          </span>
          <FulfillmentBadge match={match} />
          {item.notes?.trim() && (
            <span className="inline-flex max-w-full items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
              <StickyNote size={10} className="shrink-0" />
              <span className="truncate">{item.notes}</span>
            </span>
          )}
        </div>

        <div className="mt-1.5">
          <SuffixBadges match={match} />
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-400">
          {product?.category && <span>{product.category}</span>}
          {item.size_info && <span>Μέγεθος: {item.size_info}</span>}
          <span>{formatCurrency(item.price_at_order)}/τεμ.</span>
        </div>

        {match.productionStages.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {match.productionStages
              .map((stage) => (
                <span key={stage.key} className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-black ${getStageBadgeClassName(stage)}`}>
                  <Factory size={8} />
                  {stage.label} x{stage.qty}
                </span>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
