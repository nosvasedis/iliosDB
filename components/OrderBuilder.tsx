
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Order, Product, ProductVariant, OrderItem, Customer, OrderStatus, VatRegime } from '../types';
import { Plus, Search, Trash2, X, Loader2, Users, ScanBarcode, Camera, Hash, Layers, Minus, StickyNote, XCircle, Phone, Check, AlertCircle, ImageIcon, Box, Ban } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, supabase, recordStockMovement } from '../lib/supabase';
import { useUI } from './UIProvider';
import BarcodeScanner from './BarcodeScanner';
import { getSizingInfo, isSizable } from '../utils/sizing';
import { findProductByScannedCode, getVariantComponents, formatCurrency, splitSkuComponents } from '../utils/pricingEngine';
import { FINISH_CODES } from '../constants';
import { useAuth } from './AuthContext';


const DRAFT_ORDER_KEY = 'ilios_desktop_draft_order';

interface Props {
  products: Product[];
  initialOrder: Order | null;
  onBack: () => void;
}

const FINISH_COLORS: Record<string, string> = {
    'X': 'text-amber-500', 'P': 'text-slate-500', 'D': 'text-orange-500', 'H': 'text-cyan-400', '': 'text-slate-400'
};

const STONE_TEXT_COLORS: Record<string, string> = {
    'KR': 'text-rose-600', 'QN': 'text-slate-900', 'LA': 'text-blue-600', 'TY': 'text-teal-500',
    'TG': 'text-orange-700', 'IA': 'text-red-700', 'BSU': 'text-slate-800', 'GSU': 'text-emerald-800',
    'RSU': 'text-rose-800', 'MA': 'text-emerald-600', 'FI': 'text-slate-400', 'OP': 'text-indigo-500',
    'NF': 'text-green-700', 'CO': 'text-orange-400', 'PCO': 'text-emerald-400', 'MCO': 'text-purple-500',
    'PAX': 'text-green-500', 'MAX': 'text-blue-600', 'KAX': 'text-red-600', 'AI': 'text-slate-500',
    'AP': 'text-cyan-500', 'AM': 'text-teal-600', 'LR': 'text-indigo-600', 'BST': 'text-sky-400',
    'MP': 'text-blue-400', 'LE': 'text-slate-300', 'PR': 'text-green-400', 'KO': 'text-red-500',
    'MV': 'text-purple-400', 'RZ': 'text-pink-500', 'AK': 'text-cyan-300', 'XAL': 'text-stone-400'
};

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

export default function OrderBuilder({ products, onBack, initialOrder }: Props) {
    const queryClient = useQueryClient();
    const { showToast } = useUI();
    const { profile } = useAuth();
    const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: api.getCustomers });
    
    const [customerName, setCustomerName] = useState(initialOrder?.customer_name || '');
    const [customerPhone, setCustomerPhone] = useState(initialOrder?.customer_phone || '');
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(initialOrder?.customer_id || null);
    const [orderNotes, setOrderNotes] = useState(initialOrder?.notes || '');
    const [vatRate, setVatRate] = useState<number>(initialOrder?.vat_rate !== undefined ? initialOrder.vat_rate : VatRegime.Standard);
    const [selectedItems, setSelectedItems] = useState<OrderItem[]>(initialOrder?.items || []);
  
    const [customerSearch, setCustomerSearch] = useState('');
    const [showCustomerResults, setShowCustomerResults] = useState(false);
    
    const [scanInput, setScanInput] = useState('');
    const [scanQty, setScanQty] = useState(1);
    const [itemNotes, setItemNotes] = useState('');
    const [candidateProducts, setCandidateProducts] = useState<Product[]>([]);
    const [activeMasterProduct, setActiveMasterProduct] = useState<Product | null>(null);
    const [filteredVariants, setFilteredVariants] = useState<{variant: ProductVariant, suffix: string, desc: string}[]>([]);
    const [selectedSize, setSelectedSize] = useState('');
    const [sizeMode, setSizeMode] = useState<{ type: 'Νούμερο' | 'Μήκος', sizes: string[] } | null>(null);
    const [showScanner, setShowScanner] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!initialOrder) {
            const savedDraft = localStorage.getItem(DRAFT_ORDER_KEY);
            if (savedDraft) {
                try {
                    const draft = JSON.parse(savedDraft);
                    setCustomerName(draft.customerName || '');
                    setCustomerPhone(draft.customerPhone || '');
                    setSelectedCustomerId(draft.selectedCustomerId || null);
                    setOrderNotes(draft.orderNotes || '');
                    setVatRate(draft.vatRate !== undefined ? draft.vatRate : VatRegime.Standard);
                    setSelectedItems(draft.selectedItems || []);
                    showToast("Ανακτήθηκε πρόχειρη παραγγελία.", "info");
                } catch (e) { console.error("Failed to load draft order", e); }
            }
        }
    }, [initialOrder]);
    
    useEffect(() => {
        if (!initialOrder) {
            const draftData = { customerName, customerPhone, selectedCustomerId, orderNotes, vatRate, selectedItems, timestamp: Date.now() };
            localStorage.setItem(DRAFT_ORDER_KEY, JSON.stringify(draftData));
        }
    }, [initialOrder, customerName, customerPhone, selectedCustomerId, orderNotes, vatRate, selectedItems]);
    
    const SkuVisualizer = () => {
        return (
            <div className="absolute inset-y-0 left-0 p-3.5 pointer-events-none font-mono text-xl tracking-wider flex items-center overflow-hidden z-20">
                <SkuPartVisualizer text={scanInput} masterContext={activeMasterProduct} />
            </div>
        );
    };

    const filteredCustomers = customers?.filter(c => 
        c.full_name.toLowerCase().includes(customerSearch.toLowerCase()) || (c.phone && c.phone.includes(customerSearch))
    ).slice(0, 5) || [];
  
    const handleSelectCustomer = (c: Customer) => {
        setSelectedCustomerId(c.id);
        setCustomerName(c.full_name);
        setCustomerPhone(c.phone || '');
        setCustomerSearch('');
        setShowCustomerResults(false);
    };

    const handleSmartInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawVal = e.target.value.toUpperCase();
        const parts = rawVal.split(/\s+/);
        const skuPart = parts[0];
        const sizePart = parts.length > 1 ? parts[1] : '';
  
        setScanInput(rawVal);
  
        if (skuPart.length < 2) {
            setCandidateProducts([]); setActiveMasterProduct(null); setFilteredVariants([]); setSizeMode(null);
            return;
        }
  
        let bestMaster: Product | null = null;
        let suffixPart = '';
        
        const exactMaster = products.find(p => p.sku === skuPart && !p.is_component);
        const potentialMasters = products.filter(p => skuPart.startsWith(p.sku) && !p.is_component);
        const longestPrefixMaster = potentialMasters.sort((a,b) => b.sku.length - a.sku.length)[0];
  
        if (exactMaster) { bestMaster = exactMaster; suffixPart = ''; } 
        else if (longestPrefixMaster) { bestMaster = longestPrefixMaster; suffixPart = skuPart.replace(longestPrefixMaster.sku, ''); }
  
        let candidates: Product[] = [];
        if (bestMaster) { candidates = [bestMaster]; } 
        else {
            candidates = products.filter(p => !p.is_component).filter(p => {
                if (p.sku.startsWith(skuPart)) return true;
                if (skuPart.length >= 3 && p.sku.includes(skuPart)) return true;
                return false;
            }).sort((a, b) => {
                const aStarts = a.sku.startsWith(skuPart), bStarts = b.sku.startsWith(skuPart);
                if (aStarts && !bStarts) return -1; if (!aStarts && bStarts) return 1;
                return a.sku.localeCompare(b.sku);
            }).slice(0, 6);
        }
        setCandidateProducts(candidates);
  
        if (bestMaster) {
            setActiveMasterProduct(bestMaster);
            const sizing = getSizingInfo(bestMaster);
            setSizeMode(sizing);
            
            if (sizing && sizePart) {
                 const matchedSize = sizing.sizes.find(s => s === sizePart || (sizing.type === 'Μήκος' && s.startsWith(sizePart)));
                 if (matchedSize) setSelectedSize(matchedSize);
            } else if (!sizePart) { setSelectedSize(''); }
  
            if (bestMaster.variants) {
                const validVariants = bestMaster.variants.filter(v => v.suffix.startsWith(suffixPart)).map(v => ({ variant: v, suffix: v.suffix, desc: v.description }));
                setFilteredVariants(validVariants);
            } else { setFilteredVariants([]); }
        } else { setActiveMasterProduct(null); setFilteredVariants([]); setSizeMode(null); setSelectedSize(''); }
    };
  
    const selectProductCandidate = (product: Product) => {
        setScanInput(product.sku);
        setActiveMasterProduct(product);
        setCandidateProducts([product]);
        setSizeMode(getSizingInfo(product));
        if (product.variants) {
            setFilteredVariants(product.variants.map(v => ({ variant: v, suffix: v.suffix, desc: v.description })));
        } else { setFilteredVariants([]); }
        inputRef.current?.focus();
    };
  
    const selectVariant = (variant: ProductVariant) => {
        const fullCode = activeMasterProduct!.sku + variant.suffix;
        setScanInput(fullCode);
        setFilteredVariants([]); 
        inputRef.current?.focus();
    };
  
    const executeAddItem = () => {
        const skuCode = scanInput.split(/\s+/)[0]; 
        if (!skuCode) return;
        const match = findProductByScannedCode(skuCode, products);
        if (!match) { showToast(`Ο κωδικός ${skuCode} δεν βρέθηκε.`, "error"); return; }
        const { product, variant } = match;
        if (product.is_component) { showToast(`Το ${product.sku} είναι εξάρτημα.`, "error"); return; }
        const unitPrice = variant?.selling_price || product.selling_price || 0;
        const newItem: OrderItem = { sku: product.sku, variant_suffix: variant?.suffix, quantity: scanQty, price_at_order: unitPrice, product_details: product, size_info: selectedSize || undefined, notes: itemNotes || undefined };
        setSelectedItems(prev => {
            const existingIdx = prev.findIndex(i => i.sku === newItem.sku && i.variant_suffix === newItem.variant_suffix && i.size_info === newItem.size_info && i.notes === newItem.notes);
            if (existingIdx >= 0) {
                const updated = [...prev];
                updated[existingIdx].quantity += scanQty;
                return updated;
            }
            return [newItem, ...prev];
        });
        setScanInput(''); setScanQty(1); setItemNotes(''); setSelectedSize(''); setCandidateProducts([]); setActiveMasterProduct(null); setFilteredVariants([]); setSizeMode(null);
        inputRef.current?.focus();
        showToast("Το προϊόν προστέθηκε.", "success");
    };
  
    const updateQuantity = (index: number, qty: number) => {
        if (qty <= 0) setSelectedItems(selectedItems.filter((_, i) => i !== index));
        else {
            const updated = [...selectedItems];
            updated[index].quantity = qty;
            setSelectedItems(updated);
        }
    };
  
    const updateItemNotes = (index: number, notes: string) => {
        const updated = [...selectedItems];
        updated[index].notes = notes || undefined;
        setSelectedItems(updated);
    };
  
    const calculateTotal = () => selectedItems.reduce((acc, item) => acc + (item.price_at_order * item.quantity), 0);
    const vatAmount = calculateTotal() * vatRate;
    const grandTotal = calculateTotal() + vatAmount;
  
    const handleSaveOrder = async () => {
        if (!customerName) { showToast("Το όνομα πελάτη είναι υποχρεωτικό.", 'error'); return; }
        if (selectedItems.length === 0) { showToast("Προσθέστε τουλάχιστον ένα προϊόν.", 'error'); return; }
        try {
            const isSeller = profile?.role === 'seller';
            if (initialOrder) {
                const updatedOrder: Order = { ...initialOrder, customer_id: selectedCustomerId || undefined, customer_name: customerName, customer_phone: customerPhone, items: selectedItems, total_price: grandTotal, vat_rate: vatRate, notes: orderNotes, seller_id: isSeller ? profile?.id : (initialOrder.seller_id || undefined) };
                await api.updateOrder(updatedOrder);
                showToast('Η παραγγελία ενημερώθηκε.', 'success');
            } else {
                const now = new Date(); const year = now.getFullYear().toString().slice(-2); const month = (now.getMonth() + 1).toString().padStart(2, '0'); const day = now.getDate().toString().padStart(2, '0'); const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
                const newOrderId = `ORD-${year}${month}${day}-${random}`;
                const newOrder: Order = { id: newOrderId, customer_id: selectedCustomerId || undefined, customer_name: customerName, customer_phone: customerPhone, created_at: new Date().toISOString(), status: OrderStatus.Pending, items: selectedItems, total_price: grandTotal, vat_rate: vatRate, notes: orderNotes, seller_id: isSeller ? profile?.id : undefined };
                await api.saveOrder(newOrder);
                showToast('Η παραγγελία δημιουργήθηκε.', 'success');
            }
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            localStorage.removeItem(DRAFT_ORDER_KEY);
            onBack();
        } catch (err: any) { showToast(`Σφάλμα: ${err.message}`, 'error'); }
    };

    const handleScanInOrder = (code: string) => {
        const match = findProductByScannedCode(code, products);
        if (match) {
            if (match.product.is_component) { showToast("Δεν επιτρέπεται η προσθήκη εξαρτημάτων.", "error"); } 
            else {
                const targetCode = match.product.sku + (match.variant?.suffix || '');
                setScanInput(targetCode);
                showToast(`Σάρωση: ${targetCode}`, 'success');
                setShowScanner(false);
                setTimeout(() => executeAddItem(), 100);
            }
        } else { showToast(`Ο κωδικός ${code} δεν βρέθηκε.`, 'error'); }
    };

    return (
        <div className="bg-white rounded-3xl shadow-lg border border-slate-100 flex flex-col overflow-hidden animate-in slide-in-from-right duration-300 h-full">
            {/* Header, Customer Details, Smart Entry, etc. */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    {initialOrder ? 'Επεξεργασία Παραγγελίας' : 'Δημιουργία Παραγγελίας'}
                </h2>
                <div className="flex items-center gap-2">
                    <button onClick={onBack} className="px-4 py-2 rounded-xl text-slate-500 hover:bg-slate-100 font-bold">Ακύρωση</button>
                    <button onClick={handleSaveOrder} className="px-6 py-2 rounded-xl bg-[#060b00] text-white hover:bg-black font-bold shadow-md flex items-center gap-2">
                       <Plus size={16}/> {initialOrder ? 'Αποθήκευση' : 'Καταχώρηση'}
                    </button>
                </div>
            </div>
            {/* The rest of the builder UI */}
            <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 overflow-hidden">
                  <div className="lg:col-span-4 space-y-6 overflow-y-auto pr-2 custom-scrollbar border-r border-slate-50">
                      {/* Customer Info */}
                  </div>
                  <div className="lg:col-span-8 flex flex-col h-full bg-slate-50/50 rounded-2xl border border-slate-200 p-6 shadow-inner overflow-y-auto custom-scrollbar">
                      {/* Item list and totals */}
                  </div>
            </div>
             {showScanner && <BarcodeScanner onScan={handleScanInOrder} onClose={() => setShowScanner(false)} continuous={true} />}
        </div>
    );
}
