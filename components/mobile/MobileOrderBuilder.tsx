
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Product, ProductVariant, Order, OrderItem, Customer, OrderStatus } from '../../types';
import { ArrowLeft, Save, Plus, Search, Trash2, X, ChevronRight, Hash, User, Phone, Check, AlertCircle, ImageIcon } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { formatCurrency, analyzeSku, getVariantComponents } from '../../utils/pricingEngine';
import { getSizingInfo } from '../../utils/sizing';
import { useUI } from '../UIProvider';

interface Props {
    onBack: () => void;
    initialOrder: Order | null;
    products: Product[];
}

// Visual Helpers
const FINISH_COLORS: Record<string, string> = {
    'X': 'bg-amber-100 text-amber-700 border-amber-200',
    'P': 'bg-slate-100 text-slate-600 border-slate-200',
    'D': 'bg-orange-100 text-orange-700 border-orange-200',
    'H': 'bg-cyan-100 text-cyan-700 border-cyan-200',
    '': 'bg-emerald-50 text-emerald-700 border-emerald-200' // Lustre default
};

export default function MobileOrderBuilder({ onBack, initialOrder, products }: Props) {
    const { showToast } = useUI();
    const queryClient = useQueryClient();
    const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: api.getCustomers });

    // --- ORDER STATE ---
    const [customerName, setCustomerName] = useState(initialOrder?.customer_name || '');
    const [customerPhone, setCustomerPhone] = useState(initialOrder?.customer_phone || '');
    const [customerId, setCustomerId] = useState<string | null>(initialOrder?.customer_id || null);
    const [items, setItems] = useState<OrderItem[]>(initialOrder?.items || []);
    const [isSaving, setIsSaving] = useState(false);

    // --- INPUT STATE ---
    const [input, setInput] = useState('');
    const [suggestions, setSuggestions] = useState<Product[]>([]);
    const [activeMaster, setActiveMaster] = useState<Product | null>(null);
    const [sizeMode, setSizeMode] = useState<{ type: 'Νούμερο' | 'Μήκος', sizes: string[] } | null>(null);
    const [selectedSize, setSelectedSize] = useState('');
    const [qty, setQty] = useState(1);
    
    // Suggestion List Ref for scrolling
    const suggestionsRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // --- SMART SEARCH LOGIC ---
    useEffect(() => {
        const term = input.trim().toUpperCase();
        if (term.length < 2) {
            setSuggestions([]);
            return;
        }

        // Priority Logic:
        // 1. Exact SKU Match
        // 2. Starts With SKU
        // 3. Contains Numeric Part (Handwritten notes often just have "1005")
        
        const numericMatch = term.match(/\d+/);
        const numberTerm = numericMatch ? numericMatch[0] : null;

        const results = products.filter(p => {
            if (p.is_component) return false;
            
            // Check direct SKU match
            if (p.sku.startsWith(term)) return true;
            
            // Check numeric part (Smart Heuristic)
            if (numberTerm && numberTerm.length >= 3 && p.sku.includes(numberTerm)) return true;
            
            return false;
        }).sort((a, b) => {
            // Prioritize shorter SKUs (e.g. DA100 before DA1005) if typing DA100
            if (a.sku.length !== b.sku.length) return a.sku.length - b.sku.length;
            return a.sku.localeCompare(b.sku);
        }).slice(0, 10); // Limit to top 10 for performance

        setSuggestions(results);
    }, [input, products]);

    // --- ACTIONS ---

    const handleSelectMaster = (p: Product) => {
        setActiveMaster(p);
        setInput(''); // Clear search to focus on variants
        setSuggestions([]);
        
        // Auto-detect sizing needed
        const sizing = getSizingInfo(p);
        if (sizing) {
            setSizeMode(sizing);
            setSelectedSize(''); // Reset size
        } else {
            setSizeMode(null);
        }
    };

    const handleAddItem = (variant: ProductVariant | null) => {
        if (!activeMaster) return;

        // Validation for size is now OPTIONAL as requested
        // if (sizeMode && !selectedSize) { ... } -> Removed

        const unitPrice = variant?.selling_price || activeMaster.selling_price || 0;
        
        const newItem: OrderItem = {
            sku: activeMaster.sku,
            variant_suffix: variant?.suffix,
            quantity: qty,
            price_at_order: unitPrice,
            product_details: activeMaster,
            size_info: selectedSize || undefined
        };

        // Combine duplicates if same SKU, Suffix AND Size
        setItems(prev => {
            const existingIdx = prev.findIndex(i => 
                i.sku === newItem.sku && 
                i.variant_suffix === newItem.variant_suffix && 
                i.size_info === newItem.size_info
            );

            if (existingIdx >= 0) {
                const updated = [...prev];
                updated[existingIdx].quantity += qty;
                return updated;
            }
            return [newItem, ...prev]; // Add to top
        });

        // Haptic Feedback
        if (navigator.vibrate) navigator.vibrate(50);
        showToast(`${activeMaster.sku}${variant?.suffix || ''} προστέθηκε`, 'success');

        // Reset for next entry (Keep Master active? No, usually next item is different)
        // Workflow decision: Boss usually reads items sequentially.
        setActiveMaster(null);
        setQty(1);
        setSelectedSize('');
        setSizeMode(null);
        setInput('');
        
        // Refocus input for speed
        setTimeout(() => inputRef.current?.focus(), 100);
    };

    const handleSaveOrder = async () => {
        if (!customerName) { showToast("Το όνομα πελάτη είναι υποχρεωτικό.", 'error'); return; }
        if (items.length === 0) { showToast("Η παραγγελία είναι κενή.", 'error'); return; }

        setIsSaving(true);
        try {
            const total = items.reduce((sum, i) => sum + (i.price_at_order * i.quantity), 0);
            
            const orderPayload: Order = {
                id: initialOrder?.id || `ORD-${Date.now().toString().slice(-6)}`,
                customer_name: customerName,
                customer_phone: customerPhone,
                customer_id: customerId || undefined,
                items: items,
                total_price: total,
                status: initialOrder?.status || OrderStatus.Pending,
                created_at: initialOrder?.created_at || new Date().toISOString(),
                notes: initialOrder?.notes
            };

            if (initialOrder) {
                await api.updateOrder(orderPayload);
                showToast("Η παραγγελία ενημερώθηκε", "success");
            } else {
                await api.saveOrder(orderPayload);
                showToast("Η παραγγελία δημιουργήθηκε", "success");
            }
            
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            onBack();
        } catch (e) {
            showToast("Σφάλμα αποθήκευσης", "error");
        } finally {
            setIsSaving(false);
        }
    };

    const handleRemoveItem = (index: number) => {
        setItems(prev => prev.filter((_, i) => i !== index));
    };

    // --- CUSTOMER SEARCH ---
    const [showCustSearch, setShowCustSearch] = useState(false);
    const filteredCustomers = useMemo(() => {
        if (!customers || !customerName) return [];
        return customers.filter(c => c.full_name.toLowerCase().includes(customerName.toLowerCase())).slice(0, 5);
    }, [customers, customerName]);

    const hasVariants = activeMaster && activeMaster.variants && activeMaster.variants.length > 0;

    return (
        <div className="flex flex-col h-full bg-slate-50 relative">
            {/* HEADER */}
            <div className="bg-white p-4 border-b border-slate-200 flex items-center justify-between shadow-sm shrink-0 z-20">
                <button onClick={onBack} className="p-2 -ml-2 text-slate-500 hover:text-slate-800"><ArrowLeft size={24}/></button>
                <div className="font-black text-slate-800 text-lg">
                    {initialOrder ? `Edit #${initialOrder.id.slice(0,6)}` : 'Νέα Παραγγελία'}
                </div>
                <button onClick={handleSaveOrder} disabled={isSaving} className="bg-[#060b00] text-white p-2 rounded-xl shadow-md disabled:opacity-50">
                    <Save size={20}/>
                </button>
            </div>

            {/* CUSTOMER SECTION */}
            <div className="p-4 bg-white border-b border-slate-100 shrink-0 z-10">
                <div className="relative">
                    <div className="flex items-center gap-2 mb-2">
                        <User size={16} className="text-slate-400"/>
                        <input 
                            className="flex-1 outline-none font-bold text-slate-800 placeholder-slate-300" 
                            placeholder="Όνομα Πελάτη..."
                            value={customerName}
                            onChange={e => { setCustomerName(e.target.value); setShowCustSearch(true); if(!e.target.value) setCustomerId(null); }}
                            onFocus={() => setShowCustSearch(true)}
                        />
                        {customerId && <Check size={16} className="text-emerald-500"/>}
                    </div>
                    
                    {showCustSearch && customerName && !customerId && filteredCustomers.length > 0 && (
                        <div className="absolute top-full left-0 right-0 bg-white shadow-xl rounded-xl border border-slate-100 mt-1 z-50 overflow-hidden">
                            {filteredCustomers.map(c => (
                                <div 
                                    key={c.id} 
                                    onClick={() => { setCustomerName(c.full_name); setCustomerPhone(c.phone||''); setCustomerId(c.id); setShowCustSearch(false); }}
                                    className="p-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 font-medium text-sm flex justify-between"
                                >
                                    <span>{c.full_name}</span>
                                    {c.phone && <span className="text-slate-400 text-xs">{c.phone}</span>}
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex items-center gap-2 border-t border-slate-50 pt-2">
                        <Phone size={16} className="text-slate-400"/>
                        <input 
                            className="flex-1 outline-none text-sm text-slate-600 placeholder-slate-300" 
                            placeholder="Τηλέφωνο..."
                            value={customerPhone}
                            onChange={e => setCustomerPhone(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* BUILDER AREA (Dynamic) */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col gap-4">
                
                {/* 1. INPUT STAGE */}
                {!activeMaster && (
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 animate-in fade-in slide-in-from-bottom-4">
                        <label className="text-xs font-black text-slate-400 uppercase mb-2 block">Προσθήκη Κωδικού</label>
                        <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-500 transition-all">
                            <Search size={20} className="text-slate-400 ml-1"/>
                            <input 
                                ref={inputRef}
                                type="text" 
                                value={input}
                                onChange={e => setInput(e.target.value.toUpperCase())}
                                placeholder="π.χ. DA100 ή 1005..."
                                className="flex-1 bg-transparent p-2 outline-none font-mono font-bold text-lg text-slate-900 uppercase placeholder-slate-300"
                                autoFocus
                            />
                            {input && <button onClick={() => setInput('')}><X size={18} className="text-slate-400"/></button>}
                        </div>

                        {/* Suggestions */}
                        <div className="mt-2 space-y-2">
                            {suggestions.map(p => (
                                <button 
                                    key={p.sku} 
                                    onClick={() => handleSelectMaster(p)}
                                    className="w-full text-left p-2 rounded-xl bg-white border border-slate-100 hover:border-emerald-300 hover:bg-emerald-50 transition-all flex items-center justify-between group active:scale-98"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-slate-100 rounded-lg overflow-hidden shrink-0 flex items-center justify-center">
                                            {p.image_url ? (
                                                <img src={p.image_url} className="w-full h-full object-cover" alt={p.sku} />
                                            ) : (
                                                <ImageIcon size={16} className="text-slate-300"/>
                                            )}
                                        </div>
                                        <div>
                                            <div className="font-black text-slate-800 text-lg leading-none">{p.sku}</div>
                                            <div className="text-xs text-slate-500 font-medium">{p.category}</div>
                                        </div>
                                    </div>
                                    <div className="bg-slate-100 group-hover:bg-white p-1 rounded-lg transition-colors">
                                        <ChevronRight size={16} className="text-slate-400 group-hover:text-emerald-500"/>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* 2. VARIANT SELECTION STAGE */}
                {activeMaster && (
                    <div className="bg-white p-5 rounded-3xl shadow-lg border border-emerald-100 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-2xl font-black text-slate-900">{activeMaster.sku}</h3>
                                <p className="text-xs text-slate-500 font-bold uppercase">{activeMaster.category}</p>
                            </div>
                            <button onClick={() => setActiveMaster(null)} className="p-2 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200">
                                <X size={20}/>
                            </button>
                        </div>

                        {/* Sizing Grid (If applicable) */}
                        {sizeMode && (
                            <div className="mb-6">
                                <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block flex items-center gap-1">
                                    <Hash size={12}/> Επιλογή {sizeMode.type} <span className="font-normal text-slate-300 lowercase">(προαιρετικό)</span>
                                </label>
                                <div className="grid grid-cols-5 gap-2">
                                    {sizeMode.sizes.map(s => (
                                        <button 
                                            key={s}
                                            onClick={() => setSelectedSize(s === selectedSize ? '' : s)}
                                            className={`py-2 rounded-lg text-sm font-bold transition-all border ${
                                                selectedSize === s 
                                                    ? 'bg-slate-800 text-white border-slate-800 shadow-md transform scale-105' 
                                                    : 'bg-slate-50 text-slate-600 border-slate-200'
                                            }`}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Quantity Stepper */}
                        <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl mb-6 border border-slate-100">
                            <span className="text-xs font-bold text-slate-500 uppercase ml-1">Ποσότητα</span>
                            <div className="flex items-center gap-3 bg-white rounded-lg border border-slate-200 p-1 shadow-sm">
                                <button onClick={() => setQty(Math.max(1, qty - 1))} className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded text-slate-600 font-bold hover:bg-slate-200">-</button>
                                <span className="w-8 text-center font-black text-lg">{qty}</span>
                                <button onClick={() => setQty(qty + 1)} className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded text-slate-600 font-bold hover:bg-slate-200">+</button>
                            </div>
                        </div>

                        {/* Variants / Master Actions */}
                        <div className="grid grid-cols-2 gap-3">
                            {/* Master Option: Only show if NO variants are defined (or logic permits) */}
                            {/* New requirement: Hide generic Master if specific variants exist to force specific selection */}
                            {!hasVariants && (
                                <button 
                                    onClick={() => handleAddItem(null)}
                                    className="p-4 rounded-2xl bg-white border-2 border-slate-100 hover:border-slate-800 transition-all flex flex-col items-center gap-1 active:scale-95 disabled:opacity-50 disabled:grayscale"
                                >
                                    <span className="text-lg font-black text-slate-700">Βασικό</span>
                                    <span className="text-[10px] uppercase font-bold text-slate-400">Master</span>
                                </button>
                            )}

                            {/* Variants */}
                            {activeMaster.variants?.map(v => {
                                const { finish } = getVariantComponents(v.suffix, activeMaster.gender);
                                const colorClass = FINISH_COLORS[finish.code] || 'bg-slate-50 text-slate-700 border-slate-200';
                                
                                return (
                                    <button 
                                        key={v.suffix}
                                        onClick={() => handleAddItem(v)}
                                        className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-1 active:scale-95 shadow-sm disabled:opacity-50 disabled:grayscale ${colorClass}`}
                                    >
                                        <span className="text-lg font-black">{v.suffix}</span>
                                        <span className="text-[10px] uppercase font-bold opacity-80 truncate w-full text-center">{v.description || 'Var'}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* CART SUMMARY */}
                <div className="mt-4">
                    <div className="flex justify-between items-end mb-2 px-2">
                        <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide">Καλάθι ({items.length})</h3>
                        <span className="text-emerald-600 font-black text-lg">{formatCurrency(items.reduce((a,b)=>a+(b.price_at_order*b.quantity),0))}</span>
                    </div>
                    
                    <div className="space-y-2">
                        {items.map((item, idx) => (
                            <div key={idx} className="bg-white p-3 rounded-xl border border-slate-100 flex justify-between items-center shadow-sm animate-in slide-in-from-right-4">
                                <div>
                                    <div className="font-black text-slate-800 text-base">
                                        {item.sku}<span className="text-slate-400">{item.variant_suffix}</span>
                                    </div>
                                    <div className="text-[10px] text-slate-500 font-medium flex gap-2">
                                        <span>{formatCurrency(item.price_at_order)}</span>
                                        {item.size_info && <span className="bg-slate-100 px-1 rounded border border-slate-200">Size: {item.size_info}</span>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="font-bold text-slate-600 bg-slate-50 px-2 py-1 rounded-lg">x{item.quantity}</span>
                                    <button onClick={() => handleRemoveItem(idx)} className="p-2 text-slate-300 hover:text-red-500">
                                        <Trash2 size={18}/>
                                    </button>
                                </div>
                            </div>
                        ))}
                        {items.length === 0 && (
                            <div className="text-center py-8 text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                                <p className="text-sm font-bold">Το καλάθι είναι άδειο</p>
                                <p className="text-xs">Ξεκινήστε την πληκτρολόγηση...</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
