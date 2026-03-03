
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Product, ProductVariant, Order, OrderItem, Customer, OrderStatus, VatRegime, Collection } from '../../types';
import {
    ArrowLeft, Save, Plus, Search, Trash2, X, ChevronRight, User, Check, AlertCircle,
    ImageIcon, Camera, StickyNote, Minus, Percent, Loader2, FolderKanban, Tag,
    BookOpen, ChevronLeft, ShoppingBag, Hash, ShoppingCart, Pencil
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, SYSTEM_IDS } from '../../lib/supabase';
import { formatCurrency, analyzeSku, getVariantComponents, findProductByScannedCode } from '../../utils/pricingEngine';
import { FINISH_CODES } from '../../constants';
import { normalizedIncludes } from '../../utils/greekSearch';
import { generateOrderId } from '../../utils/orderUtils';
import { getSizingInfo } from '../../utils/sizing';
import { useUI } from '../UIProvider';
import { useAuth } from '../AuthContext';
import BarcodeScanner from '../BarcodeScanner';
import MobileCustomerForm from './MobileCustomerForm';

interface Props {
    onBack: () => void;
    initialOrder: Order | null;
    products: Product[];
    /** When true (e.g. from SellerApp), always set seller_id/seller_name on save regardless of profile.role */
    attachSeller?: boolean;
}

// ─── Color coding helpers (unchanged) ─────────────────────────────────────────
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
    'RZ': 'text-pink-500', 'AK': 'text-cyan-400', 'XAL': 'text-stone-500',
    // Extended stone codes
    'DI': 'text-cyan-300', 'ZI': 'text-indigo-400', 'AG': 'text-amber-600', 'CZ': 'text-violet-500',
    'PE': 'text-white drop-shadow', 'ON': 'text-black', 'LPA': 'text-blue-400', 'MO': 'text-blue-300',
    'GA': 'text-red-400', 'TO': 'text-orange-400', 'AB': 'text-purple-400', 'ST': 'text-sky-600',
    'SP': 'text-fuchsia-600', 'TU': 'text-teal-400', 'XT': 'text-slate-700', 'OT': 'text-yellow-600',
};

const SkuColored = ({ sku, suffix, gender }: { sku: string; suffix?: string; gender: any }) => {
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

// ─── Catalog Inline Browser (Seller Only) ─────────────────────────────────────
type CatalogStep = 'collections' | 'products';

interface CatalogBrowserProps {
    products: Product[];
    collections: Collection[];
    onSelectProduct: (product: Product) => void;
    /** Controlled: when provided, parent owns step/collection so state persists across unmount (e.g. after adding item) */
    step?: CatalogStep;
    onStepChange?: (step: CatalogStep) => void;
    selectedCollection?: Collection | null;
    onCollectionSelect?: (col: Collection | null) => void;
    /** When true, catalog takes more space (taller grid, larger cards) for easier selection */
    expanded?: boolean;
}

const CatalogBrowser: React.FC<CatalogBrowserProps> = ({ products, collections, onSelectProduct, step: controlledStep, onStepChange, selectedCollection: controlledCollection, onCollectionSelect, expanded }) => {
    const [internalStep, setInternalStep] = useState<CatalogStep>('collections');
    const [internalCollection, setInternalCollection] = useState<Collection | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const step = controlledStep !== undefined ? controlledStep : internalStep;
    const setStep = onStepChange || setInternalStep;
    const selectedCollection = controlledCollection !== undefined ? controlledCollection : internalCollection;
    const setSelectedCollection = (col: Collection | null) => {
        if (onCollectionSelect) onCollectionSelect(col);
        else setInternalCollection(col);
    };

    const filteredProducts = useMemo(() => {
        if (!selectedCollection) return [];
        return products
            .filter(p =>
                p.collections?.includes(selectedCollection.id) &&
                !p.is_component &&
                (searchTerm === '' ||
                    p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    p.category.toLowerCase().includes(searchTerm.toLowerCase()))
            )
            .sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true, sensitivity: 'base' }));
    }, [selectedCollection, products, searchTerm]);

    if (step === 'collections') {
        return (
            <div className="space-y-3">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Επιλέξτε Συλλογή</p>
                <div className="grid grid-cols-2 gap-3 landscape:grid-cols-3">
                    {collections.map(col => {
                        const previewProduct = products.find(p => p.collections?.includes(col.id) && p.image_url);
                        const count = products.filter(p => p.collections?.includes(col.id) && !p.is_component).length;
                        return (
                            <button
                                key={col.id}
                                onClick={() => { setSelectedCollection(col); setStep('products'); setSearchTerm(''); }}
                                className="group relative rounded-2xl overflow-hidden border border-slate-100 h-32 bg-slate-100 shadow-sm active:scale-[0.97] transition-transform text-left"
                            >
                                {previewProduct?.image_url && (
                                    <img src={previewProduct.image_url} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="" />
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                                <div className="absolute bottom-0 inset-x-0 p-3">
                                    <div className="text-white font-black text-sm leading-tight truncate">{col.name}</div>
                                    <div className="text-white/60 text-[9px] font-bold mt-0.5">{count} είδη</div>
                                </div>
                            </button>
                        );
                    })}
                    {collections.length === 0 && (
                        <div className="col-span-2 text-center py-8 text-slate-400 text-sm">Δεν υπάρχουν συλλογές.</div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className={`flex flex-col gap-3 ${expanded ? 'flex-1 min-h-0' : ''}`}>
            {/* Sub-header */}
            <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => { setStep('collections'); setSelectedCollection(null); }} className="p-1.5 bg-slate-100 rounded-lg text-slate-500 hover:bg-slate-200 transition-colors">
                    <ChevronLeft size={16} />
                </button>
                <span className="font-black text-slate-800 flex-1 truncate">{selectedCollection?.name}</span>
                <span className="text-[10px] text-slate-400 font-bold">{filteredProducts.length} είδη</span>
            </div>
            {/* Search */}
            <div className="relative shrink-0">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                    type="text"
                    placeholder="Αναζήτηση κωδικού..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-blue-400/20"
                />
            </div>
            {/* Product grid — when expanded, taller and slightly larger cards */}
            <div className={`grid gap-2 overflow-y-auto custom-scrollbar pb-1 flex-1 min-h-0 ${expanded ? 'grid-cols-3 landscape:grid-cols-4 gap-3 max-h-[60vh]' : 'grid-cols-3 landscape:grid-cols-4 max-h-96'}`}>
                {filteredProducts.map(p => (
                    <button
                        key={p.sku}
                        onClick={() => onSelectProduct(p)}
                        className={`group bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm active:scale-95 transition-transform text-left ${expanded ? 'rounded-2xl shadow-md' : ''}`}
                    >
                        <div className="aspect-square bg-slate-50 relative overflow-hidden">
                            {p.image_url
                                ? <img src={p.image_url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt={p.sku} />
                                : <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon size={expanded ? 28 : 20} /></div>
                            }
                        </div>
                        <div className={expanded ? 'p-2' : 'p-1.5'}>
                            <SkuColored sku={p.sku} suffix="" gender={p.gender} />
                            <div className={`text-slate-400 truncate ${expanded ? 'text-[10px] mt-0.5' : 'text-[9px]'}`}>{p.category}</div>
                        </div>
                    </button>
                ))}
                {filteredProducts.length === 0 && (
                    <div className="col-span-3 text-center py-8 text-slate-400 text-xs">Δεν βρέθηκαν προϊόντα.</div>
                )}
            </div>
        </div>
    );
};

// ─── Draft persistence helpers ────────────────────────────────────────────────
const DRAFT_KEY = 'seller_order_draft';

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MobileOrderBuilder({ onBack, initialOrder, products, attachSeller = false }: Props) {
    const { showToast, confirm } = useUI();
    const { user, profile } = useAuth();
    const queryClient = useQueryClient();
    const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: api.getCustomers });
    const { data: collections } = useQuery({ queryKey: ['collections'], queryFn: api.getCollections });

    const isSeller = profile?.role === 'seller';

    // ── Input Mode (seller only): 'sku' | 'catalog' ─────────────────────────
    const [inputMode, setInputMode] = useState<'sku' | 'catalog'>('sku');

    // ── Catalog browser state (lifted so we stay in same collection after adding item) ──
    const [catalogStep, setCatalogStep] = useState<CatalogStep>('collections');
    const [catalogCollection, setCatalogCollection] = useState<Collection | null>(null);

    // ── Order State ──────────────────────────────────────────────────────────
    const [customerName, setCustomerName] = useState(initialOrder?.customer_name || '');
    const [customerPhone, setCustomerPhone] = useState(initialOrder?.customer_phone || '');
    const [customerId, setCustomerId] = useState<string | null>(initialOrder?.customer_id || null);
    const [items, setItems] = useState<OrderItem[]>(() => {
        const baseItems = initialOrder?.items || [];
        return baseItems.map(item => {
            const product = products.find(p => p.sku === item.sku);
            return { ...item, product_details: product || item.product_details };
        });
    });
    const [vatRate, setVatRate] = useState<number>(initialOrder?.vat_rate !== undefined ? initialOrder.vat_rate : VatRegime.Standard);
    const [discountPercent, setDiscountPercent] = useState<number>(initialOrder?.discount_percent || 0);
    const [isSaving, setIsSaving] = useState(false);
    const [orderNotes, setOrderNotes] = useState(initialOrder?.notes || '');
    const [showDraftBanner, setShowDraftBanner] = useState(false);
    const [cartExpanded, setCartExpanded] = useState(true);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editFinish, setEditFinish] = useState('');
    const [editVariantSuffix, setEditVariantSuffix] = useState('');
    const [editSizeInfo, setEditSizeInfo] = useState('');

    // ── SKU Input State ──────────────────────────────────────────────────────
    const [input, setInput] = useState('');
    const [suggestions, setSuggestions] = useState<Product[]>([]);
    const [activeMaster, setActiveMaster] = useState<Product | null>(null);
    const [sizeMode, setSizeMode] = useState<{ type: 'Νούμερο' | 'Μήκος'; sizes: string[] } | null>(null);
    const [selectedSize, setSelectedSize] = useState('');
    const [selectedFinish, setSelectedFinish] = useState<string | null>(null); // step 1: metal (finish) chosen
    const [itemNotes, setItemNotes] = useState('');
    const [qty, setQty] = useState(1);
    const [showScanner, setShowScanner] = useState(false);
    const [showCustSuggestions, setShowCustSuggestions] = useState(false);
    const [showCreateClientScreen, setShowCreateClientScreen] = useState(false);
    const [resolvedVariant, setResolvedVariant] = useState<ProductVariant | null>(null);

    const inputRef = useRef<HTMLInputElement>(null);

    // Group variants by finish (metal) for two-step selection
    const variantsByFinish = useMemo(() => {
        if (!activeMaster?.variants?.length) return {} as Record<string, ProductVariant[]>;
        const map: Record<string, ProductVariant[]> = {};
        const order = ['', 'P', 'X', 'D', 'H'];
        activeMaster.variants.forEach(v => {
            const { finish } = getVariantComponents(v.suffix, activeMaster.gender);
            const code = finish.code ?? '';
            if (!map[code]) map[code] = [];
            map[code].push(v);
        });
        order.forEach(code => { if (map[code]) map[code].sort((a, b) => a.suffix.localeCompare(b.suffix)); });
        return map;
    }, [activeMaster?.variants, activeMaster?.gender]);

    const finishOrder = useMemo(() => {
        const order = ['', 'P', 'X', 'D', 'H'];
        return order.filter(f => variantsByFinish[f]?.length);
    }, [variantsByFinish]);

    const variantsForSelectedFinish = selectedFinish !== null ? (variantsByFinish[selectedFinish] || []) : [];

    const editingItem = editingIndex !== null ? items[editingIndex] : null;
    const editingProduct = useMemo(() => {
        if (!editingItem) return null;
        return products.find(p => p.sku === editingItem.sku) || editingItem.product_details || null;
    }, [editingItem, products]);

    const editingVariants = editingProduct?.variants || [];
    const editingSizeMode = useMemo(() => {
        if (!editingProduct) return null;
        return getSizingInfo(editingProduct);
    }, [editingProduct]);

    const editVariantsByFinish = useMemo(() => {
        if (!editingProduct || editingVariants.length === 0) return {} as Record<string, ProductVariant[]>;
        const map: Record<string, ProductVariant[]> = {};
        const order = ['', 'P', 'X', 'D', 'H'];

        editingVariants.forEach(v => {
            const { finish } = getVariantComponents(v.suffix, editingProduct.gender);
            const code = finish.code ?? '';
            if (!map[code]) map[code] = [];
            map[code].push(v);
        });

        order.forEach(code => {
            if (map[code]) map[code].sort((a, b) => a.suffix.localeCompare(b.suffix));
        });
        return map;
    }, [editingProduct, editingVariants]);

    const editFinishOptions = useMemo(() => {
        const order = ['', 'P', 'X', 'D', 'H'];
        const preferred = order.filter(code => editVariantsByFinish[code]?.length);
        const extras = Object.keys(editVariantsByFinish).filter(code => !order.includes(code));
        return [...preferred, ...extras];
    }, [editVariantsByFinish]);

    const editStoneOptions = useMemo(() => {
        return editVariantsByFinish[editFinish] || [];
    }, [editVariantsByFinish, editFinish]);

    // ── Smart SKU search + full-code resolution (e.g. SK005PAK) ─────────────────
    useEffect(() => {
        const term = input.trim().toUpperCase();
        if (term.length < 2) { setSuggestions([]); return; }
        // If input matches a full product+variant code (e.g. SK005PAK), resolve immediately
        const fullMatch = findProductByScannedCode(term, products);
        if (fullMatch?.variant && fullMatch.product && !fullMatch.product.is_component) {
            setActiveMaster(fullMatch.product);
            setResolvedVariant(fullMatch.variant);
            setSuggestions([]);
            setInput('');
            const sizing = getSizingInfo(fullMatch.product);
            setSizeMode(sizing || null);
            setSelectedSize('');
            setSelectedFinish(null);
            setItemNotes('');
            setQty(1);
            return;
        }
        const results = products.filter(p => {
            if (p.is_component) return false;
            return p.sku.startsWith(term) || (term.length >= 3 && p.sku.includes(term));
        }).slice(0, 10);
        setSuggestions(results);
    }, [input, products]);

    // ── Autosave draft to sessionStorage (new orders only) ──────────────────
    useEffect(() => {
        if (initialOrder) return; // editing existing — no draft logic
        const raw = sessionStorage.getItem(DRAFT_KEY);
        if (raw) {
            try {
                const draft = JSON.parse(raw);
                if (draft.items?.length > 0 || draft.customerName) {
                    setShowDraftBanner(true);
                }
            } catch { }
        }
    }, []);

    const restoreDraft = useCallback(() => {
        const raw = sessionStorage.getItem(DRAFT_KEY);
        if (!raw) return;
        try {
            const draft = JSON.parse(raw);
            if (draft.customerName) setCustomerName(draft.customerName);
            if (draft.customerPhone) setCustomerPhone(draft.customerPhone);
            if (draft.customerId) setCustomerId(draft.customerId);
            if (draft.items?.length) setItems(draft.items);
            if (draft.vatRate !== undefined) setVatRate(draft.vatRate);
            if (draft.discountPercent !== undefined) setDiscountPercent(draft.discountPercent);
            if (draft.orderNotes) setOrderNotes(draft.orderNotes);
        } catch { }
        setShowDraftBanner(false);
    }, []);

    const discardDraft = useCallback(() => {
        sessionStorage.removeItem(DRAFT_KEY);
        setShowDraftBanner(false);
    }, []);

    // Persist draft on every change (new orders only)
    // Strip product_details to avoid QuotaExceededError (base64 image_url can be huge)
    useEffect(() => {
        if (initialOrder) return;
        if (items.length === 0 && !customerName) { sessionStorage.removeItem(DRAFT_KEY); return; }
        try {
            const lightItems = items.map(({ product_details, ...rest }) => rest);
            sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ customerName, customerPhone, customerId, items: lightItems, vatRate, discountPercent, orderNotes }));
        } catch (e) {
            // QuotaExceededError — silently skip; autosave is best-effort
            console.warn('Draft autosave skipped (storage full):', e);
        }
    }, [customerName, customerPhone, customerId, items, vatRate, discountPercent, orderNotes, initialOrder]);

    const handleSelectCustomer = (c: Customer) => {
        setCustomerId(c.id);
        setCustomerName(c.full_name);
        setCustomerPhone(c.phone || '');
        setVatRate(c.vat_rate !== undefined && c.vat_rate !== null ? c.vat_rate : VatRegime.Standard);
        setShowCustSuggestions(false);
    };

    const handleSelectMaster = (p: Product) => {
        setActiveMaster(p);
        setResolvedVariant(null);
        setInput('');
        setSuggestions([]);
        setSelectedFinish(null);
        const sizing = getSizingInfo(p);
        setSizeMode(sizing || null);
        setSelectedSize('');
        setItemNotes('');
        setQty(1);
        setTimeout(() => inputRef.current?.focus(), 100);
    };

    const handleAddItem = (variant: ProductVariant | null) => {
        if (!activeMaster) return;
        const master = activeMaster; // capture before state reset
        const unitPrice = variant?.selling_price || master.selling_price || 0;
        const newItem: OrderItem = {
            sku: master.sku,
            variant_suffix: variant?.suffix,
            quantity: qty,
            price_at_order: unitPrice,
            product_details: master,
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
        showToast(`${master.sku}${variant?.suffix || ''} προστέθηκε`, 'success');
        setResolvedVariant(null);
        setSelectedFinish(null);
        setSelectedSize('');
        setItemNotes('');
        setQty(1);
        setCartExpanded(false);
    };

    // Called from CatalogBrowser when user taps a product
    const handleCatalogSelectProduct = (p: Product) => {
        handleSelectMaster(p);
    };

    const handleScan = (code: string) => {
        const match = findProductByScannedCode(code, products);
        if (match) {
            const { product, variant } = match;
            if (product.is_component) { showToast(`Το ${product.sku} είναι εξάρτημα.`, 'error'); return; }
            const unitPrice = variant?.selling_price || product.selling_price || 0;
            const newItem: OrderItem = { sku: product.sku, variant_suffix: variant?.suffix, quantity: 1, price_at_order: unitPrice, product_details: product };
            setItems(prev => {
                const existingIdx = prev.findIndex(i => i.sku === newItem.sku && i.variant_suffix === newItem.variant_suffix && !i.size_info);
                if (existingIdx >= 0) { const updated = [...prev]; updated[existingIdx].quantity += 1; return updated; }
                return [newItem, ...prev];
            });
            showToast(`Προστέθηκε: ${product.sku}${variant?.suffix || ''}`, 'success');
            setShowScanner(false);
        } else {
            showToast(`Μη έγκυρος κωδικός.`, 'error');
        }
    };

    const updateItemVariantAndSize = (itemIndex: number, nextVariantSuffix: string | undefined, nextSizeInfo: string | undefined) => {
        setItems(prev => {
            if (itemIndex < 0 || itemIndex >= prev.length) return prev;

            const current = prev[itemIndex];
            const product = products.find(p => p.sku === current.sku) || current.product_details;

            let nextPrice = current.price_at_order;
            if (product) {
                if (nextVariantSuffix !== undefined) {
                    const variant = product.variants?.find(v => v.suffix === nextVariantSuffix);
                    nextPrice = variant?.selling_price || product.selling_price || 0;
                } else {
                    nextPrice = product.selling_price || 0;
                }
            }

            const edited: OrderItem = {
                ...current,
                variant_suffix: nextVariantSuffix,
                size_info: nextSizeInfo,
                price_at_order: nextPrice,
                product_details: product || current.product_details
            };

            const mergeIdx = prev.findIndex((candidate, i) =>
                i !== itemIndex &&
                candidate.sku === edited.sku &&
                candidate.variant_suffix === edited.variant_suffix &&
                candidate.size_info === edited.size_info &&
                (candidate.notes || '') === (edited.notes || '')
            );

            if (mergeIdx !== -1) {
                const merged = [...prev];
                merged[mergeIdx] = {
                    ...merged[mergeIdx],
                    quantity: merged[mergeIdx].quantity + edited.quantity
                };
                merged.splice(itemIndex, 1);
                return merged;
            }

            const updated = [...prev];
            updated[itemIndex] = edited;
            return updated;
        });
    };

    const openItemEditor = (idx: number) => {
        const item = items[idx];
        if (!item) return;
        setEditingIndex(idx);

        const product = products.find(p => p.sku === item.sku) || item.product_details;
        const variants = product?.variants || [];

        if (variants.length > 0) {
            const currentSuffix = item.variant_suffix ?? '';
            const safeSuffix = variants.some(v => v.suffix === currentSuffix) ? currentSuffix : variants[0].suffix;
            const { finish } = getVariantComponents(safeSuffix, product?.gender);
            setEditVariantSuffix(safeSuffix);
            setEditFinish(finish.code ?? '');
        } else {
            setEditVariantSuffix('');
            setEditFinish('');
        }

        setEditSizeInfo(item.size_info || '');
    };

    const handleEditFinishChange = (finishCode: string) => {
        setEditFinish(finishCode);
        const options = editVariantsByFinish[finishCode] || [];
        if (options.length === 0) return;
        const hasCurrent = options.some(v => v.suffix === editVariantSuffix);
        setEditVariantSuffix(hasCurrent ? editVariantSuffix : options[0].suffix);
    };

    const closeItemEditor = () => {
        setEditingIndex(null);
        setEditFinish('');
        setEditVariantSuffix('');
        setEditSizeInfo('');
    };

    const handleConfirmItemEdit = () => {
        if (editingIndex === null) return;
        const nextVariant = editingVariants.length > 0 ? editVariantSuffix : undefined;
        updateItemVariantAndSize(editingIndex, nextVariant, editSizeInfo || undefined);
        showToast('Το είδος ενημερώθηκε.', 'success');
        closeItemEditor();
    };

    const subtotal = items.reduce((sum, i) => sum + (i.price_at_order * i.quantity), 0);
    const discountAmount = subtotal * (discountPercent / 100);
    const netAmount = subtotal - discountAmount;
    const vatAmount = netAmount * vatRate;
    const grandTotal = netAmount + vatAmount;

    const performOrderSave = useCallback(async (customerNameVal: string, customerPhoneVal: string, customerIdVal: string | null, vatRateVal: number) => {
        const orderPayload: Order = {
            id: initialOrder?.id || generateOrderId(),
            customer_name: customerNameVal,
            customer_phone: customerPhoneVal,
            customer_id: customerIdVal || undefined,
            seller_id: (attachSeller || isSeller) ? (profile?.id ?? user?.id) : undefined,
            seller_name: (attachSeller || isSeller) ? (profile?.full_name || user?.email || undefined) : undefined,
            items,
            total_price: grandTotal,
            vat_rate: vatRateVal,
            discount_percent: discountPercent,
            status: initialOrder?.status || OrderStatus.Pending,
            created_at: initialOrder?.created_at || new Date().toISOString(),
            notes: orderNotes,
            tags: initialOrder?.tags || []
        };
        if (initialOrder) await api.updateOrder(orderPayload);
        else await api.saveOrder(orderPayload);
        await queryClient.refetchQueries({ queryKey: ['orders'] });
        await queryClient.refetchQueries({ queryKey: ['customers'] });
        sessionStorage.removeItem(DRAFT_KEY);
        onBack();
    }, [initialOrder, items, grandTotal, discountPercent, orderNotes, attachSeller, isSeller, profile?.id, profile?.full_name, user?.id, user?.email, queryClient, onBack]);

    const handleSaveOrder = async () => {
        if (items.length === 0) { showToast('Η παραγγελία είναι κενή.', 'error'); return; }
        if (!customerName) {
            setShowCreateClientScreen(true);
            return;
        }
        setIsSaving(true);
        try {
            await performOrderSave(customerName, customerPhone, customerId, vatRate);
        } catch (e) {
            showToast('Σφάλμα αποθήκευσης', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleCreateClientAndSaveOrder = async (form: Customer) => {
        try {
            const saved = await api.saveCustomer(form);
            if (!saved) { showToast('Σφάλμα αποθήκευσης πελάτη.', 'error'); return; }
            setCustomerId(saved.id);
            setCustomerName(saved.full_name);
            setCustomerPhone(saved.phone || '');
            if (saved.vat_rate !== undefined && saved.vat_rate !== null) setVatRate(saved.vat_rate);
            setShowCreateClientScreen(false);
            setIsSaving(true);
            await performOrderSave(saved.full_name, saved.phone || '', saved.id, saved.vat_rate ?? VatRegime.Standard);
        } catch (e) {
            showToast('Σφάλμα αποθήκευσης', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleBackNav = async () => {
        if (items.length === 0 && !customerName) { sessionStorage.removeItem(DRAFT_KEY); onBack(); return; }
        const choice = await confirm({
            title: 'Αποχώρηση από παραγγελία',
            message: 'Θέλετε να αποθηκεύσετε την παραγγελία πριν φύγετε;',
            isDestructive: false,
            confirmText: 'Αποθήκευση',
            cancelText: 'Απόρριψη και έξοδος'
        });
        if (choice === true) {
            await handleSaveOrder();
        } else if (choice === false) {
            sessionStorage.removeItem(DRAFT_KEY);
            onBack();
        }
        // if null/undefined (dialog dismissed) — stay
    };

    const filteredCustomers = useMemo(() => {
        if (!customers || !customerName) return [];
        return customers.filter(c => normalizedIncludes(c.full_name, customerName) || (c.phone && c.phone.includes(customerName))).slice(0, 5);
    }, [customers, customerName]);

    const emptyCustomer: Customer = { id: '', full_name: '', created_at: '' };

    return (
        <div className="flex flex-col h-full bg-slate-50 relative">

            {/* ── Create Client screen (when saving order without client) ── */}
            {showCreateClientScreen && (
                <MobileCustomerForm
                    customer={emptyCustomer}
                    onSave={handleCreateClientAndSaveOrder}
                    onCancel={() => setShowCreateClientScreen(false)}
                />
            )}

            {/* ── Top Bar ──────────────────────────────────────────── */}
            <div className="bg-white p-4 border-b border-slate-200 flex items-center justify-between shadow-sm shrink-0 z-20">
                {/* Back button — shows warning if items exist */}
                <button
                    onClick={handleBackNav}
                    className={`flex items-center gap-1.5 p-2 -ml-2 rounded-xl transition-colors ${items.length > 0
                        ? 'text-amber-600 hover:bg-amber-50'
                        : 'text-slate-500 hover:bg-slate-100'
                        }`}
                >
                    <ArrowLeft size={22} />
                    {items.length > 0 && <span className="text-[10px] font-black uppercase tracking-wide">Ακύρωση</span>}
                </button>
                <div className="font-black text-slate-800 text-lg">
                    {initialOrder ? `Επεξεργασία #${initialOrder.id.slice(-6)}` : 'Νέα Παραγγελία'}
                </div>
                <button
                    onClick={handleSaveOrder}
                    disabled={isSaving}
                    className="bg-[#060b00] text-white p-2 rounded-xl shadow-md disabled:opacity-50"
                >
                    {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                </button>
            </div>

            {/* Draft restore banner */}
            {showDraftBanner && (
                <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-center gap-3 z-10 shrink-0">
                    <AlertCircle size={16} className="text-amber-600 shrink-0" />
                    <span className="text-xs font-bold text-amber-800 flex-1">Βρέθηκε αναπάντητη παραγγελία — συνέχεια;</span>
                    <button onClick={restoreDraft} className="text-xs font-black text-amber-700 bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-lg">Ναι</button>
                    <button onClick={discardDraft} className="text-xs font-bold text-amber-500 px-1">Όχι</button>
                </div>
            )}

            {/* ── Scrollable Body — portrait/landscape optimized ─────────── */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 custom-scrollbar flex flex-col gap-4 pb-40 landscape:max-w-3xl landscape:mx-auto landscape:px-6">

                {/* Customer Section */}
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 space-y-3">
                    <div className="relative">
                        <div className="flex items-center gap-2 mb-2">
                            <User size={16} className="text-slate-400" />
                            <input
                                className="flex-1 outline-none font-bold text-slate-800 text-base"
                                placeholder="Όνομα Πελάτη..."
                                value={customerName}
                                onChange={e => { setCustomerName(e.target.value); setShowCustSuggestions(true); if (!e.target.value) setCustomerId(null); }}
                                onFocus={() => setShowCustSuggestions(true)}
                            />
                            {customerId && <Check size={16} className="text-emerald-500" />}
                        </div>
                        {showCustSuggestions && customerName && !customerId && filteredCustomers.length > 0 && (
                            <div className="absolute top-full left-0 right-0 bg-white shadow-xl rounded-xl border border-slate-100 mt-1 z-50 overflow-hidden">
                                {filteredCustomers.map(c => (
                                    <div key={c.id} onClick={() => handleSelectCustomer(c)} className="p-3 border-b border-slate-50 font-medium text-sm flex justify-between hover:bg-slate-50 cursor-pointer">
                                        <span>{c.full_name}</span>
                                        <span className="text-slate-400 text-xs">{c.phone}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {/* VAT + Discount */}
                        <div className="flex items-center gap-4 border-t border-slate-50 pt-3">
                            <div className="flex-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">ΦΠΑ</label>
                                <select value={vatRate} onChange={e => setVatRate(parseFloat(e.target.value))} className="w-full p-2 bg-slate-50 rounded-lg text-sm font-bold outline-none border border-slate-100">
                                    <option value={VatRegime.Standard}>24%</option>
                                    <option value={VatRegime.Reduced}>17%</option>
                                    <option value={VatRegime.Zero}>0%</option>
                                </select>
                            </div>
                            <div className="flex-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Έκπτωση (%)</label>
                                <div className="flex items-center gap-2 bg-slate-50 px-2 rounded-lg border border-slate-100">
                                    <input type="number" value={discountPercent} onChange={e => setDiscountPercent(parseFloat(e.target.value) || 0)} className="w-full p-2 bg-transparent text-sm font-bold outline-none text-right" />
                                    <Percent size={14} className="text-slate-400" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Add Item Section ─────────────────────────────────── */}
                {!activeMaster && (
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 space-y-3">

                        {/* Mode Tabs — seller only */}
                        {isSeller && (
                            <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                                <button
                                    onClick={() => setInputMode('sku')}
                                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-black transition-all ${inputMode === 'sku' ? 'bg-white text-[#060b00] shadow-sm' : 'text-slate-400'}`}
                                >
                                    <Hash size={14} /> Κωδικός
                                </button>
                                <button
                                    onClick={() => setInputMode('catalog')}
                                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-black transition-all ${inputMode === 'catalog' ? 'bg-white text-[#060b00] shadow-sm' : 'text-slate-400'}`}
                                >
                                    <FolderKanban size={14} /> Κατάλογος
                                </button>
                            </div>
                        )}

                        {/* SKU Mode */}
                        {inputMode === 'sku' && (
                            <>
                                <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                                    <Search size={20} className="text-slate-400 ml-1" />
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={input}
                                        onChange={e => setInput(e.target.value.toUpperCase())}
                                        onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
                                        placeholder="Κωδικός ή πλήρης κωδ. (π.χ. SK005PAK)"
                                        className="flex-1 bg-transparent p-2 outline-none font-black text-slate-900 uppercase"
                                    />
                                    <button onClick={() => setShowScanner(true)} className="p-2 text-slate-400 hover:text-slate-600">
                                        <Camera size={20} />
                                    </button>
                                </div>
                                {suggestions.length > 0 && (
                                    <div className="space-y-2">
                                        {suggestions.map(p => (
                                            <button key={p.sku} onClick={() => handleSelectMaster(p)} className="w-full text-left p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between active:scale-[0.99] transition-transform">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 bg-white rounded-lg overflow-hidden border border-slate-200 flex items-center justify-center shrink-0">
                                                        {p.image_url ? <img src={p.image_url} className="w-full h-full object-cover" /> : <ImageIcon size={16} className="text-slate-300" />}
                                                    </div>
                                                    <div>
                                                        <SkuColored sku={p.sku} suffix="" gender={p.gender} />
                                                        <div className="text-[10px] text-slate-500 mt-0.5">{p.category}</div>
                                                    </div>
                                                </div>
                                                <ChevronRight size={16} className="text-slate-300" />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}

                        {/* Catalog Mode (seller only) — expanded for easier browsing */}
                        {inputMode === 'catalog' && isSeller && collections && (
                            <div className="min-h-[55vh] max-h-[75vh] flex flex-col -mx-1">
                                <CatalogBrowser
                                    products={products}
                                    collections={collections}
                                    onSelectProduct={handleCatalogSelectProduct}
                                    step={catalogStep}
                                    onStepChange={setCatalogStep}
                                    selectedCollection={catalogCollection}
                                    onCollectionSelect={setCatalogCollection}
                                    expanded
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* ── Variant Selector (active master) — metal then stone carousel or resolved single variant ── */}
                {activeMaster && (
                    <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-[2rem] shadow-xl border border-emerald-100 space-y-4 animate-in zoom-in-95">
                        {/* Header: image + SKU (with suffix when resolved) + back button */}
                        <div className="flex gap-3 items-start shrink-0">
                            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border border-slate-100 bg-slate-50 shrink-0 shadow-sm">
                                {activeMaster.image_url
                                    ? <img src={activeMaster.image_url} className="w-full h-full object-cover" alt={activeMaster.sku} />
                                    : <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon size={28} /></div>
                                }
                            </div>
                            <div className="flex-1 min-w-0">
                                <SkuColored sku={activeMaster.sku} suffix={resolvedVariant?.suffix ?? ''} gender={activeMaster.gender} />
                                <p className="text-[10px] text-slate-400 font-black uppercase mt-0.5">{activeMaster.category}</p>
                                {items.filter(i => i.sku === activeMaster.sku).length > 0 && (
                                    <div className="mt-1.5 text-[9px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                                        <Check size={9} /> {items.filter(i => i.sku === activeMaster.sku).length} προστέθηκαν
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={() => { setActiveMaster(null); setSelectedFinish(null); setResolvedVariant(null); }}
                                className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full shrink-0 transition-colors"
                                title="Επιστροφή στην αναζήτηση"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Size picker — portrait/landscape */}
                        {sizeMode && (
                            <div className="shrink-0">
                                <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">Επιλογή {sizeMode.type}</label>
                                <div className="grid grid-cols-5 sm:grid-cols-6 landscape:grid-cols-6 gap-1.5">
                                    {sizeMode.sizes.map(s => (
                                        <button key={s} onClick={() => setSelectedSize(s === selectedSize ? '' : s)} className={`py-2 sm:py-1.5 rounded-lg text-xs font-bold border ${selectedSize === s ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Quantity — touch-friendly portrait/landscape */}
                        <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl shrink-0">
                            <span className="text-xs font-bold text-slate-500 uppercase">Ποσότητα</span>
                            <div className="flex items-center gap-3 sm:gap-4">
                                <button onClick={() => setQty(Math.max(1, qty - 1))} className="w-9 h-9 sm:w-8 sm:h-8 bg-white rounded-lg shadow-sm text-slate-700 font-bold flex items-center justify-center">−</button>
                                <span className="font-black text-lg min-w-[2ch] text-center">{qty}</span>
                                <button onClick={() => setQty(qty + 1)} className="w-9 h-9 sm:w-8 sm:h-8 bg-white rounded-lg shadow-sm text-slate-700 font-bold flex items-center justify-center">+</button>
                            </div>
                        </div>

                        {/* SKU note taking box */}
                        <div className="shrink-0">
                            <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 flex items-center gap-1.5">
                                <StickyNote size={12} /> Σημείωση γραμμής (προαιρετικό)
                            </label>
                            <div className="flex items-center gap-2 bg-amber-50/80 border border-amber-100 rounded-xl p-2.5 focus-within:ring-2 focus-within:ring-amber-300/50">
                                <input
                                    type="text"
                                    value={itemNotes}
                                    onChange={e => setItemNotes(e.target.value)}
                                    placeholder="π.χ. χρώμα κορδελάς, αποστολή ξεχωριστά..."
                                    className="flex-1 bg-transparent outline-none text-sm text-slate-700 placeholder-slate-400 font-medium min-w-0"
                                />
                            </div>
                        </div>

                        {/* Resolved full code (e.g. SK005PAK): single variant — note + Add only */}
                        {resolvedVariant && (
                            <div className="flex flex-col gap-4 shrink-0">
                                <button
                                    onClick={() => handleAddItem(resolvedVariant)}
                                    className="w-full bg-emerald-600 text-white py-4 rounded-xl font-black text-base flex flex-col items-center gap-1 active:scale-[0.99]"
                                >
                                    <span className="text-white/90 text-xs font-bold">{formatCurrency(resolvedVariant.selling_price || activeMaster.selling_price || 0)}</span>
                                    Προσθήκη
                                </button>
                            </div>
                        )}

                        {/* No variants: single Add */}
                        {!resolvedVariant && (!activeMaster.variants || activeMaster.variants.length === 0) && (
                            <div className="shrink-0">
                                <button onClick={() => handleAddItem(null)} className="w-full bg-emerald-600 text-white py-4 rounded-xl font-black text-base active:scale-[0.99]">
                                    Προσθήκη
                                </button>
                            </div>
                        )}

                        {/* With variants: 1) Metal, 2) Stone carousel */}
                        {!resolvedVariant && activeMaster.variants && activeMaster.variants.length > 0 && (
                            <div className="flex flex-col gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">1. Μέταλλο</label>
                                    <div className="flex flex-wrap gap-2">
                                        {finishOrder.map(code => {
                                            const label = FINISH_CODES[code] ?? (code || 'Λουστρέ');
                                            const count = variantsByFinish[code]?.length ?? 0;
                                            const isSelected = selectedFinish === code;
                                            return (
                                                <button
                                                    key={code || 'lustre'}
                                                    onClick={() => setSelectedFinish(isSelected ? null : code)}
                                                    className={`px-4 py-2.5 rounded-xl text-sm font-black border-2 transition-all active:scale-95 ${isSelected ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                                                >
                                                    {label}
                                                    {count > 1 && <span className="ml-1 opacity-70">({count})</span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {selectedFinish !== null && (
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-black text-slate-400 uppercase">2. Πέτρα / Επιλογή</label>
                                            <button type="button" onClick={() => setSelectedFinish(null)} className="text-xs font-bold text-slate-500 hover:text-slate-700">← Αλλαγή μέταλλου</button>
                                        </div>
                                        {variantsForSelectedFinish.length === 1 ? (
                                            <button
                                                onClick={() => handleAddItem(variantsForSelectedFinish[0])}
                                                className="w-full bg-emerald-600 text-white py-4 rounded-xl font-black text-base flex flex-col items-center gap-1 active:scale-[0.99]"
                                            >
                                                <SkuColored sku="" suffix={variantsForSelectedFinish[0].suffix} gender={activeMaster.gender} />
                                                <span className="text-white/90 text-xs font-bold">{formatCurrency(variantsForSelectedFinish[0].selling_price || 0)}</span>
                                                Προσθήκη
                                            </button>
                                        ) : (
                                            <div className="grid grid-cols-2 gap-2">
                                                {variantsForSelectedFinish.map(v => {
                                                    const { stone } = getVariantComponents(v.suffix, activeMaster.gender);
                                                    const price = v.selling_price || activeMaster.selling_price || 0;
                                                    const stoneColor = STONE_TEXT_COLORS[stone.code] || 'text-violet-600';
                                                    return (
                                                        <button
                                                            key={v.suffix}
                                                            onClick={() => handleAddItem(v)}
                                                            className="flex flex-col items-center justify-center p-3 rounded-2xl border-2 border-slate-100 bg-white hover:border-emerald-400 hover:shadow-md active:scale-95 transition-all text-center gap-1"
                                                        >
                                                            <span className={`text-sm font-black leading-tight ${stoneColor}`}>
                                                                {stone.name || stone.code || '—'}
                                                            </span>
                                                            {stone.name && stone.code && (
                                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-50 border border-slate-100 ${stoneColor}`}>{stone.code}</span>
                                                            )}
                                                            <span className="text-sm font-black text-slate-900 mt-1">{formatCurrency(price)}</span>
                                                            <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">+ Προσθήκη</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Items List (Collapsible Cart) ─────────────────────── */}
                <div className="space-y-2">
                    {/* Cart accordion header */}
                    <button
                        onClick={() => setCartExpanded(v => !v)}
                        className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-2xl border transition-all ${cartExpanded
                            ? 'bg-white border-slate-200 shadow-sm'
                            : items.length > 0
                                ? 'bg-[#060b00] border-[#060b00] text-white shadow-md'
                                : 'bg-white border-slate-200 shadow-sm'
                            }`}
                    >
                        <ShoppingCart size={16} className={cartExpanded ? 'text-slate-500' : items.length > 0 ? 'text-amber-400' : 'text-slate-400'} />
                        <span className={`flex-1 text-left text-xs font-black uppercase tracking-wide ${cartExpanded ? 'text-slate-700' : items.length > 0 ? 'text-white' : 'text-slate-500'
                            }`}>
                            Καλάθι Παραγγελίας
                        </span>
                        {items.length > 0 && (
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${cartExpanded ? 'bg-slate-100 text-slate-600' : 'bg-white/20 text-white'
                                }`}>
                                {items.length} είδη · {formatCurrency(netAmount)}
                            </span>
                        )}
                        <ChevronRight size={14} className={`transition-transform duration-200 ${cartExpanded ? 'rotate-90 text-slate-400' : 'text-slate-400'
                            }`} />
                    </button>

                    {cartExpanded && items.map((item, idx) => (
                        <div key={idx} className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm space-y-3">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-slate-50 rounded-xl overflow-hidden border border-slate-100 shrink-0">
                                    {item.product_details?.image_url
                                        ? <img src={item.product_details.image_url} className="w-full h-full object-cover" />
                                        : <ImageIcon size={20} className="m-auto text-slate-200" />
                                    }
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start">
                                        <SkuColored sku={item.sku} suffix={item.variant_suffix} gender={item.product_details?.gender} />
                                        <div className="flex items-center gap-1">
                                            <button onClick={() => openItemEditor(idx)} className="text-blue-300 hover:text-blue-500 p-1" title="Επεξεργασία SKU">
                                                <Pencil size={15} />
                                            </button>
                                            <button onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-red-300 p-1">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
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

                {/* Notes */}
                <div>
                    <label className="text-xs font-black text-slate-400 uppercase ml-1">Γενικές Σημειώσεις</label>
                    <textarea value={orderNotes} onChange={e => setOrderNotes(e.target.value)} className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-sm h-24 resize-none outline-none mt-1 shadow-inner focus:ring-2 focus:ring-slate-200" />
                </div>
            </div>

            {/* ── Footer Summary ─────────────────────────────────────────── */}
            <div className="p-4 bg-white border-t border-slate-200 shrink-0 sticky bottom-0 z-20 shadow-[0_-4px_10px_rgba(0,0,0,0.03)]">
                <div className="flex justify-between items-center mb-3 px-2">
                    <div>
                        <div className="text-slate-500 text-[10px] font-bold uppercase">Καθαρή Αξία</div>
                        <div className="text-slate-800 font-black text-lg">{formatCurrency(netAmount)}</div>
                    </div>
                    <div className="text-right">
                        <div className="text-slate-500 text-[10px] font-bold uppercase">Με ΦΠΑ ({(vatRate * 100).toFixed(0)}%)</div>
                        <div className="text-slate-900 font-black text-xl">{formatCurrency(grandTotal)}</div>
                    </div>
                </div>
                <button onClick={handleSaveOrder} disabled={isSaving} className="w-full bg-[#060b00] text-white py-4 rounded-2xl font-black text-lg shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-70">
                    {isSaving
                        ? <><Loader2 size={22} className="animate-spin" /> Αποθήκευση...</>
                        : <><Save size={22} /> {initialOrder ? 'Ενημέρωση Παραγγελίας' : 'Αποθήκευση Παραγγελίας'}</>
                    }
                </button>
            </div>

            {editingItem && (
                <div className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-4">
                    <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 sm:p-5 space-y-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-black text-slate-800 uppercase">Επεξεργασία SKU</h3>
                                <p className="text-xs text-slate-500 font-bold mt-1">{editingItem.sku}</p>
                            </div>
                            <button onClick={closeItemEditor} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                                <X size={16} />
                            </button>
                        </div>

                        {editingVariants.length > 0 && (
                            <>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Μέταλλο</label>
                                    <select
                                        value={editFinish}
                                        onChange={e => handleEditFinishChange(e.target.value)}
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-slate-200"
                                    >
                                        {editFinishOptions.map(code => (
                                            <option key={code} value={code}>
                                                {FINISH_CODES[code] || code || 'Λουστρέ'}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Πέτρα</label>
                                    <select
                                        value={editVariantSuffix}
                                        onChange={e => setEditVariantSuffix(e.target.value)}
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-slate-200"
                                    >
                                        {editStoneOptions.map(v => {
                                            const { stone } = getVariantComponents(v.suffix, editingProduct?.gender);
                                            const stoneLabel = stone.name && stone.code
                                                ? `${stone.name} (${stone.code})`
                                                : (stone.name || stone.code || 'Χωρίς πέτρα');
                                            return (
                                                <option key={v.suffix} value={v.suffix}>
                                                    {stoneLabel}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                            </>
                        )}

                        {editingSizeMode && (
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">{editingSizeMode.type}</label>
                                <select
                                    value={editSizeInfo}
                                    onChange={e => setEditSizeInfo(e.target.value)}
                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-slate-200"
                                >
                                    <option value="">Χωρίς {editingSizeMode.type}</option>
                                    {editingSizeMode.sizes.map(size => (
                                        <option key={size} value={size}>{size}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="flex justify-end gap-2 pt-1">
                            <button onClick={closeItemEditor} className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                                Ακύρωση
                            </button>
                            <button onClick={handleConfirmItemEdit} className="px-3 py-2 rounded-xl text-xs font-black text-white bg-[#060b00] hover:bg-black transition-colors">
                                Αποθήκευση
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Saving overlay */}
            {isSaving && (
                <div className="fixed inset-0 z-50 bg-white/70 backdrop-blur-sm flex flex-col items-center justify-center gap-5 animate-in fade-in duration-200">
                    <div className="relative">
                        <div className="w-20 h-20 rounded-full bg-slate-900/10 animate-ping absolute inset-0" />
                        <div className="w-20 h-20 rounded-full bg-white shadow-2xl flex items-center justify-center relative">
                            <Loader2 size={34} className="animate-spin text-slate-800" />
                        </div>
                    </div>
                    <p className="text-base font-black text-slate-700 tracking-widest uppercase">Αποθήκευση...</p>
                </div>
            )}

            {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
        </div>
    );
}
