
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, CLOUDFLARE_WORKER_URL, AUTH_KEY_SECRET } from '../../lib/supabase';
import { Offer, OrderStatus, Product, Customer, OrderItem, VatRegime } from '../../types';
import { FileText, Plus, Search, Loader2, ChevronRight, Check, Ban, Trash2, Printer, Edit, X, User, Phone, Coins, Percent, Save, RefreshCw, ScanBarcode, Box, ImageIcon, Minus } from 'lucide-react';
import { useUI } from '../UIProvider';
import { formatCurrency, formatDecimal, calculateProductCost, calculateSuggestedWholesalePrice, findProductByScannedCode } from '../../utils/pricingEngine';
import BarcodeScanner from '../BarcodeScanner';

interface Props {
    onPrintOffer: (offer: Offer) => void;
}

export default function MobileOffers({ onPrintOffer }: Props) {
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    const { data: offers, isLoading: loadingOffers } = useQuery({ queryKey: ['offers'], queryFn: api.getOffers });
    const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: api.getCustomers });
    const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
    const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
    const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });

    const [isCreating, setIsCreating] = useState(false);
    const [editingOffer, setEditingOffer] = useState<Offer | null>(null);
    const [search, setSearch] = useState('');

    // --- BUILDER STATE ---
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerId, setCustomerId] = useState<string | null>(null);
    const [customSilverPrice, setCustomSilverPrice] = useState(0);
    const [discountPercent, setDiscountPercent] = useState(0);
    const [vatRate, setVatRate] = useState<number>(VatRegime.Standard);
    const [offerNotes, setOfferNotes] = useState('');
    const [items, setItems] = useState<OrderItem[]>([]);
    
    // --- INPUT STATE ---
    const [skuInput, setSkuInput] = useState('');
    const [showScanner, setShowScanner] = useState(false);
    const [suggestions, setSuggestions] = useState<Product[]>([]);
    const [isFetchingPrice, setIsFetchingPrice] = useState(false);
    const [showCustomerSearch, setShowCustomerSearch] = useState(false);

    // Initializer
    useEffect(() => {
        if (isCreating && settings && customSilverPrice === 0 && !editingOffer) {
            setCustomSilverPrice(settings.silver_price_gram);
        }
    }, [isCreating, settings]);

    // Recalculate Prices when Silver Changes
    useEffect(() => {
        if (isCreating && items.length > 0 && products && materials && settings) {
            setItems(prev => prev.map(item => {
                const product = products.find(p => p.sku === item.sku);
                if (!product) return item;
                
                const tempSettings = { ...settings, silver_price_gram: customSilverPrice };
                const costCalc = calculateProductCost(product, tempSettings, materials, products);
                const weight = costCalc.breakdown.details?.total_weight || (product.weight_g + (product.secondary_weight_g || 0));
                const newPrice = calculateSuggestedWholesalePrice(weight, costCalc.breakdown.silver, costCalc.breakdown.labor, costCalc.breakdown.materials);
                
                return { ...item, price_at_order: newPrice };
            }));
        }
    }, [customSilverPrice, isCreating]);

    // Filtered Lists
    const filteredOffers = useMemo(() => {
        if (!offers) return [];
        return offers.filter(o => 
            o.customer_name.toLowerCase().includes(search.toLowerCase()) || 
            o.id.toLowerCase().includes(search.toLowerCase())
        );
    }, [offers, search]);

    const filteredCustomers = useMemo(() => {
        if (!customers || !customerName) return [];
        return customers.filter(c => c.full_name.toLowerCase().includes(customerName.toLowerCase())).slice(0, 5);
    }, [customers, customerName]);

    // Actions
    const handleStartCreate = (offer?: Offer) => {
        if (offer) {
            setEditingOffer(offer);
            setCustomerName(offer.customer_name);
            setCustomerPhone(offer.customer_phone || '');
            setCustomerId(offer.customer_id || null);
            setCustomSilverPrice(offer.custom_silver_price);
            setDiscountPercent(offer.discount_percent);
            setVatRate(offer.vat_rate !== undefined ? offer.vat_rate : VatRegime.Standard);
            setOfferNotes(offer.notes || '');
            setItems(JSON.parse(JSON.stringify(offer.items)));
        } else {
            setEditingOffer(null);
            setCustomerName('');
            setCustomerPhone('');
            setCustomerId(null);
            setCustomSilverPrice(settings?.silver_price_gram || 0);
            setDiscountPercent(0);
            setVatRate(VatRegime.Standard);
            setOfferNotes('');
            setItems([]);
        }
        setIsCreating(true);
    };

    const fetchLivePrice = async () => {
        setIsFetchingPrice(true);
        try {
            const response = await fetch(`${CLOUDFLARE_WORKER_URL}/price/silver`, {
                method: 'GET',
                headers: { 'Authorization': AUTH_KEY_SECRET }
            });
            if (!response.ok) throw new Error('API Error');
            const data = await response.json();
            const price = parseFloat(data.price.toFixed(3));
            setCustomSilverPrice(price);
            showToast(`Τιμή: ${formatDecimal(price, 3)} €/g`, 'success');
        } catch (e) {
            showToast("Σφάλμα λήψης τιμής.", "error");
        } finally {
            setIsFetchingPrice(false);
        }
    };

    const handleSearchInput = (val: string) => {
        setSkuInput(val);
        if (!products) return;
        const term = val.toUpperCase();
        if (term.length < 2) { setSuggestions([]); return; }
        
        const numericMatch = term.match(/\d+/);
        const numberTerm = numericMatch ? numericMatch[0] : null;

        const results = products.filter(p => {
            if (p.is_component) return false;
            if (p.sku.startsWith(term)) return true;
            if (numberTerm && numberTerm.length >= 3 && p.sku.includes(numberTerm)) return true;
            return false;
        }).slice(0, 5);
        setSuggestions(results);
    };

    const addItem = (product: Product, variantSuffix?: string) => {
        if (!products || !materials || !settings) return;
        
        const tempSettings = { ...settings, silver_price_gram: customSilverPrice };
        const costCalc = calculateProductCost(product, tempSettings, materials, products);
        const weight = costCalc.breakdown.details?.total_weight || (product.weight_g + (product.secondary_weight_g || 0));
        const unitPrice = calculateSuggestedWholesalePrice(weight, costCalc.breakdown.silver, costCalc.breakdown.labor, costCalc.breakdown.materials);

        const newItem: OrderItem = {
            sku: product.sku,
            variant_suffix: variantSuffix,
            quantity: 1,
            price_at_order: unitPrice,
            product_details: product
        };

        setItems(prev => {
            const existing = prev.findIndex(i => i.sku === newItem.sku && i.variant_suffix === newItem.variant_suffix);
            if (existing >= 0) {
                const updated = [...prev];
                updated[existing].quantity += 1;
                return updated;
            }
            return [newItem, ...prev];
        });
        
        setSkuInput('');
        setSuggestions([]);
        showToast("Προστέθηκε.", "success");
    };

    const handleScan = (code: string) => {
        if (!products) return;
        const match = findProductByScannedCode(code, products);
        if (match && !match.product.is_component) {
            addItem(match.product, match.variant?.suffix);
            setShowScanner(false);
        } else {
            showToast("Δεν βρέθηκε ή είναι εξάρτημα.", "error");
        }
    };

    const handleSave = async () => {
        if (!customerName) { showToast("Εισάγετε πελάτη.", "error"); return; }
        if (items.length === 0) { showToast("Προσθέστε είδη.", "error"); return; }

        const subtotal = items.reduce((sum, i) => sum + (i.price_at_order * i.quantity), 0);
        const discountAmt = subtotal * (discountPercent / 100);
        const total = (subtotal - discountAmt) * (1 + vatRate);

        const payload: Offer = {
            id: editingOffer?.id || crypto.randomUUID(),
            customer_name: customerName,
            customer_phone: customerPhone,
            customer_id: customerId || undefined,
            items,
            custom_silver_price: customSilverPrice,
            discount_percent: discountPercent,
            vat_rate: vatRate,
            total_price: total,
            status: editingOffer?.status || 'Pending',
            created_at: editingOffer?.created_at || new Date().toISOString(),
            notes: offerNotes
        };

        try {
            if (editingOffer) await api.updateOffer(payload);
            else await api.saveOffer(payload);
            queryClient.invalidateQueries({ queryKey: ['offers'] });
            setIsCreating(false);
            showToast("Αποθηκεύτηκε.", "success");
        } catch (e) {
            showToast("Σφάλμα αποθήκευσης.", "error");
        }
    };

    const handleConvert = async (offer: Offer) => {
        if (!await confirm({ title: 'Μετατροπή', message: 'Δημιουργία παραγγελίας από προσφορά;', confirmText: 'Ναι' })) return;
        try {
             // Create Order Logic
             const now = new Date();
             const year = now.getFullYear().toString().slice(-2);
             const month = (now.getMonth() + 1).toString().padStart(2, '0');
             const day = now.getDate().toString().padStart(2, '0');
             const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
             const newOrderId = `ORD-${year}${month}${day}-${random}`;

             await api.saveOrder({
                 id: newOrderId,
                 customer_id: offer.customer_id,
                 customer_name: offer.customer_name,
                 customer_phone: offer.customer_phone,
                 created_at: new Date().toISOString(),
                 status: 'Pending',
                 items: offer.items,
                 total_price: offer.total_price,
                 notes: `From Offer #${offer.id.slice(0,6)}. ${offer.notes || ''}`,
                 custom_silver_rate: offer.custom_silver_price,
                 vat_rate: offer.vat_rate
             } as any);

             await api.updateOffer({ ...offer, status: 'Accepted' });
             queryClient.invalidateQueries({ queryKey: ['offers'] });
             queryClient.invalidateQueries({ queryKey: ['orders'] });
             showToast("Η παραγγελία δημιουργήθηκε!", "success");
        } catch (e) {
            showToast("Σφάλμα μετατροπής.", "error");
        }
    };

    const handleDecline = async (offer: Offer) => {
        if (!await confirm({ title: 'Απόρριψη', message: 'Απόρριψη προσφοράς;', isDestructive: true })) return;
        await api.updateOffer({ ...offer, status: 'Declined' });
        queryClient.invalidateQueries({ queryKey: ['offers'] });
    };

    const handleDelete = async (id: string) => {
        if (!await confirm({ title: 'Διαγραφή', message: 'Οριστική διαγραφή;', isDestructive: true })) return;
        await api.deleteOffer(id);
        queryClient.invalidateQueries({ queryKey: ['offers'] });
    };

    // --- RENDER BUILDER ---
    if (isCreating) {
        const subtotal = items.reduce((sum, i) => sum + (i.price_at_order * i.quantity), 0);
        const grandTotal = (subtotal * (1 - discountPercent/100)) * (1 + vatRate);

        return (
            <div className="flex flex-col h-full bg-slate-50">
                <div className="p-4 bg-white border-b border-slate-100 flex justify-between items-center shadow-sm shrink-0">
                    <h2 className="text-lg font-black text-slate-800">{editingOffer ? 'Επεξεργασία' : 'Νέα Προσφορά'}</h2>
                    <button onClick={() => setIsCreating(false)} className="p-2 bg-slate-100 rounded-full text-slate-500"><X size={20}/></button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
                    {/* Customer */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-3">
                        <div className="relative">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Πελάτης</label>
                            <div className="flex items-center gap-2">
                                <User size={16} className="text-slate-400"/>
                                <input 
                                    className="flex-1 p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:border-purple-400"
                                    placeholder="Αναζήτηση..."
                                    value={customerName}
                                    onChange={e => { setCustomerName(e.target.value); setShowCustomerSearch(true); }}
                                    onFocus={() => setShowCustomerSearch(true)}
                                />
                            </div>
                            {showCustomerSearch && customerName && filteredCustomers.length > 0 && (
                                <div className="absolute top-full left-0 right-0 bg-white shadow-xl rounded-xl border border-slate-100 mt-1 z-50 overflow-hidden">
                                    {filteredCustomers.map(c => (
                                        <div key={c.id} onClick={() => { setCustomerId(c.id); setCustomerName(c.full_name); setCustomerPhone(c.phone||''); setShowCustomerSearch(false); }} className="p-3 border-b border-slate-50 font-medium text-sm">
                                            {c.full_name}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <Phone size={16} className="text-slate-400"/>
                            <input className="flex-1 p-2 bg-slate-50 border border-slate-200 rounded-xl text-sm" placeholder="Τηλέφωνο" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}/>
                        </div>
                    </div>

                    {/* Pricing Config */}
                    <div className="bg-purple-50 p-4 rounded-2xl border border-purple-100 space-y-3">
                        <label className="text-xs font-black text-purple-800 uppercase flex items-center gap-2"><Coins size={14}/> Ρυθμίσεις Τιμής</label>
                        <div className="flex gap-2 items-center">
                            <div className="flex-1">
                                <label className="text-[10px] text-purple-600 font-bold uppercase">Ασήμι (€/g)</label>
                                <div className="flex gap-1">
                                    <input type="number" className="w-full p-2 rounded-lg font-mono font-bold text-purple-900 border border-purple-200" value={customSilverPrice} onChange={e => setCustomSilverPrice(parseFloat(e.target.value)||0)}/>
                                    <button onClick={fetchLivePrice} disabled={isFetchingPrice} className="p-2 bg-purple-200 text-purple-800 rounded-lg">{isFetchingPrice ? <Loader2 size={16} className="animate-spin"/> : <RefreshCw size={16}/>}</button>
                                </div>
                            </div>
                            <div className="flex-1">
                                <label className="text-[10px] text-purple-600 font-bold uppercase">Έκπτωση %</label>
                                <div className="relative">
                                    <input type="number" className="w-full p-2 rounded-lg font-mono font-bold text-purple-900 border border-purple-200 pr-6" value={discountPercent} onChange={e => setDiscountPercent(parseFloat(e.target.value)||0)}/>
                                    <Percent size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-purple-400"/>
                                </div>
                            </div>
                        </div>
                         <div>
                            <label className="text-[10px] text-purple-600 font-bold uppercase">ΦΠΑ</label>
                            <select value={vatRate} onChange={e => setVatRate(parseFloat(e.target.value))} className="w-full p-2 rounded-lg font-bold text-purple-900 border border-purple-200 text-sm bg-white">
                                <option value={0.24}>24%</option>
                                <option value={0.17}>17%</option>
                                <option value={0}>0%</option>
                            </select>
                        </div>
                    </div>

                    {/* Add Items */}
                    <div className="space-y-2">
                        <label className="text-xs font-black text-slate-400 uppercase">Προσθήκη Ειδών</label>
                        <div className="relative">
                            <input 
                                className="w-full pl-10 p-3 bg-white border border-slate-200 rounded-xl outline-none font-bold text-slate-800 uppercase placeholder-slate-300 focus:ring-2 focus:ring-purple-500/20"
                                placeholder="SKU..."
                                value={skuInput}
                                onChange={e => handleSearchInput(e.target.value)}
                            />
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                            <button onClick={() => setShowScanner(true)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-slate-100 rounded-lg text-slate-500"><ScanBarcode size={18}/></button>
                            
                            {suggestions.length > 0 && (
                                <div className="absolute top-full left-0 right-0 bg-white shadow-xl rounded-xl border border-slate-100 mt-2 z-50 overflow-hidden max-h-48 overflow-y-auto">
                                    {suggestions.map(p => (
                                        <div key={p.sku} onClick={() => addItem(p)} className="p-3 border-b border-slate-50 flex items-center justify-between hover:bg-slate-50 cursor-pointer">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 bg-slate-100 rounded overflow-hidden">{p.image_url ? <img src={p.image_url} className="w-full h-full object-cover"/> : <ImageIcon size={14} className="m-auto text-slate-400"/>}</div>
                                                <div><div className="font-bold text-sm text-slate-800">{p.sku}</div><div className="text-[10px] text-slate-400">{p.category}</div></div>
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
                            <div key={idx} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 bg-slate-50 rounded-lg overflow-hidden shrink-0">{item.product_details?.image_url && <img src={item.product_details.image_url} className="w-full h-full object-cover"/>}</div>
                                    <div className="min-w-0">
                                        <div className="font-black text-slate-800 text-sm truncate">{item.sku}{item.variant_suffix}</div>
                                        <div className="text-[10px] font-mono text-slate-500">{formatCurrency(item.price_at_order)}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <input type="number" min="1" className="w-10 text-center bg-slate-50 rounded border border-slate-200 font-bold" value={item.quantity} onChange={e => {
                                        const qty = parseInt(e.target.value) || 1;
                                        setItems(prev => prev.map((it, i) => i === idx ? {...it, quantity: qty} : it));
                                    }}/>
                                    <button onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))} className="text-red-400"><Trash2 size={16}/></button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="h-12"/>
                </div>

                {/* Footer Actions */}
                <div className="p-4 bg-white border-t border-slate-200 shrink-0 sticky bottom-0 z-20">
                    <div className="flex justify-between items-center mb-3">
                        <span className="text-xs font-bold text-slate-500 uppercase">Σύνολο</span>
                        <span className="text-2xl font-black text-purple-700">{formatCurrency(grandTotal)}</span>
                    </div>
                    <button onClick={handleSave} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 active:scale-95">
                        <Save size={18}/> Αποθήκευση
                    </button>
                </div>

                {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
            </div>
        );
    }

    // --- LIST VIEW ---
    return (
        <div className="p-4 h-full flex flex-col">
            <div className="flex justify-between items-center mb-4 shrink-0">
                <h1 className="text-2xl font-black text-slate-900">Προσφορές</h1>
                <button onClick={() => handleStartCreate()} className="bg-[#060b00] text-white p-2 rounded-xl shadow-md active:scale-95"><Plus size={24}/></button>
            </div>

            <div className="relative mb-4 shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                    type="text" placeholder="Αναζήτηση..." value={search} onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500/20 shadow-sm font-medium"
                />
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pb-24 custom-scrollbar">
                {filteredOffers.map(o => (
                    <div key={o.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm active:scale-[0.98] transition-all">
                        <div 
                            onClick={() => handleStartCreate(o)}
                            className="flex justify-between items-start mb-2"
                        >
                            <div>
                                <div className="font-bold text-slate-800">{o.customer_name}</div>
                                <div className="text-[10px] text-slate-400">{new Date(o.created_at).toLocaleDateString('el-GR')}</div>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase ${
                                o.status === 'Accepted' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                                o.status === 'Declined' ? 'bg-slate-100 text-slate-500 border-slate-200' :
                                'bg-amber-50 text-amber-600 border-amber-200'
                            }`}>
                                {o.status === 'Pending' ? 'Εκκρεμεί' : (o.status === 'Accepted' ? 'Εγκρίθηκε' : 'Απορρίφθηκε')}
                            </span>
                        </div>
                        <div className="flex justify-between items-end border-t border-slate-50 pt-2 mt-2">
                            <div className="flex gap-1">
                                <button onClick={() => onPrintOffer(o)} className="p-1.5 bg-slate-50 text-slate-500 rounded-lg"><Printer size={16}/></button>
                                {o.status === 'Pending' && (
                                    <>
                                        <button onClick={() => handleConvert(o)} className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg"><Check size={16}/></button>
                                        <button onClick={() => handleDecline(o)} className="p-1.5 bg-slate-50 text-slate-500 rounded-lg"><Ban size={16}/></button>
                                    </>
                                )}
                                <button onClick={() => handleDelete(o.id)} className="p-1.5 bg-red-50 text-red-500 rounded-lg"><Trash2 size={16}/></button>
                            </div>
                            <div className="font-black text-slate-900 text-lg">{formatCurrency(o.total_price)}</div>
                        </div>
                    </div>
                ))}
                {filteredOffers.length === 0 && <div className="text-center py-10 text-slate-400 text-sm font-medium">Δεν βρέθηκαν προσφορές.</div>}
            </div>
        </div>
    );
}
