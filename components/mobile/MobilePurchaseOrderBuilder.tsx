
import React, { useState, useMemo } from 'react';
import { Supplier, SupplierOrderItem, SupplierOrderType, Product, ProductionStage } from '../../types';
import { X, Search, Plus, Save, Trash2, Box, Gem, Factory, ImageIcon, StickyNote, Minus, Coins, AlertCircle } from 'lucide-react';
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
    const { data: productionBatches } = useQuery({ queryKey: ['batches'], queryFn: api.getProductionBatches });
    const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });
    const queryClient = useQueryClient();
    const { showToast } = useUI();

    const [items, setItems] = useState<SupplierOrderItem[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchType, setSearchType] = useState<SupplierOrderType>('Material');
    const [notes, setNotes] = useState('');
    const [showAllProducts, setShowAllProducts] = useState(false);

    // Production Needs Logic
    const productionNeeds = useMemo(() => {
          if (!productionBatches || !products || !orders) return [];
          const awaiting = productionBatches.filter(b => b.current_stage === ProductionStage.AwaitingDelivery);
          const groupedNeeds: Record<string, { sku: string, variant?: string, totalQty: number, product?: Product, requirements: { orderId: string, customer: string }[] }> = {};
    
          awaiting.forEach(b => {
              const key = `${b.sku}-${b.variant_suffix || ''}`;
              if (!groupedNeeds[key]) {
                  const product = products.find(p => p.sku === b.sku);
                  groupedNeeds[key] = { sku: b.sku, variant: b.variant_suffix || undefined, totalQty: 0, product, requirements: [] };
              }
              groupedNeeds[key].totalQty += b.quantity;
              if (b.order_id) {
                  const order = orders.find(o => o.id === b.order_id);
                  groupedNeeds[key].requirements.push({
                      orderId: b.order_id,
                      customer: order?.customer_name || 'Άγνωστος'
                  });
              }
          });
          
          return Object.values(groupedNeeds).filter(n => n.product?.supplier_id === supplier.id);
    }, [productionBatches, products, supplier.id, orders]);

    // Filter Logic
    const searchResults = useMemo(() => {
        const lower = searchTerm.toLowerCase();
        if (!lower) return [];
        
        if (searchType === 'Material') {
            return materials?.filter(m => m.name.toLowerCase().includes(lower) && m.supplier_id === supplier.id).slice(0, 10) || [];
        } else {
            return products?.filter(p => {
                const matches = p.sku.toLowerCase().includes(lower) && !p.is_component;
                if (!showAllProducts) return matches && p.supplier_id === supplier.id;
                return matches;
            }).slice(0, 10) || [];
        }
    }, [searchTerm, searchType, materials, products, supplier.id, showAllProducts]);

    const addItem = (item: any, type: SupplierOrderType, qty: number = 1) => {
        const id = type === 'Product' ? item.sku : item.id;
        const name = type === 'Product' ? item.sku : item.name;
        
        // FIX: Improved Cost Priority: Supplier Cost > Active Price > Draft Price > 0
        let cost = 0;
        if (type === 'Product') {
            cost = (item.supplier_cost && item.supplier_cost > 0) 
                   ? item.supplier_cost 
                   : (item.active_price || item.draft_price || 0);
        } else {
            cost = item.cost_per_unit || 0;
        }
        
        setItems(prev => {
            const existingIdx = prev.findIndex(i => i.item_id === id && i.item_type === type);
            if (existingIdx >= 0) {
                const updated = [...prev];
                updated[existingIdx].quantity += qty;
                updated[existingIdx].total_cost = updated[existingIdx].quantity * updated[existingIdx].unit_cost;
                return updated;
            }
            return [...prev, {
                id: Math.random().toString(36),
                item_type: type,
                item_id: id,
                item_name: name,
                quantity: qty,
                unit_cost: cost,
                total_cost: cost * qty
            }];
        });
        setSearchTerm('');
        showToast("Προστέθηκε.", "success");
    };

    const updateItem = (index: number, field: 'qty' | 'cost' | 'notes', val: any) => {
        setItems(prev => {
            const updated = [...prev];
            const item = { ...updated[index] };
            if (field === 'qty') item.quantity = Math.max(1, Number(val));
            else if (field === 'cost') item.unit_cost = Math.max(0, Number(val));
            else if (field === 'notes') item.notes = val;
            
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
            {/* Header */}
            <div className="bg-white p-4 border-b border-slate-100 flex justify-between items-center shadow-sm z-10">
                <div>
                    <h2 className="text-xl font-black text-slate-800 tracking-tight">Νέα Εντολή Αγοράς</h2>
                    <p className="text-xs text-slate-500 font-bold">{supplier.name}</p>
                </div>
                <button onClick={onClose} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors"><X size={20} className="text-slate-500"/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24 custom-scrollbar">
                
                {/* Production Needs */}
                {productionNeeds.length > 0 && (
                    <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100 space-y-3 shadow-inner">
                        <div className="flex items-center gap-2 text-xs font-black text-indigo-700 uppercase mb-1">
                            <Factory size={14}/> Ανάγκες Παραγωγής (Συνδεδεμένα)
                        </div>
                        {productionNeeds.map((n, idx) => (
                            <div key={idx} className="bg-white p-3 rounded-xl flex justify-between items-center border border-indigo-100 shadow-sm">
                                <div className="min-w-0 flex-1 pr-3">
                                    <div className="text-sm font-black text-slate-700">{n.sku}{n.variant}</div>
                                    <div className="text-[10px] text-slate-400 font-bold truncate mt-0.5">
                                        {n.requirements.map(r => `${r.customer} (${r.orderId.slice(0, 8)})`).join(', ')}
                                    </div>
                                </div>
                                <button 
                                    onClick={() => addItem(n.product, 'Product', n.totalQty)}
                                    className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-700 shadow-sm shrink-0 active:scale-95 transition-transform"
                                >
                                    +{n.totalQty}
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Add Item Controls */}
                <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-3">
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button onClick={() => setSearchType('Material')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${searchType === 'Material' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500'}`}>Υλικά</button>
                        <button onClick={() => setSearchType('Product')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${searchType === 'Product' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>Προϊόντα</button>
                    </div>
                    
                    {searchType === 'Product' && (
                        <div className="flex items-center gap-2 px-1">
                            <input 
                                type="checkbox" 
                                checked={showAllProducts} 
                                onChange={e => setShowAllProducts(e.target.checked)} 
                                id="mobileShowAll"
                                className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                            />
                            <label htmlFor="mobileShowAll" className="text-xs text-slate-600 font-bold">Εμφάνιση όλων (όχι μόνο συνδεδεμένων)</label>
                        </div>
                    )}

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                        <input 
                            className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold text-slate-800 transition-all"
                            placeholder="Αναζήτηση..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && searchResults.length > 0 && (
                            <div className="absolute top-full left-0 right-0 bg-white shadow-xl rounded-xl border border-slate-100 mt-2 z-50 overflow-hidden max-h-60 overflow-y-auto">
                                {searchResults.map((r: any) => (
                                    <div key={r.id || r.sku} onClick={() => addItem(r, searchType)} className="p-3 border-b border-slate-50 flex justify-between items-center hover:bg-slate-50 active:bg-slate-100 cursor-pointer">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 overflow-hidden border border-slate-100">
                                                {r.image_url ? <img src={r.image_url} className="w-full h-full object-cover"/> : (searchType === 'Material' ? <Box size={16}/> : <Gem size={16}/>)}
                                            </div>
                                            <div>
                                                <div className="font-bold text-sm text-slate-800">{r.name || r.sku}</div>
                                                <div className="text-[10px] text-slate-400 font-medium uppercase">{searchType === 'Material' ? r.type : r.category}</div>
                                            </div>
                                        </div>
                                        <Plus size={20} className="text-emerald-500 bg-emerald-50 p-1 rounded-full"/>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Added Items List */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2 px-1">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Λιστα Ειδων ({items.length})</h3>
                        {items.length > 0 && <span className="h-px bg-slate-200 flex-1"></span>}
                    </div>
                    
                    {items.map((item, idx) => {
                        // Find full product details for image
                        const product = products?.find(p => p.sku === item.item_id);
                        const imageUrl = product?.image_url;

                        return (
                            <div key={idx} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-3 relative overflow-hidden group">
                                <div className="absolute top-0 left-0 w-1 h-full bg-slate-800"></div>
                                <div className="flex justify-between items-start pl-2">
                                    <div className="flex gap-3 items-center">
                                        <div className="w-14 h-14 bg-slate-50 rounded-xl overflow-hidden border border-slate-100 shrink-0 flex items-center justify-center">
                                            {imageUrl ? <img src={imageUrl} className="w-full h-full object-cover"/> : <ImageIcon size={20} className="text-slate-300"/>}
                                        </div>
                                        <div>
                                            <div className="font-black text-slate-900 text-lg leading-none">{item.item_name}</div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${item.item_type === 'Product' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-purple-50 text-purple-700 border-purple-100'}`}>
                                                    {item.item_type === 'Product' ? 'ΠΡΟΪΟΝ' : 'ΥΛΙΚΟ'}
                                                </span>
                                                {product?.supplier_sku && <span className="text-[9px] text-slate-400 font-mono">REF: {product.supplier_sku}</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <button onClick={() => removeItem(idx)} className="p-2 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors"><Trash2 size={16}/></button>
                                </div>
                                
                                <div className="flex gap-3 pl-2">
                                    <div className="flex-1 bg-slate-50 p-2 rounded-xl border border-slate-100">
                                        <label className="text-[8px] font-bold text-slate-400 uppercase block mb-1">Ποσοτητα</label>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => updateItem(idx, 'qty', Math.max(1, item.quantity - 1))} className="w-6 h-6 bg-white rounded shadow-sm text-slate-600 font-bold flex items-center justify-center"><Minus size={12}/></button>
                                            <input type="number" className="w-full bg-transparent font-black text-center text-slate-800 outline-none" value={item.quantity} onChange={e => updateItem(idx, 'qty', parseInt(e.target.value)||1)}/>
                                            <button onClick={() => updateItem(idx, 'qty', item.quantity + 1)} className="w-6 h-6 bg-white rounded shadow-sm text-slate-600 font-bold flex items-center justify-center"><Plus size={12}/></button>
                                        </div>
                                    </div>
                                    <div className="flex-1 bg-slate-50 p-2 rounded-xl border border-slate-100">
                                        <label className="text-[8px] font-bold text-slate-400 uppercase block mb-1">Κοστος (€)</label>
                                        <input type="number" className="w-full bg-transparent font-black text-right text-slate-800 outline-none" value={item.unit_cost} onChange={e => updateItem(idx, 'cost', parseFloat(e.target.value)||0)}/>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between pl-2 pt-1">
                                    <div className="flex items-center gap-2 flex-1">
                                        <StickyNote size={14} className="text-slate-300"/>
                                        <input 
                                            value={item.notes || ''}
                                            onChange={e => updateItem(idx, 'notes', e.target.value)}
                                            className="w-full text-xs font-medium text-slate-600 placeholder-slate-300 outline-none bg-transparent"
                                            placeholder="Σημείωση..."
                                        />
                                    </div>
                                    <div className="text-right pl-4">
                                        <span className="block text-[8px] font-bold text-slate-400 uppercase">Συνολο</span>
                                        <span className="font-black text-slate-900 text-lg">{formatCurrency(item.total_cost)}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    
                    {items.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-300 border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
                            <Box size={32} className="mb-2 opacity-50"/>
                            <p className="font-bold text-sm">Η λίστα είναι κενή</p>
                            <p className="text-xs">Προσθέστε προϊόντα ή υλικά</p>
                        </div>
                    )}
                </div>

                <div className="pt-4">
                     <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block flex items-center gap-1"><StickyNote size={12}/> Γενικές Σημειώσεις</label>
                     <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none h-20 resize-none text-sm text-slate-700 focus:border-slate-300 transition-colors" placeholder="Οδηγίες προς προμηθευτή..."/>
                </div>
            </div>

            {/* Footer */}
            <div className="p-5 bg-white border-t border-slate-200 shadow-lg z-20">
                <div className="flex justify-between items-end mb-4">
                     <div className="flex items-center gap-2 text-slate-500">
                         <Coins size={16}/>
                         <span className="text-xs font-bold uppercase">Γενικο Συνολο</span>
                     </div>
                     <span className="font-black text-3xl text-emerald-600 leading-none">{formatCurrency(items.reduce((s,i) => s + i.total_cost, 0))}</span>
                </div>
                <button onClick={handleSave} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-3 shadow-xl active:scale-95 transition-transform hover:bg-black">
                    <Save size={22}/> Δημιουργία Εντολής
                </button>
            </div>
            
        </div>
    );
}
