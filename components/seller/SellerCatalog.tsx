
import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Product, Gender, ProductVariant, ProductionType } from '../../types';
import { Search, ImageIcon, X, SlidersHorizontal, Camera, PackageOpen, Expand, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatCurrency, getVariantComponents, findProductByScannedCode } from '../../utils/pricingEngine';
import { FINISH_CODES } from '../../constants';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import BarcodeScanner from '../BarcodeScanner';
import { useUI } from '../UIProvider';
import SellerImageLightbox from './SellerImageLightbox';

const CATALOG_PAGE_SIZE = 60;
const PAGE_SIZE = 30;

interface Props { products?: Product[]; }

// ─── Visual constants ─────────────────────────────────────────────────────────
const FINISH_ORDER = ['', 'P', 'X', 'D', 'H'];
const FINISH_COLORS: Record<string, string> = {
    'X': 'bg-amber-100 text-amber-800 border-amber-300',
    'P': 'bg-stone-100 text-stone-700 border-stone-300',
    'D': 'bg-rose-100 text-rose-800 border-rose-300',
    'H': 'bg-cyan-100 text-cyan-800 border-cyan-300',
    '': 'bg-emerald-50 text-emerald-800 border-emerald-200',
};
const FINISH_DOT_ACTIVE: Record<string, string> = {
    '': 'bg-emerald-500', 'P': 'bg-stone-500', 'X': 'bg-amber-500', 'D': 'bg-rose-400', 'H': 'bg-cyan-400',
};
const STONE_TEXT_COLORS: Record<string, string> = {
    'KR': 'text-rose-600', 'QN': 'text-slate-900', 'LA': 'text-blue-600', 'TY': 'text-teal-500',
    'TG': 'text-orange-700', 'IA': 'text-red-700', 'BSU': 'text-slate-800', 'GSU': 'text-emerald-800',
    'RSU': 'text-rose-800', 'MA': 'text-emerald-600', 'FI': 'text-slate-400', 'OP': 'text-indigo-500',
    'NF': 'text-green-700', 'CO': 'text-teal-600', 'TPR': 'text-emerald-500', 'TKO': 'text-rose-600',
    'TMP': 'text-blue-600', 'PCO': 'text-emerald-400', 'MCO': 'text-purple-500', 'PAX': 'text-green-600',
    'MAX': 'text-blue-700', 'KAX': 'text-red-700', 'AI': 'text-slate-600', 'AP': 'text-cyan-600',
    'AM': 'text-teal-700', 'LR': 'text-indigo-700', 'BST': 'text-sky-500', 'MP': 'text-blue-500',
    'LE': 'text-slate-400', 'PR': 'text-green-500', 'KO': 'text-red-500', 'MV': 'text-purple-500',
    'RZ': 'text-pink-500', 'AK': 'text-cyan-400', 'XAL': 'text-stone-500',
    // Extended
    'DI': 'text-cyan-300', 'ZI': 'text-indigo-400', 'AG': 'text-amber-600', 'CZ': 'text-violet-500',
    'PE': 'text-slate-600', 'ON': 'text-gray-900', 'LPA': 'text-blue-400', 'MO': 'text-blue-300',
    'GA': 'text-red-400', 'TO': 'text-orange-400', 'AB': 'text-purple-400', 'ST': 'text-sky-600',
    'SP': 'text-fuchsia-600', 'TU': 'text-teal-400', 'XT': 'text-slate-700', 'OT': 'text-yellow-600',
};

// ─── SKU Color Coding Component ─────────────────────────────────────────────
const SkuColored = ({ sku, suffix, gender }: { sku: string; suffix?: string; gender: Gender }) => {
    const { finish, stone } = getVariantComponents(suffix || '', gender);
    const fColor = FINISH_COLORS[finish.code] || 'text-slate-400';
    const sColor = STONE_TEXT_COLORS[stone.code] || 'text-emerald-500';
    return (
        <span className="font-black text-slate-800 text-[11px] leading-tight truncate">
            <span className="text-slate-900">{sku}</span>
            <span className={fColor}>{finish.code}</span>
            <span className={sColor}>{stone.code}</span>
        </span>
    );
};

// ─── Category grouping ────────────────────────────────────────────────────────
const CATEGORY_PREFIXES = ['Βραχιόλι', 'Κολιέ', 'Σκουλαρίκι', 'Δαχτυλίδι', 'Τσόκερ', 'Σετ', 'Αλυσίδα', 'Τσάντα', 'Καρφίτσα'];
const getCategoryGroup = (category: string): string => {
    for (const prefix of CATEGORY_PREFIXES) {
        if (category.startsWith(prefix)) return prefix;
    }
    return category;
};

// ─── SuffixBadge (desk parity) ────────────────────────────────────────────────
const SuffixBadge = ({ suffix, gender }: { suffix: string; gender: Gender }) => {
    const { finish, stone } = getVariantComponents(suffix, gender);
    const badgeColor = FINISH_COLORS[finish.code] || 'bg-slate-100 text-slate-600 border-slate-200';
    const stoneColor = STONE_TEXT_COLORS[stone.code] || 'text-slate-700';
    const finishLabel = FINISH_CODES[finish.code] ?? (finish.code || 'Λουστρέ');
    const stoneLabel = stone.name || stone.code;
    return (
        <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] font-black ${badgeColor}`}>
            <span>{finishLabel}</span>
            {stone.code && (<><span className="opacity-30">|</span><span className={stoneColor}>{stoneLabel}</span></>)}
        </div>
    );
};

// ─── Catalogue Card with swipe + smart variant ordering ───────────────────────
const GRID_COLS = 3; // keep as const so virtualizer row height is stable

interface CardProps { product: Product; }

const CatalogueCard = React.memo(({ product }: CardProps) => {
    // Smart variant sort: by finish group index, then stone alpha
    const variants = useMemo(() => {
        if (!product.variants || product.variants.length === 0) return [];
        return [...product.variants].sort((a, b) => {
            const fa = getVariantComponents(a.suffix, product.gender).finish.code;
            const fb = getVariantComponents(b.suffix, product.gender).finish.code;
            const ia = FINISH_ORDER.indexOf(fa) >= 0 ? FINISH_ORDER.indexOf(fa) : 99;
            const ib = FINISH_ORDER.indexOf(fb) >= 0 ? FINISH_ORDER.indexOf(fb) : 99;
            if (ia !== ib) return ia - ib;
            // Same finish → sort by stone code alphabetically
            const sa = getVariantComponents(a.suffix, product.gender).stone.code;
            const sb = getVariantComponents(b.suffix, product.gender).stone.code;
            return sa.localeCompare(sb);
        });
    }, [product.variants, product.gender]);

    // Finish groups (for the progress dots)
    const finishGroups = useMemo(() => {
        const groups: { finish: string; indices: number[] }[] = [];
        variants.forEach((v, i) => {
            const f = getVariantComponents(v.suffix, product.gender).finish.code;
            const g = groups.find(g => g.finish === f);
            if (g) g.indices.push(i);
            else groups.push({ finish: f, indices: [i] });
        });
        return groups;
    }, [variants, product.gender]);

    const [viewIndex, setViewIndex] = useState(0);
    const [showLightbox, setShowLightbox] = useState(false);
    const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null);
    const [dragOffset, setDragOffset] = useState(0);
    const touchStartX = useRef<number | null>(null);
    const isAnimating = useRef(false);

    const hasVariants = variants.length > 0;
    const currentVariant: ProductVariant | null = hasVariants ? variants[viewIndex] : null;
    const displaySku = currentVariant ? `${product.sku}${currentVariant.suffix}` : product.sku;
    const displayPrice = currentVariant
        ? (currentVariant.selling_price || product.selling_price || 0)
        : (product.selling_price || 0);
    const basePrice = product.selling_price || 0;
    const stockQty = currentVariant ? (currentVariant.stock_qty || 0) : (product.stock_qty || 0);
    const { finish, stone } = getVariantComponents(currentVariant?.suffix || '', product.gender);

    const goToIndex = useCallback((newIdx: number, dir: 'left' | 'right') => {
        if (isAnimating.current || newIdx === viewIndex) return;
        isAnimating.current = true;
        setSlideDir(dir);
        setTimeout(() => {
            setViewIndex(newIdx);
            setSlideDir(null);
            isAnimating.current = false;
        }, 180);
    }, [viewIndex]);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (!hasVariants || variants.length <= 1) return;
        touchStartX.current = e.touches[0].clientX;
        setDragOffset(0);
    }, [hasVariants, variants.length]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (touchStartX.current === null) return;
        const delta = e.touches[0].clientX - touchStartX.current;
        setDragOffset(Math.max(-90, Math.min(90, delta)));
    }, []);

    const handleTouchEnd = useCallback(() => {
        if (touchStartX.current === null) return;
        const d = dragOffset;
        if (d < -35) goToIndex((viewIndex + 1) % variants.length, 'left');
        else if (d > 35) goToIndex((viewIndex - 1 + variants.length) % variants.length, 'right');
        touchStartX.current = null;
        setDragOffset(0);
    }, [dragOffset, viewIndex, variants.length, goToIndex]);

    // Animated info strip classes
    const infoClass = slideDir === 'left'
        ? '-translate-x-full opacity-0'
        : slideDir === 'right'
            ? 'translate-x-full opacity-0'
            : 'translate-x-0 opacity-100';

    const activeGroupIdx = finishGroups.findIndex(g => g.indices.includes(viewIndex));

    return (
        <>
            {showLightbox && (
                <SellerImageLightbox
                    item={{ product, variantIndex: viewIndex }}
                    onClose={() => setShowLightbox(false)}
                />
            )}
            <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-slate-100 flex flex-col relative group select-none">

                {/* ── Image + touch zone ─────────────────────────────── */}
                <div
                    className="relative aspect-square bg-slate-50 overflow-hidden"
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    style={{ transform: `translateX(${dragOffset * 0.25}px)`, transition: dragOffset === 0 ? 'transform 0.2s ease-out' : 'none' }}
                >
                    {product.image_url ? (
                        <img src={product.image_url} className="w-full h-full object-cover" alt={displaySku} draggable={false} loading="lazy" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                            <ImageIcon size={20} />
                        </div>
                    )}

                    {/* Swipe direction hint during drag */}
                    {Math.abs(dragOffset) > 20 && variants.length > 1 && (
                        <div className={`absolute top-1/2 -translate-y-1/2 z-30 ${dragOffset > 0 ? 'left-2' : 'right-2'}`}>
                            <div className="bg-white/80 backdrop-blur-sm rounded-full p-1 shadow">
                                {dragOffset > 0
                                    ? <ChevronLeft size={12} className="text-slate-700" />
                                    : <ChevronRight size={12} className="text-slate-700" />
                                }
                            </div>
                        </div>
                    )}

                    {/* Stock pill */}
                    <div className="absolute top-1 left-1 z-20 pointer-events-none">
                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md shadow-sm backdrop-blur-md ${stockQty > 0 ? 'bg-emerald-500/90 text-white' : 'bg-red-500/90 text-white'}`}>
                            {stockQty}
                        </span>
                    </div>

                    {/* Variant counter */}
                    {hasVariants && variants.length > 1 && (
                        <div className="absolute top-1 right-1 z-20 pointer-events-none">
                            <span className="bg-black/50 backdrop-blur-md text-white text-[7px] font-black px-1.5 py-0.5 rounded-full">
                                {viewIndex + 1}/{variants.length}
                            </span>
                        </div>
                    )}

                    {/* Expand button */}
                    <button
                        onClick={(e) => { e.stopPropagation(); setShowLightbox(true); }}
                        className="absolute bottom-1.5 left-1/2 -translate-x-1/2 z-30 bg-black/40 hover:bg-black/65 backdrop-blur-sm text-white rounded-full p-1.5 transition-all active:scale-90 opacity-0 group-hover:opacity-100 focus:opacity-100"
                    >
                        <Expand size={11} />
                    </button>
                </div>

                {/* ── Animated info strip ─────────────────────────────── */}
                <div className="px-1.5 pt-1 pb-0.5 overflow-hidden">
                    <div className={`flex flex-col gap-0.5 transition-all duration-[180ms] ease-out ${infoClass}`}>
                        {/* SKU */}
                        <SkuColored sku={product.sku} suffix={currentVariant?.suffix || ''} gender={product.gender} />

                        {/* Finish badge */}
                        {currentVariant && (
                            <SuffixBadge suffix={currentVariant.suffix} gender={product.gender} />
                        )}

                        {/* Price row */}
                        <div className="flex justify-between items-end mt-0.5">
                            <span className="text-[8px] text-slate-400 truncate max-w-[50%]">{product.category}</span>
                            <div className="text-right leading-none">
                                <div className="font-black text-[#060b00] text-base">
                                    {displayPrice > 0 ? formatCurrency(displayPrice) : '—'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Finish group progress dots ──────────────────────── */}
                {finishGroups.length > 1 && (
                    <div className="px-1.5 pb-1.5 flex gap-1">
                        {finishGroups.map((g, gi) => (
                            <button
                                key={g.finish}
                                onClick={() => goToIndex(g.indices[0], gi > activeGroupIdx ? 'left' : 'right')}
                                className={`flex-1 h-1.5 rounded-full transition-all duration-300 ${gi === activeGroupIdx ? (FINISH_DOT_ACTIVE[g.finish] || 'bg-slate-700') : 'bg-slate-200 hover:bg-slate-300'}`}
                            />
                        ))}
                    </div>
                )}
            </div>
        </>
    );
});
CatalogueCard.displayName = 'CatalogueCard';

// ─── Filter chip ──────────────────────────────────────────────────────────────
const FilterChip = ({ label, onClear }: { label: string; onClear: () => void }) => (
    <div className="flex items-center gap-1 bg-[#060b00] text-white text-[10px] font-black px-2.5 py-1 rounded-full shadow-sm shrink-0">
        {label}
        <button onClick={onClear} className="ml-0.5 hover:bg-white/20 rounded-full p-0.5"><X size={10} /></button>
    </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SellerCatalog({ products: productsProp }: Props) {
    const { data: collections } = useQuery({ queryKey: ['collections'], queryFn: api.getCollections });
    const { showToast } = useUI();

    const {
        data: catalogData,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading: catalogLoading
    } = useInfiniteQuery({
        queryKey: ['productsCatalog'],
        queryFn: ({ pageParam = 0 }) => api.getProductsCatalog({ limit: CATALOG_PAGE_SIZE, offset: pageParam }),
        getNextPageParam: (lastPage, allPages) => lastPage.hasMore ? allPages.length * CATALOG_PAGE_SIZE : undefined,
        initialPageParam: 0,
        enabled: productsProp == null
    });

    const catalogProducts = useMemo(() => catalogData?.pages.flatMap(p => p.products) ?? [], [catalogData]);
    const products = productsProp ?? catalogProducts;

    // Auto-load remaining catalog pages in background with a throttled delay so the
    // UI thread stays free between fetches (critical for older/slower mobile devices).
    useEffect(() => {
        if (productsProp != null || !hasNextPage || isFetchingNextPage) return;
        const timer = setTimeout(() => {
            fetchNextPage();
        }, 800);
        return () => clearTimeout(timer);
    }, [productsProp, hasNextPage, isFetchingNextPage, fetchNextPage]);

    // ── Filter states ────────────────────────────────────────────────────────
    const [search, setSearch] = useState('');
    const [selectedGroup, setSelectedGroup] = useState<string>('All');
    const [selectedGender, setSelectedGender] = useState<'All' | Gender>('All');
    const [selectedCollection, setSelectedCollection] = useState<number | 'All'>('All');
    const [selectedFinish, setSelectedFinish] = useState<string | null>(null);
    const [selectedStone, setSelectedStone] = useState<string | null>(null);
    const [stoneFilterMode, setStoneFilterMode] = useState<'All' | 'with' | 'without'>('All');
    const [selectedProductionType, setSelectedProductionType] = useState<'All' | ProductionType>('All');
    const [sortBy, setSortBy] = useState<'sku' | 'created_at'>('sku');
    const [onlyInStock, setOnlyInStock] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [showScanner, setShowScanner] = useState(false);
    const [currentPage, setCurrentPage] = useState(0);

    // Reset pagination when any filter changes
    useEffect(() => {
        setCurrentPage(0);
    }, [search, selectedGroup, selectedGender, selectedCollection, selectedFinish, selectedStone, stoneFilterMode, selectedProductionType, onlyInStock, sortBy]);

    const scrollRef = useRef<HTMLDivElement>(null);

    // ── Derived filter options ───────────────────────────────────────────────
    const sellable = useMemo(() => products.filter(p => !p.is_component), [products]);

    const categoryGroups = useMemo(() => {
        const groups = new Set(sellable.map(p => getCategoryGroup(p.category)));
        return ['All', ...Array.from(groups).sort()];
    }, [sellable]);

    const availableFinishes = useMemo(() => {
        const set = new Set<string>();
        sellable.forEach(p => {
            if (p.variants && p.variants.length > 0) {
                p.variants.forEach(v => {
                    const f = getVariantComponents(v.suffix, p.gender).finish.code;
                    set.add(f);
                });
            }
        });
        return FINISH_ORDER.filter(f => set.has(f));
    }, [sellable]);

    const availableStones = useMemo(() => {
        const map = new Map<string, { name: string; count: number }>();
        sellable.forEach(p => {
            if (p.variants && p.variants.length > 0) {
                p.variants.forEach(v => {
                    const stone = getVariantComponents(v.suffix, p.gender).stone;
                    if (stone.code) {
                        const name = stone.name || stone.code;
                        const existing = map.get(stone.code);
                        if (!existing) map.set(stone.code, { name, count: 1 });
                        else map.set(stone.code, { name: existing.name, count: existing.count + 1 });
                    }
                });
            }
        });
        return Array.from(map.entries())
            .sort((a, b) => b[1].count - a[1].count)
            .map(([code, { name }]) => ({ code, name }));
    }, [sellable]);

    // ── Filtered products ────────────────────────────────────────────────────
    const filteredProducts = useMemo(() => {
        const hasAnyStone = (p: Product) => p.variants?.some(v => !!getVariantComponents(v.suffix, p.gender).stone.code);
        return sellable.filter(p => {
            const matchSearch = !search || p.sku.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase());
            const matchGroup = selectedGroup === 'All' || getCategoryGroup(p.category) === selectedGroup;
            const matchGender = selectedGender === 'All' || p.gender === selectedGender;
            const matchCollection = selectedCollection === 'All' || p.collections?.includes(selectedCollection as number);
            const matchFinish = !selectedFinish || (p.variants && p.variants.some(v => getVariantComponents(v.suffix, p.gender).finish.code === selectedFinish));
            const matchStoneSpecific = !selectedStone || (p.variants && p.variants.some(v => getVariantComponents(v.suffix, p.gender).stone.code === selectedStone));
            const matchStoneMode = stoneFilterMode === 'All' || (stoneFilterMode === 'with' && hasAnyStone(p)) || (stoneFilterMode === 'without' && !hasAnyStone(p));
            const matchProductionType = selectedProductionType === 'All' || p.production_type === selectedProductionType;
            const totalStock = (p.stock_qty || 0) + (p.variants?.reduce((s, v) => s + (v.stock_qty || 0), 0) || 0);
            const matchStock = !onlyInStock || totalStock > 0;
            return matchSearch && matchGroup && matchGender && matchCollection && matchFinish && matchStoneSpecific && matchStoneMode && matchProductionType && matchStock;
        }).sort((a, b) => {
            if (sortBy === 'created_at') {
                const ta = a.created_at || '';
                const tb = b.created_at || '';
                return tb.localeCompare(ta);
            }
            return a.sku.localeCompare(b.sku, undefined, { numeric: true, sensitivity: 'base' });
        });
    }, [sellable, search, selectedGroup, selectedGender, selectedCollection, selectedFinish, selectedStone, stoneFilterMode, selectedProductionType, onlyInStock, sortBy]);

    // ── Pagination ───────────────────────────────────────────────────────────
    const totalPages = Math.ceil(filteredProducts.length / PAGE_SIZE);

    const paginatedProducts = useMemo(() => {
        const start = currentPage * PAGE_SIZE;
        return filteredProducts.slice(start, start + PAGE_SIZE);
    }, [filteredProducts, currentPage]);

    // ── Active filter count ──────────────────────────────────────────────────
    const activeCount = [selectedGender !== 'All', selectedCollection !== 'All', selectedFinish !== null, selectedStone !== null, stoneFilterMode !== 'All', selectedProductionType !== 'All', onlyInStock].filter(Boolean).length;

    const clearAll = () => {
        setSelectedGender('All');
        setSelectedCollection('All');
        setSelectedFinish(null);
        setSelectedStone(null);
        setStoneFilterMode('All');
        setSelectedProductionType('All');
        setOnlyInStock(false);
    };

    const handleScan = (code: string) => {
        const match = findProductByScannedCode(code, products);
        if (match) {
            setSearch(match.product.sku + (match.variant?.suffix || ''));
            setShowScanner(false);
        } else {
            showToast(`Κωδικός ${code} δεν βρέθηκε.`, 'error');
        }
    };

    const GENDER_OPTS = [{ v: 'All', l: 'Όλα' }, { v: Gender.Women, l: 'Γυναικεία' }, { v: Gender.Men, l: 'Ανδρικά' }, { v: Gender.Unisex, l: 'Unisex' }];

    if (productsProp == null && catalogLoading && catalogProducts.length === 0) {
        return (
            <div className="flex flex-col h-full bg-slate-50 items-center justify-center gap-4">
                <div className="w-10 h-10 border-2 border-[#060b00] border-t-transparent rounded-full animate-spin" />
                <p className="text-sm font-bold text-slate-500">Φόρτωση καταλόγου...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-50 relative">

            {/* ── Sticky Header ─────────────────────────────────────────── */}
            <div className="sticky top-0 z-20 bg-white/98 backdrop-blur-xl border-b border-slate-200 shadow-sm px-3 pt-3 pb-2 space-y-2">

                {/* Row 1: Search + scan + filter toggle */}
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                        <input type="text" placeholder="Αναζήτηση κωδικού, κατηγορίας..." value={search} onChange={e => { setSearch(e.target.value); setSelectedGroup('All'); }}
                            className="w-full pl-8 pr-7 p-2.5 bg-slate-100 focus:bg-white focus:border-slate-300 border border-transparent rounded-xl outline-none font-bold text-sm text-slate-900 transition-all placeholder:font-medium placeholder:text-slate-400" />
                        {search && (
                            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 bg-slate-300 rounded-full p-0.5">
                                <X size={11} className="text-slate-600" />
                            </button>
                        )}
                    </div>
                    <button onClick={() => setShowScanner(true)} className="bg-slate-100 text-slate-600 p-2.5 rounded-xl hover:bg-slate-200 transition-colors shrink-0"><Camera size={18} /></button>
                    <button onClick={() => setShowFilters(v => !v)} className={`relative p-2.5 rounded-xl border transition-colors shrink-0 ${(showFilters || activeCount > 0) ? 'bg-[#060b00] text-white border-[#060b00]' : 'bg-slate-100 text-slate-600 border-transparent hover:bg-slate-200'}`}>
                        <SlidersHorizontal size={18} />
                        {activeCount > 0 && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 text-[#060b00] text-[9px] font-black rounded-full flex items-center justify-center">{activeCount}</span>
                        )}
                    </button>
                </div>

                {/* Expandable filter panel */}
                {showFilters && (
                    <div className="space-y-3 py-1 animate-in slide-in-from-top-2 duration-200">

                        {/* Gender */}
                        <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Φύλο</p>
                            <div className="flex gap-1.5 flex-wrap">
                                {GENDER_OPTS.map(g => (
                                    <button key={g.v} onClick={() => setSelectedGender(g.v as any)}
                                        className={`px-3 py-1.5 rounded-lg text-[11px] font-black border transition-all ${selectedGender === g.v ? 'bg-[#060b00] text-white border-[#060b00] shadow-sm' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                                        {g.l}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Finish (metal) filter */}
                        {availableFinishes.length > 0 && (
                            <div>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Μέταλλο</p>
                                <div className="flex gap-1.5 flex-wrap">
                                    {availableFinishes.map(f => (
                                        <button key={f} onClick={() => setSelectedFinish(selectedFinish === f ? null : f)}
                                            className={`px-3 py-1.5 rounded-lg text-[11px] font-black border transition-all ${selectedFinish === f ? 'ring-2 ring-offset-1 ' + (FINISH_COLORS[f] || '') + ' ring-slate-600' : (FINISH_COLORS[f] || 'bg-slate-50 text-slate-500 border-slate-200')}`}>
                                            {FINISH_CODES[f] ?? f}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Stone: With/Without + specific stones */}
                        <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Πέτρα</p>
                            <div className="flex gap-1.5 flex-wrap mb-2">
                                {(['All', 'with', 'without'] as const).map(mode => (
                                    <button key={mode} onClick={() => setStoneFilterMode(mode === stoneFilterMode ? 'All' : mode)}
                                        className={`px-3 py-1.5 rounded-lg text-[11px] font-black border transition-all ${stoneFilterMode === mode ? 'bg-[#060b00] text-white border-[#060b00]' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                                        {mode === 'All' ? 'Όλα' : mode === 'with' ? 'Με πέτρες' : 'Χωρίς πέτρες'}
                                    </button>
                                ))}
                            </div>
                            {availableStones.length > 0 && (
                                <div className="flex gap-1.5 flex-wrap max-h-24 overflow-y-auto">
                                    {availableStones.map(s => (
                                        <button key={s.code} onClick={() => setSelectedStone(selectedStone === s.code ? null : s.code)}
                                            className={`px-3 py-1.5 rounded-lg text-[11px] font-black border transition-all ${selectedStone === s.code ? 'bg-[#060b00] text-white border-[#060b00]' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                                            <span className={selectedStone === s.code ? 'text-white' : (STONE_TEXT_COLORS[s.code] || 'text-slate-600')}>{s.name}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Production type */}
                        <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Τύπος παραγωγής</p>
                            <div className="flex gap-1.5 flex-wrap">
                                {(['All', ProductionType.InHouse, ProductionType.Imported] as const).map(pt => (
                                    <button key={pt} onClick={() => setSelectedProductionType(selectedProductionType === pt ? 'All' : pt)}
                                        className={`px-3 py-1.5 rounded-lg text-[11px] font-black border transition-all ${selectedProductionType === pt ? 'bg-[#060b00] text-white border-[#060b00]' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                                        {pt === 'All' ? 'Όλα' : pt === ProductionType.InHouse ? 'Εγχώρια' : 'Εισαγόμενα'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Sort */}
                        <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Ταξινόμηση</p>
                            <div className="flex gap-1.5 flex-wrap">
                                <button onClick={() => setSortBy('sku')} className={`px-3 py-1.5 rounded-lg text-[11px] font-black border transition-all ${sortBy === 'sku' ? 'bg-[#060b00] text-white border-[#060b00]' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                                    Κωδικός
                                </button>
                                <button onClick={() => setSortBy('created_at')} className={`px-3 py-1.5 rounded-lg text-[11px] font-black border transition-all ${sortBy === 'created_at' ? 'bg-[#060b00] text-white border-[#060b00]' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                                    Νεότερα
                                </button>
                            </div>
                        </div>

                        {/* Collections */}
                        {collections && collections.length > 0 && (
                            <div>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Συλλογή</p>
                                <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide -mx-1 px-1">
                                    <button onClick={() => setSelectedCollection('All')}
                                        className={`px-3 py-1.5 rounded-lg text-[11px] font-black border whitespace-nowrap transition-all ${selectedCollection === 'All' ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                        Όλες
                                    </button>
                                    {collections.map(col => (
                                        <button key={col.id} onClick={() => setSelectedCollection(col.id)}
                                            className={`px-3 py-1.5 rounded-lg text-[11px] font-black border whitespace-nowrap transition-all ${selectedCollection === col.id ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                            {col.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* In stock toggle */}
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[11px] font-black text-slate-700">Μόνο Διαθέσιμα</p>
                                <p className="text-[9px] text-slate-400">Προϊόντα με στοκ &gt; 0</p>
                            </div>
                            <button onClick={() => setOnlyInStock(v => !v)} className={`w-11 h-6 rounded-full transition-colors duration-200 relative ${onlyInStock ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                                <div className={`w-4 h-4 bg-white rounded-full shadow-md absolute top-1 transition-all duration-200 ${onlyInStock ? 'left-6' : 'left-1'}`} />
                            </button>
                        </div>

                        {activeCount > 0 && (
                            <button onClick={clearAll} className="w-full py-2 text-[11px] font-black text-red-500 border border-red-200 rounded-xl bg-red-50 hover:bg-red-100 transition-colors">
                                Καθαρισμός Φίλτρων ({activeCount})
                            </button>
                        )}
                    </div>
                )}

                {/* Category group chips - always visible */}
                <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-3 px-3 scrollbar-hide">
                    {categoryGroups.map(g => (
                        <button key={g} onClick={() => setSelectedGroup(g)}
                            className={`px-3 py-1.5 rounded-full text-[10px] font-black whitespace-nowrap border transition-all ${selectedGroup === g ? 'bg-slate-800 text-white border-slate-800 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                            {g === 'All' ? 'Όλα' : g}
                        </button>
                    ))}
                </div>

                {/* Active chips row */}
                {activeCount > 0 && !showFilters && (
                    <div className="flex gap-2 flex-wrap animate-in slide-in-from-top-1">
                        {selectedGender !== 'All' && <FilterChip label={GENDER_OPTS.find(g => g.v === selectedGender)?.l || ''} onClear={() => setSelectedGender('All')} />}
                        {selectedFinish !== null && <FilterChip label={FINISH_CODES[selectedFinish] ?? selectedFinish} onClear={() => setSelectedFinish(null)} />}
                        {selectedStone !== null && <FilterChip label={availableStones.find(x => x.code === selectedStone)?.name ?? selectedStone} onClear={() => setSelectedStone(null)} />}
                        {stoneFilterMode !== 'All' && <FilterChip label={stoneFilterMode === 'with' ? 'Με πέτρες' : 'Χωρίς πέτρες'} onClear={() => setStoneFilterMode('All')} />}
                        {selectedProductionType !== 'All' && <FilterChip label={selectedProductionType === ProductionType.InHouse ? 'Εγχώρια' : 'Εισαγόμενα'} onClear={() => setSelectedProductionType('All')} />}
                        {selectedCollection !== 'All' && <FilterChip label={collections?.find(c => c.id === selectedCollection)?.name || 'Συλλογή'} onClear={() => setSelectedCollection('All')} />}
                        {onlyInStock && <FilterChip label="Διαθέσιμα" onClear={() => setOnlyInStock(false)} />}
                    </div>
                )}
            </div>

            {/* Results count */}
            <div className="px-3 pt-2 pb-1 shrink-0">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {filteredProducts.length} προϊόντα
                    {productsProp == null && isFetchingNextPage && (
                        <span className="ml-1.5 text-emerald-600 font-normal">(φόρτωση...)</span>
                    )}
                </span>
            </div>

            {/* ── Paginated product grid ──────────────────────────────── */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-6">
                {filteredProducts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
                        <PackageOpen size={40} className="opacity-20" />
                        <p className="font-black text-sm">Δεν βρέθηκαν προϊόντα.</p>
                        {activeCount > 0 && <button onClick={clearAll} className="text-xs font-black text-[#060b00] underline">Καθαρισμός φίλτρων</button>}
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-3 gap-2 pb-4">
                            {paginatedProducts.map(p => (
                                <CatalogueCard key={p.sku} product={p} />
                            ))}
                        </div>

                        {/* Pagination Controls */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-center gap-4 py-6 bg-white rounded-2xl shadow-sm border border-slate-100 mt-2 mb-4">
                                <button
                                    onClick={() => {
                                        setCurrentPage(p => Math.max(0, p - 1));
                                        scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                                    }}
                                    disabled={currentPage === 0}
                                    className="p-2 rounded-xl border border-slate-200 text-slate-600 disabled:opacity-30 hover:bg-slate-50 transition-colors"
                                >
                                    <ChevronLeft size={20} />
                                </button>

                                <span className="text-sm font-black text-slate-700">
                                    Σελίδα {currentPage + 1} / {totalPages}
                                </span>

                                <button
                                    onClick={() => {
                                        setCurrentPage(p => Math.min(totalPages - 1, p + 1));
                                        scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                                    }}
                                    disabled={currentPage === totalPages - 1}
                                    className="p-2 rounded-xl border border-slate-200 text-slate-600 disabled:opacity-30 hover:bg-slate-50 transition-colors"
                                >
                                    <ChevronRight size={20} />
                                </button>
                            </div>
                        )}

                        {/* Loading More Background Catalog Indicator */}
                        {productsProp == null && hasNextPage && isFetchingNextPage && (
                            <div className="py-2 flex justify-center">
                                <span className="text-xs font-bold text-emerald-600 flex items-center gap-1.5 bg-emerald-50 px-3 py-1.5 rounded-full">
                                    <span className="w-3 h-3 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                                    Συγχρονισμός καταλόγου...
                                </span>
                            </div>
                        )}
                    </>
                )}
            </div>

            {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
        </div>
    );
}
