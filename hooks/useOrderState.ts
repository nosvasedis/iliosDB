import { useState, useRef, useEffect, useMemo } from 'react';
import { Product, ProductVariant, Order, OrderItem, Customer, OrderStatus, VatRegime } from '../types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { formatCurrency, splitSkuComponents, getVariantComponents, findProductByScannedCode } from '../utils/pricingEngine';
import { normalizedIncludes } from '../utils/greekSearch';
import { generateOrderId } from '../utils/orderUtils';
import { getSizingInfo } from '../utils/sizing';
import { useUI } from '../components/UIProvider';
import { useAuth } from '../components/AuthContext';

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
    onBack: () => void;
}

export function useOrderState({ initialOrder, products, customers, onBack }: UseOrderStateProps) {
    const { showToast } = useUI();
    const { profile } = useAuth();
    const queryClient = useQueryClient();
    const isSeller = profile?.role === 'seller';

    // --- Customer & Order Meta State ---
    const [customerName, setCustomerName] = useState(initialOrder?.customer_name || '');
    const [customerPhone, setCustomerPhone] = useState(initialOrder?.customer_phone || '');
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(initialOrder?.customer_id || null);
    const [orderNotes, setOrderNotes] = useState(initialOrder?.notes || '');
    const [vatRate, setVatRate] = useState<number>(initialOrder?.vat_rate !== undefined ? initialOrder.vat_rate : VatRegime.Standard);
    const [discountPercent, setDiscountPercent] = useState<number>(initialOrder?.discount_percent || 0);
    const [selectedItems, setSelectedItems] = useState<OrderItem[]>(() => {
        const items = initialOrder?.items || [];
        return items.map(item => {
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
    const [activeMaster, setActiveMaster] = useState<Product | null>(null);
    const [filteredVariants, setFilteredVariants] = useState<{ variant: ProductVariant, suffix: string, desc: string }[]>([]);
    const [selectedSize, setSelectedSize] = useState('');
    const [sizeMode, setSizeMode] = useState<{ type: 'Νούμερο' | 'Μήκος', sizes: string[] } | null>(null);
    const [showScanner, setShowScanner] = useState(false);

    // --- Sort & Filter State ---
    const [sortOrder, setSortOrder] = useState<'input' | 'alpha'>('input');
    const [itemSearchTerm, setItemSearchTerm] = useState('');

    // --- Price Sync Indicators ---
    const [priceDiffs, setPriceDiffs] = useState<{ net: number, vat: number, total: number } | null>(null);

    // --- Refs ---
    const inputRef = useRef<HTMLInputElement>(null);

    // --- Draft autosave ---
    useEffect(() => {
        if (!initialOrder) {
            const savedDraft = localStorage.getItem(DRAFT_ORDER_KEY);
            if (savedDraft) {
                try {
                    const draft = JSON.parse(savedDraft);
                    if (draft.timestamp && (Date.now() - draft.timestamp < 86400000)) {
                        setCustomerName(draft.customerName || '');
                        setCustomerPhone(draft.customerPhone || '');
                        setSelectedCustomerId(draft.selectedCustomerId || null);
                        setOrderNotes(draft.orderNotes || '');
                        setVatRate(draft.vatRate !== undefined ? draft.vatRate : VatRegime.Standard);
                        setDiscountPercent(draft.discountPercent || 0);
                        const syncedItems = (draft.selectedItems || []).map((item: any) => {
                            const product = products.find(p => p.sku === item.sku);
                            return {
                                ...item,
                                product_details: product || item.product_details
                            };
                        });
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
                orderNotes, vatRate, discountPercent, selectedItems, tags,
                timestamp: Date.now()
            };
            localStorage.setItem(DRAFT_ORDER_KEY, JSON.stringify(draftData));
        }
    }, [initialOrder, customerName, customerPhone, selectedCustomerId, orderNotes, vatRate, discountPercent, selectedItems, tags]);

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
            const latestProduct = products.find(p => p.sku === item.sku);
            return {
                ...item,
                product_details: latestProduct || item.product_details
            };
        });

        if (itemSearchTerm.trim()) {
            const term = itemSearchTerm.toLowerCase().trim();
            items = items.filter(item => {
                return item.sku.toLowerCase().includes(term) ||
                    (item.variant_suffix || '').toLowerCase().includes(term) ||
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
            setActiveMaster(null);
            setFilteredVariants([]);
            setSizeMode(null);
            setSelectedSize('');
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

        let candidates: Product[] = [];
        if (bestMaster) {
            candidates = [bestMaster];
        } else {
            candidates = products
                .filter(p => !p.is_component)
                .filter(p => {
                    if (p.sku.startsWith(skuPart)) return true;
                    if (skuPart.length >= 3 && p.sku.includes(skuPart)) return true;
                    return false;
                })
                .sort((a, b) => {
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
                })
                .slice(0, 6);
        }
        setCandidateProducts(candidates);

        if (bestMaster) {
            setActiveMaster(bestMaster);
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
                        (sizing.type === 'Νούμερο' && numeric.test(token)) ||
                        (sizing.type === 'Μήκος' && lengthLike.test(token))
                    ) {
                        sizePart = token;
                    }
                }
            }

            if (sizing && sizePart) {
                const normalizedSize = sizePart.toUpperCase();
                const matchedSize = sizing.sizes.find(stored => {
                    const upperStored = stored.toUpperCase();
                    if (sizing.type === 'Μήκος') {
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
        }
    };

    const handleSelectMaster = (p: Product) => {
        setActiveMaster(p);
        setScanInput(p.sku);
        setCandidateProducts([p]);
        const sizing = getSizingInfo(p);
        if (sizing) { setSizeMode(sizing); setSelectedSize(''); }
        else setSizeMode(null);
        if (p.variants) {
            setFilteredVariants(p.variants.map(v => ({ variant: v, suffix: v.suffix, desc: v.description })));
        } else {
            setFilteredVariants([]);
        }
        inputRef.current?.focus();
    };

    const _addItemToOrder = (master: Product, variant: ProductVariant | null, qty: number, size: string, notes: string) => {
        const unitPrice = variant?.selling_price || master.selling_price || 0;
        const newItem: OrderItem = {
            sku: master.sku,
            variant_suffix: variant?.suffix,
            quantity: qty,
            price_at_order: unitPrice,
            product_details: master,
            size_info: size || undefined,
            notes: notes || undefined
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
                updated[existingIdx].quantity += qty;
                return updated;
            }
            return [newItem, ...prev];
        });
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
        _addItemToOrder(activeMaster, variant, scanQty, selectedSize, itemNotes);
        setActiveMaster(null); setScanQty(1); setSelectedSize(''); setItemNotes('');
        setSizeMode(null); setScanInput('');
        setTimeout(() => inputRef.current?.focus(), 100);
    };

    const executeAddItem = () => {
        const skuCode = scanInput.split(/\s+/)[0];
        if (!skuCode) return;

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
                    let chosenVariant: ProductVariant | null = null;

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
                            if (sizing.type === 'Μήκος') {
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
                    _addItemToOrder(activeMaster, chosenVariant, scanQty, sizeToUse, itemNotes);
                    setActiveMaster(null);
                    setScanQty(1);
                    setSelectedSize('');
                    setItemNotes('');
                    setSizeMode(null);
                    setScanInput('');
                    setCandidateProducts([]);
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
                if (product.variants) {
                    setFilteredVariants(product.variants.map(v => ({ variant: v, suffix: v.suffix, desc: v.description })));
                }
                return;
            }
        }
        _addItemToOrder(product, variant ?? null, scanQty, selectedSize, itemNotes);
        setScanInput('');
        setScanQty(1);
        setItemNotes('');
        setSelectedSize('');
        setCandidateProducts([]);
        setActiveMaster(null);
        setFilteredVariants([]);
        setSizeMode(null);
        inputRef.current?.focus();
        showToast('Το προϊόν προστέθηκε.', 'success');
    };

    const handleScanInOrder = (code: string) => {
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
                showToast(`Προστέθηκε: ${product.sku}${variant?.suffix || ''}`, 'success');
                setShowScanner(false);
            }
        } else {
            showToast(`Ο κωδικός ${code} δεν βρέθηκε.`, 'error');
        }
    };

    // --- Item Mutation Actions ---
    const updateQuantity = (item: OrderItem, qty: number) => {
        const idx = selectedItems.findIndex(i =>
            i.sku === item.sku &&
            i.variant_suffix === item.variant_suffix &&
            i.size_info === item.size_info &&
            (i.notes || '') === (item.notes || '')
        );
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
        const idx = selectedItems.findIndex(i =>
            i.sku === item.sku &&
            i.variant_suffix === item.variant_suffix &&
            i.size_info === item.size_info &&
            (i.notes || '') === (item.notes || '')
        );
        if (idx === -1) return;
        setSelectedItems(prev => {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], notes: notes || undefined };
            return updated;
        });
    };

    const handleRemoveItem = (item: OrderItem) => {
        const idx = selectedItems.findIndex(i =>
            i.sku === item.sku &&
            i.variant_suffix === item.variant_suffix &&
            i.size_info === item.size_info &&
            (i.notes || '') === (item.notes || '')
        );
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
            const product = products.find(p => p.sku === item.sku);
            if (!product) return item;
            let currentRegistryPrice = 0;
            const hasSuffix = item.variant_suffix !== undefined && item.variant_suffix !== null;
            if (hasSuffix) {
                const variant = product.variants?.find(v => v.suffix === item.variant_suffix);
                currentRegistryPrice = variant?.selling_price || 0;
            }
            if (currentRegistryPrice === 0) currentRegistryPrice = product.selling_price;
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
                    notes: orderNotes,
                    tags
                };
                await api.updateOrder(updatedOrder);
                showToast('Η παραγγελία ενημερώθηκε.', 'success');
            } else {
                const newOrderId = generateOrderId();
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
                    notes: orderNotes,
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
            orderNotes, vatRate, discountPercent, tags, tagInput,
            customerSearch, showCustomerResults, isSaving,
            // Smart entry
            scanInput, scanQty, itemNotes,
            candidateProducts, activeMaster, filteredVariants,
            selectedSize, sizeMode, showScanner,
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
            setOrderNotes, setVatRate, setDiscountPercent, setTagInput,
            setCustomerSearch, setShowCustomerResults,
            setScanInput, setScanQty, setItemNotes,
            setActiveMaster, setFilteredVariants, setSelectedSize,
            setSizeMode, setCandidateProducts, setShowScanner,
            setSortOrder, setItemSearchTerm,
        },
        actions: {
            handleSelectCustomer, handleAddTag, removeTag,
            handleSmartInput, handleSelectMaster,
            handleAddItem, executeAddItem, handleScanInOrder,
            updateQuantity, updateItemNotes, handleRemoveItem,
            handleRecalculatePrices, handleSaveOrder, handleBack,
            getSkuComponents,
        },
        refs: { inputRef },
    };
}
