import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Product, ProductVariant, Order, OrderItem, Customer, OrderStatus } from '../../types';
import { ArrowLeft, Save, Plus, Search, Trash2, X, ChevronRight, Hash, User, Phone, Check, AlertCircle, ImageIcon, Box, Camera, StickyNote, Minus } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, SYSTEM_IDS } from '../../lib/supabase';
import { formatCurrency, analyzeSku, getVariantComponents, findProductByScannedCode } from '../../utils/pricingEngine';
import { getSizingInfo } from '../../utils/sizing';
import { useUI } from '../UIProvider';
import { useAuth } from '../AuthContext';
import BarcodeScanner from '../BarcodeScanner';

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

const STONE_TEXT_COLORS: Record<string, string> = {
    'KR': 'text-rose-600', 'QN': 'text-slate-900', 'LA': 'text-blue-600', 'TY': 'text-teal-500',
    'TG': 'text-orange-700', 'IA': 'text-red-800', 'BSU': 'text-slate-800', 'GSU': 'text-emerald-800',
    'RSU': 'text-rose-800', 'MA': 'text-emerald-600', 'FI': 'text-slate-400', 'OP': 'text-indigo-500',
    'NF': 'text-green-800', 'CO': 'text-orange-500', 'PCO': 'text-emerald-500', 'MCO': 'text-purple-500',
    'PAX': 'text-green-600', 'MAX': 'text-blue-700', 'KAX': 'text-red-700', 'AI': 'text-slate-600',
    'AP': 'text-cyan-600', 'AM': 'text-teal-700', 'LR': 'text-indigo-700', 'BST': 'text-sky-500',
    'MP': 'text-blue-500', 'LE': 'text-slate-400', 'PR': 'text-green-500', 'KO': 'text-red-500',
    'MV': 'text-purple-500', 'RZ': 'text-pink-500', 'AK': 'text-cyan-400', 'XAL': 'text-stone-500'
};

export default function MobileOrderBuilder({ onBack, initialOrder, products }: Props) {
    const { showToast } = useUI();
    const { profile } = useAuth();
    const queryClient = useQueryClient();
    const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: api.getCustomers });

    const isSeller = profile?.role === 'seller';

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
    const [itemNotes, setItemNotes] = useState('');
    const [qty, setQty] = useState(1);
    const [showScanner, setShowScanner] = useState(false);
    
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

        const numericMatch = term.match(/\d+/);
        const numberTerm = numericMatch ? numericMatch[0] : null;

        const results = products.filter(p => {
            if (p.is_component) return false;
            if (p.sku.startsWith(term)) return true;
            if (numberTerm && numberTerm.length >= 3 && p.sku.includes(numberTerm)) return true;
            return false;
        }).sort((a, b) => {
            if (a.sku.length !== b.sku.length) return a.sku.length - b.sku.length;
            return a.sku.localeCompare(b.sku);
        }).slice(0, 10);

        setSuggestions(results);
    }, [input, products]);

    const handleSelectMaster = (p: Product) => {
        setActiveMaster(p);
        setInput(''); 
        setSuggestions([]);
        const sizing = getSizingInfo(p);
        if (sizing) {
            setSizeMode(sizing);
            setSelectedSize('');
        } else {
            setSizeMode(null);
        }
    };

    const handleAddItem = (variant: ProductVariant | null) => {
        if (!activeMaster) return;

        const unitPrice = variant?.selling_price || activeMaster.selling_price || 0;
        
        const newItem: OrderItem = {
            sku: activeMaster.sku,
            variant_suffix: variant?.suffix,
            quantity: qty,
            price_at_order: unitPrice,
            product_details: activeMaster,
            size_info: selectedSize || undefined,
            notes: itemNotes || undefined
        };

        setItems(prev => {
            const existingIdx = prev.findIndex(i => 
                i.sku === newItem.sku && 
                i.variant_suffix === newItem.variant_suffix && 
                i.size_info === newItem.size_info &&
                i.notes === newItem.notes
            );

            if (existingIdx >= 0) {
                const updated = [...prev];
                updated[existingIdx].quantity += qty;
                return updated;
            }
            return [newItem, ...prev];
        });

        if (navigator.vibrate) navigator.vibrate(50);
        showToast(`${activeMaster.sku}${variant?.suffix || ''} προστέθηκε`, 'success');

        setActiveMaster(null);
        setQty(1);
        setSelectedSize('');
        setItemNotes('');
        setSizeMode(null);
        setInput('');
        setTimeout(() => inputRef.current?.focus(), 100);
    };

    const handleScan = (code: string) => {
        const match = findProductByScannedCode(code, products);
        if (match) {
            const { product, variant } = match;

            // @FIX: Block adding components (STX) via Barcode Scanner in Order workflow
            if (product.is_component) {
                showToast(`Ο κωδικός ${product.sku} είναι εξάρτημα και δεν πωλείται.`, "error");
                return;
            }

            const isSpecific = !!variant;
            const isSimple = !product.variants || product.variants.length === 0;

            if (isSpecific || isSimple) {
                const unitPrice = variant?.selling_price || product.selling_price || 0;
                const newItem: OrderItem = {
                    sku: product.sku,
                    variant_suffix: variant?.suffix,
                    quantity: 1,
                    price_at_order: unitPrice,
                    product_details: product
                };

                setItems(prev => {
                    const existingIdx = prev.findIndex(i => 
                        i.sku === newItem.sku && 
                        i.variant_suffix === newItem.variant_suffix && 
                        !i.size_info
                    );
                    if (existingIdx >= 0) {
                        const updated = [...prev];
                        updated[existingIdx].quantity += 1;
                        return updated;
                    }
                    return [newItem, ...prev];
                });
                showToast(`Προστέθηκε: ${product.sku}${variant?.suffix || ''}`, 'success');
                setShowScanner(false);
            } else {
                handleSelectMaster(product);
                setShowScanner(false);
                showToast(`Επιλέξτε παραλλαγή για ${product.sku}`, 'info');
            }
        } else {
            showToast(`Μη έγκυρος κωδικός: ${code}`, 'error');
        }
    };

    const handleSaveOrder = async () => {
        if (!customerName) { showToast("Το όνομα πελάτη είναι υποχρεωτικό.", 'error'); return; }
        if (items.length === 0) { showToast("Η παραγγελία είναι κενή.", 'error'); return; }
        setIsSaving(true);
        try {
            const total = items.reduce((sum, i) => sum + (i.price_at_order * i.quantity), 0);
            
            let orderId = initialOrder?.id;
            if (!orderId) {
                const now = new Date();
                const year = now.getFullYear().toString().slice(-2);
                const month = (now.getMonth() + 1).toString().padStart(2, '0');
                const day = now.getDate().toString().padStart(2, '0');
                const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
                orderId = `ORD-${year}${month}${day}-${random}`;
            }

            const orderPayload: Order = {
                id: orderId,
                customer_name: customerName,
                customer_phone: customerPhone,
                customer_id: customerId || undefined,
                seller_id: isSeller ? profile?.id : undefined,
                items: items,
                total_price: total,
                status: initialOrder?.status || OrderStatus.Pending,
                created_at: initialOrder?.created_at || new Date().toISOString(),
                notes: initialOrder?.notes
            };
            if (initialOrder) await api.updateOrder(orderPayload);
            else await api.saveOrder(orderPayload);
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            onBack();
        } catch (e) { showToast("Σφάλμα αποθήκευσης", "error"); }
        finally { setIsSaving(false); }
    };

    const handleRemoveItem = (index: number) => setItems(prev => prev.filter((_, i) => i !== index));
    const updateItemQty = (index: number, delta: number) => {
        setItems(prev => {
            const next = [...prev];
            next[index].quantity = Math.max(1, next[index].quantity + delta);
            return next;
        });
    };

    const [showCustSearch, setShowCustSearch] = useState(false);
    const filteredCustomers = useMemo(() => {
        if (!customers || !customerName) return [];
        return customers.filter(c => c.full_name.toLowerCase().includes(customerName.toLowerCase())).slice(0, 5);
    }, [customers, customerName]);

    const hasVariants = activeMaster && activeMaster.variants && activeMaster.variants.length > 0;

    return (
        <div className="flex flex-col h-full bg-slate-50 relative">
            <div className="bg-white p-4 border-b border-slate-200 flex items-center justify-between shadow-sm shrink-0 z-20">
                <button onClick={onBack} className="p-2 -ml-2 text-slate-500 hover:text-slate-800"><ArrowLeft size={24}/></button>
                <div className="font-black text-slate-800 text-lg">{initialOrder ? `Edit #${initialOrder.id.slice(0,6)}` : 'Νέα Παραγγελία'}</div>
                <button onClick={handleSaveOrder} disabled={isSaving} className="bg-[#060b00] text-white p-2 rounded-xl shadow-md disabled:opacity-50"><Save size={20}/></button>
            </div>

            <div className="p-4 bg-white border-b border-slate-100 shrink-0 z-10">
                <div className="relative">
                    <div className="flex items-center gap-2 mb-2">
                        <User size={16} className="text-slate-400"/>
                        <input className="flex-1 outline-none font-bold text-slate-800 placeholder-slate-300" placeholder="Όνομα Πελάτη..." value={customerName} onChange={e => { setCustomerName(e.target.value); setShowCustSearch(true); if(!e.target.value) setCustomerId(null); }} onFocus={() => setShowCustSearch(true)}/>
                        {customerId && <Check size={16} className="text-emerald-500"/>}
                    </div>
                    {showCustSearch && customerName && !customerId && filteredCustomers.length > 0 && (
                        <div className="absolute top-full left-0 right-0 bg-white shadow-xl rounded-xl border border-slate-100 mt-1 z-50 overflow-hidden">
                            {filteredCustomers.map(c => (
                                <div key={c.id} onClick={() => { setCustomerName(c.full_name); setCustomerPhone(c.phone||''); setCustomerId(c.id); setShowCustSearch(false); }} className="p-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 font-medium text-sm flex justify-between"><span>{c.full_name}</span>{c.phone && <span className="text-slate-400 text-xs">{c.phone}</span>}</div>
                            ))}
                        </div>
                    )}
                    <div className="flex items-center gap-2 border-t border-slate-50 pt-2"><Phone size={16} className="text-slate-400"/><input className="flex-1 outline-none text-sm text-slate-600 placeholder-slate-300" placeholder="Τηλέφωνο..." value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}/></div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col gap-4">
                {!activeMaster && (
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 animate-in fade-in slide-in-from-bottom-4">
                        <label className="text-xs font-black text-slate-400 uppercase mb-2 block">Προσθήκη Κωδικού</label>
                        <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-500 transition-all">
                            <Search size={20} className="text-slate-400 ml-1"/><input ref={inputRef} type="text" value={input} onChange={e => setInput(e.target.value.toUpperCase())} placeholder="π.χ. DA100 ή 1005..." className="flex-1 bg-transparent p-2 outline-none font-mono font-bold text-lg text-slate-900 uppercase placeholder-slate-300"/><button onClick={() => setShowScanner(true)} className="p-2 text-slate-400 hover:text-slate-800"><Camera size={20}/></button>
                        </div>
                        <div className="mt-2 space-y-2">
                            {suggestions.map(p => (
                                <button key={p.sku} onClick={() => handleSelectMaster(p)} className="w-full text-left p-2 rounded-xl bg-white border border-slate-100 hover:border-emerald-300 hover:bg-emerald-50 transition-all flex items-center justify-between group">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-slate-100 rounded-lg overflow-hidden shrink-0 flex items-center justify-center">{p.image_url ? <img src={p.image_url} className="w-full h-full object-cover" /> : <ImageIcon size={16} className="text-slate-300"/>}</div>
                                        <div><div className="font-black text-slate-800 text-lg leading-none">{p.sku}</div><div className="text-xs text-slate-500 font-medium">{p.category}</div></div>
                                    </div>
                                    <ChevronRight size={16} className="text-slate-300"/>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {activeMaster && (
                    <div className="bg-white p-5 rounded-3xl shadow-lg border border-emerald-100 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-start mb-4"><div><h3 className="text-2xl font-black text-slate-900">{activeMaster.sku}</h3><p className="text-xs text-slate-500 font-bold uppercase">{activeMaster.category}</p></div><button onClick={() => setActiveMaster(null)} className="p-2 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200"><X size={20}/></button></div>

                        {sizeMode && (
                            <div className="mb-6">
                                <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block flex items-center gap-1"><Hash size={12}/> Επιλογή {sizeMode.type} <span className="font-normal text-slate-300 lowercase">(προαιρετικό)</span></label>
                                <div className="grid grid-cols-5 gap-2">{sizeMode.sizes.map(s => (<button key={s} onClick={() => setSelectedSize(s === selectedSize ? '' : s)} className={`py-2 rounded-lg text-sm font-bold border ${selectedSize === s ? 'bg-slate-800 text-white border-slate-800 shadow-md transform scale-105' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>{s}</button>))}</div>
                            </div>
                        )}

                        <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl mb-4 border border-slate-100">
                            <span className="text-xs font-bold text-slate-500 uppercase ml-1">Ποσότητα</span>
                            <div className="flex items-center gap-3 bg-white rounded-lg border border-slate-200 p-1 shadow-sm"><button onClick={() => setQty(Math.max(1, qty - 1))} className="w-8 h-8 bg-slate-100 rounded text-slate-600 font-bold">-</button><span className="w-8 text-center font-black text-lg">{qty}</span><button onClick={() => setQty(qty + 1)} className="w-8 h-8 bg-slate-100 rounded text-slate-600 font-bold">+</button></div>
                        </div>
                        
                        <div className="mb-6">
                            <label className="text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 block flex items-center gap-1"><StickyNote size={12}/> Παρατηρήσεις Είδους</label>
                            <input value={itemNotes} onChange={e => setItemNotes(e.target.value)} placeholder="π.χ. Αλλαγή πέτρας, Ειδικό μέγεθος..." className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm"/>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            {!hasVariants && (<button onClick={() => handleAddItem(null)} className="p-4 rounded-2xl bg-white border-2 border-slate-100 hover:border-slate-800 transition-all flex flex-col items-center gap-1 active:scale-95 col-span-2"><span className="text-lg font-black text-slate-700">Βασικό</span><span className="text-[10px] uppercase font-bold text-slate-400">Master</span></button>)}
                            {activeMaster.variants?.map(v => {
                                const { finish, stone } = getVariantComponents(v.suffix, activeMaster.gender);
                                const finishColor = FINISH_COLORS[finish.code] || 'bg-slate-50 text-slate-700 border-slate-200';
                                const stoneColorClass = stone.code ? (STONE_TEXT_COLORS[stone.code] || 'text-emerald-600') : '';
                                return (<button key={v.suffix} onClick={() => handleAddItem(v)} className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-1 active:scale-95 shadow-sm bg-white ${finishColor}`}><span className="text-lg font-black flex items-center gap-0.5">{finish.code}{stone.code && <span className={stoneColorClass}>{stone.code}</span>}{!finish.code && !stone.code && v.suffix}</span><span className="text-[10px] uppercase font-bold opacity-80 truncate w-full text-center">{v.description || 'Var'}</span></button>);
                            })}
                        </div>
                    </div>
                )}

                <div className="mt-4 pb-20">
                    <div className="flex justify-between items-end mb-2 px-2"><h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide">Καλάθι ({items.length})</h3><span className="text-emerald-600 font-black text-lg">{formatCurrency(items.reduce((a,b)=>a+(b.price_at_order*b.quantity),0))}</span></div>
                    <div className="space-y-2">
                        {items.map((item, idx) => (
                            <div key={idx} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex flex-col gap-2">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <div className="font-black text-slate-800 text-base">{item.sku}<span className="text-slate-400">{item.variant_suffix}</span></div>
                                        <div className="text-[10px] text-slate-500 font-medium flex gap-2"><span>{formatCurrency(item.price_at_order)}</span>{item.size_info && <span className="bg-slate-100 px-1 rounded border border-slate-200">Size: {item.size_info}</span>}</div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-2 bg-slate-50 rounded-lg p-1 border border-slate-100">
                                            <button onClick={() => updateItemQty(idx, -1)} className="p-1 text-slate-400"><Minus size={12}/></button>
                                            <span className="text-xs font-bold text-slate-700 w-4 text-center">{item.quantity}</span>
                                            <button onClick={() => updateItemQty(idx, 1)} className="p-1 text-slate-400"><Plus size={12}/></button>
                                        </div>
                                        <button onClick={() => handleRemoveItem(idx)} className="p-2 text-slate-300 hover:text-red-500"><Trash2 size={18}/></button>
                                    </div>
                                </div>
                                {item.notes && (
                                    <div className="bg-emerald-50/50 p-2 rounded-lg border border-emerald-100 flex items-start gap-2">
                                        <StickyNote size={12} className="text-emerald-500 shrink-0 mt-0.5"/>
                                        <span className="text-[10px] text-emerald-800 font-bold italic line-clamp-1">{item.notes}</span>
                                    </div>
                                )}
                            </div>
                        ))}
                        {items.length === 0 && (<div className="text-center py-8 text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50"><p className="text-sm font-bold">Το καλάθι είναι άδειο</p><p className="text-xs">Ξεκινήστε την πληκτρολόγηση...</p></div>)}
                    </div>
                </div>
            </div>
            {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
        </div>
    );
}