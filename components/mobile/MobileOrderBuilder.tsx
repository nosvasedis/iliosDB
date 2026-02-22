
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Product, ProductVariant, Order, OrderItem, Customer, OrderStatus, VatRegime } from '../../types';
import { ArrowLeft, Save, Plus, Search, Trash2, X, ChevronRight, Hash, User, Phone, Check, AlertCircle, ImageIcon, Box, Camera, StickyNote, Minus, Coins, Percent, ScanBarcode, RefreshCw, Tag, Layers, Loader2 } from 'lucide-react';
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

// Visual Helpers (Synced with Desktop)
const FINISH_COLORS: Record<string, string> = {
    'X': 'text-amber-500',
    'P': 'text-slate-500',
    'D': 'text-orange-500',
    'H': 'text-cyan-400',
    '': 'text-slate-400'
};

const STONE_TEXT_COLORS: Record<string, string> = {
    'KR': 'text-rose-600', 'QN': 'text-slate-900', 'LA': 'text-blue-600', 'TY': 'text-teal-500',
    'TG': 'text-orange-700', 'IA': 'text-red-700', 'BSU': 'text-slate-800', 'GSU': 'text-emerald-800',
    'RSU': 'text-rose-800', 'MA': 'text-emerald-600', 'FI': 'text-slate-400', 'OP': 'text-indigo-500',
    'NF': 'text-green-700', 'CO': 'text-teal-600', 'TPR': 'text-emerald-500', 'TKO': 'text-rose-600',
    'TMP': 'text-blue-600', 'PCO': 'text-emerald-400', 'MCO': 'text-purple-500', 'PAX': 'text-green-600',
    'MAX': 'text-blue-700', 'KAX': 'text-red-700', 'AI': 'text-slate-600', 'AP': 'text-cyan-600',
    'AM': 'text-teal-700', 'LR': 'text-indigo-700', 'BST': 'text-sky-500', 'MP': 'text-blue-500',
    'LE': 'text-slate-400', 'PR': 'text-green-500', 'KO': 'text-red-500', 'MV': 'text-purple-500',
    'RZ': 'text-pink-500', 'AK': 'text-cyan-400', 'XAL': 'text-stone-500'
};

const SkuColored = ({ sku, suffix, gender }: { sku: string, suffix?: string, gender: any }) => {
    const { finish, stone } = getVariantComponents(suffix || '', gender);
    const fColor = FINISH_COLORS[finish.code] || 'text-slate-400';
    const sColor = STONE_TEXT_COLORS[stone.code] || 'text-emerald-500';

    return (
        <span className="font-black">
            <span className="text-slate-900">{sku}</span>
            <span className={fColor}>{finish.code}</span>
            <span className={sColor}>{stone.code}</span>
        </span>
    );
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
    const [items, setItems] = useState<OrderItem[]>(() => {
        const baseItems = initialOrder?.items || [];
        return baseItems.map(item => {
            const product = products.find(p => p.sku === item.sku);
            return {
                ...item,
                product_details: product || item.product_details
            };
        });
    });
    const [vatRate, setVatRate] = useState<number>(initialOrder?.vat_rate !== undefined ? initialOrder.vat_rate : VatRegime.Standard);
    const [discountPercent, setDiscountPercent] = useState<number>(initialOrder?.discount_percent || 0);
    const [isSaving, setIsSaving] = useState(false);
    const [orderNotes, setOrderNotes] = useState(initialOrder?.notes || '');
    const [tags, setTags] = useState<string[]>(initialOrder?.tags || []);

    // --- INPUT STATE ---
    const [input, setInput] = useState('');
    const [suggestions, setSuggestions] = useState<Product[]>([]);
    const [activeMaster, setActiveMaster] = useState<Product | null>(null);
    const [sizeMode, setSizeMode] = useState<{ type: 'Νούμερο' | 'Μήκος', sizes: string[] } | null>(null);
    const [selectedSize, setSelectedSize] = useState('');
    const [itemNotes, setItemNotes] = useState('');
    const [qty, setQty] = useState(1);
    const [showScanner, setShowScanner] = useState(false);
    const [tagInput, setTagInput] = useState('');
    const [showCustSuggestions, setShowCustSuggestions] = useState(false);

    const inputRef = useRef<HTMLInputElement>(null);

    // --- SMART SEARCH LOGIC ---
    useEffect(() => {
        const term = input.trim().toUpperCase();
        if (term.length < 2) {
            setSuggestions([]);
            return;
        }

        const results = products.filter(p => {
            if (p.is_component) return false;
            return p.sku.startsWith(term) || (term.length >= 3 && p.sku.includes(term));
        }).slice(0, 10);

        setSuggestions(results);
    }, [input, products]);

    const handleSelectCustomer = (c: Customer) => {
        setCustomerId(c.id);
        setCustomerName(c.full_name);
        setCustomerPhone(c.phone || '');
        if (c.vat_rate !== undefined && c.vat_rate !== null) {
            setVatRate(c.vat_rate);
        } else {
            setVatRate(VatRegime.Standard);
        }
        setShowCustSuggestions(false);
    };

    const handleSelectMaster = (p: Product) => {
        setActiveMaster(p);
        setInput('');
        setSuggestions([]);
        const sizing = getSizingInfo(p);
        setSizeMode(sizing || null);
        setSelectedSize('');
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

        showToast(`${activeMaster.sku}${variant?.suffix || ''} προστέθηκε`, 'success');

        setActiveMaster(null);
        setQty(1);
        setSelectedSize('');
        setItemNotes('');
        setSizeMode(null);
        setInput('');
    };

    const handleScan = (code: string) => {
        const match = findProductByScannedCode(code, products);
        if (match) {
            const { product, variant } = match;
            if (product.is_component) {
                showToast(`Το ${product.sku} είναι εξάρτημα.`, "error");
                return;
            }

            const unitPrice = variant?.selling_price || product.selling_price || 0;
            const newItem: OrderItem = {
                sku: product.sku,
                variant_suffix: variant?.suffix,
                quantity: 1,
                price_at_order: unitPrice,
                product_details: product
            };

            setItems(prev => {
                const existingIdx = prev.findIndex(i => i.sku === newItem.sku && i.variant_suffix === newItem.variant_suffix && !i.size_info);
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
            showToast(`Μη έγκυρος κωδικός.`, 'error');
        }
    };

    const handleSaveOrder = async () => {
        if (!customerName) { showToast("Το όνομα πελάτη είναι υποχρεωτικό.", 'error'); return; }
        if (items.length === 0) { showToast("Η παραγγελία είναι κενή.", 'error'); return; }
        setIsSaving(true);
        try {
            const orderPayload: Order = {
                id: initialOrder?.id || `ORD-${Date.now()}`,
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
                notes: orderNotes,
                tags: tags
            };
            if (initialOrder) await api.updateOrder(orderPayload);
            else await api.saveOrder(orderPayload);
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            onBack();
        } catch (e) { showToast("Σφάλμα αποθήκευσης", "error"); }
        finally { setIsSaving(false); }
    };

    const subtotal = items.reduce((sum, i) => sum + (i.price_at_order * i.quantity), 0);
    const discountAmount = subtotal * (discountPercent / 100);
    const netAmount = subtotal - discountAmount;
    const vatAmount = netAmount * vatRate;
    const grandTotal = netAmount + vatAmount;

    const filteredCustomers = useMemo(() => {
        if (!customers || !customerName) return [];
        return customers.filter(c => c.full_name.toLowerCase().includes(customerName.toLowerCase())).slice(0, 5);
    }, [customers, customerName]);

    return (
        <div className="flex flex-col h-full bg-slate-50 relative">
            <div className="bg-white p-4 border-b border-slate-200 flex items-center justify-between shadow-sm shrink-0 z-20">
                <button onClick={onBack} className="p-2 -ml-2 text-slate-500"><ArrowLeft size={24} /></button>
                <div className="font-black text-slate-800 text-lg">{initialOrder ? `Επεξεργασία #${initialOrder.id.slice(-6)}` : 'Νέα Παραγγελία'}</div>
                <button onClick={handleSaveOrder} disabled={isSaving} className="bg-[#060b00] text-white p-2 rounded-xl shadow-md disabled:opacity-50">{isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col gap-4 pb-40">

                {/* Customer Section */}
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 space-y-3">
                    <div className="relative">
                        <div className="flex items-center gap-2 mb-2">
                            <User size={16} className="text-slate-400" />
                            <input className="flex-1 outline-none font-bold text-slate-800" placeholder="Όνομα Πελάτη..." value={customerName} onChange={e => { setCustomerName(e.target.value); setShowCustSuggestions(true); if (!e.target.value) setCustomerId(null); }} onFocus={() => setShowCustSuggestions(true)} />
                        </div>
                        {showCustSuggestions && customerName && !customerId && filteredCustomers.length > 0 && (
                            <div className="absolute top-full left-0 right-0 bg-white shadow-xl rounded-xl border border-slate-100 mt-1 z-50 overflow-hidden">
                                {filteredCustomers.map(c => (
                                    <div key={c.id} onClick={() => { handleSelectCustomer(c); }} className="p-3 border-b border-slate-50 font-medium text-sm flex justify-between"><span>{c.full_name}</span><span className="text-slate-400 text-xs">{c.phone}</span></div>
                                ))}
                            </div>
                        )}
                        <div className="flex items-center gap-4 border-t border-slate-50 pt-3">
                            <div className="flex-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">ΦΠΑ</label>
                                <select value={vatRate} onChange={e => setVatRate(parseFloat(e.target.value))} className="w-full p-2 bg-slate-50 rounded-lg text-sm font-bold outline-none border border-slate-100">
                                    <option value={VatRegime.Standard}>24%</option>
                                    <option value={VatRegime.Reduced}>17%</option>
                                    <option value={VatRegime.Zero}>0%</option>
                                </select>
                            </div>
                            <div className="flex-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Έκπτωση (%)</label>
                                <div className="flex items-center gap-2 bg-slate-50 px-2 rounded-lg border border-slate-100">
                                    <input type="number" value={discountPercent} onChange={e => setDiscountPercent(parseFloat(e.target.value) || 0)} className="w-full p-2 bg-transparent text-sm font-bold outline-none text-right" />
                                    <Percent size={14} className="text-slate-400" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Add Item Trigger */}
                {!activeMaster && (
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                        <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                            <Search size={20} className="text-slate-400 ml-1" /><input ref={inputRef} type="text" value={input} onChange={e => setInput(e.target.value.toUpperCase())} placeholder="Αναζήτηση κωδικού..." className="flex-1 bg-transparent p-2 outline-none font-bold text-slate-900 uppercase" /><button onClick={() => setShowScanner(true)} className="p-2 text-slate-400"><Camera size={20} /></button>
                        </div>
                        {suggestions.length > 0 && (
                            <div className="mt-2 space-y-2">
                                {suggestions.map(p => (
                                    <button key={p.sku} onClick={() => handleSelectMaster(p)} className="w-full text-left p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-white rounded-lg overflow-hidden border border-slate-200 flex items-center justify-center">{p.image_url ? <img src={p.image_url} className="w-full h-full object-cover" /> : <ImageIcon size={16} className="text-slate-300" />}</div>
                                            <div><div className="font-black text-slate-800 text-sm">{p.sku}</div><div className="text-[10px] text-slate-500">{p.category}</div></div>
                                        </div>
                                        <ChevronRight size={16} className="text-slate-300" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Selection Details */}
                {activeMaster && (
                    <div className="bg-white p-5 rounded-[2rem] shadow-xl border border-emerald-100 space-y-4 animate-in zoom-in-95">
                        <div className="flex justify-between items-start">
                            <div><h3 className="text-xl font-black text-slate-900">{activeMaster.sku}</h3><p className="text-[10px] text-slate-400 font-bold uppercase">{activeMaster.category}</p></div>
                            <button onClick={() => setActiveMaster(null)} className="p-2 bg-slate-50 rounded-full"><X size={20} /></button>
                        </div>
                        {sizeMode && (
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">Επιλογή {sizeMode.type}</label>
                                <div className="grid grid-cols-5 gap-1.5">
                                    {sizeMode.sizes.map(s => (<button key={s} onClick={() => setSelectedSize(s === selectedSize ? '' : s)} className={`py-1.5 rounded-lg text-xs font-bold border ${selectedSize === s ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>{s}</button>))}
                                </div>
                            </div>
                        )}
                        <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl">
                            <span className="text-xs font-bold text-slate-500 uppercase">Ποσότητα</span>
                            <div className="flex items-center gap-4"><button onClick={() => setQty(Math.max(1, qty - 1))} className="w-8 h-8 bg-white rounded shadow-sm text-slate-700 font-bold">-</button><span className="font-black text-lg">{qty}</span><button onClick={() => setQty(qty + 1)} className="w-8 h-8 bg-white rounded shadow-sm text-slate-700 font-bold">+</button></div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {(!activeMaster.variants || activeMaster.variants.length === 0) && <button onClick={() => handleAddItem(null)} className="w-full bg-emerald-600 text-white py-3 rounded-xl font-black col-span-2">Προσθήκη</button>}
                            {activeMaster.variants?.map(v => (
                                <button key={v.suffix} onClick={() => handleAddItem(v)} className="p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-0.5 active:scale-95 shadow-sm bg-white border-slate-100 hover:border-emerald-500">
                                    <SkuColored sku="" suffix={v.suffix} gender={activeMaster.gender} />
                                    <span className="text-[8px] uppercase font-bold text-slate-400 truncate w-full text-center">{v.description}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Items List */}
                <div className="space-y-2">
                    <h3 className="font-bold text-slate-800 text-xs uppercase tracking-widest ml-1">Περιεχόμενα ({items.length})</h3>
                    {items.map((item, idx) => (
                        <div key={idx} className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm space-y-3">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-slate-50 rounded-xl overflow-hidden border border-slate-100 shrink-0">
                                    {item.product_details?.image_url ? <img src={item.product_details.image_url} className="w-full h-full object-cover" /> : <ImageIcon size={20} className="m-auto text-slate-200" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start">
                                        <SkuColored sku={item.sku} suffix={item.variant_suffix} gender={item.product_details?.gender} />
                                        <button onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-red-300 p-1"><Trash2 size={16} /></button>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[10px] font-bold text-slate-500">{formatCurrency(item.price_at_order)} /τεμ</span>
                                        {item.size_info && <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 rounded border border-blue-100 font-bold">{item.size_info}</span>}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 pt-2 border-t border-slate-50">
                                <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-100 flex-1">
                                    <StickyNote size={14} className="text-slate-300 ml-1" />
                                    <input
                                        className="flex-1 bg-transparent outline-none text-xs text-slate-600 placeholder-slate-300"
                                        placeholder="Σημείωση είδους..."
                                        value={item.notes || ''}
                                        onChange={e => {
                                            const newItems = [...items];
                                            newItems[idx].notes = e.target.value;
                                            setItems(newItems);
                                        }}
                                    />
                                </div>
                                <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg">
                                    <button onClick={() => { const n = [...items]; n[idx].quantity = Math.max(1, n[idx].quantity - 1); setItems(n); }} className="w-6 h-6 bg-white rounded shadow-sm text-slate-600 font-bold">-</button>
                                    <span className="w-4 text-center font-black text-xs">{item.quantity}</span>
                                    <button onClick={() => { const n = [...items]; n[idx].quantity += 1; setItems(n); }} className="w-6 h-6 bg-white rounded shadow-sm text-slate-600 font-bold">+</button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="pt-4 space-y-4">
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase ml-1">Γενικές Σημειώσεις Παραγγελίας</label>
                        <textarea value={orderNotes} onChange={e => setOrderNotes(e.target.value)} className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-sm h-24 resize-none outline-none mt-1 shadow-inner focus:ring-2 focus:ring-slate-200" />
                    </div>
                </div>
            </div>

            {/* Footer Summary */}
            <div className="p-4 bg-white border-t border-slate-200 shrink-0 sticky bottom-0 z-20 shadow-[0_-4px_10px_rgba(0,0,0,0.03)]">
                <div className="flex justify-between items-center mb-3 px-2">
                    <div className="text-slate-500 text-[10px] font-bold uppercase">Σύνολο: {formatCurrency(netAmount)}</div>
                    <div className="text-slate-900 font-black text-xl">{formatCurrency(grandTotal)}</div>
                </div>
                <button onClick={handleSaveOrder} disabled={isSaving} className="w-full bg-[#060b00] text-white py-4 rounded-2xl font-black text-lg shadow-xl active:scale-95 transition-transform flex items-center justify-center gap-3">
                    <Save size={20} /> {initialOrder ? 'Ενημέρωση Παραγγελίας' : 'Αποθήκευση Παραγγελίας'}
                </button>
            </div>

            {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
        </div>
    );
}
