
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Product, ProductVariant, Customer, Offer, OfferStatus, OrderItem, GlobalSettings, Collection, Material, VatRegime } from '../types';
import { Plus, Search, Trash2, Printer, Save, FileText, User, Phone, Check, RefreshCw, Loader2, ArrowRight, Ban, FolderKanban, Coins, Percent, X, AlertTriangle, ImageIcon, ScanBarcode, Lightbulb } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, CLOUDFLARE_WORKER_URL, AUTH_KEY_SECRET, RETAIL_CUSTOMER_ID, RETAIL_CUSTOMER_NAME } from '../lib/supabase';
import { useUI } from './UIProvider';
import { formatCurrency, formatDecimal, findProductByScannedCode, calculateProductCost, calculateSuggestedWholesalePrice, expandSkuRange, estimateVariantCost, getVariantComponents, splitSkuComponents } from '../utils/pricingEngine';
import { normalizedIncludes } from '../utils/greekSearch';
import { generateOrderId } from '../utils/orderUtils';
import { composeNotesWithRetailClient, extractRetailClientFromNotes } from '../utils/retailNotes';
import DesktopPageHeader from './DesktopPageHeader';

// SKU visualizer colors (synced with BatchPrint / Inventory)
const FINISH_COLORS: Record<string, string> = {
    'X': 'text-amber-500', 'P': 'text-slate-500', 'D': 'text-orange-500', 'H': 'text-cyan-400', '': 'text-slate-400'
};
const STONE_TEXT_COLORS: Record<string, string> = {
    'KR': 'text-rose-600', 'QN': 'text-slate-900', 'LA': 'text-blue-600', 'TY': 'text-teal-500',
    'TG': 'text-orange-700', 'IA': 'text-red-800', 'BSU': 'text-slate-800', 'GSU': 'text-emerald-800',
    'RSU': 'text-rose-800', 'MA': 'text-emerald-600', 'FI': 'text-slate-400', 'OP': 'text-indigo-500',
    'NF': 'text-green-700', 'CO': 'text-cyan-600', 'TPR': 'text-emerald-500', 'TKO': 'text-rose-600',
    'TMP': 'text-blue-600', 'PCO': 'text-teal-500', 'MCO': 'text-purple-500', 'PAX': 'text-green-600',
    'MAX': 'text-blue-700', 'KAX': 'text-red-700', 'AI': 'text-slate-500', 'AP': 'text-cyan-500',
    'AM': 'text-teal-700', 'LR': 'text-indigo-700', 'BST': 'text-sky-400', 'MP': 'text-blue-400',
    'LE': 'text-slate-400', 'PR': 'text-green-500', 'KO': 'text-red-500', 'MV': 'text-purple-400',
    'RZ': 'text-pink-500', 'AK': 'text-cyan-300', 'XAL': 'text-stone-400', 'SD': 'text-blue-800',
    'AX': 'text-emerald-700'
};

interface Props {
    products: Product[];
    materials: Material[];
    settings: GlobalSettings;
    collections: Collection[];
    onPrintOffer: (offer: Offer) => void;
}

export default function OffersPage({ products, materials, settings, collections, onPrintOffer }: Props) {
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: api.getCustomers });
    const { data: offers, isLoading: loadingOffers } = useQuery({ queryKey: ['offers'], queryFn: api.getOffers });

    const [isCreating, setIsCreating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editingOffer, setEditingOffer] = useState<Offer | null>(null);

    // Form State
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerId, setCustomerId] = useState<string | null>(null);
    const [customSilverPrice, setCustomSilverPrice] = useState(settings.silver_price_gram);
    const [discountPercent, setDiscountPercent] = useState(0);
    const [vatRate, setVatRate] = useState<number>(VatRegime.Standard);
    const [offerNotes, setOfferNotes] = useState('');
    const [retailClientLabel, setRetailClientLabel] = useState('');
    const [items, setItems] = useState<OrderItem[]>([]);

    // Convert-after-edit state
    const [pendingConvertOffer, setPendingConvertOffer] = useState<Offer | null>(null);

    // Input State
    const [selectedCollectionId, setSelectedCollectionId] = useState<number | ''>('');
    const [isFetchingPrice, setIsFetchingPrice] = useState(false);
    const [customerSearch, setCustomerSearch] = useState('');
    const [showCustomerResults, setShowCustomerResults] = useState(false);

    // Smart SKU entry (same as Μαζική Εκτύπωση)
    const allProducts = useMemo(() => products.filter(p => !p.is_component), [products]);
    const [scanInput, setScanInput] = useState('');
    const [scanQty, setScanQty] = useState(1);
    const [candidateProducts, setCandidateProducts] = useState<Product[]>([]);
    const [activeMasterProduct, setActiveMasterProduct] = useState<Product | null>(null);
    const [filteredVariants, setFilteredVariants] = useState<{ variant: ProductVariant; suffix: string; desc: string }[]>([]);
    const skuInputRef = useRef<HTMLInputElement>(null);

    // Filtered Customers for Search
    const filteredCustomers = useMemo(() => {
        if (!customers || !customerName) return [];
        return customers.filter(c => normalizedIncludes(c.full_name, customerName) || (c.phone && c.phone.includes(customerName))).slice(0, 5);
    }, [customers, customerName]);

    const isRetailCustomer = customerId === RETAIL_CUSTOMER_ID || customerName.trim() === RETAIL_CUSTOMER_NAME;

    const handleUseRetailCustomer = () => {
        setCustomerId(RETAIL_CUSTOMER_ID);
        setCustomerName(RETAIL_CUSTOMER_NAME);
        setCustomerPhone('');
        setVatRate(VatRegime.Standard);
        setShowCustomerResults(false);
    };

    const handleSelectCustomer = (c: Customer) => {
        if (c.id === RETAIL_CUSTOMER_ID || c.full_name === RETAIL_CUSTOMER_NAME) {
            handleUseRetailCustomer();
            return;
        }
        setCustomerId(c.id);
        setCustomerName(c.full_name);
        setCustomerPhone(c.phone || '');
        setShowCustomerResults(false);
    };

    const handleEditOffer = (offer: Offer) => {
        const parsedNotes = extractRetailClientFromNotes(offer.notes);
        setEditingOffer(offer);
        setCustomerName(offer.customer_name);
        setCustomerPhone(offer.customer_phone || '');
        setCustomerId(offer.customer_id || null);
        setCustomSilverPrice(offer.custom_silver_price);
        setDiscountPercent(offer.discount_percent);
        setVatRate(offer.vat_rate !== undefined ? offer.vat_rate : VatRegime.Standard);
        setOfferNotes(parsedNotes.cleanNotes || '');
        setRetailClientLabel(parsedNotes.retailClientLabel);
        const syncedItems = (offer.items || []).map(item => {
            const product = products.find(p => p.sku === item.sku);
            return {
                ...item,
                product_details: product || item.product_details
            };
        });
        setItems(syncedItems);
        setIsCreating(true);
    };

    const fetchLivePrice = async () => {
        setIsFetchingPrice(true);
        try {
            const response = await fetch(`${CLOUDFLARE_WORKER_URL}/price/silver`, {
                method: 'GET',
                headers: { 'Authorization': AUTH_KEY_SECRET }
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch price');
            }

            const finalPrice = parseFloat(data.price.toFixed(3));
            setCustomSilverPrice(finalPrice);
            showToast(`Τιμή: ${formatDecimal(finalPrice, 3)} €/g`, 'success');
        } catch (error: any) {
            showToast(`Σφάλμα: ${error.message}`, 'error');
        } finally {
            setIsFetchingPrice(false);
        }
    };

    // Pricing Calculation Helper
    const calculateItemPrice = (product: Product, variantSuffix: string | undefined) => {
        // Create a temporary settings object with the CUSTOM silver price
        const tempSettings = { ...settings, silver_price_gram: customSilverPrice };

        // Calculate Cost using custom silver
        // FIX: Use estimateVariantCost for variants to handle stone/material diffs
        const costCalc = (variantSuffix !== undefined && variantSuffix !== null)
            ? estimateVariantCost(product, variantSuffix, tempSettings, materials, products)
            : calculateProductCost(product, tempSettings, materials, products);

        let breakdown = costCalc.breakdown;
        let totalWeight = costCalc.breakdown.details?.total_weight || (product.weight_g + (product.secondary_weight_g || 0));

        // Calculate wholesale price based on the Ilios formula
        const suggestedPrice = calculateSuggestedWholesalePrice(totalWeight, breakdown.silver, breakdown.labor, breakdown.materials);
        return suggestedPrice;
    };

    // Recalculate All Prices when Silver Price Changes
    useEffect(() => {
        if (items.length > 0 && isCreating) {
            setItems(prev => prev.map(item => {
                const product = products.find(p => p.sku === item.sku);
                if (!product) return item;
                const newPrice = calculateItemPrice(product, item.variant_suffix);
                return { ...item, price_at_order: newPrice };
            }));
        }
    }, [customSilverPrice, isCreating]);

    // Smart input handlers (same UX as Μαζική Εκτύπωση)
    const handleSmartInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.toUpperCase();
        setScanInput(val);
        if (val.length < 2) {
            setCandidateProducts([]);
            setActiveMasterProduct(null);
            setFilteredVariants([]);
            return;
        }
        if (val.includes('-')) {
            setCandidateProducts([]);
            setActiveMasterProduct(null);
            setFilteredVariants([]);
            return;
        }
        const exactMaster = allProducts.find(p => p.sku === val);
        const potentialMasters = allProducts.filter(p => val.startsWith(p.sku));
        const longestPrefixMaster = potentialMasters.sort((a, b) => b.sku.length - a.sku.length)[0];
        let bestMaster: Product | null = null;
        let suffixPart = '';
        if (exactMaster) {
            bestMaster = exactMaster;
            suffixPart = '';
        } else if (longestPrefixMaster) {
            bestMaster = longestPrefixMaster;
            suffixPart = val.replace(longestPrefixMaster.sku, '');
        }
        let candidates: Product[] = bestMaster ? [bestMaster] : allProducts.filter(p => p.sku.startsWith(val)).slice(0, 6);
        setCandidateProducts(candidates);
        if (bestMaster) {
            setActiveMasterProduct(bestMaster);
            setFilteredVariants(bestMaster.variants
                ? bestMaster.variants.filter(v => v.suffix.startsWith(suffixPart)).map(v => ({ variant: v, suffix: v.suffix, desc: v.description }))
                : []);
        } else {
            setActiveMasterProduct(null);
            setFilteredVariants([]);
        }
    };

    const selectProductCandidate = (product: Product) => {
        setScanInput(product.sku);
        setActiveMasterProduct(product);
        setCandidateProducts([product]);
        setFilteredVariants(product.variants ? product.variants.map(v => ({ variant: v, suffix: v.suffix, desc: v.description })) : []);
        skuInputRef.current?.focus();
    };

    const selectSuffix = (suffix: string) => {
        if (activeMasterProduct) {
            setScanInput(activeMasterProduct.sku + suffix);
            setFilteredVariants([]);
            skuInputRef.current?.focus();
        }
    };

    const executeSmartAdd = () => {
        if (!scanInput.trim()) return;
        const expandedSkus = expandSkuRange(scanInput.toUpperCase());
        let addedCount = 0;
        const newItems = [...items];
        for (const rawSku of expandedSkus) {
            const match = findProductByScannedCode(rawSku, allProducts);
            if (match) {
                const { product, variant } = match;
                const unitPrice = calculateItemPrice(product, variant?.suffix);
                const qty = scanQty;
                const existingIdx = newItems.findIndex(i => i.sku === product.sku && i.variant_suffix === variant?.suffix);
                if (existingIdx >= 0) {
                    newItems[existingIdx].quantity += qty;
                } else {
                    newItems.push({
                        sku: product.sku,
                        variant_suffix: variant?.suffix,
                        quantity: qty,
                        price_at_order: unitPrice,
                        product_details: product
                    });
                }
                addedCount++;
            }
        }
        setItems(newItems);
        setScanInput('');
        setScanQty(1);
        setCandidateProducts([]);
        setActiveMasterProduct(null);
        setFilteredVariants([]);
        skuInputRef.current?.focus();
        if (addedCount > 0) showToast(`Προστέθηκαν ${addedCount} είδη.`, 'success');
        else showToast('Δεν βρέθηκαν κωδικοί.', 'error');
    };

    const handleAddCollection = () => {
        if (!selectedCollectionId) return;
        const collectionProducts = products.filter(p => p.collections?.includes(selectedCollectionId as number) && !p.is_component);

        if (collectionProducts.length === 0) {
            showToast("Η συλλογή είναι κενή.", "info");
            return;
        }

        const newItems = [...items];
        let addedCount = 0;

        collectionProducts.forEach(p => {
            if (p.variants && p.variants.length > 0) {
                p.variants.forEach(v => {
                    const unitPrice = calculateItemPrice(p, v.suffix);
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
                const unitPrice = calculateItemPrice(p, undefined);
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
        showToast(`Προστέθηκαν ${addedCount} είδη από τη συλλογή.`, "success");
        setSelectedCollectionId('');
    };

    const removeItem = (index: number) => {
        setItems(prev => prev.filter((_, i) => i !== index));
    };

    const subtotal = items.reduce((acc, item) => acc + (item.price_at_order * item.quantity), 0);
    const discountAmount = subtotal * (discountPercent / 100);
    const netAmount = subtotal - discountAmount;
    const vatAmount = netAmount * vatRate;
    const grandTotal = netAmount + vatAmount;

    const handleSaveOffer = async () => {
        if (!customerName) { showToast("Παρακαλώ εισάγετε πελάτη.", "error"); return; }
        if (items.length === 0) { showToast("Η προσφορά είναι κενή.", "error"); return; }

        setIsSaving(true);
        const isRetailOffer = customerId === RETAIL_CUSTOMER_ID || customerName.trim() === RETAIL_CUSTOMER_NAME;
        const composedNotes = isRetailOffer ? composeNotesWithRetailClient(offerNotes, retailClientLabel) : offerNotes;
        const offerPayload: Offer = {
            id: editingOffer ? editingOffer.id : crypto.randomUUID(),
            customer_id: isRetailOffer ? RETAIL_CUSTOMER_ID : (customerId || undefined),
            customer_name: isRetailOffer ? RETAIL_CUSTOMER_NAME : customerName,
            customer_phone: isRetailOffer ? '' : customerPhone,
            created_at: editingOffer ? editingOffer.created_at : new Date().toISOString(),
            status: editingOffer ? editingOffer.status : 'Pending',
            custom_silver_price: customSilverPrice,
            discount_percent: discountPercent,
            vat_rate: vatRate,
            items: items,
            total_price: grandTotal,
            notes: composedNotes
        };

        try {
            if (editingOffer) await api.updateOffer(offerPayload);
            else await api.saveOffer(offerPayload);

            queryClient.invalidateQueries({ queryKey: ['offers'] });
            
            // Check if we need to convert to order after saving
            if (pendingConvertOffer) {
                const offerToConvert = {
                    ...pendingConvertOffer,
                    ...offerPayload,
                    items: items,
                    total_price: grandTotal
                };
                setIsCreating(false);
                setEditingOffer(null);
                setPendingConvertOffer(null);
                await performConvertToOrder(offerToConvert);
            } else {
                setIsCreating(false);
                setEditingOffer(null);
                showToast("Η προσφορά αποθηκεύτηκε.", "success");
            }
        } catch (e) {
            showToast("Σφάλμα αποθήκευσης.", "error");
        } finally {
            setIsSaving(false);
        }
    };

    const handleConvertToOrder = async (offer: Offer) => {
        // Show confirmation dialog with edit option
        const choice = await confirm({
            title: 'Έλεγχος Προσφοράς',
            message: 'Υπάρχουν αλλαγές που θέλετε να κάνετε στην προσφορά πριν τη μετατρέψετε σε παραγγελία;',
            confirmText: 'Ναι, θέλω να επεξεργαστώ',
            cancelText: 'Όχι, μετατροπή άμεσα'
        });

        if (choice === true) {
            // User wants to edit first - navigate to edit mode
            setPendingConvertOffer(offer);
            handleEditOffer(offer);
        } else if (choice === false) {
            // User wants direct conversion
            await performConvertToOrder(offer);
        }
        // If choice is undefined (dialog dismissed), do nothing
    };

    const performConvertToOrder = async (offer: Offer) => {
        try {
            // 1. Create Order
            const newOrderId = generateOrderId();
            const orderPayload = {
                id: newOrderId,
                customer_id: offer.customer_id,
                customer_name: offer.customer_name,
                customer_phone: offer.customer_phone,
                created_at: new Date().toISOString(),
                status: 'Pending',
                items: offer.items,
                total_price: offer.total_price,
                notes: offer.notes || '',
                custom_silver_rate: offer.custom_silver_price,
                vat_rate: offer.vat_rate !== undefined ? offer.vat_rate : 0.24,
                discount_percent: offer.discount_percent
            };

            await api.saveOrder(orderPayload as any);

            // 2. Update Offer Status
            await api.updateOffer({ ...offer, status: 'Accepted' });

            queryClient.invalidateQueries({ queryKey: ['orders'] });
            queryClient.invalidateQueries({ queryKey: ['offers'] });
            showToast("Η προσφορά μετατράπηκε σε παραγγελία επιτυχώς!", "success");
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

    // --- SKU Visualizers (same as Μαζική Εκτύπωση) ---
    const SkuPartVisualizer = ({ text, masterContext }: { text: string; masterContext: Product | null }) => {
        let masterStr = text;
        let suffixStr = '';
        if (masterContext) {
            if (text.startsWith(masterContext.sku)) {
                masterStr = text.slice(0, masterContext.sku.length);
                suffixStr = text.slice(masterContext.sku.length);
            }
        } else {
            const split = splitSkuComponents(text);
            masterStr = split.master;
            suffixStr = split.suffix;
        }
        const { finish, stone } = getVariantComponents(suffixStr, masterContext?.gender);
        const fColor = FINISH_COLORS[finish.code] || 'text-slate-400';
        const sColor = STONE_TEXT_COLORS[stone.code] || 'text-emerald-400';
        const renderSuffixChars = () =>
            suffixStr.split('').map((char, i) => {
                let colorClass = 'text-slate-400';
                if (finish.code && i < finish.code.length) colorClass = fColor;
                else if (stone.code && i >= suffixStr.length - stone.code.length) colorClass = sColor;
                return <span key={i} className={colorClass}>{char}</span>;
            });
        return (
            <span>
                <span className="text-slate-900 font-black">{masterStr}</span>
                <span className="font-black">{renderSuffixChars()}</span>
            </span>
        );
    };

    const SkuVisualizer = () => {
        if (scanInput.includes('-')) {
            const parts = scanInput.split('-');
            const start = parts[0];
            const end = parts.slice(1).join('-');
            const startMatch = findProductByScannedCode(start, allProducts);
            const endMatch = findProductByScannedCode(end, allProducts) || { product: allProducts.find(p => end.startsWith(p.sku)) || null };
            return (
                <div className="absolute inset-y-0 left-0 p-3.5 pointer-events-none font-mono text-xl tracking-wider flex items-center overflow-hidden z-20">
                    <SkuPartVisualizer text={start} masterContext={startMatch?.product || null} />
                    <span className="text-amber-500 font-bold mx-1">-</span>
                    <SkuPartVisualizer text={end} masterContext={endMatch?.product || null} />
                </div>
            );
        }
        return (
            <div className="absolute inset-y-0 left-0 p-3.5 pointer-events-none font-mono text-xl tracking-wider flex items-center overflow-hidden z-20">
                <SkuPartVisualizer text={scanInput} masterContext={activeMasterProduct} />
            </div>
        );
    };

    // ---------------- UI RENDERING ----------------

    if (loadingOffers) return <div className="p-12 text-center text-slate-400">Φόρτωση προσφορών...</div>;

    if (isCreating) {
        return (
            <div className="flex flex-col h-[calc(100vh-100px)] bg-slate-50">
                {/* Header */}
                <div className="bg-white p-6 border-b border-slate-200 flex justify-between items-start shrink-0 shadow-sm z-10">
                    <div>
                        <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                            {editingOffer ? 'Επεξεργασία Προσφοράς' : 'Νέα Προσφορά'}
                        </h2>
                        <p className="text-sm text-slate-500">Δημιουργήστε μια προσαρμοσμένη οικονομική προσφορά.</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => { setIsCreating(false); setEditingOffer(null); setItems([]); setVatRate(VatRegime.Standard); setOfferNotes(''); setRetailClientLabel(''); }} disabled={isSaving} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50">Ακύρωση</button>
                        <button onClick={handleSaveOffer} disabled={isSaving} className="px-6 py-2 bg-[#060b00] text-white font-bold rounded-xl shadow-lg hover:bg-black transition-all flex items-center gap-2 disabled:opacity-70 min-w-[140px] justify-center">
                            {isSaving ? <><Loader2 size={16} className="animate-spin" /> Αποθήκευση...</> : <><Save size={16} /> Αποθήκευση</>}
                        </button>
                    </div>

                    {/* Saving overlay */}
                    {isSaving && (
                        <div className="fixed inset-0 z-[300] bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center gap-5 animate-in fade-in duration-200">
                            <div className="relative">
                                <div className="w-20 h-20 rounded-full bg-slate-900/10 animate-ping absolute inset-0" />
                                <div className="w-20 h-20 rounded-full bg-white shadow-2xl flex items-center justify-center relative">
                                    <Loader2 size={34} className="animate-spin text-slate-800" />
                                </div>
                            </div>
                            <p className="text-base font-black text-slate-700 tracking-widest uppercase">Αποθήκευση Προσφοράς...</p>
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
                    {/* Left Panel: Controls */}
                    <div className="lg:w-1/3 bg-white border-r border-slate-200 overflow-y-auto p-6 space-y-6 custom-scrollbar z-0">

                        {/* Customer */}
                        <div className="space-y-3">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-wide flex items-center gap-2"><User size={14} /> Πελάτης</label>
                            <div className="relative">
                                <input
                                    className={`w-full p-3 bg-slate-50 border rounded-xl outline-none font-bold text-slate-800 focus:ring-2 focus:ring-blue-500/20 transition-all ${customerId ? 'border-blue-300 ring-2 ring-blue-50' : 'border-slate-200'}`}
                                    placeholder="Αναζήτηση..."
                                    value={customerName}
                                    onChange={e => { setCustomerName(e.target.value); setShowCustomerResults(true); setCustomerId(null); }}
                                    onFocus={() => setShowCustomerResults(true)}
                                />
                                {showCustomerResults && customerName && !customerId && filteredCustomers.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 bg-white shadow-xl rounded-xl border border-slate-100 mt-2 z-50 overflow-hidden max-h-60 overflow-y-auto custom-scrollbar">
                                        {filteredCustomers.map(c => (
                                            <div key={c.id} onClick={() => handleSelectCustomer(c)} className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0 font-medium text-sm text-slate-700">
                                                {c.full_name}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={handleUseRetailCustomer}
                                className="w-full p-2 rounded-xl border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 text-xs font-black"
                            >
                                Χρήση Λιανικής
                            </button>
                            {isRetailCustomer && (
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Τελικός πελάτης λιανικής (προαιρετικό)</label>
                                    <input
                                        value={retailClientLabel}
                                        onChange={e => setRetailClientLabel(e.target.value)}
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none text-sm font-medium"
                                        placeholder="π.χ. Κατάστημα Νάξου"
                                    />
                                </div>
                            )}
                            <div className="flex items-center gap-2 border-t border-slate-50 pt-2">
                                <Phone size={14} className="text-slate-400" />
                                <input className="flex-1 outline-none text-sm text-slate-600 font-medium placeholder-slate-300" placeholder="Τηλέφωνο..." value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
                            </div>
                        </div>

                        {/* Pricing Parameters */}
                        <div className="bg-amber-50 p-5 rounded-2xl border border-amber-100 space-y-4">
                            <label className="text-xs font-black text-amber-700 uppercase tracking-wide flex items-center gap-2"><Coins size={14} /> Παράμετροι Τιμολόγησης</label>

                            <div>
                                <label className="text-[10px] font-bold text-amber-600/70 uppercase mb-1 block">Τιμή Ασημιού (€/g)</label>
                                <div className="flex gap-2">
                                    <input
                                        type="number" step="0.01"
                                        value={customSilverPrice}
                                        onChange={e => setCustomSilverPrice(parseFloat(e.target.value) || 0)}
                                        className="flex-1 p-2 bg-white border border-amber-200 rounded-lg font-mono font-bold text-amber-900 outline-none focus:ring-2 focus:ring-amber-500/20"
                                    />
                                    <button onClick={fetchLivePrice} disabled={isFetchingPrice} className="p-2 bg-amber-200 text-amber-800 rounded-lg hover:bg-amber-300 transition-colors">
                                        {isFetchingPrice ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                                    </button>
                                </div>
                                <p className="text-[10px] text-amber-600/60 mt-1 italic">Οι τιμές των ειδών θα υπολογιστούν αυτόματα με βάση αυτή την τιμή.</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-bold text-amber-600/70 uppercase mb-1 block">Έκπτωση (%)</label>
                                    <div className="relative">
                                        <input
                                            type="number" min="0" max="100"
                                            value={discountPercent}
                                            onChange={e => setDiscountPercent(parseFloat(e.target.value) || 0)}
                                            className="w-full p-2 bg-white border border-amber-200 rounded-lg font-mono font-bold text-amber-900 outline-none focus:ring-2 focus:ring-amber-500/20 pr-8"
                                        />
                                        <Percent size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-400" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-amber-600/70 uppercase mb-1 block">Καθεστώς ΦΠΑ</label>
                                    <select
                                        value={vatRate}
                                        onChange={(e) => setVatRate(parseFloat(e.target.value))}
                                        className="w-full p-2 bg-white border border-amber-200 rounded-lg font-bold text-sm text-amber-900 outline-none cursor-pointer"
                                    >
                                        <option value={VatRegime.Standard}>24% (Κανονικό)</option>
                                        <option value={VatRegime.Reduced}>17% (Μειωμένο)</option>
                                        <option value={VatRegime.Zero}>0% (Μηδενικό)</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Add Items — same smart entry as Μαζική Εκτύπωση (visualizer, photo, variants) */}
                        <div className="space-y-4 pt-4 border-t border-slate-100">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="p-2.5 bg-[#060b00] text-white rounded-xl shadow-lg">
                                    <ScanBarcode size={20} className="animate-pulse" />
                                </div>
                                <h3 className="font-black text-slate-700 text-sm uppercase tracking-tighter">Έξυπνη Προσθήκη SKU</h3>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end overflow-visible">
                                <div className="md:col-span-7 relative overflow-visible">
                                    <label className="text-[10px] text-slate-400 font-black uppercase mb-1.5 ml-1 block tracking-widest">Κωδικός / SKU / Εύρος</label>
                                    <div className="relative">
                                        <SkuVisualizer />
                                        <input
                                            ref={skuInputRef}
                                            type="text"
                                            value={scanInput}
                                            onChange={handleSmartInput}
                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); executeSmartAdd(); } }}
                                            placeholder="Πληκτρολογήστε..."
                                            className="w-full p-3.5 bg-white text-transparent caret-slate-800 font-mono text-xl font-black rounded-2xl border border-slate-200 outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 uppercase tracking-widest transition-all shadow-sm relative z-10"
                                        />
                                    </div>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="text-[10px] text-slate-400 font-black uppercase mb-1.5 ml-1 block tracking-widest">Ποσ.</label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={scanQty}
                                        onChange={e => setScanQty(parseInt(e.target.value) || 1)}
                                        className="w-full p-3.5 text-center font-black text-xl rounded-2xl outline-none bg-white text-slate-900 border border-slate-200 focus:ring-4 focus:ring-emerald-500/10 shadow-sm"
                                    />
                                </div>
                                <div className="md:col-span-3">
                                    <button
                                        onClick={executeSmartAdd}
                                        disabled={!scanInput}
                                        className="w-full h-[58px] bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-2xl flex items-center justify-center transition-all shadow-lg hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:translate-y-0"
                                    >
                                        <Plus size={28} />
                                    </button>
                                </div>
                            </div>

                            {/* Candidate products strip (photos + SKU) */}
                            {candidateProducts.length > 0 && !scanInput.includes('-') && (
                                <div className="animate-in slide-in-from-top-2 fade-in">
                                    <label className="text-[9px] text-slate-400 font-bold uppercase mb-1.5 ml-1 block tracking-widest flex items-center gap-1">
                                        <Search size={10} /> {activeMasterProduct ? 'ΕΠΙΛΕΓΜΕΝΟ ΠΡΟΪΟΝ' : 'ΠΡΟΤΑΣΕΙΣ ΑΝΑΖΗΤΗΣΗΣ'}
                                    </label>
                                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                                        {candidateProducts.map(p => (
                                            <div
                                                key={p.sku}
                                                onClick={() => selectProductCandidate(p)}
                                                className={`flex items-center gap-3 p-2 rounded-xl border cursor-pointer transition-all min-w-[180px] group ${activeMasterProduct?.sku === p.sku ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/20 shadow-md' : 'bg-slate-50 border-slate-200 hover:border-emerald-300 hover:bg-white'}`}
                                            >
                                                <div className="w-10 h-10 bg-white rounded-lg overflow-hidden shrink-0 border border-slate-200">
                                                    {p.image_url ? <img src={p.image_url} className="w-full h-full object-cover" alt={p.sku} /> : <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon size={16} /></div>}
                                                </div>
                                                <div>
                                                    <div className={`font-black text-sm leading-none ${activeMasterProduct?.sku === p.sku ? 'text-emerald-800' : 'text-slate-700'}`}>{p.sku}</div>
                                                    <div className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[100px]">{p.category}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Variant suggestions */}
                            {filteredVariants.length > 0 && !scanInput.includes('-') && (
                                <div className="animate-in slide-in-from-top-2 fade-in bg-slate-50/50 p-3 rounded-2xl border border-slate-100">
                                    <label className="text-[9px] text-slate-400 font-bold uppercase mb-2 ml-1 block tracking-widest flex items-center gap-1">
                                        <Lightbulb size={10} className="text-amber-500" /> ΔΙΑΘΕΣΙΜΕΣ ΠΑΡΑΛΛΑΓΕΣ
                                    </label>
                                    <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto custom-scrollbar">
                                        {filteredVariants.map(s => {
                                            const { finish, stone } = getVariantComponents(s.suffix, activeMasterProduct?.gender);
                                            const fColor = FINISH_COLORS[finish.code] || 'text-slate-400';
                                            const sColor = STONE_TEXT_COLORS[stone.code] || 'text-emerald-400';
                                            return (
                                                <button
                                                    key={s.suffix}
                                                    onClick={() => selectSuffix(s.suffix)}
                                                    className="bg-white hover:bg-emerald-50 text-slate-600 px-3 py-2 rounded-xl text-xs font-black uppercase transition-all shadow-sm border border-slate-200 hover:border-emerald-200 flex items-center gap-1 group active:scale-95"
                                                    title={s.desc}
                                                >
                                                    <span className={fColor}>{finish.code || 'LUSTRE'}</span>
                                                    {stone.code && <span className={sColor}>{stone.code}</span>}
                                                    <span className="ml-1.5 text-[9px] text-slate-300 font-normal group-hover:text-emerald-400 normal-case">{s.desc}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* By Collection */}
                            <div className="flex gap-2">
                                <select
                                    value={selectedCollectionId}
                                    onChange={e => setSelectedCollectionId(parseInt(e.target.value))}
                                    className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-sm text-slate-700 cursor-pointer"
                                >
                                    <option value="">Επιλογή Συλλογής...</option>
                                    {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                                <button onClick={handleAddCollection} disabled={!selectedCollectionId} className="p-3 bg-pink-100 text-pink-700 border border-pink-200 rounded-xl hover:bg-pink-200 transition-colors disabled:opacity-50">
                                    <FolderKanban size={20} />
                                </button>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-slate-100">
                            <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Σημειώσεις</label>
                            <textarea value={offerNotes} onChange={e => setOfferNotes(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm h-24 resize-none outline-none focus:ring-2 focus:ring-slate-800/20" />
                        </div>
                    </div>

                    {/* Right Panel: Items Table */}
                    <div className="lg:w-2/3 flex flex-col h-full bg-slate-50/30">
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                            <table className="w-full text-left text-sm bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                                    <tr>
                                        <th className="p-4 pl-6">Εικόνα</th>
                                        <th className="p-4">SKU / Περιγραφή</th>
                                        <th className="p-4 text-center">Βάρος</th>
                                        <th className="p-4 text-right">Τιμή Μον.</th>
                                        <th className="p-4 text-center">Ποσ.</th>
                                        <th className="p-4 text-right">Σύνολο</th>
                                        <th className="p-4"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {items.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="p-4 pl-6">
                                                <div className="w-12 h-12 bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                                                    {item.product_details?.image_url && <img src={item.product_details.image_url} className="w-full h-full object-cover" />}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <div className="font-black text-slate-800">{item.sku}{item.variant_suffix}</div>
                                                <div className="text-xs text-slate-500 truncate max-w-[200px]">{item.product_details?.category}</div>
                                            </td>
                                            <td className="p-4 text-center font-mono text-slate-600">{item.product_details?.weight_g}g</td>
                                            <td className="p-4 text-right font-mono font-bold text-slate-700">{formatCurrency(item.price_at_order)}</td>
                                            <td className="p-4 text-center">
                                                <input
                                                    type="number" min="1" value={item.quantity}
                                                    onChange={e => {
                                                        const newQty = parseInt(e.target.value) || 1;
                                                        setItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: newQty } : it));
                                                    }}
                                                    className="w-12 text-center bg-slate-100 rounded border border-slate-200 font-bold outline-none focus:border-blue-400"
                                                />
                                            </td>
                                            <td className="p-4 text-right font-black text-slate-900">{formatCurrency(item.price_at_order * item.quantity)}</td>
                                            <td className="p-4 text-center">
                                                <button onClick={() => removeItem(idx)} className="text-slate-300 hover:text-red-500"><Trash2 size={16} /></button>
                                            </td>
                                        </tr>
                                    ))}
                                    {items.length === 0 && <tr><td colSpan={7} className="p-10 text-center text-slate-400 italic">Δεν υπάρχουν είδη.</td></tr>}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer Totals */}
                        <div className="bg-white border-t border-slate-200 p-6 flex justify-end gap-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20">
                            <div className="text-right">
                                <div className="text-xs font-bold text-slate-400 uppercase">Υποσύνολο</div>
                                <div className="text-xl font-bold text-slate-700">{formatCurrency(subtotal)}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-xs font-bold text-slate-400 uppercase">Έκπτωση ({discountPercent}%)</div>
                                <div className="text-xl font-bold text-rose-500">-{formatCurrency(discountAmount)}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-xs font-bold text-slate-400 uppercase">Φ.Π.Α. ({(vatRate * 100).toFixed(0)}%)</div>
                                <div className="text-xl font-bold text-slate-600">{formatCurrency(vatAmount)}</div>
                            </div>
                            <div className="text-right pl-6 border-l border-slate-100">
                                <div className="text-xs font-bold text-slate-400 uppercase">Γενικό Σύνολο</div>
                                <div className="text-3xl font-black text-slate-900">{formatCurrency(grandTotal)}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // List View
    return (
        <div className="h-[calc(100vh-100px)] flex flex-col gap-6">
            <DesktopPageHeader
                icon={FileText}
                title="Προσφορές"
                subtitle="Διαχείριση οικονομικών προσφορών."
                tail={(
                    <button
                        type="button"
                        onClick={() => { setIsCreating(true); setEditingOffer(null); setItems([]); setCustomerName(''); setCustomerId(null); setCustomerPhone(''); setOfferNotes(''); setRetailClientLabel(''); setVatRate(VatRegime.Standard); }}
                        className="flex items-center gap-2 rounded-xl bg-[#060b00] px-5 py-3 font-bold text-white shadow-lg shadow-slate-200 transition-all hover:-translate-y-0.5 hover:bg-black"
                    >
                        <Plus size={20} /> Νέα Προσφορά
                    </button>
                )}
            />

            <div className="flex-1 bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="overflow-y-auto h-full custom-scrollbar">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs sticky top-0 shadow-sm">
                            <tr>
                                <th className="p-5 pl-8">Πελάτης</th>
                                <th className="p-5">Ημερομηνία</th>
                                <th className="p-5 text-right">Ποσό</th>
                                <th className="p-5 text-center">Κατάσταση</th>
                                <th className="p-5 text-center">Ενέργειες</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {offers?.map(offer => (
                                <tr key={offer.id} className="hover:bg-slate-50 transition-colors group cursor-pointer" onClick={() => handleEditOffer(offer)}>
                                    <td className="p-5 pl-8 font-bold text-slate-800">{offer.customer_name}</td>
                                    <td className="p-5 text-slate-500">{new Date(offer.created_at).toLocaleDateString('el-GR')}</td>
                                    <td className="p-5 text-right font-black text-slate-900">{formatCurrency(offer.total_price)}</td>
                                    <td className="p-5 text-center">
                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase ${offer.status === 'Accepted' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                                            offer.status === 'Declined' ? 'bg-slate-100 text-slate-500 border-slate-200' :
                                                'bg-amber-50 text-amber-600 border-amber-200'
                                            }`}>
                                            {offer.status === 'Pending' ? 'Εκκρεμεί' : (offer.status === 'Accepted' ? 'Αποδοχή' : 'Απόρριψη')}
                                        </span>
                                    </td>
                                    <td className="p-5 text-center">
                                        <div className="flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={(e) => { e.stopPropagation(); onPrintOffer(offer); }} className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 rounded-lg"><Printer size={16} /></button>
                                            {offer.status === 'Pending' && (
                                                <>
                                                    <button onClick={(e) => { e.stopPropagation(); handleConvertToOrder(offer); }} className="p-2 text-emerald-500 hover:bg-emerald-50 hover:text-emerald-700 rounded-lg" title="Μετατροπή σε Παραγγελία"><Check size={16} /></button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleDeclineOffer(offer); }} className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-lg" title="Απόρριψη"><Ban size={16} /></button>
                                                </>
                                            )}
                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteOffer(offer.id); }} className="p-2 text-rose-400 hover:bg-rose-50 hover:text-rose-600 rounded-lg"><Trash2 size={16} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {offers?.length === 0 && <tr><td colSpan={5} className="p-10 text-center text-slate-400 italic">Δεν υπάρχουν προσφορές.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
