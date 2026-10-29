import React, { useEffect, useMemo, useState } from 'react';
import {
    ArrowRight,
    Box,
    ChevronDown,
    Clock,
    Copy,
    Gem,
    ImageIcon,
    LayoutDashboard,
    Link2,
    Mail,
    MapPin,
    PackageCheck,
    Pencil,
    Phone,
    Plus,
    Printer,
    Search,
    ShoppingCart,
    StickyNote,
    Trash2,
    Unlink,
    UserRound,
    X,
} from 'lucide-react';
import type { Material, Product, Supplier, SupplierOrder } from '../../types';
import { formatNumber } from '../../utils/numberFormat';
import { formatCurrency } from '../../utils/pricingEngine';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { getSupplierOrderStatusClasses, getSupplierOrderStatusIcon, getSupplierOrderStatusLabel } from '../../features/suppliers/statusPresentation';
import EmptyState from '../ui/EmptyState';
import { useUI } from '../UIProvider';
import { SupplierAvatar } from './SupplierCard';
import { MATERIAL_TYPE_LABELS, formatRelativeDay, orderPieces, orderShortId, type SupplierStats } from './supplierUi';

export type SupplierDetailsTab = 'overview' | 'products' | 'materials' | 'orders';
type OrderFilter = 'all' | SupplierOrder['status'];

interface Props {
    supplier: Supplier;
    stats: SupplierStats;
    products: Product[];
    materials: Material[];
    orders: SupplierOrder[];
    suppliersById: Map<string, Supplier>;
    initialTab?: SupplierDetailsTab;
    focusOrderId?: string | null;
    /** True while a child dialog (form, builder, receipt, print) sits on top. */
    escapeDisabled?: boolean;
    onClose: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onNewOrder: () => void;
    onEditOrder: (order: SupplierOrder) => void;
    onReceiveOrder: (order: SupplierOrder) => void;
    onPrintOrder: (order: SupplierOrder) => void;
    onDeleteOrder: (order: SupplierOrder) => void;
    onLinkProduct: (sku: string) => Promise<void>;
    onUnlinkProduct: (sku: string) => Promise<void>;
}

const STATUS_ACCENT: Record<SupplierOrder['status'], string> = {
    Pending: 'bg-amber-100 text-amber-700',
    Received: 'bg-emerald-100 text-emerald-700',
    Cancelled: 'bg-red-100 text-red-600',
};

function Kpi({ icon: Icon, label, value, tone, onClick }: { icon: typeof Gem; label: string; value: string; tone: string; onClick?: () => void }) {
    const Tag = onClick ? 'button' : 'div';
    return (
        <Tag
            type={onClick ? 'button' : undefined}
            onClick={onClick}
            className={`flex flex-col items-start rounded-2xl border p-4 text-left transition-all ${tone} ${onClick ? 'hover:-translate-y-0.5 hover:shadow-md' : ''}`}
        >
            <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide opacity-75"><Icon size={13} /> {label}</span>
            <span className="mt-1 text-2xl font-black tabular-nums">{value}</span>
        </Tag>
    );
}

function ProductThumb({ url, size = 'h-11 w-11' }: { url?: string | null; size?: string }) {
    return (
        <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 ${size}`}>
            {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <ImageIcon size={16} className="text-slate-300" />}
        </div>
    );
}

function OrderCard({
    order,
    expanded,
    onToggle,
    onEdit,
    onReceive,
    onPrint,
    onDelete,
}: {
    order: SupplierOrder;
    expanded: boolean;
    onToggle: () => void;
    onEdit: () => void;
    onReceive: () => void;
    onPrint: () => void;
    onDelete: () => void;
}) {
    const pending = order.status === 'Pending';
    const pieces = orderPieces(order);

    return (
        <div id={`supplier-order-${order.id}`} className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition-all ${expanded ? 'border-slate-300 shadow-md' : 'border-slate-100 hover:border-slate-200'}`}>
            <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-4 text-left" aria-expanded={expanded}>
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${STATUS_ACCENT[order.status]}`}>
                        {getSupplierOrderStatusIcon(order.status, 20)}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-base font-black text-slate-900">#{orderShortId(order.id)}</span>
                            <span className={`rounded-md px-2 py-0.5 text-[10px] font-black ${getSupplierOrderStatusClasses(order.status)}`}>{getSupplierOrderStatusLabel(order.status)}</span>
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs font-semibold text-slate-500">
                            <span>{new Date(order.created_at).toLocaleDateString('el-GR')} · {formatRelativeDay(order.created_at)}</span>
                            <span><b className="text-slate-700">{formatNumber(order.items.length)}</b> γραμμές</span>
                            <span><b className="text-slate-700">{formatNumber(pieces)}</b> τεμ.</span>
                            {order.received_at && <span className="text-emerald-700">Παραλαβή {new Date(order.received_at).toLocaleDateString('el-GR')}</span>}
                        </span>
                        {order.notes && !expanded && <span className="mt-1 block truncate text-xs italic text-slate-400">{order.notes}</span>}
                    </span>
                    <ChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>
                <div className="flex shrink-0 items-center gap-1.5 md:pl-2">
                    <button type="button" onClick={onPrint} title="Εκτύπωση" className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800"><Printer size={17} /></button>
                    {pending && (
                        <button type="button" onClick={onEdit} title="Επεξεργασία" className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-700"><Pencil size={17} /></button>
                    )}
                    <button type="button" onClick={onDelete} title="Διαγραφή" className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"><Trash2 size={17} /></button>
                    {pending && (
                        <button type="button" onClick={onReceive} className="ml-1 inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-black text-white shadow-sm transition-colors hover:bg-emerald-700">
                            <PackageCheck size={15} /> Παραλαβή
                        </button>
                    )}
                </div>
            </div>

            {expanded && (
                <div className="border-t border-slate-100 bg-slate-50/60 p-4 animate-in fade-in slide-in-from-top-1">
                    {order.notes && (
                        <div className="mb-3 flex gap-2 rounded-xl border border-amber-100 bg-amber-50/70 p-3 text-xs font-semibold text-amber-900">
                            <StickyNote size={14} className="mt-0.5 shrink-0" /> <span className="whitespace-pre-wrap">{order.notes}</span>
                        </div>
                    )}
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-400">
                                <tr>
                                    <th className="px-3 py-2">Είδος</th>
                                    <th className="px-3 py-2">Πελάτης</th>
                                    <th className="px-3 py-2">Σημείωση</th>
                                    <th className="px-3 py-2 text-right">Ποσ.</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {order.items.map((item, index) => (
                                    <tr key={item.id || index} className="align-top">
                                        <td className="px-3 py-2">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <span className="font-mono text-xs font-black text-slate-800">{item.item_name}</span>
                                                {item.size_info && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-black text-blue-700">#{item.size_info}</span>}
                                                {item.item_type === 'Material' && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-black uppercase text-amber-700">Υλικό</span>}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2 text-xs font-semibold text-slate-600">{item.customer_reference || <span className="text-slate-300">—</span>}</td>
                                        <td className="px-3 py-2 text-xs italic text-slate-500">{item.notes || <span className="not-italic text-slate-300">—</span>}</td>
                                        <td className="px-3 py-2 text-right font-mono text-sm font-black tabular-nums text-slate-900">{formatNumber(item.quantity)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function SupplierDetailsModal({
    supplier,
    stats,
    products,
    materials,
    orders,
    suppliersById,
    initialTab = 'overview',
    focusOrderId = null,
    escapeDisabled = false,
    onClose,
    onEdit,
    onDelete,
    onNewOrder,
    onEditOrder,
    onReceiveOrder,
    onPrintOrder,
    onDeleteOrder,
    onLinkProduct,
    onUnlinkProduct,
}: Props) {
    const { showToast } = useUI();
    const [tab, setTab] = useState<SupplierDetailsTab>(initialTab);
    const [productFilter, setProductFilter] = useState('');
    const [linkOpen, setLinkOpen] = useState(false);
    const [linkSearch, setLinkSearch] = useState('');
    const [busySku, setBusySku] = useState<string | null>(null);
    const [orderFilter, setOrderFilter] = useState<OrderFilter>('all');
    const [expandedOrders, setExpandedOrders] = useState<Set<string>>(() => new Set(focusOrderId ? [focusOrderId] : []));

    useEscapeToClose(onClose, escapeDisabled);

    useEffect(() => {
        setTab(initialTab);
        if (focusOrderId) {
            setExpandedOrders((previous) => new Set(previous).add(focusOrderId));
            requestAnimationFrame(() => document.getElementById(`supplier-order-${focusOrderId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
        }
    }, [initialTab, focusOrderId]);

    const assignedProducts = useMemo(
        () => products.filter((product) => product.supplier_id === supplier.id).sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true })),
        [products, supplier.id],
    );
    const visibleProducts = useMemo(() => {
        const q = productFilter.trim().toLowerCase();
        if (!q) return assignedProducts;
        return assignedProducts.filter((product) => [product.sku, product.supplier_sku, product.category].some((value) => value?.toLowerCase().includes(q)));
    }, [assignedProducts, productFilter]);

    const linkCandidates = useMemo(() => {
        const q = linkSearch.trim().toLowerCase();
        if (!q) return [];
        return products
            .filter((product) => product.supplier_id !== supplier.id)
            .filter((product) => product.sku.toLowerCase().includes(q) || product.supplier_sku?.toLowerCase().includes(q))
            .sort((a, b) => Number(!!a.supplier_id) - Number(!!b.supplier_id) || a.sku.localeCompare(b.sku, undefined, { numeric: true }))
            .slice(0, 30);
    }, [products, supplier.id, linkSearch]);

    const materialGroups = useMemo(() => {
        const groups = new Map<string, Material[]>();
        materials
            .filter((material) => material.supplier_id === supplier.id)
            .sort((a, b) => a.name.localeCompare(b.name, 'el'))
            .forEach((material) => {
                const list = groups.get(material.type) ?? [];
                list.push(material);
                groups.set(material.type, list);
            });
        return [...groups.entries()];
    }, [materials, supplier.id]);

    const sortedOrders = useMemo(
        () => [...orders].sort((a, b) => b.created_at.localeCompare(a.created_at)),
        [orders],
    );
    const orderCounts = useMemo(() => {
        const counts: Record<OrderFilter, number> = { all: orders.length, Pending: 0, Received: 0, Cancelled: 0 };
        orders.forEach((order) => { counts[order.status] += 1; });
        return counts;
    }, [orders]);
    const visibleOrders = orderFilter === 'all' ? sortedOrders : sortedOrders.filter((order) => order.status === orderFilter);

    const toggleOrder = (id: string) => setExpandedOrders((previous) => {
        const next = new Set(previous);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });

    const openOrder = (id: string) => {
        setTab('orders');
        setOrderFilter('all');
        setExpandedOrders((previous) => new Set(previous).add(id));
        requestAnimationFrame(() => document.getElementById(`supplier-order-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    };

    const runProductAction = async (sku: string, action: (sku: string) => Promise<void>) => {
        setBusySku(sku);
        try { await action(sku); } finally { setBusySku(null); }
    };

    const copy = async (value: string, label: string) => {
        try {
            await navigator.clipboard.writeText(value);
            showToast(`${label}: αντιγράφηκε.`, 'success');
        } catch {
            showToast('Η αντιγραφή απέτυχε.', 'error');
        }
    };

    const tabs: { id: SupplierDetailsTab; label: string; icon: typeof Gem; count?: number; dot?: boolean }[] = [
        { id: 'overview', label: 'Επισκόπηση', icon: LayoutDashboard },
        { id: 'products', label: 'Προϊόντα', icon: Gem, count: assignedProducts.length },
        { id: 'materials', label: 'Υλικά', icon: Box, count: stats.materialCount },
        { id: 'orders', label: 'Εντολές', icon: ShoppingCart, count: orders.length, dot: stats.pendingOrderCount > 0 },
    ];

    const contactRows = [
        { icon: Phone, label: 'Τηλέφωνο', value: supplier.phone, href: supplier.phone ? `tel:${supplier.phone}` : undefined },
        { icon: Mail, label: 'Email', value: supplier.email, href: supplier.email ? `mailto:${supplier.email}` : undefined },
        { icon: MapPin, label: 'Διεύθυνση', value: supplier.address, href: supplier.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(supplier.address)}` : undefined },
    ];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm animate-in fade-in md:p-6 lg:p-10" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
            <div role="dialog" aria-modal="true" aria-label={supplier.name} className="flex h-full max-h-[90vh] w-full max-w-7xl overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-2xl animate-in zoom-in-95">
                {/* Identity sidebar */}
                <aside className="relative hidden w-80 shrink-0 flex-col overflow-y-auto border-r border-slate-100 bg-gradient-to-b from-slate-50 to-white custom-scrollbar lg:flex">
                    <div className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-emerald-200/30 blur-3xl" />
                    <div className="relative p-6">
                        <SupplierAvatar name={supplier.name} size="lg" />
                        <h2 className="mt-4 text-2xl font-black leading-tight tracking-tight text-slate-900">{supplier.name}</h2>
                        <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-500">
                            <UserRound size={14} /> {supplier.contact_person || 'Χωρίς υπεύθυνο'}
                        </p>

                        <div className="mt-5 flex gap-2">
                            <button type="button" onClick={onEdit} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50">
                                <Pencil size={15} /> Επεξεργασία
                            </button>
                            <button type="button" onClick={onDelete} title="Διαγραφή προμηθευτή" className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-400 shadow-sm transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600">
                                <Trash2 size={17} />
                            </button>
                        </div>

                        <div className="mt-6 space-y-1">
                            <h3 className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Επικοινωνία</h3>
                            {contactRows.map(({ icon: Icon, label, value, href }) => (
                                <div key={label} className="group flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-white">
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm ring-1 ring-slate-100"><Icon size={15} /></span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</span>
                                        {value ? (
                                            <a href={href} target={label === 'Διεύθυνση' ? '_blank' : undefined} rel="noreferrer" className="block truncate text-sm font-bold text-slate-800 hover:text-emerald-700" title={value}>{value}</a>
                                        ) : <span className="block text-sm font-medium italic text-slate-400">—</span>}
                                    </span>
                                    {value && (
                                        <button type="button" onClick={() => copy(value, label)} title="Αντιγραφή" className="rounded-lg p-1.5 text-slate-300 opacity-0 transition-all hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100">
                                            <Copy size={13} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="mt-6">
                            <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400"><StickyNote size={12} /> Σημειώσεις</h3>
                            {supplier.notes ? (
                                <p className="whitespace-pre-wrap rounded-xl border border-amber-100 bg-amber-50/60 p-3 text-sm font-medium leading-relaxed text-slate-700">{supplier.notes}</p>
                            ) : (
                                <button type="button" onClick={onEdit} className="w-full rounded-xl border border-dashed border-slate-200 p-3 text-left text-xs font-bold text-slate-400 transition-colors hover:border-slate-300 hover:text-slate-600">
                                    + Προσθήκη σημειώσεων (όροι, χρόνοι παράδοσης…)
                                </button>
                            )}
                        </div>
                    </div>
                </aside>

                {/* Main area */}
                <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-4 pt-3 md:px-6">
                        <div className="flex items-center gap-3 pb-3 lg:hidden">
                            <SupplierAvatar name={supplier.name} size="sm" />
                            <div className="min-w-0">
                                <h2 className="truncate text-lg font-black text-slate-900">{supplier.name}</h2>
                                <button type="button" onClick={onEdit} className="text-xs font-bold text-emerald-700">Επεξεργασία</button>
                            </div>
                        </div>
                        <nav className="hidden flex-1 gap-1 overflow-x-auto custom-scrollbar lg:flex" role="tablist">
                            {tabs.map(({ id, label, icon: Icon, count, dot }) => (
                                <button
                                    key={id}
                                    type="button"
                                    role="tab"
                                    aria-selected={tab === id}
                                    onClick={() => setTab(id)}
                                    className={`relative flex items-center gap-2 whitespace-nowrap rounded-t-xl px-4 py-3 text-sm font-bold transition-colors ${tab === id ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}
                                >
                                    <Icon size={16} /> {label}
                                    {count !== undefined && <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-black tabular-nums ${tab === id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}`}>{formatNumber(count)}</span>}
                                    {dot && <span className="h-2 w-2 rounded-full bg-amber-400" />}
                                    {tab === id && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" />}
                                </button>
                            ))}
                        </nav>
                        <button type="button" onClick={onNewOrder} className="ml-auto mb-3 hidden items-center gap-2 rounded-xl bg-[#060b00] px-4 py-2 text-sm font-bold text-white shadow-md transition-all hover:-translate-y-px hover:bg-black md:inline-flex">
                            <Plus size={16} strokeWidth={2.75} /> Νέα εντολή αγοράς
                        </button>
                        <button type="button" onClick={onClose} className="mb-3 rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" aria-label="Κλείσιμο">
                            <X size={22} />
                        </button>
                    </div>
                    <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-100 px-3 custom-scrollbar lg:hidden">
                        {tabs.map(({ id, label, count }) => (
                            <button key={id} type="button" onClick={() => setTab(id)} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-bold ${tab === id ? 'border-emerald-500 text-slate-900' : 'border-transparent text-slate-500'}`}>
                                {label}{count !== undefined ? ` (${formatNumber(count)})` : ''}
                            </button>
                        ))}
                    </nav>

                    <div className="flex-1 overflow-y-auto bg-slate-50/60 p-4 custom-scrollbar md:p-6">
                        {tab === 'overview' && (
                            <div className="space-y-6 animate-in fade-in">
                                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                                    <Kpi icon={Gem} label="Προϊόντα" value={formatNumber(stats.productCount)} tone="border-violet-100 bg-violet-50 text-violet-800" onClick={() => setTab('products')} />
                                    <Kpi icon={Box} label="Υλικά" value={formatNumber(stats.materialCount)} tone="border-sky-100 bg-sky-50 text-sky-800" onClick={() => setTab('materials')} />
                                    <Kpi icon={Clock} label="Εκκρεμείς εντολές" value={formatNumber(stats.pendingOrderCount)} tone="border-amber-100 bg-amber-50 text-amber-800" onClick={() => { setTab('orders'); setOrderFilter('Pending'); }} />
                                    <Kpi icon={PackageCheck} label="Τεμάχια σε αναμονή" value={formatNumber(stats.pendingPieces)} tone="border-emerald-100 bg-emerald-50 text-emerald-800" />
                                </div>

                                <div className="grid gap-6 xl:grid-cols-5">
                                    <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm xl:col-span-3">
                                        <div className="mb-4 flex items-center justify-between">
                                            <h3 className="text-sm font-black text-slate-800">Πρόσφατες εντολές</h3>
                                            {orders.length > 0 && <button type="button" onClick={() => setTab('orders')} className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-800">Όλες <ArrowRight size={13} /></button>}
                                        </div>
                                        {sortedOrders.length === 0 ? (
                                            <EmptyState icon={ShoppingCart} title="Δεν υπάρχουν εντολές ακόμη." size="compact" variant="plain" action={(
                                                <button type="button" onClick={onNewOrder} className="inline-flex items-center gap-2 rounded-xl bg-[#060b00] px-4 py-2 text-sm font-bold text-white"><Plus size={15} /> Πρώτη εντολή</button>
                                            )} />
                                        ) : (
                                            <div className="divide-y divide-slate-100">
                                                {sortedOrders.slice(0, 5).map((order) => (
                                                    <button key={order.id} type="button" onClick={() => openOrder(order.id)} className="flex w-full items-center gap-3 py-3 text-left transition-colors first:pt-0 last:pb-0 hover:text-slate-900">
                                                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${STATUS_ACCENT[order.status]}`}>{getSupplierOrderStatusIcon(order.status, 16)}</span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block font-mono text-sm font-black text-slate-800">#{orderShortId(order.id)}</span>
                                                            <span className="block text-xs font-semibold text-slate-500">{formatRelativeDay(order.created_at)} · {formatNumber(order.items.length)} γραμμές · {formatNumber(orderPieces(order))} τεμ.</span>
                                                        </span>
                                                        <span className={`rounded-md px-2 py-0.5 text-[10px] font-black ${getSupplierOrderStatusClasses(order.status)}`}>{getSupplierOrderStatusLabel(order.status)}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </section>

                                    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1c2812] via-[#0b1204] to-[#060b00] p-6 text-white shadow-lg xl:col-span-2">
                                        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-400/20 blur-3xl" />
                                        <ShoppingCart size={28} className="text-emerald-300" />
                                        <h3 className="mt-3 text-lg font-black">Χρειάζεστε απόθεμα;</h3>
                                        <p className="mt-1 text-sm font-medium text-white/70">
                                            Η νέα εντολή συγκεντρώνει αυτόματα τις ανάγκες παραγωγής και τις εκκρεμείς παραγγελίες πελατών για αυτόν τον προμηθευτή.
                                        </p>
                                        <button type="button" onClick={onNewOrder} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-slate-900 shadow transition-transform hover:-translate-y-px">
                                            <Plus size={16} strokeWidth={2.75} /> Νέα εντολή αγοράς
                                        </button>
                                    </section>
                                </div>

                                {/* Sidebar content repeated for narrow screens */}
                                <section className="space-y-3 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm lg:hidden">
                                    {contactRows.map(({ icon: Icon, label, value, href }) => (
                                        <div key={label} className="flex items-center gap-3 text-sm">
                                            <Icon size={15} className="text-slate-400" />
                                            {value ? <a href={href} className="font-bold text-slate-800">{value}</a> : <span className="italic text-slate-400">—</span>}
                                        </div>
                                    ))}
                                    {supplier.notes && <p className="whitespace-pre-wrap rounded-xl bg-amber-50/60 p-3 text-sm text-slate-700">{supplier.notes}</p>}
                                </section>
                            </div>
                        )}

                        {tab === 'products' && (
                            <div className="space-y-4 animate-in fade-in">
                                <div className="flex flex-wrap items-center gap-3">
                                    <div className="relative min-w-[14rem] flex-1">
                                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input value={productFilter} onChange={(event) => setProductFilter(event.target.value)} placeholder="Φιλτράρισμα συνδεδεμένων (κωδικός, ref, κατηγορία)…" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm font-semibold outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10" />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => { setLinkOpen((open) => !open); setLinkSearch(''); }}
                                        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold shadow-sm transition-colors ${linkOpen ? 'bg-slate-200 text-slate-800' : 'bg-violet-600 text-white hover:bg-violet-700'}`}
                                    >
                                        {linkOpen ? <X size={16} /> : <Link2 size={16} />} {linkOpen ? 'Κλείσιμο σύνδεσης' : 'Σύνδεση προϊόντων'}
                                    </button>
                                </div>

                                {linkOpen && (
                                    <div className="rounded-3xl border border-violet-100 bg-white p-4 shadow-lg shadow-violet-900/5 animate-in fade-in slide-in-from-top-2">
                                        <div className="relative">
                                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-violet-400" />
                                            <input autoFocus value={linkSearch} onChange={(event) => setLinkSearch(event.target.value)} placeholder="Αναζήτηση κωδικού ή κωδικού προμηθευτή για σύνδεση…" className="w-full rounded-xl border border-violet-200 bg-violet-50/40 py-3 pl-9 pr-3 text-sm font-bold outline-none focus:bg-white focus:ring-4 focus:ring-violet-500/10" />
                                        </div>
                                        <div className="mt-3 max-h-80 space-y-1 overflow-y-auto custom-scrollbar">
                                            {!linkSearch.trim() && <p className="py-6 text-center text-xs font-bold text-slate-400">Πληκτρολογήστε για να βρείτε προϊόντα. Όσα δεν έχουν προμηθευτή εμφανίζονται πρώτα.</p>}
                                            {linkSearch.trim() && linkCandidates.length === 0 && <p className="py-6 text-center text-xs font-bold text-slate-400">Δεν βρέθηκαν διαθέσιμα προϊόντα.</p>}
                                            {linkCandidates.map((product) => {
                                                const current = product.supplier_id ? suppliersById.get(product.supplier_id) : undefined;
                                                return (
                                                    <div key={product.sku} className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-slate-50">
                                                        <ProductThumb url={product.image_url} size="h-10 w-10" />
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <span className="font-mono text-sm font-black text-slate-800">{product.sku}</span>
                                                                {product.supplier_sku && <span className="text-[10px] font-bold text-violet-600">Ref: {product.supplier_sku}</span>}
                                                            </div>
                                                            <span className="text-[11px] font-semibold text-slate-400">{product.category}</span>
                                                        </div>
                                                        {current ? (
                                                            <span className="hidden rounded-md bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700 ring-1 ring-amber-100 sm:inline">Τώρα: {current.name}</span>
                                                        ) : (
                                                            <span className="hidden rounded-md bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-500 sm:inline">Χωρίς προμηθευτή</span>
                                                        )}
                                                        <button
                                                            type="button"
                                                            disabled={busySku === product.sku}
                                                            onClick={() => runProductAction(product.sku, onLinkProduct)}
                                                            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 transition-colors hover:bg-violet-100 disabled:opacity-50"
                                                        >
                                                            <Link2 size={13} /> {current ? 'Μεταφορά' : 'Σύνδεση'}
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {assignedProducts.length === 0 ? (
                                    <EmptyState icon={Gem} title="Δεν υπάρχουν συνδεδεμένα προϊόντα." hint="Συνδέστε προϊόντα για να εμφανίζονται στις εντολές αγοράς αυτού του προμηθευτή." />
                                ) : visibleProducts.length === 0 ? (
                                    <EmptyState icon={Search} title="Κανένα προϊόν δεν ταιριάζει στο φίλτρο." size="compact" />
                                ) : (
                                    <div className="grid gap-2 xl:grid-cols-2">
                                        {visibleProducts.map((product) => (
                                            <div key={product.sku} className="group flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm transition-colors hover:border-slate-200">
                                                <ProductThumb url={product.image_url} />
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="font-mono text-sm font-black text-slate-900">{product.sku}</span>
                                                        {product.supplier_sku && <span className="rounded border border-violet-100 bg-violet-50 px-1.5 py-0.5 text-[10px] font-black uppercase text-violet-700">Ref: {product.supplier_sku}</span>}
                                                    </div>
                                                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] font-semibold text-slate-500">
                                                        <span>{product.category}</span>
                                                        {!!product.variants?.length && <span>{formatNumber(product.variants.length)} παραλλαγές</span>}
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">Κόστος</div>
                                                    <div className="text-sm font-black tabular-nums text-slate-800">{formatCurrency(product.supplier_cost || product.active_price || 0)}</div>
                                                </div>
                                                <button
                                                    type="button"
                                                    disabled={busySku === product.sku}
                                                    onClick={() => runProductAction(product.sku, onUnlinkProduct)}
                                                    title="Αποσύνδεση από τον προμηθευτή"
                                                    className="rounded-lg p-2 text-slate-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100 disabled:opacity-50"
                                                >
                                                    <Unlink size={16} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {tab === 'materials' && (
                            <div className="space-y-6 animate-in fade-in">
                                {materialGroups.length === 0 ? (
                                    <EmptyState icon={Box} title="Κανένα συνδεδεμένο υλικό." hint="Ο προμηθευτής ενός υλικού ορίζεται από τη σελίδα Υλικών." />
                                ) : materialGroups.map(([type, list]) => (
                                    <section key={type}>
                                        <h3 className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
                                            {MATERIAL_TYPE_LABELS[type] || type}
                                            <span className="rounded bg-slate-200/70 px-1.5 py-0.5 text-[10px] text-slate-600">{formatNumber(list.length)}</span>
                                        </h3>
                                        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                            {list.map((material) => (
                                                <div key={material.id} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
                                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600"><Box size={18} /></span>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="truncate text-sm font-black text-slate-800" title={material.name}>{material.name}</div>
                                                        <div className="truncate text-[11px] font-semibold text-slate-400">{material.description || (MATERIAL_TYPE_LABELS[material.type] || material.type)}</div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-sm font-black tabular-nums text-slate-800">{formatCurrency(material.cost_per_unit)}<span className="text-[10px] font-bold text-slate-400"> / {material.unit}</span></div>
                                                        {material.stock_qty !== undefined && material.stock_qty !== null && (
                                                            <div className="text-[10px] font-bold text-slate-400">Απόθεμα {formatNumber(material.stock_qty)}</div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                ))}
                            </div>
                        )}

                        {tab === 'orders' && (
                            <div className="space-y-4 animate-in fade-in">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="inline-flex rounded-xl border border-slate-200/60 bg-slate-100 p-0.5">
                                        {([
                                            ['all', 'Όλες'],
                                            ['Pending', 'Εκκρεμείς'],
                                            ['Received', 'Παραλήφθηκαν'],
                                            ['Cancelled', 'Ακυρώθηκαν'],
                                        ] as [OrderFilter, string][]).filter(([key]) => key === 'all' || orderCounts[key] > 0 || key === 'Pending').map(([key, label]) => (
                                            <button
                                                key={key}
                                                type="button"
                                                onClick={() => setOrderFilter(key)}
                                                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${orderFilter === key ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/90' : 'text-slate-500 hover:text-slate-700'}`}
                                            >
                                                {label} <span className="tabular-nums opacity-60">{formatNumber(orderCounts[key])}</span>
                                            </button>
                                        ))}
                                    </div>
                                    <button type="button" onClick={onNewOrder} className="inline-flex items-center gap-2 rounded-xl bg-[#060b00] px-4 py-2 text-sm font-bold text-white shadow-md transition-all hover:-translate-y-px hover:bg-black md:hidden">
                                        <Plus size={16} /> Νέα εντολή
                                    </button>
                                </div>
                                {visibleOrders.length === 0 ? (
                                    <EmptyState
                                        icon={ShoppingCart}
                                        title={orders.length === 0 ? 'Δεν υπάρχουν εντολές αγοράς.' : 'Καμία εντολή σε αυτή την κατάσταση.'}
                                        action={orders.length === 0 ? (
                                            <button type="button" onClick={onNewOrder} className="inline-flex items-center gap-2 rounded-xl bg-[#060b00] px-4 py-2 text-sm font-bold text-white"><Plus size={15} /> Νέα εντολή αγοράς</button>
                                        ) : undefined}
                                    />
                                ) : (
                                    <div className="space-y-3">
                                        {visibleOrders.map((order) => (
                                            <OrderCard
                                                key={order.id}
                                                order={order}
                                                expanded={expandedOrders.has(order.id)}
                                                onToggle={() => toggleOrder(order.id)}
                                                onEdit={() => onEditOrder(order)}
                                                onReceive={() => onReceiveOrder(order)}
                                                onPrint={() => onPrintOrder(order)}
                                                onDelete={() => onDeleteOrder(order)}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
