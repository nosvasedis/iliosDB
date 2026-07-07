import React, { useEffect, useMemo, useState } from 'react';
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
import { Supplier, SupplierOrder, SupplierOrderItem, SupplierOrderType, Product } from '../types';
import { useSupplierOrderNeeds, type SupplierOrderGroupedNeed } from '../hooks/useSupplierOrderNeeds';
import { api } from '../lib/supabase';
import { useUI } from './UIProvider';
import { mergeNeedIntoItems } from '../utils/mergeSupplierNeedIntoOrder';
import { needBreakdownKey, unattributedQty } from '../utils/supplierOrderNeedBreakdown';
import {
    defaultMaskForNeed,
    mergeManyNeedsWithCustomerFilter,
    normCustomerKey,
    purchaseOrderFilterFromTab,
    type PurchaseOrderCustomerFilter,
    type PurchaseOrderFilterTab,
} from '../utils/supplierOrderCustomerFilter';
import {
    getPurchaseOrderLinePresentation,
    shouldShowPurchaseOrderSizeInput,
} from '../features/suppliers/purchaseOrderPresentation';
import PurchaseNeedRow from './PurchaseNeedRow';
import PurchaseOrderCustomerFilterBar from './PurchaseOrderCustomerFilterBar';

interface Props {
    supplier: Supplier;
    onClose: () => void;
    /** When set, builder updates this pending order instead of creating a new one. */
    initialOrder?: SupplierOrder | null;
}

type SearchResult =
    | { kind: 'Product'; key: string; name: string; sub: string; image?: string | null; item: Product; variantSuffix: string }
    | { kind: 'Material'; key: string; name: string; sub: string; image?: string | null; item: any; variantSuffix?: never };

const panelTitle = 'text-[11px] font-black uppercase tracking-[0.16em] text-slate-500';
const fieldLabel = 'text-[10px] font-black uppercase tracking-wide text-slate-400';

function StatPill({ label, value, tone }: { label: string; value: number; tone: 'purple' | 'indigo' | 'blue' | 'emerald' }) {
    const toneClasses = {
        purple: 'bg-purple-50 text-purple-700 border-purple-100',
        indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
        blue: 'bg-blue-50 text-blue-700 border-blue-100',
        emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    };

    return (
        <div className={`rounded-2xl border px-3 py-2 ${toneClasses[tone]}`}>
            <div className="text-[9px] font-black uppercase tracking-wide opacity-70">{label}</div>
            <div className="mt-0.5 text-lg font-black tabular-nums">{value}</div>
        </div>
    );
}

export default function DesktopPurchaseOrderBuilder({ supplier, onClose, initialOrder = null }: Props) {
    const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
    const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
    const queryClient = useQueryClient();
    const { showToast } = useUI();
    const { productionNeeds, pendingOrderNeeds } = useSupplierOrderNeeds(supplier);

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
        showToast(`${label}: οι ποσότητες προστέθηκαν με βάση το φίλτρο πελατών.`, 'success');
    };

    const searchResults = useMemo<SearchResult[]>(() => {
        const lower = searchTerm.trim().toLowerCase();

        if (searchType === 'Material') {
            return (materials || [])
                .filter((material: any) => material.supplier_id === supplier.id)
                .filter((material: any) => !lower || material.name.toLowerCase().includes(lower))
                .slice(0, 20)
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
                if (!lower || fullSku.toLowerCase().includes(lower) || product.sku.toLowerCase().includes(lower)) {
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

        return results.slice(0, 20);
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

    const updateItem = (index: number, field: 'qty' | 'notes' | 'size', val: any) => {
        setItems((previous) => {
            const updated = [...previous];
            const item = { ...updated[index] };
            if (field === 'qty') item.quantity = Math.max(1, Number(val) || 1);
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
        const buttonClasses = accent === 'indigo'
            ? 'bg-indigo-600 hover:bg-indigo-700'
            : 'bg-blue-600 hover:bg-blue-700';

        return (
            <div className={`rounded-3xl border p-4 shadow-sm ${accentClasses}`}>
                <div className="flex items-start justify-between gap-3">
                    <button
                        type="button"
                        onClick={() => setOpen((value) => !value)}
                        className="flex min-w-0 flex-1 items-start gap-3 rounded-2xl p-1 text-left transition-colors hover:bg-white/45"
                        aria-expanded={open}
                    >
                        <span className="mt-0.5 rounded-xl bg-white/75 p-2 shadow-sm">{icon}</span>
                        <span className="min-w-0">
                            <span className="block text-xs font-black uppercase tracking-wide">{title}</span>
                            <span className="mt-0.5 block text-[11px] font-bold opacity-75">{subtitle}</span>
                        </span>
                        <ChevronDown
                            size={18}
                            className={`ml-auto mt-1 shrink-0 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`}
                            aria-hidden
                        />
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-lg bg-white/80 px-2 py-1 text-[10px] font-black tabular-nums">{needs.length}</span>
                        <button
                            type="button"
                            onClick={onAddAll}
                            className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white shadow-sm transition-colors ${buttonClasses}`}
                        >
                            <ListPlus size={14} /> Όλα
                        </button>
                    </div>
                </div>
                {open && (
                    <div className="mt-4 space-y-2">
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
                                    layout="desktop"
                                />
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm animate-in fade-in">
            <div className="flex h-[92vh] w-full max-w-[92rem] flex-col overflow-hidden rounded-[2rem] border border-white/40 bg-slate-50 shadow-2xl">
                <div className="z-10 flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
                    <div className="flex min-w-0 items-center gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-purple-50 text-purple-700 ring-1 ring-purple-100">
                            <Globe2 size={24} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="truncate text-xl font-black text-slate-900">
                                    {initialOrder ? 'Επεξεργασία Εντολής Αγοράς' : 'Νέα Εντολή Αγοράς'}
                                </h2>
                                <span className="rounded-full border border-purple-100 bg-purple-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-purple-700">
                                    Προμηθευτής
                                </span>
                            </div>
                            <p className="mt-0.5 truncate text-sm font-bold text-slate-500">{supplier.name}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="hidden items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 md:flex">
                            <PackageCheck size={16} className="text-emerald-600" />
                            <span className="text-xs font-black text-slate-700">
                                {items.length} είδη · {totalPieces} τεμ.
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                            aria-label="Κλείσιμο"
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>

                <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-hidden p-5 lg:grid-cols-12">
                    <section className="flex min-h-0 flex-col rounded-3xl border border-slate-100 bg-white shadow-sm lg:col-span-4">
                        <div className="border-b border-slate-100 px-5 py-4">
                            <div className="flex items-center gap-2">
                                <Factory size={17} className="text-indigo-600" />
                                <h3 className={panelTitle}>Έξυπνες ανάγκες</h3>
                            </div>
                            <p className="mt-1 text-xs font-bold text-slate-500">Προσθήκη από παραγωγή ή εκκρεμείς παραγγελίες πελατών.</p>
                        </div>
                        <div className="flex-1 space-y-4 overflow-y-auto p-5 custom-scrollbar">
                            <PurchaseOrderCustomerFilterBar
                                uniqueCustomers={uniquePoCustomers}
                                tab={customerFilterTab}
                                onTabChange={setCustomerFilterTab}
                                pickedKeys={customerPickKeys}
                                onTogglePicked={toggleCustomerPick}
                                expanded={customerFilterExpanded}
                                onToggleExpanded={() => setCustomerFilterExpanded((open) => !open)}
                                layout="desktop"
                            />
                            {renderNeedSection(
                                'Ανάγκες Παραγωγής',
                                'Παρτίδες που περιμένουν παραλαβή από προμηθευτή.',
                                productionNeeds,
                                'indigo',
                                productionNeedsOpen,
                                setProductionNeedsOpen,
                                () => addManyNeeds(productionNeeds, 'Ανάγκες παραγωγής'),
                                <Factory size={17} />,
                                'prod',
                            )}
                            {renderNeedSection(
                                'Ανάγκες Παραγγελιών',
                                'Εκκρεμή εισαγόμενα είδη από παραγγελίες πελατών.',
                                pendingOrderNeeds,
                                'blue',
                                pendingNeedsOpen,
                                setPendingNeedsOpen,
                                () => addManyNeeds(pendingOrderNeeds, 'Ανάγκες παραγγελιών'),
                                <ShoppingCart size={17} />,
                                'pend',
                            )}
                            {productionNeeds.length === 0 && pendingOrderNeeds.length === 0 && (
                                <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                                    <Factory size={36} className="mx-auto text-slate-300" />
                                    <p className="mt-3 text-sm font-black text-slate-500">Δεν υπάρχουν αυτόματες ανάγκες.</p>
                                    <p className="mt-1 text-xs font-bold text-slate-400">Χρησιμοποιήστε τη χειροκίνητη προσθήκη.</p>
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="flex min-h-0 flex-col rounded-[2rem] border border-slate-200 bg-slate-50/70 p-5 shadow-inner lg:col-span-3">
                        <div className="grid grid-cols-2 gap-2">
                            <StatPill label="Παραγωγή" value={productionNeeds.length} tone="indigo" />
                            <StatPill label="Εκκρεμή" value={pendingOrderNeeds.length} tone="blue" />
                            <StatPill label="Είδη" value={items.length} tone="purple" />
                            <StatPill label="Τεμάχια" value={totalPieces} tone="emerald" />
                        </div>

                        <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="mb-3 flex items-center gap-2">
                                <Search size={16} className="text-purple-600" />
                                <h3 className={panelTitle}>Χειροκίνητη προσθήκη</h3>
                            </div>
                            <div className="mb-3 grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1">
                                <button
                                    type="button"
                                    onClick={() => setSearchType('Product')}
                                    className={`rounded-xl py-2 text-xs font-black transition-all ${searchType === 'Product' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Προϊόντα
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSearchType('Material')}
                                    className={`rounded-xl py-2 text-xs font-black transition-all ${searchType === 'Material' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Υλικά
                                </button>
                            </div>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm font-bold text-slate-800 outline-none transition-all focus:border-purple-300 focus:bg-white focus:ring-4 focus:ring-purple-500/10"
                                    placeholder="Αναζήτηση..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <div className="mt-3 max-h-[36vh] space-y-2 overflow-y-auto pr-1 custom-scrollbar">
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
                                        className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-2.5 text-left shadow-sm transition-all hover:border-emerald-200 hover:bg-emerald-50/40"
                                    >
                                        <span className="flex min-w-0 items-center gap-3">
                                            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 text-slate-400">
                                                {result.image ? <img src={result.image} className="h-full w-full object-cover" alt="" /> : result.kind === 'Material' ? <Box size={16} /> : <Gem size={16} />}
                                            </span>
                                            <span className="min-w-0">
                                                <span className="block truncate font-mono text-sm font-black text-slate-800">{result.name}</span>
                                                <span className="block truncate text-[10px] font-black uppercase tracking-wide text-slate-400">{result.sub}</span>
                                            </span>
                                        </span>
                                        <span className="rounded-xl bg-slate-100 p-2 text-slate-400 transition-colors group-hover:bg-emerald-600 group-hover:text-white">
                                            <Plus size={16} />
                                        </span>
                                    </button>
                                ))}
                                {searchTerm && searchResults.length === 0 && (
                                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-xs font-bold text-slate-400">
                                        Δεν βρέθηκαν αποτελέσματα.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="mt-5 flex min-h-0 flex-1 flex-col rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                            <label className={`${fieldLabel} mb-2 flex items-center gap-1`}>
                                <StickyNote size={12} /> Σημειώσεις εντολής
                            </label>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Γενικές σημειώσεις για τον προμηθευτή..."
                                className="min-h-[7rem] flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-700 outline-none transition-all focus:border-purple-300 focus:bg-white focus:ring-4 focus:ring-purple-500/10"
                            />
                        </div>
                    </section>

                    <section className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm lg:col-span-5">
                        <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-4">
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <PackageCheck size={17} className="text-emerald-600" />
                                        <h3 className={panelTitle}>Περιεχόμενα εντολής</h3>
                                    </div>
                                    <p className="mt-1 text-xs font-bold text-slate-500">{items.length} γραμμές · {totalPieces} τεμάχια</p>
                                </div>
                                {items.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setItems([])}
                                        className="rounded-xl border border-red-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-red-600 transition-colors hover:bg-red-50"
                                    >
                                        Καθαρισμός
                                    </button>
                                )}
                            </div>
                            <div className="relative mt-3">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    value={cartSearchTerm}
                                    onChange={(e) => setCartSearchTerm(e.target.value)}
                                    placeholder="Αναζήτηση μέσα στην εντολή..."
                                    className="w-full rounded-xl border border-slate-100 bg-white py-2 pl-9 pr-3 text-xs font-bold text-slate-700 outline-none transition-all focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/10"
                                />
                            </div>
                        </div>

                        <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/50 p-4 custom-scrollbar">
                            {filteredItems.map(({ item, index }) => {
                                const product = item.item_type === 'Product' ? productBySku.get(item.item_id) : undefined;
                                const display = getPurchaseOrderLinePresentation(item, product);
                                const showSizeInput = shouldShowPurchaseOrderSizeInput(product, item);

                                return (
                                    <div key={`${item.id}-${index}`} className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm transition-all hover:border-slate-300 hover:shadow-md">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex min-w-0 gap-3">
                                                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                                                    {display.imageUrl ? <img src={display.imageUrl} className="h-full w-full object-cover" alt="" /> : <ImageIcon size={22} className="text-slate-300" />}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <span className={`rounded-lg border px-2 py-0.5 font-mono text-base font-black ${display.finishStyle}`}>
                                                            {item.item_name}
                                                        </span>
                                                        {item.size_info && (
                                                            <span className="inline-flex items-center gap-1 rounded-lg border border-blue-100 bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-700">
                                                                <Hash size={10} /> {item.size_info}
                                                            </span>
                                                        )}
                                                        {display.supplierRef && (
                                                            <span className="rounded-lg border border-purple-100 bg-purple-50 px-2 py-1 text-[10px] font-black text-purple-700">
                                                                Ref: {display.supplierRef}
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
                                            <button
                                                type="button"
                                                onClick={() => removeItem(index)}
                                                className="shrink-0 rounded-xl p-2 text-slate-300 transition-all hover:bg-red-50 hover:text-red-500"
                                                aria-label="Αφαίρεση είδους"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>

                                        <div className="mt-3 grid grid-cols-12 gap-3">
                                            <div className="col-span-4">
                                                <label className={`${fieldLabel} mb-1 block`}>Ποσότητα</label>
                                                <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
                                                    <button type="button" onClick={() => updateItem(index, 'qty', item.quantity - 1)} className="h-8 w-8 rounded-lg bg-white font-black text-slate-600 shadow-sm hover:text-slate-900">-</button>
                                                    <input
                                                        type="number"
                                                        value={item.quantity}
                                                        onChange={(e) => updateItem(index, 'qty', parseInt(e.target.value, 10) || 1)}
                                                        className="min-w-0 flex-1 bg-transparent text-center text-sm font-black tabular-nums outline-none"
                                                    />
                                                    <button type="button" onClick={() => updateItem(index, 'qty', item.quantity + 1)} className="h-8 w-8 rounded-lg bg-white font-black text-slate-600 shadow-sm hover:text-slate-900">+</button>
                                                </div>
                                            </div>
                                            {showSizeInput && (
                                                <div className="col-span-3">
                                                    <label className={`${fieldLabel} mb-1 block`}>Μέγεθος</label>
                                                    <input
                                                        value={item.size_info || ''}
                                                        onChange={(e) => updateItem(index, 'size', e.target.value)}
                                                        placeholder="π.χ. 54"
                                                        aria-label={`Μέγεθος για ${item.item_name}`}
                                                        className="w-full rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2 text-right font-mono text-xs font-black text-blue-900 outline-none placeholder:text-blue-300 focus:ring-2 focus:ring-blue-500/15"
                                                    />
                                                </div>
                                            )}
                                            <div className={showSizeInput ? 'col-span-5' : 'col-span-8'}>
                                                <label className={`${fieldLabel} mb-1 block`}>Σημείωση γραμμής</label>
                                                <input
                                                    value={item.notes || ''}
                                                    onChange={(e) => updateItem(index, 'notes', e.target.value)}
                                                    placeholder="Προσθήκη σημείωσης..."
                                                    className="w-full rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 outline-none transition-all placeholder:italic focus:border-emerald-200 focus:bg-white focus:ring-2 focus:ring-emerald-500/10"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            {items.length === 0 && (
                                <div className="flex h-full min-h-[22rem] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white text-center text-slate-300">
                                    <Box size={58} className="mb-4 opacity-25" />
                                    <p className="text-lg font-black text-slate-400">Η εντολή είναι κενή.</p>
                                    <p className="mt-1 text-sm font-bold text-slate-300">Προσθέστε ανάγκες ή είδη από τον προμηθευτή.</p>
                                </div>
                            )}
                            {items.length > 0 && filteredItems.length === 0 && (
                                <div className="rounded-3xl border border-dashed border-slate-200 bg-white py-12 text-center text-sm font-bold text-slate-400">
                                    Δεν ταιριάζει καμία γραμμή με την αναζήτηση.
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-between gap-4 border-t border-slate-200 bg-white px-5 py-4">
                            <div className="text-xs font-bold text-slate-500">
                                <span className="font-black text-slate-800">{totalPieces}</span> τεμ. σε <span className="font-black text-slate-800">{items.length}</span> γραμμές
                            </div>
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={isSaving || items.length === 0}
                                className="inline-flex items-center gap-3 rounded-2xl bg-[#060b00] px-7 py-3.5 text-sm font-black text-white shadow-xl transition-all hover:-translate-y-0.5 hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                            >
                                {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                                {initialOrder ? 'Αποθήκευση αλλαγών' : 'Αποθήκευση εντολής'}
                            </button>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
