import { formatNumber } from '../../utils/numberFormat';
import React, { useState, useMemo, useDeferredValue } from 'react';
import { FolderKanban, ArrowLeft, ChevronRight, PackageOpen } from 'lucide-react';
import {
    buildSellerCollectionSummaries,
    filterSellerCollectionProducts,
} from '../../features/sellerCatalog/selectors';
import {
    SellerCatalogCollection,
    SellerCatalogProduct,
} from '../../features/sellerCatalog/types';
import PageHeader, { SearchField } from '../shell/PageHeader';
import SellerProductGrid from './SellerProductGrid';

interface Props {
    products: SellerCatalogProduct[];
    collections: SellerCatalogCollection[];
    /** When provided, shows an "Εισαγωγή στην παραγγελία" mode — clicking a variant adds it */
    onAddToOrder?: (product: SellerCatalogProduct, variantSuffix?: string) => void;
}

const CollectionCover = ({ product, priority }: { product?: SellerCatalogProduct; priority: boolean }) => {
    const [failed, setFailed] = useState(false);
    React.useEffect(() => setFailed(false), [product?.image_url]);
    if (product?.image_url && !failed) {
        return (
            <img
                src={product.image_url}
                className="h-full w-full object-cover transition-transform duration-500 [@media(hover:hover)]:group-hover:scale-105"
                alt=""
                loading={priority ? 'eager' : 'lazy'}
                fetchPriority={priority ? 'high' : 'low'}
                decoding="async"
                onError={() => setFailed(true)}
            />
        );
    }
    return (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-300">
            <FolderKanban size={48} strokeWidth={1} />
        </div>
    );
};

const itemsLabel = (count: number) => `${formatNumber(count)} ${count === 1 ? 'είδος' : 'είδη'}`;

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SellerCollections({ products, collections, onAddToOrder }: Props) {
    const summaries = useMemo(
        () => buildSellerCollectionSummaries(collections, products),
        [collections, products],
    );
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const deferredSearch = useDeferredValue(searchTerm);
    const [listFilter, setListFilter] = useState('');

    const selected = useMemo(
        () => (selectedId == null ? null : summaries.find((item) => item.collection.id === selectedId) ?? null),
        [selectedId, summaries],
    );

    const filteredProducts = useMemo(
        () => (selected ? filterSellerCollectionProducts(selected.products, deferredSearch) : []),
        [selected, deferredSearch],
    );

    const visibleSummaries = useMemo(() => {
        const q = listFilter.trim().toLocaleLowerCase('el');
        if (!q) return summaries;
        return summaries.filter((s) => s.collection.name.toLocaleLowerCase('el').includes(q));
    }, [summaries, listFilter]);

    // ── Collection Products View ───────────────────────────────────────────────
    if (selected) {
        const { collection } = selected;
        return (
            <div className="flex h-full min-h-0 flex-col bg-slate-50">
                <PageHeader
                    icon={FolderKanban}
                    title={collection.name}
                    subtitle={collection.description || itemsLabel(filteredProducts.length)}
                    leading={
                        <button
                            type="button"
                            onClick={() => { setSelectedId(null); setSearchTerm(''); }}
                            aria-label="Πίσω στις συλλογές"
                            className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                        >
                            <ArrowLeft size={19} />
                        </button>
                    }
                    actions={
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold tabular-nums text-slate-600">
                            {itemsLabel(filteredProducts.length)}
                        </span>
                    }
                    below={<div className="flex"><SearchField value={searchTerm} onChange={setSearchTerm} placeholder="Αναζήτηση στη συλλογή…" /></div>}
                />
                <SellerProductGrid
                    products={filteredProducts}
                    resetKey={`${collection.id}:${deferredSearch}`}
                    onAddToOrder={onAddToOrder}
                    empty={<div className="py-20 text-center text-sm font-bold text-slate-400">Δεν βρέθηκαν προϊόντα.</div>}
                />
            </div>
        );
    }

    // ── Collections List View ──────────────────────────────────────────────────
    return (
        <div className="flex h-full min-h-0 flex-col bg-slate-50">
            <PageHeader
                icon={FolderKanban}
                title="Συλλογές"
                subtitle={`${formatNumber(summaries.length)} συλλογές`}
                below={summaries.length > 6 ? <div className="flex"><SearchField value={listFilter} onChange={setListFilter} placeholder="Αναζήτηση συλλογής…" /></div> : undefined}
            />
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain custom-scrollbar">
                <div className="grid grid-cols-2 gap-2 p-2 min-[400px]:gap-2.5 min-[400px]:p-2.5 sm:grid-cols-3 sm:gap-3 sm:p-3 lg:grid-cols-3 lg:gap-4 lg:px-0 lg:pt-4 xl:grid-cols-4 2xl:grid-cols-5">
                    {visibleSummaries.map(({ collection, previewProduct, products: collectionProducts }, index) => (
                        <button
                            key={collection.id}
                            type="button"
                            onClick={() => setSelectedId(collection.id)}
                            className="group relative flex aspect-[4/5] flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-slate-200 text-left shadow-sm transition-shadow active:scale-[0.985] lg:rounded-3xl lg:hover:shadow-xl"
                            style={{ contentVisibility: 'auto', containIntrinsicSize: '240px 300px' }}
                        >
                            <div className="absolute inset-0">
                                <CollectionCover product={previewProduct} priority={index < 4} />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                            </div>
                            <div className="relative z-10 mt-auto w-full p-3 lg:p-5">
                                <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-amber-300/90">
                                    {itemsLabel(collectionProducts.length)}
                                </span>
                                <h2 className="line-clamp-2 text-[15px] font-bold leading-tight text-white min-[400px]:text-base lg:text-xl">
                                    {collection.name}
                                </h2>
                                {collection.description && (
                                    <div className="mt-1 hidden sm:block"><p className="line-clamp-2 text-xs italic text-white/70">{collection.description}</p></div>
                                )}
                                <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-white/80">
                                    Προβολή <ChevronRight size={13} />
                                </span>
                            </div>
                        </button>
                    ))}
                </div>
                {visibleSummaries.length === 0 && (
                    <div className="flex flex-col items-center gap-3 py-20 text-slate-400">
                        <PackageOpen size={36} className="opacity-30" />
                        <p className="text-sm font-bold">{summaries.length === 0 ? 'Δεν υπάρχουν συλλογές.' : 'Καμία συλλογή δεν ταιριάζει.'}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
