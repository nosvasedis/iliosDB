import { formatNumber } from '../../utils/numberFormat';

import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { invalidateProductsAndCatalog } from '../../lib/queryInvalidation';
import { Collection, Product } from '../../types';
import { FolderKanban, Plus, Trash2, Search, X, ChevronRight, Check } from 'lucide-react';
import { useUI } from '../UIProvider';
import MobileProductDetails from './MobileProductDetails';
import MobileScreenHeader, { MOBILE_HEADER_SURFACE } from './MobileScreenHeader';
import LinkedProductsBadge from '../products/LinkedProductsBadge';
import LinkedProductsStrip from '../products/LinkedProductsStrip';
import { useProductQuickViews } from '../products/useProductQuickViews';
import { productToFanItem } from '../products/productFanItems';
import { getLinkedSkus, useProductLinkIndex } from '../../features/products/productLinks';

export default function MobileCollections() {
    const { data: collections } = useQuery({ queryKey: ['collections'], queryFn: api.getCollections });
    const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
    const { data: warehouses } = useQuery({ queryKey: ['warehouses'], queryFn: api.getWarehouses });
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();

    const [view, setView] = useState<'list' | 'detail'>('list');
    const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
    const [newCollectionName, setNewCollectionName] = useState('');
    const [search, setSearch] = useState('');
    const [showFullDesc, setShowFullDesc] = useState(false);
    const [viewProduct, setViewProduct] = useState<Product | null>(null);

    const handleCreate = async () => {
        if (!newCollectionName.trim()) return;
        try {
            await api.saveCollection(newCollectionName.trim());
            queryClient.invalidateQueries({ queryKey: ['collections'] });
            setNewCollectionName('');
            showToast("Η συλλογή δημιουργήθηκε.", "success");
        } catch (e) {
            showToast("Σφάλμα δημιουργίας.", "error");
        }
    };

    const handleDelete = async (id: number) => {
        if (await confirm({ title: 'Διαγραφή', message: 'Είστε σίγουροι;', isDestructive: true })) {
            try {
                await api.deleteCollection(id);
                queryClient.invalidateQueries({ queryKey: ['collections'] });
            } catch (e) {
                showToast("Σφάλμα διαγραφής.", "error");
            }
        }
    };

    const toggleProduct = async (sku: string) => {
        if (!selectedCollection || !products) return;
        const product = products.find(p => p.sku === sku);
        if (!product) return;

        const currentIds = product.collections || [];
        const newIds = currentIds.includes(selectedCollection.id)
            ? currentIds.filter(id => id !== selectedCollection.id)
            : [...currentIds, selectedCollection.id];
        
        await api.setProductCollections(sku, newIds);
        invalidateProductsAndCatalog(queryClient);
    };

    const collectionProducts = useMemo(() => {
        if (!selectedCollection || !products) return [];
        return products.filter(p => p.collections?.includes(selectedCollection.id));
    }, [selectedCollection, products]);

    const availableProducts = useMemo(() => {
        if (!products || !search) return [];
        return products.filter(p => p.sku.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase())).slice(0, 20);
    }, [products, search]);

    // Συνδεδεμένα Προϊόντα: set-mates of the collection's products that are missing from it.
    const linkIndex = useProductLinkIndex(products);
    const productsBySku = useMemo(() => new Map((products || []).map((product) => [product.sku, product])), [products]);
    const quickViews = useProductQuickViews<Product>({
        index: linkIndex,
        productsBySku,
        toFanItem: productToFanItem,
        onOpenProduct: setViewProduct,
    });
    const missingSetMates = useMemo(() => {
        const inCollection = new Set(collectionProducts.map((product) => product.sku));
        const missing = new Map<string, Product>();
        collectionProducts.forEach((product) => {
            getLinkedSkus(product.sku, linkIndex).forEach((mate) => {
                const mateProduct = productsBySku.get(mate);
                if (mateProduct && !mateProduct.is_component && !inCollection.has(mate)) missing.set(mate, mateProduct);
            });
        });
        return [...missing.values()];
    }, [collectionProducts, linkIndex, productsBySku]);

    const addSetMates = async (skus: string[]) => {
        if (!selectedCollection || skus.length === 0) return;
        try {
            await api.addProductsToCollection(skus.map((sku) => ({ product_sku: sku, collection_id: selectedCollection.id })));
            await invalidateProductsAndCatalog(queryClient);
            showToast(skus.length === 1 ? `Προστέθηκε ο ${skus[0]}.` : `Προστέθηκαν ${formatNumber(skus.length)} κωδικοί.`, 'success');
        } catch (e) {
            showToast('Σφάλμα προσθήκης των συνδεδεμένων προϊόντων.', 'error');
        }
    };

    if (view === 'detail' && selectedCollection) {
        return (
            <div className="flex h-full min-h-0 flex-col bg-slate-50">
                <header className={`sticky top-0 z-10 ${MOBILE_HEADER_SURFACE}`}>
                    <div className="flex items-center gap-2 px-4 pb-3 pt-[max(0.5rem,env(safe-area-inset-top,0px))]">
                        <button type="button" onClick={() => setView('list')} className="flex shrink-0 items-center gap-1 rounded-xl py-2 pl-1 pr-2 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-100">
                            <ChevronRight className="rotate-180" size={18} /> Πίσω
                        </button>
                        <div className="min-w-0 flex-1">
                            <MobileScreenHeader
                                embedded
                                icon={FolderKanban}
                                title={selectedCollection.name}
                                subtitle="Περιεχόμενα συλλογής"
                                iconClassName="text-pink-600"
                                className="!gap-2"
                            />
                        </div>
                        <div className="w-10 shrink-0" aria-hidden />
                    </div>
                </header>

                <div className="flex-1 space-y-4 overflow-y-auto p-4 pb-24">
                    
                    {/* Collection Description Display */}
                    {selectedCollection.description && (
                        <div 
                            onClick={() => setShowFullDesc(!showFullDesc)}
                            className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm cursor-pointer active:bg-slate-50 transition-colors"
                        >
                            <p className={`text-xs text-slate-500 italic leading-relaxed font-serif ${!showFullDesc ? 'line-clamp-2' : ''}`}>
                                "{selectedCollection.description}"
                            </p>
                            {!showFullDesc && selectedCollection.description.length > 80 && (
                                <p className="text-[10px] text-blue-500 font-bold mt-1 text-right">Διαβάστε περισσότερα</p>
                            )}
                        </div>
                    )}

                    {/* Add Product Search */}
                    <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm sticky top-0 z-0">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                            <input 
                                type="text" 
                                placeholder="Προσθήκη κωδικού..." 
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full pl-10 p-2.5 bg-slate-50 rounded-xl outline-none font-bold text-sm focus:ring-2 focus:ring-blue-500/20"
                            />
                        </div>
                        {search && (
                            <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                                {availableProducts.map(p => {
                                    const inColl = p.collections?.includes(selectedCollection.id);
                                    return (
                                        <button 
                                            key={p.sku} 
                                            onClick={() => toggleProduct(p.sku)}
                                            className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 text-left"
                                        >
                                            <span className="font-bold text-slate-700 text-sm">{p.sku}</span>
                                            {inColl ? <Check size={16} className="text-emerald-500"/> : <Plus size={16} className="text-slate-400"/>}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {missingSetMates.length > 0 && (
                        <LinkedProductsStrip
                            compact
                            title={`Λείπουν από τα σετ (${formatNumber(missingSetMates.length)})`}
                            items={missingSetMates.map((product) => ({
                                sku: product.sku,
                                suffix: '',
                                imageUrl: product.image_url,
                                gender: product.gender,
                                onSelect: () => setViewProduct(product),
                                onAdd: () => addSetMates([product.sku]),
                                addTitle: `Προσθήκη ${product.sku} στη συλλογή`,
                            }))}
                            action={(
                                <button
                                    type="button"
                                    onClick={() => addSetMates(missingSetMates.map((product) => product.sku))}
                                    className="shrink-0 rounded-lg bg-violet-600 px-2.5 py-1 text-[11px] font-black text-white active:scale-95"
                                >
                                    Προσθήκη όλων
                                </button>
                            )}
                        />
                    )}

                    <div className="space-y-2">
                        <h3 className="text-xs font-bold text-slate-400 uppercase ml-1">Περιεχομενα ({formatNumber(collectionProducts.length)})</h3>
                        {collectionProducts.map(p => (
                            <div 
                                key={p.sku} 
                                onClick={() => setViewProduct(p)}
                                className="relative bg-white p-3 rounded-xl border border-slate-100 flex items-center gap-3 active:scale-[0.98] transition-transform"
                            >
                                <button
                                    type="button"
                                    aria-label={p.image_url ? `Μεγέθυνση φωτογραφίας ${p.sku}` : undefined}
                                    disabled={!p.image_url}
                                    onClick={(e) => { e.stopPropagation(); quickViews.zoomProduct(p.sku, p.image_url, p.category); }}
                                    className="w-10 h-10 bg-slate-100 rounded-lg overflow-hidden shrink-0"
                                >
                                    {p.image_url && <img src={p.image_url} className="w-full h-full object-cover"/>}
                                </button>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 font-bold text-slate-800 text-sm">
                                        {p.sku}
                                        {linkIndex.bySku.has(p.sku) && (
                                            <LinkedProductsBadge
                                                tone="light"
                                                size="sm"
                                                linkedSkus={getLinkedSkus(p.sku, linkIndex)}
                                                onOpen={(anchor) => quickViews.openLinks(p.sku, anchor)}
                                            />
                                        )}
                                    </div>
                                    <div className="text-[10px] text-slate-500">{p.category}</div>
                                </div>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); toggleProduct(p.sku); }} 
                                    className="absolute top-2 right-2 p-1.5 text-slate-300 hover:text-red-500 bg-white/80 rounded-full shadow-sm z-10"
                                >
                                    <X size={14}/>
                                </button>
                            </div>
                        ))}
                        {collectionProducts.length === 0 && <div className="text-center py-8 text-slate-400 text-sm">Η συλλογή είναι κενή.</div>}
                    </div>
                </div>

                {quickViews.element}

                {viewProduct && warehouses && (
                    <MobileProductDetails 
                        product={viewProduct} 
                        key={viewProduct.sku}
                        onClose={() => setViewProduct(null)}
                        warehouses={warehouses}
                    />
                )}
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col bg-slate-50 pb-24">
            <MobileScreenHeader icon={FolderKanban} title="Συλλογές" subtitle="Οργάνωση καταλόγου" iconClassName="text-pink-600" />

            <div className="flex min-h-0 flex-1 flex-col px-4 pt-3">
            <div className="mb-6 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        placeholder="Όνομα νέας συλλογής..." 
                        value={newCollectionName}
                        onChange={e => setNewCollectionName(e.target.value)}
                        className="flex-1 p-3 bg-slate-50 rounded-xl outline-none font-bold text-sm focus:ring-2 focus:ring-blue-500/20"
                    />
                    <button onClick={handleCreate} className="bg-slate-900 text-white p-3 rounded-xl shadow-md"><Plus/></button>
                </div>
            </div>

            <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto">
                {collections?.map(c => (
                    <div 
                        key={c.id} 
                        onClick={() => { setSelectedCollection(c); setView('detail'); setSearch(''); }}
                        className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between active:scale-[0.98] transition-transform"
                    >
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-pink-50 text-pink-500 rounded-xl">
                                <FolderKanban size={20}/>
                            </div>
                            <div>
                                <span className="font-black text-slate-800 block">{c.name}</span>
                                {c.description && <span className="text-[10px] text-slate-400 italic truncate block max-w-[150px]">{c.description}</span>}
                            </div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }} className="p-2 text-slate-300 hover:text-red-500">
                            <Trash2 size={18}/>
                        </button>
                    </div>
                ))}
            </div>
            </div>
        </div>
    );
}