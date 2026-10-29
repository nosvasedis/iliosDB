import { useRestartDraft } from '../hooks/useRestartBlocker';
import StoneCodeText from './StoneCodeText';
import { formatNumber } from '../utils/numberFormat';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    AlertTriangle,
    Box,
    ChevronDown,
    Factory,
    Gem,
    Hash,
    ImageIcon,
    ListPlus,
    Loader2,
    Minus,
    PackageCheck,
    Plus,
    Save,
    Search,
    ShoppingCart,
    Sparkles,
    StickyNote,
    Trash2,
    X,
} from 'lucide-react';
import { Supplier, SupplierOrder, SupplierOrderItem, SupplierOrderType, Product, Material } from '../types';
import { useSupplierOrderNeeds, type SupplierOrderGroupedNeed } from '../hooks/useSupplierOrderNeeds';
import { api } from '../lib/supabase';
import { useUI } from './UIProvider';
import { mergeNeedIntoItems, rebuildSupplierOrderItemFromAllocations } from '../utils/mergeSupplierNeedIntoOrder';
import { supplierOrderItemAllocationQty, supplierOrderItemManualQty } from '../features/suppliers/purchaseNeedPlanner';
import { needBreakdownKey } from '../utils/supplierOrderNeedBreakdown';
import {
    defaultRequirementSelectionIds,
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
import { validateSupplierOrderDraftLive } from '../features/suppliers/supplierOrderValidation';
import PurchaseNeedRow from './PurchaseNeedRow';
import PurchaseOrderCustomerFilterBar from './PurchaseOrderCustomerFilterBar';
import { SupplierAvatar } from './suppliers/SupplierCard';
import { MATERIAL_TYPE_LABELS } from './suppliers/supplierUi';

interface Props {
    supplier: Supplier;
    onClose: () => void;
    /** When set, builder updates this pending order instead of creating a new one. */
    initialOrder?: SupplierOrder | null;
}

type SourceTab = 'needs' | 'catalog';

type SearchResult =
    | { kind: 'Product'; key: string; name: string; sub: string; image?: string | null; stock?: number; item: Product; variantSuffix: string }
    | { kind: 'Material'; key: string; name: string; sub: string; image?: string | null; stock?: number; item: Material; variantSuffix?: never };

const CATALOG_LIMIT = 60;
const panelTitle = 'text-[11px] font-black uppercase tracking-[0.16em] text-slate-500';
const fieldLabel = 'text-[10px] font-black uppercase tracking-wide text-slate-400';
const lineKey = (type: SupplierOrderType, name: string) => `${type}:${name}`;

function QtyStepper({ value, min, onChange, size = 'md' }: { value: number; min: number; onChange: (next: number) => void; size?: 'sm' | 'md' }) {
    const button = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';
    return (
        <div className="flex items-center gap-0.5 rounded-xl bg-slate-100 p-0.5">
            <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} className={`${button} flex items-center justify-center rounded-lg bg-white text-slate-600 shadow-sm transition-colors hover:text-slate-900 disabled:opacity-40`} aria-label="Μείωση">
                <Minus size={13} strokeWidth={3} />
            </button>
            <input
                type="number"
                min={min}
                value={value}
                onChange={(event) => onChange(Math.max(min, parseInt(event.target.value, 10) || 0))}
                onFocus={(event) => event.target.select()}
                className={`${size === 'sm' ? 'w-9 text-xs' : 'w-12 text-sm'} min-w-0 bg-transparent text-center font-black tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
            />
            <button type="button" onClick={() => onChange(value + 1)} className={`${button} flex items-center justify-center rounded-lg bg-white text-slate-600 shadow-sm transition-colors hover:text-slate-900`} aria-label="Αύξηση">
                <Plus size={13} strokeWidth={3} />
            </button>
        </div>
    );
}

export default function DesktopPurchaseOrderBuilder({ supplier, onClose, initialOrder = null }: Props) {
    const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
    const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();

    const [items, setItems] = useState<SupplierOrderItem[]>(() => initialOrder?.items ?? []);
    const { productionNeeds, pendingOrderNeeds, unassignedNeeds, isLoading: needsLoading } = useSupplierOrderNeeds(
        supplier,
        items,
        initialOrder?.id,
    );
    const [sourceTab, setSourceTab] = useState<SourceTab | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [catalogQty, setCatalogQty] = useState<Record<string, number>>({});
    const [cartSearchTerm, setCartSearchTerm] = useState('');
    const [searchType, setSearchType] = useState<SupplierOrderType>('Product');
    const [notes, setNotes] = useState(() => initialOrder?.notes ?? '');
    const [notesOpen, setNotesOpen] = useState(() => !!initialOrder?.notes);
    const [isSaving, setIsSaving] = useState(false);
    const [conflictingSourceIds, setConflictingSourceIds] = useState<Set<string>>(() => new Set());
    const [productionNeedsOpen, setProductionNeedsOpen] = useState(true);
    const [pendingNeedsOpen, setPendingNeedsOpen] = useState(true);
    const [needBreakdownOpen, setNeedBreakdownOpen] = useState<Record<string, boolean>>({});
    const [customerFilterExpanded, setCustomerFilterExpanded] = useState(false);
    const [customerFilterTab, setCustomerFilterTab] = useState<PurchaseOrderFilterTab>('all');
    const [customerPickKeys, setCustomerPickKeys] = useState<Set<string>>(() => new Set());
    const [rowSelectionMasks, setRowSelectionMasks] = useState<Record<string, string[]>>({});
    const [flashKeys, setFlashKeys] = useState<Set<string>>(() => new Set());
    const searchInputRef = useRef<HTMLInputElement>(null);
    const dialogBusyRef = useRef(false);

    const productBySku = useMemo(() => new Map((products || []).map((product) => [product.sku, product])), [products]);
    const totalPieces = useMemo(() => items.reduce((sum, item) => sum + Number(item.quantity || 0), 0), [items]);
    const needCount = productionNeeds.length + pendingOrderNeeds.length;
    const needPieces = useMemo(
        () => [...productionNeeds, ...pendingOrderNeeds].reduce((sum, need) => sum + need.totalQty, 0),
        [productionNeeds, pendingOrderNeeds],
    );
    // Until the user picks, open on needs when there are any, otherwise on the catalog.
    const activeTab: SourceTab = sourceTab ?? (needsLoading || needCount > 0 ? 'needs' : 'catalog');

    const baseline = useMemo(() => JSON.stringify({ items: initialOrder?.items ?? [], notes: initialOrder?.notes ?? '' }), [initialOrder?.id]);
    const isDirty = useMemo(() => JSON.stringify({ items, notes }) !== baseline, [items, notes, baseline]);

    const inOrderQty = useMemo(() => {
        const map = new Map<string, number>();
        items.forEach((item) => {
            const key = lineKey(item.item_type, item.item_name);
            map.set(key, (map.get(key) || 0) + Number(item.quantity || 0));
        });
        return map;
    }, [items]);

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

    useEffect(() => {
        if (activeTab === 'catalog') searchInputRef.current?.focus();
    }, [activeTab, searchType]);

    const flash = (keys: string[]) => {
        if (keys.length === 0) return;
        setFlashKeys(new Set(keys));
        window.setTimeout(() => setFlashKeys(new Set()), 1400);
    };

    const resolveRowMask = (key: string, need: SupplierOrderGroupedNeed): Set<string> => {
        const stored = rowSelectionMasks[key];
        if (stored) {
            const validIds = new Set(need.requirements.map((requirement) => requirement.id));
            return new Set(stored.filter((id) => validIds.has(id)));
        }
        return defaultRequirementSelectionIds(need, poCustomerFilter);
    };

    const setRowMask = (key: string, need: SupplierOrderGroupedNeed, next: Set<string>) => {
        const validIds = new Set(need.requirements.map((requirement) => requirement.id));
        setRowSelectionMasks((previous) => ({
            ...previous,
            [key]: [...next].filter((id) => validIds.has(id)),
        }));
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

    const addNeedGroups = (groups: { needs: SupplierOrderGroupedNeed[]; keyPrefix: 'prod' | 'pend' }[], label: string) => {
        const usable = groups.map((group) => ({ ...group, needs: group.needs.filter((need) => need.product) }));
        if (usable.every((group) => group.needs.length === 0)) {
            showToast('Δεν υπάρχουν διαθέσιμες γραμμές.', 'error');
            return;
        }
        if (customerFilterTab === 'include_only' && customerPickKeys.size === 0) {
            showToast('Επιλέξτε πελάτες στη λειτουργία "Μόνο..." ή αλλάξτε φίλτρο.', 'error');
            return;
        }
        setItems((previous) => usable.reduce(
            (acc, group) => mergeManyNeedsWithCustomerFilter(
                acc,
                group.needs,
                poCustomerFilter,
                rowSelectionMasks,
                (need) => needBreakdownKey(group.keyPrefix, need),
            ),
            previous,
        ));
        flash(usable.flatMap((group) => group.needs.map((need) => lineKey('Product', `${need.product!.sku}${need.variant}`))));
        showToast(`${label}: οι ποσότητες προστέθηκαν με βάση το φίλτρο πελατών.`, 'success');
    };

    const searchResults = useMemo<SearchResult[]>(() => {
        const lower = searchTerm.trim().toLowerCase();

        if (searchType === 'Material') {
            return (materials || [])
                .filter((material) => material.supplier_id === supplier.id)
                .filter((material) => !lower || material.name.toLowerCase().includes(lower) || material.description?.toLowerCase().includes(lower))
                .sort((a, b) => a.name.localeCompare(b.name, 'el'))
                .map((material) => ({
                    kind: 'Material' as const,
                    key: material.id,
                    name: material.name,
                    sub: material.description || MATERIAL_TYPE_LABELS[material.type] || material.type || 'Υλικό',
                    image: (material as Material & { image_url?: string | null }).image_url,
                    stock: material.stock_qty,
                    item: material,
                }));
        }

        const results: SearchResult[] = [];
        (products || [])
            .filter((product) => product.supplier_id === supplier.id)
            .sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }))
            .forEach((product) => {
                const skuMatch = !lower || product.sku.toLowerCase().includes(lower) || !!product.supplier_sku?.toLowerCase().includes(lower);
                if (!product.variants || product.variants.length === 0) {
                    if (skuMatch) {
                        results.push({
                            kind: 'Product',
                            key: product.sku,
                            name: product.sku,
                            sub: product.category,
                            image: product.image_url,
                            stock: product.stock_qty,
                            item: product,
                            variantSuffix: '',
                        });
                    }
                    return;
                }
                product.variants.forEach((variant) => {
                    const fullSku = `${product.sku}${variant.suffix}`;
                    if (skuMatch || fullSku.toLowerCase().includes(lower) || variant.description?.toLowerCase().includes(lower)) {
                        results.push({
                            kind: 'Product',
                            key: fullSku,
                            name: fullSku,
                            sub: variant.description || product.category,
                            image: product.image_url,
                            stock: variant.stock_qty,
                            item: product,
                            variantSuffix: variant.suffix,
                        });
                    }
                });
            });

        return results;
    }, [materials, products, searchTerm, searchType, supplier.id]);
    const visibleResults = searchResults.slice(0, CATALOG_LIMIT);

    const catalogCounts = useMemo(() => ({
        Product: (products || []).filter((product) => product.supplier_id === supplier.id).length,
        Material: (materials || []).filter((material) => material.supplier_id === supplier.id).length,
    }), [products, materials, supplier.id]);

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
    const hiddenItemCount = items.length - filteredItems.length;

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
            flash([lineKey('Material', name)]);
            showToast(`Προστέθηκε: ${name} × ${formatNumber(qty)}`, 'success');
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
                    cordColor: item.cordColor,
                    enamelColor: item.enamelColor,
                    totalQty: qty,
                    product,
                    requirements: addOptions?.requirements,
                },
                'Product',
            ),
        );
        flash([lineKey('Product', `${product.sku}${suffix}`)]);
        showToast(`Προστέθηκε: ${product.sku}${suffix} × ${formatNumber(qty)}`, 'success');
    };

    const addSearchResult = (result: SearchResult) => {
        const qty = catalogQty[result.key] || 1;
        if (result.kind === 'Product') addItem({ product: result.item, variantSuffix: result.variantSuffix }, 'Product', qty);
        else addItem(result.item, 'Material', qty);
        setCatalogQty((previous) => {
            const next = { ...previous };
            delete next[result.key];
            return next;
        });
    };

    const updateItem = (index: number, field: 'qty' | 'notes' | 'size', val: any) => {
        setItems((previous) => {
            const updated = [...previous];
            const item = { ...updated[index] };
            if (field === 'qty') {
                const allocated = supplierOrderItemAllocationQty(item);
                const requestedTotal = Math.max(allocated || 1, Number(val) || 1);
                item.manual_quantity = Math.max(0, requestedTotal - allocated);
                item.quantity = allocated + item.manual_quantity;
            }
            else if (field === 'notes') item.notes = val;
            else if (field === 'size') item.size_info = String(val).trim() || undefined;
            item.total_cost = 0;
            updated[index] = item;
            return updated;
        });
    };

    const removeItem = (index: number) => setItems((previous) => previous.filter((_, i) => i !== index));

    const removeSourceAllocation = (index: number, allocationId: string) => setItems((previous) => {
        const next = [...previous];
        const item = { ...next[index], source_allocations: (next[index].source_allocations || []).filter((allocation) => allocation.id !== allocationId) };
        const rebuilt = rebuildSupplierOrderItemFromAllocations(item);
        if (rebuilt.quantity <= 0) return previous.filter((_, itemIndex) => itemIndex !== index);
        next[index] = rebuilt;
        return next;
    });

    const clearItems = async () => {
        dialogBusyRef.current = true;
        try {
            const yes = await confirm({ title: 'Καθαρισμός εντολής', message: `Να αφαιρεθούν και οι ${formatNumber(items.length)} γραμμές;`, confirmText: 'Καθαρισμός', isDestructive: true });
            if (yes) setItems([]);
        } finally {
            dialogBusyRef.current = false;
        }
    };

    useRestartDraft('Παραγγελία προμηθευτή', { items, notes }, { identity: initialOrder?.id, busy: isSaving });

    const requestClose = useCallback(async () => {
        if (isSaving || dialogBusyRef.current) return;
        if (isDirty) {
            dialogBusyRef.current = true;
            try {
                const yes = await confirm({
                    title: 'Κλείσιμο χωρίς αποθήκευση;',
                    message: initialOrder ? 'Οι αλλαγές στην εντολή θα χαθούν.' : 'Η εντολή δεν έχει αποθηκευτεί και θα χαθεί.',
                    confirmText: 'Απόρριψη',
                    cancelText: 'Συνέχεια επεξεργασίας',
                    isDestructive: true,
                });
                if (!yes) return;
            } finally {
                dialogBusyRef.current = false;
            }
        }
        onClose();
    }, [confirm, initialOrder, isDirty, isSaving, onClose]);

    const handleSave = async () => {
        if (isSaving) return;
        if (cartSearchTerm.trim() && hiddenItemCount > 0) {
            setCartSearchTerm('');
            showToast(`Εμφανίστηκαν ${formatNumber(hiddenItemCount)} κρυφές γραμμές. Ελέγξτε τις και πατήστε ξανά αποθήκευση.`, 'info');
            return;
        }
        if (items.length === 0) {
            showToast('Η εντολή είναι κενή.', 'error');
            return;
        }

        setIsSaving(true);
        try {
            const conflicts = await validateSupplierOrderDraftLive({
                supplierId: supplier.id,
                items,
                currentSupplierOrderId: initialOrder?.id,
            });
            if (conflicts.length > 0) {
                setConflictingSourceIds(new Set(conflicts.map((conflict) => conflict.sourceId)));
                showToast(`${formatNumber(conflicts.length)} ανάγκ${conflicts.length === 1 ? 'η άλλαξε' : 'ες άλλαξαν'} ή δεσμεύτηκε αλλού. Ελέγξτε τις κόκκινες γραμμές.`, 'error');
                return;
            }
            setConflictingSourceIds(new Set());
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
        } catch (error: any) {
            showToast(error?.message || 'Σφάλμα κατά την αποθήκευση.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    // Escape closes (with the unsaved-changes guard); Ctrl/Cmd+Enter or Ctrl/Cmd+S saves.
    const saveRef = useRef(handleSave);
    saveRef.current = handleSave;
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (dialogBusyRef.current) return;
            if (event.key === 'Escape' && !event.defaultPrevented) {
                event.preventDefault();
                requestClose();
            } else if ((event.ctrlKey || event.metaKey) && (event.key === 'Enter' || event.key.toLowerCase() === 's')) {
                event.preventDefault();
                saveRef.current();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [requestClose]);

    const conflictLineCount = items.filter((item) => item.source_allocations?.some((allocation) => conflictingSourceIds.has(allocation.source_id))).length;

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
        const pieces = needs.reduce((sum, need) => sum + need.totalQty, 0);
        const tone = accent === 'indigo'
            ? { icon: 'bg-indigo-100 text-indigo-700', button: 'bg-indigo-600 hover:bg-indigo-700', ring: 'border-indigo-100' }
            : { icon: 'bg-blue-100 text-blue-700', button: 'bg-blue-600 hover:bg-blue-700', ring: 'border-blue-100' };

        return (
            <section className={`overflow-hidden rounded-3xl border bg-white shadow-sm ${tone.ring}`}>
                <div className="flex items-center gap-3 p-3 pl-4">
                    <button
                        type="button"
                        onClick={() => setOpen((value) => !value)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        aria-expanded={open}
                    >
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone.icon}`}>{icon}</span>
                        <span className="min-w-0">
                            <span className="block text-sm font-black text-slate-800">{title}</span>
                            <span className="mt-0.5 block truncate text-xs font-semibold text-slate-500">
                                {formatNumber(needs.length)} κωδικοί · {formatNumber(pieces)} τεμ. · {subtitle}
                            </span>
                        </span>
                        <ChevronDown size={18} className={`ml-auto shrink-0 text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden />
                    </button>
                    <button
                        type="button"
                        onClick={onAddAll}
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black text-white shadow-sm transition-colors ${tone.button}`}
                    >
                        <ListPlus size={14} /> Όλα
                    </button>
                </div>
                {open && (
                    <div className="space-y-2 border-t border-slate-100 bg-slate-50/60 p-3">
                        {needs.map((need) => {
                            const key = needBreakdownKey(keyPrefix, need);
                            return (
                                <PurchaseNeedRow
                                    key={key}
                                    need={need}
                                    accent={accent}
                                    expanded={!!needBreakdownOpen[key]}
                                    onToggleBreakdown={() => setNeedBreakdownOpen((previous) => ({ ...previous, [key]: !previous[key] }))}
                                    selectedRequirementIds={resolveRowMask(key, need)}
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
            </section>
        );
    };

    const sourceTabs: { id: SourceTab; label: string; hint: string; icon: typeof Factory; count: number }[] = [
        { id: 'needs', label: 'Έξυπνες ανάγκες', hint: 'Παραγωγή & παραγγελίες πελατών', icon: Sparkles, count: needCount },
        { id: 'catalog', label: 'Κατάλογος προμηθευτή', hint: 'Χειροκίνητη προσθήκη ειδών', icon: Search, count: catalogCounts.Product + catalogCounts.Material },
    ];

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm animate-in fade-in">
            <div role="dialog" aria-modal="true" aria-labelledby="po-builder-title" className="flex h-[92vh] w-full max-w-[92rem] flex-col overflow-hidden rounded-[2rem] border border-white/40 bg-slate-100 shadow-2xl animate-in zoom-in-95">
                {/* Header */}
                <div className="relative z-10 flex shrink-0 items-center justify-between gap-4 overflow-hidden border-b border-slate-200 bg-white px-6 py-4">
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-emerald-400 via-teal-400 to-amber-300" />
                    <div className="flex min-w-0 items-center gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#1c2812] via-[#0b1204] to-[#060b00] text-white shadow-md">
                            <ShoppingCart size={20} />
                        </div>
                        <div className="min-w-0">
                            <h2 id="po-builder-title" className="truncate text-xl font-black text-slate-900">
                                {initialOrder ? `Επεξεργασία Εντολής #${initialOrder.id.slice(0, 6).toUpperCase()}` : 'Νέα Εντολή Αγοράς'}
                            </h2>
                            <div className="mt-0.5 flex items-center gap-2">
                                <SupplierAvatar name={supplier.name} size="sm" />
                                <span className="truncate text-sm font-bold text-slate-600">{supplier.name}</span>
                                {isDirty && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700 ring-1 ring-amber-100">
                                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Μη αποθηκευμένη
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={requestClose}
                        className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                        aria-label="Κλείσιμο"
                    >
                        <X size={24} />
                    </button>
                </div>

                <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-12">
                    {/* Sources */}
                    <section className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-sm lg:col-span-7">
                        <div className="grid shrink-0 grid-cols-2 gap-2 border-b border-slate-100 p-3">
                            {sourceTabs.map(({ id, label, hint, icon: Icon, count }) => {
                                const active = activeTab === id;
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => setSourceTab(id)}
                                        className={`flex items-center gap-3 rounded-2xl p-3 text-left transition-all ${active ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                                    >
                                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-white/10 text-emerald-300' : 'bg-white text-slate-500 shadow-sm'}`}><Icon size={18} /></span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-black">{label}</span>
                                            <span className={`block truncate text-[11px] font-semibold ${active ? 'text-white/60' : 'text-slate-400'}`}>{hint}</span>
                                        </span>
                                        <span className={`rounded-lg px-2 py-1 text-xs font-black tabular-nums ${active ? 'bg-white/15' : 'bg-white text-slate-500 shadow-sm'}`}>
                                            {id === 'needs' && needsLoading ? <Loader2 size={12} className="animate-spin" /> : formatNumber(count)}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {activeTab === 'needs' ? (
                            <div className="flex-1 space-y-3 overflow-y-auto p-4 custom-scrollbar">
                                {needCount > 0 && (
                                    <div className="flex items-center gap-4 rounded-3xl bg-gradient-to-br from-indigo-50 via-white to-blue-50 p-4 ring-1 ring-indigo-100">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-black text-slate-800">
                                                {formatNumber(needCount)} ανάγκες · {formatNumber(needPieces)} τεμάχια περιμένουν αυτόν τον προμηθευτή
                                            </p>
                                            <p className="mt-0.5 text-xs font-semibold text-slate-500">
                                                Προσθέστε τα όλα με ένα κλικ ή επιλέξτε ανά κωδικό και πελάτη παρακάτω.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => addNeedGroups([
                                                { needs: productionNeeds, keyPrefix: 'prod' },
                                                { needs: pendingOrderNeeds, keyPrefix: 'pend' },
                                            ], 'Όλες οι ανάγκες')}
                                            className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-[#060b00] px-4 py-3 text-sm font-black text-white shadow-lg transition-all hover:-translate-y-px hover:bg-black"
                                        >
                                            <ListPlus size={17} /> Προσθήκη όλων
                                        </button>
                                    </div>
                                )}
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
                                {unassignedNeeds.length > 0 && (
                                    <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">
                                        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                                        {formatNumber(unassignedNeeds.length)} ανάγκ{unassignedNeeds.length === 1 ? 'η δεν έχει' : 'ες δεν έχουν'} ορισμένο προμηθευτή και εξαιρέθηκε από την εντολή.
                                    </div>
                                )}
                                {needsLoading && (
                                    <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-500">
                                        <Loader2 size={14} className="animate-spin" /> Υπολογισμός καθαρών αναγκών…
                                    </div>
                                )}
                                {renderNeedSection(
                                    'Ανάγκες Παραγωγής',
                                    'παρτίδες σε αναμονή',
                                    productionNeeds,
                                    'indigo',
                                    productionNeedsOpen,
                                    setProductionNeedsOpen,
                                    () => addNeedGroups([{ needs: productionNeeds, keyPrefix: 'prod' }], 'Ανάγκες παραγωγής'),
                                    <Factory size={18} />,
                                    'prod',
                                )}
                                {renderNeedSection(
                                    'Ανάγκες Παραγγελιών',
                                    'εκκρεμή εισαγόμενα',
                                    pendingOrderNeeds,
                                    'blue',
                                    pendingNeedsOpen,
                                    setPendingNeedsOpen,
                                    () => addNeedGroups([{ needs: pendingOrderNeeds, keyPrefix: 'pend' }], 'Ανάγκες παραγγελιών'),
                                    <ShoppingCart size={18} />,
                                    'pend',
                                )}
                                {!needsLoading && needCount === 0 && (
                                    <div className="flex flex-col items-center rounded-3xl border-2 border-dashed border-slate-200 p-10 text-center">
                                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><PackageCheck size={26} /></div>
                                        <p className="mt-3 text-sm font-black text-slate-700">Όλες οι ανάγκες έχουν καλυφθεί.</p>
                                        <p className="mt-1 max-w-sm text-xs font-semibold text-slate-400">Δεν υπάρχουν ανοιχτές ανάγκες παραγωγής ή παραγγελιών για αυτόν τον προμηθευτή.</p>
                                        <button type="button" onClick={() => setSourceTab('catalog')} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
                                            <Search size={15} /> Άνοιγμα καταλόγου
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex min-h-0 flex-1 flex-col">
                                <div className="shrink-0 space-y-3 border-b border-slate-100 p-4">
                                    <div className="flex items-center gap-2">
                                        <div className="inline-flex rounded-xl bg-slate-100 p-0.5">
                                            {([['Product', 'Προϊόντα', Gem], ['Material', 'Υλικά', Box]] as const).map(([type, label, Icon]) => (
                                                <button
                                                    key={type}
                                                    type="button"
                                                    onClick={() => setSearchType(type)}
                                                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black transition-all ${searchType === type ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/90' : 'text-slate-500 hover:text-slate-700'}`}
                                                >
                                                    <Icon size={13} /> {label} <span className="tabular-nums opacity-50">{formatNumber(catalogCounts[type])}</span>
                                                </button>
                                            ))}
                                        </div>
                                        <span className="ml-auto text-[11px] font-bold text-slate-400">Enter: προσθήκη του πρώτου</span>
                                    </div>
                                    <div className="relative">
                                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                        <input
                                            ref={searchInputRef}
                                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-10 text-sm font-bold text-slate-800 outline-none transition-all focus:border-emerald-300 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
                                            placeholder={searchType === 'Product' ? 'Κωδικός, παραλλαγή ή κωδικός προμηθευτή…' : 'Όνομα υλικού…'}
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && visibleResults[0]) {
                                                    event.preventDefault();
                                                    addSearchResult(visibleResults[0]);
                                                    setSearchTerm('');
                                                }
                                            }}
                                        />
                                        {searchTerm && (
                                            <button type="button" onClick={() => { setSearchTerm(''); searchInputRef.current?.focus(); }} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700" aria-label="Καθαρισμός">
                                                <X size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                                    {catalogCounts[searchType] === 0 ? (
                                        <div className="flex flex-col items-center rounded-3xl border-2 border-dashed border-slate-200 p-10 text-center">
                                            {searchType === 'Product' ? <Gem size={28} className="text-slate-300" /> : <Box size={28} className="text-slate-300" />}
                                            <p className="mt-3 text-sm font-black text-slate-600">
                                                {searchType === 'Product' ? 'Κανένα προϊόν δεν συνδέεται με αυτόν τον προμηθευτή.' : 'Κανένα υλικό δεν συνδέεται με αυτόν τον προμηθευτή.'}
                                            </p>
                                            <p className="mt-1 text-xs font-semibold text-slate-400">
                                                {searchType === 'Product' ? 'Συνδέστε προϊόντα από την καρτέλα «Προϊόντα» του προμηθευτή.' : 'Ορίστε τον προμηθευτή από τη σελίδα Υλικών.'}
                                            </p>
                                        </div>
                                    ) : visibleResults.length === 0 ? (
                                        <div className="rounded-3xl border-2 border-dashed border-slate-200 py-10 text-center text-sm font-bold text-slate-400">
                                            Δεν βρέθηκαν αποτελέσματα για «{searchTerm}».
                                        </div>
                                    ) : (
                                        <>
                                            <div className="grid gap-2 xl:grid-cols-2">
                                                {visibleResults.map((result) => {
                                                    const already = inOrderQty.get(lineKey(result.kind, result.name)) || 0;
                                                    const qty = catalogQty[result.key] || 1;
                                                    return (
                                                        <div key={result.key} className={`flex items-center gap-3 rounded-2xl border bg-white p-2.5 shadow-sm transition-all ${already ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-100 hover:border-slate-200'}`}>
                                                            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-slate-400">
                                                                {result.image ? <img src={result.image} className="h-full w-full object-cover" alt="" /> : result.kind === 'Material' ? <Box size={18} /> : <Gem size={18} />}
                                                            </span>
                                                            <span className="min-w-0 flex-1">
                                                                <span className="block truncate font-mono text-sm font-black text-slate-800">{result.name}</span>
                                                                <span className="block truncate text-[11px] font-semibold text-slate-400">{result.sub}</span>
                                                                <span className="mt-0.5 flex flex-wrap gap-1">
                                                                    {result.stock !== undefined && result.stock !== null && (
                                                                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-black ${result.stock > 0 ? 'bg-slate-100 text-slate-500' : 'bg-red-50 text-red-600'}`}>Απόθ. {formatNumber(result.stock)}</span>
                                                                    )}
                                                                    {already > 0 && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black text-emerald-700">Στην εντολή: {formatNumber(already)}</span>}
                                                                </span>
                                                            </span>
                                                            <QtyStepper size="sm" value={qty} min={1} onChange={(next) => setCatalogQty((previous) => ({ ...previous, [result.key]: next }))} />
                                                            <button
                                                                type="button"
                                                                onClick={() => addSearchResult(result)}
                                                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm transition-colors hover:bg-emerald-700"
                                                                aria-label={`Προσθήκη ${result.name}`}
                                                            >
                                                                <Plus size={17} strokeWidth={3} />
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            {searchResults.length > CATALOG_LIMIT && (
                                                <p className="mt-3 text-center text-xs font-bold text-slate-400">
                                                    +{formatNumber(searchResults.length - CATALOG_LIMIT)} ακόμη — περιορίστε την αναζήτηση.
                                                </p>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </section>

                    {/* Order contents */}
                    <section className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-sm lg:col-span-5">
                        <div className="shrink-0 border-b border-slate-100 px-5 py-4">
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <PackageCheck size={17} className="text-emerald-600" />
                                        <h3 className={panelTitle}>Περιεχόμενα εντολής</h3>
                                    </div>
                                    <p className="mt-1 text-xs font-bold text-slate-500">
                                        {formatNumber(items.length)} γραμμές · {formatNumber(totalPieces)} τεμάχια
                                        {hiddenItemCount > 0 ? ` · ${formatNumber(hiddenItemCount)} κρυφές` : ''}
                                    </p>
                                </div>
                                {items.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={clearItems}
                                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-black text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                    >
                                        <Trash2 size={13} /> Καθαρισμός
                                    </button>
                                )}
                            </div>
                            {items.length > 3 && (
                                <div className="relative mt-3">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        value={cartSearchTerm}
                                        onChange={(e) => setCartSearchTerm(e.target.value)}
                                        placeholder="Αναζήτηση μέσα στην εντολή..."
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs font-bold text-slate-700 outline-none transition-all focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-500/10"
                                    />
                                </div>
                            )}
                            {conflictLineCount > 0 && (
                                <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs font-bold text-red-700">
                                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                                    {formatNumber(conflictLineCount)} γραμμ{conflictLineCount === 1 ? 'ή χρειάζεται' : 'ές χρειάζονται'} έλεγχο: κάποιες ανάγκες άλλαξαν ή δεσμεύτηκαν αλλού. Αφαιρέστε τις κόκκινες δεσμεύσεις και αποθηκεύστε ξανά.
                                </div>
                            )}
                        </div>

                        <div className="flex-1 space-y-2.5 overflow-y-auto bg-slate-50/60 p-3 custom-scrollbar">
                            {filteredItems.map(({ item, index }) => {
                                const product = item.item_type === 'Product' ? productBySku.get(item.item_id) : undefined;
                                const display = getPurchaseOrderLinePresentation(item, product);
                                const showSizeInput = shouldShowPurchaseOrderSizeInput(product, item);
                                const allocatedQty = supplierOrderItemAllocationQty(item);
                                const manualQty = supplierOrderItemManualQty(item);
                                const hasConflict = !!item.source_allocations?.some((allocation) => conflictingSourceIds.has(allocation.source_id));
                                const flashing = flashKeys.has(lineKey(item.item_type, item.item_name));

                                return (
                                    <div
                                        key={`${item.id}-${index}`}
                                        className={`rounded-2xl border bg-white p-3 shadow-sm transition-all duration-500 ${hasConflict ? 'border-red-400 ring-2 ring-red-100' : flashing ? 'border-emerald-300 ring-4 ring-emerald-400/20' : 'border-slate-100 hover:border-slate-200'}`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                                                {display.imageUrl ? <img src={display.imageUrl} className="h-full w-full object-cover" alt="" /> : item.item_type === 'Material' ? <Box size={18} className="text-slate-300" /> : <ImageIcon size={18} className="text-slate-300" />}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <span className={`rounded-lg border px-2 py-0.5 font-mono text-sm font-black ${display.finishStyle}`}>
                                                        {item.item_name}
                                                    </span>
                                                    {item.size_info && (
                                                        <span className="inline-flex items-center gap-0.5 rounded-md border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[10px] font-black text-blue-700">
                                                            <Hash size={10} /> {item.size_info}
                                                        </span>
                                                    )}
                                                    {display.supplierRef && (
                                                        <span className="rounded-md border border-purple-100 bg-purple-50 px-1.5 py-0.5 text-[10px] font-black text-purple-700">
                                                            Ref: {display.supplierRef}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] font-bold text-slate-500">
                                                    <span>{display.description}</span>
                                                    {display.stoneCode && <span className={`font-black ${display.stoneColor}`}><StoneCodeText code={display.stoneCode} /></span>}
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 flex-col items-end gap-1">
                                                <QtyStepper
                                                    value={allocatedQty > 0 ? manualQty : item.quantity}
                                                    min={allocatedQty > 0 ? 0 : 1}
                                                    onChange={(next) => updateItem(index, 'qty', allocatedQty + next)}
                                                />
                                                {allocatedQty > 0 && (
                                                    <span className="text-[10px] font-bold text-slate-400">
                                                        έξτρα · σύνολο <b className="text-slate-700">{formatNumber(item.quantity)}</b>
                                                    </span>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeItem(index)}
                                                className="-mr-1 shrink-0 rounded-lg p-1.5 text-slate-300 transition-all hover:bg-red-50 hover:text-red-500"
                                                aria-label="Αφαίρεση είδους"
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>

                                        {!!item.source_allocations?.length && (
                                            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pl-[3.75rem]">
                                                <span className="text-[9px] font-black uppercase tracking-wide text-slate-400">Δεσμεύσεις</span>
                                                {item.source_allocations.map((allocation) => (
                                                    <button
                                                        key={allocation.id}
                                                        type="button"
                                                        onClick={() => removeSourceAllocation(index, allocation.id)}
                                                        title="Αφαίρεση αυτής της ανάγκης από την εντολή"
                                                        className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-black transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 ${conflictingSourceIds.has(allocation.source_id) ? 'border-red-300 bg-red-50 text-red-700' : 'border-indigo-100 bg-indigo-50 text-indigo-700'}`}
                                                    >
                                                        {allocation.customer} · {formatNumber(allocation.quantity)} <X size={10} />
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {!item.source_allocations?.length && item.customer_reference && (
                                            <div className="mt-2 pl-[3.75rem] text-[11px] font-bold text-slate-600">
                                                <span className="mr-1 text-[9px] font-black uppercase text-slate-400">Πελάτης:</span>
                                                {item.customer_reference}
                                            </div>
                                        )}

                                        <div className="mt-2.5 flex gap-2 pl-[3.75rem]">
                                            {showSizeInput && (
                                                <input
                                                    value={item.size_info || ''}
                                                    onChange={(e) => updateItem(index, 'size', e.target.value)}
                                                    disabled={allocatedQty > 0}
                                                    placeholder="Μέγεθος"
                                                    aria-label={`Μέγεθος για ${item.item_name}`}
                                                    className="w-24 rounded-lg border border-blue-100 bg-blue-50/60 px-2.5 py-1.5 font-mono text-xs font-black text-blue-900 outline-none placeholder:font-sans placeholder:text-blue-300 focus:ring-2 focus:ring-blue-500/15 disabled:opacity-60"
                                                />
                                            )}
                                            <input
                                                value={item.notes || ''}
                                                onChange={(e) => updateItem(index, 'notes', e.target.value)}
                                                placeholder="Σημείωση γραμμής…"
                                                aria-label={`Σημείωση για ${item.item_name}`}
                                                className="min-w-0 flex-1 rounded-lg border border-transparent bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600 outline-none transition-all placeholder:italic placeholder:text-slate-400 hover:border-slate-200 focus:border-emerald-200 focus:bg-white focus:ring-2 focus:ring-emerald-500/10"
                                            />
                                        </div>
                                    </div>
                                );
                            })}

                            {items.length === 0 && (
                                <div className="flex h-full min-h-[20rem] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-white p-6 text-center">
                                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50 text-slate-300"><ShoppingCart size={30} /></div>
                                    <p className="mt-4 text-base font-black text-slate-500">Η εντολή είναι κενή.</p>
                                    <p className="mt-1 max-w-xs text-xs font-semibold text-slate-400">
                                        {needCount > 0 ? 'Ξεκινήστε με «Προσθήκη όλων» από τις έξυπνες ανάγκες ή επιλέξτε είδη από τον κατάλογο.' : 'Επιλέξτε είδη από τον κατάλογο του προμηθευτή.'}
                                    </p>
                                </div>
                            )}
                            {items.length > 0 && filteredItems.length === 0 && (
                                <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white py-12 text-center text-sm font-bold text-slate-400">
                                    Δεν ταιριάζει καμία γραμμή με την αναζήτηση.
                                </div>
                            )}
                        </div>

                        <div className="shrink-0 border-t border-slate-200 bg-white">
                            <div className="px-5 pt-3">
                                <button type="button" onClick={() => setNotesOpen((open) => !open)} className={`${fieldLabel} flex items-center gap-1.5 hover:text-slate-600`}>
                                    <StickyNote size={12} /> Σημειώσεις εντολής
                                    {notes.trim() && !notesOpen && <span className="max-w-[16rem] truncate normal-case tracking-normal text-slate-500">— {notes}</span>}
                                    <ChevronDown size={12} className={`transition-transform ${notesOpen ? 'rotate-180' : ''}`} />
                                </button>
                                {notesOpen && (
                                    <textarea
                                        autoFocus={!notes}
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        rows={2}
                                        placeholder="Γενικές σημειώσεις για τον προμηθευτή (εμφανίζονται στην εκτύπωση)…"
                                        className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm font-medium text-slate-700 outline-none transition-all focus:border-emerald-300 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
                                    />
                                )}
                            </div>
                            <div className="flex items-center justify-between gap-4 px-5 py-4">
                                <div>
                                    <div className="text-2xl font-black leading-none tabular-nums text-slate-900">{formatNumber(totalPieces)} <span className="text-sm font-bold text-slate-400">τεμ.</span></div>
                                    <div className="mt-1 text-[11px] font-bold text-slate-400">{formatNumber(items.length)} γραμμές · Ctrl+Enter για αποθήκευση</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={isSaving || items.length === 0}
                                    className="inline-flex items-center gap-2.5 rounded-2xl bg-gradient-to-br from-[#1c2812] via-[#0b1204] to-[#060b00] px-6 py-3.5 text-sm font-black text-white shadow-xl ring-1 ring-inset ring-white/10 transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                                >
                                    {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                                    {initialOrder ? 'Αποθήκευση αλλαγών' : 'Δημιουργία εντολής'}
                                </button>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
