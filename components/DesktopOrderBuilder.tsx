
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Product, ProductVariant, Order, OrderItem, Customer, OrderStatus, VatRegime } from '../types';
import { ArrowLeft, User, Phone, Save, Plus, Search, Trash2, X, ChevronRight, Hash, Check, Camera, StickyNote, Minus, Coins, ScanBarcode, ImageIcon, Edit, Layers, Box, ArrowDownAZ, Clock, AlertCircle, Percent, RefreshCw } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { formatCurrency, splitSkuComponents, getVariantComponents, findProductByScannedCode } from '../utils/pricingEngine';
import { getSizingInfo } from '../utils/sizing';
import { useUI } from './UIProvider';
import { useAuth } from './AuthContext';
import BarcodeScanner from './BarcodeScanner';

interface Props {
    onBack: () => void;
    initialOrder: Order | null;
    products: Product[];
    customers: Customer[];
}

const DRAFT_ORDER_KEY = 'ilios_desktop_draft_order';

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
    'NF': 'text-green-700', 
    
    // Updated Colors
    'CO': 'text-teal-600', // Turquoise Copper
    'TPR': 'text-emerald-500', // Green Triplet
    'TKO': 'text-rose-600', // Red Triplet
    'TMP': 'text-blue-600', // Blue Triplet
    
    'PCO': 'text-emerald-400', 'MCO': 'text-purple-500',
    'PAX': 'text-green-500', 'MAX': 'text-blue-600', 'KAX': 'text-red-600', 'AI': 'text-slate-500',
    'AP': 'text-cyan-500', 'AM': 'text-teal-600', 'LR': 'text-indigo-600', 'BST': 'text-sky-400',
    'MP': 'text-blue-400', 'LE': 'text-slate-300', 'PR': 'text-green-400', 'KO': 'text-red-500',
    'MV': 'text-purple-400', 'RZ': 'text-pink-500', 'AK': 'text-cyan-300', 'XAL': 'text-stone-400'
};

export default function DesktopOrderBuilder({ onBack, initialOrder, products, customers }: Props) {
    const { showToast } = useUI();
    const { profile } = useAuth();
    const queryClient = useQueryClient();
    const isSeller = profile?.role === 'seller';

    const [customerName, setCustomerName] = useState(initialOrder?.customer_name || '');
    const [customerPhone, setCustomerPhone] = useState(initialOrder?.customer_phone || '');
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(initialOrder?.customer_id || null);
    const [orderNotes, setOrderNotes] = useState(initialOrder?.notes || '');
    const [vatRate, setVatRate] = useState<number>(initialOrder?.vat_rate !== undefined ? initialOrder.vat_rate : VatRegime.Standard);
    const [discountPercent, setDiscountPercent] = useState<number>(initialOrder?.discount_percent || 0);
    const [selectedItems, setSelectedItems] = useState<OrderItem[]>(initialOrder?.items || []);
    
    const [customerSearch, setCustomerSearch] = useState('');
    const [showCustomerResults, setShowCustomerResults] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Smart Entry State
    const [scanInput, setScanInput] = useState('');
    const [scanQty, setScanQty] = useState(1);
    const [itemNotes, setItemNotes] = useState('');
    const [candidateProducts, setCandidateProducts] = useState<Product[]>([]);
    const [activeMaster, setActiveMaster] = useState<Product | null>(null);
    const [filteredVariants, setFilteredVariants] = useState<{variant: ProductVariant, suffix: string, desc: string}[]>([]);
    const [selectedSize, setSelectedSize] = useState('');
    const [sizeMode, setSizeMode] = useState<{ type: 'Νούμερο' | 'Μήκος', sizes: string[] } | null>(null);
    const [showScanner, setShowScanner] = useState(false);
    
    // Sort State
    const [sortOrder, setSortOrder] = useState<'input' | 'alpha'>('input');

    const inputRef = useRef<HTMLInputElement>(null);

    // Draft autosave logic
    useEffect(() => {
        if (!initialOrder) {
            const savedDraft = localStorage.getItem(DRAFT_ORDER_KEY);
            if (savedDraft) {
                try {
                    const draft = JSON.parse(savedDraft);
                    // Basic validation to check if draft is recent (e.g. less than 24h) could be added
                    if (draft.timestamp && (Date.now() - draft.timestamp < 86400000)) {
                        setCustomerName(draft.customerName || '');
                        setCustomerPhone(draft.customerPhone || '');
                        setSelectedCustomerId(draft.selectedCustomerId || null);
                        setOrderNotes(draft.orderNotes || '');
                        setVatRate(draft.vatRate !== undefined ? draft.vatRate : VatRegime.Standard);
                        setDiscountPercent(draft.discountPercent || 0);
                        setSelectedItems(draft.selectedItems || []);
                        showToast("Ανακτήθηκε πρόχειρη παραγγελία.", "info");
                    }
                } catch (e) {
                    console.error("Failed to load draft order", e);
                }
            }
        }
    }, [initialOrder]);

    useEffect(() => {
        if (!initialOrder) {
            const draftData = {
                customerName,
                customerPhone,
                selectedCustomerId,
                orderNotes,
                vatRate,
                discountPercent,
                selectedItems,
                timestamp: Date.now()
            };
            localStorage.setItem(DRAFT_ORDER_KEY, JSON.stringify(draftData));
        }
    }, [initialOrder, customerName, customerPhone, selectedCustomerId, orderNotes, vatRate, discountPercent, selectedItems]);

    const clearDraft = () => {
        localStorage.removeItem(DRAFT_ORDER_KEY);
    };

    // Filter customers
    const filteredCustomers = useMemo(() => {
        if (!customers || !customerName) return [];
        return customers.filter(c => 
            c.full_name.toLowerCase().includes(customerName.toLowerCase()) || 
            (c.phone && c.phone.includes(customerName))
        ).slice(0, 5);
    }, [customers, customerName]);

    const handleSelectCustomer = (c: Customer) => {
        setSelectedCustomerId(c.id);
        setCustomerName(c.full_name);
        setCustomerPhone(c.phone || '');
        setCustomerSearch('');
        setShowCustomerResults(false);
    };

    // --- SORTED ITEMS MEMO ---
    const displayItems = useMemo(() => {
        // We clone to avoid mutating state directly during sort
        const items = [...selectedItems];
        
        if (sortOrder === 'alpha') {
            return items.sort((a, b) => {
                const skuA = a.sku + (a.variant_suffix || '');
                const skuB = b.sku + (b.variant_suffix || '');
                return skuA.localeCompare(skuB, undefined, { numeric: true });
            });
        }
        
        // Default: 'input' (Chronological, newest on top usually, but state is array. 
        // Our Add logic uses [newItem, ...prev], so index 0 is newest)
        return items;
    }, [selectedItems, sortOrder]);

    // --- SMART SEARCH & SKU VISUALIZATION ---
    const SkuPartVisualizer = ({ text, masterContext }: { text: string, masterContext: Product | null }) => {
        let masterStr = text;
        let suffixStr = '';
  
        if (masterContext) {
            const masterLen = masterContext.sku.length;
            if (text.startsWith(masterContext.sku)) {
                masterStr = text.slice(0, masterLen);
                suffixStr = text.slice(masterLen);
            }
        } else {
            const split = splitSkuComponents(text);
            masterStr = split.master;
            suffixStr = split.suffix;
        }
  
        const { finish, stone } = getVariantComponents(suffixStr, masterContext?.gender);
        const fColor = FINISH_COLORS[finish.code] || 'text-slate-400';
        const sColor = STONE_TEXT_COLORS[stone.code] || 'text-emerald-400';
  
        const renderSuffixChars = () => {
            return suffixStr.split('').map((char, i) => {
                let colorClass = 'text-slate-400';
                if (finish.code && i < finish.code.length) colorClass = fColor;
                else if (stone.code && i >= (suffixStr.length - stone.code.length)) colorClass = sColor;
                return <span key={i} className={colorClass}>{char}</span>
            });
        };
  
        return (
            <span>
                <span className="text-slate-900 font-black">{masterStr}</span>
                <span className="font-black">{renderSuffixChars()}</span>
            </span>
        );
    };
  
    const SkuVisualizer = () => {
        return (
            <div className="absolute inset-y-0 left-0 p-3.5 pointer-events-none font-mono text-xl tracking-wider flex items-center overflow-hidden z-20">
                <SkuPartVisualizer text={scanInput} masterContext={activeMaster} />
            </div>
        );
    };

    const handleSmartInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawVal = e.target.value.toUpperCase();
        
        // Split input by space to detect SKU and Size parts (e.g. "RN100 52")
        const parts = rawVal.split(/\s+/);
        const skuPart = parts[0];
        const sizePart = parts.length > 1 ? parts[1] : '';
    
        setScanInput(rawVal);
    
        if (skuPart.length < 2) {
            setCandidateProducts([]);
            setActiveMaster(null);
            setFilteredVariants([]);
            setSizeMode(null);
            return;
        }
    
        let bestMaster: Product | null = null;
        let suffixPart = '';
        
        const exactMaster = products.find(p => p.sku === skuPart && !p.is_component);
        const potentialMasters = products.filter(p => skuPart.startsWith(p.sku) && !p.is_component);
        const longestPrefixMaster = potentialMasters.sort((a,b) => b.sku.length - a.sku.length)[0];
    
        if (exactMaster) {
            bestMaster = exactMaster;
            suffixPart = '';
        } else if (longestPrefixMaster) {
            bestMaster = longestPrefixMaster;
            suffixPart = skuPart.replace(longestPrefixMaster.sku, '');
        }
    
        let candidates: Product[] = [];
        if (bestMaster) {
            candidates = [bestMaster]; 
        } else {
            candidates = products.filter(p => !p.is_component).filter(p => {
                if (p.sku.startsWith(skuPart)) return true;
                if (skuPart.length >= 3 && p.sku.includes(skuPart)) return true;
                return false;
            }).sort((a, b) => {
                const aExact = a.sku === skuPart;
                const bExact = b.sku === skuPart;
                if (aExact && !bExact) return -1;
                if (!aExact && bExact) return 1;
    
                const aStarts = a.sku.startsWith(skuPart);
                const bStarts = b.sku.startsWith(skuPart);
                if (aStarts && !bStarts) return -1;
                if (!aStarts && bStarts) return 1;
    
                if (a.sku.length !== b.sku.length) return a.sku.length - b.sku.length;
                return a.sku.localeCompare(b.sku);
            }).slice(0, 6);
        }
        setCandidateProducts(candidates);
    
        if (bestMaster) {
            setActiveMaster(bestMaster);
            const sizing = getSizingInfo(bestMaster);
            setSizeMode(sizing);
            
            // AUTO-SELECT SIZE
            if (sizing && sizePart) {
                 const matchedSize = sizing.sizes.find(s => s === sizePart || (sizing.type === 'Μήκος' && s.startsWith(sizePart)));
                 if (matchedSize) {
                     setSelectedSize(matchedSize);
                 }
            } else if (!sizePart) {
                 setSelectedSize('');
            }
    
            if (bestMaster.variants) {
                const validVariants = bestMaster.variants
                    .filter(v => v.suffix.startsWith(suffixPart))
                    .map(v => ({ variant: v, suffix: v.suffix, desc: v.description }));
                setFilteredVariants(validVariants);
            } else {
                setFilteredVariants([]);
            }
        } else {
            setActiveMaster(null);
            setFilteredVariants([]);
            setSizeMode(null);
            setSelectedSize('');
        }
    };

    const handleSelectMaster = (p: Product) => {
        setActiveMaster(p);
        setScanInput(p.sku);
        setCandidateProducts([p]);
        const sizing = getSizingInfo(p);
        if (sizing) {
            setSizeMode(sizing);
            setSelectedSize('');
        } else {
            setSizeMode(null);
        }
        if (p.variants) {
            setFilteredVariants(p.variants.map(v => ({ variant: v, suffix: v.suffix, desc: v.description })));
        } else {
            setFilteredVariants([]);
        }
        inputRef.current?.focus();
    };
    
    const selectVariant = (variant: ProductVariant) => {
        const fullCode = activeMaster!.sku + variant.suffix;
        setScanInput(fullCode);
        setFilteredVariants([]); 
        inputRef.current?.focus();
    };

    const executeAddItem = () => {
        // Trim input to ignore size part if typed after space
        const skuCode = scanInput.split(/\s+/)[0]; 
    
        if (!skuCode) return;
        const match = findProductByScannedCode(skuCode, products);
        
        if (!match) {
            showToast(`Ο κωδικός ${skuCode} δεν βρέθηκε.`, "error");
            return;
        }
    
        const { product, variant } = match;
    
        if (product.is_component) {
            showToast(`Το ${product.sku} είναι εξάρτημα και δεν διατίθεται για πώληση.`, "error");
            return;
        }

        // STRICT VARIANT VALIDATION
        if (!variant) {
            const hasVariants = product.variants && product.variants.length > 0;
            // Exception: If the product has exactly 1 variant and it is "Lustre" (empty suffix), treat master as that variant.
            const isSingleLustre = hasVariants && product.variants!.length === 1 && product.variants![0].suffix === '';

            if (hasVariants && !isSingleLustre) {
                showToast("Παρακαλώ επιλέξτε συγκεκριμένη παραλλαγή.", "error");
                // Expand variants view if needed or just return to force selection
                setActiveMaster(product); 
                setCandidateProducts([product]);
                if (product.variants) {
                    setFilteredVariants(product.variants.map(v => ({ variant: v, suffix: v.suffix, desc: v.description })));
                }
                return;
            }
        }
    
        const unitPrice = variant?.selling_price || product.selling_price || 0;
    
        const newItem: OrderItem = {
            sku: product.sku,
            variant_suffix: variant?.suffix,
            quantity: scanQty,
            price_at_order: unitPrice,
            product_details: product,
            size_info: selectedSize || undefined,
            notes: itemNotes || undefined
        };
    
        setSelectedItems(prev => {
            const existingIdx = prev.findIndex(i => 
                i.sku === newItem.sku && 
                i.variant_suffix === newItem.variant_suffix && 
                i.size_info === newItem.size_info &&
                i.notes === newItem.notes
            );
            if (existingIdx >= 0) {
                const updated = [...prev];
                updated[existingIdx].quantity += scanQty;
                return updated;
            }
            return [newItem, ...prev];
        });
    
        setScanInput('');
        setScanQty(1);
        setItemNotes('');
        setSelectedSize('');
        setCandidateProducts([]);
        setActiveMaster(null);
        setFilteredVariants([]);
        setSizeMode(null);
        inputRef.current?.focus();
        showToast("Το προϊόν προστέθηκε.", "success");
    };

    const handleAddItem = (variant: ProductVariant | null) => {
        if (!activeMaster) return;

        // STRICT VARIANT VALIDATION ON CLICK
        if (!variant) {
            const hasVariants = activeMaster.variants && activeMaster.variants.length > 0;
            const isSingleLustre = hasVariants && activeMaster.variants!.length === 1 && activeMaster.variants![0].suffix === '';
            
            if (hasVariants && !isSingleLustre) {
                 showToast("Παρακαλώ επιλέξτε συγκεκριμένη παραλλαγή.", "error");
                 return;
            }
        }

        const unitPrice = variant?.selling_price || activeMaster.selling_price || 0;
        
        const newItem: OrderItem = {
            sku: activeMaster.sku,
            variant_suffix: variant?.suffix,
            quantity: scanQty,
            price_at_order: unitPrice,
            product_details: activeMaster,
            size_info: selectedSize || undefined,
            notes: itemNotes || undefined
        };

        setSelectedItems(prev => {
            const existingIdx = prev.findIndex(i => 
                i.sku === newItem.sku && 
                i.variant_suffix === newItem.variant_suffix && 
                i.size_info === newItem.size_info &&
                i.notes === newItem.notes
            );

            if (existingIdx >= 0) {
                const updated = [...prev];
                updated[existingIdx].quantity += scanQty;
                return updated;
            }
            return [newItem, ...prev];
        });

        if (navigator.vibrate) navigator.vibrate(50);
        showToast(`${activeMaster.sku}${variant?.suffix || ''} προστέθηκε`, 'success');

        setActiveMaster(null);
        setScanQty(1);
        setSelectedSize('');
        setItemNotes('');
        setSizeMode(null);
        setScanInput('');
        setTimeout(() => inputRef.current?.focus(), 100);
    };

    // --- TOTALS & SAVING ---
    const subtotal = selectedItems.reduce((acc, item) => acc + (item.price_at_order * item.quantity), 0);
    const discountAmount = subtotal * (discountPercent / 100);
    const netAfterDiscount = subtotal - discountAmount;
    const vatAmount = netAfterDiscount * vatRate;
    const grandTotal = netAfterDiscount + vatAmount;

    const handleSaveOrder = async () => {
        if (!customerName) { showToast("Το όνομα πελάτη είναι υποχρεωτικό.", 'error'); return; }
        if (selectedItems.length === 0) { showToast("Προσθέστε τουλάχιστον ένα προϊόν.", 'error'); return; }
  
        setIsSaving(true);
        try {
            if (initialOrder) {
                const updatedOrder: Order = {
                    ...initialOrder,
                    customer_id: selectedCustomerId || undefined,
                    customer_name: customerName,
                    customer_phone: customerPhone,
                    items: selectedItems,
                    total_price: grandTotal,
                    vat_rate: vatRate,
                    discount_percent: discountPercent,
                    notes: orderNotes
                };
                await api.updateOrder(updatedOrder);
                showToast('Η παραγγελία ενημερώθηκε.', 'success');
            } else {
                const now = new Date();
                const year = now.getFullYear().toString().slice(-2);
                const month = (now.getMonth() + 1).toString().padStart(2, '0');
                const day = now.getDate().toString().padStart(2, '0');
                const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
                const newOrderId = `ORD-${year}${month}${day}-${random}`;
  
                const newOrder: Order = {
                    id: newOrderId,
                    customer_id: selectedCustomerId || undefined,
                    customer_name: customerName,
                    customer_phone: customerPhone,
                    seller_id: isSeller ? profile?.id : undefined,
                    created_at: new Date().toISOString(),
                    status: OrderStatus.Pending,
                    items: selectedItems,
                    total_price: grandTotal,
                    vat_rate: vatRate,
                    discount_percent: discountPercent,
                    notes: orderNotes
                };
                await api.saveOrder(newOrder);
                showToast('Η παραγγελία δημιουργήθηκε.', 'success');
            }
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            clearDraft(); 
            onBack();
        } catch (err: any) {
            showToast(`Σφάλμα: ${err.message}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const updateQuantity = (item: OrderItem, qty: number) => {
        const idx = selectedItems.indexOf(item);
        if (idx === -1) return;
        
        if (qty <= 0) {
            setSelectedItems(prev => prev.filter((_, i) => i !== idx));
        } else {
            setSelectedItems(prev => {
                const updated = [...prev];
                updated[idx] = { ...updated[idx], quantity: qty };
                return updated;
            });
        }
    };

    const updateItemNotes = (item: OrderItem, notes: string) => {
        const idx = selectedItems.indexOf(item);
        if (idx === -1) return;
        
        setSelectedItems(prev => {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], notes: notes || undefined };
            return updated;
        });
    };
    
    // NEW: RECALCULATE PRICES BASED ON CURRENT REGISTRY
    const handleRecalculatePrices = () => {
        let updatedCount = 0;
        const newItems = selectedItems.map(item => {
            const product = products.find(p => p.sku === item.sku);
            if (!product) return item;

            let currentRegistryPrice = 0;
            if (item.variant_suffix) {
                const variant = product.variants?.find(v => v.suffix === item.variant_suffix);
                currentRegistryPrice = variant?.selling_price || 0;
            } else {
                currentRegistryPrice = product.selling_price;
            }

            // If price differs, update it
            if (currentRegistryPrice > 0 && Math.abs(currentRegistryPrice - item.price_at_order) > 0.01) {
                updatedCount++;
                return { ...item, price_at_order: currentRegistryPrice };
            }
            return item;
        });

        if (updatedCount > 0) {
            setSelectedItems(newItems);
            showToast(`Ενημερώθηκαν οι τιμές σε ${updatedCount} είδη.`, 'success');
        } else {
            showToast('Οι τιμές είναι ήδη επίκαιρες.', 'info');
        }
    };

    const handleRemoveItem = (item: OrderItem) => {
        const idx = selectedItems.indexOf(item);
        if (idx !== -1) {
            setSelectedItems(prev => prev.filter((_, i) => i !== idx));
        }
    };

    const handleScanInOrder = (code: string) => {
        const match = findProductByScannedCode(code, products);
        if (match) {
            if (match.product.is_component) {
                showToast("Δεν επιτρέπεται η προσθήκη εξαρτημάτων στην εντολή.", "error");
            } else {
                const { product, variant } = match;

                // VARIANT VALIDATION ON SCAN
                if (!variant) {
                    const hasVariants = product.variants && product.variants.length > 0;
                    const isSingleLustre = hasVariants && product.variants!.length === 1 && product.variants![0].suffix === '';
                    if (hasVariants && !isSingleLustre) {
                        showToast(`Ο κωδικός ${code} είναι Master. Παρακαλώ σκανάρετε την παραλλαγή.`, "error");
                        return;
                    }
                }

                const unitPrice = variant?.selling_price || product.selling_price || 0;
                
                const newItem: OrderItem = {
                    sku: product.sku,
                    variant_suffix: variant?.suffix,
                    quantity: 1,
                    price_at_order: unitPrice,
                    product_details: product
                };
            
                setSelectedItems(prev => {
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
            }
        } else {
            showToast(`Ο κωδικός ${code} δεν βρέθηκε.`, 'error');
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 relative">
            {/* Header */}
            <div className="bg-white p-4 border-b border-slate-200 flex items-center justify-between shadow-sm shrink-0 z-20">
                <div className="flex items-center gap-4">
                    <button onClick={() => { clearDraft(); onBack(); }} className="p-2 -ml-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
                        <ArrowLeft size={24}/>
                    </button>
                    <div>
                        <h2 className="text-xl font-black text-slate-800">{initialOrder ? `Επεξεργασία #${initialOrder.id.slice(0,8)}` : 'Νέα Παραγγελία'}</h2>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={handleSaveOrder} disabled={isSaving} className="bg-[#060b00] text-white px-6 py-2.5 rounded-xl font-bold shadow-lg hover:bg-black transition-all flex items-center gap-2 disabled:opacity-50">
                        <Save size={18}/> Αποθήκευση
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-8 p-6">
                
                {/* LEFT COLUMN: CUSTOMER INFO */}
                <div className="lg:col-span-3 bg-white rounded-3xl border border-slate-100 p-6 shadow-sm overflow-y-auto custom-scrollbar h-full">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 uppercase text-xs tracking-wider border-b border-slate-50 pb-2">
                        <User size={16}/> Στοιχεία Πελάτη
                    </h3>
                    
                    <div className="space-y-4">
                        <div className="relative">
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Ονοματεπώνυμο</label>
                            <input 
                                className={`w-full p-3 bg-slate-50 border rounded-xl outline-none font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500/20 transition-all ${selectedCustomerId ? 'border-emerald-300 ring-2 ring-emerald-50' : 'border-slate-200'}`}
                                placeholder="Αναζήτηση..."
                                value={customerName}
                                onChange={e => { setCustomerName(e.target.value); setCustomerSearch(e.target.value); setShowCustomerResults(true); if(!e.target.value) setSelectedCustomerId(null); }}
                                onFocus={() => setShowCustomerResults(true)}
                            />
                            {selectedCustomerId && <Check size={16} className="absolute right-3 top-9 text-emerald-500"/>}
                            
                            {showCustomerResults && customerSearch && !selectedCustomerId && (
                                <div className="absolute top-full left-0 right-0 bg-white shadow-xl rounded-xl border border-slate-100 mt-2 z-50 overflow-hidden max-h-60 overflow-y-auto custom-scrollbar">
                                    {filteredCustomers.map(c => (
                                        <div key={c.id} onClick={() => handleSelectCustomer(c)} className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0 font-medium text-sm text-slate-700">
                                            {c.full_name}
                                        </div>
                                    ))}
                                    {filteredCustomers.length === 0 && <div className="p-3 text-xs text-slate-400 italic">Δεν βρέθηκαν αποτελέσματα.</div>}
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Τηλέφωνο</label>
                            <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500/20" placeholder="-" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}/>
                        </div>

                        <div className="pt-4 border-t border-slate-50 space-y-4">
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Έκπτωση (%)</label>
                                <div className="relative">
                                    <input 
                                        type="number" min="0" max="100" 
                                        value={discountPercent} 
                                        onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)} 
                                        className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 font-bold text-amber-900 pr-8"
                                    />
                                    <Percent size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-500"/>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Καθεστώς ΦΠΑ</label>
                                <select 
                                    value={vatRate} 
                                    onChange={(e) => setVatRate(parseFloat(e.target.value))} 
                                    className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-700 cursor-pointer"
                                >
                                    <option value={VatRegime.Standard}>24% (Κανονικό)</option>
                                    <option value={VatRegime.Reduced}>17% (Μειωμένο)</option>
                                    <option value={VatRegime.Zero}>0% (Μηδενικό)</option>
                                </select>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-slate-50">
                           <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Σημειώσεις Παραγγελίας</label>
                           <textarea value={orderNotes} onChange={e => setOrderNotes(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm h-32 resize-none outline-none focus:ring-2 focus:ring-emerald-500/20" placeholder="Ειδικές οδηγίες..."/>
                        </div>
                    </div>
                </div>

                {/* CENTER: SMART ENTRY */}
                <div className="lg:col-span-5 flex flex-col h-full bg-slate-50/50 rounded-[2.5rem] border border-slate-200 p-6 shadow-inner overflow-y-auto custom-scrollbar">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2.5 bg-[#060b00] text-white rounded-xl shadow-lg"><ScanBarcode size={22} className="animate-pulse" /></div>
                        <h2 className="font-black text-slate-800 uppercase tracking-tighter text-lg">Έξυπνη Ταχεία Προσθήκη</h2>
                    </div>

                    <div className="space-y-6">
                        <div className="grid grid-cols-12 gap-4 items-end">
                            <div className="col-span-9 relative">
                                <label className="text-[10px] text-slate-400 font-black uppercase mb-1.5 ml-1 block tracking-widest">Κωδικός / SKU</label>
                                <div className="relative">
                                    <SkuVisualizer />
                                    <input 
                                        ref={inputRef} type="text" value={scanInput} onChange={handleSmartInput}
                                        onKeyDown={e => e.key === 'Enter' && executeAddItem()}
                                        placeholder="Πληκτρολογήστε..."
                                        className="w-full p-3.5 bg-white text-transparent caret-slate-800 font-mono text-xl font-black rounded-2xl border border-slate-200 outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 uppercase tracking-widest shadow-sm relative z-10"
                                        autoFocus
                                    />
                                </div>
                            </div>
                            <div className="col-span-3">
                                <label className="text-[10px] text-slate-400 font-black uppercase mb-1.5 ml-1 block tracking-widest">Ποσ.</label>
                                <input 
                                  type="number" min="1" value={scanQty} 
                                  onChange={e => setScanQty(parseInt(e.target.value)||1)} 
                                  onKeyDown={e => e.key === 'Enter' && executeAddItem()}
                                  className="w-full p-3.5 text-center font-black text-xl rounded-2xl outline-none bg-white text-slate-900 border border-slate-200 focus:ring-4 focus:ring-emerald-500/10 shadow-sm"
                                />
                            </div>
                        </div>

                        {/* Candidates */}
                        {candidateProducts.length > 0 && !activeMaster && (
                            <div className="animate-in fade-in slide-in-from-top-2">
                                <label className="text-[9px] text-slate-400 font-bold uppercase mb-2 ml-1 block tracking-widest">ΠΡΟΤΑΣΕΙΣ ΑΝΑΖΗΤΗΣΗΣ</label>
                                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                                    {candidateProducts.map(p => (
                                        <div key={p.sku} onClick={() => handleSelectMaster(p)} className="flex items-center gap-3 p-2 bg-white rounded-xl border border-slate-200 cursor-pointer hover:border-emerald-500 min-w-[160px] shadow-sm transition-all group active:scale-95">
                                            <div className="w-10 h-10 bg-slate-100 rounded-lg overflow-hidden shrink-0 border border-slate-100">{p.image_url ? <img src={p.image_url} className="w-full h-full object-cover"/> : <ImageIcon size={16} className="m-auto text-slate-300"/>}</div>
                                            <div className="min-w-0">
                                                <div className="font-black text-sm text-slate-800 leading-none group-hover:text-emerald-700 transition-colors">{p.sku}</div>
                                                <div className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[100px]">{p.category}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Active Master Details */}
                        {activeMaster && (
                            <div className="bg-white p-5 rounded-3xl border border-emerald-100 shadow-xl animate-in zoom-in-95 duration-200 space-y-6">
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 bg-slate-100 rounded-xl overflow-hidden border border-slate-200">{activeMaster.image_url ? <img src={activeMaster.image_url} className="w-full h-full object-cover"/> : <ImageIcon className="m-3 text-slate-300"/>}</div>
                                        <div><h3 className="font-black text-xl text-slate-900 leading-none">{activeMaster.sku}</h3><p className="text-xs text-slate-500 font-bold mt-1 uppercase">{activeMaster.category}</p></div>
                                    </div>
                                    <button onClick={() => { setActiveMaster(null); setScanInput(''); setFilteredVariants([]); setSelectedSize(''); }} className="p-2 bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"><X size={16}/></button>
                                </div>

                                {sizeMode && (
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 block flex items-center gap-1">
                                            <Hash size={12}/> Επιλογή {sizeMode.type} <span className="font-normal text-slate-300 normal-case">(Προαιρετικό)</span>
                                        </label>
                                        <div className="flex flex-wrap gap-2">
                                            {sizeMode.sizes.map(s => (
                                                <button key={s} onClick={() => setSelectedSize(s === selectedSize ? '' : s)} className={`px-3 py-2 rounded-xl text-sm font-bold border transition-all ${selectedSize === s ? 'bg-slate-900 text-white border-slate-900 shadow-md transform scale-105' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}>{s}</button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {filteredVariants.length > 0 && (
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 block flex items-center gap-1"><Layers size={12}/> ΠΑΡΑΛΛΑΓΕΣ</label>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                            {filteredVariants.map(v => {
                                                const { finish, stone } = getVariantComponents(v.suffix, activeMaster.gender);
                                                return (
                                                    <button key={v.suffix} onClick={() => handleAddItem(v.variant)} className={`p-3 rounded-xl border transition-all flex flex-col items-center gap-1 shadow-sm active:scale-95 bg-white border-slate-100 hover:border-emerald-500`}>
                                                        <span className={`text-sm font-black flex items-center gap-0.5`}>
                                                            <span className={FINISH_COLORS[finish.code] || 'text-slate-400'}>{finish.code || 'BAS'}</span>
                                                            <span className={STONE_TEXT_COLORS[stone.code] || 'text-emerald-500'}>{stone.code}</span>
                                                        </span>
                                                        <span className="text-[9px] font-bold text-slate-400 truncate w-full text-center">{v.desc || 'Variant'}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 block flex items-center gap-1">
                                        <StickyNote size={12}/> ΕΙΔΙΚΕΣ ΠΑΡΑΤΗΡΗΣΕΙΣ ΕΙΔΟΥΣ
                                    </label>
                                    <input 
                                        type="text" 
                                        value={itemNotes} 
                                        onChange={e => setItemNotes(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && executeAddItem()}
                                        placeholder="π.χ. Αλλαγή κουμπώματος, Μακρύτερη αλυσίδα..."
                                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm transition-all"
                                    />
                                </div>
                                
                                {(!activeMaster.variants || activeMaster.variants.length === 0) && (
                                    <button onClick={() => handleAddItem(null)} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-emerald-100 active:scale-95 transition-all flex items-center justify-center gap-2 hover:bg-emerald-700">
                                        <Plus size={24}/> Προσθήκη Βασικού
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT: ORDER LIST */}
                <div className="lg:col-span-4 flex flex-col h-full bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Περιεχόμενα ({selectedItems.length})</label>
                        <div className="flex items-center gap-2">
                            <button onClick={handleRecalculatePrices} className="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200 hover:bg-amber-100 transition-all">
                                <RefreshCw size={14}/> Συγχρονισμός Τιμών
                            </button>
                            <button onClick={() => setSortOrder(prev => prev === 'input' ? 'alpha' : 'input')} className="flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-white border border-slate-200 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
                                <ArrowDownAZ size={12}/> {sortOrder === 'input' ? 'Χρον.' : 'Αλφ.'}
                            </button>
                            <button onClick={() => setShowScanner(true)} className="flex items-center gap-1 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl border border-blue-200 transition-all active:scale-95">
                                <Camera size={14}/>
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2 p-3 custom-scrollbar bg-slate-50/50">
                        {displayItems.map((item) => (
                            <div key={`${item.sku}-${item.variant_suffix}-${item.size_info}-${item.notes}`} className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-2 animate-in slide-in-from-right-4 transition-all hover:shadow-md group">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-10 h-10 bg-slate-50 rounded-lg overflow-hidden shrink-0 border border-slate-100">{item.product_details?.image_url && <img src={item.product_details.image_url} className="w-full h-full object-cover"/>}</div>
                                        <div className="min-w-0">
                                            <div className="font-black text-slate-800 text-sm leading-none truncate">{item.sku}<span className="text-emerald-600">{item.variant_suffix}</span></div>
                                            <div className="text-[10px] text-slate-500 font-bold mt-1 flex items-center gap-1">{formatCurrency(item.price_at_order)} {item.size_info && <span className="bg-slate-100 px-1 rounded">SZ: {item.size_info}</span>}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
                                            <button onClick={() => updateQuantity(item, item.quantity - 1)} className="p-1 hover:bg-white rounded shadow-sm text-slate-600"><Minus size={12}/></button>
                                            <span className="w-6 text-center font-black text-sm">{item.quantity}</span>
                                            <button onClick={() => updateQuantity(item, item.quantity + 1)} className="p-1 hover:bg-white rounded shadow-sm text-slate-600"><Plus size={12}/></button>
                                        </div>
                                        <button onClick={() => handleRemoveItem(item)} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
                                    </div>
                                </div>
                                
                                <div className="relative group/note">
                                    <input 
                                        type="text" 
                                        value={item.notes || ''} 
                                        onChange={e => updateItemNotes(item, e.target.value)}
                                        placeholder="Προσθήκη παρατήρησης είδους..."
                                        className="w-full pl-7 py-1.5 text-[10px] bg-slate-50 border border-transparent hover:border-slate-200 focus:border-emerald-300 focus:bg-white rounded-lg outline-none font-medium text-slate-600 transition-all placeholder:italic"
                                    />
                                    <StickyNote size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-300 group-hover/note:text-emerald-400" />
                                </div>
                            </div>
                        ))}
                        {selectedItems.length === 0 && (
                          <div className="flex flex-col items-center justify-center h-full text-slate-300 italic py-10"><Box size={48} className="opacity-20 mb-4"/><p className="text-sm font-bold">Το καλάθι είναι άδειο.</p></div>
                        )}
                    </div>
                    
                    {/* Summary Footer */}
                    <div className="p-5 bg-slate-50 border-t border-slate-200">
                        <div className="flex justify-between items-center text-xs text-slate-500 mb-1">
                             <span>Καθαρή Αξία:</span>
                             <span className="font-mono font-bold">{formatCurrency(subtotal)}</span>
                        </div>
                        {discountPercent > 0 && (
                            <div className="flex justify-between items-center text-xs text-red-500 mb-1">
                                <span>Έκπτωση ({discountPercent}%):</span>
                                <span className="font-mono font-bold">-{formatCurrency(discountAmount)}</span>
                            </div>
                        )}
                        <div className="flex justify-between items-center text-xs text-slate-500 border-b border-slate-200 pb-2 mb-2">
                             <span>ΦΠΑ ({(vatRate * 100).toFixed(0)}%):</span>
                             <span className="font-mono font-bold">{formatCurrency(vatAmount)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                             <span className="font-black text-slate-800 uppercase text-sm">Συνολο</span>
                             <span className="font-black text-2xl text-emerald-700">{formatCurrency(grandTotal)}</span>
                        </div>
                    </div>
                </div>
            </div>
            
            {showScanner && <BarcodeScanner onScan={handleScanInOrder} onClose={() => setShowScanner(false)} />}
        </div>
    );
}
