
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { Search, DollarSign, TrendingUp } from 'lucide-react';
import { formatCurrency } from '../../utils/pricingEngine';

export default function MobilePricing() {
    const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
    const [search, setSearch] = useState('');

    const pricingList = useMemo(() => {
        if (!products) return [];
        const lower = search.toLowerCase();
        
        return products
            .filter(p => !p.is_component) // Exclude components from basic list
            .filter(p => p.sku.toLowerCase().includes(lower) || p.category.toLowerCase().includes(lower))
            .map(p => {
                const cost = p.active_price || 0;
                const price = p.selling_price || 0;
                const margin = price > 0 ? ((price - cost) / price) * 100 : 0;
                return { ...p, cost, price, margin };
            })
            .slice(0, 50);
    }, [products, search]);

    return (
        <div className="p-4 h-full flex flex-col">
            <h1 className="text-2xl font-black text-slate-900 mb-4">Τιμολόγηση</h1>

            <div className="relative mb-4 shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                    type="text" 
                    placeholder="Αναζήτηση..." 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm font-medium"
                />
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pb-24 custom-scrollbar">
                {pricingList.map(item => (
                    <div key={item.sku} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <div className="font-black text-slate-800 text-base">{item.sku}</div>
                                <div className="text-[10px] text-slate-500">{item.category}</div>
                            </div>
                            <div className="text-right">
                                <div className="font-black text-slate-900 text-lg">{formatCurrency(item.price)}</div>
                                <div className="text-[10px] text-slate-400 uppercase font-bold">Χονδρική</div>
                            </div>
                        </div>
                        <div className="flex gap-4 border-t border-slate-50 pt-2">
                            <div className="flex-1">
                                <div className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Κόστος</div>
                                <div className="text-xs font-bold text-slate-600 font-mono">{formatCurrency(item.cost)}</div>
                            </div>
                            <div className="flex-1 text-right">
                                <div className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Περιθώριο</div>
                                <div className={`text-xs font-black flex items-center justify-end gap-1 ${item.margin < 30 ? 'text-red-500' : 'text-emerald-500'}`}>
                                    <TrendingUp size={10}/> {item.margin.toFixed(1)}%
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
                {pricingList.length === 0 && (
                    <div className="text-center py-10 text-slate-400 text-sm font-medium">
                        Δεν βρέθηκαν προϊόντα.
                    </div>
                )}
            </div>
        </div>
    );
}
