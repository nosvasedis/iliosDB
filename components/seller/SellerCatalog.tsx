
import React, { useState, useMemo } from 'react';
import { Product, Gender } from '../../types';
import {
    Search, ImageIcon, X, SlidersHorizontal, Camera, PackageOpen
} from 'lucide-react';
import { formatCurrency, getVariantComponents, findProductByScannedCode } from '../../utils/pricingEngine';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import BarcodeScanner from '../BarcodeScanner';
import { useUI } from '../UIProvider';



interface Props {
    products: Product[];
}

// ─── Visual constants (mirror desktop) ───────────────────────────────────────
const FINISH_COLORS: Record<string, string> = {
    'X': 'bg-amber-100 text-amber-800 border-amber-300',
    'P': 'bg-stone-100 text-stone-700 border-stone-300',
    'D': 'bg-orange-100 text-orange-800 border-orange-300',
    'H': 'bg-cyan-100 text-cyan-800 border-cyan-300',
    '': 'bg-emerald-50 text-emerald-800 border-emerald-200',
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
    'RZ': 'text-pink-500', 'AK': 'text-cyan-400', 'XAL': 'text-stone-500'
};

// ─── Suffix Badge (matches desktop SuffixBadge) ───────────────────────────────
const SuffixBadge = ({ suffix, gender }: { suffix: string; gender: Gender }) => {
    const { finish, stone } = getVariantComponents(suffix, gender);
    const badgeColor = FINISH_COLORS[finish.code] || 'bg-slate-100 text-slate-600 border-slate-200';
    const stoneColor = STONE_TEXT_COLORS[stone.code] || 'text-slate-700';
    const finishLabel = (finish.code === '' || !finish.code) ? 'Λουστρέ' : finish.code;
    return (
        <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] font-black ${badgeColor}`}>
            <span>{finishLabel}</span>
            {stone.code && (
                <>
                    <span className="opacity-30">|</span>
                    <span className={stoneColor}>{stone.code}</span>
                </>
            )}
        </div>
    );
};

// ─── Gender options ───────────────────────────────────────────────────────────
const GENDER_OPTIONS = [
    { value: 'All', label: 'Όλα' },
    { value: Gender.Women, label: 'Γυναικεία' },
    { value: Gender.Men, label: 'Ανδρικά' },
    { value: Gender.Unisex, label: 'Unisex' },
];

// ─── Catalogue Card with variant cycling ─────────────────────────────────────
const CatalogueCard: React.FC<{ product: Product }> = ({ product }) => {
    const [viewIndex, setViewIndex] = useState(0);

    const variants = useMemo(() => {
        if (!product.variants || product.variants.length === 0) return [];
        return [...product.variants].sort((a, b) => {
            const priority = (s: string) => {
                if (s === '') return 0;
                if (s === 'P') return 1;
                if (s === 'D') return 2;
                if (s === 'X') return 3;
                if (s === 'H') return 4;
                return 5;
            };
            return priority(a.suffix) - priority(b.suffix);
        });
    }, [product.variants]);

    const hasVariants = variants.length > 0;
    const currentVariant = hasVariants ? variants[viewIndex % variants.length] : null;

    const displaySku = currentVariant ? `${product.sku}${currentVariant.suffix}` : product.sku;
    const displayPrice = currentVariant
        ? (currentVariant.selling_price || product.selling_price || 0)
        : (product.selling_price || 0);
    const stockQty = currentVariant ? currentVariant.stock_qty : product.stock_qty;

    const handleNext = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (hasVariants) setViewIndex(prev => (prev + 1) % variants.length);
    };
    const handlePrev = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (hasVariants) setViewIndex(prev => (prev - 1 + variants.length) % variants.length);
    };

    return (
        <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-slate-200 flex flex-col h-full relative group active:scale-[0.97] transition-transform duration-150">
            {/* Image Section */}
            <div className="relative aspect-square bg-slate-50 overflow-hidden">
                {product.image_url ? (
                    <img src={product.image_url} className="w-full h-full object-cover" alt={displaySku} />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <ImageIcon size={20} />
                    </div>
                )}

                {/* Invisible Touch Zones for Cycling */}
                {hasVariants && (
                    <>
                        <div className="absolute inset-y-0 left-0 w-1/2 z-10" onClick={handlePrev} />
                        <div className="absolute inset-y-0 right-0 w-1/2 z-10" onClick={handleNext} />
                    </>
                )}

                {/* Stock badge */}
                <div className="absolute top-1 left-1 pointer-events-none z-20">
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md shadow-sm backdrop-blur-md ${stockQty > 0 ? 'bg-emerald-500/90 text-white' : 'bg-red-500/90 text-white'}`}>
                        {stockQty > 0 ? stockQty : '0'}
                    </span>
                </div>

                {/* Variant counter */}
                {hasVariants && variants.length > 1 && (
                    <div className="absolute top-1 right-1 pointer-events-none z-20">
                        <span className="bg-black/50 backdrop-blur-md text-white text-[8px] font-black px-1.5 py-0.5 rounded-full">
                            {viewIndex % variants.length + 1}/{variants.length}
                        </span>
                    </div>
                )}
            </div>

            {/* Info section */}
            <div className="p-1.5 flex flex-col gap-0.5">
                <h3 className="font-black text-slate-800 text-[11px] leading-tight truncate">{displaySku}</h3>
                {currentVariant && (
                    <SuffixBadge suffix={currentVariant.suffix} gender={product.gender} />
                )}
                <div className="flex justify-between items-center mt-0.5">
                    <span className="text-[9px] text-slate-400 truncate max-w-[55%] leading-tight">{product.category}</span>
                    <span className="font-black text-[#060b00] text-xs leading-none">
                        {displayPrice > 0 ? formatCurrency(displayPrice) : '-'}
                    </span>
                </div>
            </div>
        </div>
    );
};

// ─── Active Filter Chip ───────────────────────────────────────────────────────
const FilterChip = ({ label, onClear }: { label: string; onClear: () => void }) => (
    <div className="flex items-center gap-1 bg-[#060b00] text-white text-[10px] font-black px-2.5 py-1 rounded-full shadow-sm">
        {label}
        <button onClick={onClear} className="ml-0.5 hover:bg-white/20 rounded-full p-0.5">
            <X size={10} />
        </button>
    </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SellerCatalog({ products }: Props) {
    const { data: collections } = useQuery({ queryKey: ['collections'], queryFn: api.getCollections });
    const { showToast } = useUI();

    // ── Filter state ─────────────────────────────────────────────────────────
    const [search, setSearch] = useState('');
    const [selectedGender, setSelectedGender] = useState<'All' | Gender>('All');
    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [selectedCollection, setSelectedCollection] = useState<number | 'All'>('All');
    const [onlyInStock, setOnlyInStock] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [showScanner, setShowScanner] = useState(false);

    // ── Derived data ─────────────────────────────────────────────────────────
    const categories = useMemo(() => {
        const cats = new Set(products.filter(p => !p.is_component).map(p => p.category));
        return ['All', ...Array.from(cats).sort()];
    }, [products]);

    const filteredProducts = useMemo(() => {
        return products
            .filter(p => {
                if (p.is_component) return false;

                const matchSearch = !search ||
                    p.sku.toLowerCase().includes(search.toLowerCase()) ||
                    p.category.toLowerCase().includes(search.toLowerCase());

                const matchGender = selectedGender === 'All' || p.gender === selectedGender;
                const matchCategory = selectedCategory === 'All' || p.category === selectedCategory;
                const matchCollection = selectedCollection === 'All' || p.collections?.includes(selectedCollection as number);

                const totalStock = (p.stock_qty || 0) + (p.sample_qty || 0) +
                    (p.variants?.reduce((sum, v) => sum + (v.stock_qty || 0), 0) || 0);
                const matchStock = !onlyInStock || totalStock > 0;

                return matchSearch && matchGender && matchCategory && matchCollection && matchStock;
            })
            .sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true, sensitivity: 'base' }));
    }, [products, search, selectedGender, selectedCategory, selectedCollection, onlyInStock]);

    // ── Active filter count ───────────────────────────────────────────────────
    const activeFilterCount = [
        selectedGender !== 'All',
        selectedCategory !== 'All',
        selectedCollection !== 'All',
        onlyInStock,
    ].filter(Boolean).length;

    const clearAllFilters = () => {
        setSelectedGender('All');
        setSelectedCategory('All');
        setSelectedCollection('All');
        setOnlyInStock(false);
    };

    const handleScan = (code: string) => {
        const match = findProductByScannedCode(code, products);
        if (match) {
            const targetSku = match.product.sku + (match.variant?.suffix || '');
            setSearch(targetSku);
            setShowScanner(false);
            showToast(`Βρέθηκε: ${targetSku}`, 'success');
        } else {
            showToast(`Ο κωδικός ${code} δεν βρέθηκε.`, 'error');
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 relative">

            {/* ── Sticky Header ─────────────────────────────────────────── */}
            <div className="sticky top-0 z-20 bg-white/98 backdrop-blur-xl border-b border-slate-200 shadow-sm px-3 pt-3 pb-2 space-y-2">

                {/* Row 1: Search + scan + filter toggle */}
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                        <input
                            type="text"
                            placeholder="Αναζήτηση κωδικού, κατηγορίας..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-8 pr-7 p-2.5 bg-slate-100 border border-transparent focus:bg-white focus:border-slate-300 rounded-xl outline-none font-bold text-sm text-slate-900 transition-all placeholder:font-medium placeholder:text-slate-400"
                        />
                        {search && (
                            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 bg-slate-300 rounded-full p-0.5">
                                <X size={11} className="text-slate-600" />
                            </button>
                        )}
                    </div>
                    <button
                        onClick={() => setShowScanner(true)}
                        className="bg-slate-100 text-slate-600 p-2.5 rounded-xl border border-transparent hover:bg-slate-200 transition-colors shrink-0"
                    >
                        <Camera size={18} />
                    </button>
                    <button
                        onClick={() => setShowFilters(v => !v)}
                        className={`relative p-2.5 rounded-xl border transition-colors shrink-0 ${showFilters || activeFilterCount > 0 ? 'bg-[#060b00] text-white border-[#060b00]' : 'bg-slate-100 text-slate-600 border-transparent hover:bg-slate-200'}`}
                    >
                        <SlidersHorizontal size={18} />
                        {activeFilterCount > 0 && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 text-[#060b00] text-[9px] font-black rounded-full flex items-center justify-center">
                                {activeFilterCount}
                            </span>
                        )}
                    </button>
                </div>

                {/* Row 2: Expandable filter panel */}
                {showFilters && (
                    <div className="space-y-3 pt-1 pb-1 animate-in slide-in-from-top-2 duration-200">

                        {/* Gender row */}
                        <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Φύλο</p>
                            <div className="flex gap-1.5 flex-wrap">
                                {GENDER_OPTIONS.map(g => (
                                    <button
                                        key={g.value}
                                        onClick={() => setSelectedGender(g.value as any)}
                                        className={`px-3 py-1.5 rounded-lg text-[11px] font-black border transition-all ${selectedGender === g.value
                                            ? 'bg-[#060b00] text-white border-[#060b00] shadow-sm'
                                            : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
                                            }`}
                                    >
                                        {g.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Collection row */}
                        {collections && collections.length > 0 && (
                            <div>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Συλλογή</p>
                                <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide -mx-1 px-1">
                                    <button
                                        onClick={() => setSelectedCollection('All')}
                                        className={`px-3 py-1.5 rounded-lg text-[11px] font-black border whitespace-nowrap transition-all ${selectedCollection === 'All'
                                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                            : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
                                            }`}
                                    >
                                        Όλες
                                    </button>
                                    {collections.map(col => (
                                        <button
                                            key={col.id}
                                            onClick={() => setSelectedCollection(col.id)}
                                            className={`px-3 py-1.5 rounded-lg text-[11px] font-black border whitespace-nowrap transition-all ${selectedCollection === col.id
                                                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                                : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
                                                }`}
                                        >
                                            {col.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* In-stock toggle */}
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[11px] font-black text-slate-700">Μόνο Διαθέσιμα</p>
                                <p className="text-[9px] text-slate-400 font-medium">Προϊόντα με στοκ &gt; 0</p>
                            </div>
                            <button
                                onClick={() => setOnlyInStock(v => !v)}
                                className={`w-11 h-6 rounded-full transition-colors duration-200 relative ${onlyInStock ? 'bg-emerald-500' : 'bg-slate-200'}`}
                            >
                                <div className={`w-4 h-4 bg-white rounded-full shadow-md absolute top-1 transition-all duration-200 ${onlyInStock ? 'left-6' : 'left-1'}`} />
                            </button>
                        </div>

                        {/* Clear all if any active */}
                        {activeFilterCount > 0 && (
                            <button
                                onClick={clearAllFilters}
                                className="w-full py-2 text-[11px] font-black text-red-500 border border-red-200 rounded-xl bg-red-50 hover:bg-red-100 transition-colors"
                            >
                                Καθαρισμός Φίλτρων ({activeFilterCount})
                            </button>
                        )}
                    </div>
                )}

                {/* Row 3: Category chips (always visible) */}
                <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-3 px-3 scrollbar-hide">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-3 py-1.5 rounded-full text-[10px] font-black whitespace-nowrap transition-all border ${selectedCategory === cat
                                ? 'bg-slate-800 text-white border-slate-800 shadow-sm'
                                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                                }`}
                        >
                            {cat === 'All' ? 'Όλα' : cat}
                        </button>
                    ))}
                </div>

                {/* Active filter chips row */}
                {activeFilterCount > 0 && !showFilters && (
                    <div className="flex gap-2 flex-wrap animate-in slide-in-from-top-1">
                        {selectedGender !== 'All' && (
                            <FilterChip label={GENDER_OPTIONS.find(g => g.value === selectedGender)?.label || selectedGender} onClear={() => setSelectedGender('All')} />
                        )}
                        {selectedCollection !== 'All' && (
                            <FilterChip label={collections?.find(c => c.id === selectedCollection)?.name || 'Συλλογή'} onClear={() => setSelectedCollection('All')} />
                        )}
                        {onlyInStock && (
                            <FilterChip label="Διαθέσιμα" onClear={() => setOnlyInStock(false)} />
                        )}
                    </div>
                )}
            </div>

            {/* ── Results count ─────────────────────────────────────────── */}
            <div className="px-3 pt-2 pb-1 flex items-center justify-between shrink-0">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {filteredProducts.length} προϊόντα
                </span>
            </div>

            {/* ── Product Grid ──────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-2 custom-scrollbar">
                <div className="grid grid-cols-3 sm:grid-cols-4 landscape:grid-cols-4 xl:grid-cols-5 gap-2 pb-28 landscape:pb-8">
                    {filteredProducts.map(p => (
                        <CatalogueCard key={p.sku} product={p} />
                    ))}
                </div>

                {filteredProducts.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
                        <PackageOpen size={40} className="opacity-20" />
                        <p className="font-black text-sm text-center">Δεν βρέθηκαν προϊόντα.</p>
                        {activeFilterCount > 0 && (
                            <button onClick={clearAllFilters} className="text-xs font-black text-[#060b00] underline">
                                Καθαρισμός φίλτρων
                            </button>
                        )}
                    </div>
                )}
            </div>

            {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
        </div>
    );
}
