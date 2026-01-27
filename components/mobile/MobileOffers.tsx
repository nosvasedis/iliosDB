
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, CLOUDFLARE_WORKER_URL, AUTH_KEY_SECRET } from '../../lib/supabase';
import { Offer, Product, Customer, OrderItem, VatRegime } from '../../types';
import { 
    Plus, Search, Trash2, Printer, Save, FileText, User, Phone, Check, RefreshCw, 
    Loader2, ChevronRight, X, ArrowLeft, Coins, Percent, MoreHorizontal, Ban, ShoppingCart, ScanBarcode, Box, Image as ImageIcon,
    Settings, ListPlus, FolderKanban
} from 'lucide-react';
import { useUI } from '../UIProvider';
import { formatCurrency, formatDecimal, calculateProductCost, calculateSuggestedWholesalePrice, findProductByScannedCode, expandSkuRange } from '../../utils/pricingEngine';
import BarcodeScanner from '../BarcodeScanner';

interface Props {
    onPrintOffer: (offer: Offer) => void;
}

const STATUS_LABELS: Record<string, string> = {
    'Pending': 'Εκκρεμεί',
    'Accepted': 'Εγκρίθηκε',
    'Declined': 'Απορρίφθηκε'
};

const STATUS_STYLES: Record<string, string> = {
    'Pending': 'bg-amber-50 text-amber-700 border-amber-200',
    'Accepted': 'bg-emerald-50 text-emerald-700 border-emerald-200',
    'Declined': 'bg-red-50 text-red-700 border-red-200'
};

export default function MobileOffers({ onPrintOffer }: Props) {
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    
    // Data Queries
    const { data: offers, isLoading: loadingOffers } = useQuery({ queryKey: ['offers'], queryFn: api.getOffers });
    const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: api.getCustomers });
    const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
    const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
    const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
    const { data: collections } = useQuery({ queryKey: ['collections'], queryFn: api.getCollections });

    // UI State
    const [view, setView] = useState<'list' | 'builder'>('list');
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('ALL');
    
    // --- BUILDER STATE ---
    const [editingId, setEditingId] = useState<string | null>(null);
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerId, setCustomerId] = useState<string | null>(null);
    const [customSilverPrice, setCustomSilverPrice] = useState<number>(0);
    const [discountPercent, setDiscountPercent] = useState<number>(0);
    const [vatRate, setVatRate] = useState<number>(VatRegime.Standard);
    const [notes, setNotes] = useState('');
    const [items, setItems] = useState<OrderItem[]>([]);
    
    // --- BUILDER UI STATE ---
    const [showScanner, setShowScanner] = useState(false);
    const [skuInput, setSkuInput] = useState('');
    const [qtyInput, setQtyInput] = useState(1);
    const [showSettings, setShowSettings] = useState(false); // Toggle for pricing settings
    const [isFetchingPrice, setIsFetchingPrice] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    
    // Customer Search State
    const [showCustSuggestions, setShowCustSuggestions] = useState(false);

    // Collection Import State
    const [showCollectionImport, setShowCollectionImport] = useState(false);

    // Initialize Builder
    const initBuilder = (offer?: Offer) => {
        if (offer) {
            setEditingId(offer.id);
            setCustomerName(offer.customer_name);
            setCustomerPhone(offer.customer_phone || '');
            setCustomerId(offer.customer_id || null);
            setCustomSilverPrice(offer.custom_silver_price);
            setDiscountPercent(offer.discount_percent);
            setVatRate(offer.vat_rate !== undefined ? offer.vat_rate : VatRegime.Standard);
            setNotes(offer.notes || '');
            setItems(offer.items ? JSON.parse(JSON.stringify(offer.items)) : []); // Deep copy, safety check
        } else {
            setEditingId(null);
            setCustomerName('');
            setCustomerPhone('');
            setCustomerId(null);
            setCustomSilverPrice(settings?.silver_price_gram || 0);
            setDiscountPercent(0);
            setVatRate(VatRegime.Standard);
            setNotes('');
            setItems([]);
        }
        setView('builder');
        setShowSettings(true); // Open settings by default for new offers
    };

    // Filter Logic
    const filteredOffers = useMemo(() => {
        if (!offers) return [];
        return offers.filter(o => {
            const matchesSearch = o.customer_name.toLowerCase().includes(search.toLowerCase()) || o.id.includes(search);
            const matchesStatus = filterStatus === 'ALL' || o.status === filterStatus;
            return matchesSearch && matchesStatus;
        });
    }, [offers, search, filterStatus]);

    const filteredCustomers = useMemo(() => {
        if (!customers || !customerName) return [];
        return customers.filter(c => c.full_name.toLowerCase().includes(customerName.toLowerCase())).slice(0, 5);
    }, [customers, customerName]);

    // --- ACTIONS ---

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

    const handleAddItem = (code: string) => {
        if (!products || !materials || !settings) return;
        
        const expandedSkus = expandSkuRange(code.toUpperCase());
        let addedCount = 0;
        const newItems = [...items];

        for (const rawSku of expandedSkus) {
            const match = findProductByScannedCode(rawSku, products);
            if (match && !match.product.is_component) {
                 const { product, variant } = match;
                 
                 // Calculate Dynamic Price based on Offer's Silver Price
                 const tempSettings = { ...settings, silver_price_gram: customSilverPrice };
                 const costCalc = calculateProductCost(product, tempSettings, materials, products);
                 const weight = costCalc.breakdown.details?.total_weight || (product.weight_g + (product.secondary_weight_g || 0));
                 const unitPrice = calculateSuggestedWholesalePrice(weight, costCalc.breakdown.silver, costCalc.breakdown.labor, costCalc.breakdown.materials);
                 
                 // Check if exists
                 const existingIdx = newItems.findIndex(i => i.sku === product.sku && i.variant_suffix === variant?.suffix);
                 if (existingIdx >= 0) {
                     newItems[existingIdx].quantity += qtyInput;
                 } else {
                     newItems.push({
                         sku: product.sku,
                         variant_suffix: variant?.suffix,
                         quantity: qtyInput,
                         price_at_order: unitPrice,
                         product_details: product
                     });
                 }
                 addedCount++;
            }
        }

        if (addedCount > 0) {
            setItems(newItems);
            setSkuInput('');
            setQtyInput(1);
            showToast(`Προστέθηκαν ${addedCount} είδη.`, 'success');
        } else {
            showToast('Δεν βρέθηκαν κωδικοί.', 'error');
        }
    };

    const handleImportCollection = (collectionId: number) => {
        if (!products || !materials || !settings) return;
        const collectionProducts = products.filter(p => p.collections?.includes(collectionId) && !p.is_component);
        
        if (collectionProducts.length === 0) {
            showToast("Η συλλογή είναι κενή.", "info");
            return;
        }

        const newItems = [...items];
        let addedCount = 0;

        collectionProducts.forEach(p => {
             const tempSettings = { ...settings, silver_price_gram: customSilverPrice };
             const costCalc = calculateProductCost(p, tempSettings, materials, products);
             const weight = costCalc.breakdown.details?.total_weight || (p.weight_g + (p.secondary_weight_g || 0));
             const unitPrice = calculateSuggestedWholesalePrice(weight, costCalc.breakdown.silver, costCalc.breakdown.labor, costCalc.breakdown.materials);

            if (p.variants && p.variants.length > 0) {
                p.variants.forEach(v => {
                    const existingIdx = newItems.findIndex(i => i.sku === p.sku && i.variant_suffix === v.suffix);
                    if (existingIdx === -1) { 
                        newItems.push({
                            sku: p.sku,
                            variant_suffix: v.suffix,
                            quantity: 1,
                            price_at_order: unitPrice,
                            product_details: p
                        });
                        addedCount++;
                    }
                });
            } else {
                const existingIdx = newItems.findIndex(i => i.sku === p.sku && !i.variant_suffix);
                if (existingIdx === -1) {
                     newItems.push({
                        sku: p.sku,
                        variant_suffix: undefined,
                        quantity: 1,
                        price_at_order: unitPrice,
                        product_details: p
                    });
                    addedCount++;
                }
            }
        });
        
        setItems(newItems);
        setShowCollectionImport(false);
        showToast(`Εισήχθησαν ${addedCount} είδη.`, "success");
    };

    const recalculateAllPrices = () => {
        if (!products || !materials || !settings) return;
        const updatedItems = items.map(item => {
            const product = products.find(p => p.sku === item.sku);
            if (!product) return item;
            
            const tempSettings = { ...settings, silver_price_gram: customSilverPrice };
            const costCalc = calculateProductCost(product, tempSettings, materials, products);
            const weight = costCalc.breakdown.details?.total_weight || (product.weight_g + (product.secondary_weight_g || 0));
            const newPrice = calculateSuggestedWholesalePrice(weight, costCalc.breakdown.silver, costCalc.breakdown.labor, costCalc.breakdown.materials);
            
            return { ...item, price_at_order: newPrice };
        });
        setItems(updatedItems);
        showToast("Οι τιμές ενημερώθηκαν.", "success");
    };

    const removeItem = (index: number) => {
        setItems(prev => prev.filter((_, i) => i !== index));
    };

    // Calculate totals for rendering (prevent crash)
    const subtotal = items.reduce((acc, item) => acc + (item.price_at_order * item.quantity), 0);
    const discountAmount = subtotal * (discountPercent / 100);
    const vatAmount = (subtotal - discountAmount) * vatRate;
    const grandTotal = (subtotal - discountAmount) + vatAmount;

    const handleSave = async () => {
        if (!customerName) { showToast("Εισάγετε όνομα πελάτη.", "error"); return; }
        if (items.length === 0) { showToast("Προσθέστε τουλάχιστον ένα είδος.", "error"); return; }
        
        setIsSaving(true);
        
        const payload: Offer = {
            id: editingId || crypto.randomUUID(),
            customer_name: customerName,
            customer_phone: customerPhone,
            customer_id: customerId || undefined,
            items: items,
            custom_silver_price: customSilverPrice,
            discount_percent: discountPercent,
            vat_rate: vatRate,
            total_price: grandTotal,
            status: editingId ? (offers?.find(o => o.id === editingId)?.status || 'Pending') : 'Pending',
            created_at: editingId ? (offers?.find(o => o.id === editingId)?.created_at || new Date().toISOString()) : new Date().toISOString(),
            notes: notes
        };

        try {
            if (editingId) await api.updateOffer(payload);
            else await api.saveOffer(payload);
            
            await queryClient.invalidateQueries({ queryKey: ['offers'] });
            showToast("Η προσφορά αποθηκεύτηκε.", "success");
            setView('list');
        } catch (e) {
            showToast("Σφάλμα αποθήκευσης.", "error");
        } finally {
            setIsSaving(false);
        }
    };

    const handleConvert = async (offer: Offer) => {
        if (!await confirm({ title: 'Μετατροπή', message: 'Δημιουργία παραγγελίας; Η τιμή του ασημιού θα κλειδωθεί.', confirmText: 'Ναι' })) return;
        try {
            const now = new Date();
            const orderId = `ORD-${now.getFullYear().toString().slice(-2)}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}-${Math.floor(Math.random()*1000).toString().padStart(3,'0')}`;
            
            await api.saveOrder({
                id: orderId,
                customer_id: offer.customer_id,
                customer_name: offer.customer_name,
                customer_phone: offer.customer_phone,
                created_at: new Date().toISOString(),
                status: 'Pending',
                items: offer.items,
                total_price: offer.total_price,
                vat_rate: offer.vat_rate,
                discount_percent: offer.discount_percent,
                custom_silver_rate: offer.custom_silver_price,
                notes: `From Offer #${offer.id.slice(0,6)}. ${offer.notes || ''}`
            } as any);

            await api.updateOffer({ ...offer, status: 'Accepted' });
            queryClient.invalidateQueries({ queryKey: ['offers'] });
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            showToast("Η παραγγελία δημιουργήθηκε!", "success");
        } catch (e) {
            showToast("Σφάλμα μετατροπής.", "error");
        }
    };

    const handleDeclineOffer = async (offer: Offer) => {
        if (!await confirm({ title: 'Απόρριψη', message: 'Σήμανση προσφοράς ως απορριφθείσα;', isDestructive: true })) return;
        try {
            await api.updateOffer({ ...offer, status: 'Declined' });
            queryClient.invalidateQueries({ queryKey: ['offers'] });
            showToast("Η προσφορά απορρίφθηκε.", "info");
        } catch (e) { showToast("Σφάλμα.", "error"); }
    };

    const handleDeleteOffer = async (id: string) => {
        if (!await confirm({ title: 'Διαγραφή', message: 'Οριστική διαγραφή;', isDestructive: true })) return;
        try {
            await api.deleteOffer(id);
            queryClient.invalidateQueries({ queryKey: ['offers'] });
            showToast("Διαγράφηκε.", "success");
        } catch (e) { showToast("Σφάλμα.", "error"); }
    };

    // ---------------- UI RENDERING ----------------

    if (loadingOffers) return <div className="p-12 text-center text-slate-400">Φόρτωση προσφορών...</div>;

    // BUILDER VIEW
    if (view === 'builder') {
        return (
            <div className="flex flex-col h-full bg-slate-50 relative">
                {/* Header */}
                <div className="bg-white p-4 border-b border-slate-200 flex justify-between items-center shadow-sm z-20">
                    <button onClick={() => setView('list')} className="p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-full"><ArrowLeft size={24}/></button>
                    <h2 className="text-lg font-black text-slate-800">{editingId ? 'Επεξεργασία' : 'Νέα Προσφορά'}</h2>
                    <button onClick={handleSave} disabled={isSaving} className="bg-purple-600 text-white p-2 rounded-xl shadow-md disabled:opacity-50"><Save size={20}/></button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 pb-32">
                    
                    {/* Customer Section */}
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                        <div className="flex items-center gap-2 mb-2">
                            <User size={16} className="text-purple-600"/>
                            <span className="text-xs font-black text-slate-500 uppercase tracking-wide">Πελάτης</span>
                        </div>
                        <div className="relative z-20">
                            <input 
                                value={customerName}
                                onChange={e => { setCustomerName(e.target.value); setShowCustSuggestions(true); }}
                                placeholder="Αναζήτηση ή Όνομα..."
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:border-purple-400"
                                onFocus={() => setShowCustSuggestions(true)}
                            />
                            {showCustSuggestions && customerName && !customerId && filteredCustomers.length > 0 && (
                                <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl mt-1 overflow-hidden z-30">
                                    {filteredCustomers.map(c => (
                                        <div key={c.id} onClick={() => { handleSelectCustomer(c); }} className="p-3 hover:bg-slate-50 border-b border-slate-50 font-medium text-sm cursor-pointer">
                                            {c.full_name}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                            <Phone size={14} className="text-slate-400"/>
                            <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="Τηλέφωνο" className="flex-1 p-2 bg-transparent border-b border-slate-200 outline-none text-sm font-medium"/>
                        </div>
                    </div>

                    {/* Pricing Settings (Accordion) */}
                    <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100">
                        <div className="flex justify-between items-center" onClick={() => setShowSettings(!showSettings)}>
                            <div className="flex items-center gap-2">
                                <Coins size={16} className="text-amber-600"/>
                                <span className="text-xs font-black text-amber-700 uppercase tracking-wide">Τιμολόγηση</span>
                            </div>
                            <button className="text-amber-600">{showSettings ? <X size={16}/> : <Settings size={16}/>}</button>
                        </div>
                        
                        {showSettings && (
                            <div className="mt-4 space-y-3 animate-in slide-in-from-top-2">
                                <div>
                                    <label className="text-[10px] font-bold text-amber-600 uppercase block mb-1">Τιμή Ασημιού (€/g)</label>
                                    <div className="flex gap-2">
                                        <input 
                                            type="number" step="0.01" 
                                            value={customSilverPrice} 
                                            onChange={e => setCustomSilverPrice(parseFloat(e.target.value) || 0)} 
                                            className="flex-1 p-2 bg-white border border-amber-200 rounded-lg font-mono font-bold text-amber-900 outline-none text-center"
                                        />
                                        <button onClick={fetchLivePrice} disabled={isFetchingPrice} className="p-2 bg-amber-200 text-amber-800 rounded-lg">
                                            {isFetchingPrice ? <Loader2 size={16} className="animate-spin"/> : <RefreshCw size={16}/>}
                                        </button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] font-bold text-amber-600 uppercase block mb-1">Έκπτωση (%)</label>
                                        <div className="relative">
                                            <input type="number" value={discountPercent} onChange={e => setDiscountPercent(parseFloat(e.target.value) || 0)} className="w-full p-2 bg-white border border-amber-200 rounded-lg font-bold text-amber-900 outline-none text-center"/>
                                            <Percent size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-amber-400"/>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-amber-600 uppercase block mb-1">ΦΠΑ</label>
                                        <select value={vatRate} onChange={e => setVatRate(parseFloat(e.target.value))} className="w-full p-2 bg-white border border-amber-200 rounded-lg font-bold text-xs text-amber-900 outline-none">
                                            <option value={VatRegime.Standard}>24%</option>
                                            <option value={VatRegime.Reduced}>17%</option>
                                            <option value={VatRegime.Zero}>0%</option>
                                        </select>
                                    </div>
                                </div>
                                <button onClick={recalculateAllPrices} className="w-full py-2 bg-white border border-amber-200 text-amber-700 rounded-xl text-xs font-bold flex items-center justify-center gap-2 active:bg-amber-100">
                                    <RefreshCw size={12}/> Επαναϋπολογισμός Τιμών
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Add Items */}
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 space-y-3">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-wide flex items-center gap-2"><ListPlus size={16}/> Προσθήκη Ειδών</label>
                        <div className="flex gap-2">
                            <input 
                                value={skuInput}
                                onChange={e => setSkuInput(e.target.value.toUpperCase())}
                                onKeyDown={e => e.key === 'Enter' && handleAddItem(skuInput)}
                                placeholder="SKU ή Εύρος..."
                                className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold outline-none uppercase focus:ring-2 focus:ring-purple-500/20"
                            />
                            <button onClick={() => setShowScanner(true)} className="p-3 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200"><ScanBarcode size={20}/></button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                             <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                                <span className="text-[10px] font-bold text-slate-500 uppercase ml-1">ΠΟΣ.</span>
                                <input type="number" min="1" value={qtyInput} onChange={e => setQtyInput(parseInt(e.target.value) || 1)} className="flex-1 bg-transparent font-black text-center outline-none text-slate-900"/>
                             </div>
                             <button onClick={() => handleAddItem(skuInput)} className="bg-purple-600 text-white rounded-xl font-bold text-sm shadow-md active:scale-95">Προσθήκη</button>
                        </div>
                        
                        <div className="pt-2 border-t border-slate-50">
                             <button onClick={() => setShowCollectionImport(!showCollectionImport)} className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-purple-600 bg-purple-50 rounded-xl border border-purple-100">
                                 <FolderKanban size={14}/> Εισαγωγή από Συλλογή
                             </button>
                             {showCollectionImport && (
                                 <div className="mt-2 space-y-1 max-h-40 overflow-y-auto custom-scrollbar border border-purple-100 rounded-xl bg-purple-50/50 p-1">
                                     {collections?.map(c => (
                                         <button key={c.id} onClick={() => handleImportCollection(c.id)} className="w-full text-left p-2 hover:bg-white rounded-lg text-xs font-medium text-slate-700 truncate">
                                             {c.name}
                                         </button>
                                     ))}
                                 </div>
                             )}
                        </div>
                    </div>

                    {/* Items List */}
                    <div className="space-y-2">
                        {items.map((item, idx) => (
                            <div key={idx} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex flex-col gap-2">
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 shrink-0">
                                            {item.product_details?.image_url ? <img src={item.product_details.image_url} className="w-full h-full object-cover"/> : <ImageIcon size={16} className="m-auto text-slate-300"/>}
                                        </div>
                                        <div>
                                            <div className="font-black text-slate-800 text-sm">{item.sku}{item.variant_suffix}</div>
                                            <div className="text-[10px] text-slate-500 font-mono">{formatCurrency(item.price_at_order)} /τεμ</div>
                                        </div>
                                    </div>
                                    <button onClick={() => removeItem(idx)} className="text-red-400 p-1"><X size={16}/></button>
                                </div>
                                <div className="flex justify-between items-center bg-slate-50 p-2 rounded-lg border border-slate-100">
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => setItems(prev => { const n = [...prev]; n[idx].quantity = Math.max(1, n[idx].quantity - 1); return n; })} className="w-6 h-6 bg-white rounded flex items-center justify-center shadow-sm font-bold text-slate-600">-</button>
                                        <span className="font-black text-sm w-6 text-center">{item.quantity}</span>
                                        <button onClick={() => setItems(prev => { const n = [...prev]; n[idx].quantity += 1; return n; })} className="w-6 h-6 bg-white rounded flex items-center justify-center shadow-sm font-bold text-slate-600">+</button>
                                    </div>
                                    <div className="font-black text-slate-900">{formatCurrency(item.price_at_order * item.quantity)}</div>
                                </div>
                            </div>
                        ))}
                        {items.length === 0 && <div className="text-center py-8 text-slate-400 text-xs italic">Η λίστα είναι κενή.</div>}
                    </div>

                    <div className="mt-4">
                        <label className="text-xs font-bold text-slate-400 uppercase ml-1">Σημειώσεις</label>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none text-sm h-20 resize-none mt-1" placeholder="Εσωτερικές σημειώσεις..."/>
                    </div>
                </div>

                {/* Footer Totals */}
                <div className="bg-white border-t border-slate-200 p-4 shrink-0 shadow-lg z-20">
                    <div className="flex justify-between items-center text-xs text-slate-500 mb-1">
                        <span>Υποσύνολο</span>
                        <span className="font-mono font-bold text-slate-800">{formatCurrency(subtotal)}</span>
                    </div>
                    {discountPercent > 0 && (
                        <div className="flex justify-between items-center text-xs text-red-500 mb-1">
                            <span>Έκπτωση ({discountPercent}%)</span>
                            <span className="font-mono font-bold">-{formatCurrency(discountAmount)}</span>
                        </div>
                    )}
                    <div className="flex justify-between items-center text-xs text-slate-500 mb-2 border-b border-slate-100 pb-2">
                        <span>ΦΠΑ ({(vatRate * 100).toFixed(0)}%)</span>
                        <span className="font-mono font-bold text-slate-800">{formatCurrency(vatAmount)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="font-black text-slate-900 uppercase">Συνολο</span>
                        <span className="font-black text-2xl text-purple-700">{formatCurrency(grandTotal)}</span>
                    </div>
                </div>

                {showScanner && <BarcodeScanner onScan={handleAddItem} onClose={() => setShowScanner(false)} />}
            </div>
        );
    }

    // LIST VIEW
    return (
        <div className="p-4 h-full flex flex-col">
            <div className="flex justify-between items-center mb-4 shrink-0">
                <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                    <FileText className="text-purple-600"/> Προσφορές
                </h1>
                <button onClick={() => initBuilder()} className="bg-[#060b00] text-white p-2 rounded-xl shadow-md active:scale-95 transition-transform">
                    <Plus size={24}/>
                </button>
            </div>

            <div className="bg-white p-1 rounded-xl shadow-sm border border-slate-100 flex mb-4 shrink-0 overflow-x-auto">
                {['ALL', 'Pending', 'Accepted', 'Declined'].map(s => (
                    <button 
                        key={s} 
                        onClick={() => setFilterStatus(s)} 
                        className={`flex-1 py-2 px-3 rounded-lg text-[10px] font-bold uppercase transition-all whitespace-nowrap ${filterStatus === s ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        {s === 'ALL' ? 'Ολες' : STATUS_LABELS[s]}
                    </button>
                ))}
            </div>

            <div className="relative mb-4 shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                    type="text" placeholder="Αναζήτηση..." value={search} onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500/20 shadow-sm font-medium"
                />
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pb-24 custom-scrollbar">
                {filteredOffers.map(offer => (
                    <div key={offer.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm active:scale-[0.98] transition-all">
                        <div onClick={() => initBuilder(offer)} className="cursor-pointer">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <div className="font-bold text-slate-800 text-base">{offer.customer_name}</div>
                                    <div className="text-[10px] text-slate-400 font-mono">#{offer.id.slice(0,8)}</div>
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${STATUS_STYLES[offer.status]}`}>
                                    {STATUS_LABELS[offer.status]}
                                </span>
                            </div>
                            <div className="flex justify-between items-end border-t border-slate-50 pt-2 mt-2">
                                <div className="text-xs text-slate-500 font-medium">{new Date(offer.created_at).toLocaleDateString('el-GR')} • {offer.items.length} είδη</div>
                                <div className="font-black text-slate-900 text-lg">{formatCurrency(offer.total_price)}</div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 mt-3 pt-2 border-t border-slate-50">
                            <button onClick={() => onPrintOffer(offer)} className="p-2 bg-slate-50 text-slate-500 rounded-lg hover:bg-slate-100"><Printer size={16}/></button>
                            {offer.status === 'Pending' && (
                                <button onClick={() => handleConvert(offer)} className="flex items-center gap-1 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-bold border border-emerald-100">
                                    <Check size={14}/> Παραγγελία
                                </button>
                            )}
                            <button onClick={async () => {
                                if(await confirm({title:'Διαγραφή', message:'Σίγουρα;', isDestructive:true})) {
                                    await api.deleteOffer(offer.id);
                                    queryClient.invalidateQueries({queryKey:['offers']});
                                    showToast("Διαγράφηκε.", "success");
                                }
                            }} className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100"><Trash2 size={16}/></button>
                        </div>
                    </div>
                ))}
                {filteredOffers.length === 0 && <div className="text-center py-10 text-slate-400 text-sm font-medium">Δεν βρέθηκαν προσφορές.</div>}
            </div>
        </div>
    );
}
