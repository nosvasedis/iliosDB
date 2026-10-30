import { resolveSkuSizeInput } from '../utils/skuSizeInput';
import { useRestartDraft } from './useRestartBlocker';
import { orderItemsDraftSnapshot } from '../lib/editorSnapshots';
import { buildOrderCustomerFields, getRetailClientName, isRetailCustomerOrder } from '../utils/orderCustomer';
import { useState, useRef, useEffect, useMemo } from 'react';
import { Product, ProductVariant, Order, OrderItem, Customer, OrderStatus, VatRegime, Collection, ItemPriceDelta, PriceChangeRecord, PriceSyncPreview } from '../types';
import { useQueryClient } from '@tanstack/react-query';
import { api, INTERNAL_CUSTOMER_ID, INTERNAL_CUSTOMER_NAME, RETAIL_CUSTOMER_ID, RETAIL_CUSTOMER_NAME } from '../lib/supabase';
import { formatCurrency, splitSkuComponents, getVariantComponents, findProductByScannedCode } from '../utils/pricingEngine';
import { normalizedIncludes } from '../utils/greekSearch';
import { generateOrderId } from '../utils/orderUtils';
import { getSizingInfo, ProductSizingInfo } from '../utils/sizing';
import { useUI } from '../components/UIProvider';
import { useAuth } from '../components/AuthContext';
import { extractRetailClientFromNotes } from '../utils/retailNotes';
import { assignMissingOrderLineIds, getOrderItemMatchKey } from '../utils/orderItemMatch';
import {
    cleanSpecialCreationNote,
    findSpecialCreationItemsMissingNotes,
    getSpecialCreationProductStub,
    isSpecialCreationSku,
    SPECIAL_CREATION_SKU,
} from '../utils/specialCreationSku';
import { isXrCordEnamelSku } from '../utils/xrOptions';
import { generateOrderPriceSyncPreview } from '../utils/productionPricingUtils';
import {
    productHasVariantPrefix,
    searchMastersByPrefix,
    type SkuPrefixMatches,
} from '../features/orders/skuPrefixSearch';
import { dispatchLiveActivity } from './useLiveActivity';
import { buildProductLinkIndex, findMissingSetMates, getLinkedSkus, type MissingSetMate } from '../features/products/productLinks';
import { invalidateAndRefetchAfterOrderMutation } from '../lib/queryInvalidation';
import { calculateOrderFinancials } from '../features/orders/orderFinancials';
import {
    allowsNewProductionPartOrderEdit,
    orderNeedsProductionEditDialog,
    PRODUCTION_EDIT_CHOICE_MESSAGE,
    PRODUCTION_EDIT_NEW_PART_HINT,
} from '../features/production/orderProductionEdit';
import {
    buildOrderRangeAddEntries,
    resolveOrderRangeInput,
    type OrderRangeResolution,
} from '../features/orders/orderRangeEntry';

import { getOrderCatalogPrice, getOrderPriceMode, setOrderItemsPriceMode, type OrderPriceMode } from '../utils/orderPricing';

const DRAFT_ORDER_KEY = 'ilios_desktop_draft_order';

export const FINISH_COLORS: Record<string, string> = {
    'X': 'text-amber-500',
    'P': 'text-slate-500',
    'D': 'text-orange-500',
    'H': 'text-cyan-400',
    '': 'text-slate-400'
};

export const STONE_TEXT_COLORS: Record<string, string> = {
    'CI': 'text-yellow-600', 'MUL': 'text-fuchsia-600',
    'KR': 'text-rose-600', 'QN': 'text-slate-900', 'LA': 'text-blue-600', 'TY': 'text-teal-500',
    'TG': 'text-orange-700', 'IA': 'text-red-700', 'BSU': 'text-slate-800', 'GSU': 'text-emerald-800',
    'RSU': 'text-rose-800', 'MA': 'text-emerald-600', 'FI': 'text-slate-400', 'OP': 'text-indigo-500',
    'NF': 'text-green-700',
    'CO': 'text-teal-600', 'COMG': 'text-rose-400', 'MG': 'text-rose-300',
    'TPR': 'text-emerald-500', 'TKO': 'text-rose-600', 'TMP': 'text-blue-600',
    'PCO': 'text-emerald-400', 'MCO': 'text-purple-500',
    'PAX': 'text-green-500', 'MAX': 'text-blue-600', 'KAX': 'text-red-600', 'AI': 'text-slate-500',
    'AP': 'text-cyan-500', 'AM': 'text-teal-600', 'AZM': 'text-teal-600', 'LR': 'text-indigo-600', 'SB': 'text-sky-400',
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
    const initialIsRetailCustomer = !!initialOrder && isRetailCustomerOrder(initialOrder);

    // --- Customer & Order Meta State ---
    const [customerName, setCustomerName] = useState(initialIsRetailCustomer ? RETAIL_CUSTOMER_NAME : (initialOrder?.customer_name || ''));
    const [customerPhone, setCustomerPhone] = useState(initialOrder?.customer_phone || '');
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(initialOrder?.customer_id || (initialIsRetailCustomer ? RETAIL_CUSTOMER_ID : null));
    const [orderNotes, setOrderNotes] = useState(initialRetailNotes.cleanNotes || '');
    const [retailClientLabel, setRetailClientLabel] = useState(initialOrder && isRetailCustomerOrder(initialOrder) ? getRetailClientName(initialOrder) : '');
    const [vatRate, setVatRate] = useState<number>(initialOrder?.vat_rate !== undefined ? initialOrder.vat_rate : VatRegime.Standard);
    const [discountPercent, setDiscountPercent] = useState<number>(initialOrder?.discount_percent || 0);
    const [selectedItems, setSelectedItems] = useState<OrderItem[]>(() => {
        const items = assignMissingOrderLineIds(initialOrder?.items || []);
        return items.map(item => {
            if (isSpecialCreationSku(item.sku)) {
                return { ...item, product_details: getSpecialCreationProductStub() };
            }
            const product = products.find(p => p.sku === item.sku);
            return {
                ...item,
                fulfillment_mode: item.fulfillment_mode || 'sale',
                product_details: product || item.product_details
            };
        });
    });
    const [priceMode, setPriceMode] = useState<OrderPriceMode>(() => getOrderPriceMode(initialOrder?.items || []));
    const handlePriceModeChange = (mode: OrderPriceMode) => {
        setPriceMode(mode);
        setSelectedItems(prev => setOrderItemsPriceMode(prev, products, mode));
        setPriceDiffs(null);
    };
    const [tags, setTags] = useState<string[]>(initialOrder?.tags || []);
    const [tagInput, setTagInput] = useState('');
    const [customerSearch, setCustomerSearch] = useState('');
    const [showCustomerResults, setShowCustomerResults] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // --- Seller / Πλασιέ State (admin can assign, seller auto-assigns) ---
    const [selectedSellerId, setSelectedSellerId] = useState<string | undefined>(initialOrder?.seller_id || (isSeller ? profile?.id : undefined));
    const [selectedSellerName, setSelectedSellerName] = useState<string | undefined>(initialOrder?.seller_name || (isSeller ? (profile?.full_name || profile?.email) : undefined));
    const [sellerCommissionPercent, setSellerCommissionPercent] = useState<number | undefined>(initialOrder?.seller_commission_percent ?? (isSeller ? profile?.commission_percent : undefined));

    // --- Smart Entry State ---
    const [scanInput, setScanInput] = useState('');
    const [scanQty, setScanQty] = useState(1);
    const [defaultFulfillmentMode, setDefaultFulfillmentMode] = useState<'sale' | 'consignment'>('sale');
    const [itemNotes, setItemNotes] = useState('');
    const [candidateProducts, setCandidateProducts] = useState<Product[]>([]);
    const [skuMatches, setSkuMatches] = useState<SkuPrefixMatches | null>(null);
    const [activeMaster, setActiveMaster] = useState<Product | null>(null);
    const [filteredVariants, setFilteredVariants] = useState<{ variant: ProductVariant, suffix: string, desc: string }[]>([]);
    const [selectedSize, setSelectedSize] = useState('');
    const [selectedCordColor, setSelectedCordColor] = useState<OrderItem['cord_color']>();
    const [selectedEnamelColor, setSelectedEnamelColor] = useState<OrderItem['enamel_color']>();
    const [sizeMode, setSizeMode] = useState<ProductSizingInfo | null>(null);
    const [showScanner, setShowScanner] = useState(false);
    const [specialCreationUnitPriceStr, setSpecialCreationUnitPriceStr] = useState('');
    const [pendingOrderRangeReview, setPendingOrderRangeReview] = useState<OrderRangeResolution | null>(null);

    // --- Sort & Filter State ---
    const [sortOrder, setSortOrder] = useState<'input' | 'alpha'>('input');
    const [itemSearchTerm, setItemSearchTerm] = useState('');

    // --- Price Sync Indicators ---
    const [priceDiffs, setPriceDiffs] = useState<{ net: number, vat: number, total: number, itemDeltas: ItemPriceDelta[] } | null>(null);

    // --- Persistent Price Change Log ---
    const [priceChangeLog, setPriceChangeLog] = useState<PriceChangeRecord[]>(initialOrder?.price_change_log || []);

    // --- Refs ---
    const inputRef = useRef<HTMLInputElement>(null);

    const collectionNameById = useMemo(() => {
        const m: Record<number, string> = {};
        for (const c of collections || []) m[c.id] = c.name;
        return m;
    }, [collections]);


    // Συνδεδεμένα Προϊόντα: set-mates of the active master and of the last added line.
    const linkIndex = useMemo(() => buildProductLinkIndex(products), [products]);
    const productsBySku = useMemo(() => new Map((products || []).map((product) => [product.sku, product])), [products]);
    const [lastAddedForSet, setLastAddedForSet] = useState<{ sku: string; suffix: string } | null>(null);

    const orderRangePreview = useMemo(() => {
        const skuCode = scanInput.split(/\s+/)[0]?.toUpperCase();
        if (!skuCode || !skuCode.includes('-')) return null;
        return resolveOrderRangeInput(skuCode, products);
    }, [scanInput, products]);

    useRestartDraft('Παραγγελία', { customerName, customerPhone, selectedCustomerId, orderNotes, retailClientLabel, vatRate, discountPercent, items: orderItemsDraftSnapshot(selectedItems), tags, priceMode, selectedSellerId, selectedSellerName, sellerCommissionPercent, itemNotes, selectedSize, selectedCordColor, selectedEnamelColor, specialCreationUnitPriceStr, scanInput, scanQty, defaultFulfillmentMode, tagInput, priceChangeLog }, { busy: isSaving, identity: initialOrder?.id });

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
                        setCustomerPhone(draft.customerPhone || '');
                        setSelectedCustomerId(isRetailDraft ? RETAIL_CUSTOMER_ID : draftSelectedCustomerId);
                        setOrderNotes(parsedDraftNotes.cleanNotes || '');
                        setRetailClientLabel(draft.retailClientLabel !== undefined ? draft.retailClientLabel : parsedDraftNotes.retailClientLabel);
                        setVatRate(draft.vatRate !== undefined ? draft.vatRate : VatRegime.Standard);
                        setDiscountPercent(draft.discountPercent || 0);
                        const syncedItems = assignMissingOrderLineIds((draft.selectedItems || []).map((item: any) => {
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
                        setPriceMode(draft.priceMode || getOrderPriceMode(syncedItems));
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
                orderNotes, retailClientLabel, vatRate, discountPercent, selectedItems, tags, priceMode,
                timestamp: Date.now()
            };
            localStorage.setItem(DRAFT_ORDER_KEY, JSON.stringify(draftData));
        }
    }, [initialOrder, customerName, customerPhone, selectedCustomerId, orderNotes, retailClientLabel, vatRate, discountPercent, selectedItems, tags, priceMode]);

    const clearDraft = () => localStorage.removeItem(DRAFT_ORDER_KEY);

    // --- Computed Values ---
    const filteredCustomers = useMemo(() => {
        if (!customers || !customerName) return [];
        return customers.filter(c => !(isSeller && c.id === INTERNAL_CUSTOMER_ID)).filter(c =>
            normalizedIncludes(c.full_name, customerName) ||
            (c.phone && c.phone.includes(customerName))
        ).slice(0, 5);
    }, [customers, customerName, isSeller]);

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

    const financials = calculateOrderFinancials(selectedItems, discountPercent, vatRate);
    const subtotal = financials.saleSubtotal;
    const discountAmount = financials.discountAmount;
    const netAfterDiscount = financials.saleNet;
    const vatAmount = financials.saleVat;
    const grandTotal = financials.payableNow;

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

    /** Order for our own stock: not a sale (excluded from stats, commissions and invoices). */
    const handleUseInternalCustomer = () => {
        setSelectedCustomerId(INTERNAL_CUSTOMER_ID);
        setCustomerName(INTERNAL_CUSTOMER_NAME);
        setCustomerPhone('');
        setRetailClientLabel('');
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

    const resetSmartEntryState = () => {
        setActiveMaster(null);
        setScanQty(1);
        setSelectedSize('');
        setItemNotes('');
        setSelectedCordColor(undefined);
        setSelectedEnamelColor(undefined);
        setSizeMode(null);
        setScanInput('');
        setCandidateProducts([]);
        setSkuMatches(null);
        setFilteredVariants([]);
    };

    // --- Smart Entry Actions ---
    const handleSmartInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawVal = e.target.value.toUpperCase();
        const sizedInput = resolveSkuSizeInput(rawVal, products, true);
        const skuPart = sizedInput.sku;

        setScanInput(rawVal);

        if (skuPart.length < 2) {
            setCandidateProducts([]);
            setSkuMatches(null);
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
            setSkuMatches(null);
            setActiveMaster(null);
            setFilteredVariants([]);
            setSizeMode(null);
            setSelectedSize('');
            setSelectedCordColor(undefined);
            setSelectedEnamelColor(undefined);
            return;
        }

        if (skuPart.includes('-') && resolveOrderRangeInput(skuPart, products)) {
            setCandidateProducts([]);
            setSkuMatches(null);
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

        const exactMaster = products.find(p => p.sku === skuPart && !p.is_component);
        const potentialMasters = products.filter(p => skuPart.startsWith(p.sku) && !p.is_component);
        const longestPrefixMaster = potentialMasters.sort((a, b) => b.sku.length - a.sku.length)[0];

        if (exactMaster) {
            bestMaster = exactMaster;
            suffixPart = '';
        } else if (longestPrefixMaster) {
            bestMaster = longestPrefixMaster;
            suffixPart = skuPart.slice(longestPrefixMaster.sku.length);
        }

        if (bestMaster) {
            setCandidateProducts([bestMaster]);
            setSkuMatches(null);
        } else {
            const matches = searchMastersByPrefix(products, skuPart);
            setSkuMatches(matches);
            setCandidateProducts(matches?.products ?? []);
        }

        if (bestMaster) {
            setActiveMaster(bestMaster);
            setSelectedCordColor(undefined);
            setSelectedEnamelColor(undefined);
            const sizing = getSizingInfo(bestMaster);
            setSizeMode(sizing);

            setSelectedSize(sizedInput.size || '');

            if (bestMaster.variants) {
                const searchSuffix = (suffixPart || '').toUpperCase();
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
        const usePref = pref.length > 0 && productHasVariantPrefix(p, pref);
        setActiveMaster(p);
        setScanInput(usePref ? p.sku + pref : p.sku);
        setCandidateProducts([p]);
        setSkuMatches(null);
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
        const unitPrice = getOrderCatalogPrice(master, variant?.suffix, priceMode);
        if (linkIndex.bySku.has(master.sku)) setLastAddedForSet({ sku: master.sku, suffix: variant?.suffix || '' });
        const newItem: OrderItem = {
            sku: master.sku,
            variant_suffix: variant?.suffix,
            quantity: qty,
            price_at_order: unitPrice,
            price_mode: priceMode,
            price_override: undefined,
            product_details: master,
            size_info: size || undefined,
            cord_color: cordColor,
            enamel_color: enamelColor,
            notes: notes || undefined,
            fulfillment_mode: defaultFulfillmentMode,
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
        setPriceDiffs(null);
    };

    const addOrderRangeEntries = (range: OrderRangeResolution, sizesBySku: Record<string, string>) => {
        const entries = buildOrderRangeAddEntries(range.rows, sizesBySku);
        if (entries.length === 0) {
            showToast('Δεν υπάρχουν έγκυρα είδη στο εύρος.', 'error');
            return false;
        }

        for (const entry of entries) {
            _addItemToOrder(
                entry.product,
                entry.variant,
                scanQty,
                entry.size,
                itemNotes,
                selectedCordColor,
                selectedEnamelColor,
            );
        }

        showToast(
            entries.length === 1
                ? 'Προστέθηκε 1 είδος από το εύρος.'
                : `Προστέθηκαν ${entries.length} είδη από το εύρος.`,
            'success',
        );
        return true;
    };

    const confirmOrderRangeAdd = (sizesBySku: Record<string, string>) => {
        if (!pendingOrderRangeReview) return;
        const added = addOrderRangeEntries(pendingOrderRangeReview, sizesBySku);
        if (!added) return;
        setPendingOrderRangeReview(null);
        resetSmartEntryState();
        setTimeout(() => inputRef.current?.focus(), 100);
    };

    const handleAddItem = (variant: ProductVariant | null) => {
        if (!activeMaster) return;
        if (resolveSkuSizeInput(scanInput, products, true).invalidSize) {
            showToast('Το μέγεθος δεν υποστηρίζεται για αυτόν τον κωδικό.', 'error');
            return;
        }
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
        setCandidateProducts([]); setSkuMatches(null); setFilteredVariants([]);
        setTimeout(() => inputRef.current?.focus(), 100);
    };

    const executeAddItem = () => {
        const sizedInput = resolveSkuSizeInput(scanInput, products, true);
        const skuCode = sizedInput.sku;
        if (!skuCode) return;
        if (sizedInput.invalidSize) {
            showToast('Το μέγεθος δεν υποστηρίζεται για αυτόν τον κωδικό.', 'error');
            return;
        }

        const range = resolveOrderRangeInput(skuCode, products);
        if (range) {
            const hasInvalidRows = range.rows.some(row => row.status !== 'ready');
            if (range.hasSizableRows || hasInvalidRows) {
                setPendingOrderRangeReview(range);
                return;
            }
            const added = addOrderRangeEntries(range, {});
            if (!added) return;
            resetSmartEntryState();
            setTimeout(() => inputRef.current?.focus(), 100);
            return;
        }

        if (skuCode === SPECIAL_CREATION_SKU) {
            const cleanedNote = cleanSpecialCreationNote(itemNotes);
            if (!cleanedNote) {
                showToast('Η σημείωση είναι υποχρεωτική για κάθε ειδική δημιουργία (SP).', 'error');
                return;
            }
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
                notes: cleanedNote,
                line_id: crypto.randomUUID(),
                fulfillment_mode: defaultFulfillmentMode,
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
            setSkuMatches(null);
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
                setSkuMatches(null);
                if (product.variants) {
                    setFilteredVariants(product.variants.map(v => ({ variant: v, suffix: v.suffix, desc: v.description })));
                }
                return;
            }
        }
        _addItemToOrder(product, variant ?? null, scanQty, selectedSize || sizedInput.size || '', itemNotes, selectedCordColor, selectedEnamelColor);
        setScanInput('');
        setScanQty(1);
        setItemNotes('');
        setSelectedSize('');
        setSelectedCordColor(undefined);
        setSelectedEnamelColor(undefined);
        setCandidateProducts([]);
        setSkuMatches(null);
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
                        showToast(`Ο κωδικός ${code} είναι κύριος κωδικός. Παρακαλώ σκανάρετε την παραλλαγή.`, 'error');
                        return;
                    }
                }
                const unitPrice = getOrderCatalogPrice(product, variant?.suffix, priceMode);
                const newItem: OrderItem = {
                    sku: product.sku,
                    variant_suffix: variant?.suffix,
                    quantity: 1,
                    price_at_order: unitPrice,
                    price_mode: priceMode,
                    product_details: product,
                    fulfillment_mode: defaultFulfillmentMode,
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

    const updateItemFulfillmentMode = (item: OrderItem, fulfillmentMode: 'sale' | 'consignment') => {
        const idx = selectedItems.findIndex(i => getOrderItemMatchKey(i) === getOrderItemMatchKey(item));
        if (idx === -1) return;
        setSelectedItems(prev => {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], fulfillment_mode: fulfillmentMode };
            return updated;
        });
        setPriceDiffs(null);
    };

    const updateItemUnitPrice = (item: OrderItem, rawPrice: number) => {
        const idx = selectedItems.findIndex(i => getOrderItemMatchKey(i) === getOrderItemMatchKey(item));
        if (idx === -1) return;
        const price = Math.max(0, Math.round(rawPrice * 100) / 100);

        const product = products.find(p => p.sku === item.sku) || item.product_details;
        let catalogPrice = item.price_at_order;
        if (!isSpecialCreationSku(item.sku) && product) {
            catalogPrice = getOrderCatalogPrice(product, item.variant_suffix, item.price_mode);
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

    const revertItemToCatalogPrice = (item: OrderItem) => {
        if (isSpecialCreationSku(item.sku)) return;
        const product = products.find(p => p.sku === item.sku) || item.product_details;
        if (!product) return;
        const catalogPrice = getOrderCatalogPrice(product, item.variant_suffix, item.price_mode);
        if (catalogPrice <= 0) return;
        setSelectedItems(prev => {
            const updated = [...prev];
            const i = prev.findIndex(r => getOrderItemMatchKey(r) === getOrderItemMatchKey(item));
            if (i === -1) return prev;
            updated[i] = { ...updated[i], price_at_order: catalogPrice, price_override: undefined };
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

            const nextPrice = product
                ? getOrderCatalogPrice(product, nextVariantSuffix, current.price_mode)
                : current.price_at_order;

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

    const generatePriceSyncPreview = (): PriceSyncPreview | null =>
        generateOrderPriceSyncPreview(
            { items: selectedItems, discount_percent: discountPercent } as Order,
            products,
            discountPercent,
            vatRate,
        );

    const handleRecalculatePrices = () => {
        const oldFinancials = calculateOrderFinancials(selectedItems, discountPercent, vatRate);
        const oldSub = oldFinancials.saleSubtotal;
        const oldNet = oldFinancials.saleNet;
        const oldVat = oldFinancials.saleVat;
        const oldTotal = oldFinancials.payableNow;


        let updatedCount = 0;
        const itemDeltas: ItemPriceDelta[] = [];
        const newItems = selectedItems.map(item => {
            if (isSpecialCreationSku(item.sku)) return item;
            
            // Skip if manually overridden
            if (item.price_override === true) return item;
            
            // Skip if price is 0 EUR (gift/δώρα)
            if (item.price_at_order === 0) return item;

            const product = products.find(p => p.sku === item.sku);
            if (!product) return item;
            const currentRegistryPrice = getOrderCatalogPrice(product, item.variant_suffix, item.price_mode);
            const hasPriceDiff = currentRegistryPrice > 0 && Math.abs(currentRegistryPrice - item.price_at_order) > 0.01;
            if (hasPriceDiff) {
                itemDeltas.push({
                    lineKey: getOrderItemMatchKey(item),
                    sku: item.sku,
                    variantSuffix: item.variant_suffix,
                    oldPrice: item.price_at_order,
                    newPrice: currentRegistryPrice,
                });
                updatedCount++;
                return { ...item, price_at_order: currentRegistryPrice, price_override: undefined };
            }
            return item;
        });

        const newFinancials = calculateOrderFinancials(newItems, discountPercent, vatRate);
        const newSub = newFinancials.saleSubtotal;
        const newNet = newFinancials.saleNet;
        const newVat = newFinancials.saleVat;
        const newTotal = newFinancials.payableNow;
        setPriceDiffs({ net: newNet - oldNet, vat: newVat - oldVat, total: newTotal - oldTotal, itemDeltas });

        if (updatedCount > 0) {
            const record: PriceChangeRecord = {
                timestamp: new Date().toISOString(),
                itemChanges: itemDeltas,
                totalsBefore: { subtotal: oldSub, net: oldNet, vat: oldVat, total: oldTotal },
                totalsAfter: { subtotal: newSub, net: newNet, vat: newVat, total: newTotal },
            };
            setPriceChangeLog(prev => [record, ...prev]);
            setSelectedItems(newItems);
            showToast(`Ενημερώθηκαν οι τιμές σε ${updatedCount} είδη.`, 'success');
        } else {
            showToast('Οι τιμές είναι ήδη επίκαιρες.', 'info');
        }
    };

    const applyPriceSyncPreview = (preview: PriceSyncPreview) => {
        if (preview.updatedCount === 0) {
            showToast('Δεν υπάρχουν τιμές προς ενημέρωση.', 'info');
            return;
        }

        const newItems = selectedItems.map(item => {
            const delta = preview.itemsToChange.find(d => d.lineKey === getOrderItemMatchKey(item));
            if (delta) {
                return { ...item, price_at_order: delta.newPrice, price_override: undefined };
            }
            return item;
        });

        const record: PriceChangeRecord = {
            timestamp: new Date().toISOString(),
            itemChanges: preview.itemsToChange,
            totalsBefore: preview.totalsBefore,
            totalsAfter: preview.totalsAfter,
        };
        setPriceChangeLog(prev => [record, ...prev]);
        setSelectedItems(newItems);
        setPriceDiffs({
            net: preview.totalsAfter.net - preview.totalsBefore.net,
            vat: preview.totalsAfter.vat - preview.totalsBefore.vat,
            total: preview.totalsAfter.total - preview.totalsBefore.total,
            itemDeltas: preview.itemsToChange,
        });
        showToast(`Ενημερώθηκαν οι τιμές σε ${preview.updatedCount} είδη.`, 'success');
    };

    // --- Order Save ---
    const handleSaveOrder = async () => {
        if (findSpecialCreationItemsMissingNotes(selectedItems).length > 0) {
            showToast('Συμπληρώστε σημείωση σε κάθε ειδική δημιουργία (SP) πριν την αποθήκευση.', 'error');
            return;
        }
        const itemsReadyForSave = selectedItems.map((item) => isSpecialCreationSku(item.sku)
            ? { ...item, notes: cleanSpecialCreationNote(item.notes) }
            : item);
        if (!customerName) { showToast('Το όνομα πελάτη είναι υποχρεωτικό.', 'error'); return; }
        if (selectedItems.length === 0) { showToast('Προσθέστε τουλάχιστον ένα προϊόν.', 'error'); return; }
        setIsSaving(true);
        try {
            const { customer_id: effectiveCustomerId, customer_name: effectiveCustomerName, customer_phone: effectiveCustomerPhone, notes: composedNotes } = buildOrderCustomerFields({ customer_id: selectedCustomerId, customer_name: customerName, customer_phone: customerPhone, notes: orderNotes }, retailClientLabel);

            if (initialOrder) {
                let isNewPart: boolean | undefined = undefined;
                const itemsWithLineIds = assignMissingOrderLineIds(itemsReadyForSave);
                const updatedOrder: Order = {
                    ...initialOrder,
                    customer_id: effectiveCustomerId,
                    customer_name: effectiveCustomerName,
                    customer_phone: effectiveCustomerPhone,
                    seller_id: selectedSellerId || undefined,
                    seller_name: selectedSellerName || undefined,
                    seller_commission_percent: selectedSellerId ? (sellerCommissionPercent ?? null) : null,
                    items: itemsWithLineIds,
                    total_price: grandTotal,
                    vat_rate: vatRate,
                    discount_percent: discountPercent,
                    notes: composedNotes,
                    tags,
                    price_change_log: priceChangeLog.length > 0 ? priceChangeLog : undefined,
                };

                if (orderNeedsProductionEditDialog(initialOrder.status)) {
                    const allowsNewPart = allowsNewProductionPartOrderEdit(initialOrder, updatedOrder);
                    const choice = await confirm({
                        title: 'Τύπος Αλλαγής',
                        message: allowsNewPart
                            ? PRODUCTION_EDIT_CHOICE_MESSAGE
                            : `${PRODUCTION_EDIT_CHOICE_MESSAGE} ${PRODUCTION_EDIT_NEW_PART_HINT}`,
                        confirmText: 'Νέο Τμήμα',
                        thirdOptionText: 'Τροποποίηση',
                        cancelText: 'Ακύρωση',
                        confirmDisabled: !allowsNewPart,
                    });
                    if (choice === null) {
                        setIsSaving(false);
                        return;
                    }
                    isNewPart = choice === true;
                }

                await api.updateOrder(updatedOrder, isNewPart);
                showToast('Η παραγγελία ενημερώθηκε.', 'success');
                dispatchLiveActivity({ type: 'order_updated', userName: profile?.full_name || 'Κάποιος', customerName: effectiveCustomerName });
            } else {
                const newOrderId = generateOrderId();
                const newOrder: Order = {
                    id: newOrderId,
                    customer_id: effectiveCustomerId,
                    customer_name: effectiveCustomerName,
                    customer_phone: effectiveCustomerPhone,
                    seller_id: selectedSellerId || undefined,
                    seller_name: selectedSellerName || undefined,
                    seller_commission_percent: selectedSellerId ? sellerCommissionPercent : undefined,
                    created_at: new Date().toISOString(),
                    status: OrderStatus.Pending,
                    items: assignMissingOrderLineIds(itemsReadyForSave),
                    total_price: grandTotal,
                    vat_rate: vatRate,
                    discount_percent: discountPercent,
                    notes: composedNotes,
                    tags,
                    price_change_log: priceChangeLog.length > 0 ? priceChangeLog : undefined,
                };
                await api.saveOrder(newOrder);
                showToast('Η παραγγελία δημιουργήθηκε.', 'success');
                dispatchLiveActivity({ type: 'order_created', userName: profile?.full_name || 'Κάποιος', customerName: effectiveCustomerName, itemCount: selectedItems.length });
            }
            await invalidateAndRefetchAfterOrderMutation(queryClient);
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
        const sized = resolveSkuSizeInput(text, products, true);
        const sizeText = sized.size ? sized.sizeText : '';
        if (sizeText) text = sized.sku;
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
        return { masterStr, suffixStr, finish, stone, sizeText };
    };

    const presentOrderSkus = useMemo(() => new Set(selectedItems.map((item) => item.sku)), [selectedItems]);
    const activeMasterSetMates = useMemo(() => {
        if (!activeMaster) return [] as Product[];
        return getLinkedSkus(activeMaster.sku, linkIndex)
            .map((sku) => productsBySku.get(sku))
            .filter((product): product is Product => !!product && !product.is_component);
    }, [activeMaster, linkIndex, productsBySku]);
    const missingSetMates: MissingSetMate<Product>[] = useMemo(() => {
        if (!lastAddedForSet) return [];
        return findMissingSetMates(lastAddedForSet.sku, lastAddedForSet.suffix, presentOrderSkus, linkIndex, productsBySku)
            .filter((mate) => !mate.product.is_component);
    }, [lastAddedForSet, presentOrderSkus, linkIndex, productsBySku]);

    /** One click «add the rest of the set»: same finish/stone suffix, qty 1. Sized or unmatched codes open normally. */
    const addSetMate = (mate: MissingSetMate<Product>, silent = false) => {
        const needsChoice = mate.suffix === null || !!getSizingInfo(mate.product);
        if (needsChoice) {
            handleSelectMaster(mate.product, mate.suffix || lastAddedForSet?.suffix || null);
            return false;
        }
        const variant = mate.suffix ? (mate.product.variants || []).find((item) => item.suffix === mate.suffix) || null : null;
        _addItemToOrder(mate.product, variant, 1, '', '');
        if (!silent) showToast(`${mate.product.sku}${mate.suffix || ''} προστέθηκε`, 'success');
        return true;
    };
    const addAllSetMates = () => {
        const direct = missingSetMates.filter((mate) => mate.suffix !== null && !getSizingInfo(mate.product));
        direct.forEach((mate) => addSetMate(mate, true));
        if (direct.length > 0) showToast(`Προστέθηκαν ${direct.length} κωδικοί του σετ.`, 'success');
        const pending = missingSetMates.length - direct.length;
        if (pending > 0) showToast(`${pending} κωδικοί του σετ θέλουν επιλογή παραλλαγής ή μεγέθους.`, 'info');
    };
    const dismissSetHint = () => setLastAddedForSet(null);

    const handleSelectSize = (size: string) => {
        setSelectedSize(size);
        const typed = resolveSkuSizeInput(scanInput, products, true);
        if (typed.sizeText) setScanInput(typed.sku + (size ? `-${size}` : ''));
    };

    return {
        state: {
            // Customer
            customerName, customerPhone, selectedCustomerId,
            orderNotes, retailClientLabel, vatRate, discountPercent, tags, tagInput,
            customerSearch, showCustomerResults, isSaving,
            isRetailCustomer: selectedCustomerId === RETAIL_CUSTOMER_ID || customerName.trim() === RETAIL_CUSTOMER_NAME,
            isInternalCustomer: selectedCustomerId === INTERNAL_CUSTOMER_ID || customerName.trim() === INTERNAL_CUSTOMER_NAME,
            // Seller / Πλασιέ
            selectedSellerId, selectedSellerName, sellerCommissionPercent,
            isSeller,
            // Smart entry
            scanInput, scanQty, itemNotes, specialCreationUnitPriceStr,
            candidateProducts, skuMatches, collectionNameById,
            activeMasterSetMates, missingSetMates,
            orderRangePreview, pendingOrderRangeReview,
            activeMaster, filteredVariants,
            selectedSize, selectedCordColor, selectedEnamelColor, sizeMode, showScanner,
            // Sort/filter
            sortOrder, itemSearchTerm,
            // Price diffs
            priceDiffs,
            priceChangeLog,
            // Computed
            filteredCustomers, displayItems,
            subtotal, discountAmount, netAfterDiscount, vatAmount, grandTotal,
            consignmentSubtotal: financials.consignmentSubtotal,
            consignmentVatAmount: financials.consignmentVat,
            consignmentValue: financials.consignmentValue,
            defaultFulfillmentMode, priceMode,
            selectedItems,
            isEditing: !!initialOrder,
            orderId: initialOrder?.id,
        },
        setters: {
            setCustomerName, setCustomerPhone, setSelectedCustomerId,
            setOrderNotes, setRetailClientLabel, setVatRate, setDiscountPercent, setTagInput,
            setCustomerSearch, setShowCustomerResults,
            setSelectedSellerId, setSelectedSellerName, setSellerCommissionPercent,
            setScanInput, setScanQty, setItemNotes, setSpecialCreationUnitPriceStr,
            setDefaultFulfillmentMode,
            setActiveMaster, setFilteredVariants, setSelectedSize: handleSelectSize, setSelectedCordColor, setSelectedEnamelColor,
            setSizeMode, setCandidateProducts, setSkuMatches, setShowScanner, setPendingOrderRangeReview,
            setSortOrder, setItemSearchTerm,
        },
        actions: {
            handlePriceModeChange,
            handleSelectCustomer, handleUseRetailCustomer, handleUseInternalCustomer, handleAddTag, removeTag,
            handleSmartInput, handleSelectMaster,
            handleAddItem, executeAddItem, confirmOrderRangeAdd, handleScanInOrder,
            updateQuantity, updateItemNotes, updateItemFulfillmentMode, updateItemUnitPrice, revertItemToCatalogPrice, updateItemVariantAndSize, handleRemoveItem,
            handleRecalculatePrices, generatePriceSyncPreview, applyPriceSyncPreview, handleSaveOrder, handleBack,
            getSkuComponents,
            addSetMate, addAllSetMates, dismissSetHint,
        },
        refs: { inputRef },
    };
}
