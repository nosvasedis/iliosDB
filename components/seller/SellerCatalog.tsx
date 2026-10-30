import { formatNumber } from '../../utils/numberFormat';

import React, { useState, useMemo, useCallback, useDeferredValue } from 'react';
import { Gender, ProductionType } from '../../types';
import { BookOpen, SlidersHorizontal, ScanLine, PackageOpen } from 'lucide-react';
import { findProductByScannedCode } from '../../utils/pricingEngine';
import { FINISH_CODES } from '../../constants';
import BarcodeScanner from '../BarcodeScanner';
import { useUI } from '../UIProvider';
import { SELLER_FINISH_COLORS, SELLER_STONE_TEXT_COLORS } from './skuColors';
import {
    buildSellerCatalogIndex,
    selectSellerCatalogProducts,
    SellerCatalogFilters,
    SellerCatalogIndex,
} from '../../features/sellerCatalog/selectors';
import {
    SellerCatalogCollection,
    SellerCatalogProduct,
} from '../../features/sellerCatalog/types';
import PageHeader, { IconButton, SearchField } from '../shell/PageHeader';
import SellerProductGrid from './SellerProductGrid';
import { useViewport } from '../shell/viewport';
import { ActiveChip, ActiveChipsRow, CategoryChips, FilterSection, FilterSheet, FilterToggle, getCategoryGroup, optionClass } from '../catalog/catalogUi';

interface Props {
    products: SellerCatalogProduct[];
    collections: SellerCatalogCollection[];
}

// The index (variant sorting + search strings) is the expensive part; build it once per snapshot,
// not every time the seller opens the catalogue.
const indexCache = new WeakMap<SellerCatalogProduct[], SellerCatalogIndex>();
const getCatalogIndex = (products: SellerCatalogProduct[]) => {
    let index = indexCache.get(products);
    if (!index) {
        index = buildSellerCatalogIndex(products, getCategoryGroup);
        indexCache.set(products, index);
    }
    return index;
};

type FacetFilters = Omit<SellerCatalogFilters, 'search' | 'categoryGroup'>;

const DEFAULT_FACETS: FacetFilters = {
    gender: 'All',
    collection: 'All',
    finish: null,
    stone: null,
    stoneMode: 'All',
    productionType: 'All',
    onlyInStock: false,
    sortBy: 'sku',
};

const GENDER_OPTS: Array<{ v: 'All' | Gender; l: string }> = [
    { v: 'All', l: 'Όλα' }, { v: Gender.Women, l: 'Γυναικεία' }, { v: Gender.Men, l: 'Ανδρικά' }, { v: Gender.Unisex, l: 'Ουδέτερα' },
];

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SellerCatalog({ products, collections }: Props) {
    const { showToast } = useUI();
    const { isDesktop } = useViewport();

    const [search, setSearch] = useState('');
    const [group, setGroup] = useState('All');
    const [facets, setFacets] = useState<FacetFilters>(DEFAULT_FACETS);
    const [showFilters, setShowFilters] = useState(false);
    const [showScanner, setShowScanner] = useState(false);
    const closeFilters = useCallback(() => setShowFilters(false), []);

    const setFacet = useCallback(<K extends keyof FacetFilters>(key: K, value: FacetFilters[K]) => {
        setFacets((prev) => ({ ...prev, [key]: value }));
    }, []);

    const catalogIndex = useMemo(() => getCatalogIndex(products), [products]);
    const categoryGroups = catalogIndex.categoryGroups;

    // Typing and chip taps stay instant; the filter pass runs at lower priority.
    const filters = useDeferredValue(useMemo<SellerCatalogFilters>(() => ({
        ...facets,
        search: search.trim(),
        categoryGroup: group,
    }), [facets, search, group]));

    const filteredProducts = useMemo(() => selectSellerCatalogProducts(catalogIndex, filters), [catalogIndex, filters]);
    const resetKey = JSON.stringify(filters);

    const activeCount = [
        facets.gender !== 'All', facets.collection !== 'All', facets.finish !== null, facets.stone !== null,
        facets.stoneMode !== 'All', facets.productionType !== 'All', facets.onlyInStock,
    ].filter(Boolean).length;

    const clearAll = () => setFacets((prev) => ({ ...DEFAULT_FACETS, sortBy: prev.sortBy }));

    const handleScan = (code: string) => {
        const match = findProductByScannedCode(code, products);
        if (match) {
            setGroup('All');
            setSearch(match.product.sku + (match.variant?.suffix || ''));
            setShowScanner(false);
        } else {
            showToast(`Κωδικός ${code} δεν βρέθηκε.`, 'error');
        }
    };

    const stoneName = (code: string) => catalogIndex.availableStones.find((s) => s.code === code)?.name ?? code;

    const chips = <CategoryChips groups={categoryGroups} value={group} onChange={setGroup} />;

    const activeChips = activeCount > 0 && (
        <ActiveChipsRow onClearAll={clearAll}>
            {facets.gender !== 'All' && <ActiveChip label={GENDER_OPTS.find((g) => g.v === facets.gender)?.l || ''} onClear={() => setFacet('gender', 'All')} />}
            {facets.finish !== null && <ActiveChip label={FINISH_CODES[facets.finish] ?? facets.finish} onClear={() => setFacet('finish', null)} />}
            {facets.stone !== null && <ActiveChip label={stoneName(facets.stone)} onClear={() => setFacet('stone', null)} />}
            {facets.stoneMode !== 'All' && <ActiveChip label={facets.stoneMode === 'with' ? 'Με πέτρες' : 'Χωρίς πέτρες'} onClear={() => setFacet('stoneMode', 'All')} />}
            {facets.productionType !== 'All' && <ActiveChip label={facets.productionType === ProductionType.InHouse ? 'Εγχώρια' : 'Εισαγόμενα'} onClear={() => setFacet('productionType', 'All')} />}
            {facets.collection !== 'All' && <ActiveChip label={collections.find((c) => c.id === facets.collection)?.name || 'Συλλογή'} onClear={() => setFacet('collection', 'All')} />}
            {facets.onlyInStock && <ActiveChip label="Διαθέσιμα" onClear={() => setFacet('onlyInStock', false)} />}
        </ActiveChipsRow>
    );

    return (
        <div className="flex h-full min-h-0 flex-col bg-slate-50 lg:gap-0">
            <PageHeader
                icon={BookOpen}
                title="Κατάλογος"
                subtitle={`${formatNumber(filteredProducts.length)} από ${formatNumber(products.length)} κωδικούς`}
                actions={isDesktop ? undefined : (
                    <>
                        <IconButton label="Σάρωση" onClick={() => setShowScanner(true)}><ScanLine size={18} /></IconButton>
                        <IconButton label="Φίλτρα" onClick={() => setShowFilters(true)} active={activeCount > 0} badge={activeCount || undefined}>
                            <SlidersHorizontal size={18} />
                        </IconButton>
                    </>
                )}
                below={
                    <>
                        {isDesktop ? (
                            <div className="mb-3 flex items-center gap-2">
                                <SearchField value={search} onChange={setSearch} placeholder="Αναζήτηση κωδικού ή κατηγορίας…" />
                                <IconButton label="Σάρωση" onClick={() => setShowScanner(true)}><ScanLine size={18} /></IconButton>
                                <IconButton label="Φίλτρα" onClick={() => setShowFilters(true)} active={activeCount > 0} badge={activeCount || undefined}>
                                    <SlidersHorizontal size={18} />
                                </IconButton>
                            </div>
                        ) : (
                            <div className="mb-2 flex">
                                <SearchField value={search} onChange={setSearch} placeholder="Κωδικός ή κατηγορία…" />
                            </div>
                        )}
                        {chips}
                        {activeChips}
                    </>
                }
            />

            <SellerProductGrid
                products={filteredProducts}
                allProducts={products}
                resetKey={resetKey}
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
                <FilterSheet resultCount={filteredProducts.length} activeCount={activeCount} onClear={clearAll} onClose={closeFilters}>
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

                            {catalogIndex.availableFinishes.length > 0 && (
                                <FilterSection title="Μέταλλο">
                                    {catalogIndex.availableFinishes.map((f) => (
                                        <button
                                            key={f}
                                            type="button"
                                            onClick={() => setFacet('finish', facets.finish === f ? null : f)}
                                            className={`min-h-[2.25rem] rounded-xl border px-3 text-[12px] font-bold transition-colors ${SELLER_FINISH_COLORS[f] || 'border-slate-200 bg-slate-50 text-slate-600'} ${facets.finish === f ? 'ring-2 ring-[#060b00] ring-offset-1' : ''}`}
                                        >
                                            {FINISH_CODES[f] ?? f}
                                        </button>
                                    ))}
                                </FilterSection>
                            )}

                            <FilterSection title="Πέτρα">
                                {(['All', 'with', 'without'] as const).map((mode) => (
                                    <button key={mode} type="button" onClick={() => setFacet('stoneMode', mode)} className={optionClass(facets.stoneMode === mode)}>
                                        {mode === 'All' ? 'Όλα' : mode === 'with' ? 'Με πέτρες' : 'Χωρίς πέτρες'}
                                    </button>
                                ))}
                            </FilterSection>

                            {catalogIndex.availableStones.length > 0 && (
                                <FilterSection title="Συγκεκριμένη πέτρα">
                                    {catalogIndex.availableStones.map((s) => (
                                        <button
                                            key={s.code}
                                            type="button"
                                            onClick={() => setFacet('stone', facets.stone === s.code ? null : s.code)}
                                            className={optionClass(facets.stone === s.code)}
                                        >
                                            <span className={facets.stone === s.code ? 'text-white' : (SELLER_STONE_TEXT_COLORS[s.code] || 'text-slate-600')}>{s.name}</span>
                                        </button>
                                    ))}
                                </FilterSection>
                            )}

                            <FilterSection title="Τύπος παραγωγής">
                                {(['All', ProductionType.InHouse, ProductionType.Imported] as const).map((pt) => (
                                    <button key={pt} type="button" onClick={() => setFacet('productionType', pt)} className={optionClass(facets.productionType === pt)}>
                                        {pt === 'All' ? 'Όλα' : pt === ProductionType.InHouse ? 'Εγχώρια' : 'Εισαγόμενα'}
                                    </button>
                                ))}
                            </FilterSection>

                            {collections.length > 0 && (
                                <FilterSection title="Συλλογή">
                                    <button type="button" onClick={() => setFacet('collection', 'All')} className={optionClass(facets.collection === 'All')}>Όλες</button>
                                    {collections.map((col) => (
                                        <button key={col.id} type="button" onClick={() => setFacet('collection', col.id)} className={optionClass(facets.collection === col.id)}>
                                            {col.name}
                                        </button>
                                    ))}
                                </FilterSection>
                            )}
                </FilterSheet>
            )}

            {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
        </div>
    );
}
