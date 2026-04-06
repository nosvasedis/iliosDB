
import React, { useState, useMemo, useEffect, useDeferredValue } from 'react';
import { Product, Gender, MaterialType } from '../../types';
import {
    Search,
    ImageIcon,
    Tag,
    Weight,
    Layers,
    Camera,
    ChevronLeft,
    ChevronRight,
    X,
    User,
    Users,
    Gem,
    Palette,
    Puzzle,
    Database,
    ArrowDown,
    Filter,
    Factory,
    ShoppingBag,
    FolderOpen,
    List,
} from 'lucide-react';
import { formatCurrency, findProductByScannedCode } from '../../utils/pricingEngine';
import { useUI } from '../UIProvider';
import BarcodeScanner from '../BarcodeScanner';
import { useMaterials } from '../../hooks/api/useMaterials';
import { useCollections } from '../../hooks/api/useCollections';
import MobileScreenHeader from './MobileScreenHeader';
import {
    buildSearchableProducts,
    filterRegistryProducts,
    getAvailableRegistryStones,
    getGroupedProductCategories,
    getStoneChipStyle,
} from '../../features/products';

interface Props {
  products: Product[];
  onProductSelect: (p: Product) => void;
}

interface CategoryChipProps {
    label: string;
    isActive: boolean;
    onClick: () => void;
}

const CategoryChip: React.FC<CategoryChipProps> = ({ label, isActive, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all border shrink-0 ${
            isActive
                ? 'bg-[#060b00] text-white border-[#060b00] shadow-md'
                : 'bg-white text-slate-500 border-slate-200'
        }`}
    >
        {label}
    </button>
);

const SubFilterButton: React.FC<{
    label: string;
    value: string;
    activeValue: string;
    onClick: (value: string) => void;
}> = ({ label, value, activeValue, onClick }) => (
    <button
        type="button"
        onClick={() => onClick(value)}
        className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
            activeValue === value
                ? 'bg-[#060b00] text-white border-[#060b00] shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
        }`}
    >
        {label}
    </button>
);

const genderFilters: { label: string; value: 'All' | Gender; icon: React.ReactNode }[] = [
    { label: 'Όλα', value: 'All', icon: <Layers size={14} /> },
    { label: 'Ανδρικά', value: Gender.Men, icon: <User size={14} /> },
    { label: 'Γυναικεία', value: Gender.Women, icon: <User size={14} /> },
    { label: 'Unisex', value: Gender.Unisex, icon: <Users size={14} /> },
];

const platingFilters = [
    { label: 'Όλα', value: 'all' },
    { label: 'Λουστρέ', value: 'lustre' },
    { label: 'Πατίνα', value: 'patina' },
    { label: 'Επίχρυσο', value: 'gold' },
    { label: 'Επιπλατινωμένο', value: 'platinum' },
];

const stoneFilters = [
    { label: 'Όλα', value: 'all' },
    { label: 'Με Πέτρες', value: 'with' },
    { label: 'Χωρίς Πέτρες', value: 'without' },
];

const RegistryCard: React.FC<{ product: Product; onClick: () => void }> = ({ product, onClick }) => {
    const [variantIndex, setVariantIndex] = useState(0);

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
    const currentVariant = hasVariants ? variants[variantIndex] : null;

    const displaySku = currentVariant ? `${product.sku}${currentVariant.suffix}` : product.sku;
    const displayPrice = currentVariant ? (currentVariant.selling_price || 0) : (product.selling_price || 0);
    const displayLabel = currentVariant ? (currentVariant.description || currentVariant.suffix) : product.category;

    const totalStock = (product.stock_qty || 0) + (product.variants?.reduce((sum, v) => sum + (v.stock_qty || 0), 0) || 0);

    const nextVariant = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (hasVariants) setVariantIndex((prev) => (prev + 1) % variants.length);
    };

    const prevVariant = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (hasVariants) setVariantIndex((prev) => (prev - 1 + variants.length) % variants.length);
    };

    return (
        <div
            onClick={onClick}
            className="bg-white p-2 rounded-2xl border border-slate-100 shadow-sm active:scale-95 transition-transform flex flex-col relative overflow-hidden h-full"
        >
            <div className="aspect-square bg-slate-50 rounded-xl overflow-hidden mb-2 relative group shrink-0">
                {product.image_url ? (
                    <img src={product.image_url} className="w-full h-full object-cover" alt={displaySku} />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon size={24}/></div>
                )}

                {totalStock > 0 && (
                    <div className="absolute top-2 right-2 bg-emerald-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm">
                        {totalStock}
                    </div>
                )}

                {hasVariants && (
                    <div className="absolute bottom-2 left-2 bg-slate-900/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 shadow-sm backdrop-blur-sm">
                        <Layers size={10} /> {variants.length}
                    </div>
                )}
            </div>

            <div className="mt-auto">
                <div className="flex justify-between items-center">
                    <div className="font-black text-slate-800 text-sm truncate">{displaySku}</div>

                    {hasVariants && variants.length > 1 && (
                        <div className="flex bg-slate-100 rounded-lg p-0.5" onClick={e => e.stopPropagation()}>
                            <button type="button" onClick={prevVariant} className="p-1 hover:bg-white rounded shadow-sm transition-all text-slate-500">
                                <ChevronLeft size={12}/>
                            </button>
                            <button type="button" onClick={nextVariant} className="p-1 hover:bg-white rounded shadow-sm transition-all text-slate-500">
                                <ChevronRight size={12}/>
                            </button>
                        </div>
                    )}
                </div>

                <div className="text-[10px] text-slate-400 font-medium truncate flex items-center gap-1">
                    <Tag size={10}/> {displayLabel}
                </div>

                <div className="mt-1 flex justify-between items-end">
                    <div className="font-bold text-slate-900 text-xs bg-slate-50 rounded px-1.5 py-0.5 w-fit">
                        {displayPrice > 0 ? formatCurrency(displayPrice) : '-'}
                    </div>
                    <div className="text-[9px] text-slate-400 flex items-center gap-0.5">
                        <Weight size={8}/> {product.weight_g}g
                    </div>
                </div>
            </div>
        </div>
    );
};

function countActiveRegistryFilters(params: {
    showStxOnly: boolean;
    filterCategory: string;
    filterGender: 'All' | Gender;
    subFilters: { stone: string; plating: string; productionType: string; collection: string };
    sortBy: 'sku' | 'created_at';
}) {
    const { showStxOnly, filterCategory, filterGender, subFilters, sortBy } = params;
    let n = 0;
    if (filterCategory !== 'All') n++;
    if (!showStxOnly && filterGender !== 'All') n++;
    if (subFilters.stone !== 'all') n++;
    if (subFilters.plating !== 'all') n++;
    if (!showStxOnly && subFilters.productionType !== 'all') n++;
    if (!showStxOnly && subFilters.collection !== 'all') n++;
    if (sortBy !== 'sku') n++;
    return n;
}

export default function MobileRegistry({ products, onProductSelect }: Props) {
    const { data: materials } = useMaterials();
    const { data: collections } = useCollections();

    const [search, setSearch] = useState('');
    const deferredSearch = useDeferredValue(search.trim());
    const [filterCategory, setFilterCategory] = useState<string>('All');
    const [showScanner, setShowScanner] = useState(false);

    const [showFilterSheet, setShowFilterSheet] = useState(false);
    const [showStxOnly, setShowStxOnly] = useState(false);
    const [filterGender, setFilterGender] = useState<'All' | Gender>('All');
    const [subFilters, setSubFilters] = useState({
        stone: 'all',
        plating: 'all',
        productionType: 'all',
        collection: 'all',
    });
    const [sortBy, setSortBy] = useState<'sku' | 'created_at'>('sku');

    const [displayLimit, setDisplayLimit] = useState(50);

    const { showToast } = useUI();

    useEffect(() => {
        setDisplayLimit(50);
    }, [deferredSearch, filterCategory, filterGender, subFilters, showStxOnly, sortBy]);

    const baseProducts = useMemo(() => {
        return products.filter((p) => (showStxOnly ? p.is_component : !p.is_component));
    }, [products, showStxOnly]);

    const stoneMaterialIds = useMemo(() => {
        if (!materials) return new Set<string>();
        return new Set(materials.filter((m) => m.type === MaterialType.Stone).map((m) => m.id));
    }, [materials]);

    const searchableProducts = useMemo(() => {
        return buildSearchableProducts(baseProducts, stoneMaterialIds);
    }, [baseProducts, stoneMaterialIds]);

    const groupedCategories = useMemo(() => getGroupedProductCategories(baseProducts), [baseProducts]);

    const availableStones = useMemo(() => {
        return getAvailableRegistryStones(searchableProducts, filterGender);
    }, [searchableProducts, filterGender]);

    const filteredProducts = useMemo(() => {
        if (!materials) return [];
        return filterRegistryProducts(searchableProducts, {
            category: filterCategory,
            gender: filterGender,
            searchTerm: deferredSearch,
            stone: subFilters.stone,
            plating: subFilters.plating,
            productionType: subFilters.productionType,
            collection: subFilters.collection,
            sortBy,
        });
    }, [searchableProducts, materials, deferredSearch, filterCategory, filterGender, subFilters, sortBy]);

    const displayedProducts = filteredProducts.slice(0, displayLimit);

    const activeFilterCount = countActiveRegistryFilters({
        showStxOnly,
        filterCategory,
        filterGender,
        subFilters,
        sortBy,
    });

    const quickCategoryLabels = useMemo(() => {
        return ['All', ...groupedCategories.parents] as const;
    }, [groupedCategories.parents]);

    const handleScan = (code: string) => {
        const match = findProductByScannedCode(code, products);
        if (match) {
            onProductSelect(match.product);
            setShowScanner(false);
            showToast(`Βρέθηκε: ${match.product.sku}`, 'success');
        } else {
            showToast(`Ο κωδικός ${code} δεν βρέθηκε.`, 'error');
        }
    };

    const loadMore = () => {
        setDisplayLimit((prev) => prev + 50);
    };

    const resetAllFilters = () => {
        setFilterGender('All');
        setFilterCategory('All');
        setSubFilters({ stone: 'all', plating: 'all', productionType: 'all', collection: 'all' });
        setSortBy('sku');
    };

    const stoneQuickActive =
        subFilters.stone !== 'all' && subFilters.stone !== 'with' && subFilters.stone !== 'without'
            ? '_specific_'
            : subFilters.stone;

    if (!materials) {
        return <div className="p-12 text-center text-slate-400 text-sm">Φόρτωση...</div>;
    }

    return (
        <div className="flex h-full min-h-0 flex-col bg-slate-50">
            <MobileScreenHeader
                icon={showStxOnly ? Puzzle : Database}
                title={showStxOnly ? 'Εξαρτήματα (STX)' : 'Μητρώο Κωδικών'}
                subtitle={showStxOnly ? 'STX & εξαρτήματα' : 'Κωδικοί & κατάλογος'}
                iconClassName={showStxOnly ? 'text-blue-600' : 'text-slate-700'}
                right={
                    <button
                        type="button"
                        onClick={() => {
                            setShowStxOnly(!showStxOnly);
                            setFilterCategory('All');
                        }}
                        className={`rounded-xl border p-2 transition-all ${showStxOnly ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500'}`}
                        aria-label={showStxOnly ? 'Πλήρες μητρώο' : 'Μόνο STX'}
                    >
                        {showStxOnly ? <Puzzle size={20} /> : <Database size={20} />}
                    </button>
                }
            />

            <div className="flex min-h-0 flex-1 flex-col px-4">
            <div className="mb-3 mt-3 flex shrink-0 gap-2">
                <div className="relative flex-1 min-w-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                        type="text"
                        placeholder={showStxOnly ? 'Αναζήτηση STX ή κατηγορίας...' : 'Κωδικός, κατηγορία...'}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-3 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500 shadow-sm font-medium text-sm"
                    />
                </div>
                <button
                    type="button"
                    onClick={() => setShowFilterSheet(true)}
                    className={`shrink-0 flex items-center gap-2 px-4 py-3 rounded-xl border font-bold text-sm transition-all ${
                        activeFilterCount > 0
                            ? 'bg-[#060b00] text-white border-[#060b00] shadow-md'
                            : 'bg-white text-slate-600 border-slate-200'
                    }`}
                >
                    <Filter size={18} />
                    <span className="text-sm">Φίλτρα</span>
                    {activeFilterCount > 0 && (
                        <span className="flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[10px] bg-emerald-500 text-white rounded-full font-black">
                            {activeFilterCount}
                        </span>
                    )}
                </button>
                <button
                    type="button"
                    onClick={() => setShowScanner(true)}
                    className="shrink-0 bg-white text-slate-600 border border-slate-200 p-3 rounded-xl shadow-sm active:scale-95 transition-transform"
                >
                    <Camera size={20} />
                </button>
            </div>

            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2 shrink-0">Γρήγορη κατηγορία</p>
            <div className="flex gap-2 overflow-x-auto pb-3 shrink-0 scrollbar-hide -mx-1 px-1">
                {quickCategoryLabels.map((cat) => (
                    <CategoryChip
                        key={cat}
                        label={cat === 'All' ? 'Όλα' : cat}
                        isActive={filterCategory === cat}
                        onClick={() => setFilterCategory(cat)}
                    />
                ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pb-24 custom-scrollbar">
                <div className="grid grid-cols-2 gap-3 pb-4">
                    {displayedProducts.map((p) => (
                        <RegistryCard
                            key={p.sku}
                            product={p}
                            onClick={() => onProductSelect(p)}
                        />
                    ))}
                </div>

                {displayedProducts.length < filteredProducts.length && (
                    <button
                        type="button"
                        onClick={loadMore}
                        className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors flex items-center justify-center gap-2 mb-4"
                    >
                        <ArrowDown size={16}/> Περισσότερα ({filteredProducts.length - displayedProducts.length})
                    </button>
                )}

                {filteredProducts.length === 0 && (
                    <div className="text-center py-10 text-slate-400 text-sm font-medium">
                        Δεν βρέθηκαν προϊόντα.
                    </div>
                )}
            </div>
            </div>

            {showScanner && (
                <BarcodeScanner
                    onScan={handleScan}
                    onClose={() => setShowScanner(false)}
                />
            )}

            {showFilterSheet && (
                <div
                    className="fixed inset-0 z-[120] flex flex-col bg-slate-900/40 backdrop-blur-sm"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="mobile-registry-filters-title"
                    onClick={() => setShowFilterSheet(false)}
                >
                    <div
                        className="mt-auto max-h-[min(92dvh,840px)] bg-white rounded-t-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="shrink-0 pt-3 pb-2 px-4 border-b border-slate-100">
                            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-3" />
                            <div className="flex items-center justify-between gap-3">
                                <h2 id="mobile-registry-filters-title" className="text-lg font-black text-slate-900 flex items-center gap-2">
                                    <Filter size={20} className="text-emerald-600" />
                                    Προηγμένα Φίλτρα
                                </h2>
                                <button
                                    type="button"
                                    onClick={() => setShowFilterSheet(false)}
                                    className="p-2.5 text-slate-500 hover:text-slate-800 bg-slate-100 rounded-full transition-colors"
                                    aria-label="Κλείσιμο"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                            <p className="text-xs text-slate-500 mt-1 font-medium">
                                Ίδια κριτήρια με την επιφάνεια εργασίας — λεπτομέρειες & υποκατηγορίες εδώ.
                            </p>
                        </div>

                        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6 custom-scrollbar min-h-0">
                            {!showStxOnly && (
                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Φύλο / Είδος</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {genderFilters.map((f) => (
                                            <button
                                                key={f.value}
                                                type="button"
                                                onClick={() => setFilterGender(f.value)}
                                                className={`flex items-center justify-center gap-2 px-3 py-3 rounded-xl font-bold text-xs transition-all border ${
                                                    filterGender === f.value
                                                        ? 'bg-[#060b00] text-white border-black'
                                                        : 'bg-white text-slate-600 border-slate-200'
                                                }`}
                                            >
                                                {f.icon}
                                                {f.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Κατηγορία (πλήρης λίστα)</label>
                                <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white max-h-52 overflow-y-auto custom-scrollbar">
                                    <button
                                        type="button"
                                        className={`w-full text-left px-4 py-3 text-sm font-bold transition-colors ${
                                            filterCategory === 'All' ? 'bg-emerald-50 text-emerald-800' : 'hover:bg-slate-50 text-slate-800'
                                        }`}
                                        onClick={() => setFilterCategory('All')}
                                    >
                                        Όλες οι Κατηγορίες
                                    </button>
                                    {groupedCategories.parents.map((c) => (
                                        <div key={c}>
                                            <button
                                                type="button"
                                                className={`w-full text-left px-4 py-3 text-sm font-bold border-t border-slate-100 transition-colors ${
                                                    filterCategory === c ? 'bg-emerald-50 text-emerald-800' : 'hover:bg-slate-50 text-slate-800 bg-slate-50/40'
                                                }`}
                                                onClick={() => setFilterCategory(c)}
                                            >
                                                {c}
                                            </button>
                                            {(groupedCategories.children.get(c) || new Set()).size > 0 &&
                                                Array.from(groupedCategories.children.get(c) as Set<string>).map((subC) => (
                                                    <button
                                                        key={subC}
                                                        type="button"
                                                        className={`w-full text-left px-4 py-2.5 pl-8 text-sm transition-colors ${
                                                            filterCategory === subC
                                                                ? 'bg-emerald-50/80 text-emerald-800 font-bold'
                                                                : 'hover:bg-slate-50 text-slate-600'
                                                        }`}
                                                        onClick={() => setFilterCategory(subC)}
                                                    >
                                                        {(subC as string).replace(c, '').trim() || subC}
                                                    </button>
                                                ))}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                                    <Gem size={14} className="text-violet-500" />
                                    Πέτρες
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {stoneFilters.map((f) => (
                                        <SubFilterButton
                                            key={f.value}
                                            label={f.label}
                                            value={f.value}
                                            activeValue={stoneQuickActive}
                                            onClick={(v) => setSubFilters((p) => ({ ...p, stone: v }))}
                                        />
                                    ))}
                                </div>
                                {availableStones.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                        {availableStones.map((s) => {
                                            const style = getStoneChipStyle(s.id);
                                            const isActive = subFilters.stone === s.id;
                                            return (
                                                <button
                                                    key={s.id}
                                                    type="button"
                                                    onClick={() =>
                                                        setSubFilters((p) => ({
                                                            ...p,
                                                            stone: isActive ? 'all' : s.id,
                                                        }))
                                                    }
                                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-bold border transition-all ${
                                                        isActive
                                                            ? `${style.bg} ${style.text} border-current ring-2 ring-offset-1 ring-current/25 shadow-sm`
                                                            : `${style.bg} ${style.text} border-transparent opacity-85 hover:opacity-100`
                                                    }`}
                                                >
                                                    <span className={`w-2 h-2 rounded-full ${style.dot} shrink-0`} />
                                                    {s.name}
                                                    <span className="opacity-50 text-[10px]">({s.count})</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                                    <Palette size={14} className="text-amber-600" />
                                    Φινίρισμα
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {platingFilters.map((f) => (
                                        <SubFilterButton
                                            key={f.value}
                                            label={f.label}
                                            value={f.value}
                                            activeValue={subFilters.plating}
                                            onClick={(v) => setSubFilters((p) => ({ ...p, plating: v }))}
                                        />
                                    ))}
                                </div>
                            </div>

                            {!showStxOnly && (
                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                                        <Factory size={14} className="text-slate-500" />
                                        Τύπος Παραγωγής
                                    </label>
                                    <div className="flex gap-2">
                                        {[
                                            { label: 'Όλα', value: 'all', icon: null as React.ReactNode },
                                            { label: 'Ιδιοπαραγωγή', value: 'InHouse', icon: <Factory size={12} /> },
                                            { label: 'Εισαγωγή', value: 'Imported', icon: <ShoppingBag size={12} /> },
                                        ].map((f) => (
                                            <button
                                                key={f.value}
                                                type="button"
                                                onClick={() => setSubFilters((p) => ({ ...p, productionType: f.value }))}
                                                className={`flex flex-1 items-center justify-center gap-1.5 px-2 py-2.5 rounded-xl font-bold text-[11px] transition-all border ${
                                                    subFilters.productionType === f.value
                                                        ? 'bg-[#060b00] text-white border-black'
                                                        : 'bg-white text-slate-600 border-slate-200'
                                                }`}
                                            >
                                                {f.icon}
                                                {f.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                                    <List size={14} />
                                    Ταξινόμηση
                                </label>
                                <div className="flex gap-2">
                                    {[
                                        { label: 'Κωδικός', value: 'sku' as const },
                                        { label: 'Ημ/νία δημιουργίας', value: 'created_at' as const },
                                    ].map((f) => (
                                        <button
                                            key={f.value}
                                            type="button"
                                            onClick={() => setSortBy(f.value)}
                                            className={`flex-1 px-3 py-2.5 rounded-xl font-bold text-xs transition-all border ${
                                                sortBy === f.value
                                                    ? 'bg-[#060b00] text-white border-black'
                                                    : 'bg-white text-slate-600 border-slate-200'
                                            }`}
                                        >
                                            {f.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {!showStxOnly && collections && collections.length > 0 && (
                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                                        <FolderOpen size={14} className="text-blue-600" />
                                        Συλλογή
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        <SubFilterButton
                                            label="Όλες"
                                            value="all"
                                            activeValue={subFilters.collection}
                                            onClick={(v) => setSubFilters((p) => ({ ...p, collection: v }))}
                                        />
                                        {collections.map((col) => (
                                            <SubFilterButton
                                                key={col.id}
                                                label={col.name}
                                                value={String(col.id)}
                                                activeValue={subFilters.collection}
                                                onClick={(v) => setSubFilters((p) => ({ ...p, collection: v }))}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="shrink-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-slate-100 bg-slate-50 flex gap-3">
                            <button
                                type="button"
                                onClick={resetAllFilters}
                                className="flex-1 px-4 py-3.5 rounded-xl font-bold text-slate-600 bg-white border border-slate-200 active:bg-slate-100 transition-colors text-sm"
                            >
                                Καθαρισμός
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowFilterSheet(false)}
                                className="flex-[2] px-4 py-3.5 rounded-xl font-bold text-white bg-[#060b00] active:bg-black transition-colors shadow-md text-sm"
                            >
                                Έτοιμο · {filteredProducts.length} κωδ.
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
