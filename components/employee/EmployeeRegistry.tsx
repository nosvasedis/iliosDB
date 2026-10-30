import { formatNumber } from '../../utils/numberFormat';
import React, { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { Database, PackageOpen, ScanLine, SlidersHorizontal } from 'lucide-react';
import { Gender, Product, ProductVariant } from '../../types';
import { findProductByScannedCode } from '../../utils/pricingEngine';
import { useProducts } from '../../hooks/api/useProducts';
import { useMaterials } from '../../hooks/api/useMaterials';
import { useUI } from '../UIProvider';
import BarcodeScanner from '../BarcodeScanner';
import IliosLoader from '../ui/IliosLoader';
import PageHeader, { IconButton, SearchField } from '../shell/PageHeader';
import { useViewport } from '../shell/viewport';
import CatalogProductGrid from '../catalog/CatalogProductGrid';
import { ActiveChip, ActiveChipsRow, CategoryChips, FilterSection, FilterSheet, FilterToggle, optionClass } from '../catalog/catalogUi';
import EmployeeProductDetails from './EmployeeProductDetails';
import { getStoreCatalogIndex, PlatingFilter, selectStoreCatalog, STORE_RETAIL_MULTIPLIER, StonesFilter, StoreCatalogFilters } from './storeCatalog';

interface Props {
    setPrintItems?: (items: { product: Product; variant?: ProductVariant; quantity: number, format?: 'standard' | 'simple' | 'retail' }[]) => void;
}

type Facets = Omit<StoreCatalogFilters, 'search' | 'group'>;
const DEFAULT_FACETS: Facets = { gender: 'All', stones: 'all', plating: 'all', onlyInStock: false, sortBy: 'sku' };

const GENDER_OPTS: Array<{ v: 'All' | Gender; l: string }> = [
    { v: 'All', l: 'Όλα' }, { v: Gender.Women, l: 'Γυναικεία' }, { v: Gender.Men, l: 'Ανδρικά' }, { v: Gender.Unisex, l: 'Ουδέτερα' },
];
const STONE_OPTS: Array<{ v: StonesFilter; l: string }> = [{ v: 'all', l: 'Όλα' }, { v: 'with', l: 'Με πέτρες' }, { v: 'without', l: 'Χωρίς πέτρες' }];
const PLATING_OPTS: Array<{ v: PlatingFilter; l: string }> = [
    { v: 'all', l: 'Όλα' }, { v: 'lustre', l: 'Λουστρέ / Πατίνα' }, { v: 'gold', l: 'Επίχρυσο' }, { v: 'platinum', l: 'Επιπλατινωμένο' },
];

const EMPTY: Product[] = [];

export default function EmployeeRegistry({ setPrintItems }: Props) {
    const { data: products, isLoading } = useProducts();
    const { data: materials } = useMaterials();
    const { showToast } = useUI();
    const { isDesktop } = useViewport();

    const [search, setSearch] = useState('');
    const [group, setGroup] = useState('All');
    const [facets, setFacets] = useState<Facets>(DEFAULT_FACETS);
    const [showFilters, setShowFilters] = useState(false);
    const [showScanner, setShowScanner] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const closeFilters = useCallback(() => setShowFilters(false), []);

    const setFacet = useCallback(<K extends keyof Facets>(key: K, value: Facets[K]) => {
        setFacets((prev) => ({ ...prev, [key]: value }));
    }, []);

    const index = useMemo(() => getStoreCatalogIndex(products || EMPTY, materials || []), [products, materials]);
    const filters = useDeferredValue(useMemo<StoreCatalogFilters>(() => ({ ...facets, search, group }), [facets, search, group]));
    const filtered = useMemo(() => selectStoreCatalog(index, filters), [index, filters]);
    const resetKey = JSON.stringify(filters);

    const activeCount = [facets.gender !== 'All', facets.stones !== 'all', facets.plating !== 'all', facets.onlyInStock].filter(Boolean).length;
    const clearAll = () => setFacets((prev) => ({ ...DEFAULT_FACETS, sortBy: prev.sortBy }));

    const openProduct = useCallback((product: Product) => setSelectedProduct(product), []);

    const handleScan = (code: string) => {
        if (!products) return;
        const match = findProductByScannedCode(code, products);
        if (match) {
            setSelectedProduct(match.product);
            setShowScanner(false);
        } else {
            showToast(`Ο κωδικός ${code} δεν βρέθηκε.`, 'error');
        }
    };

    if (isLoading && !products) return <IliosLoader variant="section" detail="Προϊόντα" className="h-full" />;

    const tools = (
        <>
            <IconButton label="Σάρωση" onClick={() => setShowScanner(true)}><ScanLine size={18} /></IconButton>
            <IconButton label="Φίλτρα" onClick={() => setShowFilters(true)} active={activeCount > 0} badge={activeCount || undefined}>
                <SlidersHorizontal size={18} />
            </IconButton>
        </>
    );

    return (
        <div className="flex h-full min-h-0 flex-col bg-slate-50">
            <PageHeader
                icon={Database}
                title="Προϊόντα & Τιμές"
                subtitle={`${formatNumber(filtered.length)} από ${formatNumber(index.entries.length)} κωδικούς · τιμές λιανικής`}
                actions={isDesktop ? undefined : tools}
                below={
                    <>
                        <div className={`flex items-center gap-2 ${isDesktop ? 'mb-3' : 'mb-2'}`}>
                            <SearchField value={search} onChange={setSearch} placeholder={isDesktop ? 'Αναζήτηση κωδικού ή κατηγορίας…' : 'Κωδικός ή κατηγορία…'} />
                            {isDesktop && tools}
                        </div>
                        <CategoryChips groups={index.groups} value={group} onChange={setGroup} />
                        {activeCount > 0 && (
                            <ActiveChipsRow onClearAll={clearAll}>
                                {facets.gender !== 'All' && <ActiveChip label={GENDER_OPTS.find((g) => g.v === facets.gender)?.l || ''} onClear={() => setFacet('gender', 'All')} />}
                                {facets.stones !== 'all' && <ActiveChip label={STONE_OPTS.find((o) => o.v === facets.stones)?.l || ''} onClear={() => setFacet('stones', 'all')} />}
                                {facets.plating !== 'all' && <ActiveChip label={PLATING_OPTS.find((o) => o.v === facets.plating)?.l || ''} onClear={() => setFacet('plating', 'all')} />}
                                {facets.onlyInStock && <ActiveChip label="Διαθέσιμα" onClear={() => setFacet('onlyInStock', false)} />}
                            </ActiveChipsRow>
                        )}
                    </>
                }
            />

            <CatalogProductGrid
                products={filtered}
                resetKey={resetKey}
                priceMultiplier={STORE_RETAIL_MULTIPLIER}
                onOpen={openProduct}
                empty={
                    <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400">
                        <PackageOpen size={40} className="opacity-30" />
                        <p className="text-sm font-bold">Δεν βρέθηκαν προϊόντα.</p>
                        {(activeCount > 0 || search || group !== 'All') && (
                            <button
                                type="button"
                                onClick={() => { clearAll(); setSearch(''); setGroup('All'); }}
                                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700"
                            >
                                Καθαρισμός αναζήτησης & φίλτρων
                            </button>
                        )}
                    </div>
                }
            />

            {showFilters && (
                <FilterSheet resultCount={filtered.length} activeCount={activeCount} onClear={clearAll} onClose={closeFilters}>
                    <FilterSection title="Ταξινόμηση">
                        <button type="button" onClick={() => setFacet('sortBy', 'sku')} className={optionClass(facets.sortBy === 'sku')}>Κωδικός</button>
                        <button type="button" onClick={() => setFacet('sortBy', 'created_at')} className={optionClass(facets.sortBy === 'created_at')}>Νεότερα</button>
                    </FilterSection>
                    <FilterToggle title="Μόνο διαθέσιμα" hint="Κωδικοί με απόθεμα" checked={facets.onlyInStock} onChange={(v) => setFacet('onlyInStock', v)} />
                    <FilterSection title="Φύλο">
                        {GENDER_OPTS.map((g) => (
                            <button key={g.v} type="button" onClick={() => setFacet('gender', g.v)} className={optionClass(facets.gender === g.v)}>{g.l}</button>
                        ))}
                    </FilterSection>
                    <FilterSection title="Πέτρες">
                        {STONE_OPTS.map((o) => (
                            <button key={o.v} type="button" onClick={() => setFacet('stones', o.v)} className={optionClass(facets.stones === o.v)}>{o.l}</button>
                        ))}
                    </FilterSection>
                    <FilterSection title="Φινίρισμα">
                        {PLATING_OPTS.map((o) => (
                            <button key={o.v} type="button" onClick={() => setFacet('plating', o.v)} className={optionClass(facets.plating === o.v)}>{o.l}</button>
                        ))}
                    </FilterSection>
                </FilterSheet>
            )}

            {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}

            {selectedProduct && (
                <EmployeeProductDetails product={selectedProduct} onClose={() => setSelectedProduct(null)} setPrintItems={setPrintItems} />
            )}
        </div>
    );
}
