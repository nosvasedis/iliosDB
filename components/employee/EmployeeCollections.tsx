import { formatNumber } from '../../utils/numberFormat';

import React, { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, FolderKanban, PackageOpen } from 'lucide-react';
import { Collection, Product, ProductVariant } from '../../types';
import { useProducts } from '../../hooks/api/useProducts';
import { useCollections } from '../../hooks/api/useCollections';
import IliosLoader from '../ui/IliosLoader';
import PageHeader, { SearchField } from '../shell/PageHeader';
import CatalogProductGrid from '../catalog/CatalogProductGrid';
import { skuCollator } from '../catalog/catalogUi';
import EmployeeProductDetails from './EmployeeProductDetails';
import { sortStoreVariants, STORE_RETAIL_MULTIPLIER } from './storeCatalog';

interface Props {
    setPrintItems?: (items: { product: Product; variant?: ProductVariant; quantity: number, format?: 'standard' | 'simple' | 'retail' }[]) => void;
}

interface CollectionSummary {
    collection: Collection;
    products: Product[];
    cover?: Product;
}

const itemsLabel = (count: number) => `${formatNumber(count)} ${count === 1 ? 'είδος' : 'είδη'}`;

const CollectionCover = ({ product, priority }: { product?: Product; priority: boolean }) => {
    const [failed, setFailed] = useState(false);
    if (product?.image_url && !failed) {
        return (
            <img
                src={product.image_url}
                alt=""
                loading={priority ? 'eager' : 'lazy'}
                fetchPriority={priority ? 'high' : 'low'}
                decoding="async"
                onError={() => setFailed(true)}
                className="h-full w-full object-cover transition-transform duration-500 [@media(hover:hover)]:group-hover:scale-105"
            />
        );
    }
    return (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-300">
            <FolderKanban size={48} strokeWidth={1} />
        </div>
    );
};

export default function EmployeeCollections({ setPrintItems }: Props) {
    const { data: collections, isLoading: loadingCol } = useCollections();
    const { data: products, isLoading: loadingProd } = useProducts();

    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const deferredSearch = useDeferredValue(searchTerm.trim().toLowerCase());
    const [listFilter, setListFilter] = useState('');

    // One pass over the catalogue for every collection (was one scan per collection card).
    const summaries = useMemo<CollectionSummary[]>(() => {
        const map = new Map<number, CollectionSummary>((collections || []).map((c) => [c.id, { collection: c, products: [] }]));
        (products || []).forEach((p) => {
            if (p.is_component) return;
            p.collections?.forEach((id) => {
                const summary = map.get(id);
                if (!summary) return;
                summary.products.push(p);
                if (!summary.cover && p.image_url) summary.cover = p;
            });
        });
        map.forEach((s) => {
            s.products = s.products
                .map((p) => ({ ...p, variants: sortStoreVariants(p.variants || [], p.gender) }))
                .sort((a, b) => skuCollator.compare(a.sku, b.sku));
        });
        return (collections || []).map((c) => map.get(c.id)!);
    }, [collections, products]);

    const selected = selectedId == null ? null : summaries.find((s) => s.collection.id === selectedId) ?? null;
    const filteredProducts = useMemo(() => {
        if (!selected) return [];
        if (!deferredSearch) return selected.products;
        return selected.products.filter((p) => p.sku.toLowerCase().includes(deferredSearch) || p.category.toLowerCase().includes(deferredSearch));
    }, [selected, deferredSearch]);

    const visibleSummaries = useMemo(() => {
        const q = listFilter.trim().toLocaleLowerCase('el');
        return q ? summaries.filter((s) => s.collection.name.toLocaleLowerCase('el').includes(q)) : summaries;
    }, [summaries, listFilter]);

    const openProduct = useCallback((product: Product) => setSelectedProduct(product), []);

    if ((loadingCol && !collections) || (loadingProd && !products)) return <IliosLoader variant="section" detail="Συλλογές" className="h-full" />;

    const details = selectedProduct && (
        <EmployeeProductDetails product={selectedProduct} onClose={() => setSelectedProduct(null)} setPrintItems={setPrintItems} />
    );

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
                <CatalogProductGrid
                    products={filteredProducts}
                    resetKey={`${collection.id}:${deferredSearch}`}
                    priceMultiplier={STORE_RETAIL_MULTIPLIER}
                    onOpen={openProduct}
                    empty={<div className="py-20 text-center text-sm font-bold text-slate-400">Δεν βρέθηκαν προϊόντα.</div>}
                />
                {details}
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col bg-slate-50">
            <PageHeader
                icon={FolderKanban}
                title="Συλλογές"
                subtitle={`${formatNumber(summaries.length)} συλλογές · τιμές λιανικής`}
                below={summaries.length > 6 ? <div className="flex"><SearchField value={listFilter} onChange={setListFilter} placeholder="Αναζήτηση συλλογής…" /></div> : undefined}
            />
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain custom-scrollbar">
                <div className="grid grid-cols-2 gap-2 p-2 min-[400px]:gap-2.5 min-[400px]:p-2.5 sm:grid-cols-3 sm:gap-3 sm:p-3 lg:grid-cols-3 lg:gap-4 lg:px-0 lg:pt-4 xl:grid-cols-4 2xl:grid-cols-5">
                    {visibleSummaries.map(({ collection, cover, products: items }, index) => (
                        <button
                            key={collection.id}
                            type="button"
                            onClick={() => setSelectedId(collection.id)}
                            className="group relative flex aspect-[4/5] flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-slate-200 text-left shadow-sm transition-shadow active:scale-[0.985] lg:rounded-3xl lg:hover:shadow-xl"
                            style={{ contentVisibility: 'auto', containIntrinsicSize: '240px 300px' }}
                        >
                            <div className="absolute inset-0">
                                <CollectionCover product={cover} priority={index < 4} />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                            </div>
                            <div className="relative z-10 mt-auto w-full p-3 lg:p-5">
                                <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-amber-300/90">{itemsLabel(items.length)}</span>
                                <h2 className="line-clamp-2 text-[15px] font-bold leading-tight text-white min-[400px]:text-base lg:text-xl">{collection.name}</h2>
                                {collection.description && (
                                    <div className="mt-1 hidden sm:block"><p className="line-clamp-2 text-xs italic text-white/70">{collection.description}</p></div>
                                )}
                                <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-white/80">Προβολή <ChevronRight size={13} /></span>
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
            {details}
        </div>
    );
}
