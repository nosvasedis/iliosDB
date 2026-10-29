import { useRestartDraft } from '../hooks/useRestartBlocker';
import { formatDecimal, formatNumber } from '../utils/numberFormat';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Product, ProductVariant, GlobalSettings, Collection, Material, Mold, Gender, PlatingType, ProductionType } from '../types';
import { Search, Layers, Database, ImageIcon, User, Users as UsersIcon, Edit3, TrendingUp, Tag, Puzzle, Gem, Palette, X, LayoutGrid, List, CheckSquare, Printer, Factory, ShoppingBag, FolderOpen, Lock, ChevronLeft, ChevronRight, Plus, ScanLine, SlidersHorizontal, Sparkles } from 'lucide-react';
import ProductDetails from './ProductDetails';
import NewProduct from './NewProduct';
import BarcodeScanner from './BarcodeScanner';
import SkuColorizedText from './SkuColorizedText';
import ProductCard from './ProductRegistry/ProductCard';
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
import { PrintLabelItem } from '../features/printing';
import { resolveSellingPriceManualOverride } from '../utils/bulkPricingPreview';
import DesktopPageHeader, { HeaderPrimaryButton } from './DesktopPageHeader';
import { resolveInvoiceTotalWeight, type InvoiceTotalWeightResult } from '../utils/invoiceTotalWeight';
import {
    buildPrintableSkuMap,
    buildRegistryTableVariants,
    buildSearchableProducts,
    filterRegistryProducts,
    getAvailableRegistryStones,
    getGroupedProductCategories,
    getStoneChipStyle,
    RegistrySortSelect,
    SKIP_CASTING_LABEL,
    formatRegistryWeight,
    type RegistrySortMode,
} from '../features/products';
import EmptyState from './ui/EmptyState';
import { consumeRegistrySku } from '../utils/registryHandoff';

interface Props {
    setPrintItems?: (items: PrintLabelItem[]) => void;
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
    invoiceWeight: InvoiceTotalWeightResult;
    image: string | null;
}

const genderFilters: { label: string; value: 'All' | Gender; icon: React.ReactNode }[] = [
    { label: 'Όλα', value: 'All', icon: <Layers size={16} /> },
    { label: 'Ανδρικά', value: Gender.Men, icon: <User size={16} /> },
    { label: 'Γυναικεία', value: Gender.Women, icon: <User size={16} /> },
    { label: 'Ουδέτερα', value: Gender.Unisex, icon: <UsersIcon size={16} /> },
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

const SubFilterButton: React.FC<{
    label: string;
    value: string;
    activeValue: string;
    onClick: (value: string) => void;
}> = React.memo(({ label, value, activeValue, onClick }) => (
    <button
        onClick={() => onClick(value)}
        type="button"
        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border active:scale-95
            ${activeValue === value
                ? 'bg-[#060b00] text-white border-[#060b00] shadow-md shadow-[#060b00]/15'
                : 'bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800 border-slate-200'}
        `}
    >
        {label}
    </button>
));

const RegistryPagination: React.FC<{
    page: number;
    totalPages: number;
    summary: string;
    onPageChange: (page: number) => void;
}> = ({ page, totalPages, summary, onPageChange }) => (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-2.5 pr-52 shadow-sm backdrop-blur">
        <span className="text-xs font-bold text-slate-400">
            {summary} · σελίδα <span className="text-slate-700">{formatNumber(page + 1)}</span> / {formatNumber(totalPages)}
        </span>
        <div className="flex items-center gap-1 rounded-xl bg-slate-100/80 p-1">
            <button
                type="button"
                onClick={() => onPageChange(Math.max(0, page - 1))}
                disabled={page === 0}
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition-all hover:bg-white hover:text-slate-900 hover:shadow-sm disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:shadow-none"
                aria-label="Προηγούμενη σελίδα"
            >
                <ChevronLeft size={16} />
            </button>
            {getPaginationRange(page, totalPages).map((val, idx) => (
                val === '...' ? (
                    <span key={`sep-${idx}`} className="select-none px-1 text-xs font-bold text-slate-300">…</span>
                ) : (
                    <button
                        type="button"
                        key={val}
                        onClick={() => onPageChange(val as number)}
                        aria-current={val === page ? 'page' : undefined}
                        className={`h-8 min-w-8 rounded-lg px-2 text-xs font-black tabular-nums transition-all ${val === page ? 'bg-[#060b00] text-white shadow-md shadow-[#060b00]/20' : 'text-slate-500 hover:bg-white hover:text-slate-900 hover:shadow-sm'}`}
                    >
                        {formatNumber((val as number) + 1)}
                    </button>
                )
            ))}
            <button
                type="button"
                onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition-all hover:bg-white hover:text-slate-900 hover:shadow-sm disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:shadow-none"
                aria-label="Επόμενη σελίδα"
            >
                <ChevronRight size={16} />
            </button>
        </div>
    </div>
);

export default function ProductRegistry({ setPrintItems }: Props) {
    const queryClient = useQueryClient();
    const { showToast } = useUI();
    const { data: products, isLoading: loadingProducts } = useProducts();
    const { data: materials, isLoading: loadingMaterials } = useMaterials();
    const { data: molds, isLoading: loadingMolds } = useMolds();
    const { data: settings, isLoading: loadingSettings } = useSettings();
    const { data: collections, isLoading: loadingCollections } = useCollections();

    const [handoffSku] = useState(() => consumeRegistrySku());
    const [searchTerm, setSearchTerm] = useState(handoffSku ?? '');

    const [filterCategory, setFilterCategory] = useState<string>('All');
    const [filterGender, setFilterGender] = useState<'All' | Gender>('All');

    const [subFilters, setSubFilters] = useState({
        stone: 'all',          // 'all' | 'with' | 'without' | materialId
        plating: 'all',
        productionType: 'all', // 'all' | 'InHouse' | 'Imported'
        collection: 'all',     // 'all' | collectionId string
    });

    const [sortBy, setSortBy] = useState<RegistrySortMode>('sku_asc');

    const [showFiltersSidebar, setShowFiltersSidebar] = useState(false);
    const [showPrintModal, setShowPrintModal] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [selectedVariantSuffix, setSelectedVariantSuffix] = useState<string | undefined>(undefined);
    const [isCreating, setIsCreating] = useState(false);
    const [productToDuplicate, setProductToDuplicate] = useState<Product | null>(null);
    const [showStxOnly, setShowStxOnly] = useState(false);
    const [showScanner, setShowScanner] = useState(false);

    const handleProductSelect = useCallback((product: Product) => {
        setSelectedVariantSuffix(undefined);
        setSelectedProduct(product);
    }, []);
    const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
    const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
    const [editingPrice, setEditingPrice] = useState<{ sku: string, price: string } | null>(null);
    const [priceEditUsedFormula, setPriceEditUsedFormula] = useState<string | null>(null);

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
    useRestartDraft('Τιμή SKU', editingPrice, { enabled: !!editingPrice, identity: editingPrice?.sku });

    const GRID_PAGE_SIZE = 60;

    // Reset pages only when the actual filter/sort/view inputs change. Keying this on
    // `filteredProducts` would also reset on every realtime cache rebuild of the products
    // array (which happens even for a photo-only update), bouncing the user to page 1.
    useEffect(() => {
        setTablePage(0);
        setGridPage(0);
    }, [deferredSearchTerm, filterCategory, filterGender, subFilters, sortBy, showStxOnly, viewMode]);

    const pagedProducts = useMemo(() => {
        const start = gridPage * GRID_PAGE_SIZE;
        return filteredProducts.slice(start, start + GRID_PAGE_SIZE);
    }, [filteredProducts, gridPage]);

    const totalGridPages = Math.ceil(filteredProducts.length / GRID_PAGE_SIZE);

    // Keep the current page valid when the list shrinks (e.g. a realtime deletion).
    useEffect(() => {
        setGridPage((page) => Math.min(page, Math.max(0, totalGridPages - 1)));
    }, [totalGridPages]);

    // Only the current page slice is fed to the virtualizer
    const tableVariantRows = useMemo(() => {
        const start = tablePage * TABLE_PAGE_SIZE;
        return allTableVariants.slice(start, start + TABLE_PAGE_SIZE);
    }, [allTableVariants, tablePage]);

    const totalTablePages = Math.ceil(allTableVariants.length / TABLE_PAGE_SIZE);

    // Keep the current page valid when the list shrinks (e.g. a realtime deletion).
    useEffect(() => {
        setTablePage((page) => Math.min(page, Math.max(0, totalTablePages - 1)));
    }, [totalTablePages]);

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

    // Dashboard / other pages can hand over a SKU: open it straight away when it exists.
    const handoffResolved = useRef(false);
    useEffect(() => {
        if (!handoffSku || handoffResolved.current || !products) return;
        handoffResolved.current = true;
        const match = findProductByScannedCode(handoffSku, products);
        if (match) {
            setSelectedVariantSuffix(match.variant?.suffix);
            setSelectedProduct(match.product);
        } else {
            showToast(`Ο κωδικός ${handoffSku} δεν υπάρχει στο Μητρώο.`, 'info');
        }
    }, [handoffSku, products, showToast]);

    const handleGlobalScan = (code: string) => {
        if (!products) return;
        const match = findProductByScannedCode(code, products);
        if (match) {
            setSelectedVariantSuffix(match.variant?.suffix);
            setSelectedProduct(match.product);
            setShowScanner(false);
        } else {
            showToast(`Ο κωδικός ${code} δεν βρέθηκε.`, 'error');
        }
    };

    // "/" focuses the search box from anywhere on the page (unless typing elsewhere).
    const searchInputRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
            const target = e.target as HTMLElement | null;
            if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
            if (selectedProduct || isCreating) return;
            e.preventDefault();
            searchInputRef.current?.focus();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selectedProduct, isCreating]);

    // Summary of what is currently on screen (follows search + filters).
    const registryStats = useMemo(() => {
        let variants = 0;
        let inHouse = 0;
        let imported = 0;
        let unpriced = 0;
        filteredProducts.forEach(p => {
            variants += p.variants?.length || 0;
            if (p.production_type === ProductionType.Imported) imported++;
            else inHouse++;
            const hasPrice = (p.selling_price || 0) > 0 || (p.variants || []).some(v => (v.selling_price || 0) > 0);
            if (!p.is_component && !hasPrice) unpriced++;
        });
        return { codes: baseProducts.length, variants, inHouse, imported, unpriced };
    }, [filteredProducts, baseProducts.length]);

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
            setPriceEditUsedFormula(null);
            return;
        }

        const usedFormulaFill = priceEditUsedFormula === sku;

        if (viewMode === 'table') {
            const tableItem = tableVariants.find(t => t.variantSku === sku);
            if (tableItem) {
                const manualOverride = resolveSellingPriceManualOverride(
                    newPrice,
                    tableItem.suggestedPrice,
                    usedFormulaFill,
                );
                const masterProduct = { ...tableItem.product };
                if (tableItem.variant && masterProduct.variants) {
                    const vIndex = masterProduct.variants.findIndex(v => v.suffix === tableItem.variant!.suffix);
                    if (vIndex !== -1) {
                        const variant = masterProduct.variants[vIndex];
                        try {
                            await productsRepository.saveProductVariant({
                                product_sku: masterProduct.sku,
                                suffix: variant.suffix,
                                description: variant.description,
                                stock_qty: variant.stock_qty,
                                active_price: variant.active_price,
                                selling_price: newPrice,
                                selling_price_manual_override: manualOverride,
                            });
                            invalidateProductsAndCatalog(queryClient);
                            showToast(`Η τιμή για ${sku} αποθηκεύτηκε`, 'success');
                        } catch (e) {
                            showToast('Σφάλμα αποθήκευσης τιμής', 'error');
                        }
                    }
                } else {
                    masterProduct.selling_price = newPrice;
                    masterProduct.selling_price_manual_override = manualOverride;
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
                    await productsRepository.saveProduct({
                        ...product,
                        selling_price: newPrice,
                        selling_price_manual_override: true,
                    });
                    invalidateProductsAndCatalog(queryClient);
                    showToast(`Η τιμή για ${sku} αποθηκεύτηκε`, 'success');
                } catch (error) {
                    showToast('Σφάλμα αποθήκευσης τιμής', 'error');
                }
            }
        }
        setEditingPrice(null);
        setPriceEditUsedFormula(null);
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

    const activeFilterChips: { key: string; label: string; clear: () => void }[] = [];
    if (filterGender !== 'All') activeFilterChips.push({ key: 'gender', label: genderFilters.find(f => f.value === filterGender)?.label || filterGender, clear: () => setFilterGender('All') });
    if (filterCategory !== 'All') activeFilterChips.push({ key: 'category', label: filterCategory, clear: () => setFilterCategory('All') });
    if (subFilters.stone !== 'all') activeFilterChips.push({
        key: 'stone',
        label: stoneFilters.find(f => f.value === subFilters.stone)?.label || availableStones.find(st => st.id === subFilters.stone)?.name || subFilters.stone,
        clear: () => setSubFilters(p => ({ ...p, stone: 'all' })),
    });
    if (subFilters.plating !== 'all') activeFilterChips.push({ key: 'plating', label: platingFilters.find(f => f.value === subFilters.plating)?.label || subFilters.plating, clear: () => setSubFilters(p => ({ ...p, plating: 'all' })) });
    if (subFilters.productionType !== 'all') activeFilterChips.push({ key: 'productionType', label: subFilters.productionType === 'InHouse' ? 'Ιδιοπαραγωγή' : 'Εισαγωγή', clear: () => setSubFilters(p => ({ ...p, productionType: 'all' })) });
    if (subFilters.collection !== 'all') activeFilterChips.push({ key: 'collection', label: collections.find(c => String(c.id) === subFilters.collection)?.name || 'Συλλογή', clear: () => setSubFilters(p => ({ ...p, collection: 'all' })) });
    const clearAllFilters = () => {
        setFilterGender('All');
        setFilterCategory('All');
        setSubFilters({ stone: 'all', plating: 'all', productionType: 'all', collection: 'all' });
    };

    const segmentBase = 'relative flex items-center justify-center gap-2 rounded-[10px] text-sm font-bold transition-all duration-200';
    const segmentOn = 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.08),0_4px_12px_-4px_rgba(15,23,42,0.12)] ring-1 ring-slate-900/5';
    const segmentOff = 'text-slate-500 hover:bg-white/60 hover:text-slate-800';

    return (
        <div className="flex flex-col space-y-5">
            <DesktopPageHeader
                ref={headerRef}
                icon={showStxOnly ? Puzzle : Database}
                title="Μητρώο Κωδικών"
                subtitle={showStxOnly ? 'Προβολή εξαρτημάτων (STX).' : 'Διαχείριση προδιαγραφών και κοστολόγησης.'}
                tailClassName="flex w-full min-w-0 flex-1 flex-wrap items-center gap-2.5 lg:ml-auto lg:max-w-none lg:justify-end"
                tail={(
                    <>
                        <div className="flex rounded-xl border border-slate-200/80 bg-slate-100/80 p-1 backdrop-blur" role="tablist" aria-label="Τύπος κωδικών">
                            <button type="button" role="tab" aria-selected={!showStxOnly} onClick={() => setShowStxOnly(false)} className={`${segmentBase} px-3.5 py-2 ${!showStxOnly ? segmentOn : segmentOff}`}>
                                <Database size={15} className={!showStxOnly ? 'text-emerald-600' : ''} /> Προϊόντα
                            </button>
                            <button type="button" role="tab" aria-selected={showStxOnly} onClick={() => setShowStxOnly(true)} className={`${segmentBase} px-3.5 py-2 ${showStxOnly ? segmentOn : segmentOff}`}>
                                <Puzzle size={15} className={showStxOnly ? 'text-indigo-600' : ''} /> Εξαρτήματα
                            </button>
                        </div>
                        <div className="flex rounded-xl border border-slate-200/80 bg-slate-100/80 p-1 backdrop-blur" role="tablist" aria-label="Προβολή">
                            <button type="button" role="tab" aria-selected={viewMode === 'grid'} title="Κάρτες" onClick={() => setViewMode('grid')} className={`${segmentBase} h-9 w-10 ${viewMode === 'grid' ? `${segmentOn} !text-emerald-600` : segmentOff}`}>
                                <LayoutGrid size={17} />
                            </button>
                            <button type="button" role="tab" aria-selected={viewMode === 'table'} title="Λίστα παραλλαγών" onClick={() => setViewMode('table')} className={`${segmentBase} h-9 w-10 ${viewMode === 'table' ? `${segmentOn} !text-emerald-600` : segmentOff}`}>
                                <List size={17} />
                            </button>
                        </div>
                        <div className="hidden h-8 w-px bg-slate-200 md:block" aria-hidden />
                        <button type="button" onClick={() => setShowScanner(true)} className="group flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/90 pl-1.5 pr-4 text-sm font-bold text-slate-700 shadow-sm transition-all hover:-translate-y-px hover:border-slate-300 hover:shadow-md active:translate-y-0">
                            <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600 transition-colors group-hover:bg-emerald-50 group-hover:text-emerald-600"><ScanLine size={17} /></span>
                            <span className="hidden sm:inline">Σάρωση</span>
                        </button>
                        <HeaderPrimaryButton icon={Plus} onClick={() => setIsCreating(true)}>
                            <span className="whitespace-nowrap">Νέο Προϊόν</span>
                        </HeaderPrimaryButton>
                    </>
                )}
                below={(
                    <div className="space-y-3">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center">
                            <div className="group relative w-full flex-1">
                                <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-emerald-500" size={19} />
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    placeholder="Αναζήτηση κωδικού (π.χ. K14300) ή κατηγορίας..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Escape') { setSearchTerm(''); e.currentTarget.blur(); } }}
                                    className="w-full rounded-xl border border-slate-200 bg-white/80 py-3 pl-12 pr-12 font-medium text-slate-900 shadow-inner shadow-slate-100 outline-none backdrop-blur transition-all placeholder:text-slate-400 hover:border-slate-300 focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-500/15"
                                />
                                {searchTerm ? (
                                    <button type="button" onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" aria-label="Καθαρισμός αναζήτησης">
                                        <X size={15} />
                                    </button>
                                ) : (
                                    <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-400 shadow-sm md:block">/</kbd>
                                )}
                            </div>
                            <div className="flex w-full gap-2 md:w-auto">
                                <RegistrySortSelect
                                    value={sortBy}
                                    onChange={setSortBy}
                                    className="flex-1 md:w-44"
                                />
                                <button type="button" onClick={() => setShowFiltersSidebar(true)} className={`relative flex flex-1 items-center justify-center gap-2 rounded-xl border px-5 py-3 text-sm font-bold transition-all md:flex-none ${activeFilterChips.length > 0 ? 'border-[#060b00] bg-[#060b00] text-white shadow-md' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}`}>
                                    <SlidersHorizontal size={17} />
                                    <span>Φίλτρα</span>
                                    {activeFilterChips.length > 0 && (
                                        <span className="ml-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-emerald-400 px-1 text-[11px] font-black text-[#060b00]">{formatNumber(activeFilterChips.length)}</span>
                                    )}
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-1.5 rounded-lg border border-emerald-100 bg-emerald-50/70 px-2.5 py-1 text-xs font-bold text-emerald-800">
                                <Sparkles size={12} className="text-emerald-500" />
                                <span className="font-mono tabular-nums">{formatNumber(filteredProducts.length)}</span>
                                <span className="font-medium text-emerald-700/70">/ {formatNumber(registryStats.codes)} {showStxOnly ? 'εξαρτήματα' : 'κωδικοί'}</span>
                            </div>
                            <div className="flex items-center gap-1.5 rounded-lg border border-amber-100 bg-amber-50/60 px-2.5 py-1 text-xs font-bold text-amber-900" title="Παραλλαγές των κωδικών που εμφανίζονται">
                                <Layers size={12} className="text-amber-500" />
                                <span className="font-mono tabular-nums">{formatNumber(registryStats.variants)}</span>
                                <span className="font-medium text-amber-800/60">παραλλαγές</span>
                            </div>
                            {!showStxOnly && (
                                <div className="flex items-center rounded-lg border border-slate-200 bg-white/70 p-0.5 text-xs font-bold" role="group" aria-label="Τύπος παραγωγής">
                                    {[
                                        { value: 'InHouse', label: 'Ιδιοπαραγωγή', count: registryStats.inHouse, icon: Factory, tone: 'text-slate-700', on: 'bg-slate-800 text-white' },
                                        { value: 'Imported', label: 'Εισαγωγή', count: registryStats.imported, icon: ShoppingBag, tone: 'text-violet-700', on: 'bg-violet-600 text-white' },
                                    ].map(({ value, label, count, icon: TypeIcon, tone, on }) => {
                                        const isOn = subFilters.productionType === value;
                                        return (
                                            <button
                                                key={value}
                                                type="button"
                                                aria-pressed={isOn}
                                                onClick={() => setSubFilters(p => ({ ...p, productionType: isOn ? 'all' : value }))}
                                                title={isOn ? 'Εμφάνιση όλων' : `Μόνο ${label}`}
                                                className={`flex items-center gap-1.5 rounded-md px-2 py-0.5 transition-colors ${isOn ? on : `${tone} hover:bg-slate-100`}`}
                                            >
                                                <TypeIcon size={12} className={isOn ? '' : 'opacity-60'} />
                                                <span className="font-mono tabular-nums">{formatNumber(count)}</span>
                                                <span className={`font-medium ${isOn ? 'text-white/70' : 'text-slate-400'}`}>{label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                            {registryStats.unpriced > 0 && (
                                <div className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700" title="Κωδικοί χωρίς τιμή χονδρικής σε κανένα σημείο">
                                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                    <span className="font-mono tabular-nums">{formatNumber(registryStats.unpriced)}</span>
                                    <span className="font-medium text-rose-600/70">χωρίς τιμή</span>
                                </div>
                            )}

                            {activeFilterChips.length > 0 && (
                                <>
                                    <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" aria-hidden />
                                    {activeFilterChips.map(chip => (
                                        <button
                                            key={chip.key}
                                            type="button"
                                            onClick={chip.clear}
                                            className="group inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white py-1 pl-3 pr-1.5 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                                            title="Αφαίρεση φίλτρου"
                                        >
                                            {chip.label}
                                            <span className="grid h-4 w-4 place-items-center rounded-full bg-slate-100 text-slate-400 group-hover:bg-rose-100 group-hover:text-rose-600"><X size={10} strokeWidth={3} /></span>
                                        </button>
                                    ))}
                                    <button type="button" onClick={clearAllFilters} className="text-xs font-bold text-slate-400 underline-offset-2 transition-colors hover:text-slate-700 hover:underline">
                                        Καθαρισμός όλων
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                )}
            />

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
                                        onSelectProduct={handleProductSelect}
                                        isSelected={selectedSkus.has(product.sku)}
                                    />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <EmptyState
                            icon={Database}
                            title="Δεν βρέθηκαν κωδικοί με αυτά τα κριτήρια."
                            hint="Δοκιμάστε άλλη αναζήτηση ή καθαρίστε τα φίλτρα."
                        />
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
                                const invoiceTotalWeight = item.invoiceWeight;

                                const prevItem = virtualRow.index > 0 ? tableVariants[virtualRow.index - 1] : null;
                                const isFirstInTeam = !prevItem || prevItem.masterSku !== item.masterSku;

                                return (
                                    <div key={item.variantSku} className="absolute top-0 left-0 w-full" style={{ height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)` }}>
                                        <div className={`flex items-center justify-between p-4 border-b border-slate-100 transition-colors h-[72px] ${isSelected ? 'bg-emerald-50/60 shadow-[inset_3px_0_0_0_rgb(16,185,129)]' : `${isFirstInTeam ? 'bg-white' : 'bg-slate-50/40'} hover:bg-slate-50`}`}>
                                            <div className="flex items-center gap-4 flex-1">
                                                <button onClick={(e) => { e.stopPropagation(); toggleSelection(item.variantSku); }} className={`text-slate-400 hover:text-emerald-600 transition-colors ${isSelected ? 'text-emerald-600' : ''}`}>
                                                    <CheckSquare size={20} className={isSelected ? 'fill-emerald-100' : ''} />
                                                </button>
                                                <div className={`h-12 w-12 rounded-lg shrink-0 cursor-pointer flex items-center justify-center ${isFirstInTeam ? 'bg-slate-100 overflow-hidden' : ''}`} onClick={() => handleProductSelect(item.product)}>
                                                    {isFirstInTeam ? (
                                                        item.image ? <img src={item.image} alt={item.variantSku} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon size={16} /></div>
                                                    ) : (
                                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-100"></div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0 pr-4 cursor-pointer" onClick={() => handleProductSelect(item.product)}>
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
                                                <div className="text-center w-24">
                                                    {isFirstInTeam && (
                                                        <>
                                                            <div className="text-[10px] uppercase font-bold text-slate-400">Βάρος</div>
                                                            <div className="text-sm font-bold tabular-nums text-slate-700">
                                                                {item.product.skip_casting ? SKIP_CASTING_LABEL : `${formatRegistryWeight(item.weight)}g`}
                                                            </div>
                                                            {item.product.skip_casting && item.weight > 0 && (
                                                                <div className="text-[9px] font-semibold tabular-nums text-slate-500">{formatRegistryWeight(item.weight)}g</div>
                                                            )}
                                                            <div className={`mt-0.5 truncate text-[9px] font-semibold ${invoiceTotalWeight.source === 'missing' ? 'text-amber-600' : 'text-slate-400'}`} title="Συνολικό Βάρος">
                                                                Σ&nbsp;{invoiceTotalWeight.value === null ? '—' : `${formatRegistryWeight(invoiceTotalWeight.value)}g`}
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
                                                        <TrendingUp size={12} /> {formatDecimal(margin, 0)}%
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-end flex-1 min-w-[120px]">
                                                <div className="text-right flex flex-col items-end">
                                                    <div className="text-[10px] uppercase font-bold text-slate-400 mb-0.5 flex items-center justify-end gap-1">
                                                        Χονδρικη
                                                        {(item.variant?.selling_price_manual_override || (!item.variant && item.product.selling_price_manual_override)) && (
                                                            <span className="inline-flex items-center gap-0.5 text-amber-600 normal-case font-bold">
                                                                <Lock size={10} /> Χειροκίνητη
                                                            </span>
                                                        )}
                                                    </div>
                                                    {editingPrice?.sku === item.variantSku ? (
                                                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                                            <button
                                                                title="Υπολογισμός με Ilios Formula (Προτεινόμενη Τιμή)"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setPriceEditUsedFormula(item.variantSku);
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
                                                            onClick={(e) => { e.stopPropagation(); setPriceEditUsedFormula(null); setEditingPrice({ sku: item.variantSku, price: item.price.toString() }); }}>
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
                        <EmptyState
                            icon={Database}
                            title="Δεν βρέθηκαν κωδικοί με αυτά τα κριτήρια."
                            hint="Δοκιμάστε άλλη αναζήτηση ή καθαρίστε τα φίλτρα."
                        />
                    )
                )}
            </div>

            {/* Grid Pagination Controls */}
            {viewMode === 'grid' && totalGridPages > 1 && (
                <RegistryPagination
                    page={gridPage}
                    totalPages={totalGridPages}
                    summary={`${formatNumber(filteredProducts.length)} προϊόντα`}
                    onPageChange={(page) => { setGridPage(page); scrollContainerRef.current?.scrollTo({ top: 0 }); }}
                />
            )}

            {/* Table Pagination Controls */}
            {viewMode === 'table' && totalTablePages > 1 && (
                <RegistryPagination
                    page={tablePage}
                    totalPages={totalTablePages}
                    summary={`${formatNumber(allTableVariants.length)} παραλλαγές`}
                    onPageChange={(page) => { setTablePage(page); scrollContainerRef.current?.scrollTo({ top: 0 }); }}
                />
            )}

            {selectedProduct && (
                <ProductDetails
                    product={selectedProduct}
                    initialVariantSuffix={selectedVariantSuffix}
                    allProducts={products}
                    allMaterials={materials}
                    onClose={() => {
                        setSelectedProduct(null);
                        setSelectedVariantSuffix(undefined);
                    }}
                    setPrintItems={setPrintItems || (() => { })}
                    settings={settings}
                    collections={collections}
                    allMolds={molds}
                    viewMode="registry"
                    onDuplicate={(prod) => {
                        setProductToDuplicate(prod);
                        setSelectedProduct(null);
                        setSelectedVariantSuffix(undefined);
                        setIsCreating(true);
                    }}
                />
            )}

            {showScanner && <BarcodeScanner products={products} onScan={handleGlobalScan} onClose={() => setShowScanner(false)} />}

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
                <button onClick={() => setIsCreating(true)} className="flex items-center justify-center gap-3 bg-gradient-to-br from-[#1c2812] via-[#0b1204] to-[#060b00] text-white rounded-full font-bold shadow-2xl shadow-[#060b00]/30 ring-1 ring-inset ring-white/10 transition-all duration-200 ease-in-out transform hover:-translate-y-1 hover:scale-105 h-16 w-16 sm:w-auto sm:h-auto sm:py-2.5 sm:pl-2.5 sm:pr-6">
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500"><Plus size={22} strokeWidth={2.75} /></span> <span className="hidden sm:inline whitespace-nowrap">Νέο Προϊόν</span>
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
                        <div className="relative flex items-center justify-between overflow-hidden border-b border-slate-100 bg-gradient-to-br from-white to-emerald-50/50 p-6">
                            <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-emerald-400 via-teal-400 to-amber-300"></div>
                            <div className="flex items-center gap-3">
                                <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[#1c2812] to-[#060b00] text-white shadow-md"><SlidersHorizontal size={18} /></span>
                                <div>
                                    <h2 className="text-lg font-black tracking-tight text-slate-900">Προηγμένα Φίλτρα</h2>
                                    <p className="text-xs font-medium text-slate-500">{formatNumber(filteredProducts.length)} αποτελέσματα{activeFilterChips.length > 0 ? ` · ${formatNumber(activeFilterChips.length)} ενεργά φίλτρα` : ''}</p>
                                </div>
                            </div>
                            <button type="button" onClick={() => setShowFiltersSidebar(false)} className="rounded-full bg-white p-2 text-slate-400 shadow-sm ring-1 ring-slate-200 transition-colors hover:text-slate-700" aria-label="Κλείσιμο"><X size={16} /></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                            {!showStxOnly && (
                                <div className="space-y-3">
                                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Φύλο / Είδος</label>
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
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Κατηγορία</label>
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
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1"><Gem size={14} /> Πέτρες</label>
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
                                            const isDisabled = subFilters.stone === 'without';
                                            return (
                                                <button
                                                    key={s.id}
                                                    disabled={isDisabled}
                                                    onClick={() => setSubFilters(p => ({ ...p, stone: isActive ? 'all' : s.id }))}
                                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-bold border transition-all ${isDisabled
                                                        ? 'bg-slate-100 text-slate-400 border-slate-200 opacity-60 cursor-not-allowed'
                                                        : isActive
                                                            ? `${style.bg} ${style.text} border-current ring-2 ring-offset-1 ring-current/30 shadow`
                                                            : `${style.bg} ${style.text} border-transparent hover:border-current/40 opacity-80 hover:opacity-100`
                                                        }`}
                                                >
                                                    <span className={`w-2 h-2 rounded-full ${isDisabled ? 'bg-slate-300' : style.dot} shrink-0`}></span>
                                                    {s.name}
                                                    <span className="opacity-50 text-[10px]">({formatNumber(s.count)})</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* ── Φινίρισμα ── */}
                            <div className="space-y-3">
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1"><Palette size={14} /> Φινίρισμα</label>
                                <div className="flex flex-wrap gap-2">
                                    {platingFilters.map(f => (
                                        <SubFilterButton key={f.value} label={f.label} value={f.value} activeValue={subFilters.plating} onClick={(v) => setSubFilters(p => ({ ...p, plating: v }))} />
                                    ))}
                                </div>
                            </div>

                            {/* ── Τύπος Παραγωγής ── */}
                            {!showStxOnly && (
                                <div className="space-y-3">
                                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1"><Factory size={14} /> Τύπος Παραγωγής</label>
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

                            {/* ── Συλλογή ── */}
                            {!showStxOnly && collections && collections.length > 0 && (
                                <div className="space-y-3">
                                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1"><FolderOpen size={14} /> Συλλογή</label>
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
                                type="button"
                                onClick={clearAllFilters}
                                disabled={activeFilterChips.length === 0}
                                className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-40"
                            >
                                Καθαρισμός
                            </button>
                            <button
                                onClick={() => setShowFiltersSidebar(false)}
                                className="flex-[2] px-4 py-3 rounded-xl font-bold text-white bg-gradient-to-br from-[#1c2812] to-[#060b00] hover:to-black transition-all shadow-md shadow-[#060b00]/20 active:scale-[0.98]"
                            >
                                Εφαρμογή ({formatNumber(filteredProducts.length)})
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
