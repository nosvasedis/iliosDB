import React, { useState, useMemo, useRef, useEffect, useDeferredValue } from 'react';
import { X, Search, ShoppingCart, Calendar, Tag, Package, User, Hash, Image as ImageIcon, Factory } from 'lucide-react';
import { Order, OrderItem, Product, ProductionBatch, ProductionStage } from '../../types';
import SkuColorizedText from '../SkuColorizedText';
import { splitSkuComponents } from '../../utils/pricingEngine';
import { getOrderStatusClasses, getOrderStatusLabel, getOrderStatusIcon } from '../../features/orders/statusPresentation';
import { formatCurrency } from '../../utils/pricingEngine';
import { getProductionStageLabel } from '../../utils/productionStages';

interface SkuOrderSearchModalProps {
    onClose: () => void;
    orders: Order[];
    products: Product[];
    batches?: ProductionBatch[];
    /** If true, renders a mobile-optimised bottom-sheet layout */
    mobile?: boolean;
}

interface MatchedOrder {
    order: Order;
    matchedItems: { item: OrderItem; totalQty: number }[];
    totalMatchedQty: number;
}

/**
 * Normalises a full SKU (master + suffix) to uppercase for matching.
 */
function normalizeSku(sku: string, variantSuffix?: string): string {
    const full = variantSuffix ? sku + variantSuffix : sku;
    return full.toUpperCase().replace(/\s+/g, '');
}

/**
 * Determines whether an order item matches the typed query.
 *
 * Smart rules:
 * 1. If the query matches only the master portion  → any suffix variant qualifies.
 * 2. If the query extends into the suffix letters  → filter to those specific variants.
 * 3. Matching is prefix-based so DA001D shows DA001DLE, DA001DPR, etc.
 */
function itemMatchesQuery(item: OrderItem, query: string): boolean {
    if (!query) return false;
    const q = query.toUpperCase().replace(/\s+/g, '');
    if (q.length < 2) return false;

    const fullSku = normalizeSku(item.sku, item.variant_suffix);
    const masterSku = item.sku.toUpperCase();

    // prefix match on full SKU (covers master-only and partial-suffix queries)
    if (fullSku.startsWith(q)) return true;

    // prefix match on just the master (so "DA001" also matches "DA001DLE")
    if (q === masterSku) return true;

    return false;
}

export default function SkuOrderSearchModal({
    onClose,
    orders,
    products,
    batches,
    mobile = false,
}: SkuOrderSearchModalProps) {
    const [rawQuery, setRawQuery] = useState('');
    const query = useDeferredValue(rawQuery);
    const inputRef = useRef<HTMLInputElement>(null);

    // Build a products map for gender lookup in SkuColorizedText
    const productsMap = useMemo(
        () => new Map(products.map((p) => [p.sku, p])),
        [products]
    );

    // Focus input on open
    useEffect(() => {
        const t = setTimeout(() => inputRef.current?.focus(), 80);
        return () => clearTimeout(t);
    }, []);

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const results = useMemo<MatchedOrder[]>(() => {
        const q = query.trim();
        if (q.length < 2) return [];

        const matched: MatchedOrder[] = [];

        for (const order of orders) {
            const matchedItems: { item: OrderItem; totalQty: number }[] = [];

            for (const item of order.items) {
                if (itemMatchesQuery(item, q)) {
                    matchedItems.push({ item, totalQty: item.quantity });
                }
            }

            if (matchedItems.length > 0) {
                const totalMatchedQty = matchedItems.reduce((s, { item }) => s + item.quantity, 0);
                matched.push({ order, matchedItems, totalMatchedQty });
            }
        }

        // Sort: most recent first
        return matched.sort(
            (a, b) => new Date(b.order.created_at).getTime() - new Date(a.order.created_at).getTime()
        );
    }, [query, orders]);

    // Parse the query for the colour-coded preview
    const { master: previewMaster, suffix: previewSuffix } = useMemo(() => {
        const q = rawQuery.trim().toUpperCase();
        if (!q) return { master: '', suffix: '' };
        return splitSkuComponents(q);
    }, [rawQuery]);

    const totalOrders = results.length;
    const totalQty = results.reduce((s, r) => s + r.totalMatchedQty, 0);

    const hasQuery = rawQuery.trim().length >= 2;

    // ─── Shared inner content ──────────────────────────────────────────────────

    const inputSection = (
        <div className="relative">
            <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus-within:ring-4 focus-within:ring-emerald-500/20 focus-within:border-emerald-400 transition-all">
                <Search size={18} className="shrink-0 text-slate-400" />
                <input
                    ref={inputRef}
                    type="text"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    autoComplete="off"
                    spellCheck={false}
                    value={rawQuery}
                    onChange={(e) => setRawQuery(e.target.value)}
                    placeholder="π.χ. DA001 ή DA001DLE…"
                    className="flex-1 bg-transparent outline-none text-slate-900 font-bold text-base tracking-wide placeholder:font-normal placeholder:text-slate-400"
                />
                {rawQuery && (
                    <button
                        type="button"
                        onClick={() => { setRawQuery(''); inputRef.current?.focus(); }}
                        className="shrink-0 p-1 rounded-full hover:bg-slate-200 text-slate-400 transition-colors"
                    >
                        <X size={15} />
                    </button>
                )}
            </div>

            {/* Live coloured SKU preview */}
            {previewMaster && (
                <div className="mt-2 flex items-center gap-2 px-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Αναζήτηση:</span>
                    <SkuColorizedText
                        sku={previewMaster}
                        suffix={previewSuffix}
                        gender={productsMap.get(previewMaster)?.gender}
                        className="text-sm"
                        masterClassName="text-slate-800"
                    />
                    {previewSuffix === '' && hasQuery && (
                        <span className="text-[11px] text-slate-400 italic">+ όλες οι παραλλαγές</span>
                    )}
                </div>
            )}
        </div>
    );

    const summaryBar = hasQuery && (
        <div className="flex items-center gap-3 text-xs font-bold text-slate-500">
            {totalOrders > 0 ? (
                <>
                    <span className="flex items-center gap-1.5">
                        <ShoppingCart size={13} className="text-emerald-600" />
                        <span className="text-emerald-700">{totalOrders} παραγγελί{totalOrders === 1 ? 'α' : 'ες'}</span>
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="flex items-center gap-1.5">
                        <Package size={13} />
                        {totalQty} τεμ.
                    </span>
                </>
            ) : (
                <span className="text-slate-400 italic font-medium">Δεν βρέθηκαν παραγγελίες με αυτό το SKU.</span>
            )}
        </div>
    );

    const resultsList = (
        <div className={`overflow-y-auto flex-1 ${mobile ? 'px-4 pb-[max(1rem,env(safe-area-inset-bottom))]' : 'px-6 pb-6'}`}>
            {hasQuery && results.length === 0 && (
                <div className="py-16 flex flex-col items-center justify-center gap-3 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                        <Search size={22} className="text-slate-400" />
                    </div>
                    <p className="text-sm font-bold text-slate-500">Δεν βρέθηκαν παραγγελίες</p>
                    <p className="text-xs text-slate-400 max-w-[220px]">Κανένα SKU δεν ταιριάζει με &ldquo;{rawQuery.trim().toUpperCase()}&rdquo;</p>
                </div>
            )}

            {!hasQuery && (
                <div className="py-16 flex flex-col items-center justify-center gap-3 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center">
                        <Hash size={22} className="text-emerald-500" />
                    </div>
                    <p className="text-sm font-bold text-slate-600">Αναζήτηση SKU σε Παραγγελίες</p>
                    <p className="text-xs text-slate-400 max-w-[240px]">Πληκτρολογήστε έναν κωδικό (τουλάχιστον 2 χαρακτήρες) για να δείτε σε ποιές παραγγελίες εμφανίζεται.</p>
                </div>
            )}

            {results.length > 0 && (
                <div className="space-y-3 mt-1">
                    {results.map(({ order, matchedItems, totalMatchedQty }) => (
                        <OrderResultCard
                            key={order.id}
                            order={order}
                            matchedItems={matchedItems}
                            totalMatchedQty={totalMatchedQty}
                            productsMap={productsMap}
                            allBatches={batches}
                            mobile={mobile}
                        />
                    ))}
                </div>
            )}
        </div>
    );

    // ─── Desktop layout ────────────────────────────────────────────────────────
    if (!mobile) {
        return (
            <div
                className="fixed inset-0 z-[80] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
                onClick={onClose}
            >
                <div
                    className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200 flex flex-col"
                    style={{ maxHeight: 'min(85vh, 780px)' }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
                        <div className="flex items-start justify-between gap-4 mb-4">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                                    <Search size={18} strokeWidth={2.5} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-slate-900">Αναζήτηση SKU σε Παραγγελίες</h2>
                                    <p className="text-xs text-slate-500 mt-0.5">Βρείτε παραγγελίες που περιέχουν συγκεκριμένο κωδικό</p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors shrink-0"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        {inputSection}
                    </div>

                    {/* Summary bar */}
                    {summaryBar && (
                        <div className="px-6 py-2.5 border-b border-slate-100 shrink-0">
                            {summaryBar}
                        </div>
                    )}

                    {resultsList}
                </div>
            </div>
        );
    }

    // ─── Mobile layout (bottom sheet) ─────────────────────────────────────────
    return (
        <div
            className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex flex-col justify-end"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-t-[2rem] flex flex-col animate-in slide-in-from-bottom-full duration-300"
                style={{ maxHeight: '92dvh' }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Drag handle */}
                <div className="flex justify-center pt-3 pb-1 shrink-0">
                    <div className="w-10 h-1 rounded-full bg-slate-200" />
                </div>

                {/* Header */}
                <div className="px-4 pt-1 pb-4 border-b border-slate-100 shrink-0">
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2.5">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                                <Search size={16} strokeWidth={2.5} />
                            </div>
                            <div>
                                <h2 className="text-base font-black text-slate-900 leading-tight">Αναζήτηση SKU</h2>
                                <p className="text-[11px] text-slate-500 font-medium">σε παραγγελίες</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 bg-slate-100 rounded-full text-slate-500 active:scale-95 transition-transform"
                        >
                            <X size={18} />
                        </button>
                    </div>
                    {inputSection}
                </div>

                {/* Summary bar */}
                {summaryBar && (
                    <div className="px-4 py-2.5 border-b border-slate-100 shrink-0">
                        {summaryBar}
                    </div>
                )}

                {resultsList}
            </div>
        </div>
    );
}

// ─── Individual order result card ──────────────────────────────────────────────

interface OrderResultCardProps {
    order: Order;
    matchedItems: { item: OrderItem; totalQty: number }[];
    totalMatchedQty: number;
    productsMap: Map<string, Product>;
    allBatches?: ProductionBatch[];
    mobile: boolean;
}

function OrderResultCard({ order, matchedItems, totalMatchedQty, productsMap, allBatches, mobile }: OrderResultCardProps) {
    const [expanded, setExpanded] = useState(true);

    const dateStr = new Date(order.created_at).toLocaleDateString('el-GR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });

    return (
        <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
            {/* Order header row */}
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors active:bg-slate-100"
            >
                {/* Status badge */}
                <span className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${getOrderStatusClasses(order.status)}`}>
                    {getOrderStatusIcon(order.status, 10)}
                    {getOrderStatusLabel(order.status)}
                </span>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-sm text-slate-900 truncate">{order.customer_name}</span>
                        {order.seller_name && (
                            <span className="text-[10px] font-bold text-slate-400 flex items-center gap-0.5">
                                <User size={9} />{order.seller_name}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[11px] text-slate-400 font-mono">#{order.id.slice(-8)}</span>
                        <span className="text-[11px] text-slate-400 flex items-center gap-1">
                            <Calendar size={9} />{dateStr}
                        </span>
                    </div>
                </div>

                {/* Matched qty chip */}
                <div className="shrink-0 flex flex-col items-end gap-0.5">
                    <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 rounded-full px-2.5 py-0.5 text-xs font-black">
                        <Package size={11} />{totalMatchedQty} τεμ.
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold">
                        {formatCurrency(order.total_price)}
                    </span>
                </div>

                {/* Tags */}
                {order.tags && order.tags.length > 0 && (
                    <div className={`hidden ${mobile ? '' : 'sm:flex'} items-center gap-1 shrink-0`}>
                        {order.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-bold bg-slate-100 text-slate-600 border-slate-200">
                                <Tag size={8} />{tag}
                            </span>
                        ))}
                    </div>
                )}

                {/* Expand chevron */}
                <svg
                    className={`shrink-0 text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                    width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                >
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>

            {/* Expanded matched items */}
            {expanded && (
                <div className="border-t border-slate-100 divide-y divide-slate-50 bg-slate-50/50">
                    {matchedItems.map(({ item }, idx) => {
                        const product = productsMap.get(item.sku);
                        // Find active production batches for this order+item
                        const itemBatches = allBatches?.filter(b =>
                            b.order_id === order.id &&
                            b.sku === item.sku &&
                            (b.variant_suffix || '') === (item.variant_suffix || '')
                        ) || [];
                        // Collect unique stages
                        const stageCounts = new Map<ProductionStage, number>();
                        itemBatches.forEach(b => {
                            stageCounts.set(b.current_stage, (stageCounts.get(b.current_stage) || 0) + b.quantity);
                        });
                        return (
                            <div key={`${item.sku}-${item.variant_suffix ?? ''}-${idx}`} className="px-4 py-2.5 flex items-center gap-3">
                                {/* Product image */}
                                <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                                    {product?.image_url ? (
                                        <img src={product.image_url} alt={item.sku} className="w-full h-full object-cover" />
                                    ) : (
                                        <ImageIcon size={16} className="text-slate-300" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <SkuColorizedText
                                        sku={item.sku}
                                        suffix={item.variant_suffix ?? ''}
                                        gender={product?.gender}
                                        className="text-sm font-black"
                                        masterClassName="text-slate-900"
                                    />
                                    {product?.category && (
                                        <p className="text-[11px] text-slate-400 mt-0.5 truncate">{product.category}</p>
                                    )}
                                    {item.size_info && (
                                        <p className="text-[11px] text-slate-400">Μέγεθος: {item.size_info}</p>
                                    )}
                                    {stageCounts.size > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {Array.from(stageCounts.entries()).map(([stage, qty]) => (
                                                <span key={stage} className="inline-flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                                                    <Factory size={8} />
                                                    {getProductionStageLabel(stage)} ×{qty}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="shrink-0 text-right">
                                    <span className="text-sm font-black text-slate-800">{item.quantity}×</span>
                                    <p className="text-[11px] text-slate-400">{formatCurrency(item.price_at_order)}/τεμ.</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
