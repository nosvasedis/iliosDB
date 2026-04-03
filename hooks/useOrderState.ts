import { useState, useRef, useEffect, useMemo } from 'react';
import { Product, ProductVariant, Order, OrderItem, Customer, OrderStatus, VatRegime, Collection } from '../types';
import { useQueryClient } from '@tanstack/react-query';
import { api, RETAIL_CUSTOMER_ID, RETAIL_CUSTOMER_NAME } from '../lib/supabase';
import { formatCurrency, splitSkuComponents, getVariantComponents, findProductByScannedCode } from '../utils/pricingEngine';
import { normalizedIncludes } from '../utils/greekSearch';
import { generateOrderId } from '../utils/orderUtils';
import { getSizingInfo, ProductSizingInfo, SIZE_TYPE_LENGTH, SIZE_TYPE_NUMBER } from '../utils/sizing';
import { useUI } from '../components/UIProvider';
import { useAuth } from '../components/AuthContext';
import { composeNotesWithRetailClient, extractRetailClientFromNotes } from '../utils/retailNotes';
import { assignMissingSpecialCreationLineIds, getOrderItemMatchKey } from '../utils/orderItemMatch';
import { getSpecialCreationProductStub, isSpecialCreationSku, SPECIAL_CREATION_SKU } from '../utils/specialCreationSku';
import { isXrCordEnamelSku } from '../utils/xrOptions';
import {
    buildOrderContextAffinitySkuSet,
    buildProductSearchIndex,
    computeSmartSkuSuggestions,
    getActiveMasterSetMates,
    productMatchesVariantSuffix,
    sortProductsForSuggestions,
    type SmartSuggestionResult,
    type SuggestionRankContext,
} from '../features/orders/smartSkuSuggestions';

const DRAFT_ORDER_KEY = 'ilios_desktop_draft_order';

export const FINISH_COLORS: Record<string, string> = {
    'X': 'text-amber-500',
    'P': 'text-slate-500',
    'D': 'text-orange-500',
    'H': 'text-cyan-400',
    '': 'text-slate-400'
};

export const STONE_TEXT_COLORS: Record<string, string> = {
    'KR': 'text-rose-600', 'QN': 'text-slate-900', 'LA': 'text-blue-600', 'TY': 'text-teal-500',
    'TG': 'text-orange-700', 'IA': 'text-red-700', 'BSU': 'text-slate-800', 'GSU': 'text-emerald-800',
    'RSU': 'text-rose-800', 'MA': 'text-emerald-600', 'FI': 'text-slate-400', 'OP': 'text-indigo-500',
    'NF': 'text-green-700',
    'CO': 'text-teal-600', 'TPR': 'text-emerald-500', 'TKO': 'text-rose-600', 'TMP': 'text-blue-600',
    'PCO': 'text-emerald-400', 'MCO': 'text-purple-500',
    'PAX': 'text-green-500', 'MAX': 'text-blue-600', 'KAX': 'text-red-600', 'AI': 'text-slate-500',
    'AP': 'text-cyan-500', 'AM': 'text-teal-600', 'LR': 'text-indigo-600', 'BST': 'text-sky-400',
    'MP': 'text-blue-400', 'LE': 'text-slate-300', 'PR': 'text-green-400', 'KO': 'text-red-500',
    'MV': 'text-purple-400', 'RZ': 'text-pink-500', 'AK': 'text-cyan-300', 'XAL': 'text-stone-400'
};

interface UseOrderStateProps {
    initialOrder: Order | null;
    products: Product[];
    customers: Customer[];
    collections?: Collection[];
    onBack: () => void;
}

export function useOrderState({ initialOrder, products, customers, collections, onBack }: UseOrderStateProps) {
    const { showToast, confirm } = useUI();
    const { profile } = useAuth();
    const queryClient = useQueryClient();
    const isSeller = profile?.role === 'seller';
    const initialRetailNotes = extractRetailClientFromNotes(initialOrder?.notes);
    const initialIsRetailCustomer = initialOrder?.customer_id === RETAIL_CUSTOMER_ID || initialOrder?.customer_name === RETAIL_CUSTOMER_NAME;

    // --- Customer & Order Meta State ---
    const [customerName, setCustomerName] = useState(initialIsRetailCustomer ? RETAIL_CUSTOMER_NAME : (initialOrder?.customer_name || ''));
    const [customerPhone, setCustomerPhone] = useState(initialIsRetailCustomer ? '' : (initialOrder?.customer_phone || ''));
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(initialOrder?.customer_id || (initialIsRetailCustomer ? RETAIL_CUSTOMER_ID : null));
    const [orderNotes, setOrderNotes] = useState(initialRetailNotes.cleanNotes || '');
    const [retailClientLabel, setRetailClientLabel] = useState(initialRetailNotes.retailClientLabel || '');
    const [vatRate, setVatRate] = useState<number>(initialOrder?.vat_rate !== undefined ? initialOrder.vat_rate : VatRegime.Standard);
    const [discountPercent, setDiscountPercent] = useState<number>(initialOrder?.discount_percent || 0);
    const [selectedItems, setSelectedItems] = useState<OrderItem[]>(() => {
        const items = assignMissingSpecialCreationLineIds(initialOrder?.items || []);
        return items.map(item => {
            if (isSpecialCreationSku(item.sku)) {
                return { ...item, product_details: getSpecialCreationProductStub() };
            }
            const product = products.find(p => p.sku === item.sku);
            return {
                ...item,
                product_details: product || item.product_details
            };
        });
    });
    const [tags, setTags] = useState<string[]>(initialOrder?.tags || []);
    const [tagInput, setTagInput] = useState('');
    const [customerSearch, setCustomerSearch] = useState('');
    const [showCustomerResults, setShowCustomerResults] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // --- Smart Entry State ---
    const [scanInput, setScanInput] = useState('');
    const [scanQty, setScanQty] = useState(1);
    const [itemNotes, setItemNotes] = useState('');
    const [candidateProducts, setCandidateProducts] = useState<Product[]>([]);
    const [smartSuggestions, setSmartSuggestions] = useState<SmartSuggestionResult | null>(null);
    const [recentContextMasterSkus, setRecentContextMasterSkus] = useState<string[]>([]);
    const [activeMaster, setActiveMaster] = useState<Product | null>(null);
    const [filteredVariants, setFilteredVariants] = useState<{ variant: ProductVariant, suffix: string, desc: string }[]>([]);
    const [selectedSize, setSelectedSize] = useState('');
    const [selectedCordColor, setSelectedCordColor] = useState<OrderItem['cord_color']>();
    const [selectedEnamelColor, setSelectedEnamelColor] = useState<OrderItem['enamel_color']>();
    const [sizeMode, setSizeMode] = useState<ProductSizingInfo | null>(null);
    const [showScanner, setShowScanner] = useState(false);
    const [specialCreationUnitPriceStr, setSpecialCreationUnitPriceStr] = useState('');

    // --- Sort & Filter State ---
    const [sortOrder, setSortOrder] = useState<'input' | 'alpha'>('input');
    const [itemSearchTerm, setItemSearchTerm] = useState('');

    // --- Price Sync Indicators ---
    const [priceDiffs, setPriceDiffs] = useState<{ net: number, vat: number, total: number } | null>(null);

    // --- Refs ---
    const inputRef = useRef<HTMLInputElement>(null);

    const productSearchIndex = useMemo(() => buildProductSearchIndex(products, collections), [products, collections]);
    const resolveOrderLineProduct = useMemo(
        () => (sku: string) => products.find((p) => p.sku === sku),
        [products],
    );
    const collectionNameById = useMemo(() => {
        const m: Record<number, string> = {};
        for (const c of collections || []) m[c.id] = c.name;
        return m;
    }, [collections]);

    const activeMasterSetMates = useMemo(() => {
        if (!activeMaster) return [];
        const token = scanInput.trim().split(/\s+/)[0] || '';
        const mates = getActiveMasterSetMates(productSearchIndex, activeMaster, token);
        const upper = token.toUpperCase();
        const masterU = activeMaster.sku.toUpperCase();
        let typedTail: string | null = null;
        if (upper.startsWith(masterU) && upper.length > masterU.length) {
            typedTail = upper.slice(masterU.length);
        }
        const affinitySkus = buildOrderContextAffinitySkuSet(productSearchIndex, recentContextMasterSkus);
        const rankCtx: SuggestionRankContext = {
            searchTerm: activeMaster.sku,
            typedVariant: typedTail,
            orderContextAffinitySkus: affinitySkus.size > 0 ? affinitySkus : undefined,
            ...(selectedItems.length > 0
                ? {
                      orderVariantResolution: {
                          orderItems: selectedItems,
                          resolveProduct: resolveOrderLineProduct,
                      },
                  }
                : {}),
        };
        return sortProductsForSuggestions(mates, rankCtx);
    }, [productSearchIndex, activeMaster, scanInput, selectedItems, recentContextMasterSkus, resolveOrderLineProduct]);

    // --- Draft autosave ---
    useEffect(() => {
        if (!initialOrder) {
            const savedDraft = localStorage.getItem(DRAFT_ORDER_KEY);
            if (savedDraft) {
                try {
                    const draft = JSON.parse(savedDraft);
                    if (draft.timestamp && (Date.now() - draft.timestamp < 86400000)) {
                        const draftCustomerName = draft.customerName || '';
                        const draftSelectedCustomerId = draft.selectedCustomerId || null;
                        const isRetailDraft = draftSelectedCustomerId === RETAIL_CUSTOMER_ID || draftCustomerName === RETAIL_CUSTOMER_NAME;
                        const parsedDraftNotes = extractRetailClientFromNotes(draft.orderNotes || '');

                        setCustomerName(isRetailDraft ? RETAIL_CUSTOMER_NAME : draftCustomerName);
                        setCustomerPhone(isRetailDraft ? '' : (draft.customerPhone || ''));
                        setSelectedCustomerId(isRetailDraft ? RETAIL_CUSTOMER_ID : draftSelectedCustomerId);
                        setOrderNotes(parsedDraftNotes.cleanNotes || '');
                        setRetailClientLabel(draft.retailClientLabel !== undefined ? draft.retailClientLabel : parsedDraftNotes.retailClientLabel);
                        setVatRate(draft.vatRate !== undefined ? draft.vatRate : VatRegime.Standard);
                        setDiscountPercent(draft.discountPercent || 0);
                        const syncedItems = assignMissingSpecialCreationLineIds((draft.selectedItems || []).map((item: any) => {
                            if (isSpecialCreationSku(item.sku)) {
                                return { ...item, product_details: getSpecialCreationProductStub() };
                            }
                            const product = products.find(p => p.sku === item.sku);
                            return {
                                ...item,
                                product_details: product || item.product_details
                            };
                        }));
                        setSelectedItems(syncedItems);
                        setTags(draft.tags || []);
                        showToast('Ανακτήθηκε πρόχειρη παραγγελία.', 'info');
                    }
                } catch (e) {
                    console.error('Failed to load draft order', e);
                }
            }
        }
    }, [initialOrder]);

    useEffect(() => {
        if (!initialOrder) {
            const draftData = {
                customerName, customerPhone, selectedCustomerId,
                orderNotes, retailClientLabel, vatRate, discountPercent, selectedItems, tags,
                timestamp: Date.now()
            };
            localStorage.setItem(DRAFT_ORDER_KEY, JSON.stringify(draftData));
        }
    }, [initialOrder, customerName, customerPhone, selectedCustomerId, orderNotes, retailClientLabel, vatRate, discountPercent, selectedItems, tags]);

    const clearDraft = () => localStorage.removeItem(DRAFT_ORDER_KEY);

    // --- Computed Values ---
    const filteredCustomers = useMemo(() => {
        if (!customers || !customerName) return [];
        return customers.filter(c =>
            normalizedIncludes(c.full_name, customerName) ||
            (c.phone && c.phone.includes(customerName))
        ).slice(0, 5);
    }, [customers, customerName]);

    const displayItems = useMemo(() => {
        // Always sync with latest product details from registry to avoid broken images/stale data
        let items = selectedItems.map(item => {
            if (isSpecialCreationSku(item.sku)) {
                return { ...item, product_details: getSpecialCreationProductStub() };
            }
            const latestProduct = products.find(p => p.sku === item.sku);
            return {
                ...item,
                product_details: latestProduct || item.product_details
            };
        });

        if (itemSearchTerm.trim()) {
            const term = itemSearchTerm.toLowerCase().trim();
            items = items.filter(item => {
                const sku = item.sku.toLowerCase();
                const suffix = (item.variant_suffix || '').toLowerCase();
                const fullSku = (item.sku + (item.variant_suffix || '')).toLowerCase();

                return fullSku.includes(term) ||
                    sku.includes(term) ||
                    suffix.includes(term) ||
                    item.product_details?.category?.toLowerCase().includes(term) ||
                    (item.notes || '').toLowerCase().includes(term);
            });
        }
        if (sortOrder === 'alpha') {
            return items.sort((a, b) => {
                const skuA = a.sku + (a.variant_suffix || '');
                const skuB = b.sku + (b.variant_suffix || '');
                return skuA.localeCompare(skuB, undefined, { numeric: true });
            });
        }
        return items;
    }, [selectedItems, sortOrder, itemSearchTerm]);

    const subtotal = selectedItems.reduce((acc, item) => acc + (item.price_at_order * item.quantity), 0);
    const discountAmount = subtotal * (discountPercent / 100);
    const netAfterDiscount = subtotal - discountAmount;
    const vatAmount = netAfterDiscount * vatRate;
    const grandTotal = netAfterDiscount + vatAmount;

    // --- Customer Actions ---
    const handleSelectCustomer = (c: Customer) => {
        if (c.id === RETAIL_CUSTOMER_ID || c.full_name === RETAIL_CUSTOMER_NAME) {
            handleUseRetailCustomer();
            return;
        }
        setSelectedCustomerId(c.id);
        setCustomerName(c.full_name);
        setCustomerPhone(c.phone || '');
        if (c.vat_rate !== undefined && c.vat_rate !== null) {
            setVatRate(c.vat_rate);
        } else {
            setVatRate(VatRegime.Standard);
        }
        setCustomerSearch('');
        setShowCustomerResults(false);
    };

    const handleUseRetailCustomer = () => {
        setSelectedCustomerId(RETAIL_CUSTOMER_ID);
        setCustomerName(RETAIL_CUSTOMER_NAME);
        setCustomerPhone('');
        setVatRate(VatRegime.Standard);
        setCustomerSearch('');
        setShowCustomerResults(false);
    };

    const handleAddTag = () => {
        if (!tagInput.trim()) return;
        if (!tags.includes(tagInput.trim())) {
            setTags([...tags, tagInput.trim()]);
        }
        setTagInput('');
    };

    const removeTag = (tag: string) => setTags(tags.filter(t => t !== tag));

    // --- Smart Entry Actions ---
    const handleSmartInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawVal = e.target.value.toUpperCase();
        const parts = rawVal.split(/\s+/);
        const skuPart = parts[0];
        const explicitSizePart = parts.length > 1 ? parts[1] : '';

        setScanInput(rawVal);

        if (skuPart.length < 2) {
            setCandidateProducts([]);
            setSmartSuggestions(null);
            setActiveMaster(null);
            setFilteredVariants([]);
            setSizeMode(null);
            setSelectedSize('');
            setSelectedCordColor(undefined);
            setSelectedEnamelColor(undefined);
            return;
        }

        if (skuPart === SPECIAL_CREATION_SKU) {
            setCandidateProducts([]);
            setSmartSuggestions(null);
            setActiveMaster(null);
            setFilteredVariants([]);
            setSizeMode(null);
            setSelectedSize('');
            setSelectedCordColor(undefined);
            setSelectedEnamelColor(undefined);
            return;
        }

        let bestMaster: Product | null = null;
        let suffixPart = '';
        let rawSuffixFromSku = '';

        const exactMaster = products.find(p => p.sku === skuPart && !p.is_component);
        const potentialMasters = products.filter(p => skuPart.startsWith(p.sku) && !p.is_component);
        const longestPrefixMaster = potentialMasters.sort((a, b) => b.sku.length - a.sku.length)[0];

        if (exactMaster) {
            bestMaster = exactMaster;
            suffixPart = '';
            rawSuffixFromSku = '';
        } else if (longestPrefixMaster) {
            bestMaster = longestPrefixMaster;
            rawSuffixFromSku = skuPart.slice(longestPrefixMaster.sku.length);
            suffixPart = rawSuffixFromSku;
        }

        if (bestMaster) {
            setCandidateProducts([bestMaster]);
            setSmartSuggestions(null);
        } else {
            const smart = computeSmartSkuSuggestions({
                index: productSearchIndex,
                skuPart,
                orderContextMasterSkus: recentContextMasterSkus,
                orderItems: selectedItems,
                resolveOrderLineProduct,
            });
            setSmartSuggestions(smart);
            setCandidateProducts(smart?.topChips ?? []);
        }

        if (bestMaster) {
            setActiveMaster(bestMaster);
            setSelectedCordColor(undefined);
            setSelectedEnamelColor(undefined);
            const sizing = getSizingInfo(bestMaster);
            setSizeMode(sizing);

            // Start from the explicit size (second token), but also support inline size
            // like RN045P67 or BR12319 by peeling off the size from the SKU part.
            let sizePart = explicitSizePart;
            let effectiveSuffixPart = suffixPart;

            if (sizing && !sizePart && rawSuffixFromSku) {
                let token = rawSuffixFromSku.toUpperCase();

                // If the product has variants, try to peel off the variant suffix from the token
                if (bestMaster.variants && bestMaster.variants.length > 0) {
                    for (const v of bestMaster.variants) {
                        const variantSuffix = v.suffix.toUpperCase();
                        if (token.startsWith(variantSuffix)) {
                            const remainder = token.slice(variantSuffix.length);
                            effectiveSuffixPart = v.suffix;
                            if (remainder) {
                                sizePart = remainder;
                            }
                            token = remainder || '';
                            break;
                        }
                    }
                }

                // If we still don't have an explicit size and the remaining token looks like a size,
                // interpret it as such (e.g. "67" for rings, "19" / "19CM" for bracelets).
                if (!sizePart && token) {
                    const numeric = /^[0-9]{2,3}$/;
                    const lengthLike = /^[0-9]{2,3}(CM)?$/;
                    if (
                        (sizing.type === SIZE_TYPE_NUMBER && numeric.test(token)) ||
                        (sizing.type === SIZE_TYPE_LENGTH && lengthLike.test(token))
                    ) {
                        sizePart = token;
                    }
                }
            }

            if (sizing && sizePart) {
                const normalizedSize = sizePart.toUpperCase();
                const matchedSize = sizing.sizes.find(stored => {
                    const upperStored = stored.toUpperCase();
                    if (sizing.type === SIZE_TYPE_LENGTH) {
                        const baseStored = upperStored.replace(/CM$/, '');
                        const baseInput = normalizedSize.replace(/CM$/, '');
                        return upperStored === normalizedSize || baseStored === baseInput;
                    }
                    return upperStored === normalizedSize;
                });
                if (matchedSize) {
                    setSelectedSize(matchedSize);
                }
            } else if (!sizePart) {
                setSelectedSize('');
            }

            if (bestMaster.variants) {
                const searchSuffix = (effectiveSuffixPart || '').toUpperCase();
                const validVariants = bestMaster.variants
                    .filter(v => v.suffix.toUpperCase().startsWith(searchSuffix))
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
            setSelectedCordColor(undefined);
            setSelectedEnamelColor(undefined);
        }
    };

    const handleSelectMaster = (p: Product, preferVariantSuffix?: string | null) => {
        const pref = preferVariantSuffix?.trim().toUpperCase() || '';
        const usePref = pref.length > 0 && productMatchesVariantSuffix(p, pref);
        setActiveMaster(p);
        setScanInput(usePref ? p.sku + pref : p.sku);
        setCandidateProducts([p]);
        setSmartSuggestions(null);
        const sizing = getSizingInfo(p);
        if (sizing) { setSizeMode(sizing); setSelectedSize(''); }
        else setSizeMode(null);
        setSelectedCordColor(undefined);
        setSelectedEnamelColor(undefined);
        if (p.variants && p.variants.length > 0) {
            if (usePref) {
                const searchSuffix = pref;
                const validVariants = p.variants
                    .filter(v => v.suffix.toUpperCase().startsWith(searchSuffix))
                    .map(v => ({ variant: v, suffix: v.suffix, desc: v.description }));
                setFilteredVariants(validVariants.length > 0 ? validVariants : p.variants.map(v => ({ variant: v, suffix: v.suffix, desc: v.description })));
            } else {
                setFilteredVariants(p.variants.map(v => ({ variant: v, suffix: v.suffix, desc: v.description })));
            }
        } else {
            setFilteredVariants([]);
        }
        inputRef.current?.focus();
    };

    const _addItemToOrder = (
        master: Product,
        variant: ProductVariant | null,
        qty: number,
        size: string,
        notes: string,
        cordColor?: OrderItem['cord_color'],
        enamelColor?: OrderItem['enamel_color']
    ) => {
        const unitPrice = variant?.selling_price || master.selling_price || 0;
        const newItem: OrderItem = {
            sku: master.sku,
            variant_suffix: variant?.suffix,
            quantity: qty,
            price_at_order: unitPrice,
            price_override: undefined,
            product_details: master,
            size_info: size || undefined,
            cord_color: cordColor,
            enamel_color: enamelColor,
            notes: notes || undefined
        };
        setSelectedItems(prev => {
            const nextKey = getOrderItemMatchKey(newItem);
            const existingIdx = prev.findIndex(i => getOrderItemMatchKey(i) === nextKey);
            if (existingIdx >= 0) {
                const updated = [...prev];
                updated[existingIdx].quantity += qty;
                return updated;
            }
            return [newItem, ...prev];
        });
        if (!isSpecialCreationSku(master.sku)) {
            setRecentContextMasterSkus(prev => {
                const next = [master.sku, ...prev.filter(s => s !== master.sku)];
                return next.slice(0, 12);
            });
        }
        setPriceDiffs(null);
    };

    const handleAddItem = (variant: ProductVariant | null) => {
        if (!activeMaster) return;
        if (!variant) {
            const hasVariants = activeMaster.variants && activeMaster.variants.length > 0;
            const isSingleLustre = hasVariants && activeMaster.variants!.length === 1 && activeMaster.variants![0].suffix === '';
            if (hasVariants && !isSingleLustre) {
                showToast('Παρακαλώ επιλέξτε συγκεκριμένη παραλλαγή.', 'error');
                return;
            }
        }
        if (navigator.vibrate) navigator.vibrate(50);
        showToast(`${activeMaster.sku}${variant?.suffix || ''} προστέθηκε`, 'success');
        _addItemToOrder(activeMaster, variant, scanQty, selectedSize, itemNotes, selectedCordColor, selectedEnamelColor);
        setActiveMaster(null); setScanQty(1); setSelectedSize(''); setItemNotes('');
        setSelectedCordColor(undefined); setSelectedEnamelColor(undefined);
        setSizeMode(null); setScanInput('');
        setCandidateProducts([]); setSmartSuggestions(null); setFilteredVariants([]);
        setTimeout(() => inputRef.current?.focus(), 100);
    };

    const executeAddItem = () => {
        const skuCode = scanInput.split(/\s+/)[0]?.toUpperCase();
        if (!skuCode) return;

        if (skuCode === SPECIAL_CREATION_SKU) {
            const normalized = specialCreationUnitPriceStr.trim().replace(',', '.');
            const unit = parseFloat(normalized);
            if (Number.isNaN(unit) || unit < 0) {
                showToast('Καταχωρήστε έγκυρη μονάδα τιμής (€) για το SP.', 'error');
                return;
            }
            const rounded = Math.round(unit * 100) / 100;
            const newItem: OrderItem = {
                sku: SPECIAL_CREATION_SKU,
                quantity: scanQty,
                price_at_order: rounded,
                product_details: getSpecialCreationProductStub(),
                notes: itemNotes || undefined,
                line_id: crypto.randomUUID()
            };
            setSelectedItems(prev => [newItem, ...prev]);
            setPriceDiffs(null);
            showToast('Προστέθηκε ειδική δημιουργία (SP).', 'success');
            setScanInput('');
            setScanQty(1);
            setItemNotes('');
            setSpecialCreationUnitPriceStr('');
            setActiveMaster(null);
            setCandidateProducts([]);
            setSmartSuggestions(null);
            setFilteredVariants([]);
            setSizeMode(null);
            setSelectedSize('');
            setSelectedCordColor(undefined);
            setSelectedEnamelColor(undefined);
            setTimeout(() => inputRef.current?.focus(), 100);
            return;
        }

        // First, try the standard barcode/SKU resolution logic
        const match = findProductByScannedCode(skuCode, products);

        if (!match) {
            // Fallback: if we're in Smart Entry and have an active master, try to interpret
            // patterns like RN045P67 or BR12319 as [MASTER][VARIANT?][SIZE].
            if (activeMaster) {
                const activeSku = activeMaster.sku.toUpperCase();
                const upperCode = skuCode.toUpperCase();

                if (upperCode.startsWith(activeSku)) {
                    let tail = upperCode.slice(activeSku.length);
                    let chosenVariant: ProductVariant | null = activeMaster.variants?.find(v => v.suffix === '') || null;

                    if (activeMaster.variants && activeMaster.variants.length > 0 && tail) {
                        for (const v of activeMaster.variants) {
                            const variantSuffix = v.suffix.toUpperCase();
                            if (tail.startsWith(variantSuffix)) {
                                chosenVariant = v;
                                tail = tail.slice(variantSuffix.length);
                                break;
                            }
                        }
                    }

                    const sizing = getSizingInfo(activeMaster);
                    let sizeToUse = selectedSize;

                    if (sizing && !sizeToUse && tail) {
                        const normalized = tail.toUpperCase();
                        const matchedSize = sizing.sizes.find(stored => {
                            const upperStored = stored.toUpperCase();
                            if (sizing.type === SIZE_TYPE_LENGTH) {
                                const baseStored = upperStored.replace(/CM$/, '');
                                const baseInput = normalized.replace(/CM$/, '');
                                return upperStored === normalized || baseStored === baseInput;
                            }
                            return upperStored === normalized;
                        });
                        if (matchedSize) {
                            sizeToUse = matchedSize;
                        }
                    }

                    // Sized products must have an explicit or inferred size
                    if (sizing && !sizeToUse) {
                        showToast('Παρακαλώ επιλέξτε μέγεθος.', 'error');
                        return;
                    }

                    if (navigator.vibrate) navigator.vibrate(50);
                    showToast(`${activeMaster.sku}${chosenVariant?.suffix || ''} προστέθηκε`, 'success');
                    _addItemToOrder(activeMaster, chosenVariant, scanQty, sizeToUse, itemNotes, selectedCordColor, selectedEnamelColor);
                    setActiveMaster(null);
                    setScanQty(1);
                    setSelectedSize('');
                    setItemNotes('');
                    setSelectedCordColor(undefined);
                    setSelectedEnamelColor(undefined);
                    setSizeMode(null);
                    setScanInput('');
                    setCandidateProducts([]);
                    setSmartSuggestions(null);
                    setFilteredVariants([]);
                    setTimeout(() => inputRef.current?.focus(), 100);
                    return;
                }
            }

            showToast(`Ο κωδικός ${skuCode} δεν βρέθηκε.`, 'error');
            return;
        }

        const { product, variant } = match;
        if (product.is_component) {
            showToast(`Το ${product.sku} είναι εξάρτημα και δεν διατίθεται για πώληση.`, 'error');
            return;
        }
        if (!variant) {
            const hasVariants = product.variants && product.variants.length > 0;
            const isSingleLustre = hasVariants && product.variants!.length === 1 && product.variants![0].suffix === '';
            if (hasVariants && !isSingleLustre) {
                showToast('Παρακαλώ επιλέξτε συγκεκριμένη παραλλαγή.', 'error');
                setActiveMaster(product);
                setCandidateProducts([product]);
                setSmartSuggestions(null);
                if (product.variants) {
                    setFilteredVariants(product.variants.map(v => ({ variant: v, suffix: v.suffix, desc: v.description })));
                }
                return;
            }
        }
        _addItemToOrder(product, variant ?? null, scanQty, selectedSize, itemNotes, selectedCordColor, selectedEnamelColor);
        setScanInput('');
        setScanQty(1);
        setItemNotes('');
        setSelectedSize('');
        setSelectedCordColor(undefined);
        setSelectedEnamelColor(undefined);
        setCandidateProducts([]);
        setSmartSuggestions(null);
        setActiveMaster(null);
        setFilteredVariants([]);
        setSizeMode(null);
        inputRef.current?.focus();
        showToast('Το προϊόν προστέθηκε.', 'success');
    };

    const handleScanInOrder = (code: string) => {
        if (code.trim().toUpperCase() === SPECIAL_CREATION_SKU) {
            showToast('Για SP χρησιμοποιήστε την έξυπνη είσοδο: κωδικός SP, τιμή μονάδας και Enter.', 'error');
            return;
        }
        const match = findProductByScannedCode(code, products);
        if (match) {
            if (match.product.is_component) {
                showToast('Δεν επιτρέπεται η προσθήκη εξαρτημάτων στην εντολή.', 'error');
            } else {
                const { product, variant } = match;
                if (!variant) {
                    const hasVariants = product.variants && product.variants.length > 0;
                    const isSingleLustre = hasVariants && product.variants!.length === 1 && product.variants![0].suffix === '';
                    if (hasVariants && !isSingleLustre) {
                        showToast(`Ο κωδικός ${code} είναι Master. Παρακαλώ σκανάρετε την παραλλαγή.`, 'error');
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
                        i.sku === newItem.sku && i.variant_suffix === newItem.variant_suffix && !i.size_info
                    );
                    if (existingIdx >= 0) {
                        const updated = [...prev];
                        updated[existingIdx].quantity += 1;
                        return updated;
                    }
                    return [newItem, ...prev];
                });
                setRecentContextMasterSkus(prev => {
                    const next = [product.sku, ...prev.filter(s => s !== product.sku)];
                    return next.slice(0, 12);
                });
                showToast(`Προστέθηκε: ${product.sku}${variant?.suffix || ''}`, 'success');
                setShowScanner(false);
            }
        } else {
            showToast(`Ο κωδικός ${code} δεν βρέθηκε.`, 'error');
        }
    };

    // --- Item Mutation Actions ---
    const updateQuantity = (item: OrderItem, qty: number) => {
        const idx = selectedItems.findIndex(i => getOrderItemMatchKey(i) === getOrderItemMatchKey(item));
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
        setPriceDiffs(null);
    };

    const updateItemNotes = (item: OrderItem, notes: string) => {
        const idx = selectedItems.findIndex(i => getOrderItemMatchKey(i) === getOrderItemMatchKey(item));
        if (idx === -1) return;
        setSelectedItems(prev => {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], notes: notes || undefined };
            return updated;
        });
    };

    const updateItemUnitPrice = (item: OrderItem, rawPrice: number) => {
        const idx = selectedItems.findIndex(i => getOrderItemMatchKey(i) === getOrderItemMatchKey(item));
        if (idx === -1) return;
        const price = Math.max(0, Math.round(rawPrice * 100) / 100);

        const product = products.find(p => p.sku === item.sku) || item.product_details;
        let catalogPrice = item.price_at_order;
        if (!isSpecialCreationSku(item.sku) && product) {
            if (item.variant_suffix !== undefined && item.variant_suffix !== null) {
                const variant = product.variants?.find(v => v.suffix === item.variant_suffix);
                catalogPrice = variant?.selling_price || product.selling_price || item.price_at_order;
            } else {
                catalogPrice = product.selling_price || item.price_at_order;
            }
        }
        const isOverride = !isSpecialCreationSku(item.sku) && Math.abs(price - catalogPrice) > 0.01;

        setSelectedItems(prev => {
            const updated = [...prev];
            const i = prev.findIndex(r => getOrderItemMatchKey(r) === getOrderItemMatchKey(item));
            if (i === -1) return prev;
            updated[i] = { ...updated[i], price_at_order: price, price_override: isOverride ? true : undefined };
            return updated;
        });
        setPriceDiffs(null);
    };

    const updateItemVariantAndSize = (
        item: OrderItem,
        nextVariantSuffix: string | undefined,
        nextSizeInfo: string | undefined,
        nextCordColor?: OrderItem['cord_color'],
        nextEnamelColor?: OrderItem['enamel_color']
    ) => {
        const idx = selectedItems.findIndex(i => getOrderItemMatchKey(i) === getOrderItemMatchKey(item));
        if (idx === -1) return;
        if (isSpecialCreationSku(item.sku)) {
            showToast('Το SP δεν έχει παραλλαγές καταλόγου — αλλάξτε μόνο την τιμή ή τις σημειώσεις.', 'info');
            return;
        }

        setSelectedItems(prev => {
            const dynamicIdx = prev.findIndex(i => getOrderItemMatchKey(i) === getOrderItemMatchKey(item));
            if (dynamicIdx === -1) return prev;

            const current = prev[dynamicIdx];
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
                cord_color: nextCordColor,
                enamel_color: nextEnamelColor,
                price_at_order: nextPrice,
                price_override: undefined,
                product_details: product || current.product_details
            };

            const mergeIdx = prev.findIndex((candidate, i) =>
                i !== dynamicIdx &&
                getOrderItemMatchKey(candidate) === getOrderItemMatchKey(edited)
            );

            if (mergeIdx !== -1) {
                const merged = [...prev];
                merged[mergeIdx] = {
                    ...merged[mergeIdx],
                    quantity: merged[mergeIdx].quantity + edited.quantity
                };
                merged.splice(dynamicIdx, 1);
                return merged;
            }

            const updated = [...prev];
            updated[dynamicIdx] = edited;
            return updated;
        });
        setPriceDiffs(null);
        showToast('Το είδος ενημερώθηκε.', 'success');
    };

    const handleRemoveItem = (item: OrderItem) => {
        const idx = selectedItems.findIndex(i => getOrderItemMatchKey(i) === getOrderItemMatchKey(item));
        if (idx !== -1) setSelectedItems(prev => prev.filter((_, i) => i !== idx));
        setPriceDiffs(null);
    };

    const handleRecalculatePrices = () => {
        const oldSub = selectedItems.reduce((acc, item) => acc + (item.price_at_order * item.quantity), 0);
        const oldNet = oldSub * (1 - discountPercent / 100);
        const oldVat = oldNet * vatRate;
        const oldTotal = oldNet + oldVat;

        let updatedCount = 0;
        const newItems = selectedItems.map(item => {
            if (isSpecialCreationSku(item.sku)) return item;
            const product = products.find(p => p.sku === item.sku);
            if (!product) return item;
            let currentRegistryPrice = 0;
            const hasSuffix = item.variant_suffix !== undefined && item.variant_suffix !== null;
            if (hasSuffix) {
                const variant = product.variants?.find(v => v.suffix === item.variant_suffix);
                currentRegistryPrice = variant?.selling_price || 0;
            }
            if (currentRegistryPrice === 0) currentRegistryPrice = product.selling_price;
            const hasPriceDiff = currentRegistryPrice > 0 && Math.abs(currentRegistryPrice - item.price_at_order) > 0.01;
            if (hasPriceDiff || item.price_override) {
                updatedCount++;
                return { ...item, price_at_order: currentRegistryPrice, price_override: undefined };
            }
            return item;
        });

        const newSub = newItems.reduce((acc, item) => acc + (item.price_at_order * item.quantity), 0);
        const newNet = newSub * (1 - discountPercent / 100);
        const newVat = newNet * vatRate;
        const newTotal = newNet + newVat;
        setPriceDiffs({ net: newNet - oldNet, vat: newVat - oldVat, total: newTotal - oldTotal });

        if (updatedCount > 0) {
            setSelectedItems(newItems);
            showToast(`Ενημερώθηκαν οι τιμές σε ${updatedCount} είδη.`, 'success');
        } else {
            showToast('Οι τιμές είναι ήδη επίκαιρες.', 'info');
        }
    };

    // --- Order Save ---
    const handleSaveOrder = async () => {
        if (!customerName) { showToast('Το όνομα πελάτη είναι υποχρεωτικό.', 'error'); return; }
        if (selectedItems.length === 0) { showToast('Προσθέστε τουλάχιστον ένα προϊόν.', 'error'); return; }
        setIsSaving(true);
        try {
            const isRetailOrder = selectedCustomerId === RETAIL_CUSTOMER_ID || customerName.trim() === RETAIL_CUSTOMER_NAME;
            const effectiveCustomerId = isRetailOrder ? RETAIL_CUSTOMER_ID : (selectedCustomerId || undefined);
            const effectiveCustomerName = isRetailOrder ? RETAIL_CUSTOMER_NAME : customerName;
            const effectiveCustomerPhone = isRetailOrder ? '' : customerPhone;
            const composedNotes = isRetailOrder ? composeNotesWithRetailClient(orderNotes, retailClientLabel) : orderNotes;

            if (initialOrder) {
                const updatedOrder: Order = {
                    ...initialOrder,
                    customer_id: effectiveCustomerId,
                    customer_name: effectiveCustomerName,
                    customer_phone: effectiveCustomerPhone,
                    items: selectedItems,
                    total_price: grandTotal,
                    vat_rate: vatRate,
                    discount_percent: discountPercent,
                    notes: composedNotes,
                    tags
                };

                let isNewPart: boolean | undefined = undefined;
                const isInProduction =
                    initialOrder.status === OrderStatus.InProduction ||
                    initialOrder.status === OrderStatus.Ready;

                if (isInProduction) {
                    const choice = await confirm({
                        title: 'Τύπος Αλλαγής',
                        message:
                            'Αυτές οι αλλαγές αποτελούν νέο τμήμα παραγγελίας ή είναι τροποποιήσεις του υπάρχοντος τμήματος;',
                        confirmText: 'Νέο Τμήμα',
                        thirdOptionText: 'Τροποποίηση',
                        cancelText: 'Ακύρωση',
                    });
                    if (choice === null) {
                        // User cancelled — abort the save
                        setIsSaving(false);
                        return;
                    }
                    isNewPart = choice === true;
                }

                await api.updateOrder(updatedOrder, isNewPart);
                showToast('Η παραγγελία ενημερώθηκε.', 'success');
            } else {
                const newOrderId = generateOrderId();
                const newOrder: Order = {
                    id: newOrderId,
                    customer_id: effectiveCustomerId,
                    customer_name: effectiveCustomerName,
                    customer_phone: effectiveCustomerPhone,
                    seller_id: isSeller ? profile?.id : undefined,
                    created_at: new Date().toISOString(),
                    status: OrderStatus.Pending,
                    items: selectedItems,
                    total_price: grandTotal,
                    vat_rate: vatRate,
                    discount_percent: discountPercent,
                    notes: composedNotes,
                    tags
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

    const handleBack = () => { clearDraft(); onBack(); };

    // Derived helpers for the SKU visualizer in SmartEntryPanel
    const getSkuComponents = (text: string, masterContext: Product | null) => {
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
        return { masterStr, suffixStr, finish, stone };
    };

    return {
        state: {
            // Customer
            customerName, customerPhone, selectedCustomerId,
            orderNotes, retailClientLabel, vatRate, discountPercent, tags, tagInput,
            customerSearch, showCustomerResults, isSaving,
            isRetailCustomer: selectedCustomerId === RETAIL_CUSTOMER_ID || customerName.trim() === RETAIL_CUSTOMER_NAME,
            // Smart entry
            scanInput, scanQty, itemNotes, specialCreationUnitPriceStr,
            candidateProducts, smartSuggestions, activeMasterSetMates, collectionNameById,
            resolveOrderLineProduct,
            activeMaster, filteredVariants,
            selectedSize, selectedCordColor, selectedEnamelColor, sizeMode, showScanner,
            // Sort/filter
            sortOrder, itemSearchTerm,
            // Price diffs
            priceDiffs,
            // Computed
            filteredCustomers, displayItems,
            subtotal, discountAmount, netAfterDiscount, vatAmount, grandTotal,
            selectedItems,
            isEditing: !!initialOrder,
            orderId: initialOrder?.id,
        },
        setters: {
            setCustomerName, setCustomerPhone, setSelectedCustomerId,
            setOrderNotes, setRetailClientLabel, setVatRate, setDiscountPercent, setTagInput,
            setCustomerSearch, setShowCustomerResults,
            setScanInput, setScanQty, setItemNotes, setSpecialCreationUnitPriceStr,
            setActiveMaster, setFilteredVariants, setSelectedSize, setSelectedCordColor, setSelectedEnamelColor,
            setSizeMode, setCandidateProducts, setSmartSuggestions, setShowScanner,
            setSortOrder, setItemSearchTerm,
        },
        actions: {
            handleSelectCustomer, handleUseRetailCustomer, handleAddTag, removeTag,
            handleSmartInput, handleSelectMaster,
            handleAddItem, executeAddItem, handleScanInOrder,
            updateQuantity, updateItemNotes, updateItemUnitPrice, updateItemVariantAndSize, handleRemoveItem,
            handleRecalculatePrices, handleSaveOrder, handleBack,
            getSkuComponents,
        },
        refs: { inputRef },
    };
}
