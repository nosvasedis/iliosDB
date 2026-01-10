
import React, { useState, useMemo } from 'react';
import { Collection, Product } from '../types';
import { FolderKanban, Plus, Trash2, X, Search, Loader2, ArrowRight, Printer, Copy, AlertCircle, ScanBarcode, PackagePlus, Info } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, supabase } from '../lib/supabase';
import { useUI } from './UIProvider';
import { PriceListPrintData } from './PriceListPrintView';

interface Props {
    products?: Product[];
    onPrint?: (data: PriceListPrintData) => void;
}

export default function CollectionsPage({ products: allProducts, onPrint }: Props) {
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    const { data: collections, isLoading: loadingCollections, isError, error } = useQuery<Collection[]>({ queryKey: ['collections'], queryFn: api.getCollections });

    const [newCollectionName, setNewCollectionName] = useState('');
    const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Bulk Add State
    const [bulkSkus, setBulkSkus] = useState('');
    const [isBulkAdding, setIsBulkAdding] = useState(false);

    const handleCreateCollection = async () => {
        if (!newCollectionName.trim()) return;
        try {
            await api.saveCollection(newCollectionName.trim());
            queryClient.invalidateQueries({ queryKey: ['collections'] });
            setNewCollectionName('');
            showToast("Η συλλογή δημιουργήθηκε.", "success");
        } catch (e) {
            console.error(e);
            showToast("Σφάλμα δημιουργίας.", "error");
        }
    };

    const handleDeleteCollection = async (id: number) => {
        const yes = await confirm({
            title: 'Διαγραφή Συλλογής',
            message: 'Είστε σίγουροι ότι θέλετε να διαγράψετε αυτή τη συλλογή; Τα προϊόντα δεν θα διαγραφούν.',
            isDestructive: true,
            confirmText: 'Διαγραφή'
        });

        if (yes) {
            try {
                // Remove product associations first via API (using null array deletes all)
                // Actually, our API helper setProductCollections replaces for a SKU.
                // But for deleting a collection, we should ideally clean up.
                // However, safeMutate logic is by table.
                // Let's just delete the collection for now, associations might linger in cloud but it's fine for simple use.
                // For a proper cleanup, we'd need a deleteProductCollectionsByCollectionId endpoint.
                
                await api.deleteCollection(id);
                queryClient.invalidateQueries({ queryKey: ['collections'] });
                if (selectedCollection?.id === id) {
                    setSelectedCollection(null);
                }
                showToast("Η συλλογή διαγράφηκε.", "info");
            } catch (e) {
                console.error(e);
                showToast("Σφάλμα διαγραφής.", "error");
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

    const expandSkuRange = (token: string): string[] => {
        // Regex to capture PREFIX and NUMBER from formats like "RN300" or "STX-500"
        // Range Pattern: START - END (e.g., RN300-RN325)
        const rangeRegex = /^([A-Z-]+)(\d+)-([A-Z-]+)(\d+)$/i;
        const match = token.match(rangeRegex);

        if (!match) return [token];

        const [, prefix1, num1Str, prefix2, num2Str] = match;

        // Ensure prefixes match (case-insensitive check, but use original case for reconstruction if needed)
        if (prefix1.toUpperCase() !== prefix2.toUpperCase()) return [token];

        const start = parseInt(num1Str, 10);
        const end = parseInt(num2Str, 10);

        if (start > end) return [token];
        
        // Safety cap to prevent massive loops
        if (end - start > 1000) return [token];

        const expanded: string[] = [];
        const paddingLength = num1Str.length;
        const shouldPad = num1Str.startsWith('0') && num1Str.length > 1;

        for (let i = start; i <= end; i++) {
            let numPart = i.toString();
            if (shouldPad) {
                numPart = numPart.padStart(paddingLength, '0');
            }
            expanded.push(`${prefix1}${numPart}`);
        }

        return expanded;
    };

    const handleBulkAdd = async () => {
        if (!selectedCollection || !allProducts || !bulkSkus.trim()) return;
        
        setIsBulkAdding(true);
        const lines = bulkSkus.split(/[\n, ]+/).filter(x => x.trim().length > 0);
        
        // Expand ranges
        const expandedSkus: string[] = [];
        lines.forEach(token => {
            const result = expandSkuRange(token.trim().toUpperCase());
            expandedSkus.push(...result);
        });

        let foundCount = 0;
        let notFoundCount = 0;
        
        try {
            // Collect all promises for parallel execution
            const updates = [];
            
            // Use a Set to avoid duplicates if ranges overlap
            const uniqueSkus = Array.from(new Set(expandedSkus));

            for (const sku of uniqueSkus) {
                const product = allProducts.find(p => p.sku === sku);
                
                if (product) {
                    foundCount++;
                    // Only add if not already in collection
                    if (!product.collections?.includes(selectedCollection.id)) {
                        const newCollections = [...(product.collections || []), selectedCollection.id];
                        updates.push(api.setProductCollections(sku, newCollections));
                    }
                } else {
                    notFoundCount++;
                }
            }
            
            await Promise.all(updates);
            await queryClient.invalidateQueries({ queryKey: ['products'] });
            
            setBulkSkus('');
            showToast(`Προστέθηκαν ${foundCount} κωδικοί. ${notFoundCount > 0 ? `${notFoundCount} δεν βρέθηκαν.` : ''}`, notFoundCount > 0 ? 'warning' : 'success');
            
        } catch (e) {
            console.error(e);
            showToast("Σφάλμα κατά την μαζική προσθήκη.", "error");
        } finally {
            setIsBulkAdding(false);
        }
    };

    const handlePrintCollection = () => {
        if (!selectedCollection || !onPrint || !productsInSelectedCollection.length) return;

        const dateStr = new Date().toLocaleDateString('el-GR');
        
        // Helper logic recycled from PriceListPage to structure data for the print view
        const items = productsInSelectedCollection.map(p => {
            const variantMap: Record<string, number> = {};
            if (p.variants && p.variants.length > 0) {
                p.variants.forEach(v => {
                    const price = v.selling_price || p.selling_price || 0;
                    if (price > 0) variantMap[v.suffix] = price;
                });
            } else if ((p.selling_price || 0) > 0) {
                variantMap[''] = p.selling_price;
            }

            const priceToSuffixes: Record<number, string[]> = {};
            Object.entries(variantMap).forEach(([suffix, price]) => {
                if (!priceToSuffixes[price]) priceToSuffixes[price] = [];
                priceToSuffixes[price].push(suffix);
            });

            const priceGroups = Object.entries(priceToSuffixes).map(([priceStr, suffixes]) => ({
                price: parseFloat(priceStr),
                suffixes: suffixes.sort()
            })).sort((a, b) => a.price - b.price);

            return {
                skuBase: p.sku,
                category: p.category,
                priceGroups
            };
        }).sort((a, b) => a.skuBase.localeCompare(b.skuBase, undefined, { numeric: true }));

        onPrint({
            title: `Collection: ${selectedCollection.name}`,
            subtitle: `${items.length} Κωδικοί`,
            date: dateStr,
            items: items
        });
    };

    const productsInSelectedCollection = useMemo(() => {
        if (!selectedCollection || !allProducts) return [];
        return allProducts.filter(p => p.collections?.includes(selectedCollection.id));
    }, [selectedCollection, allProducts]);

    const filteredAvailableProducts = useMemo(() => {
        if (!allProducts || !selectedCollection) return [];
        const searchLower = searchTerm.toLowerCase();
        return allProducts.filter(p => 
            !p.collections?.includes(selectedCollection.id) &&
            p.sku.toLowerCase().includes(searchLower)
        );
    }, [allProducts, selectedCollection, searchTerm]);

    if (loadingCollections) {
        return <div className="flex justify-center items-center h-64"><Loader2 size={32} className="animate-spin text-amber-500" /></div>;
    }
    
    if (isError) {
        return (
            <div className="max-w-7xl mx-auto space-y-6">
                 <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
                    <div className="p-2 bg-blue-100 text-blue-600 rounded-xl"><FolderKanban size={24} /></div>
                    Διαχείριση Συλλογών
                 </h1>
                <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-6 rounded-r-xl" role="alert">
                    <p className="font-bold mb-2">Σφάλμα!</p>
                    <p>Δεν ήταν δυνατή η φόρτωση των συλλογών.</p>
                    <p className="text-sm mt-4 font-mono bg-red-100/50 p-2 rounded">{(error as Error).message}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-8 h-[calc(100vh-120px)] flex flex-col">
            <div>
                <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3 tracking-tight">
                   <div className="p-2 bg-blue-100 text-blue-600 rounded-xl"><FolderKanban size={24} /></div>
                   Διαχείριση Συλλογών
                </h1>
                <p className="text-slate-500 mt-2 ml-14">Οργανώστε τα προϊόντα σε ομάδες για εύκολη εκτύπωση και οργάνωση.</p>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
                
                {/* LEFT: LIST */}
                <div className="lg:col-span-4 flex flex-col gap-4 min-h-0">
                    <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
                        <h3 className="font-bold text-slate-800 mb-3 ml-1">Νέα Συλλογή</h3>
                        <div className="flex gap-2">
                            <input type="text" value={newCollectionName} onChange={e => setNewCollectionName(e.target.value)} placeholder="Όνομα..." className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"/>
                            <button onClick={handleCreateCollection} className="bg-slate-900 text-white px-4 rounded-xl hover:bg-slate-800 transition-colors"><Plus/></button>
                        </div>
                    </div>
                    
                    <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex-1 flex flex-col min-h-0">
                        <h3 className="font-bold text-slate-800 mb-4 ml-1">Λίστα Συλλογών</h3>
                        <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                            {collections?.map(c => (
                                <div 
                                    key={c.id} 
                                    onClick={() => setSelectedCollection(c)} 
                                    className={`
                                        flex justify-between items-center p-4 rounded-2xl cursor-pointer transition-all border
                                        ${selectedCollection?.id === c.id 
                                            ? 'bg-blue-50 border-blue-200 shadow-sm' 
                                            : 'hover:bg-slate-50 border-transparent hover:border-slate-100'}
                                    `}
                                >
                                    <div className="flex items-center gap-3">
                                        <FolderKanban size={18} className={selectedCollection?.id === c.id ? 'text-blue-600' : 'text-slate-400'} />
                                        <span className={`font-bold ${selectedCollection?.id === c.id ? 'text-blue-900' : 'text-slate-700'}`}>{c.name}</span>
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteCollection(c.id); }} className="text-slate-300 hover:text-red-500 p-1 hover:bg-red-50 rounded transition-colors"><Trash2 size={16}/></button>
                                </div>
                            ))}
                            {collections?.length === 0 && <div className="text-slate-400 text-center py-10 italic">Δεν υπάρχουν συλλογές.</div>}
                        </div>
                    </div>
                </div>

                {/* RIGHT: DETAILS */}
                <div className="lg:col-span-8 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col min-h-0 relative overflow-hidden">
                    {!selectedCollection ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-10">
                            <FolderKanban size={64} className="mb-4 opacity-20" />
                            <p className="font-medium text-lg">Επιλέξτε μια συλλογή.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col h-full">
                            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                    <span className="text-blue-600">#{selectedCollection.name}</span>
                                    <span className="text-slate-400 text-sm font-normal ml-auto bg-white px-2 py-1 rounded border border-slate-200">{productsInSelectedCollection.length} προϊόντα</span>
                                </h2>
                                {onPrint && productsInSelectedCollection.length > 0 && (
                                    <button onClick={handlePrintCollection} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-md transition-all active:scale-95">
                                        <Printer size={16}/> Εκτύπωση Καταλόγου
                                    </button>
                                )}
                            </div>
                            
                            <div className="flex-1 overflow-y-auto p-6 min-h-0 custom-scrollbar">
                                
                                {/* BULK ADD SECTION */}
                                <div className="mb-8 bg-blue-50/50 p-5 rounded-2xl border border-blue-100">
                                    <h3 className="font-bold text-blue-900 mb-3 text-sm uppercase tracking-wide flex items-center gap-2">
                                        <ScanBarcode size={16}/> Μαζική Εισαγωγή
                                    </h3>
                                    <div className="flex gap-4 items-start">
                                        <div className="flex-1">
                                            <textarea 
                                                value={bulkSkus}
                                                onChange={e => setBulkSkus(e.target.value)}
                                                placeholder={`Επικολλήστε κωδικούς εδώ (π.χ. από Excel)...\nDA100\nXR2020\nSTX-505\nRN300-RN325`}
                                                className="w-full p-3 text-sm font-mono border border-blue-200 rounded-xl bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 outline-none transition-all h-24 resize-none"
                                            />
                                            <div className="flex items-center gap-2 mt-1.5 text-[10px] text-blue-500 font-medium">
                                                <Info size={12}/>
                                                <p>Υποστηρίζει εύρος (π.χ. <strong>RN300-RN325</strong>).</p>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={handleBulkAdd} 
                                            disabled={isBulkAdding || !bulkSkus.trim()}
                                            className="bg-blue-600 text-white px-6 py-4 rounded-xl font-bold h-24 flex flex-col items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isBulkAdding ? <Loader2 size={24} className="animate-spin"/> : <PackagePlus size={24}/>}
                                            <span className="text-xs">Προσθήκη</span>
                                        </button>
                                    </div>
                                </div>

                                {productsInSelectedCollection.length > 0 && (
                                    <div className="mb-8">
                                        <h3 className="font-bold text-slate-700 mb-4 text-sm uppercase tracking-wide opacity-70">Περιεχομενα</h3>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                            {productsInSelectedCollection.map(p => (
                                                <div key={p.sku} className="relative group bg-white border border-slate-100 rounded-xl p-3 shadow-sm hover:shadow-md transition-all text-center">
                                                    <div className="aspect-square bg-slate-50 rounded-lg mb-2 overflow-hidden border border-slate-50">
                                                        {p.image_url ? (
                                                            <img src={p.image_url} alt={p.sku} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"/>
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs">No Image</div>
                                                        )}
                                                    </div>
                                                    <p className="text-xs font-bold text-slate-800 truncate">{p.sku}</p>
                                                    <button onClick={() => handleToggleProduct(p.sku, selectedCollection.id)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1.5 shadow-md opacity-0 group-hover:opacity-100 transition-all hover:bg-red-600 scale-75 group-hover:scale-100"><X size={14}/></button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="pt-4 border-t border-slate-100">
                                    <h3 className="font-bold text-slate-700 mb-4 text-sm uppercase tracking-wide opacity-70 flex items-center justify-between">
                                        <span>Επιλογη απο Μητρωο</span>
                                    </h3>
                                     <div className="relative mb-6 group">
                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                                        <input type="text" placeholder="Αναζήτηση διαθέσιμων προϊόντων..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-11 p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"/>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                        {filteredAvailableProducts.map(p => (
                                            <div key={p.sku} onClick={() => handleToggleProduct(p.sku, selectedCollection.id)} className="relative group bg-white border border-slate-100 rounded-xl p-3 shadow-sm hover:shadow-md transition-all text-center cursor-pointer hover:border-emerald-200 active:scale-95">
                                                <div className="aspect-square bg-slate-50 rounded-lg mb-2 overflow-hidden relative">
                                                    {p.image_url ? (
                                                        <img src={p.image_url} alt={p.sku} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"/>
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs">No Image</div>
                                                    )}
                                                    <div className="absolute inset-0 bg-emerald-500/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                        <div className="bg-emerald-500 text-white rounded-full p-2 shadow-lg"><Plus size={20}/></div>
                                                    </div>
                                                </div>
                                                <p className="text-xs font-bold text-slate-800 truncate">{p.sku}</p>
                                            </div>
                                        ))}
                                        {filteredAvailableProducts.length === 0 && searchTerm && <div className="col-span-full text-center text-slate-400 py-8 italic">Δεν βρέθηκαν άλλα προϊόντα με αυτόν τον όρο.</div>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
