import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Box,
    ChevronDown,
    Factory,
    Gem,
    Globe2,
    Hash,
    ImageIcon,
    ListPlus,
    Loader2,
    PackageCheck,
    Plus,
    Save,
    Search,
    ShoppingCart,
    StickyNote,
    Trash2,
    X,
} from 'lucide-react';
import { Supplier, SupplierOrder, SupplierOrderItem, SupplierOrderType, Product } from '../../types';
import { api } from '../../lib/supabase';
import { useUI } from '../UIProvider';
import { useSupplierOrderNeeds, type SupplierOrderGroupedNeed } from '../../hooks/useSupplierOrderNeeds';
import { mergeNeedIntoItems } from '../../utils/mergeSupplierNeedIntoOrder';
import { needBreakdownKey, unattributedQty } from '../../utils/supplierOrderNeedBreakdown';
import {
    defaultMaskForNeed,
    mergeManyNeedsWithCustomerFilter,
    normCustomerKey,
    purchaseOrderFilterFromTab,
    type PurchaseOrderCustomerFilter,
    type PurchaseOrderFilterTab,
} from '../../utils/supplierOrderCustomerFilter';
import {
    getPurchaseOrderLinePresentation,
    shouldShowPurchaseOrderSizeInput,
} from '../../features/suppliers/purchaseOrderPresentation';
import PurchaseNeedRow from '../PurchaseNeedRow';
import PurchaseOrderCustomerFilterBar from '../PurchaseOrderCustomerFilterBar';

interface Props {
    supplier: Supplier;
    onClose: () => void;
    initialOrder?: SupplierOrder | null;
}

type SearchResult =
    | { kind: 'Product'; key: string; name: string; sub: string; image?: string | null; item: Product; variantSuffix: string }
    | { kind: 'Material'; key: string; name: string; sub: string; image?: string | null; item: any; variantSuffix?: never };

const sectionTitle = 'text-[10px] font-black uppercase tracking-[0.14em] text-slate-500';
const fieldLabel = 'text-[9px] font-black uppercase tracking-wide text-slate-400';

export default function MobilePurchaseOrderBuilder({ supplier, onClose, initialOrder = null }: Props) {
    const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
    const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
    const queryClient = useQueryClient();
    const { showToast } = useUI();
    const { productionNeeds, pendingOrderNeeds } = useSupplierOrderNeeds(supplier);
    const cartSectionRef = useRef<HTMLDivElement>(null);

    const [items, setItems] = useState<SupplierOrderItem[]>(() => initialOrder?.items ?? []);
    const [searchTerm, setSearchTerm] = useState('');
    const [cartSearchTerm, setCartSearchTerm] = useState('');
    const [searchType, setSearchType] = useState<SupplierOrderType>('Product');
    const [notes, setNotes] = useState(() => initialOrder?.notes ?? '');
    const [isSaving, setIsSaving] = useState(false);
    const [productionNeedsOpen, setProductionNeedsOpen] = useState(true);
    const [pendingNeedsOpen, setPendingNeedsOpen] = useState(true);
    const [needBreakdownOpen, setNeedBreakdownOpen] = useState<Record<string, boolean>>({});
    const [customerFilterExpanded, setCustomerFilterExpanded] = useState(false);
    const [customerFilterTab, setCustomerFilterTab] = useState<PurchaseOrderFilterTab>('all');
    const [customerPickKeys, setCustomerPickKeys] = useState<Set<string>>(() => new Set());
    const [rowSelectionMasks, setRowSelectionMasks] = useState<Record<string, boolean[]>>({});

    const productBySku = useMemo(() => new Map((products || []).map((product) => [product.sku, product])), [products]);
    const totalPieces = useMemo(() => items.reduce((sum, item) => sum + Number(item.quantity || 0), 0), [items]);

    const poCustomerFilter: PurchaseOrderCustomerFilter = useMemo(
        () => purchaseOrderFilterFromTab(customerFilterTab, customerPickKeys),
        [customerFilterTab, customerPickKeys],
    );

    const uniquePoCustomers = useMemo(() => {
        const m = new Map<string, string>();
        for (const n of [...productionNeeds, ...pendingOrderNeeds]) {
            for (const r of n.requirements) {
                const k = normCustomerKey(r.customer);
                if (!m.has(k)) m.set(k, r.customer.trim() || r.customer);
            }
        }
        return [...m.values()].sort((a, b) => a.localeCompare(b, 'el'));
    }, [productionNeeds, pendingOrderNeeds]);

    useEffect(() => {
        setRowSelectionMasks({});
    }, [customerFilterTab, customerPickKeys]);

    useEffect(() => {
        if (initialOrder) {
            setItems(initialOrder.items.map((item) => ({ ...item })));
            setNotes(initialOrder.notes ?? '');
        }
    }, [initialOrder?.id]);

    const resolveRowMask = (key: string, need: SupplierOrderGroupedNeed): boolean[] => {
        const extra = unattributedQty(need.totalQty, need.requirements);
        const expectedLen = need.requirements.length + (extra > 0 ? 1 : 0);
        const stored = rowSelectionMasks[key];
        if (stored && stored.length === expectedLen) return stored;
        return defaultMaskForNeed(need, extra, poCustomerFilter);
    };

    const setRowMask = (key: string, need: SupplierOrderGroupedNeed, next: boolean[]) => {
        const extra = unattributedQty(need.totalQty, need.requirements);
        const expectedLen = need.requirements.length + (extra > 0 ? 1 : 0);
        if (next.length !== expectedLen) return;
        setRowSelectionMasks((previous) => ({ ...previous, [key]: next }));
    };

    const toggleCustomerPick = (displayName: string) => {
        const k = normCustomerKey(displayName);
        setCustomerPickKeys((previous) => {
            const next = new Set(previous);
            if (next.has(k)) next.delete(k);
            else next.add(k);
            return next;
        });
    };

    const addManyNeeds = (needs: SupplierOrderGroupedNeed[], label: string) => {
        const withProduct = needs.filter((need) => need.product);
        if (withProduct.length === 0) {
            showToast('Δεν υπάρχουν διαθέσιμες γραμμές.', 'error');
            return;
        }
        if (customerFilterTab === 'include_only' && customerPickKeys.size === 0) {
            showToast('Επιλέξτε πελάτες στη λειτουργία "Μόνο..." ή αλλάξτε φίλτρο.', 'error');
            return;
        }
        setItems((previous) => mergeManyNeedsWithCustomerFilter(previous, withProduct, poCustomerFilter));
        showToast(`${label}: προστέθηκαν ποσότητες.`, 'success');
        window.setTimeout(() => cartSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    };

    const searchResults = useMemo<SearchResult[]>(() => {
        const lower = searchTerm.trim().toLowerCase();
        if (!lower) return [];

        if (searchType === 'Material') {
            return (materials || [])
                .filter((material: any) => material.supplier_id === supplier.id && material.name.toLowerCase().includes(lower))
                .slice(0, 10)
                .map((material: any) => ({
                    kind: 'Material',
                    key: material.id,
                    name: material.name,
                    sub: material.type || 'Υλικό',
                    image: material.image_url,
                    item: material,
                }));
        }

        const results: SearchResult[] = [];
        (products || []).forEach((product) => {
            if (product.supplier_id !== supplier.id) return;
            if (product.sku.toLowerCase().includes(lower) && (!product.variants || product.variants.length === 0)) {
                results.push({
                    kind: 'Product',
                    key: product.sku,
                    name: product.sku,
                    sub: product.category,
                    image: product.image_url,
                    item: product,
                    variantSuffix: '',
                });
            }
            product.variants?.forEach((variant) => {
                const fullSku = `${product.sku}${variant.suffix}`;
                if (fullSku.toLowerCase().includes(lower) || product.sku.toLowerCase().includes(lower)) {
                    results.push({
                        kind: 'Product',
                        key: fullSku,
                        name: fullSku,
                        sub: product.category,
                        image: product.image_url,
                        item: product,
                        variantSuffix: variant.suffix,
                    });
                }
            });
        });
        return results.slice(0, 10);
    }, [materials, products, searchTerm, searchType, supplier.id]);

    const filteredItems = useMemo(() => {
        const q = cartSearchTerm.trim().toLowerCase();
        return items
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => {
                if (!q) return true;
                const product = item.item_type === 'Product' ? productBySku.get(item.item_id) : undefined;
                return [
                    item.item_name,
                    item.item_id,
                    item.notes,
                    item.customer_reference,
                    item.size_info,
                    product?.supplier_sku,
                    product?.category,
                ]
                    .filter(Boolean)
                    .some((value) => String(value).toLowerCase().includes(q));
            });
    }, [cartSearchTerm, items, productBySku]);

    const addItem = (
        item: any,
        type: SupplierOrderType,
        qty: number = 1,
        variantSuffix: string = '',
        size: string = '',
        addOptions?: { requirements?: { customer: string }[] },
    ) => {
        if (type === 'Material') {
            const id = item.id;
            const name = item.name;
            setItems((previous) => {
                const existingIdx = previous.findIndex((line) => line.item_name === name && line.item_type === type && (line.size_info || '') === '');
                if (existingIdx >= 0) {
                    const updated = [...previous];
                    updated[existingIdx] = {
                        ...updated[existingIdx],
                        quantity: updated[existingIdx].quantity + qty,
                        total_cost: 0,
                    };
                    return updated;
                }
                return [
                    ...previous,
                    {
                        id: crypto.randomUUID(),
                        item_type: type,
                        item_id: id,
                        item_name: name,
                        quantity: qty,
                        unit_cost: 0,
                        total_cost: 0,
                    },
                ];
            });
            setSearchTerm('');
            showToast(`Προστέθηκε: ${name}`, 'success');
            return;
        }

        const product: Product | undefined =
            item?.product && typeof item.product.sku === 'string'
                ? item.product
                : typeof item?.sku === 'string'
                  ? item
                  : undefined;

        if (!product?.sku) {
            showToast('Το προϊόν δεν βρέθηκε.', 'error');
            return;
        }

        const suffix = item.variantSuffix !== undefined ? item.variantSuffix : variantSuffix;
        const finalSize = item.size !== undefined ? item.size : size;

        setItems((previous) =>
            mergeNeedIntoItems(
                previous,
                {
                    variant: suffix,
                    size: finalSize || undefined,
                    totalQty: qty,
                    product,
                    requirements: addOptions?.requirements,
                },
                'Product',
            ),
        );
        setSearchTerm('');
        showToast(`Προστέθηκε: ${product.sku}${suffix}`, 'success');
    };

    const updateItem = (index: number, field: 'qty' | 'cost' | 'notes' | 'size', val: any) => {
        setItems((previous) => {
            const updated = [...previous];
            const item = { ...updated[index] };
            if (field === 'qty') item.quantity = Math.max(1, Number(val) || 1);
            else if (field === 'cost') item.unit_cost = Number(val);
            else if (field === 'notes') item.notes = val;
            else if (field === 'size') item.size_info = String(val).trim() || undefined;
            item.total_cost = 0;
            updated[index] = item;
            return updated;
        });
    };

    const removeItem = (index: number) => setItems((previous) => previous.filter((_, i) => i !== index));

    const handleSave = async () => {
        if (items.length === 0) {
            showToast('Η εντολή είναι κενή.', 'error');
            return;
        }

        setIsSaving(true);
        try {
            if (initialOrder) {
                await api.updateSupplierOrder({
                    ...initialOrder,
                    items,
                    notes,
                    total_amount: 0,
                });
                queryClient.invalidateQueries({ queryKey: ['supplier_orders'] });
                showToast('Η εντολή ενημερώθηκε.', 'success');
            } else {
                await api.saveSupplierOrder({
                    id: crypto.randomUUID(),
                    supplier_id: supplier.id,
                    supplier_name: supplier.name,
                    created_at: new Date().toISOString(),
                    status: 'Pending',
                    total_amount: 0,
                    items,
                    notes,
                });
                queryClient.invalidateQueries({ queryKey: ['supplier_orders'] });
                showToast('Η εντολή δημιουργήθηκε.', 'success');
            }
            onClose();
        } catch {
            showToast('Σφάλμα κατά την αποθήκευση.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const renderNeedSection = (
        title: string,
        subtitle: string,
        needs: SupplierOrderGroupedNeed[],
        accent: 'indigo' | 'blue',
        open: boolean,
        setOpen: React.Dispatch<React.SetStateAction<boolean>>,
        onAddAll: () => void,
        icon: React.ReactNode,
        keyPrefix: 'prod' | 'pend',
    ) => {
        if (needs.length === 0) return null;
        const accentClasses = accent === 'indigo'
            ? 'bg-indigo-50 border-indigo-100 text-indigo-800'
            : 'bg-blue-50 border-blue-100 text-blue-800';
        const buttonClasses = accent === 'indigo' ? 'bg-indigo-600 active:bg-indigo-700' : 'bg-blue-600 active:bg-blue-700';

        return (
            <div className={`rounded-2xl border p-3 shadow-sm ${accentClasses}`}>
                <div className="flex items-start justify-between gap-2">
                    <button
                        type="button"
                        onClick={() => setOpen((value) => !value)}
                        className="flex min-w-0 flex-1 items-start gap-2 rounded-xl p-1 text-left active:bg-white/50"
                        aria-expanded={open}
                    >
                        <span className="mt-0.5 rounded-xl bg-white/75 p-1.5 shadow-sm">{icon}</span>
                        <span className="min-w-0">
                            <span className="block text-[11px] font-black uppercase tracking-wide">{title}</span>
                            <span className="mt-0.5 block text-[10px] font-bold opacity-75">{subtitle}</span>
                        </span>
                        <ChevronDown size={16} className={`ml-auto mt-1 shrink-0 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`} />
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                        <span className="rounded-lg bg-white/80 px-2 py-1 text-[10px] font-black tabular-nums">{needs.length}</span>
                        <button
                            type="button"
                            onClick={onAddAll}
                            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-black uppercase text-white shadow-sm ${buttonClasses}`}
                        >
                            <ListPlus size={13} /> Όλα
                        </button>
                    </div>
                </div>
                {open && (
                    <div className="mt-3 space-y-2">
                        {needs.map((need) => {
                            const key = needBreakdownKey(keyPrefix, need);
                            return (
                                <PurchaseNeedRow
                                    key={key}
                                    need={need}
                                    accent={accent}
                                    expanded={!!needBreakdownOpen[key]}
                                    onToggleBreakdown={() => setNeedBreakdownOpen((previous) => ({ ...previous, [key]: !previous[key] }))}
                                    selectionMask={resolveRowMask(key, need)}
                                    onSelectionChange={(next) => setRowMask(key, need, next)}
                                    onAddFiltered={(qty, requirements) =>
                                        addItem(need, 'Product', qty, need.variant, need.size, { requirements })
                                    }
                                    onNotifyZero={() => showToast('Επιλέξτε τουλάχιστον μία γραμμή ποσότητας.', 'error')}
                                    layout="mobile"
                                />
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[110] flex flex-col bg-slate-50 animate-in slide-in-from-bottom duration-300">
            <div className="sticky top-0 z-20 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-purple-50 text-purple-700 ring-1 ring-purple-100">
                            <Globe2 size={22} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h2 className="truncate text-lg font-black leading-tight text-slate-900">
                                {initialOrder ? 'Επεξεργασία Εντολής' : 'Νέα Εντολή Αγοράς'}
                            </h2>
                            <p className="mt-0.5 truncate text-xs font-bold text-slate-500">{supplier.name}</p>
                            <button
                                type="button"
                                onClick={() => cartSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                                className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700 active:scale-[0.98]"
                            >
                                <PackageCheck size={12} /> {items.length} είδη · {totalPieces} τεμ.
                            </button>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="shrink-0 rounded-xl p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Κλείσιμο">
                        <X size={23} />
                    </button>
                </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-28 pt-4 custom-scrollbar">
                <div className="grid grid-cols-4 gap-2">
                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-2 text-indigo-700">
                        <div className="text-[8px] font-black uppercase opacity-70">Παραγωγή</div>
                        <div className="text-base font-black tabular-nums">{productionNeeds.length}</div>
                    </div>
                    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-2 text-blue-700">
                        <div className="text-[8px] font-black uppercase opacity-70">Εκκρεμή</div>
                        <div className="text-base font-black tabular-nums">{pendingOrderNeeds.length}</div>
                    </div>
                    <div className="rounded-2xl border border-purple-100 bg-purple-50 p-2 text-purple-700">
                        <div className="text-[8px] font-black uppercase opacity-70">Είδη</div>
                        <div className="text-base font-black tabular-nums">{items.length}</div>
                    </div>
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-2 text-emerald-700">
                        <div className="text-[8px] font-black uppercase opacity-70">Τεμ.</div>
                        <div className="text-base font-black tabular-nums">{totalPieces}</div>
                    </div>
                </div>

                <PurchaseOrderCustomerFilterBar
                    uniqueCustomers={uniquePoCustomers}
                    tab={customerFilterTab}
                    onTabChange={setCustomerFilterTab}
                    pickedKeys={customerPickKeys}
                    onTogglePicked={toggleCustomerPick}
                    expanded={customerFilterExpanded}
                    onToggleExpanded={() => setCustomerFilterExpanded((open) => !open)}
                    layout="mobile"
                />

                {renderNeedSection(
                    'Ανάγκες Παραγωγής',
                    'Παρτίδες που περιμένουν παραλαβή.',
                    productionNeeds,
                    'indigo',
                    productionNeedsOpen,
                    setProductionNeedsOpen,
                    () => addManyNeeds(productionNeeds, 'Ανάγκες παραγωγής'),
                    <Factory size={15} />,
                    'prod',
                )}
                {renderNeedSection(
                    'Ανάγκες Παραγγελιών',
                    'Εκκρεμή εισαγόμενα είδη πελατών.',
                    pendingOrderNeeds,
                    'blue',
                    pendingNeedsOpen,
                    setPendingNeedsOpen,
                    () => addManyNeeds(pendingOrderNeeds, 'Ανάγκες παραγγελιών'),
                    <ShoppingCart size={15} />,
                    'pend',
                )}

                {productionNeeds.length === 0 && pendingOrderNeeds.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center">
                        <Factory size={32} className="mx-auto text-slate-300" />
                        <p className="mt-2 text-sm font-black text-slate-500">Δεν υπάρχουν αυτόματες ανάγκες.</p>
                    </div>
                )}

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center gap-2">
                        <Search size={15} className="text-purple-600" />
                        <h3 className={sectionTitle}>Χειροκίνητη προσθήκη</h3>
                    </div>
                    <div className="mb-3 grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1">
                        <button
                            type="button"
                            onClick={() => setSearchType('Product')}
                            className={`rounded-xl py-2 text-xs font-black transition-all ${searchType === 'Product' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}
                        >
                            Προϊόντα
                        </button>
                        <button
                            type="button"
                            onClick={() => setSearchType('Material')}
                            className={`rounded-xl py-2 text-xs font-black transition-all ${searchType === 'Material' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500'}`}
                        >
                            Υλικά
                        </button>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                        <input
                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm font-bold text-slate-800 outline-none focus:border-purple-300 focus:bg-white focus:ring-4 focus:ring-purple-500/10"
                            placeholder="Αναζήτηση..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    {searchTerm && (
                        <div className="mt-3 max-h-64 space-y-2 overflow-y-auto custom-scrollbar">
                            {searchResults.map((result) => (
                                <button
                                    key={result.key}
                                    type="button"
                                    onClick={() => addItem(
                                        result.kind === 'Product'
                                            ? { product: result.item, variantSuffix: result.variantSuffix }
                                            : result.item,
                                        result.kind,
                                    )}
                                    className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-2.5 text-left shadow-sm active:bg-emerald-50"
                                >
                                    <span className="flex min-w-0 items-center gap-3">
                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 text-slate-400">
                                            {result.image ? <img src={result.image} className="h-full w-full object-cover" alt="" /> : result.kind === 'Material' ? <Box size={15} /> : <Gem size={15} />}
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block truncate font-mono text-sm font-black text-slate-800">{result.name}</span>
                                            <span className="block truncate text-[10px] font-black uppercase text-slate-400">{result.sub}</span>
                                        </span>
                                    </span>
                                    <span className="rounded-xl bg-emerald-50 p-2 text-emerald-600">
                                        <Plus size={15} />
                                    </span>
                                </button>
                            ))}
                            {searchResults.length === 0 && (
                                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-7 text-center text-xs font-bold text-slate-400">
                                    Δεν βρέθηκαν αποτελέσματα.
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div ref={cartSectionRef} className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-100 bg-slate-50/70 p-4">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="flex items-center gap-2">
                                    <PackageCheck size={15} className="text-emerald-600" />
                                    <h3 className={sectionTitle}>Περιεχόμενα</h3>
                                </div>
                                <p className="mt-1 text-xs font-bold text-slate-500">{items.length} γραμμές · {totalPieces} τεμάχια</p>
                            </div>
                            {items.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setItems([])}
                                    className="rounded-xl border border-red-200 bg-white px-2.5 py-1.5 text-[10px] font-black uppercase text-red-600"
                                >
                                    Καθαρισμός
                                </button>
                            )}
                        </div>
                        <div className="relative mt-3">
                            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={cartSearchTerm}
                                onChange={(e) => setCartSearchTerm(e.target.value)}
                                placeholder="Αναζήτηση μέσα στην εντολή..."
                                className="w-full rounded-xl border border-slate-100 bg-white py-2 pl-9 pr-3 text-xs font-bold text-slate-700 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/10"
                            />
                        </div>
                    </div>

                    <div className="space-y-2 p-3">
                        {filteredItems.map(({ item, index }) => {
                            const product = item.item_type === 'Product' ? productBySku.get(item.item_id) : undefined;
                            const display = getPurchaseOrderLinePresentation(item, product);
                            const showSizeInput = shouldShowPurchaseOrderSizeInput(product, item);

                            return (
                                <div key={`${item.id}-${index}`} className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex min-w-0 gap-3">
                                            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                                                {display.imageUrl ? <img src={display.imageUrl} className="h-full w-full object-cover" alt="" /> : <ImageIcon size={20} className="text-slate-300" />}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <span className={`rounded-lg border px-2 py-0.5 font-mono text-sm font-black ${display.finishStyle}`}>
                                                        {item.item_name}
                                                    </span>
                                                    {item.size_info && (
                                                        <span className="inline-flex items-center gap-1 rounded-lg border border-blue-100 bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-700">
                                                            <Hash size={10} /> {item.size_info}
                                                        </span>
                                                    )}
                                                    {display.supplierRef && (
                                                        <span className="rounded-lg border border-purple-100 bg-purple-50 px-2 py-1 text-[10px] font-black text-purple-700">
                                                            {display.supplierRef}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="mt-1 flex flex-wrap items-center gap-1 text-xs font-bold text-slate-500">
                                                    <span>{display.description}</span>
                                                    {display.stoneCode && <span className={`font-black ${display.stoneColor}`}>{display.stoneCode}</span>}
                                                </div>
                                                {item.customer_reference && (
                                                    <div className="mt-1 text-[11px] font-bold text-slate-600">
                                                        <span className="mr-1 text-[9px] font-black uppercase text-slate-400">Πελάτης:</span>
                                                        {item.customer_reference}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <button type="button" onClick={() => removeItem(index)} className="shrink-0 rounded-xl p-1.5 text-red-400" aria-label="Αφαίρεση">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>

                                    <div className="mt-3 grid grid-cols-12 gap-2">
                                        <div className={showSizeInput ? 'col-span-5' : 'col-span-6'}>
                                            <label className={`${fieldLabel} mb-1 block`}>Ποσότητα</label>
                                            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
                                                <button type="button" onClick={() => updateItem(index, 'qty', item.quantity - 1)} className="h-8 w-8 rounded-lg bg-white font-black text-slate-600 shadow-sm">-</button>
                                                <input
                                                    type="number"
                                                    value={item.quantity}
                                                    onChange={(e) => updateItem(index, 'qty', parseInt(e.target.value, 10) || 1)}
                                                    className="min-w-0 flex-1 bg-transparent text-center text-sm font-black tabular-nums outline-none"
                                                />
                                                <button type="button" onClick={() => updateItem(index, 'qty', item.quantity + 1)} className="h-8 w-8 rounded-lg bg-white font-black text-slate-600 shadow-sm">+</button>
                                            </div>
                                        </div>
                                        {showSizeInput && (
                                            <div className="col-span-4">
                                                <label className={`${fieldLabel} mb-1 block`}>Μέγεθος</label>
                                                <input
                                                    value={item.size_info || ''}
                                                    onChange={(e) => updateItem(index, 'size', e.target.value)}
                                                    placeholder="54"
                                                    aria-label={`Μέγεθος για ${item.item_name}`}
                                                    className="w-full rounded-xl border border-blue-100 bg-blue-50/60 px-2 py-2 text-right font-mono text-xs font-black text-blue-900 outline-none"
                                                />
                                            </div>
                                        )}
                                        <div className={showSizeInput ? 'col-span-3' : 'col-span-6'}>
                                            <label className={`${fieldLabel} mb-1 block`}>Σημείωση</label>
                                            <div className="relative">
                                                <StickyNote size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-300" />
                                                <input
                                                    value={item.notes || ''}
                                                    onChange={(e) => updateItem(index, 'notes', e.target.value)}
                                                    placeholder="..."
                                                    className="w-full rounded-xl border border-slate-100 bg-slate-50 py-2 pl-7 pr-2 text-xs font-bold text-slate-600 outline-none"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {items.length === 0 && (
                            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center">
                                <Box size={42} className="mx-auto text-slate-300" />
                                <p className="mt-2 text-sm font-black text-slate-400">Η εντολή είναι κενή.</p>
                            </div>
                        )}
                        {items.length > 0 && filteredItems.length === 0 && (
                            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-xs font-bold text-slate-400">
                                Δεν ταιριάζει καμία γραμμή.
                            </div>
                        )}
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <label className={`${sectionTitle} mb-2 flex items-center gap-1`}>
                        <StickyNote size={12} /> Σημειώσεις εντολής
                    </label>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="h-24 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-700 outline-none focus:border-purple-300 focus:bg-white focus:ring-4 focus:ring-purple-500/10"
                        placeholder="Σημειώσεις για τον προμηθευτή..."
                    />
                </div>
            </div>

            <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white p-4 shadow-[0_-14px_30px_rgba(15,23,42,0.08)]">
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving || items.length === 0}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#060b00] py-4 text-sm font-black text-white shadow-lg active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none"
                >
                    {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                    {initialOrder ? 'Αποθήκευση αλλαγών' : 'Αποθήκευση εντολής'}
                </button>
            </div>
        </div>
    );
}
