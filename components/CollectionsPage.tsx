import React, { useState, useEffect } from 'react';
import { Collection, Product } from '../types';
import { FolderKanban, Plus, Save, Trash2, Edit, X, Search, Loader2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, supabase } from '../lib/supabase';

export default function CollectionsPage() {
    const queryClient = useQueryClient();
    const { data: collections, isLoading: loadingCollections, isError, error } = useQuery<Collection[]>({ queryKey: ['collections'], queryFn: api.getCollections });
    const { data: allProducts, isLoading: loadingProducts } = useQuery<Product[]>({ queryKey: ['products'], queryFn: api.getProducts });

    const [newCollectionName, setNewCollectionName] = useState('');
    const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const handleCreateCollection = async () => {
        if (!newCollectionName.trim()) return;
        try {
            await supabase.from('collections').insert({ name: newCollectionName.trim() });
            queryClient.invalidateQueries({ queryKey: ['collections'] });
            setNewCollectionName('');
        } catch (e) {
            console.error(e);
            alert("Error creating collection.");
        }
    };

    const handleDeleteCollection = async (id: number) => {
        if (window.confirm("Are you sure you want to delete this collection? This cannot be undone.")) {
            try {
                // First delete associations
                await supabase.from('product_collections').delete().eq('collection_id', id);
                // Then delete collection
                await supabase.from('collections').delete().eq('id', id);
                queryClient.invalidateQueries({ queryKey: ['collections'] });
                if (selectedCollection?.id === id) {
                    setSelectedCollection(null);
                }
            } catch (e) {
                console.error(e);
                alert("Error deleting collection.");
            }
        }
    };

    const handleToggleProduct = async (sku: string, collectionId: number) => {
        const product = allProducts?.find(p => p.sku === sku);
        if (!product) return;

        const currentCollections = product.collections || [];
        const isInCollection = currentCollections.includes(collectionId);
        const newCollections = isInCollection
            ? currentCollections.filter(id => id !== collectionId)
            : [...currentCollections, collectionId];
        
        await api.setProductCollections(sku, newCollections);
        queryClient.invalidateQueries({ queryKey: ['products'] });
    };

    const productsInSelectedCollection = React.useMemo(() => {
        if (!selectedCollection || !allProducts) return [];
        return allProducts.filter(p => p.collections?.includes(selectedCollection.id));
    }, [selectedCollection, allProducts]);

    const filteredAvailableProducts = React.useMemo(() => {
        if (!allProducts || !selectedCollection) return [];
        const searchLower = searchTerm.toLowerCase();
        return allProducts.filter(p => 
            !p.collections?.includes(selectedCollection.id) &&
            p.sku.toLowerCase().includes(searchLower)
        );
    }, [allProducts, selectedCollection, searchTerm]);

    if (loadingCollections || loadingProducts) {
        return <div className="flex justify-center items-center h-64"><Loader2 size={32} className="animate-spin text-amber-500" /></div>;
    }
    
    if (isError) {
        return (
            <div className="max-w-7xl mx-auto space-y-6">
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><FolderKanban className="text-blue-600" />Διαχείριση Συλλογών</h1>
                <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md" role="alert">
                    <p className="font-bold">Σφάλμα!</p>
                    <p>Δεν ήταν δυνατή η φόρτωση των συλλογών. Βεβαιωθείτε ότι ο πίνακας 'collections' υπάρχει και ότι οι πολιτικές RLS επιτρέπουν την ανάγνωση.</p>
                    <p className="text-sm mt-2 font-mono bg-red-200 p-2 rounded">{(error as Error).message}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><FolderKanban className="text-blue-600" />Διαχείριση Συλλογών</h1>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-4">
                    <div className="bg-white p-4 rounded-xl shadow-sm border">
                        <h3 className="font-bold text-slate-700 mb-3">Νέα Συλλογή</h3>
                        <div className="flex gap-2">
                            <input type="text" value={newCollectionName} onChange={e => setNewCollectionName(e.target.value)} placeholder="Όνομα Συλλογής" className="w-full p-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none transition-colors"/>
                            <button onClick={handleCreateCollection} className="bg-slate-800 text-white px-4 rounded-lg hover:bg-slate-700 transition-colors"><Plus/></button>
                        </div>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border">
                        <h3 className="font-bold text-slate-700 mb-3">Λίστα</h3>
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                            {collections?.map(c => (
                                <div key={c.id} onClick={() => setSelectedCollection(c)} className={`flex justify-between items-center p-3 rounded-lg cursor-pointer transition-colors ${selectedCollection?.id === c.id ? 'bg-amber-100' : 'hover:bg-slate-50'}`}>
                                    <span className="font-medium">{c.name}</span>
                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteCollection(c.id); }} className="text-slate-400 hover:text-red-500"><Trash2 size={16}/></button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border">
                    {!selectedCollection ? (
                        <div className="text-center py-20 text-slate-400">Επιλέξτε μια συλλογή για να δείτε τα περιεχόμενά της.</div>
                    ) : (
                        <div>
                            <h2 className="text-xl font-bold mb-4">Προϊόντα στη συλλογή: {selectedCollection.name}</h2>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-48 overflow-y-auto mb-6 border-b pb-4">
                                {productsInSelectedCollection.map(p => (
                                    <div key={p.sku} className="relative group p-2 border rounded-lg text-center">
                                        <img src={p.image_url} alt={p.sku} className="w-16 h-16 object-cover mx-auto mb-2 rounded"/>
                                        <p className="text-xs font-bold">{p.sku}</p>
                                        <button onClick={() => handleToggleProduct(p.sku, selectedCollection.id)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100"><X size={12}/></button>
                                    </div>
                                ))}
                                {productsInSelectedCollection.length === 0 && <div className="col-span-full text-sm text-slate-400 text-center py-4">Αυτή η συλλογή είναι άδεια.</div>}
                            </div>

                            <h3 className="font-semibold mb-3">Προσθήκη Προϊόντων</h3>
                             <div className="relative mb-3">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input type="text" placeholder="Αναζήτηση SKU..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 p-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none transition-colors"/>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-64 overflow-y-auto">
                                {filteredAvailableProducts.map(p => (
                                    <div key={p.sku} onClick={() => handleToggleProduct(p.sku, selectedCollection.id)} className="relative group p-2 border rounded-lg text-center cursor-pointer hover:bg-green-50">
                                        <img src={p.image_url} alt={p.sku} className="w-16 h-16 object-cover mx-auto mb-2 rounded"/>
                                        <p className="text-xs font-bold">{p.sku}</p>
                                        <div className="absolute inset-0 bg-green-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100"><Plus size={24}/></div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}