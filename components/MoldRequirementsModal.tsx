
import React, { useState, useMemo } from 'react';
import { ProductionBatch, Order, Product, Mold, ProductionStage } from '../types';
import { Search, X, CheckSquare, Square, MapPin, Grid, Info, CheckCircle2 } from 'lucide-react';
import { getVariantComponents } from '../utils/pricingEngine';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    orders: Order[];
    batches: ProductionBatch[];
    products: Product[];
    molds: Mold[];
}

export default function MoldRequirementsModal({ isOpen, onClose, orders, batches, products, molds }: Props) {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

    // 1. Identify Orders that actually have batches in relevant stages (Waxing/Casting)
    // We actually allow all stages except Ready/Delivered to be safe, but usually it's for casting preparation
    const relevantOrders = useMemo(() => {
        const orderIdsWithBatches = new Set(batches.map(b => b.order_id));
        
        return orders
            .filter(o => orderIdsWithBatches.has(o.id) && o.status !== 'Delivered' && o.status !== 'Cancelled')
            .filter(o => 
                o.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                o.id.includes(searchTerm)
            )
            .sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }, [orders, batches, searchTerm]);

    // 2. Aggregate Logic
    const aggregation = useMemo(() => {
        const acc: Record<string, { 
            code: string, 
            desc: string, 
            loc: string, 
            total: number, 
            breakdown: Record<string, number> 
        }> = {};

        if (selectedOrderIds.size === 0) return [];

        const targetBatches = batches.filter(b => b.order_id && selectedOrderIds.has(b.order_id));

        targetBatches.forEach(batch => {
            const product = products.find(p => p.sku === batch.sku);
            if (!product || !product.molds || product.molds.length === 0) return;

            // Determine Finish Code for this batch (P, X, D, H, or Base)
            const { finish } = getVariantComponents(batch.variant_suffix || '', product.gender);
            const finishKey = finish.code || 'STD';

            product.molds.forEach(pm => {
                if (!acc[pm.code]) {
                    const moldDetails = molds.find(m => m.code === pm.code);
                    acc[pm.code] = {
                        code: pm.code,
                        desc: moldDetails?.description || '',
                        loc: moldDetails?.location || '-',
                        total: 0,
                        breakdown: {}
                    };
                }

                const qtyNeeded = pm.quantity * batch.quantity;
                acc[pm.code].total += qtyNeeded;
                acc[pm.code].breakdown[finishKey] = (acc[pm.code].breakdown[finishKey] || 0) + qtyNeeded;
            });
        });

        return Object.values(acc).sort((a,b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    }, [selectedOrderIds, batches, products, molds]);

    const toggleOrder = (id: string) => {
        const next = new Set(selectedOrderIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedOrderIds(next);
    };

    const toggleAll = () => {
        if (selectedOrderIds.size === relevantOrders.length) {
            setSelectedOrderIds(new Set());
        } else {
            setSelectedOrderIds(new Set(relevantOrders.map(o => o.id)));
        }
    };

    const getFinishStyle = (key: string) => {
        switch(key) {
            case 'X': return 'bg-amber-100 text-amber-800 border-amber-200'; // Gold
            case 'P': return 'bg-slate-200 text-slate-700 border-slate-300'; // Patina
            case 'D': return 'bg-orange-100 text-orange-800 border-orange-200'; // Two-Tone
            case 'H': return 'bg-cyan-100 text-cyan-800 border-cyan-200'; // Platinum
            default: return 'bg-emerald-50 text-emerald-700 border-emerald-200'; // Standard/Lustre
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-7xl h-[85vh] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
                
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl"><Grid size={24}/></div>
                            Ανάλυση Λάστιχων & Κεριών
                        </h2>
                        <p className="text-slate-500 font-medium ml-12">Υπολογισμός απαιτήσεων βάσει επιλεγμένων παραγγελιών.</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
                        <X size={24}/>
                    </button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    
                    {/* LEFT: Order Selector */}
                    <div className="w-[350px] bg-slate-50 border-r border-slate-200 flex flex-col shrink-0">
                        <div className="p-4 border-b border-slate-200 space-y-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                                <input 
                                    type="text" 
                                    placeholder="Αναζήτηση εντολής..." 
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full pl-9 p-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20"
                                />
                            </div>
                            <button 
                                onClick={toggleAll}
                                className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors"
                            >
                                {selectedOrderIds.size === relevantOrders.length ? <CheckSquare size={16}/> : <Square size={16}/>}
                                Επιλογή Όλων ({relevantOrders.length})
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                            {relevantOrders.map(order => {
                                const isSelected = selectedOrderIds.has(order.id);
                                const activeBatchesCount = batches.filter(b => b.order_id === order.id).length;
                                
                                return (
                                    <div 
                                        key={order.id} 
                                        onClick={() => toggleOrder(order.id)}
                                        className={`p-3 rounded-xl border cursor-pointer transition-all ${isSelected ? 'bg-white border-indigo-500 shadow-md ring-1 ring-indigo-500/20' : 'bg-white border-slate-200 hover:border-indigo-300'}`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className={`mt-1 ${isSelected ? 'text-indigo-600' : 'text-slate-300'}`}>
                                                {isSelected ? <CheckCircle2 size={18} className="fill-indigo-50"/> : <div className="w-4 h-4 rounded-full border-2 border-slate-300"/>}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="font-bold text-slate-800 text-sm truncate">{order.customer_name}</div>
                                                <div className="text-[10px] font-mono text-slate-500 font-bold">#{order.id.slice(0, 8)}</div>
                                                <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-black uppercase">
                                                    {activeBatchesCount} παρτίδες
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {relevantOrders.length === 0 && (
                                <div className="text-center p-8 text-slate-400 text-sm italic">
                                    Δεν βρέθηκαν ενεργές εντολές.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* RIGHT: Mold Results */}
                    <div className="flex-1 flex flex-col bg-slate-100/50">
                        {aggregation.length > 0 ? (
                            <>
                                <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between shadow-sm">
                                    <div className="flex gap-4 text-sm">
                                        <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-100 font-bold">
                                            <Grid size={16}/> {aggregation.length} Μήτρες
                                        </div>
                                        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100 font-bold">
                                            <Info size={16}/> {aggregation.reduce((sum, item) => sum + item.total, 0)} Κεριά Συνολικά
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                        {aggregation.map(item => (
                                            <div key={item.code} className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden hover:shadow-md transition-shadow">
                                                <div className="p-4 border-b border-slate-50 flex justify-between items-start bg-slate-50/50">
                                                    <div>
                                                        <div className="font-black text-xl text-slate-800 leading-none">{item.code}</div>
                                                        <div className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider">{item.desc || 'Χωρίς περιγραφή'}</div>
                                                    </div>
                                                    <div className="flex items-center gap-1 text-xs font-bold text-slate-500 bg-white px-2 py-1 rounded border border-slate-200">
                                                        <MapPin size={12}/> {item.loc}
                                                    </div>
                                                </div>
                                                
                                                <div className="p-3 bg-white flex-1">
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {Object.entries(item.breakdown).map(([key, qty]) => (
                                                            <div key={key} className={`flex items-center justify-between w-full px-2 py-1.5 rounded-lg border text-xs font-bold ${getFinishStyle(key)}`}>
                                                                <span>{key === 'STD' ? 'ΒΑΣΙΚΟ' : key}</span>
                                                                <span className="text-sm font-black">{qty}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div className="p-2 bg-slate-50 border-t border-slate-100 text-right">
                                                    <span className="text-[10px] text-slate-400 uppercase font-bold mr-2">ΣΥΝΟΛΟ</span>
                                                    <span className="text-lg font-black text-slate-800">{item.total}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                    <Grid size={40} className="opacity-20"/>
                                </div>
                                <p className="font-bold text-lg">Επιλέξτε παραγγελίες</p>
                                <p className="text-sm">για να δείτε τα απαιτούμενα λάστιχα.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
