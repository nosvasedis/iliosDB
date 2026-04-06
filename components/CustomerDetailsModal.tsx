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
    TrendingUp,
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
    Sparkles,
    User,
} from 'lucide-react';
import { api, RETAIL_CUSTOMER_ID, RETAIL_CUSTOMER_NAME } from '../lib/supabase';
import { useUI } from './UIProvider';
import { formatCurrency } from '../utils/pricingEngine';
import { extractRetailClientFromNotes } from '../utils/retailNotes';
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

    const [activeTab, setActiveTab] = useState<'info' | 'insights' | 'orders'>('info');

    useEffect(() => {
        setEditForm(customer);
        setIsEditing(false);
        setActiveTab('info');
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
        let statusColor = 'bg-emerald-500/20 text-emerald-100 border-emerald-400/30';
        if (latestOrder) {
            const monthsSince =
                (new Date().getTime() - new Date(latestOrder.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30);
            if (monthsSince > 6) {
                statusMarker = 'Ανενεργός';
                statusColor = 'bg-red-500/20 text-red-100 border-red-400/30';
            } else if (monthsSince > 3) {
                statusMarker = 'Σε κίνδυνο';
                statusColor = 'bg-amber-500/20 text-amber-100 border-amber-400/30';
            }
        } else {
            statusMarker = 'Νέος';
            statusColor = 'bg-sky-500/20 text-sky-100 border-sky-400/30';
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

    const tabDefs = isRetailSystemCustomer
        ? [
              { id: 'info' as const, label: 'Επισκόπηση' },
              { id: 'orders' as const, label: `Παραγγελίες (${stats.orderCount})` },
          ]
        : [
              { id: 'info' as const, label: 'Πληροφορίες' },
              { id: 'insights' as const, label: 'Ανάλυση' },
              { id: 'orders' as const, label: `Παραγγελίες (${stats.orderCount})` },
          ];

    /** Λιανική is a bucket for many real clients — no single identity, nameday, or "VIP" person. */
    const nextNameday =
        !isRetailSystemCustomer && customer.full_name && customer.full_name !== RETAIL_CUSTOMER_NAME
            ? getNextNamedayForName(customer.full_name)
            : null;

    return (
        <div className="fixed inset-0 z-[100] bg-slate-950/65 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 lg:p-10 animate-in fade-in duration-200">
            <div
                className="bg-slate-50 w-full max-w-6xl max-h-[92vh] rounded-[1.75rem] shadow-2xl border border-slate-200/80 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
                role="dialog"
                aria-labelledby="customer-modal-title"
            >
                {/* Hero */}
                <div className="relative shrink-0 bg-gradient-to-br from-[#060b00] via-slate-900 to-slate-800 px-5 sm:px-8 pt-6 pb-6 overflow-hidden">
                    <div className="absolute inset-0 opacity-35">
                        <div className="absolute -top-24 -right-20 w-80 h-80 rounded-full bg-emerald-500/25 blur-3xl" />
                        <div className="absolute -bottom-16 -left-16 w-64 h-64 rounded-full bg-blue-500/20 blur-3xl" />
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="absolute top-5 right-5 p-2 rounded-xl bg-white/10 hover:bg-white/15 text-white/80 hover:text-white transition-colors z-10"
                        aria-label="Κλείσιμο"
                    >
                        <X size={20} />
                    </button>

                    <div className="relative flex flex-col sm:flex-row sm:items-start gap-5 pr-10">
                        <div className="w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem] rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg shadow-black/30 shrink-0 ring-2 ring-white/15">
                            <span className="text-white text-2xl sm:text-3xl font-black">
                                {customer.full_name ? customer.full_name.charAt(0).toUpperCase() : '?'}
                            </span>
                        </div>
                        <div className="min-w-0 flex-1">
                            {isEditing ? (
                                <input
                                    id="customer-modal-title"
                                    className="text-2xl sm:text-3xl font-black text-white bg-white/10 border border-white/20 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-white/30 w-full max-w-xl placeholder:text-white/40"
                                    value={editForm.full_name}
                                    onChange={e => setEditForm({ ...editForm, full_name: e.target.value })}
                                    placeholder="Ονοματεπώνυμο..."
                                    autoFocus
                                />
                            ) : (
                                <h2
                                    id="customer-modal-title"
                                    className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight"
                                >
                                    {customer.full_name}
                                </h2>
                            )}

                            <div className="flex flex-wrap items-center gap-2 mt-3">
                                {isRetailSystemCustomer && (
                                    <span className="text-[10px] font-black uppercase tracking-widest bg-fuchsia-500/25 text-fuchsia-100 border border-fuchsia-400/40 px-2.5 py-1 rounded-full">
                                        Συστημικός πελάτης
                                    </span>
                                )}
                                {stats.totalSpent > 1000 && !isRetailSystemCustomer && (
                                    <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest bg-amber-500/25 text-amber-100 border border-amber-400/35 px-2.5 py-1 rounded-full">
                                        <Trophy size={10} /> VIP
                                    </span>
                                )}
                                {nextNameday && (
                                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold bg-sky-500/20 text-sky-100 border border-sky-400/35 px-2.5 py-1 rounded-full">
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
                                        className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${stats.statusColor}`}
                                    >
                                        {stats.statusMarker}
                                    </span>
                                )}
                            </div>

                            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-white/70">
                                {isRetailSystemCustomer ? (
                                    <p className="text-xs sm:text-sm text-white/65 leading-relaxed max-w-2xl border border-white/15 bg-white/5 rounded-xl px-3 py-2.5">
                                        <span className="font-bold text-white/90">Δεν είναι ένας πελάτης με σταθερά στοιχεία.</span>{' '}
                                        Η «Λιανική» είναι συλλογικός λογαριασμός για πολλούς διαφορετικούς τελικούς πελάτες· το ΑΦΜ, η διεύθυνση
                                        και τα στοιχεία επικοινωνίας του καθενός καταγράφονται στις αντίστοιχες παραγγελίες (ή στις σημειώσεις
                                        λιανικής), όχι εδώ.
                                    </p>
                                ) : isEditing ? (
                                    <>
                                        <input
                                            className="bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-xs font-mono text-white w-36 outline-none focus:ring-2 focus:ring-white/25"
                                            value={editForm.vat_number || ''}
                                            onChange={e =>
                                                setEditForm({
                                                    ...editForm,
                                                    vat_number: e.target.value.replace(/\D/g, '').slice(0, 9),
                                                })
                                            }
                                            placeholder="ΑΦΜ"
                                        />
                                        <span className="flex items-center gap-1.5 min-w-0 flex-1 basis-full sm:basis-auto">
                                            <MapPin size={14} className="shrink-0 text-white/50" />
                                            <input
                                                className="flex-1 min-w-0 bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-xs text-white outline-none focus:ring-2 focus:ring-white/25"
                                                value={editForm.address || ''}
                                                onChange={e => setEditForm({ ...editForm, address: e.target.value })}
                                                placeholder="Διεύθυνση"
                                            />
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <span className="font-mono text-xs font-bold text-white/90 bg-white/10 px-2 py-1 rounded-lg border border-white/10">
                                            ΑΦΜ: {customer.vat_number || '—'}
                                        </span>
                                        <span className="flex items-center gap-1.5 max-w-full">
                                            <MapPin size={14} className="shrink-0 text-white/50" />
                                            <span className="truncate">{customer.address || 'Χωρίς διεύθυνση'}</span>
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Toolbar */}
                    <div className="relative mt-5 flex flex-wrap items-center gap-2 justify-end">
                        {isEditing ? (
                            <>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditForm(customer);
                                        setIsEditing(false);
                                    }}
                                    className="px-4 py-2.5 rounded-xl font-bold text-sm bg-white/10 border border-white/20 text-white hover:bg-white/15 transition-colors"
                                >
                                    Άκυρο
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="px-5 py-2.5 rounded-xl font-bold text-sm bg-white text-slate-900 hover:bg-white/95 shadow-lg flex items-center gap-2 disabled:opacity-60"
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
                                            className="px-4 py-2.5 rounded-xl font-bold text-sm bg-white/10 border border-white/20 text-white hover:bg-white/15 transition-colors flex items-center gap-2"
                                        >
                                            <Sparkles size={15} />
                                            Επεξεργασία
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => onDelete(customer.id)}
                                            className="p-2.5 rounded-xl text-white/70 hover:text-red-200 bg-white/10 border border-white/20 hover:border-red-400/40 hover:bg-red-500/20 transition-colors"
                                            aria-label="Διαγραφή πελάτη"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </>
                                ) : (
                                    <span className="text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl border border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-100">
                                        Μόνο ανάγνωση
                                    </span>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {customer.id && (
                    <div className="shrink-0 px-3 sm:px-5 pt-3 pb-0 bg-slate-100/80 border-b border-slate-200/80">
                        <div className="flex gap-1 p-1 rounded-xl bg-slate-200/50 max-w-2xl">
                            {tabDefs.map(tab => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex-1 py-2.5 px-3 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
                                        activeTab === tab.id
                                            ? 'bg-white text-slate-900 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 md:p-8 bg-slate-100/40 custom-scrollbar">
                    {(!customer.id || activeTab === 'info') &&
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

                                <div className={`${sectionCard} p-6`}>
                                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-5">
                                        <Trophy size={16} className="text-amber-500" /> Κορυφαίες κατηγορίες
                                    </h3>
                                    <div className="space-y-4">
                                        {stats.prefData.length > 0 ? (
                                            stats.prefData.map((item, index) => (
                                                <div key={item.name} className="flex items-center gap-4 group">
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

                                <div className={`${sectionCard} p-6`}>
                                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-5">
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
                                                            className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs shrink-0 border ${
                                                                index === 0
                                                                    ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
                                                                    : 'bg-slate-50 text-slate-500 border-slate-100'
                                                            }`}
                                                        >
                                                            {index + 1}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex justify-between items-center mb-1">
                                                                <span
                                                                    className={`font-bold text-sm truncate ${
                                                                        isUnlabeled ? 'text-slate-400 italic' : 'text-slate-700'
                                                                    }`}
                                                                >
                                                                    {client.name}
                                                                </span>
                                                                <div className="text-right flex items-center gap-3 shrink-0 ml-3">
                                                                    <span className="text-[10px] font-bold text-slate-400">
                                                                        {client.orderCount} παρ.
                                                                    </span>
                                                                    <span className="font-mono font-black text-slate-800 text-sm">
                                                                        {formatCurrency(client.totalRevenue)}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
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
                                        <div className="flex flex-col items-center justify-center text-slate-400 py-8">
                                            <UsersIcon size={40} className="opacity-20 mb-3" />
                                            <p className="font-medium text-sm">Δεν υπάρχουν δεδομένα τελικών πελατών.</p>
                                        </div>
                                    )}
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
                                                            className={`text-[11px] font-semibold px-2 py-1 rounded-full truncate max-w-full sm:max-w-[200px] border ${
                                                                hasLabel
                                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                                    : 'bg-slate-100 text-slate-400 border-slate-200'
                                                            }`}
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
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-5xl mx-auto lg:mx-0">
                                <div className={`${sectionCard} p-5 space-y-4`}>
                                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                                        <User size={16} className="text-blue-500" /> Επικοινωνία
                                    </h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1 block">
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
                                                    className={`font-bold text-sm flex items-center gap-2 ${customer.phone ? 'text-blue-600 hover:underline' : 'text-slate-400'}`}
                                                >
                                                    <Phone size={14} className="shrink-0" />
                                                    {customer.phone || '—'}
                                                </a>
                                            )}
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1 block">
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
                                                    className={`font-bold text-sm flex items-center gap-2 break-all ${customer.email ? 'text-blue-600 hover:underline' : 'text-slate-400'}`}
                                                >
                                                    <Mail size={14} className="shrink-0" />
                                                    {customer.email || '—'}
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1 block">
                                            Διεύθυνση
                                        </label>
                                        {isEditing ? (
                                            <div className="relative">
                                                <MapPin
                                                    size={16}
                                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none"
                                                />
                                                <input
                                                    className={`${inputClass} pl-10`}
                                                    value={editForm.address || ''}
                                                    onChange={e => setEditForm({ ...editForm, address: e.target.value })}
                                                    placeholder="Διεύθυνση"
                                                />
                                            </div>
                                        ) : (
                                            <p className="text-sm font-medium text-slate-700 flex items-start gap-2">
                                                <MapPin size={16} className="text-slate-400 shrink-0 mt-0.5" />
                                                {customer.address || '—'}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className={`${sectionCard} p-5 space-y-4 h-fit`}>
                                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                                        <FileText size={16} className="text-amber-500" /> Τιμολόγηση
                                    </h3>
                                    {isEditing && (
                                        <div>
                                            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1 block">
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
                                                    className="px-4 py-3 bg-slate-900 hover:bg-black text-white rounded-xl shadow-md transition-all shrink-0 disabled:opacity-50"
                                                >
                                                    {isSearchingAfm ? (
                                                        <Loader2 size={16} className="animate-spin" />
                                                    ) : (
                                                        <Zap size={16} />
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    <div>
                                        <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1 block">
                                            Καθεστώς ΦΠΑ
                                        </label>
                                        {isEditing ? (
                                            <select
                                                className={`${inputClass} font-bold cursor-pointer`}
                                                value={editForm.vat_rate ?? VatRegime.Standard}
                                                onChange={e =>
                                                    setEditForm({ ...editForm, vat_rate: parseFloat(e.target.value) })
                                                }
                                            >
                                                <option value={VatRegime.Standard}>24% (Κανονικό)</option>
                                                <option value={VatRegime.Reduced}>17% (Μειωμένο)</option>
                                                <option value={VatRegime.Zero}>0% (Μηδενικό)</option>
                                            </select>
                                        ) : (
                                            <div className="font-bold text-blue-600 text-sm bg-blue-50 px-3 py-2 rounded-xl inline-block border border-blue-100">
                                                {((customer.vat_rate || 0.24) * 100).toFixed(0)}% ΦΠΑ
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className={`${sectionCard} p-5 lg:col-span-2`}>
                                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-3">
                                        <FileText size={16} className="text-violet-500" /> Σημειώσεις
                                    </h3>
                                    {isEditing ? (
                                        <textarea
                                            className={`${inputClass} min-h-[120px] resize-y`}
                                            placeholder="Εσωτερικές σημειώσεις..."
                                            value={editForm.notes || ''}
                                            onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                                        />
                                    ) : (
                                        <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100 min-h-[100px]">
                                            {customer.notes || 'Καμία σημείωση.'}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}

                    {activeTab === 'insights' && customer.id && (
                        <div className="max-w-5xl space-y-5">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className={`${sectionCard} p-5 h-32 flex flex-col justify-center relative overflow-hidden`}>
                                    <div className="absolute -right-4 -bottom-4 p-3 opacity-[0.04] text-emerald-600">
                                        <TrendingUp size={100} />
                                    </div>
                                    <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                        <Wallet size={12} /> Συνολικός τζίρος
                                    </div>
                                    <div className="text-3xl font-black text-slate-800">{formatCurrency(stats.totalSpent)}</div>
                                </div>
                                <div className={`${sectionCard} p-5 h-32 flex flex-col justify-center relative overflow-hidden`}>
                                    <div className="absolute -right-4 -bottom-4 p-3 opacity-[0.04] text-blue-600">
                                        <ShoppingBag size={100} />
                                    </div>
                                    <div className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                        <Briefcase size={12} /> Παραγγελίες
                                    </div>
                                    <div className="text-3xl font-black text-slate-800">
                                        {stats.orderCount}{' '}
                                        <span className="text-sm font-medium text-slate-400">τεμ.</span>
                                    </div>
                                </div>
                                <div className={`${sectionCard} p-5 h-32 flex flex-col justify-center relative overflow-hidden`}>
                                    <div className="absolute -right-4 -bottom-4 p-3 opacity-[0.04] text-amber-600">
                                        <Calculator size={100} />
                                    </div>
                                    <div className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                        <PieChart size={12} /> Μέση αξία
                                    </div>
                                    <div className="text-3xl font-black text-slate-800">{formatCurrency(stats.avgOrderValue)}</div>
                                </div>
                            </div>

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
                        <div className="max-w-5xl space-y-3">
                            {stats.history.map(o => {
                                const netValue = o.total_price / (1 + (o.vat_rate || 0.24));
                                const gross = o.total_price;
                                return (
                                    <div
                                        key={o.id}
                                        className={`${sectionCard} p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center gap-4 hover:border-blue-200/80 transition-colors`}
                                    >
                                        <div
                                            className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center shadow-sm shrink-0 border ${getOrderStatusClasses(o.status)}`}
                                        >
                                            {o.status === OrderStatus.Delivered ? (
                                                <Wallet size={22} />
                                            ) : (
                                                <Calendar size={22} />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0 space-y-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <OrderIdRow
                                                    orderId={o.id}
                                                    copied={copiedOrderId === o.id}
                                                    onCopy={() => copyOrderId(o.id)}
                                                />
                                                <span
                                                    className={`text-[10px] font-black px-2 py-0.5 rounded-lg border uppercase tracking-wider ${getOrderStatusClasses(o.status)}`}
                                                >
                                                    {getOrderStatusLabel(o.status)}
                                                </span>
                                            </div>
                                            <div className="text-xs text-slate-500 font-bold flex flex-wrap items-center gap-x-4 gap-y-1">
                                                <span className="flex items-center gap-1">
                                                    <Calendar size={12} />{' '}
                                                    {new Date(o.created_at).toLocaleDateString('el-GR')}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <ShoppingBag size={12} /> {o.items.length} είδη
                                                </span>
                                                <span className="text-slate-400 font-mono">
                                                    Με ΦΠΑ: {formatCurrency(gross)}
                                                </span>
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
                            {stats.history.length === 0 && (
                                <div className="text-center text-slate-400 font-medium py-16 rounded-2xl border border-dashed border-slate-200 bg-white/50">
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
