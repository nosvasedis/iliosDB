
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { Search, Printer, Share2, Plus, X, ListPlus, FolderKanban, Check, Trash2 } from 'lucide-react';
import { formatCurrency } from '../../utils/pricingEngine';
import { useUI } from '../UIProvider';
import { PriceListPrintData } from '../PriceListPrintView';

interface Props {
    onPrint?: (data: PriceListPrintData) => void;
}

export default function MobilePriceList({ onPrint }: Props) {
    const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
    const { data: collections } = useQuery({ queryKey: ['collections'], queryFn: api.getCollections });
    
    const [mode, setMode] = useState<'collections' | 'custom'>('collections');
    
    // Updated to array for multiple selections
    const [selectedCollectionIds, setSelectedCollectionIds] = useState<number[]>([]);
    
    const [customList, setCustomList] = useState<string[]>([]);
    const [search, setSearch] = useState('');
    const { showToast } = useUI();

    const displayedItems = useMemo(() => {
        if (!products) return [];
        let list = products.filter(p => !p.is_component);

        if (mode === 'collections') {
            if (selectedCollectionIds.length > 0) {
                // If collections are selected, check if product belongs to ANY of them
                list = list.filter(p => p.collections?.some(id => selectedCollectionIds.includes(id)));
            }
            if (search) {
                const lower = search.toLowerCase();
                list = list.filter(p => p.sku.toLowerCase().includes(lower) || p.category.toLowerCase().includes(lower));
            }
        } else {
            if (search) {
                const lower = search.toLowerCase();
                list = list.filter(p => p.sku.toLowerCase().includes(lower) || p.category.toLowerCase().includes(lower)).slice(0, 20);
            } else {
                list = list.filter(p => customList.includes(p.sku));
            }
        }
        return list.sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }));
    }, [products, mode, selectedCollectionIds, customList, search]);

    const toggleCustomItem = (sku: string) => {
        setCustomList(prev => prev.includes(sku) ? prev.filter(s => s !== sku) : [...prev, sku]);
        if (search) showToast(customList.includes(sku) ? 'Αφαιρέθηκε.' : 'Προστέθηκε.', 'success');
    };

    const toggleCollection = (id: number) => {
        setSelectedCollectionIds(prev => 
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const clearCollections = () => {
        setSelectedCollectionIds([]);
    };

    const clearCustomList = () => { setCustomList([]); showToast('Η λίστα καθαρίστηκε.', 'info'); };

    const handlePrint = () => {
        const itemsToPrint = mode === 'custom' ? products?.filter(p => customList.includes(p.sku)) || [] : displayedItems;
        const items = itemsToPrint.map(p => {
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
            return { skuBase: p.sku, category: p.category, priceGroups };
        }).sort((a, b) => a.skuBase.localeCompare(b.skuBase, undefined, { numeric: true }));

        const dateStr = new Date().toLocaleDateString('el-GR');
        let title = 'Τιμοκατάλογος';
        if (mode === 'custom') title = 'Επιλεγμένα Είδη';
        else if (selectedCollectionIds.length > 0) {
            if (selectedCollectionIds.length === 1) {
                title = collections?.find(c => c.id === selectedCollectionIds[0])?.name || 'Συλλογή';
            } else {
                title = `${selectedCollectionIds.length} Συλλογές`;
            }
        }

        if (items.length === 0) { showToast("Δεν υπάρχουν είδη.", "error"); return; }
        if (onPrint) onPrint({ title: `${title} - ${dateStr}`, subtitle: `${items.length} Κωδικοί`, date: dateStr, items });
    };

    return (
        <div className="p-4 h-full flex flex-col pb-24">
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl font-black text-slate-900">Τιμοκατάλογος</h1>
                <button onClick={handlePrint} className="p-2 bg-slate-900 text-white rounded-xl shadow-md active:scale-95 transition-transform"><Printer size={20}/></button>
            </div>

            <div className="flex bg-slate-100 p-1 rounded-xl mb-4 shrink-0">
                <button onClick={() => { setMode('collections'); setSearch(''); }} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${mode === 'collections' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}><FolderKanban size={14}/> Συλλογές</button>
                <button onClick={() => { setMode('custom'); setSearch(''); }} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${mode === 'custom' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500'}`}><ListPlus size={14}/> Επιλογή ({customList.length})</button>
            </div>

            <div className="space-y-4 flex-1 flex flex-col min-h-0">
                <div className="relative shrink-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                    <input type="text" placeholder={mode === 'custom' ? "Αναζήτηση για προσθήκη..." : "Αναζήτηση..."} value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 p-3 bg-white border border-slate-200 rounded-xl outline-none font-bold text-sm focus:ring-2 focus:ring-teal-500/20"/>
                    {mode === 'custom' && !search && customList.length > 0 && <button onClick={clearCustomList} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-slate-100 rounded-lg text-slate-400 hover:text-red-500"><Trash2 size={14}/></button>}
                </div>

                {mode === 'collections' && (
                    <div className="overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide shrink-0">
                        <div className="flex gap-2">
                            <button 
                                onClick={clearCollections}
                                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition-all ${selectedCollectionIds.length === 0 ? 'bg-teal-500 text-white border-teal-500' : 'bg-white text-slate-500 border-slate-200'}`}
                            >
                                Όλα
                            </button>
                            {collections?.map(c => {
                                const isSelected = selectedCollectionIds.includes(c.id);
                                return (
                                    <button 
                                        key={c.id} 
                                        onClick={() => toggleCollection(c.id)}
                                        className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition-all flex items-center gap-2 ${isSelected ? 'bg-teal-500 text-white border-teal-500 shadow-sm' : 'bg-white text-slate-500 border-slate-200'}`}
                                    >
                                        {c.name}
                                        {isSelected && <Check size={12} />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        {displayedItems.map((p, idx) => {
                            const hasVariants = p.variants && p.variants.length > 0;
                            let priceDisplay = '';
                            if (hasVariants) {
                                const prices = p.variants?.map(v => v.selling_price || 0).filter(p => p > 0);
                                if (prices && prices.length > 0) {
                                    const min = Math.min(...prices);
                                    const max = Math.max(...prices);
                                    priceDisplay = min === max ? formatCurrency(min) : `${formatCurrency(min)} - ${formatCurrency(max)}`;
                                } else priceDisplay = '-';
                            } else priceDisplay = p.selling_price > 0 ? formatCurrency(p.selling_price) : '-';
                            const isSelected = customList.includes(p.sku);
                            return (
                                <div key={p.sku} className={`p-4 flex justify-between items-center ${idx < displayedItems.length - 1 ? 'border-b border-slate-50' : ''}`}>
                                    <div><div className="font-bold text-slate-800">{p.sku}</div><div className="text-xs text-slate-500">{p.category}</div></div>
                                    <div className="flex items-center gap-3">
                                        <div className="font-mono font-black text-slate-900 text-sm">{priceDisplay}</div>
                                        {mode === 'custom' && <button onClick={() => toggleCustomItem(p.sku)} className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isSelected ? 'bg-red-50 text-red-500' : 'bg-teal-50 text-teal-600'}`}>{isSelected ? <X size={16}/> : <Plus size={16}/>}</button>}
                                    </div>
                                </div>
                            );
                        })}
                        {displayedItems.length === 0 && <div className="p-12 text-center text-slate-400 text-sm flex flex-col items-center"><ListPlus size={32} className="mb-2 opacity-30"/>{mode === 'custom' && !search ? 'Η λίστα είναι κενή.' : 'Κανένα αποτέλεσμα.'}</div>}
                    </div>
                </div>
            </div>
        </div>
    );
}
