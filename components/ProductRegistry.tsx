
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Product, ProductVariant, GlobalSettings, Collection, Material, Mold, Gender, PlatingType, ProductionType } from '../types';
import { Search, Filter, Layers, Database, PackagePlus, ImageIcon, User, Users as UsersIcon, Edit3, TrendingUp, Weight, BookOpen, ChevronLeft, ChevronRight, Tag, Puzzle, Gem, Palette, X, Camera, LayoutGrid, List, CheckSquare, Printer, Factory, ShoppingBag, FolderOpen } from 'lucide-react';
import ProductDetails from './ProductDetails';
import NewProduct from './NewProduct';
import BarcodeScanner from './BarcodeScanner';
import SkuColorizedText from './SkuColorizedText';
import { useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { invalidateProductsAndCatalog } from '../lib/queryInvalidation';
import { calculateProductCost, getPrevalentVariant, formatCurrency, findProductByScannedCode, estimateVariantCost } from '../utils/pricingEngine';
import { useUI } from './UIProvider';
import { Info } from 'lucide-react';
import { useCollections } from '../hooks/api/useCollections';
import { useMaterials } from '../hooks/api/useMaterials';
import { useMolds } from '../hooks/api/useMolds';
import { useProducts } from '../hooks/api/useProducts';
import { useSettings } from '../hooks/api/useSettings';
import { productsRepository } from '../features/products';
import {
    buildPrintableSkuMap,
    buildRegistryTableVariants,
    buildSearchableProducts,
    filterRegistryProducts,
    getAvailableRegistryStones,
    getGroupedProductCategories,
} from '../features/products';

interface Props {
    setPrintItems?: (items: { product: Product; variant?: ProductVariant; quantity: number, format?: 'standard' | 'simple' | 'retail' }[]) => void;
}

interface TableVariant {
    masterSku: string;
    variantSku: string;
    product: Product;
    variant: ProductVariant | null;
    label: string;
    price: number;
    cost: number;
    costBreakdown: any;
    suggestedPrice: number;
    weight: number;
    image: string | null;
}

const genderFilters: { label: string; value: 'All' | Gender; icon: React.ReactNode }[] = [
    { label: 'Όλα', value: 'All', icon: <Layers size={16} /> },
    { label: 'Ανδρικά', value: Gender.Men, icon: <User size={16} /> },
    { label: 'Γυναικεία', value: Gender.Women, icon: <User size={16} /> },
    { label: 'Unisex', value: Gender.Unisex, icon: <UsersIcon size={16} /> },
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
    { label: 'Χωρίς Πέτρες', value: 'without' }
];

// Per stone-code colour chips (keyed by variant suffix stone code from STONE_CODES_WOMEN/MEN)
const STONE_CHIP_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
    // Women — Zircon family
    'LE': { bg: 'bg-slate-50', text: 'text-slate-700', dot: 'bg-slate-300' },   // Λευκά Ζιργκόν
    'MP': { bg: 'bg-blue-50', text: 'text-blue-800', dot: 'bg-blue-400' },    // Μπλε Ζιργκόν
    'PR': { bg: 'bg-green-50', text: 'text-green-800', dot: 'bg-green-500' },   // Πράσινα Ζιργκόν
    'KO': { bg: 'bg-red-50', text: 'text-red-800', dot: 'bg-red-400' },     // Κόκκινα Ζιργκόν
    'MV': { bg: 'bg-purple-50', text: 'text-purple-800', dot: 'bg-purple-400' },  // Μωβ Ζιργκόν
    'RZ': { bg: 'bg-pink-50', text: 'text-pink-800', dot: 'bg-pink-300' },    // Ροζ Ζιργκόν
    'AK': { bg: 'bg-cyan-50', text: 'text-cyan-800', dot: 'bg-cyan-400' },    // Άκουα Ζιργκόν
    // Women — Agate family
    'PAX': { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-400' },   // Πράσινος Αχάτης
    'MAX': { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-400' },    // Μπλε Αχάτης
    'KAX': { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-400' },     // Κόκκινος Αχάτης
    // Women — Copper family (these ARE turquoise/teal in appearance)
    'CO': { bg: 'bg-teal-50', text: 'text-teal-800', dot: 'bg-teal-400' },    // Κόπερ (turquoise)
    'PCO': { bg: 'bg-emerald-50', text: 'text-emerald-800', dot: 'bg-emerald-500' }, // Πράσινο Κόπερ
    'MCO': { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-400' },  // Μωβ Κόπερ
    // Women — Triplets
    'TPR': { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-400' }, // Τριπλέτα Πράσινη
    'TKO': { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-400' },     // Τριπλέτα Κόκκινη
    'TMP': { bg: 'bg-indigo-50', text: 'text-indigo-700', dot: 'bg-indigo-400' },  // Τριπλέτα Μπλε
    // Women — Other
    'AI': { bg: 'bg-zinc-100', text: 'text-zinc-700', dot: 'bg-zinc-500' },    // Αιματίτης (dark metallic)
    'AP': { bg: 'bg-teal-50', text: 'text-teal-700', dot: 'bg-teal-300' },    // Απατίτης
    'AM': { bg: 'bg-teal-50', text: 'text-teal-800', dot: 'bg-teal-400' },    // Αμαζονίτης
    'LR': { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-300' },    // Λαμπραδορίτης
    'LA': { bg: 'bg-blue-100', text: 'text-blue-900', dot: 'bg-blue-600' },    // Λάπις (deep blue)
    'FI': { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-200' },   // Φίλντισι (ivory)
    'BST': { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-400' },     // Blue Sky Topaz
    'XAL': { bg: 'bg-blue-50', text: 'text-blue-600', dot: 'bg-blue-200' },    // Χαλκηδόνιο
    // Men
    'KR': { bg: 'bg-orange-50', text: 'text-orange-800', dot: 'bg-orange-400' },  // Κορνεόλη (orange-red)
    'AX': { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-400' },   // Πράσινος Αχάτης
    'TG': { bg: 'bg-amber-50', text: 'text-amber-800', dot: 'bg-amber-500' },   // Μάτι Τίγρης (golden)
    'QN': { bg: 'bg-zinc-100', text: 'text-zinc-800', dot: 'bg-zinc-700' },    // Όνυχας (black)
    'TY': { bg: 'bg-teal-50', text: 'text-teal-800', dot: 'bg-teal-400' },    // Τυρκουάζ
    'IA': { bg: 'bg-rose-50', text: 'text-rose-800', dot: 'bg-rose-400' },    // Ίασπης
    'BSU': { bg: 'bg-zinc-100', text: 'text-zinc-800', dot: 'bg-zinc-600' },    // Μαύρος Σουλεμάνης
    'GSU': { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },   // Πράσινος Σουλεμάνης
    'RSU': { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-400' },     // Κόκκινος Σουλεμάνης
    'MA': { bg: 'bg-emerald-50', text: 'text-emerald-800', dot: 'bg-emerald-500' }, // Μαλαχίτης
    'OP': { bg: 'bg-stone-50', text: 'text-stone-600', dot: 'bg-stone-300' },   // Οπάλιο
    'NF': { bg: 'bg-green-50', text: 'text-green-800', dot: 'bg-green-600' },   // Νεφρίτης
    'SD': { bg: 'bg-indigo-50', text: 'text-indigo-900', dot: 'bg-indigo-600' },  // Σοδαλίτης (deep blue)
};
const DEFAULT_STONE_STYLE = { bg: 'bg-slate-50', text: 'text-slate-600', dot: 'bg-slate-300' };

const getStoneChipStyle = (code: string) => STONE_CHIP_STYLES[code] ?? DEFAULT_STONE_STYLE;

const getPaginationRange = (current: number, total: number) => {
    const range: (number | string)[] = [];
    const delta = 4;

    for (let i = 0; i < total; i++) {
        if (
            i === 0 ||
            i === total - 1 ||
            (i >= current - delta && i <= current + delta)
        ) {
            range.push(i);
        } else if (
            (i === current - delta - 1 && i > 0) ||
            (i === current + delta + 1 && i < total - 1)
        ) {
            range.push('...');
        }
    }
    return range.filter((item, pos, self) => item !== '...' || self[pos - 1] !== '...');
};

// ==========================================
// GRID VIEW PRODUCT CARD - MEMOIZED
// ==========================================
const ProductCard: React.FC<{
    product: Product;
    settings: GlobalSettings;
    materials: Material[];
    allProducts: Product[];
    productsMap?: Map<string, Product>;
    materialsMap?: Map<string, Material>;
    onSelectProduct: React.Dispatch<React.SetStateAction<Product | null>>;
    isSelected: boolean;
}> = React.memo(({ product, settings, materials, allProducts, productsMap, materialsMap, onSelectProduct, isSelected }) => {
    const [viewIndex, setViewIndex] = useState(0);

    const variants = product.variants || [];
    const hasVariants = variants.length > 0;
    const variantCount = variants.length;

    const sortedVariants = useMemo(() => {
        if (!hasVariants) return [];
        return [...variants].sort((a, b) => {
            const priority = (suffix: string) => {
                // Priority Order: Lustre > P > D > X > H
                if (suffix === '' || !['P', 'D', 'X', 'H'].some(c => suffix.startsWith(c))) return 0;
                if (suffix.startsWith('P')) return 1;
                if (suffix.startsWith('D')) return 2;
                if (suffix.startsWith('X')) return 3;
                if (suffix.startsWith('H')) return 4;
                return 5;
            };
            return priority(a.suffix) - priority(b.suffix);
        });
    }, [variants]);

    let currentVariant: ProductVariant | null = null;
    if (hasVariants) {
        currentVariant = sortedVariants[viewIndex % variantCount];
    }

    const masterCostCalc = useMemo(
        () => calculateProductCost(product, settings, materials, allProducts, 0, new Set(), undefined, productsMap, materialsMap),
        [product, settings, materials, allProducts, productsMap, materialsMap]
    );
    const masterCost = masterCostCalc.total;

    let displayPrice = product.selling_price;
    let displayCost = masterCost;
    let displaySku = product.sku;
    let displayLabel = 'Βασικό';

    if (currentVariant) {
        displaySku = `${product.sku}${currentVariant.suffix}`;
        displayLabel = currentVariant.description || currentVariant.suffix;
        if (currentVariant.selling_price) displayPrice = currentVariant.selling_price;

        // DYNAMIC COST CALCULATION FIX:
        // Instead of using stored `currentVariant.active_price` (which might be stale),
        // we calculate it on the fly using the current global settings (silver price).
        const variantEst = estimateVariantCost(product, currentVariant.suffix, settings, materials, allProducts, undefined, productsMap, materialsMap);
        displayCost = variantEst.total;
    }

    const profit = displayPrice - displayCost;
    const margin = displayPrice > 0 ? (profit / displayPrice) * 100 : 0;

    const nextView = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (hasVariants) setViewIndex((prev: number) => (prev + 1) % variantCount);
    };

    const prevView = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (hasVariants) setViewIndex((prev: number) => (prev - 1 + variantCount) % variantCount);
    };

    // --- WEIGHT CALCULATIONS (In-House vs STX) ---
    const inHouseWeight = product.weight_g + (product.secondary_weight_g || 0);

    const stxWeight = useMemo(() => {
        if (!product.recipe) return 0;
        return product.recipe.reduce((acc, item) => {
            if (item.type === 'component') {
                const comp = productsMap ? productsMap.get(item.sku) : allProducts.find(p => p.sku === item.sku);
                if (comp) {
                    const compWeight = comp.weight_g + (comp.secondary_weight_g || 0);
                    return acc + (compWeight * item.quantity);
                }
            }
            return acc;
        }, 0);
    }, [product.recipe, allProducts, productsMap]);

    const totalWeight = inHouseWeight + stxWeight;

    return (
        <div
            onClick={() => onSelectProduct(product)}
            className={`group bg-white rounded-3xl border shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer flex flex-col overflow-hidden hover:-translate-y-1 relative h-full ${isSelected ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-100'}`}
        >
            {hasVariants && (
                <div className="absolute top-3 left-3 z-10 bg-[#060b00]/90 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm border border-white/10">
                    <Layers size={10} className="text-amber-400" />
                    <span>{variantCount}</span>
                </div>
            )}

            <div className="aspect-square bg-slate-50 relative overflow-hidden shrink-0">
                {product.image_url ? (
                    <img
                        src={product.image_url}
                        alt={product.sku}
                        className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700 ease-out"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <ImageIcon size={40} />
                    </div>
                )}

                <div className="absolute bottom-3 left-3 z-10 bg-white/90 backdrop-blur-md text-slate-600 text-[10px] font-bold px-2 py-1 rounded-lg shadow-sm border border-slate-100 max-w-[calc(100%-1.5rem)] truncate">
                    {product.category}
                </div>
            </div>

            <div className="p-5 flex-1 flex flex-col relative min-h-0">
                <div className="flex justify-between items-start mb-3">
                    <div className="min-w-0 pr-2">
                        <h3 className="text-[16px] leading-[1.05] break-all">
                            <SkuColorizedText
                                sku={displaySku}
                                gender={product.gender}
                                masterClassName="text-slate-800 group-hover:text-emerald-700 transition-colors"
                            />
                        </h3>
                        <div className="text-xs font-bold text-slate-400 mt-1 truncate flex items-center gap-1">
                            {hasVariants && <Tag size={10} />} {displayLabel}
                        </div>
                    </div>

                    {hasVariants && variantCount > 1 && (
                        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button onClick={prevView} className="p-1 hover:bg-white hover:text-emerald-600 hover:shadow-sm rounded-md transition-all text-slate-400">
                                <ChevronLeft size={16} />
                            </button>
                            <div className="w-px h-3 bg-slate-200 mx-0.5"></div>
                            <button onClick={nextView} className="p-1 hover:bg-white hover:text-emerald-600 hover:shadow-sm rounded-md transition-all text-slate-400">
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex gap-2 mb-4 items-start">
                    <div className={`bg-slate-50 px-2 py-1 rounded text-[10px] font-bold text-slate-500 border border-slate-100 ${stxWeight > 0 ? 'flex flex-col gap-0.5 items-start' : 'flex items-center gap-1'}`}>
                        <div className="flex items-center gap-1" title="In-House Metal Weight">
                            <Weight size={10} /> <span>{inHouseWeight.toFixed(2)}g</span>
                        </div>
                        {stxWeight > 0 && (
                            <>
                                <div className="flex items-center gap-1 text-blue-500" title="Component (STX) Weight">
                                    <Puzzle size={10} /> <span>+{stxWeight.toFixed(2)}g</span>
                                </div>
                                <div className="border-t border-slate-200 pt-0.5 mt-0.5 font-black text-slate-700 w-full" title="Total Metal Weight">
                                    = {totalWeight.toFixed(2)}g
                                </div>
                            </>
                        )}
                    </div>
                    <div className="bg-slate-50 px-2 py-1 rounded text-[10px] font-bold text-slate-500 flex items-center gap-1 border border-slate-100 h-fit">
                        <BookOpen size={10} /> {product.recipe.length + 1} υλικά
                    </div>
                </div>

                <div className="mt-auto pt-3 border-t border-slate-100 grid grid-cols-2 gap-4 items-end shrink-0">
                    <div>
                        <div className="text-[9px] uppercase font-bold text-slate-400 mb-0.5">Χονδρικη</div>
                        <div className={`text-xl font-black leading-none ${displayPrice > 0 ? 'text-[#060b00]' : 'text-slate-300'}`}>
                            {displayPrice > 0 ? formatCurrency(displayPrice) : '-'}
                        </div>
                    </div>

                    <div className="text-right">
                        <div className="text-[9px] uppercase font-bold text-slate-400 mb-0.5">Περιθωριο</div>
                        <div className={`flex items-center justify-end gap-1 font-bold text-sm ${margin < 30 ? 'text-red-500' : 'text-emerald-600'}`}>
                            {displayPrice > 0 ? (
                                <>
                                    <TrendingUp size={12} />
                                    {margin.toFixed(0)}%
                                </>
                            ) : '-'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}); // ProductCard End

const SubFilterButton: React.FC<{
    label: string;
    value: string;
    activeValue: string;
    onClick: (value: string) => void;
}> = React.memo(({ label, value, activeValue, onClick }) => (
    <button
        onClick={() => onClick(value)}
        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border
            ${activeValue === value
                ? 'bg-[#060b00] text-white border-[#060b00] shadow-md'
                : 'bg-white text-slate-500 hover:bg-slate-50 border-slate-200'}
        `}
    >
        {label}
    </button>
));

export default function ProductRegistry({ setPrintItems }: Props) {
    const queryClient = useQueryClient();
    const { showToast } = useUI();
    const { data: products, isLoading: loadingProducts } = useProducts();
    const { data: materials, isLoading: loadingMaterials } = useMaterials();
    const { data: molds, isLoading: loadingMolds } = useMolds();
    const { data: settings, isLoading: loadingSettings } = useSettings();
    const { data: collections, isLoading: loadingCollections } = useCollections();

    const [searchTerm, setSearchTerm] = useState('');

    const [filterCategory, setFilterCategory] = useState<string>('All');
    const [filterGender, setFilterGender] = useState<'All' | Gender>('All');

    const [subFilters, setSubFilters] = useState({
        stone: 'all',          // 'all' | 'with' | 'without' | materialId
        plating: 'all',
        productionType: 'all', // 'all' | 'InHouse' | 'Imported'
        collection: 'all',     // 'all' | collectionId string
    });

    const [sortBy, setSortBy] = useState<'sku' | 'created_at'>('sku');

    const [showFiltersSidebar, setShowFiltersSidebar] = useState(false);
    const [showPrintModal, setShowPrintModal] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [productToDuplicate, setProductToDuplicate] = useState<Product | null>(null);
    const [showStxOnly, setShowStxOnly] = useState(false);
    const [showScanner, setShowScanner] = useState(false);
    const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
    const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
    const [editingPrice, setEditingPrice] = useState<{ sku: string, price: string } | null>(null);

    const [showFab, setShowFab] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLDivElement>(null);

    // Virtualization calculations
    const [columns, setColumns] = useState(5);
    useEffect(() => {
        const updateCols = () => {
            const w = window.innerWidth;
            if (w < 640) setColumns(1);
            else if (w < 1024) setColumns(2);
            else if (w < 1280) setColumns(4);
            else setColumns(5);
        };
        updateCols();
        window.addEventListener('resize', updateCols);
        return () => window.removeEventListener('resize', updateCols);
    }, []);

    const productsMap = useMemo(() => {
        const map = new Map<string, Product>();
        if (products) {
            products.forEach(p => map.set(p.sku, p));
        }
        return map;
    }, [products]);

    const materialsMap = useMemo(() => {
        const map = new Map<string, Material>();
        if (materials) {
            materials.forEach(material => map.set(material.id, material));
        }
        return map;
    }, [materials]);

    const baseProducts = useMemo(() => {
        if (!products) return [];
        return products.filter(p => showStxOnly ? p.is_component : !p.is_component);
    }, [products, showStxOnly]);

    const stoneMaterialIds = useMemo(() => {
        if (!materials) return new Set<string>();
        return new Set(materials.filter(m => m.type === 'Stone').map(m => m.id));
    }, [materials]);

    const searchableProducts = useMemo(() => {
        return buildSearchableProducts(baseProducts, stoneMaterialIds);
    }, [baseProducts, stoneMaterialIds]);

    const deferredSearchTerm = React.useDeferredValue(searchTerm);

    const groupedCategories = useMemo(() => {
        return getGroupedProductCategories(baseProducts);
    }, [baseProducts]);

    // Compute distinct stone codes (from variant suffixes) present in gender-filtered base products
    const availableStones = useMemo(() => {
        return getAvailableRegistryStones(searchableProducts, filterGender);
    }, [searchableProducts, filterGender]);

    const filteredProducts = useMemo(() => {
        return filterRegistryProducts(searchableProducts, {
            category: filterCategory,
            gender: filterGender,
            searchTerm: deferredSearchTerm,
            stone: subFilters.stone,
            plating: subFilters.plating,
            productionType: subFilters.productionType,
            collection: subFilters.collection,
            sortBy,
        });
    }, [searchableProducts, deferredSearchTerm, filterCategory, filterGender, subFilters, sortBy]);

    // Pagination state for table mode
    const [tablePage, setTablePage] = useState(0);
    const TABLE_PAGE_SIZE = 50;

    // Reset page when filters change
    useEffect(() => { setTablePage(0); }, [filteredProducts, viewMode]);

    const allTableVariants = useMemo(() => {
        if (viewMode !== 'table') return [];
        return filteredProducts.flatMap((product) => {
            if (product.variants && product.variants.length > 0) {
                return product.variants.map((variant) => ({
                    masterSku: product.sku,
                    variantSku: `${product.sku}${variant.suffix}`,
                    product,
                    variant,
                    label: variant.description || variant.suffix || 'Λουστρέ',
                    image: product.image_url
                }));
            }

            return [{
                masterSku: product.sku,
                variantSku: product.sku,
                product,
                variant: null,
                label: 'Βασικό',
                image: product.image_url
            }];
        });
    }, [filteredProducts, viewMode]);

    const printableSkuMap = useMemo(() => buildPrintableSkuMap(products), [products]);

    // Grid pagination
    const [gridPage, setGridPage] = useState(0);
    const GRID_PAGE_SIZE = 60;

    // Reset pages when filters change
    useEffect(() => { setTablePage(0); setGridPage(0); }, [filteredProducts, viewMode]);

    const pagedProducts = useMemo(() => {
        const start = gridPage * GRID_PAGE_SIZE;
        return filteredProducts.slice(start, start + GRID_PAGE_SIZE);
    }, [filteredProducts, gridPage]);

    const totalGridPages = Math.ceil(filteredProducts.length / GRID_PAGE_SIZE);

    // Only the current page slice is fed to the virtualizer
    const tableVariantRows = useMemo(() => {
        const start = tablePage * TABLE_PAGE_SIZE;
        return allTableVariants.slice(start, start + TABLE_PAGE_SIZE);
    }, [allTableVariants, tablePage]);

    const totalTablePages = Math.ceil(allTableVariants.length / TABLE_PAGE_SIZE);

    const tableVariants = useMemo(() => {
        if (!settings || !materials || !products) return [] as TableVariant[];
        return buildRegistryTableVariants(tableVariantRows, settings, materials, products, productsMap, materialsMap);
    }, [tableVariantRows, settings, materials, products, productsMap, materialsMap]);

    const rowCount = tableVariants.length;

    const rowVirtualizer = useVirtualizer({
        count: rowCount,
        getScrollElement: () => scrollContainerRef.current,
        estimateSize: () => 72,
        overscan: 5,
    });

    useEffect(() => {
        setSelectedSkus(new Set());
    }, [viewMode, showStxOnly]);

    useEffect(() => {
        const scrollContainer = document.querySelector('main > div.overflow-y-auto');
        if (!scrollContainer) return;
        const handleScroll = () => {
            if (headerRef.current) {
                const headerBottomPosition = headerRef.current.getBoundingClientRect().bottom;
                setShowFab(headerBottomPosition < 20);
            }
        };
        scrollContainer.addEventListener('scroll', handleScroll);
        return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }, []);

    const handleGlobalScan = (code: string) => {
        if (!products) return;
        const match = findProductByScannedCode(code, products);
        if (match) {
            setSelectedProduct(match.product);
            setShowScanner(false);
        } else {
            showToast(`Ο κωδικός ${code} δεν βρέθηκε.`, 'error');
        }
    };

    if (loadingProducts || loadingMaterials || loadingMolds || !settings || !products || !materials || !molds || !collections) {
        return null;
    }

    const toggleSelection = (sku: string) => {
        const newSet = new Set(selectedSkus);
        if (newSet.has(sku)) newSet.delete(sku);
        else newSet.add(sku);
        setSelectedSkus(newSet);
    };

    const handleSelectAll = () => {
        if (viewMode === 'table') {
            if (selectedSkus.size === tableVariants.length) {
                setSelectedSkus(new Set());
            } else {
                setSelectedSkus(new Set(tableVariants.map(t => t.variantSku)));
            }
        } else {
            if (selectedSkus.size === filteredProducts.length) {
                setSelectedSkus(new Set());
            } else {
                setSelectedSkus(new Set(filteredProducts.map(p => p.sku)));
            }
        }
    };

    const handleBulkPrint = (format: 'standard' | 'retail') => {
        if (!setPrintItems || !products || !settings || !materials) return;
        const itemsToPrint = Array.from(selectedSkus).map(sku => {
            const printable = printableSkuMap.get(sku);
            if (!printable) return null;
            return { product: printable.product, variant: printable.variant, quantity: 1, format };
        }).filter(Boolean) as any[];
        setPrintItems(itemsToPrint);
        setSelectedSkus(new Set());
        setShowPrintModal(false);
    };

    const handleSavePrice = async (sku: string) => {
        if (!editingPrice || editingPrice.sku !== sku || !products) return;
        const newPrice = parseFloat(editingPrice.price.replace(',', '.'));
        if (isNaN(newPrice) || newPrice < 0) {
            setEditingPrice(null);
            return;
        }

        if (viewMode === 'table') {
            const tableItem = tableVariants.find(t => t.variantSku === sku);
            if (tableItem) {
                const masterProduct = { ...tableItem.product };
                if (tableItem.variant && masterProduct.variants) {
                    const vIndex = masterProduct.variants.findIndex(v => v.suffix === tableItem.variant!.suffix);
                    if (vIndex !== -1) {
                        const newVariants = [...masterProduct.variants];
                        newVariants[vIndex] = { ...newVariants[vIndex], selling_price: newPrice };
                        masterProduct.variants = newVariants;
                        try {
                            await productsRepository.saveProduct(masterProduct);
                            invalidateProductsAndCatalog(queryClient);
                            showToast(`Η τιμή για ${sku} αποθηκεύτηκε`, 'success');
                        } catch (e) {
                            showToast('Σφάλμα αποθήκευσης τιμής', 'error');
                        }
                    }
                } else {
                    masterProduct.selling_price = newPrice;
                    try {
                        await productsRepository.saveProduct(masterProduct);
                        invalidateProductsAndCatalog(queryClient);
                        showToast(`Η τιμή για ${sku} αποθηκεύτηκε`, 'success');
                    } catch (e) {
                        showToast('Σφάλμα αποθήκευσης τιμής', 'error');
                    }
                }
            }
        } else {
            const product = products.find(p => p.sku === sku);
            if (product && product.selling_price !== newPrice) {
                try {
                    await productsRepository.saveProduct({ ...product, selling_price: newPrice });
                    invalidateProductsAndCatalog(queryClient);
                    showToast(`Η τιμή για ${sku} αποθηκεύτηκε`, 'success');
                } catch (error) {
                    showToast('Σφάλμα αποθήκευσης τιμής', 'error');
                }
            }
        }
        setEditingPrice(null);
    };

    if (isCreating) {
        return <NewProduct
            products={products}
            materials={materials}
            molds={molds}
            duplicateTemplate={productToDuplicate || undefined}
            onCancel={() => {
                setIsCreating(false);
                setProductToDuplicate(null);
            }}
        />;
    }

    return (
        <div className="flex flex-col space-y-6">
            <div ref={headerRef} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col gap-6 shrink-0">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        <h1 className="text-3xl font-bold text-[#060b00] tracking-tight flex items-center gap-3">
                            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                                <Database size={24} />
                            </div>
                            Μητρώο Κωδικών
                        </h1>
                        <p className="text-slate-500 mt-1 ml-14">
                            {showStxOnly ? `Προβολή εξαρτημάτων (STX).` : `Διαχείριση προδιαγραφών και κοστολόγησης.`}
                        </p>
                    </div>
                    <div className="flex items-center gap-3 self-stretch md:self-auto w-full md:w-auto">
                        <div className="flex bg-slate-100 p-1 rounded-xl">
                            <button onClick={() => setViewMode('grid')} className={`p-2.5 flex items-center justify-center rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                                <LayoutGrid size={20} />
                            </button>
                            <button onClick={() => setViewMode('table')} className={`p-2.5 flex items-center justify-center rounded-lg transition-all ${viewMode === 'table' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                                <List size={20} />
                            </button>
                        </div>
                        <div className="w-px h-8 bg-slate-200 hidden md:block mx-1"></div>
                        <div className="flex bg-slate-100 p-1 rounded-xl">
                            <button onClick={() => setShowStxOnly(false)} className={`px-4 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${!showStxOnly ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                <Database size={16} /> Προϊόντα
                            </button>
                            <button onClick={() => setShowStxOnly(true)} className={`px-4 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${showStxOnly ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                <Puzzle size={16} /> Εξαρτήματα
                            </button>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setShowScanner(true)} className="flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-600 px-5 py-3 rounded-xl font-bold transition-all shadow-sm hover:bg-slate-50">
                                <Camera size={20} /> <span className="hidden sm:inline">Σάρωση</span>
                            </button>
                            <button onClick={() => setIsCreating(true)} className="flex items-center justify-center gap-2 bg-[#060b00] hover:bg-black text-white px-5 py-3 rounded-xl font-bold transition-all shadow-md hover:shadow-lg">
                                <PackagePlus size={20} /> <span className="whitespace-nowrap">Νέο</span>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row gap-4 items-center">
                    <div className="relative group flex-1 w-full">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors" size={20} />
                        <input type="text" placeholder="Αναζήτηση Κωδικού (π.χ. K14300) ή Κατηγορίας..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-12 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none w-full bg-slate-50 focus:bg-white transition-all text-slate-900 font-medium" />
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
                        <button onClick={() => setShowFiltersSidebar(true)} className={`flex-1 md:flex-none relative px-6 py-3 rounded-xl font-bold text-sm transition-all border flex items-center justify-center gap-2 ${(filterCategory !== 'All' || filterGender !== 'All' || subFilters.stone !== 'all' || subFilters.plating !== 'all') ? 'bg-[#060b00] text-white shadow-md border-black' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>
                            <Filter size={18} />
                            <span>Φίλτρα</span>
                            {(filterCategory !== 'All' || filterGender !== 'All' || subFilters.stone !== 'all' || subFilters.plating !== 'all') && (
                                <span className="flex items-center justify-center w-5 h-5 ml-1 text-[10px] bg-emerald-500 text-white rounded-full">!</span>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            <div ref={scrollContainerRef} className="overflow-y-auto custom-scrollbar pr-1 relative" style={{ maxHeight: 'calc(100dvh - 16rem)' }}>
                {viewMode === 'grid' ? (
                    /* ── GRID (PAGINATED) ── */
                    filteredProducts.length > 0 ? (
                        <div
                            className="grid gap-6"
                            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
                        >
                            {pagedProducts.map(product => (
                                <div key={product.sku}>
                                    <ProductCard
                                        product={product}
                                        settings={settings}
                                        materials={materials}
                                        allProducts={products}
                                        productsMap={productsMap}
                                        materialsMap={materialsMap}
                                        onSelectProduct={setSelectedProduct}
                                        isSelected={selectedSkus.has(product.sku)}
                                    />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-20 text-slate-400">
                            <Database size={48} className="mx-auto mb-4 opacity-20" />
                            <p className="font-medium">Δεν βρέθηκαν κωδικοί με αυτά τα κριτήρια.</p>
                        </div>
                    )
                ) : (
                    /* ── TABLE (VIRTUALIZED) ── */
                    allTableVariants.length > 0 ? (
                        <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                                const item = tableVariants[virtualRow.index];
                                if (!item) return null;
                                const isSelected = selectedSkus.has(item.variantSku);
                                const profit = item.price - item.cost;
                                const margin = item.price > 0 ? (profit / item.price) * 100 : 0;

                                const prevItem = virtualRow.index > 0 ? tableVariants[virtualRow.index - 1] : null;
                                const isFirstInTeam = !prevItem || prevItem.masterSku !== item.masterSku;

                                return (
                                    <div key={item.variantSku} className="absolute top-0 left-0 w-full" style={{ height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)` }}>
                                        <div className={`flex items-center justify-between p-4 bg-white border-b border-slate-100 hover:bg-slate-50 transition-colors h-[72px] ${isSelected ? 'bg-emerald-50/50' : ''}`}>
                                            <div className="flex items-center gap-4 flex-1">
                                                <button onClick={(e) => { e.stopPropagation(); toggleSelection(item.variantSku); }} className={`text-slate-400 hover:text-emerald-600 transition-colors ${isSelected ? 'text-emerald-600' : ''}`}>
                                                    <CheckSquare size={20} className={isSelected ? 'fill-emerald-100' : ''} />
                                                </button>
                                                <div className={`h-12 w-12 rounded-lg shrink-0 cursor-pointer flex items-center justify-center ${isFirstInTeam ? 'bg-slate-100 overflow-hidden' : ''}`} onClick={() => setSelectedProduct(item.product)}>
                                                    {isFirstInTeam ? (
                                                        item.image ? <img src={item.image} alt={item.variantSku} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon size={16} /></div>
                                                    ) : (
                                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-100"></div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0 pr-4 cursor-pointer" onClick={() => setSelectedProduct(item.product)}>
                                                    <div className="font-black text-slate-800 text-sm truncate flex items-center gap-2">
                                                        <SkuColorizedText sku={item.variantSku} gender={item.product.gender} />
                                                    </div>
                                                    <div className="text-xs text-slate-500 truncate flex items-center gap-2">
                                                        {isFirstInTeam && (
                                                            <>
                                                                <span>{item.product.category}</span>
                                                                <span className="text-slate-300">•</span>
                                                            </>
                                                        )}
                                                        <span className="font-medium text-slate-600">{item.label}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="hidden md:flex items-center gap-8 px-4 flex-1 justify-center">
                                                <div className="text-center w-16">
                                                    {isFirstInTeam && (
                                                        <>
                                                            <div className="text-[10px] uppercase font-bold text-slate-400">Βάρος</div>
                                                            <div className="text-sm font-bold text-slate-700">
                                                                {item.weight.toFixed(2)}g
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                                <div className="text-center relative group/cost cursor-help">
                                                    <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center justify-center gap-1">
                                                        Κόστος <Info size={8} />
                                                    </div>
                                                    <div className="text-sm font-bold text-slate-700">{formatCurrency(item.cost)}</div>

                                                    {/* Detailed Cost Tooltip */}
                                                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover/cost:block z-[100] w-56 bg-[#060b00] text-white p-4 rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 border border-white/10 ring-1 ring-white/5">
                                                        <div className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-3 border-b border-white/10 pb-1.5">Ανάλυση Κόστους</div>
                                                        <div className="space-y-2">
                                                            <div className="flex justify-between text-[11px]">
                                                                <span className="text-white/50">Μέταλλο:</span>
                                                                <span className="font-bold">{formatCurrency(item.costBreakdown.silver)}</span>
                                                            </div>

                                                            {/* Analytical Labor Breakdown */}
                                                            {item.costBreakdown.details.casting_cost > 0 && (
                                                                <div className="flex justify-between text-[11px]">
                                                                    <span className="text-white/50">Χυτήριο:</span>
                                                                    <span className="font-bold">{formatCurrency(item.costBreakdown.details.casting_cost)}</span>
                                                                </div>
                                                            )}

                                                            {item.costBreakdown.details.technician_cost > 0 && (
                                                                <div className="flex justify-between text-[11px]">
                                                                    <span className="text-white/50">Τεχνίτης:</span>
                                                                    <span className="font-bold">{formatCurrency(item.costBreakdown.details.technician_cost)}</span>
                                                                </div>
                                                            )}

                                                            {item.costBreakdown.details.plating_cost > 0 && (
                                                                <div className="flex justify-between text-[11px]">
                                                                    <span className="text-white/50">Επιμετάλλωση:</span>
                                                                    <span className="font-bold">{formatCurrency(item.costBreakdown.details.plating_cost)}</span>
                                                                </div>
                                                            )}

                                                            {item.costBreakdown.materials > 0 && (
                                                                <div className="flex justify-between text-[11px]">
                                                                    <span className="text-white/50">Πέτρες / Υλικά:</span>
                                                                    <span className="font-bold">{formatCurrency(item.costBreakdown.materials)}</span>
                                                                </div>
                                                            )}

                                                            {item.costBreakdown.details.setter_cost > 0 && (
                                                                <div className="flex justify-between text-[11px]">
                                                                    <span className="text-white/50">Καρφωτικά:</span>
                                                                    <span className="font-bold">{formatCurrency(item.costBreakdown.details.setter_cost)}</span>
                                                                </div>
                                                            )}

                                                            {(item.costBreakdown.details.subcontract_cost > 0 || item.costBreakdown.details.components > 0) && (
                                                                <div className="flex justify-between text-[11px]">
                                                                    <span className="text-white/50">Φασόν / STX:</span>
                                                                    <span className="font-bold">{formatCurrency((item.costBreakdown.details.subcontract_cost || 0) + (item.costBreakdown.details.components || 0))}</span>
                                                                </div>
                                                            )}

                                                            <div className="pt-2 mt-2 border-t border-white/10 flex justify-between text-xs font-black text-emerald-400">
                                                                <span className="uppercase tracking-wider">Σύνολο:</span>
                                                                <span>{formatCurrency(item.cost)}</span>
                                                            </div>
                                                        </div>
                                                        {/* Tooltip Arrow */}
                                                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-[#060b00]"></div>
                                                    </div>
                                                </div>
                                                <div className="text-center">
                                                    <div className="text-[10px] uppercase font-bold text-slate-400">Περιθώριο</div>
                                                    <div className={`text-sm font-bold flex items-center gap-1 justify-center ${margin < 30 ? 'text-red-500' : 'text-emerald-600'}`}>
                                                        <TrendingUp size={12} /> {margin.toFixed(0)}%
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-end flex-1 min-w-[120px]">
                                                <div className="text-right flex flex-col items-end">
                                                    <div className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Χονδρικη</div>
                                                    {editingPrice?.sku === item.variantSku ? (
                                                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                                            <button
                                                                title="Υπολογισμός με Ilios Formula (Προτεινόμενη Τιμή)"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setEditingPrice({ sku: item.variantSku, price: item.suggestedPrice.toString() });
                                                                }}
                                                                className="p-1 rounded bg-amber-50 text-amber-500 hover:bg-amber-100 hover:text-amber-600 transition-colors border border-amber-200 mr-1"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08" /><path d="M7.07 14.94L5.5 16.5a2.85 2.85 0 0 0 4.03 4.03l1.56-1.57" /><path d="m3.46 10.54.92.92" /><path d="m11.54 3.46.92.92" /><path d="m4.46  4.46 1.84 1.84" /><path d="m17.7 17.7 1.84 1.84" /></svg>
                                                            </button>
                                                            <input autoFocus type="text" className="w-20 text-right font-black text-lg bg-emerald-50 text-emerald-700 border border-emerald-500 rounded-lg px-2 py-1 outline-none"
                                                                value={editingPrice.price}
                                                                onChange={e => setEditingPrice({ sku: item.variantSku, price: e.target.value })}
                                                                onKeyDown={e => { if (e.key === 'Enter') handleSavePrice(item.variantSku); if (e.key === 'Escape') setEditingPrice(null); }}
                                                                onBlur={() => handleSavePrice(item.variantSku)}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <div className="text-lg font-black text-slate-900 group relative flex items-center justify-end gap-2 cursor-pointer hover:text-emerald-600 transition-colors"
                                                            onClick={(e) => { e.stopPropagation(); setEditingPrice({ sku: item.variantSku, price: item.price.toString() }); }}>
                                                            {formatCurrency(item.price)}
                                                            <Edit3 size={12} className="opacity-0 group-hover:opacity-100 absolute -left-4 text-emerald-500 transition-opacity" />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-20 text-slate-400">
                            <Database size={48} className="mx-auto mb-4 opacity-20" />
                            <p className="font-medium">Δεν βρέθηκαν κωδικοί με αυτά τα κριτήρια.</p>
                        </div>
                    )
                )}
            </div>

            {/* Grid Pagination Controls */}
            {viewMode === 'grid' && totalGridPages > 1 && (
                <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-white border border-slate-100 rounded-2xl shadow-sm pr-52">
                    <span className="text-xs font-bold text-slate-400">
                        {filteredProducts.length} προϊόντα · σελίδα {gridPage + 1} / {totalGridPages}
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => { setGridPage(p => Math.max(0, p - 1)); scrollContainerRef.current?.scrollTo({ top: 0 }); }}
                            disabled={gridPage === 0}
                            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-30 transition-all"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        {getPaginationRange(gridPage, totalGridPages).map((val, idx) => (
                            val === '...' ? (
                                <span key={`sep-${idx}`} className="px-1 text-slate-300 font-bold text-xs select-none">...</span>
                            ) : (
                                <button
                                    key={val}
                                    onClick={() => { setGridPage(val as number); scrollContainerRef.current?.scrollTo({ top: 0 }); }}
                                    className={`w-8 h-8 rounded-xl text-xs font-black transition-all ${val === gridPage ? 'bg-[#060b00] text-white shadow' : 'hover:bg-slate-100 text-slate-500'}`}
                                >
                                    {(val as number) + 1}
                                </button>
                            )
                        ))}
                        <button
                            onClick={() => { setGridPage(p => Math.min(totalGridPages - 1, p + 1)); scrollContainerRef.current?.scrollTo({ top: 0 }); }}
                            disabled={gridPage >= totalGridPages - 1}
                            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-30 transition-all"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* Table Pagination Controls */}
            {viewMode === 'table' && totalTablePages > 1 && (
                <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-white border border-slate-100 rounded-2xl shadow-sm pr-52">
                    <span className="text-xs font-bold text-slate-400">
                        {allTableVariants.length} παραλλαγές · σελίδα {tablePage + 1} / {totalTablePages}
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => { setTablePage(p => Math.max(0, p - 1)); scrollContainerRef.current?.scrollTo({ top: 0 }); }}
                            disabled={tablePage === 0}
                            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-30 transition-all"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        {getPaginationRange(tablePage, totalTablePages).map((val, idx) => (
                            val === '...' ? (
                                <span key={`sep-${idx}`} className="px-1 text-slate-300 font-bold text-xs select-none">...</span>
                            ) : (
                                <button
                                    key={val}
                                    onClick={() => { setTablePage(val as number); scrollContainerRef.current?.scrollTo({ top: 0 }); }}
                                    className={`w-8 h-8 rounded-xl text-xs font-black transition-all ${val === tablePage ? 'bg-[#060b00] text-white shadow' : 'hover:bg-slate-100 text-slate-500'
                                        }`}
                                >
                                    {(val as number) + 1}
                                </button>
                            )
                        ))}
                        <button
                            onClick={() => { setTablePage(p => Math.min(totalTablePages - 1, p + 1)); scrollContainerRef.current?.scrollTo({ top: 0 }); }}
                            disabled={tablePage >= totalTablePages - 1}
                            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-30 transition-all"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )}

            {selectedProduct && (
                <ProductDetails
                    product={selectedProduct}
                    allProducts={products}
                    allMaterials={materials}
                    onClose={() => setSelectedProduct(null)}
                    setPrintItems={setPrintItems || (() => { })}
                    settings={settings}
                    collections={collections}
                    allMolds={molds}
                    viewMode="registry"
                    onDuplicate={(prod) => {
                        setProductToDuplicate(prod);
                        setSelectedProduct(null);
                        setIsCreating(true);
                    }}
                />
            )}

            {showScanner && <BarcodeScanner onScan={handleGlobalScan} onClose={() => setShowScanner(false)} />}

            {viewMode === 'table' && selectedSkus.size > 0 && (
                <div className="fixed bottom-0 left-0 right-0 md:left-72 z-[100] bg-white border-t border-slate-200 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] p-4 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in slide-in-from-bottom-8">
                    <div className="flex items-center gap-4">
                        <div className="bg-emerald-100 text-emerald-700 px-4 py-2 rounded-xl font-black text-lg">
                            {selectedSkus.size} <span className="text-emerald-600/70 text-sm font-bold">Επιλεγμένα</span>
                        </div>
                        <button onClick={() => setSelectedSkus(new Set())} className="text-slate-500 hover:text-slate-800 font-bold text-sm transition-colors">
                            Ακύρωση
                        </button>
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <button onClick={handleSelectAll} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors">
                            <CheckSquare size={18} /> {selectedSkus.size === filteredProducts.length ? 'Αποεπιλογή' : 'Όλα'}
                        </button>
                        <button onClick={() => setShowPrintModal(true)} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold bg-[#060b00] hover:bg-black text-white shadow-lg transition-all hover:-translate-y-0.5">
                            <Printer size={18} /> Εκτύπωση
                        </button>
                    </div>
                </div>
            )}

            <div className={`fixed bottom-8 right-8 z-50 transition-all duration-300 ${showFab && selectedSkus.size === 0 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
                <button onClick={() => setIsCreating(true)} className="flex items-center justify-center gap-3 bg-[#060b00] text-white rounded-full font-bold shadow-2xl hover:bg-black transition-all duration-200 ease-in-out transform hover:-translate-y-1 hover:scale-105 h-16 w-16 sm:w-auto sm:h-auto sm:px-6 sm:py-4">
                    <PackagePlus size={24} /> <span className="hidden sm:inline whitespace-nowrap">Νέο Προϊόν</span>
                </button>
            </div>

            {/* Print Format Modal */}
            {showPrintModal && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowPrintModal(false)}>
                    <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm text-center animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                        <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
                            <Printer size={28} className="text-slate-700" />
                        </div>
                        <h3 className="text-xl font-black text-slate-800 mb-1">Εκτύπωση Ετικετών</h3>
                        <p className="text-sm text-slate-400 mb-6">{selectedSkus.size} κωδικοί επιλεγμένοι</p>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => handleBulkPrint('standard')}
                                className="flex flex-col items-center gap-2 p-5 rounded-2xl border-2 border-slate-200 hover:border-slate-900 hover:bg-slate-50 transition-all group"
                            >
                                <span className="text-3xl">🏷️</span>
                                <span className="font-black text-slate-800 text-sm">Χονδρική</span>
                                <span className="text-[10px] text-slate-400 font-medium">Τιμή χονδρικής</span>
                            </button>
                            <button
                                onClick={() => handleBulkPrint('retail')}
                                className="flex flex-col items-center gap-2 p-5 rounded-2xl border-2 border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all group"
                            >
                                <span className="text-3xl">🛍️</span>
                                <span className="font-black text-slate-800 text-sm">Λιανική</span>
                                <span className="text-[10px] text-slate-400 font-medium">Τιμή λιανικής</span>
                            </button>
                        </div>
                        <button onClick={() => setShowPrintModal(false)} className="mt-4 text-xs text-slate-400 hover:text-slate-600 font-bold transition-colors">Ακύρωση</button>
                    </div>
                </div>
            )}

            {/* Sidebar Filters Drawer */}
            {showFiltersSidebar && (
                <div className="fixed inset-0 z-[200] flex justify-end bg-slate-900/20 backdrop-blur-sm transition-opacity" onClick={() => setShowFiltersSidebar(false)}>
                    <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-6 border-b border-slate-100">
                            <h2 className="text-xl font-bold flex items-center gap-2"><Filter size={20} /> Προηγμένα Φίλτρα</h2>
                            <button onClick={() => setShowFiltersSidebar(false)} className="p-2 text-slate-400 hover:text-slate-700 bg-slate-100 rounded-full transition-colors"><X size={16} /></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                            {!showStxOnly && (
                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Φύλο / Είδος</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {genderFilters.map(f => (
                                            <button
                                                key={f.value}
                                                onClick={() => setFilterGender(f.value)}
                                                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-sm transition-all border ${filterGender === f.value ? 'bg-[#060b00] text-white border-black' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                                            >
                                                {f.icon} {f.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-3">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Κατηγορία</label>
                                <div className="space-y-1 border border-slate-200 rounded-xl overflow-hidden bg-white max-h-60 overflow-y-auto custom-scrollbar">
                                    <div
                                        className={`px-4 py-3 text-sm font-bold cursor-pointer transition-colors ${filterCategory === 'All' ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-slate-50 text-slate-700'}`}
                                        onClick={() => setFilterCategory('All')}
                                    >Όλες οι Κατηγορίες</div>
                                    {groupedCategories.parents.map(c => (
                                        <div key={c}>
                                            <div
                                                className={`px-4 py-3 text-sm font-bold border-t border-slate-100 cursor-pointer transition-colors ${filterCategory === c ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-slate-50 text-slate-700 bg-slate-50/50'}`}
                                                onClick={() => setFilterCategory(c)}
                                            >
                                                {c}
                                            </div>
                                            {(groupedCategories.children.get(c) || new Set()).size > 0 && Array.from(groupedCategories.children.get(c) as Set<string>).map(subC => (
                                                <div
                                                    key={subC}
                                                    className={`px-4 py-2 pl-8 text-sm cursor-pointer transition-colors ${filterCategory === subC ? 'bg-emerald-50/50 text-emerald-700 font-bold' : 'hover:bg-slate-50 text-slate-600'}`}
                                                    onClick={() => setFilterCategory(subC as string)}
                                                >
                                                    - {(subC as string).replace(c, '').trim()}
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* ── Πέτρες ── */}
                            <div className="space-y-3">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1"><Gem size={14} /> Πέτρες</label>
                                {/* Quick toggles */}
                                <div className="flex gap-2 flex-wrap">
                                    {stoneFilters.map(f => (
                                        <SubFilterButton key={f.value} label={f.label} value={f.value} activeValue={subFilters.stone !== 'all' && subFilters.stone !== 'with' && subFilters.stone !== 'without' ? '_specific_' : subFilters.stone} onClick={(v) => setSubFilters(p => ({ ...p, stone: v }))} />
                                    ))}
                                </div>
                                {/* Dynamic stone chips */}
                                {availableStones.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {availableStones.map(s => {
                                            const style = getStoneChipStyle(s.id);
                                            const isActive = subFilters.stone === s.id;
                                            return (
                                                <button
                                                    key={s.id}
                                                    onClick={() => setSubFilters(p => ({ ...p, stone: isActive ? 'all' : s.id }))}
                                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-bold border transition-all ${isActive
                                                        ? `${style.bg} ${style.text} border-current ring-2 ring-offset-1 ring-current/30 shadow`
                                                        : `${style.bg} ${style.text} border-transparent hover:border-current/40 opacity-80 hover:opacity-100`
                                                        }`}
                                                >
                                                    <span className={`w-2 h-2 rounded-full ${style.dot} shrink-0`}></span>
                                                    {s.name}
                                                    <span className="opacity-50 text-[10px]">({s.count})</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* ── Φινίρισμα ── */}
                            <div className="space-y-3">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1"><Palette size={14} /> Φινίρισμα</label>
                                <div className="flex flex-wrap gap-2">
                                    {platingFilters.map(f => (
                                        <SubFilterButton key={f.value} label={f.label} value={f.value} activeValue={subFilters.plating} onClick={(v) => setSubFilters(p => ({ ...p, plating: v }))} />
                                    ))}
                                </div>
                            </div>

                            {/* ── Τύπος Παραγωγής ── */}
                            {!showStxOnly && (
                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1"><Factory size={14} /> Τύπος Παραγωγής</label>
                                    <div className="flex gap-2">
                                        {[
                                            { label: 'Όλα', value: 'all', icon: null },
                                            { label: 'Ιδιοπαραγωγή', value: 'InHouse', icon: <Factory size={12} /> },
                                            { label: 'Εισαγωγή', value: 'Imported', icon: <ShoppingBag size={12} /> },
                                        ].map(f => (
                                            <button
                                                key={f.value}
                                                onClick={() => setSubFilters(p => ({ ...p, productionType: f.value }))}
                                                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-sm transition-all border flex-1 justify-center ${subFilters.productionType === f.value
                                                    ? 'bg-[#060b00] text-white border-black'
                                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                                    }`}
                                            >
                                                {f.icon} {f.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* ── Ταξινόμηση ── */}
                            <div className="space-y-3">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1"><List size={14} /> Ταξινόμηση</label>
                                <div className="flex gap-2">
                                    {[
                                        { label: 'Κωδικός', value: 'sku' },
                                        { label: 'Ημερομηνία Δημιουργίας', value: 'created_at' },
                                    ].map(f => (
                                        <button
                                            key={f.value}
                                            onClick={() => setSortBy(f.value as 'sku' | 'created_at')}
                                            className={`flex-1 px-4 py-2.5 rounded-xl font-bold text-sm transition-all border ${sortBy === f.value
                                                ? 'bg-[#060b00] text-white border-black'
                                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                                }`}
                                        >
                                            {f.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* ── Συλλογή ── */}
                            {!showStxOnly && collections && collections.length > 0 && (
                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1"><FolderOpen size={14} /> Συλλογή</label>
                                    <div className="flex flex-wrap gap-2">
                                        <SubFilterButton label="Όλες" value="all" activeValue={subFilters.collection} onClick={(v) => setSubFilters(p => ({ ...p, collection: v }))} />
                                        {collections.map(col => (
                                            <SubFilterButton
                                                key={col.id}
                                                label={col.name}
                                                value={String(col.id)}
                                                activeValue={subFilters.collection}
                                                onClick={(v) => setSubFilters(p => ({ ...p, collection: v }))}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3">
                            <button
                                onClick={() => {
                                    setFilterGender('All');
                                    setFilterCategory('All');
                                    setSubFilters({ stone: 'all', plating: 'all', productionType: 'all', collection: 'all' });
                                    setSortBy('sku');
                                }}
                                className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
                            >
                                Καθαρισμός
                            </button>
                            <button
                                onClick={() => setShowFiltersSidebar(false)}
                                className="flex-[2] px-4 py-3 rounded-xl font-bold text-white bg-[#060b00] hover:bg-black transition-colors shadow-md"
                            >
                                Εφαρμογή ({filteredProducts.length})
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
