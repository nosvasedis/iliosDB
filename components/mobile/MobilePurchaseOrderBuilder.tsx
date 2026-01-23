
import React, { useState, useMemo } from 'react';
import { Supplier, SupplierOrderItem, SupplierOrderType } from '../../types';
import { X, Search, Plus, Save, Trash2, Box, Gem } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { useUI } from '../UIProvider';
import { formatCurrency } from '../../utils/pricingEngine';

interface Props {
    supplier: Supplier;
    onClose: () => void;
}

export default function MobilePurchaseOrderBuilder({ supplier, onClose }: Props) {
    const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
    const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
    const queryClient = useQueryClient();
    const { showToast } = useUI();

    const [items, setItems] = useState<SupplierOrderItem[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchType, setSearchType] = useState<SupplierOrderType>('Material');
    const [notes, setNotes] = useState('');

    // Filter Logic
    const searchResults = useMemo(() => {
        const lower = searchTerm.toLowerCase();
        if (!lower) return [];
        
        if (searchType === 'Material') {
            return materials?.filter(m => m.name.toLowerCase().includes(lower)).slice(0, 10) || [];
        } else {
            return products?.filter(p => p.sku.toLowerCase().includes(lower) && !p.is_component).slice(0, 10) || [];
        }
    }, [searchTerm, searchType, materials, products]);

    const addItem = (item: any) => {
        const isProd = searchType === 'Product';
        const id = isProd ? item.sku : item.id;
        
        setItems(prev => {
            const existingIdx = prev.findIndex(i => i.item_id === id && i.item_type === searchType);
            if (existingIdx >= 0) {
                const updated = [...prev];
                updated[existingIdx].quantity += 1;
                updated[existingIdx].total_cost = updated[existingIdx].quantity * updated[existingIdx].unit_cost;
                return updated;
            }
            const cost = isProd ? (item.supplier_cost || 0) : item.cost_per_unit;
            return [...prev, {
                id: Math.random().toString(36),
                item_type: searchType,
                item_id: id,
                item_name: isProd ? item.sku : item.name,
                quantity: 1,
                unit_cost: cost,
                total_cost: cost
            }];
        });
        setSearchTerm('');
        showToast("Προστέθηκε.", "success");
    };

    const updateItem = (index: number, field: 'qty' | 'cost', val: number) => {
        setItems(prev => {
            const updated = [...prev];
            const item = { ...updated[index] };
            if (field === 'qty') item.quantity = val;
            else item.unit_cost = val;
            item.total_cost = item.quantity * item.unit_cost;
            updated[index] = item;
            return updated;
        });
    };

    const removeItem = (index: number) => setItems(prev => prev.filter((_, i) => i !== index));

    const handleSave = async () => {
        if (items.length === 0) { showToast("Η εντολή είναι κενή.", "error"); return; }
        
        try {
            const order = {
                id: crypto.randomUUID(),
                supplier_id: supplier.id,
                supplier_name: supplier.name,
                created_at: new Date().toISOString(),
                status: 'Pending',
                total_amount: items.reduce((sum, i) => sum + i.total_cost, 0),
                items,
                notes
            };
            await api.saveSupplierOrder(order as any);
            queryClient.invalidateQueries({ queryKey: ['supplier_orders'] });
            showToast("Εντολή δημιουργήθηκε!", "success");
            onClose();
        } catch (e) {
            showToast("Σφάλμα.", "error");
        }
    };

    return (
        <div className="fixed inset-0 z-[110] bg-slate-50 flex flex-col animate-in slide-in-from-bottom duration-300">
            <div className="bg-white p-4 border-b border-slate-100 flex justify-between items-center shadow-sm z-10">
                <h2 className="text-lg font-black text-slate-800">Νέα Εντολή Αγοράς</h2>
                <button onClick={onClose}><X size={24} className="text-slate-500"/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                
                {/* Search Box */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button onClick={() => setSearchType('Material')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${searchType === 'Material' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500'}`}>Υλικά</button>
                        <button onClick={() => setSearchType('Product')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${searchType === 'Product' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>Προϊόντα</button>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                        <input 
                            className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-800/20 font-medium"
                            placeholder="Αναζήτηση..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && searchResults.length > 0 && (
                            <div className="absolute top-full left-0 right-0 bg-white shadow-xl rounded-xl border border-slate-100 mt-2 z-50 overflow-hidden max-h-48 overflow-y-auto">
                                {searchResults.map((r: any) => (
                                    <div key={r.id || r.sku} onClick={() => addItem(r)} className="p-3 border-b border-slate-50 flex justify-between items-center hover:bg-slate-50">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400">
                                                {searchType === 'Material' ? <Box size={14}/> : <Gem size={14}/>}
                                            </div>
                                            <div>
                                                <div className="font-bold text-sm text-slate-800">{r.name || r.sku}</div>
                                                <div className="text-xs text-slate-400">{searchType === 'Material' ? r.type : r.category}</div>
                                            </div>
                                        </div>
                                        <Plus size={16} className="text-emerald-500"/>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Items List */}
                <div className="space-y-2">
                    {items.map((item, idx) => (
                        <div key={idx} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                            <div className="flex justify-between items-start mb-2">
                                <div className="font-black text-slate-800">{item.item_name}</div>
                                <button onClick={() => removeItem(idx)} className="text-red-400"><Trash2 size={16}/></button>
                            </div>
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Ποσότητα</label>
                                    <input type="number" className="w-full p-2 bg-slate-50 rounded-lg font-bold text-center" value={item.quantity} onChange={e => updateItem(idx, 'qty', parseInt(e.target.value)||1)}/>
                                </div>
                                <div className="flex-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Κόστος</label>
                                    <input type="number" className="w-full p-2 bg-slate-50 rounded-lg font-bold text-right" value={item.unit_cost} onChange={e => updateItem(idx, 'cost', parseFloat(e.target.value)||0)}/>
                                </div>
                                <div className="flex-1 text-right pt-4">
                                    <div className="font-black text-slate-900">{formatCurrency(item.total_cost)}</div>
                                </div>
                            </div>
                        </div>
                    ))}
                    {items.length === 0 && <div className="text-center py-10 text-slate-400 italic">Η λίστα είναι κενή.</div>}
                </div>

                <div className="pt-4">
                     <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Σημειώσεις</label>
                     <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none h-20 resize-none"/>
                </div>
            </div>

            <div className="p-4 bg-white border-t border-slate-200 z-20">
                <div className="flex justify-between items-end mb-3">
                    <span className="text-xs font-bold text-slate-500 uppercase">Σύνολο</span>
                    <span className="text-2xl font-black text-slate-900">{formatCurrency(items.reduce((s,i) => s + i.total_cost, 0))}</span>
                </div>
                <button onClick={handleSave} className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95">
                    <Save size={20}/> Αποθήκευση Εντολής
                </button>
            </div>
        </div>
    );
}
