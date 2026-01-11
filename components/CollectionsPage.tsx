
import React, { useState, useMemo, useEffect } from 'react';
import { Collection, Product } from '../types';
import { FolderKanban, Plus, Trash2, X, Search, Loader2, Printer, ScanBarcode, PackagePlus, Info, Sparkles, Save, Wand2, Quote, PenTool, FileText } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { useUI } from './UIProvider';
import { PriceListPrintData } from './PriceListPrintView';
import { generateCollectionDescription } from '../lib/gemini';
import ProductDetails from './ProductDetails';

interface Props {
    products?: Product[];
    onPrint?: (data: PriceListPrintData) => void;
}

export default function CollectionsPage({ products: allProducts, onPrint }: Props) {
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    const { data: collections, isLoading: loadingCollections, isError, error } = useQuery<Collection[]>({ queryKey: ['collections'], queryFn: api.getCollections });
    const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
    const { data: molds } = useQuery({ queryKey: ['molds'], queryFn: api.getMolds });
    const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });

    const [newCollectionName, setNewCollectionName] = useState('');
    const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Description & AI State
    const [isDescModalOpen, setIsDescModalOpen] = useState(false);
    const [collectionDesc, setCollectionDesc] = useState('');
    const [aiGuidance, setAiGuidance] = useState('');
    const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
    
    // Bulk Add State
    const [bulkSkus, setBulkSkus] = useState('');
    const [isBulkAdding, setIsBulkAdding] = useState(false);

    // Product View State
    const [viewProduct, setViewProduct] = useState<Product | null>(null);

    // Sync local desc state with selected collection when opening modal or selecting
    useEffect(() => {
        if (selectedCollection) {
            setCollectionDesc(selectedCollection.description || '');
            setAiGuidance('');
        }
    }, [selectedCollection]);

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
        const rangeRegex = /^([A-Z-]+)(\d+)([A-Z]*)-([A-Z-]+)(\d+)([A-Z]*)$/i;
        const match = token.match(rangeRegex);

        if (!match) return [token];

        const [, prefix1, num1Str, suffix1, prefix2, num2Str, suffix2] = match;

        if (prefix1.toUpperCase() !== prefix2.toUpperCase() || suffix1.toUpperCase() !== suffix2.toUpperCase()) {
            return [token];
        }

        const start = parseInt(num1Str, 10);
        const end = parseInt(num2Str, 10);

        if (start > end) return [token];
        
        if (end - start > 1000) return [token];

        const expanded: string[] = [];
        const paddingLength = num1Str.length;
        const shouldPad = num1Str.startsWith('0') || num1Str.length > 1;

        for (let i = start; i <= end; i++) {
            let numPart = i.toString();
            if (shouldPad) {
                numPart = numPart.padStart(paddingLength, '0');
            }
            expanded.push(`${prefix1.toUpperCase()}${numPart}${suffix1.toUpperCase()}`);
        }

        return expanded;
    };

    const handleBulkAdd = async () => {
        if (!selectedCollection || !allProducts || !bulkSkus.trim()) return;
        
        setIsBulkAdding(true);
        const lines = bulkSkus.split(/[\n, ]+/).filter(x => x.trim().length > 0);
        
        const expandedSkus: string[] = [];
        lines.forEach(token => {
            const result = expandSkuRange(token.trim().toUpperCase());
            expandedSkus.push(...result);
        });

        let foundCount = 0;
        let notFoundCount = 0;
        const newAssociations: { product_sku: string, collection_id: number }[] = [];
        
        try {
            const uniqueSkus = Array.from(new Set(expandedSkus));

            for (const sku of uniqueSkus) {
                const product = allProducts.find(p => p.sku === sku);
                
                if (product) {
                    foundCount++;
                    if (!product.collections?.includes(selectedCollection.id)) {
                        newAssociations.push({ product_sku: sku, collection_id: selectedCollection.id });
                    }
                } else {
                    notFoundCount++;
                }
            }
            
            if (newAssociations.length > 0) {
                await api.addProductsToCollection(newAssociations);
                await queryClient.invalidateQueries({ queryKey: ['products'] });
                setBulkSkus('');
                showToast(`Προστέθηκαν ${foundCount} κωδικοί.`, 'success');
            } else if (foundCount > 0) {
                showToast(`Οι ${foundCount} κωδικοί βρίσκονται ήδη στη συλλογή.`, 'info');
            }

            if (notFoundCount > 0) {
                showToast(`${notFoundCount} κωδικοί δεν βρέθηκαν.`, 'warning');
            }
            
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

    const handleGenerateDescription = async () => {
        if (!selectedCollection || !productsInSelectedCollection.length) {
            showToast("Προσθέστε προϊόντα στη συλλογή πρώτα.", "info");
            return;
        }
        
        setIsGeneratingDesc(true);
        try {
            const text = await generateCollectionDescription(
                selectedCollection.name,
                productsInSelectedCollection,
                aiGuidance
            );
            setCollectionDesc(text);
            showToast("Η περιγραφή δημιουργήθηκε!", "success");
        } catch (e: any) {
            showToast(`Σφάλμα: ${e.message}`, "error");
        } finally {
            setIsGeneratingDesc(false);
        }
    };

    const handleSaveDescription = async () => {
        if (!selectedCollection) return;
        try {
            await api.updateCollection(selectedCollection.id, { description: collectionDesc });
            queryClient.invalidateQueries({ queryKey: ['collections'] });
            
            // Update local selected collection to reflect change immediately in UI
            setSelectedCollection(prev => prev ? ({...prev, description: collectionDesc}) : null);
            
            showToast("Η περιγραφή αποθηκεύτηκε.", "success");
            setIsDescModalOpen(false);
        } catch (e) {
            showToast("Σφάλμα αποθήκευσης.", "error");
        }
    };

    const productsInSelectedCollection = useMemo(() => {
        if (!selectedCollection || !allProducts) return [];
        return allProducts
            .filter(p => p.collections?.includes(selectedCollection.id))
            .sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }));
    }, [selectedCollection, allProducts]);

    const filteredAvailableProducts = useMemo(() => {
        if (!allProducts || !selectedCollection) return [];
        const searchLower = searchTerm.toLowerCase();
        return allProducts.filter(p => 
            !p.collections?.includes(selectedCollection.id) &&
            p.sku.toLowerCase().includes(searchLower)
        ).sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }));
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
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 min-h-0">
                
                {/* LEFT: LIST */}
                <div className="lg:col-span-4 flex flex-col gap-6 min-h-0">
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                        <h3 className="font-bold text-slate-800 mb-3 ml-1 text-sm uppercase tracking-wide">Νέα Συλλογή</h3>
                        <div className="flex gap-2">
                            <input type="text" value={newCollectionName} onChange={e => setNewCollectionName(e.target.value)} placeholder="Όνομα..." className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-medium"/>
                            <button onClick={handleCreateCollection} className="bg-slate-900 text-white px-4 rounded-xl hover:bg-slate-800 transition-colors shadow-lg active:scale-95"><Plus/></button>
                        </div>
                    </div>
                    
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex-1 flex flex-col min-h-0">
                        <h3 className="font-bold text-slate-800 mb-4 ml-1 text-sm uppercase tracking-wide">Λίστα Συλλογών</h3>
                        <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                            {collections?.map(c => (
                                <div 
                                    key={c.id} 
                                    onClick={() => setSelectedCollection(c)} 
                                    className={`
                                        flex justify-between items-center p-4 rounded-2xl cursor-pointer transition-all border group
                                        ${selectedCollection?.id === c.id 
                                            ? 'bg-blue-50 border-blue-200 shadow-sm ring-1 ring-blue-100' 
                                            : 'hover:bg-slate-50 border-transparent hover:border-slate-100'}
                                    `}
                                >
                                    <div className="flex items-center gap-3">
                                        <FolderKanban size={18} className={selectedCollection?.id === c.id ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'} />
                                        <span className={`font-bold ${selectedCollection?.id === c.id ? 'text-blue-900' : 'text-slate-700'}`}>{c.name}</span>
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteCollection(c.id); }} className="text-slate-300 hover:text-red-500 p-2 hover:bg-red-50 rounded-xl transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={16}/></button>
                                </div>
                            ))}
                            {collections?.length === 0 && <div className="text-slate-400 text-center py-10 italic text-sm">Δεν υπάρχουν συλλογές.</div>}
                        </div>
                    </div>
                </div>

                {/* RIGHT: DETAILS */}
                <div className="lg:col-span-8 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col min-h-0 relative overflow-hidden">
                    {!selectedCollection ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-10">
                            <div className="p-6 bg-slate-50 rounded-full mb-4">
                                <FolderKanban size={48} className="opacity-20" />
                            </div>
                            <p className="font-bold text-lg text-slate-500">Επιλέξτε μια συλλογή</p>
                            <p className="text-sm opacity-70">για να δείτε τα προϊόντα και τις λεπτομέρειες.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col h-full">
                            <div className="p-8 border-b border-slate-100 bg-white sticky top-0 z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="bg-blue-100 text-blue-700 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wide">Συλλογη</span>
                                        <span className="text-slate-400 text-xs font-medium">{productsInSelectedCollection.length} αντικείμενα</span>
                                    </div>
                                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">{selectedCollection.name}</h2>
                                </div>
                                
                                {onPrint && productsInSelectedCollection.length > 0 && (
                                    <button onClick={handlePrintCollection} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-3 rounded-xl text-sm font-bold flex items-center gap-2 transition-all">
                                        <Printer size={18}/> Εκτύπωση
                                    </button>
                                )}
                            </div>
                            
                            <div className="flex-1 overflow-y-auto p-8 min-h-0 custom-scrollbar space-y-8">
                                
                                {/* DESCRIPTION SECTION (HERO) */}
                                <div className="bg-gradient-to-br from-slate-50 to-white p-8 rounded-[2rem] border border-slate-100 relative overflow-hidden group hover:border-slate-200 transition-colors">
                                    <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
                                        <Quote size={120} className="text-slate-900" />
                                    </div>
                                    
                                    <div className="relative z-10 flex flex-col items-center text-center max-w-2xl mx-auto">
                                        {selectedCollection.description ? (
                                            <p className="text-lg text-slate-700 font-serif italic leading-relaxed mb-6">
                                                "{selectedCollection.description}"
                                            </p>
                                        ) : (
                                            <p className="text-slate-400 text-sm italic mb-6">Δεν έχει οριστεί περιγραφή για αυτή τη συλλογή.</p>
                                        )}
                                        
                                        <button 
                                            onClick={() => setIsDescModalOpen(true)}
                                            className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-5 py-2.5 rounded-full text-xs font-bold hover:border-purple-300 hover:text-purple-600 hover:shadow-md transition-all shadow-sm"
                                        >
                                            <Sparkles size={14}/> {selectedCollection.description ? 'Επεξεργασία / AI' : 'Δημιουργία Περιεχομένου'}
                                        </button>
                                    </div>
                                </div>

                                {/* PRODUCTS GRID */}
                                <div>
                                    <h3 className="font-bold text-slate-800 mb-4 text-sm uppercase tracking-wide flex items-center gap-2">
                                        <FileText size={16} className="text-slate-400"/> Περιεχομενα
                                    </h3>
                                    
                                    {productsInSelectedCollection.length > 0 ? (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                            {productsInSelectedCollection.map(p => (
                                                <div 
                                                    key={p.sku} 
                                                    onClick={() => setViewProduct(p)}
                                                    className="relative group bg-white border border-slate-100 rounded-2xl p-3 shadow-sm hover:shadow-lg transition-all text-center hover:-translate-y-1 cursor-pointer"
                                                >
                                                    {/* Remove Button - Top Right - Smaller */}
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleToggleProduct(p.sku, selectedCollection.id); }} 
                                                        className="absolute top-2 right-2 z-10 bg-white/90 text-slate-400 hover:text-red-500 p-1 rounded-full shadow-sm border border-slate-100 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-50"
                                                        title="Αφαίρεση"
                                                    >
                                                        <X size={14}/>
                                                    </button>

                                                    <div className="aspect-square bg-slate-50 rounded-xl mb-3 overflow-hidden border border-slate-50 relative">
                                                        {p.image_url ? (
                                                            <img src={p.image_url} alt={p.sku} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"/>
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs">No Image</div>
                                                        )}
                                                    </div>
                                                    <p className="text-xs font-black text-slate-800 truncate">{p.sku}</p>
                                                    <p className="text-[10px] text-slate-500 truncate">{p.category}</p>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-12 border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50/50">
                                            <p className="text-slate-400 text-sm font-medium">Η συλλογή είναι άδεια.</p>
                                        </div>
                                    )}
                                </div>

                                {/* ADD PRODUCTS & BULK ADD */}
                                <div className="pt-8 border-t border-slate-100 grid grid-cols-1 xl:grid-cols-2 gap-8">
                                    
                                    {/* Picker */}
                                    <div className="space-y-4">
                                        <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide">Επιλογη απο Μητρωο</h3>
                                        <div className="relative">
                                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                            <input type="text" placeholder="Αναζήτηση..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-11 p-3 border border-slate-200 rounded-xl bg-slate-50 text-sm font-medium focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"/>
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-64 overflow-y-auto custom-scrollbar p-1">
                                            {filteredAvailableProducts.map(p => (
                                                <button 
                                                    key={p.sku} 
                                                    onClick={() => handleToggleProduct(p.sku, selectedCollection.id)} 
                                                    className="flex items-center gap-3 p-2 bg-white border border-slate-100 rounded-xl hover:border-emerald-300 hover:shadow-md transition-all group text-left"
                                                >
                                                    <div className="w-10 h-10 bg-slate-50 rounded-lg overflow-hidden shrink-0 border border-slate-100">
                                                        {p.image_url ? <img src={p.image_url} className="w-full h-full object-cover"/> : null}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="text-xs font-bold text-slate-800 truncate">{p.sku}</div>
                                                        <div className="text-[9px] text-emerald-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity">ΠΡΟΣΘΗΚΗ</div>
                                                    </div>
                                                </button>
                                            ))}
                                            {filteredAvailableProducts.length === 0 && searchTerm && <div className="col-span-full text-center text-xs text-slate-400 py-4">Δεν βρέθηκαν αποτελέσματα.</div>}
                                        </div>
                                    </div>

                                    {/* Bulk Add */}
                                    <div className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100 space-y-4 h-fit">
                                        <h3 className="font-bold text-blue-900 text-sm uppercase tracking-wide flex items-center gap-2">
                                            <ScanBarcode size={16}/> Μαζική Εισαγωγή
                                        </h3>
                                        <textarea 
                                            value={bulkSkus}
                                            onChange={e => setBulkSkus(e.target.value)}
                                            placeholder={`Επικολλήστε κωδικούς (π.χ. από Excel)...\nDA100\nXR2020\nMN050S-MN063S`}
                                            className="w-full p-4 text-xs font-mono border border-blue-200 rounded-xl bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 outline-none transition-all h-32 resize-none"
                                        />
                                        <button 
                                            onClick={handleBulkAdd} 
                                            disabled={isBulkAdding || !bulkSkus.trim()}
                                            className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isBulkAdding ? <Loader2 size={16} className="animate-spin"/> : <PackagePlus size={16}/>}
                                            {isBulkAdding ? 'Προσθήκη...' : 'Μαζική Προσθήκη'}
                                        </button>
                                    </div>

                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* DESCRIPTION AI MODAL */}
            {isDescModalOpen && selectedCollection && (
                <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                                    <Sparkles className="text-purple-500" size={20}/> Διαχείριση Περιεχομένου
                                </h3>
                                <p className="text-xs text-slate-500 font-medium">Storytelling & Marketing Copy</p>
                            </div>
                            <button onClick={() => setIsDescModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors"><X size={20}/></button>
                        </div>
                        
                        <div className="p-8 space-y-6 flex-1 overflow-y-auto">
                            
                            {/* AI Control */}
                            <div className="bg-purple-50 p-5 rounded-2xl border border-purple-100 space-y-3">
                                <label className="text-xs font-bold text-purple-800 uppercase tracking-wide flex items-center gap-2">
                                    <Wand2 size={14}/> AI Generator
                                </label>
                                <div className="flex gap-3">
                                    <input 
                                        type="text" 
                                        value={aiGuidance}
                                        onChange={e => setAiGuidance(e.target.value)}
                                        placeholder="Π.χ. 'Καλοκαιρινή διάθεση', 'Πολυτέλεια', 'Minimal'..."
                                        className="flex-1 p-3 border border-purple-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-purple-500/20 outline-none"
                                    />
                                    <button 
                                        onClick={handleGenerateDescription}
                                        disabled={isGeneratingDesc || productsInSelectedCollection.length === 0}
                                        className="bg-purple-600 text-white px-5 rounded-xl font-bold text-xs shadow-md hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                        {isGeneratingDesc ? <Loader2 size={16} className="animate-spin"/> : <Sparkles size={16}/>}
                                        {isGeneratingDesc ? 'Δημιουργία...' : 'Δημιουργία'}
                                    </button>
                                </div>
                                <p className="text-[10px] text-purple-600/70 italic ml-1">
                                    Το AI θα αναλύσει τα {productsInSelectedCollection.length} προϊόντα της συλλογής για να γράψει το κείμενο.
                                </p>
                            </div>

                            {/* Editor */}
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 block flex items-center gap-2">
                                    <PenTool size={14}/> Κείμενο Περιγραφής
                                </label>
                                <textarea 
                                    value={collectionDesc}
                                    onChange={e => setCollectionDesc(e.target.value)}
                                    className="w-full p-5 border border-slate-200 rounded-2xl bg-white focus:ring-4 focus:ring-slate-100 outline-none text-slate-700 leading-relaxed font-serif text-base h-48 resize-none shadow-inner"
                                    placeholder="Γράψτε εδώ ή χρησιμοποιήστε το AI..."
                                />
                            </div>

                        </div>

                        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                            <button onClick={() => setIsDescModalOpen(false)} className="px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors">
                                Ακύρωση
                            </button>
                            <button onClick={handleSaveDescription} className="px-8 py-3 rounded-xl bg-slate-900 text-white font-bold hover:bg-black transition-colors shadow-lg flex items-center gap-2">
                                <Save size={18}/> Αποθήκευση
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* PRODUCT DETAILS MODAL */}
            {viewProduct && settings && materials && molds && (
                <ProductDetails 
                    product={viewProduct} 
                    allProducts={allProducts || []} 
                    allMaterials={materials} 
                    onClose={() => setViewProduct(null)} 
                    setPrintItems={() => {}} 
                    settings={settings}
                    collections={collections || []}
                    allMolds={molds}
                />
            )}

        </div>
    );
}