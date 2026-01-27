import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Product, ProductVariant, Order, OrderItem, Customer, OrderStatus, VatRegime } from '../../types';
import { ArrowLeft, Save, Plus, Search, Trash2, X, ChevronRight, Hash, User, Phone, Check, AlertCircle, ImageIcon, Box, Camera, StickyNote, Minus, Coins, Percent, ScanBarcode, RefreshCw, ChevronUp, ChevronDown } from 'lucide-react';
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
    const [vatRate, setVatRate] = useState<number>(initialOrder?.vat_rate !== undefined ? initialOrder.vat_rate : VatRegime.Standard);
    const [discountPercent, setDiscountPercent] = useState<number>(initialOrder?.discount_percent || 0);
    const [isSaving, setIsSaving] = useState(false);
    const [orderNotes, setOrderNotes] = useState(initialOrder?.notes || '');
    const [showCustDetails, setShowCustDetails] = useState(true);

    // --- INPUT STATE ---
    const [input, setInput] = useState('');
    const [suggestions, setSuggestions] = useState<Product[]>([]);
    const [activeMaster, setActiveMaster] = useState<Product | null>(null);
    const [sizeMode, setSizeMode] = useState<{ type: 'Νούμερο' | 'Μήκος', sizes: string[] } | null>(null);
    const [selectedSize, setSelectedSize] = useState('');
    const [itemNotes, setItemNotes] = useState('');
    const [qty, setQty] = useState(1);
    const [showScanner, setShowScanner] = useState(false);
    
    // Price Sync Indicators
    const [priceDiffs, setPriceDiffs] = useState<{ net: number, vat: number, total: number } | null>(null);
    
    // Suggestion List Ref for scrolling
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
            const aExact = a.sku === term;
            const bExact = b.sku === term;
            if (aExact && !bExact) return -1;
            if (!aExact && bExact) return 1;
            const aStarts = a.sku.startsWith(term);
            const bStarts = b.sku.startsWith(term);
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;
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
        
        setPriceDiffs(null);

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

            if (product.is_component) {
                showToast(`Ο κωδικός ${product.sku} είναι εξάρτημα.`, "error");
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
                setPriceDiffs(null);
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

    const executeAddItem = () => {
        const skuCode = input.split(/\s+/)[0]; 
        if (!skuCode) return;
        const match = findProductByScannedCode(skuCode, products);
        
        if (!match) {
            showToast(`Ο κωδικός ${skuCode} δεν βρέθηκε.`, "error");
            return;
        }
        const { product, variant } = match;
        if (product.is_component) {
            showToast(`Το ${product.sku} είναι εξάρτημα.`, "error");
            return;
        }

        if (!variant) {
            const hasVariants = product.variants && product.variants.length > 0;
            const isSingleLustre = hasVariants && product.variants!.length === 1 && product.variants![0].suffix === '';
            if (hasVariants && !isSingleLustre) {
                setActiveMaster(product); 
                return;
            }
        }
    
        const unitPrice = variant?.selling_price || product.selling_price || 0;
        const newItem: OrderItem = {
            sku: product.sku,
            variant_suffix: variant?.suffix,
            quantity: qty,
            price_at_order: unitPrice,
            product_details: product,
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
        
        setPriceDiffs(null);
        setInput('');
        setQty(1);
        setItemNotes('');
        setSelectedSize('');
        setSuggestions([]);
        setActiveMaster(null);
        setSizeMode(null);
        inputRef.current?.focus();
        showToast("Το προϊόν προστέθηκε.", "success");
    };

    const subtotal = items.reduce((sum, i) => sum + (i.price_at_order * i.quantity), 0);
    const discountAmount = subtotal * (discountPercent / 100);
    const netAmount = subtotal - discountAmount;
    const vatAmount = netAmount * vatRate;
    const grandTotal = netAmount + vatAmount;

    const handleSaveOrder = async () => {
        if (!customerName) { showToast("Το όνομα πελάτη είναι υποχρεωτικό.", 'error'); return; }
        if (items.length === 0) { showToast("Η παραγγελία είναι κενή.", 'error'); return; }
        setIsSaving(true);
        try {
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
                total_price: grandTotal,
                vat_rate: vatRate,
                discount_percent: discountPercent,
                status: initialOrder?.status || OrderStatus.Pending,
                created_at: initialOrder?.created_at || new Date().toISOString(),
                notes: orderNotes
            };
            if (initialOrder) await api.updateOrder(orderPayload);
            else await api.saveOrder(orderPayload);
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            onBack();
        } catch (e) { showToast("Σφάλμα αποθήκευσης", "error"); }
        finally { setIsSaving(false); }
    };

    const handleRemoveItem = (index: number) => {
        setItems(prev => prev.filter((_, i) => i !== index));
        setPriceDiffs(null);
    };
    
    const updateItemQty = (index: number, delta: number) => {
        setItems(prev => {
            const next = [...prev];
            next[index].quantity = Math.max(1, next[index].quantity + delta);
            return next;
        });
        setPriceDiffs(null);
    };

    const [showCustSearch, setShowCustSearch] = useState(false);
    const filteredCustomers = useMemo(() => {
        if (!customers || !customerName) return [];
        return customers.filter(c => c.full_name.toLowerCase().includes(customerName.toLowerCase())).slice(0, 5);
    }, [customers, customerName]);
    
    const handleRecalculatePrices = () => {
        const oldSub = items.reduce((acc, item) => acc + (item.price_at_order * item.quantity), 0);
        const oldNet = oldSub * (1 - discountPercent / 100);
        const oldVat = oldNet * vatRate;
        const oldTotal = oldNet + oldVat;

        let updatedCount = 0;
        const newItems = items.map(item => {
            const product = products.find(p => p.sku === item.sku);
            if (!product) return item;
            let currentRegistryPrice = 0;
            if (item.variant_suffix) {
                const variant = product.variants?.find(v => v.suffix === item.variant_suffix);
                currentRegistryPrice = variant?.selling_price || 0;
            } else {
                currentRegistryPrice = product.selling_price;
            }
            if (currentRegistryPrice > 0 && Math.abs(currentRegistryPrice - item.price_at_order) > 0.01) {
                updatedCount++;
                return { ...item, price_at_order: currentRegistryPrice };
            }
            return item;
        });

        const newSub = newItems.reduce((acc, item) => acc + (item.price_at_order * item.quantity), 0);
        const newNet = newSub * (1 - discountPercent / 100);
        const newVat = newNet * vatRate;
        const newTotal = newNet + newVat;
        
        setPriceDiffs({
            net: newNet - oldNet,
            vat: newVat - oldVat,
            total: newTotal - oldTotal
        });

        if (updatedCount > 0) {
            setItems(newItems);
            showToast(`Ενημερώθηκαν οι τιμές σε ${updatedCount} είδη.`, 'success');
        } else {
            showToast('Οι τιμές είναι ήδη επίκαιρες.', 'info');
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden">
            {/* 1. HEADER (Fixed) */}
            <div className="bg-white p-4 border-b border-slate-200 flex items-center justify-between shadow-sm shrink-0 z-30">
                <button onClick={onBack} className="p-2 -ml-2 text-slate-500 hover:text-slate-800"><ArrowLeft size={24}/></button>
                <div className="font-black text-slate-800 text-lg">{initialOrder ? `Edit #${initialOrder.id.slice(0,6)}` : 'Νέα Παραγγελία'}</div>
                <button onClick={handleSaveOrder} disabled={isSaving} className="bg-[#060b00] text-white p-2 rounded-xl shadow-md disabled:opacity-50"><Save size={20}/></button>
            </div>

            {/* 2. MAIN SCROLLING CONTENT AREA - Split into Customer/Input (Shrinkable) and List (Flex Grow) */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
                
                {/* 2A. Top Section: Customer Info & Input - Can scroll if needed but usually compact */}
                <div className="shrink-0 bg-slate-50 z-20 shadow-sm transition-all border-b border-slate-200 max-h-[45vh] overflow-y-auto custom-scrollbar">
                    {/* Collapsible Customer Header */}
                    <div 
                        className="p-3 bg-white border-b border-slate-100 flex justify-between items-center cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => setShowCustDetails(!showCustDetails)}
                    >
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wide">
                            <User size={14}/> {customerName || 'Πελάτης'}
                        </div>
                        {showCustDetails ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                    </div>

                    {showCustDetails && (
                        <div className="p-4 space-y-3 bg-white animate-in slide-in-from-top-2">
                             <div className="relative">
                                <div className="flex items-center gap-2 mb-2">
                                    <input className="flex-1 outline-none font-bold text-slate-800 placeholder-slate-300 border-b border-slate-200 pb-1" placeholder="Όνομα..." value={customerName} onChange={e => { setCustomerName(e.target.value); setShowCustSearch(true); if(!e.target.value) setCustomerId(null); }} onFocus={() => setShowCustDetails(true)}/>
                                    {customerId && <Check size={16} className="text-emerald-500"/>}
                                </div>
                                {showCustSearch && customerName && !customerId && filteredCustomers.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 bg-white shadow-xl rounded-xl border border-slate-100 mt-1 z-50 overflow-hidden">
                                        {filteredCustomers.map(c => (
                                            <div key={c.id} onClick={() => { setCustomerName(c.full_name); setCustomerPhone(c.phone||''); setCustomerId(c.id); setShowCustSearch(false); }} className="p-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 font-medium text-sm flex justify-between"><span>{c.full_name}</span></div>
                                        ))}
                                    </div>
                                )}
                                <div className="flex gap-2">
                                     <div className="flex items-center gap-2 flex-1 bg-slate-50 p-2 rounded-lg border border-slate-100"><Phone size={14} className="text-slate-400"/><input className="flex-1 bg-transparent outline-none text-xs font-medium" placeholder="Τηλ" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}/></div>
                                     <div className="flex items-center gap-2 flex-1 bg-amber-50 p-2 rounded-lg border border-amber-100"><Percent size={14} className="text-amber-500"/><input type="number" min="0" max="100" value={discountPercent} onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)} className="flex-1 bg-transparent text-xs font-black text-amber-800 outline-none" placeholder="Έκπτ."/></div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* PRODUCT INPUT AREA (Always Visible in Top Section unless collapsed explicitly, but here we keep it) */}
                    <div className="p-4 bg-slate-50">
                        {/* Master Selection Input */}
                        {!activeMaster && (
                            <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200">
                                <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Προσθήκη Κωδικού</label>
                                <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                                    <Search size={18} className="text-slate-400"/>
                                    <input ref={inputRef} type="text" value={input} onChange={e => setInput(e.target.value.toUpperCase())} placeholder="SKU..." className="flex-1 bg-transparent outline-none font-mono font-bold text-slate-800 uppercase placeholder-slate-300"/>
                                    <button onClick={() => setShowScanner(true)} className="p-1.5 bg-white rounded-md shadow-sm text-slate-500"><Camera size={16}/></button>
                                </div>
                                <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                                    {suggestions.map(p => (
                                        <button key={p.sku} onClick={() => handleSelectMaster(p)} className="w-full text-left p-2 rounded-lg hover:bg-slate-50 flex items-center justify-between text-xs border-b border-slate-50 last:border-0">
                                            <span className="font-black text-slate-700">{p.sku}</span>
                                            <span className="text-[10px] text-slate-400">{p.category}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Variant Selection Panel */}
                        {activeMaster && (
                            <div className="bg-white p-4 rounded-2xl shadow-lg border border-emerald-100 animate-in zoom-in-95">
                                <div className="flex justify-between items-center mb-3">
                                    <div><h3 className="text-lg font-black text-slate-900">{activeMaster.sku}</h3><p className="text-[10px] text-slate-500 uppercase font-bold">{activeMaster.category}</p></div>
                                    <button onClick={() => setActiveMaster(null)} className="p-1.5 bg-slate-100 rounded-full text-slate-500"><X size={16}/></button>
                                </div>
                                
                                {sizeMode && (
                                    <div className="mb-3">
                                        <div className="grid grid-cols-5 gap-1">{sizeMode.sizes.map(s => (<button key={s} onClick={() => setSelectedSize(s === selectedSize ? '' : s)} className={`py-1.5 rounded-md text-xs font-bold border ${selectedSize === s ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-50 text-slate-600 border-slate-100'}`}>{s}</button>))}</div>
                                    </div>
                                )}
                                
                                <div className="flex items-center justify-between bg-slate-50 p-2 rounded-lg mb-3">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase ml-1">Ποσ.</span>
                                    <div className="flex items-center gap-3"><button onClick={() => setQty(Math.max(1, qty - 1))} className="w-6 h-6 bg-white rounded border border-slate-200 font-bold">-</button><span className="w-4 text-center font-black text-sm">{qty}</span><button onClick={() => setQty(qty + 1)} className="w-6 h-6 bg-white rounded border border-slate-200 font-bold">+</button></div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto custom-scrollbar">
                                    {(!activeMaster.variants || activeMaster.variants.length === 0) && (<button onClick={() => handleAddItem(null)} className="p-3 rounded-xl bg-slate-100 border border-slate-200 font-bold text-slate-700 text-xs col-span-2">Βασικό</button>)}
                                    {activeMaster.variants?.map(v => {
                                        const { finish, stone } = getVariantComponents(v.suffix, activeMaster.gender);
                                        const finishColor = FINISH_COLORS[finish.code] || 'bg-slate-50 text-slate-700 border-slate-200';
                                        return (<button key={v.suffix} onClick={() => handleAddItem(v)} className={`p-3 rounded-xl border flex flex-col items-center gap-0.5 active:scale-95 shadow-sm ${finishColor}`}><span className="text-xs font-black flex items-center gap-0.5">{finish.code}{stone.code && <span className={STONE_TEXT_COLORS[stone.code] || 'text-emerald-600'}>{stone.code}</span>}{!finish.code && !stone.code && (v.suffix || 'BAS')}</span></button>);
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* 2B. Bottom Section: List - INDEPENDENT SCROLL */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-50/30 shadow-inner min-h-0 relative">
                     <div className="flex justify-between items-center mb-2 sticky top-0 bg-slate-50/95 backdrop-blur-sm py-1 z-10">
                         <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wide">Καλάθι ({items.length})</h3>
                         <button onClick={handleRecalculatePrices} className="flex items-center gap-1 text-[9px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
                             <RefreshCw size={10}/> Sync
                         </button>
                    </div>

                    <div className="space-y-2 pb-4">
                        {items.map((item, idx) => (
                            <div key={idx} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex flex-col gap-2">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <div className="font-black text-slate-800 text-sm">{item.sku}<span className="text-emerald-600">{item.variant_suffix}</span></div>
                                        <div className="text-[10px] text-slate-500 font-medium flex gap-2"><span>{formatCurrency(item.price_at_order)}</span>{item.size_info && <span className="bg-slate-100 px-1 rounded border border-slate-200">Size: {item.size_info}</span>}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-1 bg-slate-50 rounded-lg p-0.5 border border-slate-100">
                                            <button onClick={() => updateItemQty(idx, -1)} className="p-1 text-slate-400 hover:bg-white rounded"><Minus size={12}/></button>
                                            <span className="text-xs font-bold text-slate-700 w-4 text-center">{item.quantity}</span>
                                            <button onClick={() => updateItemQty(idx, 1)} className="p-1 text-slate-400 hover:bg-white rounded"><Plus size={12}/></button>
                                        </div>
                                        <button onClick={() => handleRemoveItem(idx)} className="p-1.5 text-slate-300 hover:text-red-500 bg-slate-50 rounded-lg"><Trash2 size={16}/></button>
                                    </div>
                                </div>
                                {item.notes && <div className="text-[10px] text-emerald-700 italic bg-emerald-50 p-1.5 rounded">{item.notes}</div>}
                            </div>
                        ))}
                        {items.length === 0 && (<div className="text-center py-10 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50"><p className="text-xs font-bold">Το καλάθι είναι άδειο</p></div>)}
                    </div>
                </div>
            </div>

            {/* 3. FOOTER (Fixed) */}
            <div className="p-4 bg-white border-t border-slate-200 shrink-0 shadow-lg z-30">
                <div className="flex justify-between items-center text-xs text-slate-500 mb-1">
                     <span>Καθαρή:</span>
                     <div className="flex items-center gap-1">
                        <span className="font-mono font-bold">{formatCurrency(subtotal)}</span>
                        {priceDiffs && priceDiffs.net !== 0 && (
                            <span className={`text-[9px] font-bold ${priceDiffs.net > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                ({priceDiffs.net > 0 ? '+' : ''}{formatCurrency(priceDiffs.net)})
                            </span>
                        )}
                     </div>
                </div>
                {discountPercent > 0 && (
                    <div className="flex justify-between items-center text-xs text-red-500 mb-1">
                        <span>Έκπτωση ({discountPercent}%):</span>
                        <span className="font-mono font-bold">-{formatCurrency(discountAmount)}</span>
                    </div>
                )}
                <div className="flex justify-between items-center text-xs text-slate-500 border-b border-slate-200 pb-2 mb-2">
                     <span>ΦΠΑ ({(vatRate * 100).toFixed(0)}%):</span>
                     <div className="flex items-center gap-1">
                        <span className="font-mono font-bold">{formatCurrency(vatAmount)}</span>
                        {priceDiffs && priceDiffs.vat !== 0 && (
                            <span className={`text-[9px] font-bold ${priceDiffs.vat > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                ({priceDiffs.vat > 0 ? '+' : ''}{formatCurrency(priceDiffs.vat)})
                            </span>
                        )}
                     </div>
                </div>
                <div className="flex justify-between items-center mb-3">
                     <span className="font-black text-slate-800 uppercase text-sm">Συνολο</span>
                     <div className="flex flex-col items-end">
                         <span className="font-black text-2xl text-emerald-700">{formatCurrency(grandTotal)}</span>
                         {priceDiffs && priceDiffs.total !== 0 && (
                            <span className={`text-xs font-bold ${priceDiffs.total > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                {priceDiffs.total > 0 ? '+' : ''}{formatCurrency(priceDiffs.total)}
                            </span>
                        )}
                     </div>
                </div>
                <button onClick={handleSaveOrder} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform">
                    <Save size={20}/> Αποθήκευση Εντολής
                </button>
            </div>
            
            {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
        </div>
    );
}