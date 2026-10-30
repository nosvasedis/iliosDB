import { formatNumber } from '../../utils/numberFormat';

import React, { useState, useMemo, useCallback, useDeferredValue, useEffect } from 'react';
import { Gender, ProductionType } from '../../types';
import { BookOpen, X, SlidersHorizontal, ScanLine, PackageOpen, RotateCcw } from 'lucide-react';
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
import SellerPageHeader, { SellerIconButton, SellerSearchField } from './SellerPageHeader';
import SellerProductGrid from './SellerProductGrid';
import { useSellerViewport } from './sellerViewport';

interface Props {
    products: SellerCatalogProduct[];
    collections: SellerCatalogCollection[];
}

// ─── Category grouping ────────────────────────────────────────────────────────
const CATEGORY_PREFIXES = ['Βραχιόλι', 'Κολιέ', 'Σκουλαρίκι', 'Δαχτυλίδι', 'Τσόκερ', 'Σετ', 'Αλυσίδα', 'Τσάντα', 'Καρφίτσα'];
const getCategoryGroup = (category: string): string => {
    for (const prefix of CATEGORY_PREFIXES) {
        if (category.startsWith(prefix)) return prefix;
    }
    return category;
};

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

const optionClass = (active: boolean) =>
    `min-h-[2.25rem] rounded-xl border px-3 text-[12px] font-bold transition-colors active:scale-[0.97] ${
        active ? 'border-[#060b00] bg-[#060b00] text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
    }`;

const FilterSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="space-y-2">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{title}</h3>
        <div className="flex flex-wrap gap-1.5">{children}</div>
    </section>
);

const ActiveChip = ({ label, onClear }: { label: string; onClear: () => void }) => (
    <button
        type="button"
        onClick={onClear}
        className="flex h-7 shrink-0 items-center gap-1 rounded-full bg-[#060b00] pl-2.5 pr-1.5 text-[11px] font-bold text-white"
    >
        {label}
        <X size={12} className="opacity-70" />
    </button>
);

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SellerCatalog({ products, collections }: Props) {
    const { showToast } = useUI();
    const { isDesktop } = useSellerViewport();

    const [search, setSearch] = useState('');
    const [group, setGroup] = useState('All');
    const [facets, setFacets] = useState<FacetFilters>(DEFAULT_FACETS);
    const [showFilters, setShowFilters] = useState(false);
    const [showScanner, setShowScanner] = useState(false);

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

    useEffect(() => {
        if (!showFilters) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowFilters(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [showFilters]);

    const stoneName = (code: string) => catalogIndex.availableStones.find((s) => s.code === code)?.name ?? code;

    const chips = (
        <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 ilios-no-scrollbar min-[400px]:-mx-4 min-[400px]:px-4 lg:mx-0 lg:flex-wrap lg:px-0">
            {['All', ...categoryGroups].map((g) => (
                <button
                    key={g}
                    type="button"
                    onClick={() => setGroup(g)}
                    className={`h-8 shrink-0 whitespace-nowrap rounded-full border px-3 text-[12px] font-bold transition-colors ${
                        group === g ? 'border-[#060b00] bg-[#060b00] text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                >
                    {g === 'All' ? 'Όλα' : g}
                </button>
            ))}
        </div>
    );

    const activeChips = activeCount > 0 && (
        <div className="-mx-3 mt-2 flex gap-1.5 overflow-x-auto px-3 ilios-no-scrollbar min-[400px]:-mx-4 min-[400px]:px-4 lg:mx-0 lg:flex-wrap lg:px-0">
            {facets.gender !== 'All' && <ActiveChip label={GENDER_OPTS.find((g) => g.v === facets.gender)?.l || ''} onClear={() => setFacet('gender', 'All')} />}
            {facets.finish !== null && <ActiveChip label={FINISH_CODES[facets.finish] ?? facets.finish} onClear={() => setFacet('finish', null)} />}
            {facets.stone !== null && <ActiveChip label={stoneName(facets.stone)} onClear={() => setFacet('stone', null)} />}
            {facets.stoneMode !== 'All' && <ActiveChip label={facets.stoneMode === 'with' ? 'Με πέτρες' : 'Χωρίς πέτρες'} onClear={() => setFacet('stoneMode', 'All')} />}
            {facets.productionType !== 'All' && <ActiveChip label={facets.productionType === ProductionType.InHouse ? 'Εγχώρια' : 'Εισαγόμενα'} onClear={() => setFacet('productionType', 'All')} />}
            {facets.collection !== 'All' && <ActiveChip label={collections.find((c) => c.id === facets.collection)?.name || 'Συλλογή'} onClear={() => setFacet('collection', 'All')} />}
            {facets.onlyInStock && <ActiveChip label="Διαθέσιμα" onClear={() => setFacet('onlyInStock', false)} />}
            <button type="button" onClick={clearAll} className="h-7 shrink-0 px-2 text-[11px] font-bold text-rose-600">Καθαρισμός</button>
        </div>
    );

    return (
        <div className="flex h-full min-h-0 flex-col bg-slate-50 lg:gap-0">
            <SellerPageHeader
                icon={BookOpen}
                title="Κατάλογος"
                subtitle={`${formatNumber(filteredProducts.length)} από ${formatNumber(products.length)} κωδικούς`}
                actions={isDesktop ? undefined : (
                    <>
                        <SellerIconButton label="Σάρωση" onClick={() => setShowScanner(true)}><ScanLine size={18} /></SellerIconButton>
                        <SellerIconButton label="Φίλτρα" onClick={() => setShowFilters(true)} active={activeCount > 0} badge={activeCount || undefined}>
                            <SlidersHorizontal size={18} />
                        </SellerIconButton>
                    </>
                )}
                below={
                    <>
                        {isDesktop ? (
                            <div className="mb-3 flex items-center gap-2">
                                <SellerSearchField value={search} onChange={setSearch} placeholder="Αναζήτηση κωδικού ή κατηγορίας…" />
                                <SellerIconButton label="Σάρωση" onClick={() => setShowScanner(true)}><ScanLine size={18} /></SellerIconButton>
                                <SellerIconButton label="Φίλτρα" onClick={() => setShowFilters(true)} active={activeCount > 0} badge={activeCount || undefined}>
                                    <SlidersHorizontal size={18} />
                                </SellerIconButton>
                            </div>
                        ) : (
                            <div className="mb-2 flex">
                                <SellerSearchField value={search} onChange={setSearch} placeholder="Κωδικός ή κατηγορία…" />
                            </div>
                        )}
                        {chips}
                        {activeChips}
                    </>
                }
            />

            <SellerProductGrid
                products={filteredProducts}
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
                <div className="fixed inset-0 z-[70] flex items-end justify-center lg:items-stretch lg:justify-end" role="dialog" aria-modal="true" aria-label="Φίλτρα καταλόγου">
                    <button type="button" aria-label="Κλείσιμο" onClick={() => setShowFilters(false)} className="absolute inset-0 bg-[#060b00]/40" />
                    <div className="relative flex max-h-[88dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl lg:max-h-none lg:w-[400px] lg:rounded-none lg:rounded-l-3xl">
                        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200 lg:hidden" />
                        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                            <h2 className="text-base font-bold text-[#060b00]">Φίλτρα</h2>
                            <button type="button" onClick={() => setShowFilters(false)} aria-label="Κλείσιμο" className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-4">
                            <FilterSection title="Ταξινόμηση">
                                <button type="button" onClick={() => setFacet('sortBy', 'sku')} className={optionClass(facets.sortBy === 'sku')}>Κωδικός</button>
                                <button type="button" onClick={() => setFacet('sortBy', 'created_at')} className={optionClass(facets.sortBy === 'created_at')}>Νεότερα</button>
                            </FilterSection>

                            <section className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
                                <div>
                                    <p className="text-[13px] font-bold text-slate-800">Μόνο διαθέσιμα</p>
                                    <p className="text-[11px] text-slate-400">Κωδικοί με απόθεμα</p>
                                </div>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={facets.onlyInStock}
                                    onClick={() => setFacet('onlyInStock', !facets.onlyInStock)}
                                    className={`relative h-7 w-12 rounded-full transition-colors ${facets.onlyInStock ? 'bg-emerald-500' : 'bg-slate-200'}`}
                                >
                                    <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${facets.onlyInStock ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </section>

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
                        </div>

                        <div className="flex gap-2 border-t border-slate-100 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                            <button
                                type="button"
                                onClick={clearAll}
                                disabled={activeCount === 0}
                                className="flex h-12 items-center gap-1.5 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 disabled:opacity-40"
                            >
                                <RotateCcw size={15} /> Καθαρισμός
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowFilters(false)}
                                className="flex h-12 flex-1 items-center justify-center rounded-xl bg-[#060b00] text-sm font-bold text-white active:scale-[0.99]"
                            >
                                Προβολή {formatNumber(filteredProducts.length)}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
        </div>
    );
}
