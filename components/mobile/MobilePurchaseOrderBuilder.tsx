import React, { useState, useMemo } from 'react';
import { Supplier, SupplierOrderItem, SupplierOrderType, Product, ProductionStage, Gender, ProductionType } from '../../types';
import { X, Search, Plus, Save, Trash2, Box, Gem, Factory, ImageIcon, StickyNote, ShoppingCart } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { useUI } from '../UIProvider';
import { formatCurrency, getVariantComponents } from '../../utils/pricingEngine';

interface Props {
    supplier: Supplier;
    onClose: () => void;
}

// Visual Config
const FINISH_STYLES: Record<string, string> = {
    'X': 'bg-amber-100 text-amber-800 border-amber-200',
    'P': 'bg-stone-200 text-stone-800 border-stone-300',
    'D': 'bg-orange-100 text-orange-800 border-orange-200',
    'H': 'bg-cyan-100 text-cyan-900 border-cyan-200',
    '': 'bg-emerald-50 text-emerald-700 border-emerald-200'
};

const STONE_TEXT_COLORS: Record<string, string> = {
    'KR': 'text-rose-600', 'QN': 'text-slate-900', 'LA': 'text-blue-600', 'TY': 'text-teal-500',
    'TG': 'text-orange-700', 'IA': 'text-red-700', 'BSU': 'text-slate-800', 'GSU': 'text-emerald-800',
    'RSU': 'text-rose-800', 'MA': 'text-emerald-600', 'FI': 'text-slate-400', 'OP': 'text-indigo-500',
    'NF': 'text-green-800', 'CO': 'text-orange-500', 'PCO': 'text-emerald-500', 'MCO': 'text-purple-500',
    'PAX': 'text-green-600', 'MAX': 'text-blue-700', 'KAX': 'text-red-700', 'AI': 'text-slate-600',
    'AP': 'text-cyan-600', 'AM': 'text-teal-700', 'LR': 'text-indigo-700', 'BST': 'text-sky-500',
    'MP': 'text-blue-500', 'LE': 'text-slate-400', 'PR': 'text-green-500', 'KO': 'text-red-500',
    'MV': 'text-purple-400', 'RZ': 'text-pink-500', 'AK': 'text-cyan-400', 'XAL': 'text-stone-500'
};

export default function MobilePurchaseOrderBuilder({ supplier, onClose }: Props) {
    const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
    const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
    const { data: productionBatches } = useQuery({ queryKey: ['batches'], queryFn: api.getProductionBatches });
    const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });
    const queryClient = useQueryClient();
    const { showToast } = useUI();

    const [items, setItems] = useState<SupplierOrderItem[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchType, setSearchType] = useState<SupplierOrderType>('Product');
    const [notes, setNotes] = useState('');
    const [showAllProducts, setShowAllProducts] = useState(false);

    // Production Needs Logic
    const productionNeeds = useMemo(() => {
          if (!productionBatches || !products || !orders) return [];
          const awaiting = productionBatches.filter(b => b.current_stage === ProductionStage.AwaitingDelivery);
          const groupedNeeds: Record<string, { sku: string, variant: string, totalQty: number, product?: Product, requirements: { orderId: string, customer: string }[] }> = {};
    
          awaiting.forEach(b => {
              const key = `${b.sku}-${b.variant_suffix || ''}`;
              if (!groupedNeeds[key]) {
                  const product = products.find(p => p.sku === b.sku);
                  groupedNeeds[key] = { sku: b.sku, variant: b.variant_suffix || '', totalQty: 0, product, requirements: [] };
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
          
          // Filter: Show if assigned to this supplier OR if unassigned
          return Object.values(groupedNeeds).filter(n => n.product?.supplier_id === supplier.id || !n.product?.supplier_id);
    }, [productionBatches, products, supplier.id, orders]);

    // Order Needs Logic (Pending Orders)
    const pendingOrderNeeds = useMemo(() => {
        if (!orders || !products) return [];

        const groupedOrderNeeds: Record<string, { sku: string, variant: string, totalQty: number, product?: Product, requirements: { orderId: string, customer: string }[] }> = {};

        // Only look at Pending orders.
        const pendingOrders = orders.filter(o => o.status === 'Pending');

        pendingOrders.forEach(order => {
            order.items.forEach(item => {
                const product = products.find(p => p.sku === item.sku);
                // Filter by supplier match (or unassigned) AND product is Imported
                if ((product?.supplier_id === supplier.id || !product?.supplier_id) && product?.production_type === ProductionType.Imported) {
                    const key = `${item.sku}-${item.variant_suffix || ''}`;
                    if (!groupedOrderNeeds[key]) {
                        groupedOrderNeeds[key] = {
                            sku: item.sku, 
                            variant: item.variant_suffix || '', 
                            totalQty: 0, 
                            product, 
                            requirements: [] 
                        };
                    }
                    groupedOrderNeeds[key].totalQty += item.quantity;
                    groupedOrderNeeds[key].requirements.push({
                        orderId: order.id,
                        customer: order.customer_name
                    });
                }
            });
        });

        return Object.values(groupedOrderNeeds);
    }, [orders, products, supplier.id]);

    // Filter Logic
    const searchResults = useMemo(() => {
        const lower = searchTerm.toLowerCase();
        if (!lower) return [];
        
        if (searchType === 'Material') {
            return materials?.filter(m => m.name.toLowerCase().includes(lower) && m.supplier_id === supplier.id).slice(0, 10) || [];
        } else {
            if (!products) return [];
            
            const results: { product: Product, variantSuffix: string, displayName: string, image?: string | null }[] = [];
            
            products.forEach(p => {
                const matchesSupplier = p.supplier_id === supplier.id;
                if (!showAllProducts && !matchesSupplier && !lower) return;
                
                // Base
                if (p.sku.toLowerCase().includes(lower)) {
                     if (!p.variants || p.variants.length === 0) {
                        results.push({ product: p, variantSuffix: '', displayName: p.sku, image: p.image_url });
                     }
                }
                // Variants
                if (p.variants && p.variants.length > 0) {
                     p.variants.forEach(v => {
                       const fullSku = `${p.sku}${v.suffix}`;
                       if (!lower || fullSku.toLowerCase().includes(lower) || p.sku.toLowerCase().includes(lower)) {
                            results.push({ product: p, variantSuffix: v.suffix, displayName: fullSku, image: p.image_url });
                       }
                   });
                }
            });
            return results.slice(0, 10);
        }
    }, [searchTerm, searchType, materials, products, supplier.id, showAllProducts]);

    const addItem = (item: any, type: SupplierOrderType, qty: number = 1, variantSuffix: string = '') => {
        let id, name;
        if (type === 'Product') {
            const product = item.sku ? item : item.product;
            const suffix = item.variantSuffix !== undefined ? item.variantSuffix : variantSuffix;
            id = product.sku;
            name = `${product.sku}${suffix}`;
        } else {
            id = item.id;
            name = item.name;
        }

        const cost = 0;
        
        setItems(prev => {
            const existingIdx = prev.findIndex(i => i.item_name === name && i.item_type === type);
            if (existingIdx >= 0) {
                const updated = [...prev];
                updated[existingIdx].quantity += qty;
                updated[existingIdx].total_cost = 0;
                return updated;
            }
            return [...prev, {
                id: Math.random().toString(36),
                item_type: type,
                item_id: id,
                item_name: name,
                quantity: qty,
                unit_cost: cost,
                total_cost: 0
            }];
        });
        setSearchTerm('');
        showToast(`Προστέθηκε: ${name}`, "success");
    };

    const updateItem = (index: number, field: 'qty' | 'cost' | 'notes', val: any) => {
        setItems(prev => {
            const updated = [...prev];
            const item = { ...updated[index] };
            if (field === 'qty') item.quantity = Number(val);
            else if (field === 'cost') item.unit_cost = Number(val);
            else if (field === 'notes') item.notes = val;
            
            item.total_cost = 0;
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
                total_amount: 0,
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
                
                {/* Production Needs */}
                {productionNeeds.length > 0 && (
                    <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100 space-y-2">
                        <div className="flex items-center gap-2 text-xs font-black text-indigo-700 uppercase mb-2">
                            <Factory size={14}/> Ανάγκες Παραγωγής
                        </div>
                        {productionNeeds.map((n, idx) => (
                            <div key={idx} className="bg-white p-2 rounded-xl flex justify-between items-center border border-indigo-200">
                                <div className="min-w-0 flex-1 pr-2">
                                    <div className="text-sm font-bold text-slate-700">{n.sku}{n.variant}</div>
                                    <div className="text-[9px] text-slate-400 font-bold truncate">
                                        {n.requirements.map(r => `${r.customer} (${r.orderId.slice(0, 10)})`).join(', ')}
                                    </div>
                                </div>
                                <button 
                                    onClick={() => addItem(n.product, 'Product', n.totalQty, n.variant)}
                                    className="bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg text-xs font-bold shrink-0"
                                >
                                    +{n.totalQty}
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Pending Order Needs */}
                {pendingOrderNeeds.length > 0 && (
                    <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 space-y-2">
                        <div className="flex items-center gap-2 text-xs font-black text-blue-700 uppercase mb-2">
                            <ShoppingCart size={14}/> Ανάγκες Παραγγελιών (Εκκρεμείς)
                        </div>
                        {pendingOrderNeeds.map((n, idx) => (
                            <div key={idx} className="bg-white p-2 rounded-xl flex justify-between items-center border border-blue-200">
                                <div className="min-w-0 flex-1 pr-2">
                                    <div className="text-sm font-bold text-slate-700">{n.sku}{n.variant}</div>
                                    <div className="text-[9px] text-slate-400 font-bold truncate">
                                        {n.requirements.map(r => `${r.customer}`).join(', ')}
                                    </div>
                                </div>
                                <button 
                                    onClick={() => addItem(n.product, 'Product', n.totalQty, n.variant)}
                                    className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-bold shrink-0"
                                >
                                    +{n.totalQty}
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button onClick={() => setSearchType('Material')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${searchType === 'Material' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500'}`}>Υλικά</button>
                        <button onClick={() => setSearchType('Product')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${searchType === 'Product' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>Προϊόντα</button>
                    </div>
                    
                    {searchType === 'Product' && (
                        <div className="flex items-center gap-2">
                            <input 
                                type="checkbox" 
                                checked={showAllProducts} 
                                onChange={e => setShowAllProducts(e.target.checked)} 
                                id="mobileShowAll"
                                className="w-4 h-4 rounded text-blue-600"
                            />
                            <label htmlFor="mobileShowAll" className="text-xs text-slate-500 font-bold">Εμφάνιση όλων (όχι μόνο συνδεδεμένων)</label>
                        </div>
                    )}

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
                                {searchResults.map((r: any) => {
                                    const isProd = searchType === 'Product';
                                    const name = isProd ? r.displayName : r.name;
                                    const img = isProd ? r.image : r.image_url;
                                    const sub = isProd ? r.product.category : r.type;

                                    return (
                                        <div key={isProd ? name : r.id} onClick={() => addItem(r, searchType)} className="p-3 border-b border-slate-50 flex justify-between items-center hover:bg-slate-50">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 overflow-hidden">
                                                    {img ? <img src={img} className="w-full h-full object-cover"/> : (searchType === 'Material' ? <Box size={14}/> : <Gem size={14}/>)}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-sm text-slate-800">{name}</div>
                                                    <div className="text-xs text-slate-400">{sub}</div>
                                                </div>
                                            </div>
                                            <Plus size={16} className="text-emerald-500"/>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                <div className="space-y-2">
                    {items.map((item, idx) => {
                        // Resolve image
                        let imgUrl = null;
                        let supplierRef = null;
                        let product: Product | undefined;
                        
                        if (item.item_type === 'Product' && products) {
                            product = products.find(prod => prod.sku === item.item_id);
                            imgUrl = product?.image_url;
                            supplierRef = product?.supplier_sku;
                        }
                        
                        let suffixStr = '';
                        if (product && item.item_name.startsWith(product.sku)) {
                            suffixStr = item.item_name.slice(product.sku.length);
                        }

                        const { finish, stone } = getVariantComponents(suffixStr, product?.gender || Gender.Unisex);
                        
                        const finishStyle = FINISH_STYLES[finish.code] || FINISH_STYLES[''];
                        const stoneColor = STONE_TEXT_COLORS[stone.code] || 'text-slate-600';
                        
                        let desc = product?.category || 'Είδος';
                        if (finish.name) desc = `${finish.name}`;
                        if (stone.name) desc += ` • ${stone.name}`;
                        if (item.item_type === 'Material') desc = 'Υλικό';

                        return (
                            <div key={idx} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex flex-col gap-2">
                                <div className="flex justify-between items-start">
                                    <div className="flex gap-3">
                                        <div className="w-12 h-12 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 shrink-0 flex items-center justify-center">
                                            {imgUrl ? <img src={imgUrl} className="w-full h-full object-cover"/> : <ImageIcon size={20} className="text-slate-300"/>}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`font-black text-lg px-2 py-0.5 rounded border ${item.item_type === 'Product' ? finishStyle : 'bg-slate-50 text-slate-800 border-slate-200'}`}>
                                                    {item.item_name}
                                                </span>
                                                {supplierRef && (
                                                    <span className="text-[10px] font-bold bg-purple-50 text-purple-700 px-2 py-1 rounded border border-purple-100">
                                                        {supplierRef}
                                                    </span>
                                                )}
                                            </div>
                                            
                                            <div className="text-xs font-bold text-slate-500 flex items-center gap-1">
                                                {desc}
                                                {stone.code && <span className={`ml-1 font-black ${stoneColor}`}>{stone.code}</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <button onClick={() => removeItem(idx)} className="text-red-400"><Trash2 size={16}/></button>
                                </div>
                                
                                <div className="flex gap-2 items-center mt-2">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-1 bg-slate-50 rounded-lg p-1">
                                            <button onClick={() => updateItem(idx, 'qty', Math.max(1, item.quantity - 1))} className="w-8 h-8 bg-white rounded shadow-sm flex items-center justify-center text-slate-600 font-bold">-</button>
                                            <input type="number" className="w-full bg-transparent font-black text-center outline-none" value={item.quantity} onChange={e => updateItem(idx, 'qty', parseInt(e.target.value)||1)}/>
                                            <button onClick={() => updateItem(idx, 'qty', item.quantity + 1)} className="w-8 h-8 bg-white rounded shadow-sm flex items-center justify-center text-slate-600 font-bold">+</button>
                                        </div>
                                    </div>
                                    
                                    <div className="flex-[2] relative">
                                        <StickyNote size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-300"/>
                                        <input 
                                            value={item.notes || ''}
                                            onChange={e => updateItem(idx, 'notes', e.target.value)}
                                            className="w-full pl-8 p-2 bg-slate-50 rounded-lg text-xs outline-none focus:bg-white border border-transparent focus:border-slate-200 transition-colors"
                                            placeholder="Σημείωση..."
                                        />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {items.length === 0 && <div className="text-center py-8 text-slate-400 text-xs italic">Η λίστα είναι κενή.</div>}
                </div>

                <div className="pt-4">
                     <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Σημειώσεις Εντολής</label>
                     <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none h-20 resize-none mt-1" placeholder="Εσωτερικές σημειώσεις..."/>
                </div>
            </div>

            <div className="p-4 bg-white border-t border-slate-200 z-20">
                <button onClick={handleSave} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform">
                    <Save size={20}/> Αποθήκευση Εντολής
                </button>
            </div>
        </div>
    );
}