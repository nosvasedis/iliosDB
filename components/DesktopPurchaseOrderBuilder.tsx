import React, { useState, useMemo } from 'react';
import { Supplier, SupplierOrderItem, SupplierOrderType, Product, ProductionStage, SupplierOrder, Gender, ProductionType } from '../types';
import { X, Search, Plus, Save, Trash2, Box, Gem, Factory, ImageIcon, StickyNote, Loader2, Tag, ShoppingCart } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { useUI } from './UIProvider';
import { getVariantComponents } from '../utils/pricingEngine';

interface Props {
    supplier: Supplier;
    onClose: () => void;
}

// Visual Config for Suffixes
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

export default function DesktopPurchaseOrderBuilder({ supplier, onClose }: Props) {
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
    const [isSaving, setIsSaving] = useState(false);

    // Production Needs Logic (Items in Production/Batches waiting for delivery)
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
          
          // Filter: Show if assigned to this supplier OR if unassigned (so manual batches appear)
          return Object.values(groupedNeeds).filter(n => n.product?.supplier_id === supplier.id || !n.product?.supplier_id);
    }, [productionBatches, products, supplier.id, orders]);

    // Order Needs Logic (Items in Pending Orders - Not yet in production)
    const pendingOrderNeeds = useMemo(() => {
        if (!orders || !products) return [];

        const groupedOrderNeeds: Record<string, { sku: string, variant: string, totalQty: number, product?: Product, requirements: { orderId: string, customer: string }[] }> = {};

        // Only look at Pending orders. In Production orders are handled by productionNeeds above.
        const pendingOrders = orders.filter(o => o.status === 'Pending');

        pendingOrders.forEach(order => {
            order.items.forEach(item => {
                const product = products.find(p => p.sku === item.sku);
                // Filter: Show if assigned to this supplier OR if unassigned AND product is Imported
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

    // Search Results Logic (Flattened to include Variants)
    const searchResults = useMemo(() => {
        const lower = searchTerm.toLowerCase();
        
        if (searchType === 'Material') {
            return materials?.filter(m => m.name.toLowerCase().includes(lower) && m.supplier_id === supplier.id).slice(0, 20) || [];
        } else {
            if (!products) return [];
            
            const results: { product: Product, variantSuffix: string, displayName: string, image?: string | null }[] = [];
            
            products.forEach(p => {
                // Filter by supplier logic
                const matchesSupplier = p.supplier_id === supplier.id;
                if (!showAllProducts && !matchesSupplier && !lower) return; // Skip if no search & not linked
                if (!showAllProducts && !matchesSupplier && lower && !p.sku.toLowerCase().includes(lower)) return; 

                // Master match?
                if (p.sku.toLowerCase().includes(lower)) {
                    // If simple product or we want to allow master selection
                    if (!p.variants || p.variants.length === 0) {
                        results.push({ product: p, variantSuffix: '', displayName: p.sku, image: p.image_url });
                    }
                }
                
                // Variant match?
                if (p.variants && p.variants.length > 0) {
                   p.variants.forEach(v => {
                       const fullSku = `${p.sku}${v.suffix}`;
                       // Add if Search matches Full SKU OR Search matches Master SKU OR Search is empty (and matches supplier)
                       if (!lower || fullSku.toLowerCase().includes(lower) || p.sku.toLowerCase().includes(lower)) {
                            results.push({ 
                                product: p, 
                                variantSuffix: v.suffix, 
                                displayName: fullSku, 
                                image: p.image_url 
                            });
                       }
                   });
                }
            });
            
            return results.slice(0, 20);
        }
    }, [searchTerm, searchType, materials, products, supplier.id, showAllProducts]);

    const addItem = (item: any, type: SupplierOrderType, qty: number = 1, variantSuffix: string = '') => {
        // Construct unique ID and Name
        let id, name;
        
        if (type === 'Product') {
            // item is the { product, variantSuffix ... } wrapper from search, OR the Product object from needs
            const product = item.sku ? item : item.product; // Handle both direct product object and wrapper
            const suffix = item.variantSuffix !== undefined ? item.variantSuffix : variantSuffix;
            
            id = product.sku;
            name = `${product.sku}${suffix}`; // IMPORTANT: Full SKU name
        } else {
            id = item.id;
            name = item.name;
        }

        // Zero pricing model
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
                item_id: id,     // Base SKU or ID
                item_name: name, // Full Display Name (SKU+Suffix)
                quantity: qty,
                unit_cost: cost,
                total_cost: 0 
            }];
        });
        setSearchTerm('');
        showToast(`Προστέθηκε: ${name}`, "success");
    };

    const updateItem = (index: number, field: 'qty' | 'notes', val: any) => {
        setItems(prev => {
            const updated = [...prev];
            const item = { ...updated[index] };
            if (field === 'qty') item.quantity = Number(val);
            else if (field === 'notes') item.notes = val;
            
            item.total_cost = 0;
            updated[index] = item;
            return updated;
        });
    };

    const removeItem = (index: number) => setItems(prev => prev.filter((_, i) => i !== index));

    const handleSave = async () => {
        if (items.length === 0) { showToast("Η εντολή είναι κενή.", "error"); return; }
        
        setIsSaving(true);
        try {
            const order: SupplierOrder = {
                id: crypto.randomUUID(),
                supplier_id: supplier.id,
                supplier_name: supplier.name,
                created_at: new Date().toISOString(),
                status: 'Pending',
                total_amount: 0,
                items,
                notes
            };
            await api.saveSupplierOrder(order);
            queryClient.invalidateQueries({ queryKey: ['supplier_orders'] });
            showToast("Η εντολή δημιουργήθηκε!", "success");
            onClose();
        } catch (e) {
            showToast("Σφάλμα κατά την αποθήκευση.", "error");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-6xl h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
                
                {/* Header */}
                <div className="bg-white p-6 border-b border-slate-100 flex justify-between items-center shadow-sm z-10">
                    <div>
                        <h2 className="text-xl font-black text-slate-800">Νέα Εντολή Αγοράς</h2>
                        <p className="text-sm text-slate-500 font-bold">{supplier.name}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"><X size={24}/></button>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
                    
                    {/* LEFT PANEL: SELECTION & INTELLIGENCE */}
                    <div className="lg:w-1/3 border-r border-slate-100 flex flex-col bg-slate-50">
                        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                            
                            {/* Production Needs (Existing Batches) */}
                            {(productionNeeds.length > 0) && (
                                <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100 space-y-3 shadow-sm">
                                    <div className="flex items-center gap-2 text-xs font-black text-indigo-800 uppercase mb-2">
                                        <Factory size={16}/> Ανάγκες Παραγωγής
                                    </div>
                                    <div className="space-y-2">
                                        {productionNeeds.map((n, idx) => (
                                            <div key={idx} className="bg-white p-3 rounded-xl flex justify-between items-center border border-indigo-200">
                                                <div className="min-w-0 flex-1 pr-2 flex items-center gap-3">
                                                     <div className="w-10 h-10 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 shrink-0">
                                                        {n.product?.image_url ? <img src={n.product.image_url} className="w-full h-full object-cover"/> : <ImageIcon size={16} className="m-auto text-slate-300"/>}
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-black text-slate-800">{n.sku}{n.variant}</div>
                                                        <div className="text-[10px] text-slate-500 font-bold truncate max-w-[150px]">
                                                            {n.requirements.map(r => `${r.customer} (${r.orderId.slice(0, 10)})`).join(', ')}
                                                        </div>
                                                    </div>
                                                </div>
                                                <button 
                                                    onClick={() => addItem(n.product, 'Product', n.totalQty, n.variant)}
                                                    className="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-3 py-1.5 rounded-lg text-xs font-black transition-colors"
                                                >
                                                    +{n.totalQty}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Pending Order Needs (Not yet in production) */}
                            {(pendingOrderNeeds.length > 0) && (
                                <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 space-y-3 shadow-sm">
                                    <div className="flex items-center gap-2 text-xs font-black text-blue-800 uppercase mb-2">
                                        <ShoppingCart size={16}/> Ανάγκες Παραγγελιών (Εκκρεμείς)
                                    </div>
                                    <div className="space-y-2">
                                        {pendingOrderNeeds.map((n, idx) => (
                                            <div key={idx} className="bg-white p-3 rounded-xl flex justify-between items-center border border-blue-200">
                                                <div className="min-w-0 flex-1 pr-2 flex items-center gap-3">
                                                     <div className="w-10 h-10 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 shrink-0">
                                                        {n.product?.image_url ? <img src={n.product.image_url} className="w-full h-full object-cover"/> : <ImageIcon size={16} className="m-auto text-slate-300"/>}
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-black text-slate-800">{n.sku}{n.variant}</div>
                                                        <div className="text-[10px] text-slate-500 font-bold truncate max-w-[150px]">
                                                            {n.requirements.map(r => `${r.customer}`).join(', ')}
                                                        </div>
                                                    </div>
                                                </div>
                                                <button 
                                                    onClick={() => addItem(n.product, 'Product', n.totalQty, n.variant)}
                                                    className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-black transition-colors"
                                                >
                                                    +{n.totalQty}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Manual Search */}
                            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                                <div className="flex bg-slate-100 p-1 rounded-xl">
                                    <button onClick={() => setSearchType('Product')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${searchType === 'Product' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>Προϊόντα</button>
                                    <button onClick={() => setSearchType('Material')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${searchType === 'Material' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500'}`}>Υλικά</button>
                                </div>
                                
                                {searchType === 'Product' && (
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="checkbox" 
                                            checked={showAllProducts} 
                                            onChange={e => setShowAllProducts(e.target.checked)} 
                                            id="showAllProducts"
                                            className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                                        />
                                        <label htmlFor="showAllProducts" className="text-xs text-slate-600 font-bold cursor-pointer">Εμφάνιση όλων (όχι μόνο συνδεδεμένων)</label>
                                    </div>
                                )}

                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                                    <input 
                                        className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-800/20 font-bold text-sm"
                                        placeholder="Αναζήτηση..."
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                                    {searchResults.map((r: any) => {
                                        // Handle flatten structure vs material structure
                                        const isProd = searchType === 'Product';
                                        const name = isProd ? r.displayName : r.name;
                                        const img = isProd ? r.image : r.image_url;
                                        const sub = isProd ? r.product.category : r.type;

                                        return (
                                            <div key={isProd ? name : r.id} onClick={() => addItem(r, searchType)} className="p-2 border border-slate-100 rounded-xl flex justify-between items-center hover:bg-slate-50 cursor-pointer transition-colors group">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 overflow-hidden border border-slate-200">
                                                        {img ? <img src={img} className="w-full h-full object-cover"/> : (searchType === 'Material' ? <Box size={16}/> : <Gem size={16}/>)}
                                                    </div>
                                                    <div>
                                                        <div className="font-black text-sm text-slate-800">{name}</div>
                                                        <div className="text-[10px] text-slate-400 font-bold uppercase">{sub}</div>
                                                    </div>
                                                </div>
                                                <button className="bg-slate-100 p-2 rounded-lg text-slate-400 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                                                    <Plus size={16}/>
                                                </button>
                                            </div>
                                        );
                                    })}
                                    {searchTerm && searchResults.length === 0 && (
                                        <div className="text-center text-xs text-slate-400 italic py-4">Δεν βρέθηκαν αποτελέσματα.</div>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase ml-1 mb-1 block">Σημειώσεις Εντολής</label>
                                <textarea 
                                    value={notes} 
                                    onChange={e => setNotes(e.target.value)} 
                                    placeholder="Γενικές σημειώσεις για τον προμηθευτή..." 
                                    className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm h-24 resize-none outline-none focus:ring-2 focus:ring-slate-200"
                                />
                            </div>
                        </div>
                    </div>

                    {/* RIGHT PANEL: CART */}
                    <div className="lg:w-2/3 bg-white flex flex-col">
                        <div className="p-4 border-b border-slate-100 bg-slate-50/30 flex justify-between items-center">
                            <h3 className="font-black text-slate-700 text-sm uppercase tracking-wide">Περιεχόμενα Εντολής</h3>
                            <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-lg text-xs font-bold">{items.length} είδη</span>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
                            {items.map((item, idx) => {
                                let imgUrl = null;
                                let supplierRef = null;
                                let product: Product | undefined;
                                
                                if (item.item_type === 'Product' && products) {
                                    product = products.find(prod => prod.sku === item.item_id);
                                    imgUrl = product?.image_url;
                                    supplierRef = product?.supplier_sku;
                                }

                                // Robust Suffix Extraction
                                // If item_name is "DA1102XKO" and sku is "DA1102", suffix is "XKO"
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
                                    <div key={idx} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between hover:border-slate-300 transition-colors group">
                                        <div className="flex items-center gap-4">
                                            <div className="w-16 h-16 bg-slate-50 rounded-xl overflow-hidden border border-slate-200 shrink-0 flex items-center justify-center">
                                                {imgUrl ? <img src={imgUrl} className="w-full h-full object-cover"/> : <ImageIcon size={24} className="text-slate-300"/>}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`font-black text-lg px-2 py-0.5 rounded border ${item.item_type === 'Product' ? finishStyle : 'bg-slate-50 text-slate-800 border-slate-200'}`}>
                                                        {item.item_name}
                                                    </span>
                                                    {supplierRef && (
                                                        <span className="text-[10px] font-bold bg-purple-50 text-purple-700 px-2 py-1 rounded border border-purple-100">
                                                            Ref: {supplierRef}
                                                        </span>
                                                    )}
                                                </div>
                                                
                                                <div className="text-xs font-bold text-slate-500 flex items-center gap-1">
                                                    {desc}
                                                    {stone.code && <span className={`ml-1 font-black ${stoneColor}`}>{stone.code}</span>}
                                                </div>

                                                <input 
                                                    value={item.notes || ''}
                                                    onChange={e => updateItem(idx, 'notes', e.target.value)}
                                                    placeholder="Προσθήκη σημείωσης..."
                                                    className="mt-2 w-64 text-xs border-b border-transparent hover:border-slate-300 focus:border-blue-400 outline-none bg-transparent placeholder:slate-300 text-slate-600 font-medium transition-colors"
                                                />
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center gap-6">
                                            <div className="flex flex-col items-center">
                                                <label className="text-[9px] font-bold text-slate-400 uppercase mb-1">Ποσότητα</label>
                                                <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                                                    <button onClick={() => updateItem(idx, 'qty', Math.max(1, item.quantity - 1))} className="w-8 h-8 rounded bg-white shadow-sm flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors font-bold text-lg">-</button>
                                                    <input 
                                                        type="number" 
                                                        value={item.quantity} 
                                                        onChange={e => updateItem(idx, 'qty', parseInt(e.target.value)||1)} 
                                                        className="w-12 text-center bg-transparent font-black text-lg outline-none"
                                                    />
                                                    <button onClick={() => updateItem(idx, 'qty', item.quantity + 1)} className="w-8 h-8 rounded bg-white shadow-sm flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors font-bold text-lg">+</button>
                                                </div>
                                            </div>
                                            <button onClick={() => removeItem(idx)} className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                                                <Trash2 size={20}/>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            
                            {items.length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center text-slate-300 py-20">
                                    <Box size={64} className="mb-4 opacity-20"/>
                                    <p className="font-bold text-lg">Η εντολή είναι κενή.</p>
                                    <p className="text-sm">Προσθέστε είδη από τη λίστα.</p>
                                </div>
                            )}
                        </div>

                        <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-end">
                            <button 
                                onClick={handleSave} 
                                disabled={isSaving || items.length === 0}
                                className="bg-slate-900 text-white px-10 py-4 rounded-2xl font-black text-lg shadow-xl hover:bg-black transition-all flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSaving ? <Loader2 size={24} className="animate-spin"/> : <Save size={24}/>}
                                Αποθήκευση Εντολής
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}