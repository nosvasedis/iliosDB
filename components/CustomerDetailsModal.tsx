import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Customer, Order, OrderStatus, VatRegime } from '../types';
import {
    Phone,
    Mail,
    MapPin,
    FileText,
    Save,
    Loader2,
    X,
    ShoppingBag,
    Calendar,
    PieChart,
    Briefcase,
    Trash2,
    Printer,
    Trophy,
    Zap,
    Wallet,
    Calculator,
    Package,
    Users as UsersIcon,
    ArrowRight,
    Clock,
    Gift,
    Copy,
    Check,
    User,
    Search,
    LayoutDashboard,
    Receipt,
    StickyNote,
    BarChart3,
} from 'lucide-react';
import { api, RETAIL_CUSTOMER_ID, RETAIL_CUSTOMER_NAME } from '../lib/supabase';
import { useUI } from './UIProvider';
import { formatCurrency } from '../utils/pricingEngine';
import { extractRetailClientFromNotes } from '../utils/retailNotes';
import { retailEndClientPillClass } from '../utils/retailPresentation';
import { getNextNamedayForName } from '../utils/namedays';
import { formatGreekDate } from '../utils/deliveryLabels';
import { getOrderStatusClasses, getOrderStatusLabel } from '../features/orders/statusPresentation';

export interface CustomerDetailsModalProps {
    customer: Customer;
    orders: Order[];
    onClose: () => void;
    onUpdate: (c: Customer) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    onPrintOrder?: (o: Order) => void;
}

const inputClass =
    'w-full p-3 border border-slate-200 bg-white focus:ring-2 focus:ring-blue-500/20 rounded-xl outline-none transition-all text-sm font-medium text-slate-800 placeholder:text-slate-400';
const sectionCard = 'bg-white rounded-2xl border border-slate-100 shadow-sm';

function OrderIdRow({
    orderId,
    copied,
    onCopy,
    compact,
}: {
    orderId: string;
    copied: boolean;
    onCopy: () => void;
    compact?: boolean;
}) {
    return (
        <div className={`flex items-start gap-2 min-w-0 ${compact ? '' : 'flex-wrap sm:flex-nowrap'}`}>
            <span
                className={`font-mono font-bold text-slate-800 tracking-tight break-all ${compact ? 'text-[11px] leading-snug' : 'text-xs sm:text-sm'}`}
                title={orderId}
            >
                {orderId}
            </span>
            <button
                type="button"
                onClick={e => {
                    e.stopPropagation();
                    onCopy();
                }}
                className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                title="Αντιγραφή κωδικού"
                aria-label="Αντιγραφή κωδικού παραγγελίας"
            >
                {copied ? <Check size={compact ? 14 : 16} className="text-emerald-600" /> : <Copy size={compact ? 14 : 16} />}
            </button>
        </div>
    );
}

export default function CustomerDetailsModal({
    customer,
    orders,
    onClose,
    onUpdate,
    onDelete,
    onPrintOrder,
}: CustomerDetailsModalProps) {
    const isRetailSystemCustomer = customer.id === RETAIL_CUSTOMER_ID;
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState<Customer>(customer);
    const [isSaving, setIsSaving] = useState(false);
    const [isSearchingAfm, setIsSearchingAfm] = useState(false);
    const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);
    const { showToast } = useUI();

    type NormalTab = 'overview' | 'contact' | 'billing' | 'notes' | 'analytics' | 'orders';
    type RetailTab = 'overview' | 'end_clients' | 'categories' | 'orders';
    const [activeTab, setActiveTab] = useState<NormalTab | RetailTab>('overview');
    const [orderQuery, setOrderQuery] = useState('');

    useEffect(() => {
        setEditForm(customer);
        setIsEditing(false);
        setActiveTab('overview');
        setOrderQuery('');
    }, [customer.id]);

    const stats = useMemo(() => {
        const customerOrders = orders
            .filter(
                o =>
                    o.status !== OrderStatus.Cancelled &&
                    (o.customer_id === customer.id || o.customer_name === customer.full_name)
            )
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        const totalSpent = customerOrders.reduce((acc, o) => {
            const netValue = o.total_price / (1 + (o.vat_rate || 0.24));
            return acc + netValue;
        }, 0);

        const orderCount = customerOrders.length;
        const avgOrderValue = orderCount > 0 ? totalSpent / orderCount : 0;

        const catStats: Record<string, { count: number; value: number }> = {};
        let totalItems = 0;

        customerOrders.forEach(o => {
            const discountFactor = 1 - ((o.discount_percent || 0) / 100);
            o.items.forEach(item => {
                const cat = item.product_details?.category || 'Άλλο';
                if (!catStats[cat]) catStats[cat] = { count: 0, value: 0 };
                catStats[cat].count += item.quantity;
                catStats[cat].value += item.price_at_order * item.quantity * discountFactor;
                totalItems += item.quantity;
            });
        });

        const prefData = Object.entries(catStats)
            .map(([name, s]) => ({
                name,
                count: s.count,
                value: s.value,
                percentage: totalItems > 0 ? (s.count / totalItems) * 100 : 0,
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        const latestOrder = customerOrders[0];
        const oldestOrder = customerOrders[customerOrders.length - 1];
        let statusMarker = 'Ενεργός';
        let statusColor = 'bg-emerald-50 text-emerald-800 border border-emerald-200';
        if (latestOrder) {
            const monthsSince =
                (new Date().getTime() - new Date(latestOrder.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30);
            if (monthsSince > 6) {
                statusMarker = 'Ανενεργός';
                statusColor = 'bg-red-50 text-red-800 border border-red-200';
            } else if (monthsSince > 3) {
                statusMarker = 'Σε κίνδυνο';
                statusColor = 'bg-amber-50 text-amber-800 border border-amber-200';
            }
        } else {
            statusMarker = 'Νέος';
            statusColor = 'bg-sky-50 text-sky-800 border border-sky-200';
        }

        let activeMonths = 0;
        if (latestOrder && oldestOrder) {
            activeMonths = Math.max(
                1,
                Math.round(
                    (new Date(latestOrder.created_at).getTime() - new Date(oldestOrder.created_at).getTime()) /
                        (1000 * 60 * 60 * 24 * 30)
                )
            );
        }

        return {
            totalSpent,
            orderCount,
            avgOrderValue,
            history: customerOrders,
            prefData,
            totalItems,
            latestOrder,
            statusMarker,
            statusColor,
            activeMonths,
        };
    }, [customer, orders]);

    const filteredOrders = useMemo(() => {
        const q = orderQuery.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (!q) return stats.history;
        return stats.history.filter(o => {
            if (o.id.toLowerCase().includes(q)) return true;
            const dateStr = new Date(o.created_at).toLocaleDateString('el-GR');
            if (dateStr.toLowerCase().includes(q)) return true;
            if (isRetailSystemCustomer) {
                const raw = extractRetailClientFromNotes(o.notes).retailClientLabel || '';
                const label = raw
                    .toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '');
                if (label.includes(q)) return true;
            }
            return false;
        });
    }, [stats.history, orderQuery, isRetailSystemCustomer]);

    const retailOrdersWithLabels = isRetailSystemCustomer
        ? stats.history.map(o => ({
              order: o,
              retailClientLabel: extractRetailClientFromNotes(o.notes).retailClientLabel,
          }))
        : [];

    const retailClientStats = useMemo(() => {
        if (!isRetailSystemCustomer) return [];
        const clientMap: Record<string, { name: string; orderCount: number; totalRevenue: number }> = {};
        retailOrdersWithLabels.forEach(({ order, retailClientLabel }) => {
            const label = retailClientLabel || 'Χωρίς τελικό πελάτη';
            if (!clientMap[label]) clientMap[label] = { name: label, orderCount: 0, totalRevenue: 0 };
            clientMap[label].orderCount += 1;
            clientMap[label].totalRevenue += order.total_price / (1 + (order.vat_rate || 0.24));
        });
        return Object.values(clientMap)
            .sort((a, b) => b.totalRevenue - a.totalRevenue)
            .slice(0, 10);
    }, [retailOrdersWithLabels, isRetailSystemCustomer]);

    const handleSave = async () => {
        if (isRetailSystemCustomer) {
            showToast('Ο πελάτης Λιανική είναι μόνο για ανάγνωση.', 'error');
            return;
        }
        if (!editForm.full_name.trim()) {
            showToast('Το ονοματεπώνυμο είναι υποχρεωτικό.', 'error');
            return;
        }
        setIsSaving(true);
        try {
            await onUpdate(editForm);
            setIsEditing(false);
        } catch (e) {
            console.error('Save error:', e);
        } finally {
            setIsSaving(false);
        }
    };

    const handleAfmLookup = async () => {
        if (!editForm.vat_number || editForm.vat_number.length < 9) {
            showToast('Μη έγκυρο ΑΦΜ.', 'error');
            return;
        }
        setIsSearchingAfm(true);
        try {
            const result = await api.lookupAfm(editForm.vat_number);
            if (result) {
                setEditForm(prev => ({
                    ...prev,
                    full_name: result.name || prev.full_name,
                    address: result.address || prev.address,
                    phone: !prev.phone && result.phone ? result.phone : prev.phone,
                    email: !prev.email && result.email ? result.email : prev.email,
                }));
                const filled = [
                    'Επωνυμία',
                    result.address ? 'Διεύθυνση' : null,
                    result.phone ? 'Τηλέφωνο' : null,
                    result.email ? 'Email' : null,
                ]
                    .filter(Boolean)
                    .join(', ');
                showToast(`Βρέθηκαν: ${filled}`, 'success');
            } else {
                showToast('Δεν βρέθηκαν στοιχεία.', 'info');
            }
        } catch (e: unknown) {
            showToast((e as Error).message || 'Σφάλμα αναζήτησης.', 'error');
        } finally {
            setIsSearchingAfm(false);
        }
    };

    const copyOrderId = useCallback(
        async (orderId: string) => {
            try {
                await navigator.clipboard.writeText(orderId);
                setCopiedOrderId(orderId);
                showToast('Ο κωδικός παραγγελίας αντιγράφηκε', 'success');
                window.setTimeout(() => setCopiedOrderId(id => (id === orderId ? null : id)), 2000);
            } catch {
                showToast('Δεν ήταν δυνατή η αντιγραφή', 'error');
            }
        },
        [showToast]
    );

    const retailTabList: { id: RetailTab; label: string; Icon: typeof LayoutDashboard }[] = [
        { id: 'overview', label: 'Επισκόπηση', Icon: LayoutDashboard },
        { id: 'end_clients', label: 'Τελικοί πελάτες', Icon: UsersIcon },
        { id: 'categories', label: 'Κατηγορίες', Icon: PieChart },
        { id: 'orders', label: `Παραγγελίες (${stats.orderCount})`, Icon: ShoppingBag },
    ];
    const normalTabList: { id: NormalTab; label: string; Icon: typeof LayoutDashboard }[] = [
        { id: 'overview', label: 'Επισκόπηση', Icon: LayoutDashboard },
        { id: 'contact', label: 'Επικοινωνία', Icon: Phone },
        { id: 'billing', label: 'Τιμολόγηση', Icon: Receipt },
        { id: 'notes', label: 'Σημειώσεις', Icon: StickyNote },
        { id: 'analytics', label: 'Ανάλυση', Icon: BarChart3 },
        { id: 'orders', label: `Παραγγελίες (${stats.orderCount})`, Icon: ShoppingBag },
    ];
    const tabList = isRetailSystemCustomer ? retailTabList : normalTabList;

    /** Λιανική is a bucket for many real clients — no single identity, nameday, or "VIP" person. */
    const nextNameday =
        !isRetailSystemCustomer && customer.full_name && customer.full_name !== RETAIL_CUSTOMER_NAME
            ? getNextNamedayForName(customer.full_name)
            : null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-3 backdrop-blur-sm sm:p-6 lg:p-10 animate-in fade-in duration-200">
            <div
                className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-xl animate-in zoom-in-95 duration-200"
                role="dialog"
                aria-labelledby="customer-modal-title"
            >
                <div className="shrink-0 border-b border-slate-100 bg-white p-5 sm:p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 items-start gap-4">
                            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 text-2xl font-black text-blue-600">
                                {customer.full_name ? customer.full_name.charAt(0).toUpperCase() : '?'}
                            </div>
                            <div className="min-w-0 flex-1">
                                {isEditing ? (
                                    <input
                                        id="customer-modal-title"
                                        className="mb-1 w-full max-w-xl rounded-xl border border-slate-200 bg-white px-3 py-2 text-xl font-bold text-[#060b00] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15"
                                        value={editForm.full_name}
                                        onChange={e => setEditForm({ ...editForm, full_name: e.target.value })}
                                        placeholder="Ονοματεπώνυμο..."
                                        autoFocus
                                    />
                                ) : (
                                    <h2
                                        id="customer-modal-title"
                                        className="text-xl font-bold tracking-tight text-[#060b00] sm:text-2xl"
                                    >
                                        {customer.full_name}
                                    </h2>
                                )}
                                <p className="text-sm font-medium text-slate-500">
                                    {isRetailSystemCustomer
                                        ? 'Συλλογικός λογαριασμός λιανικής — δείτε καρτέλες για τελικούς πελάτες και παραγγελίες.'
                                        : 'Καρτέλα πελάτη — επισκόπηση, στοιχεία, ανάλυση και παραγγελίες.'}
                                </p>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    {isRetailSystemCustomer && (
                                        <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-fuchsia-800">
                                            Συστημικός πελάτης
                                        </span>
                                    )}
                                    {stats.totalSpent > 1000 && !isRetailSystemCustomer && (
                                        <span className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-900">
                                            <Trophy size={10} /> VIP
                                        </span>
                                    )}
                                    {nextNameday && (
                                        <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[10px] font-bold text-sky-800">
                                            <Gift size={12} className="shrink-0" />
                                            {nextNameday.is_today
                                                ? `Γιορτάζει σήμερα · ${nextNameday.label}`
                                                : nextNameday.days_until <= 7
                                                  ? `Ονομαστική ${formatGreekDate(nextNameday.date)} (σε ${nextNameday.days_until} ημ.)`
                                                  : `${nextNameday.label} ${formatGreekDate(nextNameday.date)}`}
                                        </span>
                                    )}
                                    {customer.id && (
                                        <span
                                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${stats.statusColor}`}
                                        >
                                            {stats.statusMarker}
                                        </span>
                                    )}
                                </div>
                                {!isRetailSystemCustomer && !isEditing && (
                                    <p className="mt-3 max-w-2xl text-xs leading-relaxed text-slate-600">
                                        <span className="font-mono font-semibold text-slate-800">ΑΦΜ:</span>{' '}
                                        {customer.vat_number || '—'}
                                        <span className="mx-2 text-slate-300">·</span>
                                        <MapPin size={12} className="mr-0.5 inline align-text-bottom text-slate-400" />
                                        {customer.address || 'Χωρίς διεύθυνση'}
                                    </p>
                                )}
                                {isRetailSystemCustomer && (
                                    <p className="mt-3 max-w-2xl rounded-xl border border-fuchsia-100 bg-fuchsia-50/50 px-3 py-2 text-xs leading-relaxed text-fuchsia-950">
                                        <span className="font-bold">Δεν αντιστοιχεί σε ένα νομικό πρόσωπο.</span> Οι τελικοί πελάτες και τα
                                        στοιχεία τους αναδεικνύονται στις παραγγελίες και στην καρτέλα «Τελικοί πελάτες».
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:flex-col lg:items-end">
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
                                aria-label="Κλείσιμο"
                            >
                                <X size={20} />
                            </button>
                            <div className="flex flex-wrap justify-end gap-2">
                                {isEditing ? (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditForm(customer);
                                                setIsEditing(false);
                                            }}
                                            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50"
                                        >
                                            Άκυρο
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleSave}
                                            disabled={isSaving}
                                            className="flex items-center gap-2 rounded-xl bg-[#060b00] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-black disabled:opacity-60"
                                        >
                                            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                            Αποθήκευση
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        {!isRetailSystemCustomer ? (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsEditing(true)}
                                                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 transition-colors hover:border-blue-200 hover:bg-blue-50/50"
                                                >
                                                    Επεξεργασία
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => onDelete(customer.id)}
                                                    className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                                                    aria-label="Διαγραφή πελάτη"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </>
                                        ) : (
                                            <span className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-fuchsia-800">
                                                Μόνο ανάγνωση
                                            </span>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {customer.id && (
                    <div className="shrink-0 border-b border-slate-100 bg-slate-50/90 px-2 py-2 sm:px-4">
                        <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-200/50 p-1 custom-scrollbar">
                            {tabList.map(({ id, label, Icon }) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setActiveTab(id)}
                                    className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold transition-all sm:gap-2 sm:px-3.5 sm:text-sm ${
                                        activeTab === id
                                            ? 'bg-white text-[#060b00] shadow-sm'
                                            : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    <Icon size={15} className="shrink-0 opacity-80" />
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50/50 p-4 sm:p-6 md:p-8 custom-scrollbar">
                    {activeTab === 'overview' &&
                        (isRetailSystemCustomer ? (
                            <div className="max-w-5xl space-y-5">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <div
                                        className={`${sectionCard} p-5 flex flex-col justify-center relative overflow-hidden h-32 group hover:border-emerald-200/80 transition-colors`}
                                    >
                                        <div className="absolute -right-4 -bottom-4 p-3 opacity-[0.04] text-emerald-600">
                                            <Wallet size={100} />
                                        </div>
                                        <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                                            <Wallet size={12} /> Συνολικός τζίρος (καθαρός)
                                        </div>
                                        <div className="text-3xl font-black text-slate-800">{formatCurrency(stats.totalSpent)}</div>
                                    </div>
                                    <div
                                        className={`${sectionCard} p-5 flex flex-col justify-center relative overflow-hidden h-32 group hover:border-blue-200/80 transition-colors`}
                                    >
                                        <div className="absolute -right-4 -bottom-4 p-3 opacity-[0.04] text-blue-600">
                                            <ShoppingBag size={100} />
                                        </div>
                                        <div className="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                                            <Briefcase size={12} /> Παραγγελίες
                                        </div>
                                        <div className="text-3xl font-black text-slate-800">
                                            {stats.orderCount}{' '}
                                            <span className="text-sm font-medium text-slate-400">τεμ.</span>
                                        </div>
                                    </div>
                                    <div
                                        className={`${sectionCard} p-5 flex flex-col justify-center relative overflow-hidden h-32 group hover:border-amber-200/80 transition-colors`}
                                    >
                                        <div className="absolute -right-4 -bottom-4 p-3 opacity-[0.04] text-amber-600">
                                            <Calculator size={100} />
                                        </div>
                                        <div className="text-[10px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                                            <PieChart size={12} /> Μ.Ο. αξίας
                                        </div>
                                        <div className="text-3xl font-black text-slate-800">{formatCurrency(stats.avgOrderValue)}</div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <div className={`${sectionCard} p-5 h-28 flex flex-col justify-center relative overflow-hidden`}>
                                        <div className="text-[10px] font-black text-violet-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                            <Package size={12} /> Τεμάχια
                                        </div>
                                        <div className="text-2xl font-black text-slate-800">
                                            {stats.totalItems}{' '}
                                            <span className="text-sm font-medium text-slate-400">τεμ.</span>
                                        </div>
                                    </div>
                                    <div className={`${sectionCard} p-5 h-28 flex flex-col justify-center`}>
                                        <div className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                            <Calendar size={12} /> Τελευταία παραγγελία
                                        </div>
                                        <div className="text-xl font-black text-slate-800">
                                            {stats.latestOrder
                                                ? new Date(stats.latestOrder.created_at).toLocaleDateString('el-GR')
                                                : '—'}
                                        </div>
                                    </div>
                                    <div className={`${sectionCard} p-5 h-28 flex flex-col justify-center`}>
                                        <div className="text-[10px] font-black text-teal-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                            <Clock size={12} /> Ενεργοί μήνες
                                        </div>
                                        <div className="text-2xl font-black text-slate-800">{stats.activeMonths}</div>
                                    </div>
                                </div>

                                <div className={`${sectionCard} p-5`}>
                                    <h3 className="mb-3 text-sm font-bold text-slate-700">Γρήγορα</h3>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab('end_clients')}
                                            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:border-indigo-200 hover:bg-indigo-50"
                                        >
                                            Τελικοί πελάτες
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab('categories')}
                                            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:border-amber-200 hover:bg-amber-50"
                                        >
                                            Κατηγορίες
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab('orders')}
                                            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50"
                                        >
                                            Όλες οι παραγγελίες
                                        </button>
                                    </div>
                                </div>

                                <div className={`${sectionCard} p-6`}>
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                                            <ShoppingBag size={16} className="text-blue-500" /> Πρόσφατες παραγγελίες
                                        </h3>
                                        {stats.orderCount > 5 && (
                                            <button
                                                type="button"
                                                onClick={() => setActiveTab('orders')}
                                                className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                            >
                                                Όλες <ArrowRight size={12} />
                                            </button>
                                        )}
                                    </div>
                                    {retailOrdersWithLabels.length > 0 ? (
                                        <div className="space-y-2">
                                            {retailOrdersWithLabels.slice(0, 5).map(({ order, retailClientLabel }) => {
                                                const netValue = order.total_price / (1 + (order.vat_rate || 0.24));
                                                const hasLabel = !!retailClientLabel;
                                                return (
                                                    <div
                                                        key={order.id}
                                                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 rounded-xl px-4 py-3 border border-slate-100 hover:border-slate-200 transition-colors"
                                                    >
                                                        <div className="min-w-0 flex-1 space-y-1">
                                                            <OrderIdRow
                                                                orderId={order.id}
                                                                copied={copiedOrderId === order.id}
                                                                onCopy={() => copyOrderId(order.id)}
                                                                compact
                                                            />
                                                            <span className="text-xs text-slate-400">
                                                                {new Date(order.created_at).toLocaleDateString('el-GR')}
                                                            </span>
                                                        </div>
                                                        <span
                                                            className={`truncate max-w-full sm:max-w-[200px] ${
                                                                hasLabel
                                                                    ? retailEndClientPillClass
                                                                    : 'inline-flex items-center rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-400 tracking-tight'
                                                            }`}
                                                            title={hasLabel ? 'Τελικός πελάτης (λιανική)' : undefined}
                                                        >
                                                            {hasLabel ? retailClientLabel : 'Χωρίς πελάτη'}
                                                        </span>
                                                        <span className="font-mono font-black text-sm text-slate-800 shrink-0">
                                                            {formatCurrency(netValue)}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="text-sm text-slate-400 text-center py-6">
                                            Δεν υπάρχουν καταγεγραμμένες παραγγελίες.
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="mx-auto max-w-5xl space-y-5">
                                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                                    <div className={`${sectionCard} p-4`}>
                                        <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                                            Τζίρος (καθαρό)
                                        </div>
                                        <div className="mt-1 text-xl font-black text-slate-800">{formatCurrency(stats.totalSpent)}</div>
                                    </div>
                                    <div className={`${sectionCard} p-4`}>
                                        <div className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                                            Παραγγελίες
                                        </div>
                                        <div className="mt-1 text-xl font-black text-slate-800">{stats.orderCount}</div>
                                    </div>
                                    <div className={`${sectionCard} p-4`}>
                                        <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600">
                                            Μ.Ο. αξίας
                                        </div>
                                        <div className="mt-1 text-xl font-black text-slate-800">{formatCurrency(stats.avgOrderValue)}</div>
                                    </div>
                                    <div className={`${sectionCard} p-4`}>
                                        <div className="text-[10px] font-bold uppercase tracking-wider text-violet-600">
                                            Τελευταία
                                        </div>
                                        <div className="mt-1 text-sm font-bold text-slate-800">
                                            {stats.latestOrder
                                                ? new Date(stats.latestOrder.created_at).toLocaleDateString('el-GR')
                                                : '—'}
                                        </div>
                                    </div>
                                </div>

                                <div className={`${sectionCard} p-5`}>
                                    <h3 className="mb-3 text-sm font-bold text-slate-800">Γρήγορες ενέργειες</h3>
                                    <div className="flex flex-wrap gap-2">
                                        {customer.phone ? (
                                            <a
                                                href={`tel:${customer.phone}`}
                                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-blue-600 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50/50"
                                            >
                                                <Phone size={16} /> Κλήση
                                            </a>
                                        ) : null}
                                        {customer.email ? (
                                            <a
                                                href={`mailto:${customer.email}`}
                                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-blue-600 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50/50"
                                            >
                                                <Mail size={16} /> Email
                                            </a>
                                        ) : null}
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab('contact')}
                                            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50/40"
                                        >
                                            Επικοινωνία
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab('billing')}
                                            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:border-amber-200 hover:bg-amber-50/50"
                                        >
                                            Τιμολόγηση
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab('notes')}
                                            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:border-violet-200 hover:bg-violet-50/50"
                                        >
                                            Σημειώσεις
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab('analytics')}
                                            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:border-indigo-200 hover:bg-indigo-50/40"
                                        >
                                            Ανάλυση
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab('orders')}
                                            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50/40"
                                        >
                                            Όλες οι παραγγελίες
                                        </button>
                                    </div>
                                </div>

                                <div className={`${sectionCard} p-5`}>
                                    <div className="mb-3 flex items-center justify-between">
                                        <h3 className="text-sm font-bold text-slate-800">Πρόσφατες παραγγελίες</h3>
                                        {stats.orderCount > 3 && (
                                            <button
                                                type="button"
                                                onClick={() => setActiveTab('orders')}
                                                className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800"
                                            >
                                                Όλες <ArrowRight size={12} />
                                            </button>
                                        )}
                                    </div>
                                    {stats.history.length > 0 ? (
                                        <div className="space-y-2">
                                            {stats.history.slice(0, 3).map(o => {
                                                const netValue = o.total_price / (1 + (o.vat_rate || 0.24));
                                                return (
                                                    <div
                                                        key={o.id}
                                                        className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                                                    >
                                                        <div className="min-w-0 space-y-1">
                                                            <OrderIdRow
                                                                orderId={o.id}
                                                                copied={copiedOrderId === o.id}
                                                                onCopy={() => copyOrderId(o.id)}
                                                                compact
                                                            />
                                                            <span className="text-xs text-slate-400">
                                                                {new Date(o.created_at).toLocaleDateString('el-GR')} ·{' '}
                                                                {o.items.length} είδη
                                                            </span>
                                                        </div>
                                                        <span className="font-mono text-sm font-black text-slate-800">
                                                            {formatCurrency(netValue)}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <p className="py-6 text-center text-sm text-slate-400">Δεν υπάρχουν παραγγελίες.</p>
                                    )}
                                </div>
                            </div>
                        ))}

                    {!isRetailSystemCustomer && activeTab === 'contact' && customer.id && (
                        <div className="mx-auto max-w-3xl space-y-4">
                            <p className="text-sm text-slate-500">
                                Τηλέφωνο, email και διεύθυνση χρησιμοποιούνται σε παραγγελίες και εκτυπώσεις.
                            </p>
                            <div className={`${sectionCard} space-y-4 p-5`}>
                                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
                                    <User size={16} className="text-blue-500" /> Επικοινωνία
                                </h3>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div>
                                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                            Τηλέφωνο
                                        </label>
                                        {isEditing ? (
                                            <input
                                                type="tel"
                                                className={inputClass}
                                                value={editForm.phone || ''}
                                                onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                                                placeholder="Τηλέφωνο"
                                            />
                                        ) : (
                                            <a
                                                href={customer.phone ? `tel:${customer.phone}` : undefined}
                                                className={`flex items-center gap-2 text-sm font-bold ${customer.phone ? 'text-blue-600 hover:underline' : 'text-slate-400'}`}
                                            >
                                                <Phone size={14} className="shrink-0" />
                                                {customer.phone || '—'}
                                            </a>
                                        )}
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                            Email
                                        </label>
                                        {isEditing ? (
                                            <input
                                                type="email"
                                                className={inputClass}
                                                value={editForm.email || ''}
                                                onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                                                placeholder="Email"
                                            />
                                        ) : (
                                            <a
                                                href={customer.email ? `mailto:${customer.email}` : undefined}
                                                className={`flex items-center gap-2 break-all text-sm font-bold ${customer.email ? 'text-blue-600 hover:underline' : 'text-slate-400'}`}
                                            >
                                                <Mail size={14} className="shrink-0" />
                                                {customer.email || '—'}
                                            </a>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                        Διεύθυνση
                                    </label>
                                    {isEditing ? (
                                        <div className="relative">
                                            <MapPin
                                                size={16}
                                                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-300"
                                            />
                                            <input
                                                className={`${inputClass} pl-10`}
                                                value={editForm.address || ''}
                                                onChange={e => setEditForm({ ...editForm, address: e.target.value })}
                                                placeholder="Διεύθυνση"
                                            />
                                        </div>
                                    ) : (
                                        <p className="flex items-start gap-2 text-sm font-medium text-slate-700">
                                            <MapPin size={16} className="mt-0.5 shrink-0 text-slate-400" />
                                            {customer.address || '—'}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {!isRetailSystemCustomer && activeTab === 'billing' && customer.id && (
                        <div className="mx-auto max-w-3xl space-y-4">
                            <p className="text-sm text-slate-500">
                                ΑΦΜ και ΦΠΑ για τιμολόγηση. Χρησιμοποιήστε αναζήτηση ΑΦΜ για αυτόματη συμπλήρωση.
                            </p>
                            <div className={`${sectionCard} space-y-4 p-5`}>
                                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
                                    <Receipt size={16} className="text-amber-500" /> Τιμολόγηση
                                </h3>
                                {!isEditing && (
                                    <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">ΑΦΜ</div>
                                        <div className="mt-1 font-mono text-sm font-bold text-slate-800">{customer.vat_number || '—'}</div>
                                    </div>
                                )}
                                {isEditing && (
                                    <div>
                                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                            Αυτόματη συμπλήρωση ΑΦΜ
                                        </label>
                                        <div className="flex gap-2">
                                            <input
                                                className={`${inputClass} flex-1 font-mono`}
                                                placeholder="9 ψηφία"
                                                value={editForm.vat_number || ''}
                                                onChange={e =>
                                                    setEditForm({
                                                        ...editForm,
                                                        vat_number: e.target.value.replace(/\D/g, '').slice(0, 9),
                                                    })
                                                }
                                            />
                                            <button
                                                type="button"
                                                onClick={handleAfmLookup}
                                                disabled={isSearchingAfm}
                                                className="shrink-0 rounded-xl bg-[#060b00] px-4 py-3 text-white shadow-sm transition-colors hover:bg-black disabled:opacity-50"
                                            >
                                                {isSearchingAfm ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                                            </button>
                                        </div>
                                    </div>
                                )}
                                <div>
                                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                        Καθεστώς ΦΠΑ
                                    </label>
                                    {isEditing ? (
                                        <select
                                            className={`${inputClass} cursor-pointer font-bold`}
                                            value={editForm.vat_rate ?? VatRegime.Standard}
                                            onChange={e => setEditForm({ ...editForm, vat_rate: parseFloat(e.target.value) })}
                                        >
                                            <option value={VatRegime.Standard}>24% (Κανονικό)</option>
                                            <option value={VatRegime.Reduced}>17% (Μειωμένο)</option>
                                            <option value={VatRegime.Zero}>0% (Μηδενικό)</option>
                                        </select>
                                    ) : (
                                        <div className="inline-block rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-600">
                                            {((customer.vat_rate || 0.24) * 100).toFixed(0)}% ΦΠΑ
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {!isRetailSystemCustomer && activeTab === 'notes' && customer.id && (
                        <div className="mx-auto max-w-3xl space-y-4">
                            <p className="text-sm text-slate-500">Εσωτερικές σημειώσεις — ορατές μόνο στην εφαρμογή.</p>
                            <div className={`${sectionCard} p-5`}>
                                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
                                    <StickyNote size={16} className="text-violet-500" /> Σημειώσεις
                                </h3>
                                {isEditing ? (
                                    <textarea
                                        className={`${inputClass} min-h-[160px] resize-y`}
                                        placeholder="Εσωτερικές σημειώσεις..."
                                        value={editForm.notes || ''}
                                        onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                                    />
                                ) : (
                                    <p className="min-h-[120px] whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm leading-relaxed text-slate-600">
                                        {customer.notes || 'Καμία σημείωση.'}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {isRetailSystemCustomer && activeTab === 'end_clients' && customer.id && (
                        <div className="mx-auto max-w-3xl">
                            <p className="mb-4 text-sm text-slate-500">
                                Κατάταξη τελικών πελατών από τις σημειώσεις λιανικής στις παραγγελίες.
                            </p>
                            <div className={`${sectionCard} p-6`}>
                                <h3 className="mb-5 flex items-center gap-2 text-sm font-bold text-slate-800">
                                    <UsersIcon size={16} className="text-indigo-500" /> Κορυφαίοι τελικοί πελάτες
                                </h3>
                                {retailClientStats.length > 0 ? (
                                    <div className="space-y-3">
                                        {retailClientStats.map((client, index) => {
                                            const maxRevenue = retailClientStats[0]?.totalRevenue || 1;
                                            const barWidth = (client.totalRevenue / maxRevenue) * 100;
                                            const isUnlabeled = client.name === 'Χωρίς τελικό πελάτη';
                                            return (
                                                <div key={client.name} className="flex items-center gap-4">
                                                    <div
                                                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs font-black ${
                                                            index === 0
                                                                ? 'border-indigo-200 bg-indigo-50 text-indigo-600'
                                                                : 'border-slate-100 bg-slate-50 text-slate-500'
                                                        }`}
                                                    >
                                                        {index + 1}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="mb-1 flex items-center justify-between">
                                                            <span
                                                                className={`truncate text-sm font-bold ${isUnlabeled ? 'italic text-slate-400' : 'text-slate-700'}`}
                                                            >
                                                                {client.name}
                                                            </span>
                                                            <div className="ml-3 flex shrink-0 items-center gap-3 text-right">
                                                                <span className="text-[10px] font-bold text-slate-400">
                                                                    {client.orderCount} παρ.
                                                                </span>
                                                                <span className="font-mono text-sm font-black text-slate-800">
                                                                    {formatCurrency(client.totalRevenue)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                                                            <div
                                                                className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-purple-500 transition-all duration-700"
                                                                style={{ width: `${barWidth}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center py-8 text-slate-400">
                                        <UsersIcon size={40} className="mb-3 opacity-20" />
                                        <p className="text-sm font-medium">Δεν υπάρχουν δεδομένα τελικών πελατών.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {isRetailSystemCustomer && activeTab === 'categories' && customer.id && (
                        <div className="mx-auto max-w-3xl">
                            <p className="mb-4 text-sm text-slate-500">Κατανομή τεμαχίων και αξίας ανά κατηγορία προϊόντος.</p>
                            <div className={`${sectionCard} p-6`}>
                                <h3 className="mb-5 flex items-center gap-2 text-sm font-bold text-slate-800">
                                    <Trophy size={16} className="text-amber-500" /> Κορυφαίες κατηγορίες
                                </h3>
                                <div className="space-y-4">
                                    {stats.prefData.length > 0 ? (
                                        stats.prefData.map((item, index) => (
                                            <div key={item.name} className="flex items-center gap-4">
                                                <div
                                                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-sm font-black shadow-sm ${
                                                        index === 0
                                                            ? 'border-amber-200 bg-amber-50 text-amber-600'
                                                            : index === 1
                                                              ? 'border-slate-100 bg-slate-50 text-slate-600'
                                                              : index === 2
                                                                ? 'border-orange-100 bg-orange-50 text-orange-600'
                                                                : 'border-slate-100 bg-white text-slate-400'
                                                    }`}
                                                >
                                                    {index + 1}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="mb-1.5 flex items-end justify-between">
                                                        <span className="font-bold text-slate-700">{item.name}</span>
                                                        <div className="flex flex-col items-end text-right">
                                                            <span className="font-mono text-sm font-black text-slate-800">
                                                                {formatCurrency(item.value)}
                                                            </span>
                                                            <span className="text-[10px] font-bold text-slate-500">{item.count} τεμάχια</span>
                                                        </div>
                                                    </div>
                                                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                                                        <div
                                                            className="h-full rounded-full bg-gradient-to-r from-blue-400 to-indigo-500 transition-all duration-700"
                                                            style={{ width: `${item.percentage}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="flex flex-col items-center py-10 text-slate-400">
                                            <PieChart size={48} className="mb-3 opacity-20" />
                                            <p className="font-medium">Δεν υπάρχουν δεδομένα αγορών.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'analytics' && !isRetailSystemCustomer && customer.id && (
                        <div className="max-w-5xl space-y-5">
                            <p className="text-sm text-slate-500">
                                Προτιμήσεις βάσει ιστορικού παραγγελιών (ποσότητες τεμαχίων ανά κατηγορία).
                            </p>
                            <div className={`${sectionCard} p-6`}>
                                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-5">
                                    <Trophy size={16} className="text-amber-500" /> Αγαπημένες κατηγορίες
                                </h3>
                                <div className="space-y-4">
                                    {stats.prefData.length > 0 ? (
                                        stats.prefData.map((item, index) => (
                                            <div key={item.name} className="flex items-center gap-4">
                                                <div
                                                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shadow-sm shrink-0 border ${
                                                        index === 0
                                                            ? 'bg-amber-50 text-amber-600 border-amber-200'
                                                            : index === 1
                                                              ? 'bg-slate-50 text-slate-600 border-slate-100'
                                                              : index === 2
                                                                ? 'bg-orange-50 text-orange-600 border-orange-100'
                                                                : 'bg-white text-slate-400 border-slate-100'
                                                    }`}
                                                >
                                                    {index + 1}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-end mb-1.5">
                                                        <span className="font-bold text-slate-700">{item.name}</span>
                                                        <div className="text-right flex flex-col items-end">
                                                            <span className="font-mono font-black text-slate-800 text-sm">
                                                                {formatCurrency(item.value)}
                                                            </span>
                                                            <span className="text-[10px] font-bold text-slate-500">
                                                                {item.count} τεμάχια
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full rounded-full bg-gradient-to-r from-blue-400 to-indigo-500 transition-all duration-700"
                                                            style={{ width: `${item.percentage}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="flex flex-col items-center justify-center text-slate-400 py-10">
                                            <PieChart size={48} className="opacity-20 mb-3" />
                                            <p className="font-medium">Δεν υπάρχουν δεδομένα αγορών.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'orders' && customer.id && (
                        <div className="max-w-5xl space-y-4">
                            <div className={`${sectionCard} p-4`}>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="search"
                                        value={orderQuery}
                                        onChange={e => setOrderQuery(e.target.value)}
                                        placeholder={
                                            isRetailSystemCustomer
                                                ? 'Αναζήτηση: κωδικός παραγγελίας, ημερομηνία, όνομα τελικού πελάτη…'
                                                : 'Αναζήτηση: κωδικός παραγγελίας ή ημερομηνία…'
                                        }
                                        className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm font-medium text-slate-800 outline-none transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15"
                                    />
                                </div>
                                <p className="mt-2 text-xs text-slate-500">
                                    {filteredOrders.length === stats.history.length
                                        ? `${stats.history.length} παραγγελίες`
                                        : `${filteredOrders.length} από ${stats.history.length} παραγγελίες`}
                                </p>
                            </div>
                            {filteredOrders.map(o => {
                                const netValue = o.total_price / (1 + (o.vat_rate || 0.24));
                                const gross = o.total_price;
                                const retailLabel = isRetailSystemCustomer
                                    ? extractRetailClientFromNotes(o.notes).retailClientLabel
                                    : '';
                                return (
                                    <div
                                        key={o.id}
                                        className={`${sectionCard} flex flex-col gap-4 p-4 transition-colors hover:border-blue-200/80 sm:p-5 lg:flex-row lg:items-center`}
                                    >
                                        <div
                                            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border shadow-sm sm:h-14 sm:w-14 ${getOrderStatusClasses(o.status)}`}
                                        >
                                            {o.status === OrderStatus.Delivered ? (
                                                <Wallet size={22} />
                                            ) : (
                                                <Calendar size={22} />
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1 space-y-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <OrderIdRow
                                                    orderId={o.id}
                                                    copied={copiedOrderId === o.id}
                                                    onCopy={() => copyOrderId(o.id)}
                                                />
                                                <span
                                                    className={`rounded-lg border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${getOrderStatusClasses(o.status)}`}
                                                >
                                                    {getOrderStatusLabel(o.status)}
                                                </span>
                                            </div>
                                            {isRetailSystemCustomer && (
                                                <div>
                                                    {retailLabel ? (
                                                        <span className={retailEndClientPillClass}>{retailLabel}</span>
                                                    ) : (
                                                        <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-400">
                                                            Χωρίς τελικό πελάτη
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold text-slate-500">
                                                <span className="flex items-center gap-1">
                                                    <Calendar size={12} />{' '}
                                                    {new Date(o.created_at).toLocaleDateString('el-GR')}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <ShoppingBag size={12} /> {o.items.length} είδη
                                                </span>
                                                <span className="font-mono text-slate-400">Με ΦΠΑ: {formatCurrency(gross)}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 justify-between lg:justify-end w-full lg:w-auto shrink-0 border-t lg:border-t-0 border-slate-100 pt-3 lg:pt-0">
                                            <div className="text-left lg:text-right px-1 lg:px-4 lg:border-l border-slate-200">
                                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                                    Καθαρή αξία
                                                </div>
                                                <div className="font-black text-lg text-slate-800">{formatCurrency(netValue)}</div>
                                            </div>
                                            {onPrintOrder && (
                                                <button
                                                    type="button"
                                                    onClick={() => onPrintOrder(o)}
                                                    className="p-3 text-slate-500 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors shadow-sm"
                                                    title="Εκτύπωση"
                                                >
                                                    <Printer size={18} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            {stats.history.length > 0 && filteredOrders.length === 0 && (
                                <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50/50 py-10 text-center text-sm font-medium text-amber-900">
                                    Κανένα αποτέλεσμα για «{orderQuery}». Δοκιμάστε άλλο κείμενο.
                                </div>
                            )}
                            {stats.history.length === 0 && (
                                <div className="rounded-2xl border border-dashed border-slate-200 bg-white/50 py-16 text-center font-medium text-slate-400">
                                    <Calendar size={48} className="mx-auto mb-4 opacity-20" />
                                    Δεν υπάρχουν παραγγελίες.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
