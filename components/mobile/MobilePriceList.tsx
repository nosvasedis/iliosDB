
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { Product, Collection } from '../../types';
import { Search, Filter, Printer, Share2, ScrollText } from 'lucide-react';
import { formatCurrency } from '../../utils/pricingEngine';
import { useUI } from '../UIProvider';

export default function MobilePriceList() {
    const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
    const { data: collections } = useQuery({ queryKey: ['collections'], queryFn: api.getCollections });
    
    const [selectedCollection, setSelectedCollection] = useState<number | 'all'>('all');
    const [search, setSearch] = useState('');
    const { showToast } = useUI();

    const filteredItems = useMemo(() => {
        if (!products) return [];
        
        let list = products.filter(p => !p.is_component);

        if (selectedCollection !== 'all') {
            list = list.filter(p => p.collections?.includes(selectedCollection));
        }

        if (search) {
            const lower = search.toLowerCase();
            list = list.filter(p => p.sku.toLowerCase().includes(lower) || p.category.toLowerCase().includes(lower));
        }

        return list.sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }));
    }, [products, selectedCollection, search]);

    const handlePrint = () => {
        window.print();
    };

    const handleShare = async () => {
        const text = filteredItems.map(p => {
            const price = p.selling_price > 0 ? formatCurrency(p.selling_price) : (p.variants?.[0]?.selling_price ? formatCurrency(p.variants[0].selling_price) : '-');
            return `${p.sku} - ${p.category}: ${price}`;
        }).join('\n');

        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Τιμοκατάλογος Ilios',
                    text: text
                });
            } catch (err) {}
        } else {
            try {
                await navigator.clipboard.writeText(text);
                showToast("Αντιγράφηκε στο πρόχειρο.", "success");
            } catch(e) {
                showToast("Η κοινοποίηση δεν υποστηρίζεται.", "error");
            }
        }
    };

    return (
        <div className="p-4 h-full flex flex-col pb-24">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-black text-slate-900">Τιμοκατάλογος</h1>
                <div className="flex gap-2 print:hidden">
                    <button onClick={handleShare} className="p-2 bg-slate-100 rounded-xl text-slate-600"><Share2 size={20}/></button>
                    <button onClick={handlePrint} className="p-2 bg-slate-900 text-white rounded-xl shadow-md"><Printer size={20}/></button>
                </div>
            </div>

            <div className="space-y-4 print:hidden">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                    <input 
                        type="text" 
                        placeholder="Αναζήτηση..." 
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 p-3 bg-white border border-slate-200 rounded-xl outline-none font-bold text-sm focus:ring-2 focus:ring-teal-500/20"
                    />
                </div>

                <div className="overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setSelectedCollection('all')}
                            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition-all ${selectedCollection === 'all' ? 'bg-teal-500 text-white border-teal-500' : 'bg-white text-slate-500 border-slate-200'}`}
                        >
                            Όλα
                        </button>
                        {collections?.map(c => (
                            <button 
                                key={c.id}
                                onClick={() => setSelectedCollection(c.id)}
                                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition-all ${selectedCollection === c.id ? 'bg-teal-500 text-white border-teal-500' : 'bg-white text-slate-500 border-slate-200'}`}
                            >
                                {c.name}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 mt-4 print:overflow-visible">
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    {filteredItems.map((p, idx) => {
                        const hasVariants = p.variants && p.variants.length > 0;
                        let priceDisplay = '';
                        
                        if (hasVariants) {
                            const prices = p.variants?.map(v => v.selling_price || 0).filter(p => p > 0);
                            if (prices && prices.length > 0) {
                                const min = Math.min(...prices);
                                const max = Math.max(...prices);
                                priceDisplay = min === max ? formatCurrency(min) : `${formatCurrency(min)} - ${formatCurrency(max)}`;
                            } else {
                                priceDisplay = '-';
                            }
                        } else {
                            priceDisplay = p.selling_price > 0 ? formatCurrency(p.selling_price) : '-';
                        }

                        return (
                            <div key={p.sku} className={`p-4 flex justify-between items-center ${idx < filteredItems.length - 1 ? 'border-b border-slate-50' : ''}`}>
                                <div>
                                    <div className="font-bold text-slate-800">{p.sku}</div>
                                    <div className="text-xs text-slate-500">{p.category}</div>
                                </div>
                                <div className="font-mono font-black text-slate-900">{priceDisplay}</div>
                            </div>
                        );
                    })}
                    {filteredItems.length === 0 && <div className="p-8 text-center text-slate-400 text-sm">Κανένα αποτέλεσμα.</div>}
                </div>
            </div>
        </div>
    );
}
