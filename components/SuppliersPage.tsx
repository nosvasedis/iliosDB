import { protectOperation } from '../lib/appUpdates';
import { formatNumber } from '../utils/numberFormat';
import React, { useState, useMemo } from 'react';
import { Supplier, SupplierOrder } from '../types';
import { ArrowRight, Clock, Gem, Globe, PackageCheck, Plus, Printer, Search, Store, X } from 'lucide-react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { api, supabase } from '../lib/supabase';
import { invalidateProductsAndCatalog } from '../lib/queryInvalidation';
import { useUI } from './UIProvider';
import SupplierOrderPrintView from './SupplierOrderPrintView';
import DesktopPurchaseOrderBuilder from './DesktopPurchaseOrderBuilder';
import { usePrint } from './PrintContext';
import DesktopPageHeader, { HeaderPrimaryButton } from './DesktopPageHeader';
import SupplierReceiptModal from './suppliers/SupplierReceiptModal';
import SupplierCard from './suppliers/SupplierCard';
import SupplierFormModal from './suppliers/SupplierFormModal';
import SupplierDetailsModal, { type SupplierDetailsTab } from './suppliers/SupplierDetailsModal';
import { buildSupplierStats, formatRelativeDay, getSupplierStats, orderPieces, orderShortId } from './suppliers/supplierUi';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { tailTabButtonCompact, TAIL_TAB_CONTAINER } from './ui/designTokens';
import PageErrorState from './ui/PageErrorState';
import EmptyState from './ui/EmptyState';

type ListFilter = 'all' | 'pending' | 'unlinked';
type ListSort = 'name' | 'activity' | 'products';

function PrintPreview({ order, onClose, onPrint }: { order: SupplierOrder; onClose: () => void; onPrint: () => void }) {
    const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
    useEscapeToClose(onClose);
    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md animate-in fade-in" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
            <div className="flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl animate-in zoom-in-95">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                    <div>
                        <h3 className="flex items-center gap-2 font-black text-slate-900"><Printer size={18} /> Προεπισκόπηση εκτύπωσης</h3>
                        <p className="text-xs font-semibold text-slate-500">{order.supplier_name} · #{orderShortId(order.id)}</p>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Κλείσιμο"><X size={20} /></button>
                </div>
                <div className="flex flex-1 justify-center overflow-auto bg-slate-200/70 p-8 custom-scrollbar">
                    <div className="origin-top scale-[0.8] bg-white shadow-lg">
                        <SupplierOrderPrintView order={order} products={products || []} />
                    </div>
                </div>
                <div className="flex justify-end gap-2 border-t border-slate-100 bg-white px-5 py-4">
                    <button type="button" onClick={onClose} className="rounded-xl px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100">Κλείσιμο</button>
                    <button type="button" onClick={onPrint} className="inline-flex items-center gap-2 rounded-xl bg-[#060b00] px-6 py-2.5 text-sm font-bold text-white shadow-lg hover:bg-black">
                        <Printer size={16} /> Εκτύπωση
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function SuppliersPage() {
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    const { setSupplierOrderToPrint } = usePrint();

    const { data: suppliers, isError: suppliersError, error: suppliersErr, refetch: refetchSuppliers } = useQuery({ queryKey: ['suppliers'], queryFn: api.getSuppliers });
    const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
    const { data: materials } = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
    const { data: supplierOrders } = useQuery({ queryKey: ['supplier_orders'], queryFn: api.getSupplierOrders });

    const [searchTerm, setSearchTerm] = useState('');
    const [listFilter, setListFilter] = useState<ListFilter>('all');
    const [listSort, setListSort] = useState<ListSort>('name');

    // Details are tracked by id so edits and refetches always show fresh data.
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detailsTab, setDetailsTab] = useState<SupplierDetailsTab>('overview');
    const [focusOrderId, setFocusOrderId] = useState<string | null>(null);
    const [formInitial, setFormInitial] = useState<Partial<Supplier> | null>(null);

    const [builder, setBuilder] = useState<{ supplier: Supplier; order: SupplierOrder | null } | null>(null);
    const [orderToPrint, setOrderToPrint] = useState<SupplierOrder | null>(null);
    const [receiptOrder, setReceiptOrder] = useState<SupplierOrder | null>(null);

    const supplierList = suppliers || [];
    const orders = supplierOrders || [];
    const suppliersById = useMemo(() => new Map(supplierList.map((supplier) => [supplier.id, supplier])), [supplierList]);
    const stats = useMemo(() => buildSupplierStats(supplierList, products, materials, orders), [supplierList, products, materials, orders]);
    const selectedSupplier = selectedId ? suppliersById.get(selectedId) ?? null : null;

    const pendingOrders = useMemo(
        () => orders.filter((order) => order.status === 'Pending').sort((a, b) => a.created_at.localeCompare(b.created_at)),
        [orders],
    );
    const totals = useMemo(() => ({
        pendingPieces: pendingOrders.reduce((sum, order) => sum + orderPieces(order), 0),
        linkedProducts: (products || []).filter((product) => product.supplier_id && suppliersById.has(product.supplier_id)).length,
    }), [pendingOrders, products, suppliersById]);

    const filteredSuppliers = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        const list = supplierList.filter((supplier) => {
            const s = getSupplierStats(stats, supplier.id);
            if (listFilter === 'pending' && s.pendingOrderCount === 0) return false;
            if (listFilter === 'unlinked' && (s.productCount > 0 || s.materialCount > 0)) return false;
            if (!q) return true;
            return [supplier.name, supplier.contact_person, supplier.phone, supplier.email, supplier.address]
                .some((value) => value?.toLowerCase().includes(q));
        });
        return list.sort((a, b) => {
            if (listSort === 'activity') {
                const diff = (getSupplierStats(stats, b.id).lastOrderAt || '').localeCompare(getSupplierStats(stats, a.id).lastOrderAt || '');
                if (diff) return diff;
            } else if (listSort === 'products') {
                const diff = getSupplierStats(stats, b.id).productCount - getSupplierStats(stats, a.id).productCount;
                if (diff) return diff;
            }
            return a.name.localeCompare(b.name, 'el');
        });
    }, [supplierList, stats, searchTerm, listFilter, listSort]);

    const openSupplier = (supplier: Supplier, tab: SupplierDetailsTab = 'overview', orderId: string | null = null) => {
        setSelectedId(supplier.id);
        setDetailsTab(tab);
        setFocusOrderId(orderId);
    };

    const handleSaveSupplier = async (form: Partial<Supplier>) => {
        try {
            await api.saveSupplier(form);
            await queryClient.invalidateQueries({ queryKey: ['suppliers'] });
            setFormInitial(null);
            showToast(form.id ? 'Οι αλλαγές αποθηκεύτηκαν.' : `Ο προμηθευτής «${form.name}» δημιουργήθηκε.`, 'success');
        } catch {
            showToast('Σφάλμα αποθήκευσης.', 'error');
        }
    };

    const handleDeleteSupplier = async (supplier: Supplier) => {
        const s = getSupplierStats(stats, supplier.id);
        const links = [
            s.productCount ? `${formatNumber(s.productCount)} προϊόντα` : '',
            s.materialCount ? `${formatNumber(s.materialCount)} υλικά` : '',
            s.orderCount ? `${formatNumber(s.orderCount)} εντολές` : '',
        ].filter(Boolean).join(', ');
        const yes = await confirm({
            title: 'Διαγραφή προμηθευτή',
            message: links
                ? `Ο «${supplier.name}» συνδέεται με ${links}. Θέλετε σίγουρα να τον διαγράψετε;`
                : `Θέλετε σίγουρα να διαγράψετε τον «${supplier.name}»;`,
            isDestructive: true,
            confirmText: 'Διαγραφή',
        });
        if (!yes) return;
        try {
            await api.deleteSupplier(supplier.id);
            queryClient.invalidateQueries({ queryKey: ['suppliers'] });
            if (selectedId === supplier.id) setSelectedId(null);
            showToast('Ο προμηθευτής διαγράφηκε.', 'info');
        } catch {
            showToast('Σφάλμα διαγραφής.', 'error');
        }
    };

    const handleLinkProduct = async (sku: string) => {
        if (!selectedSupplier) return;
        try {
            await protectOperation(async () => await supabase.from('products').update({ supplier_id: selectedSupplier.id }).eq('sku', sku));
            await invalidateProductsAndCatalog(queryClient);
            showToast(`Το ${sku} συνδέθηκε.`, 'success');
        } catch {
            showToast('Σφάλμα σύνδεσης.', 'error');
        }
    };

    const handleUnlinkProduct = async (sku: string) => {
        const yes = await confirm({ title: 'Αποσύνδεση προϊόντος', message: `Να αφαιρεθεί ο προμηθευτής από το ${sku};`, confirmText: 'Αποσύνδεση', isDestructive: true });
        if (!yes) return;
        try {
            await protectOperation(async () => await supabase.from('products').update({ supplier_id: null }).eq('sku', sku));
            await invalidateProductsAndCatalog(queryClient);
            showToast(`Το ${sku} αποσυνδέθηκε.`, 'success');
        } catch {
            showToast('Σφάλμα.', 'error');
        }
    };

    const confirmSupplierReceipt = async (warehouseId: string) => {
        if (!receiptOrder) return;
        await api.receiveSupplierOrder(receiptOrder, warehouseId);
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['supplier_orders'] }),
            invalidateProductsAndCatalog(queryClient),
            queryClient.invalidateQueries({ queryKey: ['materials'] }),
            queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        ]);
        setReceiptOrder(null);
        showToast('Η παραλαβή αποθέματος ολοκληρώθηκε επιτυχώς.', 'success');
    };

    const handleDeleteOrder = async (order: SupplierOrder) => {
        const yes = await confirm({
            title: 'Διαγραφή εντολής',
            message: `Θέλετε σίγουρα να διαγράψετε την εντολή #${orderShortId(order.id)} (${formatNumber(orderPieces(order))} τεμ.);`,
            isDestructive: true,
            confirmText: 'Διαγραφή',
        });
        if (!yes) return;
        try {
            await api.deleteSupplierOrder(order.id);
            queryClient.invalidateQueries({ queryKey: ['supplier_orders'] });
            showToast('Η εντολή διαγράφηκε.', 'success');
        } catch {
            showToast('Σφάλμα διαγραφής.', 'error');
        }
    };

    if (suppliersError) {
        return (
            <PageErrorState
                message="Δεν ήταν δυνατή η φόρτωση των προμηθευτών."
                detail={(suppliersErr as Error)?.message}
                onRetry={() => refetchSuppliers()}
            />
        );
    }

    const childOpen = !!formInitial || !!builder || !!orderToPrint || !!receiptOrder;
    const filterChips: [ListFilter, string, number?][] = [
        ['all', 'Όλοι', supplierList.length],
        ['pending', 'Με εκκρεμείς', supplierList.filter((supplier) => getSupplierStats(stats, supplier.id).pendingOrderCount > 0).length],
        ['unlinked', 'Χωρίς συνδέσεις'],
    ];

    return (
        <div className="flex h-[calc(100vh-100px)] flex-col gap-6">
            <DesktopPageHeader
                icon={Globe}
                title="Προμηθευτές"
                subtitle="Συνεργάτες, συνδεδεμένα είδη και εντολές αγοράς."
                tail={(
                    <>
                        <div className="relative min-w-[12rem] flex-1 md:max-w-xs md:flex-none">
                            <input
                                type="text"
                                placeholder="Όνομα, υπεύθυνος, τηλέφωνο…"
                                value={searchTerm}
                                onChange={(event) => setSearchTerm(event.target.value)}
                                className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-9 text-sm font-bold outline-none transition-all focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
                            />
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            {searchTerm && (
                                <button type="button" onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Καθαρισμός αναζήτησης">
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                        <HeaderPrimaryButton icon={Plus} onClick={() => setFormInitial({})}>
                            Νέος Προμηθευτής
                        </HeaderPrimaryButton>
                    </>
                )}
                below={(
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:flex">
                            {[
                                { icon: Store, label: 'Προμηθευτές', value: supplierList.length, tone: 'text-slate-700 bg-slate-50 border-slate-100' },
                                { icon: Clock, label: 'Εκκρεμείς εντολές', value: pendingOrders.length, tone: 'text-amber-800 bg-amber-50 border-amber-100' },
                                { icon: PackageCheck, label: 'Τεμ. σε αναμονή', value: totals.pendingPieces, tone: 'text-emerald-800 bg-emerald-50 border-emerald-100' },
                                { icon: Gem, label: 'Συνδεδεμένα προϊόντα', value: totals.linkedProducts, tone: 'text-violet-800 bg-violet-50 border-violet-100' },
                            ].map(({ icon: Icon, label, value, tone }) => (
                                <div key={label} className={`flex items-center gap-3 rounded-2xl border px-4 py-2.5 ${tone}`}>
                                    <Icon size={18} className="shrink-0 opacity-70" />
                                    <div>
                                        <div className="text-lg font-black leading-none tabular-nums">{formatNumber(value)}</div>
                                        <div className="mt-0.5 whitespace-nowrap text-[10px] font-black uppercase tracking-wide opacity-70">{label}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <div className={TAIL_TAB_CONTAINER}>
                                {filterChips.map(([key, label, count]) => (
                                    <button key={key} type="button" onClick={() => setListFilter(key)} className={tailTabButtonCompact(listFilter === key)}>
                                        {label}{count !== undefined && <span className="tabular-nums opacity-50">{formatNumber(count)}</span>}
                                    </button>
                                ))}
                            </div>
                            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-500 shadow-sm">
                                Ταξινόμηση
                                <select value={listSort} onChange={(event) => setListSort(event.target.value as ListSort)} className="bg-transparent font-black text-slate-800 outline-none">
                                    <option value="name">Αλφαβητικά</option>
                                    <option value="activity">Πρόσφατη δραστηριότητα</option>
                                    <option value="products">Περισσότερα προϊόντα</option>
                                </select>
                            </label>
                        </div>
                    </div>
                )}
            />

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pb-20 pr-2 custom-scrollbar">
                {pendingOrders.length > 0 && listFilter !== 'unlinked' && !searchTerm && (
                    <section className="rounded-3xl border border-amber-100 bg-gradient-to-br from-amber-50/80 to-white p-4 shadow-sm">
                        <div className="mb-3 flex items-center gap-2 px-1">
                            <PackageCheck size={17} className="text-amber-600" />
                            <h2 className="text-sm font-black text-slate-800">Αναμένονται παραλαβές</h2>
                            <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-black text-amber-800">{formatNumber(pendingOrders.length)}</span>
                        </div>
                        <div className="flex gap-3 overflow-x-auto pb-1 custom-scrollbar">
                            {pendingOrders.map((order) => {
                                const supplier = suppliersById.get(order.supplier_id);
                                return (
                                    <div key={order.id} className="flex w-72 shrink-0 flex-col rounded-2xl border border-amber-100 bg-white p-3 shadow-sm">
                                        <button type="button" onClick={() => supplier && openSupplier(supplier, 'orders', order.id)} className="min-w-0 text-left">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="truncate text-sm font-black text-slate-800">{supplier?.name || order.supplier_name}</span>
                                                <span className="font-mono text-[11px] font-black text-slate-400">#{orderShortId(order.id)}</span>
                                            </div>
                                            <div className="mt-1 text-xs font-semibold text-slate-500">
                                                {formatRelativeDay(order.created_at)} · {formatNumber(order.items.length)} γραμμές · <b className="text-slate-700">{formatNumber(orderPieces(order))}</b> τεμ.
                                            </div>
                                        </button>
                                        <div className="mt-3 flex items-center gap-2">
                                            <button type="button" onClick={() => setReceiptOrder(order)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2 text-xs font-black text-white transition-colors hover:bg-emerald-700">
                                                <PackageCheck size={14} /> Παραλαβή
                                            </button>
                                            <button type="button" onClick={() => supplier && openSupplier(supplier, 'orders', order.id)} className="rounded-xl border border-slate-200 p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800" title="Άνοιγμα εντολής">
                                                <ArrowRight size={14} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}

                {filteredSuppliers.length > 0 ? (
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                        {filteredSuppliers.map((supplier) => (
                            <SupplierCard
                                key={supplier.id}
                                supplier={supplier}
                                stats={getSupplierStats(stats, supplier.id)}
                                onOpen={() => openSupplier(supplier)}
                                onNewOrder={() => setBuilder({ supplier, order: null })}
                            />
                        ))}
                    </div>
                ) : (
                    <EmptyState
                        icon={Globe}
                        title={supplierList.length === 0 ? 'Δεν υπάρχουν προμηθευτές ακόμη.' : 'Δεν βρέθηκαν προμηθευτές.'}
                        hint={supplierList.length === 0 ? 'Πατήστε «Νέος Προμηθευτής» για να προσθέσετε τον πρώτο.' : 'Δοκιμάστε διαφορετική αναζήτηση ή φίλτρο.'}
                        action={supplierList.length > 0 && (searchTerm || listFilter !== 'all') ? (
                            <button type="button" onClick={() => { setSearchTerm(''); setListFilter('all'); }} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">Καθαρισμός φίλτρων</button>
                        ) : undefined}
                    />
                )}
            </div>

            {selectedSupplier && (
                <SupplierDetailsModal
                    supplier={selectedSupplier}
                    stats={getSupplierStats(stats, selectedSupplier.id)}
                    products={products || []}
                    materials={materials || []}
                    orders={orders.filter((order) => order.supplier_id === selectedSupplier.id)}
                    suppliersById={suppliersById}
                    initialTab={detailsTab}
                    focusOrderId={focusOrderId}
                    escapeDisabled={childOpen}
                    onClose={() => setSelectedId(null)}
                    onEdit={() => setFormInitial(selectedSupplier)}
                    onDelete={() => handleDeleteSupplier(selectedSupplier)}
                    onNewOrder={() => setBuilder({ supplier: selectedSupplier, order: null })}
                    onEditOrder={(order) => setBuilder({ supplier: selectedSupplier, order })}
                    onReceiveOrder={setReceiptOrder}
                    onPrintOrder={setOrderToPrint}
                    onDeleteOrder={handleDeleteOrder}
                    onLinkProduct={handleLinkProduct}
                    onUnlinkProduct={handleUnlinkProduct}
                />
            )}

            {formInitial && (
                <SupplierFormModal
                    initial={formInitial}
                    existingSuppliers={supplierList}
                    onClose={() => setFormInitial(null)}
                    onSave={handleSaveSupplier}
                />
            )}

            {orderToPrint && (
                <PrintPreview
                    order={orderToPrint}
                    onClose={() => setOrderToPrint(null)}
                    onPrint={() => { setSupplierOrderToPrint(orderToPrint); setOrderToPrint(null); }}
                />
            )}

            {builder && (
                <DesktopPurchaseOrderBuilder
                    supplier={builder.supplier}
                    initialOrder={builder.order}
                    onClose={() => setBuilder(null)}
                />
            )}
            {receiptOrder && (
                <SupplierReceiptModal
                    order={receiptOrder}
                    onClose={() => setReceiptOrder(null)}
                    onConfirm={confirmSupplierReceipt}
                />
            )}
        </div>
    );
}
