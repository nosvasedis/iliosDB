
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Supplier, SupplierOrderItem, SupplierOrderType, Product, Gender, SupplierOrder } from '../../types';
import { X, Search, Plus, Save, Trash2, Box, Gem, Factory, ImageIcon, StickyNote, ShoppingCart, Hash, ListPlus, ChevronDown, Loader2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { useUI } from '../UIProvider';
import { getVariantComponents } from '../../utils/pricingEngine';
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
import PurchaseNeedRow from '../PurchaseNeedRow';
import PurchaseOrderCustomerFilterBar from '../PurchaseOrderCustomerFilterBar';
import { getSizingInfo, SIZE_TYPE_NUMBER } from '../../utils/sizing';

interface Props {
    supplier: Supplier;
    onClose: () => void;
    initialOrder?: SupplierOrder | null;
}

// Visual Config
const FINISH_STYLES: Record<string, string> = {
    'X': 'bg-amber-100 text-amber-800 border-amber-200',
    'P': 'bg-stone-200 text-stone-800 border-stone-300',
    'D': 'bg-orange-100 text-orange-800 border-orange-200',
    'H': 'bg-cyan-100 text-cyan-900 border-cyan-200',
    '': 'bg-emerald-50 text-emerald-700 border-emerald-200'
};

const STONE_TEXT_COLORS: Record<string, string> = {
    'KR': 'text-rose-600', 'QN': 'text-slate-900', 'LA': 'text-blue-600', 'TY': 'text-teal-500',
    'TG': 'text-orange-700', 'IA': 'text-red-700', 'BSU': 'text-slate-800', 'GSU': 'text-emerald-800',
    'RSU': 'text-rose-800', 'MA': 'text-emerald-600', 'FI': 'text-slate-400', 'OP': 'text-indigo-500',
    'NF': 'text-green-800', 'CO': 'text-orange-500', 'PCO': 'text-emerald-500', 'MCO': 'text-purple-500',
    'PAX': 'text-green-600', 'MAX': 'text-blue-700', 'KAX': 'text-red-700', 'AI': 'text-slate-600',
    'AP': 'text-cyan-600', 'AM': 'text-teal-700', 'LR': 'text-indigo-700', 'BST': 'text-sky-500',
    'MP': 'text-blue-500', 'LE': 'text-slate-400', 'PR': 'text-green-500', 'KO': 'text-red-500',
    'MV': 'text-purple-400', 'RZ': 'text-pink-500', 'AK': 'text-cyan-400', 'XAL': 'text-stone-500'
};

const isRingPurchaseLine = (product: Product | undefined, item?: SupplierOrderItem): boolean => {
    const sizing = product ? getSizingInfo(product) : null;
    const values = [
        product?.prefix,
        product?.sku,
        product?.supplier_sku,
        product?.category,
        item?.item_id,
        item?.item_name,
    ].map(v => (v || '').toUpperCase());

    return (
        sizing?.type === SIZE_TYPE_NUMBER ||
        values.some(v => v.startsWith('DM') || v.includes('ΔΑΧ') || v.includes('ΔΑΚΤΥΛ') || v.includes('RING'))
    );
};

const shouldShowSizeInput = (product: Product | undefined, item: SupplierOrderItem): boolean =>
    item.item_type === 'Product' && (isRingPurchaseLine(product, item) || !!item.size_info);

export default function MobilePurchaseOrderBuilder({ supplier, onClose, initialOrder = null }: Props) {
    const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
    const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
    const queryClient = useQueryClient();
    const { showToast } = useUI();
    const { productionNeeds, pendingOrderNeeds } = useSupplierOrderNeeds(supplier);
    const cartSectionRef = useRef<HTMLDivElement>(null);

    const [items, setItems] = useState<SupplierOrderItem[]>(() => initialOrder?.items ?? []);
    const [searchTerm, setSearchTerm] = useState('');
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

    const poCustomerFilter: PurchaseOrderCustomerFilter = useMemo(
        () => purchaseOrderFilterFromTab(customerFilterTab, customerPickKeys),
        [customerFilterTab, customerPickKeys]
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
            setItems(initialOrder.items.map(i => ({ ...i })));
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
        setRowSelectionMasks(p => ({ ...p, [key]: next }));
    };

    const toggleCustomerPick = (displayName: string) => {
        const k = normCustomerKey(displayName);
        setCustomerPickKeys(prev => {
            const n = new Set(prev);
            if (n.has(k)) n.delete(k);
            else n.add(k);
            return n;
        });
    };

    const addAllProductionNeeds = () => {
        const withProduct = productionNeeds.filter(n => n.product);
        if (withProduct.length === 0) {
            showToast('Δεν υπάρχουν διαθέσιμες γραμμές.', 'error');
            return;
        }
        if (customerFilterTab === 'include_only' && customerPickKeys.size === 0) {
            showToast('Επιλέξτε πελάτες στη λειτουργία «Μόνο…» ή αλλάξτε φίλτρο.', 'error');
            return;
        }
        setItems(prev => mergeManyNeedsWithCustomerFilter(prev, withProduct, poCustomerFilter));
        showToast('Προστέθηκαν ποσότητες (φίλτρο πελατών).', 'success');
    };

    const addAllPendingOrderNeeds = () => {
        const withProduct = pendingOrderNeeds.filter(n => n.product);
        if (withProduct.length === 0) {
            showToast('Δεν υπάρχουν διαθέσιμες γραμμές.', 'error');
            return;
        }
        if (customerFilterTab === 'include_only' && customerPickKeys.size === 0) {
            showToast('Επιλέξτε πελάτες στη λειτουργία «Μόνο…» ή αλλάξτε φίλτρο.', 'error');
            return;
        }
        setItems(prev => mergeManyNeedsWithCustomerFilter(prev, withProduct, poCustomerFilter));
        showToast('Προστέθηκαν ποσότητες (φίλτρο πελατών).', 'success');
    };

    const searchResults = useMemo(() => {
        const lower = searchTerm.toLowerCase();
        if (!lower) return [];

        if (searchType === 'Material') {
            return materials?.filter(m => m.name.toLowerCase().includes(lower) && m.supplier_id === supplier.id).slice(0, 10) || [];
        }
        if (!products) return [];

        const results: { product: Product; variantSuffix: string; displayName: string; image?: string | null }[] = [];

        products.forEach(p => {
            if (p.supplier_id !== supplier.id) return;

            if (p.sku.toLowerCase().includes(lower)) {
                if (!p.variants || p.variants.length === 0) {
                    results.push({ product: p, variantSuffix: '', displayName: p.sku, image: p.image_url });
                }
            }
            if (p.variants && p.variants.length > 0) {
                p.variants.forEach(v => {
                    const fullSku = `${p.sku}${v.suffix}`;
                    if (fullSku.toLowerCase().includes(lower) || p.sku.toLowerCase().includes(lower)) {
                        results.push({ product: p, variantSuffix: v.suffix, displayName: fullSku, image: p.image_url });
                    }
                });
            }
        });
        return results.slice(0, 10);
    }, [searchTerm, searchType, materials, products, supplier.id]);

    const addItem = (
        item: any,
        type: SupplierOrderType,
        qty: number = 1,
        variantSuffix: string = '',
        size: string = '',
        addOptions?: { requirements?: { customer: string }[] }
    ) => {
        if (type === 'Material') {
            const id = item.id;
            const name = item.name;
            const cost = 0;
            setItems(prev => {
                const existingIdx = prev.findIndex(i => i.item_name === name && i.item_type === type && (i.size_info || '') === '');
                if (existingIdx >= 0) {
                    const updated = [...prev];
                    updated[existingIdx].quantity += qty;
                    updated[existingIdx].total_cost = 0;
                    return updated;
                }
                return [
                    ...prev,
                    {
                        id: Math.random().toString(36),
                        item_type: type,
                        item_id: id,
                        item_name: name,
                        quantity: qty,
                        unit_cost: cost,
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

        setItems(prev =>
            mergeNeedIntoItems(
                prev,
                {
                    variant: suffix,
                    size: finalSize || undefined,
                    totalQty: qty,
                    product,
                    requirements: addOptions?.requirements,
                },
                'Product'
            )
        );
        setSearchTerm('');
        showToast(`Προστέθηκε: ${product.sku}${suffix}`, 'success');
    };

    const updateItem = (index: number, field: 'qty' | 'cost' | 'notes' | 'size', val: any) => {
        setItems(prev => {
            const updated = [...prev];
            const item = { ...updated[index] };
            if (field === 'qty') item.quantity = Number(val);
            else if (field === 'cost') item.unit_cost = Number(val);
            else if (field === 'notes') item.notes = val;
            else if (field === 'size') item.size_info = String(val).trim() || undefined;

            item.total_cost = 0;
            updated[index] = item;
            return updated;
        });
    };

    const removeItem = (index: number) => setItems(prev => prev.filter((_, i) => i !== index));

    const handleSave = async () => {
        if (items.length === 0) { showToast("Η εντολή είναι κενή.", "error"); return; }

        setIsSaving(true);
        try {
            if (initialOrder) {
                const order: SupplierOrder = {
                    ...initialOrder,
                    items,
                    notes,
                    total_amount: 0,
                };
                await api.updateSupplierOrder(order);
                queryClient.invalidateQueries({ queryKey: ['supplier_orders'] });
                showToast('Η εντολή ενημερώθηκε.', 'success');
            } else {
                const order: SupplierOrder = {
                    id: crypto.randomUUID(),
                    supplier_id: supplier.id,
                    supplier_name: supplier.name,
                    created_at: new Date().toISOString(),
                    status: 'Pending',
                    total_amount: 0,
                    items,
                    notes
                };
                await api.saveSupplierOrder(order);
                queryClient.invalidateQueries({ queryKey: ['supplier_orders'] });
                showToast("Η εντολή δημιουργήθηκε!", "success");
            }
            onClose();
        } catch (e) {
            showToast("Σφάλμα.", "error");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[110] bg-slate-50 flex flex-col animate-in slide-in-from-bottom duration-300">
            <div className="bg-white p-4 border-b border-slate-100 flex justify-between items-start gap-3 shadow-sm z-10">
                <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-black text-slate-800">
                        {initialOrder ? 'Επεξεργασία Εντολής' : 'Νέα Εντολή Αγοράς'}
                    </h2>
                    <p className="text-xs text-slate-500 font-bold truncate mt-0.5">{supplier.name}</p>
                    <button
                        type="button"
                        onClick={() => cartSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                        className="mt-2 text-[10px] font-black uppercase tracking-wide text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-lg active:scale-[0.98] transition-transform"
                    >
                        Καλάθι · {items.length} είδη
                    </button>
                </div>
                <button type="button" onClick={onClose} className="shrink-0 p-1 -mr-1 rounded-lg hover:bg-slate-100" aria-label="Κλείσιμο">
                    <X size={24} className="text-slate-500" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <PurchaseOrderCustomerFilterBar
                    uniqueCustomers={uniquePoCustomers}
                    tab={customerFilterTab}
                    onTabChange={setCustomerFilterTab}
                    pickedKeys={customerPickKeys}
                    onTogglePicked={toggleCustomerPick}
                    expanded={customerFilterExpanded}
                    onToggleExpanded={() => setCustomerFilterExpanded(o => !o)}
                    layout="mobile"
                />

                {/* Production Needs */}
                {productionNeeds.length > 0 && (
                    <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <button
                                type="button"
                                onClick={() => setProductionNeedsOpen(o => !o)}
                                className="flex items-center gap-2 text-xs font-black text-indigo-700 uppercase text-left min-w-0 flex-1 rounded-lg hover:bg-indigo-100/50 -m-1 p-1 transition-colors"
                                aria-expanded={productionNeedsOpen}
                            >
                                <ChevronDown
                                    size={16}
                                    className={`shrink-0 text-indigo-600 transition-transform duration-200 ${productionNeedsOpen ? 'rotate-0' : '-rotate-90'}`}
                                    aria-hidden
                                />
                                <Factory size={14} className="shrink-0" />
                                <span className="truncate">Ανάγκες Παραγωγής</span>
                            </button>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100/80 px-2 py-0.5 rounded-md">{productionNeeds.length} είδη</span>
                                <button
                                    type="button"
                                    onClick={addAllProductionNeeds}
                                    className="flex items-center gap-1 bg-indigo-600 text-white px-2.5 py-1 rounded-lg text-[10px] font-black uppercase active:scale-95 transition-transform"
                                >
                                    <ListPlus size={14} /> Όλα
                                </button>
                            </div>
                        </div>
                        {productionNeedsOpen &&
                            productionNeeds.map(n => {
                                const k = needBreakdownKey('prod', n);
                                return (
                                    <PurchaseNeedRow
                                        key={k}
                                        need={n}
                                        accent="indigo"
                                        expanded={!!needBreakdownOpen[k]}
                                        onToggleBreakdown={() =>
                                            setNeedBreakdownOpen(p => ({ ...p, [k]: !p[k] }))
                                        }
                                        selectionMask={resolveRowMask(k, n)}
                                        onSelectionChange={next => setRowMask(k, n, next)}
                                        onAddFiltered={(qty, reqs) =>
                                            addItem(n, 'Product', qty, n.variant, n.size, {
                                                requirements: reqs,
                                            })
                                        }
                                        onNotifyZero={() =>
                                            showToast('Επιλέξτε τουλάχιστον μία γραμμή ποσότητας.', 'error')
                                        }
                                        layout="mobile"
                                    />
                                );
                            })}
                    </div>
                )}

                {/* Pending Order Needs */}
                {pendingOrderNeeds.length > 0 && (
                    <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <button
                                type="button"
                                onClick={() => setPendingNeedsOpen(o => !o)}
                                className="flex items-center gap-2 text-xs font-black text-blue-700 uppercase text-left min-w-0 flex-1 rounded-lg hover:bg-blue-100/50 -m-1 p-1 transition-colors"
                                aria-expanded={pendingNeedsOpen}
                            >
                                <ChevronDown
                                    size={16}
                                    className={`shrink-0 text-blue-600 transition-transform duration-200 ${pendingNeedsOpen ? 'rotate-0' : '-rotate-90'}`}
                                    aria-hidden
                                />
                                <ShoppingCart size={14} className="shrink-0" />
                                <span className="truncate">Ανάγκες Παραγγελιών (Εκκρεμείς)</span>
                            </button>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] font-bold text-blue-600 bg-blue-100/80 px-2 py-0.5 rounded-md">{pendingOrderNeeds.length} είδη</span>
                                <button
                                    type="button"
                                    onClick={addAllPendingOrderNeeds}
                                    className="flex items-center gap-1 bg-blue-600 text-white px-2.5 py-1 rounded-lg text-[10px] font-black uppercase active:scale-95 transition-transform"
                                >
                                    <ListPlus size={14} /> Όλα
                                </button>
                            </div>
                        </div>
                        {pendingNeedsOpen &&
                            pendingOrderNeeds.map(n => {
                                const k = needBreakdownKey('pend', n);
                                return (
                                    <PurchaseNeedRow
                                        key={k}
                                        need={n}
                                        accent="blue"
                                        expanded={!!needBreakdownOpen[k]}
                                        onToggleBreakdown={() =>
                                            setNeedBreakdownOpen(p => ({ ...p, [k]: !p[k] }))
                                        }
                                        selectionMask={resolveRowMask(k, n)}
                                        onSelectionChange={next => setRowMask(k, n, next)}
                                        onAddFiltered={(qty, reqs) =>
                                            addItem(n, 'Product', qty, n.variant, n.size, {
                                                requirements: reqs,
                                            })
                                        }
                                        onNotifyZero={() =>
                                            showToast('Επιλέξτε τουλάχιστον μία γραμμή ποσότητας.', 'error')
                                        }
                                        layout="mobile"
                                    />
                                );
                            })}
                    </div>
                )}

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button onClick={() => setSearchType('Product')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${searchType === 'Product' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>Προϊόντα</button>
                        <button onClick={() => setSearchType('Material')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${searchType === 'Material' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500'}`}>Υλικά</button>
                    </div>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-800/20 font-medium"
                            placeholder="Αναζήτηση..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && searchResults.length > 0 && (
                            <div className="absolute top-full left-0 right-0 bg-white shadow-xl rounded-xl border border-slate-100 mt-2 z-50 overflow-hidden max-h-48 overflow-y-auto">
                                {searchResults.map((r: any) => {
                                    const isProd = searchType === 'Product';
                                    const name = isProd ? r.displayName : r.name;
                                    const img = isProd ? r.image : r.image_url;
                                    const sub = isProd ? r.product.category : r.type;

                                    return (
                                        <div key={isProd ? name : r.id} onClick={() => addItem(r, searchType)} className="p-3 border-b border-slate-50 flex justify-between items-center hover:bg-slate-50">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 overflow-hidden">
                                                    {img ? <img src={img} className="w-full h-full object-cover" /> : (searchType === 'Material' ? <Box size={14} /> : <Gem size={14} />)}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-sm text-slate-800">{name}</div>
                                                    <div className="text-xs text-slate-400">{sub}</div>
                                                </div>
                                            </div>
                                            <Plus size={16} className="text-emerald-500" />
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                <div ref={cartSectionRef} className="flex items-center justify-between gap-2 scroll-mt-4">
                    <span className="text-xs font-black text-slate-500 uppercase">Περιεχόμενα ({items.length})</span>
                    {items.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setItems([])}
                            className="text-[10px] font-black uppercase text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg border border-red-200/80 transition-colors"
                        >
                            Καθαρισμός
                        </button>
                    )}
                </div>

                <div className="space-y-2">
                    {items.map((item, idx) => {
                        // Resolve image
                        let imgUrl = null;
                        let supplierRef = null;
                        let product: Product | undefined;

                        if (item.item_type === 'Product' && products) {
                            product = products.find(prod => prod.sku === item.item_id);
                            imgUrl = product?.image_url;
                            supplierRef = product?.supplier_sku;
                        }
                        const showSizeInput = shouldShowSizeInput(product, item);

                        let suffixStr = '';
                        if (product && item.item_name.startsWith(product.sku)) {
                            suffixStr = item.item_name.slice(product.sku.length);
                        }

                        const { finish, stone } = getVariantComponents(suffixStr, product?.gender || Gender.Unisex);

                        const finishStyle = FINISH_STYLES[finish.code] || FINISH_STYLES[''];
                        const stoneColor = STONE_TEXT_COLORS[stone.code] || 'text-slate-600';

                        let desc = product?.category || 'Είδος';
                        if (finish.name) desc = `${finish.name}`;
                        if (stone.name) desc += ` • ${stone.name}`;
                        if (item.item_type === 'Material') desc = 'Υλικό';

                        return (
                            <div key={idx} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex flex-col gap-2">
                                <div className="flex justify-between items-start">
                                    <div className="flex gap-3">
                                        <div className="w-12 h-12 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 shrink-0 flex items-center justify-center">
                                            {imgUrl ? <img src={imgUrl} className="w-full h-full object-cover" /> : <ImageIcon size={20} className="text-slate-300" />}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`font-black text-lg px-2 py-0.5 rounded border ${item.item_type === 'Product' ? finishStyle : 'bg-slate-50 text-slate-800 border-slate-200'}`}>
                                                    {item.item_name}
                                                </span>
                                                {item.size_info && (
                                                    <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-100 flex items-center gap-1">
                                                        <Hash size={10} /> {item.size_info}
                                                    </span>
                                                )}
                                                {supplierRef && (
                                                    <span className="text-[10px] font-bold bg-purple-50 text-purple-700 px-2 py-1 rounded border border-purple-100">
                                                        {supplierRef}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="text-xs font-bold text-slate-500 flex items-center gap-1">
                                                {desc}
                                                {stone.code && <span className={`ml-1 font-black ${stoneColor}`}>{stone.code}</span>}
                                            </div>
                                            {item.customer_reference && (
                                                <div className="text-[11px] font-bold text-slate-600 mt-1">
                                                    <span className="text-slate-400 font-black uppercase text-[9px] mr-1">Πελάτης:</span>
                                                    {item.customer_reference}
                                                </div>
                                            )}
                                            {showSizeInput && (
                                                <label className="mt-2 flex w-36 items-center gap-1.5 rounded-lg border border-blue-100 bg-blue-50/60 px-2 py-1 text-[9px] font-black uppercase text-blue-700">
                                                    <Hash size={9} className="shrink-0" />
                                                    <span className="shrink-0">Μέγεθος</span>
                                                    <input
                                                        value={item.size_info || ''}
                                                        onChange={e => updateItem(idx, 'size', e.target.value)}
                                                        placeholder="54"
                                                        aria-label={`Μέγεθος για ${item.item_name}`}
                                                        className="min-w-0 flex-1 bg-transparent text-right font-mono text-[11px] font-black text-blue-900 outline-none placeholder:text-blue-300"
                                                    />
                                                </label>
                                            )}
                                        </div>
                                    </div>
                                    <button type="button" onClick={() => removeItem(idx)} className="text-red-400"><Trash2 size={16} /></button>
                                </div>

                                <div className="flex gap-2 items-center mt-2">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-1 bg-slate-50 rounded-lg p-1">
                                            <button onClick={() => updateItem(idx, 'qty', Math.max(1, item.quantity - 1))} className="w-8 h-8 bg-white rounded shadow-sm flex items-center justify-center text-slate-600 font-bold">-</button>
                                            <input type="number" className="w-full bg-transparent font-black text-center outline-none" value={item.quantity} onChange={e => updateItem(idx, 'qty', parseInt(e.target.value) || 1)} />
                                            <button onClick={() => updateItem(idx, 'qty', item.quantity + 1)} className="w-8 h-8 bg-white rounded shadow-sm flex items-center justify-center text-slate-600 font-bold">+</button>
                                        </div>
                                    </div>

                                    <div className="flex-[2] relative">
                                        <StickyNote size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-300" />
                                        <input
                                            value={item.notes || ''}
                                            onChange={e => updateItem(idx, 'notes', e.target.value)}
                                            className="w-full pl-8 p-2 bg-slate-50 rounded-lg text-xs outline-none focus:bg-white border border-transparent focus:border-slate-200 transition-colors"
                                            placeholder="Σημείωση..."
                                        />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {items.length === 0 && <div className="text-center py-8 text-slate-400 text-xs italic">Η λίστα είναι κενή.</div>}
                </div>

                <div className="pt-4">
                    <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Σημειώσεις Εντολής</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none h-20 resize-none mt-1" placeholder="Εσωτερικές σημειώσεις..." />
                </div>
            </div>

            <div className="p-4 bg-white border-t border-slate-200 z-20">
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving || items.length === 0}
                    className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform disabled:opacity-50 disabled:pointer-events-none"
                >
                    {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                    {initialOrder ? 'Αποθήκευση αλλαγών' : 'Αποθήκευση Εντολής'}
                </button>
            </div>
        </div>
    );
}
