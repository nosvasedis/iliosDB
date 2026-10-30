import { isInternalOrder } from '../../utils/orderCustomer';
import OrderCustomerName from '../orders/OrderCustomerName';
import { formatNumber } from '../../utils/numberFormat';

import React, { useMemo } from 'react';
import { OrderStatus } from '../../types';
import { CalendarRange, CheckCircle2, ChevronRight, Clock, Database, Factory, Plus, Search, ShoppingCart, TrendingUp, Warehouse } from 'lucide-react';
import { useOrdersList } from '../../hooks/api/useOrders';
import { useDeliveryNavBadge } from '../../hooks/api/useOrderDeliveryPlans';
import { useAuth } from '../AuthContext';
import { formatCurrency } from '../../utils/pricingEngine';
import { getOrderStatusClasses, getOrderStatusLabel } from '../../features/orders/statusPresentation';
import type { EmployeePage } from '../../surfaces/pageIds';

interface Props {
    onNavigate: (page: EmployeePage) => void;
    onCreateOrder: () => void;
}

const netValueOf = (o: { total_price: number; vat_rate?: number }) => o.total_price / (1 + (o.vat_rate ?? 0.24));

const StatTile = ({ icon: Icon, label, value, tone, onClick }: {
    icon: React.ElementType; label: string; value: string; tone: string; onClick: () => void;
}) => (
    <button
        type="button"
        onClick={onClick}
        className={`flex min-w-0 flex-col items-start rounded-2xl border p-3 text-left transition-colors active:scale-[0.98] lg:p-4 ${tone}`}
    >
        <span className="flex max-w-full items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide opacity-80 lg:text-[11px]">
            <Icon size={12} className="shrink-0" /> <span className="truncate">{label}</span>
        </span>
        <span className="mt-1 max-w-full truncate text-xl font-black tabular-nums lg:text-2xl">{value}</span>
    </button>
);

const ShortcutTile = ({ icon: Icon, label, description, iconTone, onClick }: {
    icon: React.ElementType; label: string; description: string; iconTone: string; onClick: () => void;
}) => (
    <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200/70 bg-white p-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-slate-300 active:scale-[0.99] lg:p-4"
    >
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconTone}`}><Icon size={19} /></span>
        <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-bold text-slate-900">{label}</span>
            <span className="block truncate text-[11px] font-medium text-slate-500">{description}</span>
        </span>
        <ChevronRight size={17} className="shrink-0 text-slate-300" />
    </button>
);

export default function EmployeeDashboard({ onNavigate, onCreateOrder }: Props) {
    const { profile } = useAuth();
    const { data: orders } = useOrdersList();
    const { badgeCount: deliveriesDue } = useDeliveryNavBadge();

    const stats = useMemo(() => {
        const today = new Date();
        const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
        let pending = 0, ready = 0, todaySales = 0, todayCount = 0;
        (orders || []).forEach((o) => {
            if (o.status === OrderStatus.Pending || o.status === OrderStatus.InProduction) pending += 1;
            else if (o.status === OrderStatus.Ready || o.status === OrderStatus.PartiallyDelivered) ready += 1;
            if (o.status !== OrderStatus.Cancelled && !isInternalOrder(o) && new Date(o.created_at).getTime() >= dayStart) {
                todaySales += netValueOf(o);
                todayCount += 1;
            }
        });
        return { pending, ready, todaySales, todayCount, recent: (orders || []).slice(0, 6), loaded: !!orders };
    }, [orders]);

    const firstName = (profile?.full_name || '').trim().split(/\s+/)[0];
    const greeting = new Date().getHours() < 12 ? 'Καλημέρα' : 'Καλησπέρα';
    const todayLabel = new Intl.DateTimeFormat('el-GR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

    return (
        <div className="h-full overflow-y-auto overscroll-contain custom-scrollbar">
            <div className="mx-auto w-full max-w-6xl space-y-3 p-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))] min-[400px]:space-y-4 min-[400px]:p-4 lg:space-y-5 lg:p-0">

                {/* ── Hero ─────────────────────────────────────────────────── */}
                <section className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-[#1c2812] via-[#0b1204] to-[#060b00] p-4 text-white shadow-lg shadow-[#060b00]/15 ring-1 ring-inset ring-white/10 min-[400px]:p-5 lg:p-7">
                    <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 -z-10 h-56 w-56 rounded-full bg-amber-400/15 blur-3xl" />
                    <div aria-hidden className="pointer-events-none absolute -bottom-24 left-1/3 -z-10 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
                    <div aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-emerald-400 via-teal-400 to-amber-300" />
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/90">Κατάστημα · {todayLabel}</p>
                            <h1 className="mt-1 truncate text-2xl font-black leading-tight lg:text-3xl">{greeting}{firstName ? `, ${firstName}` : ''}</h1>
                            <p className="mt-1 text-[12px] font-medium text-white/60 lg:text-sm">
                                {stats.loaded
                                    ? `Σήμερα: ${formatNumber(stats.todayCount)} ${stats.todayCount === 1 ? 'παραγγελία' : 'παραγγελίες'} · ${formatCurrency(stats.todaySales)} καθαρά`
                                    : 'Φόρτωση στοιχείων…'}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={onCreateOrder}
                            className="flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-amber-400 px-6 text-[15px] font-black text-[#060b00] shadow-[0_6px_20px_rgba(251,191,36,0.25)] transition-colors hover:bg-amber-300 active:scale-[0.98] lg:w-auto"
                        >
                            <Plus size={20} strokeWidth={2.75} /> Νέα παραγγελία
                        </button>
                    </div>
                </section>

                {/* ── Product search shortcut ──────────────────────────────── */}
                <button
                    type="button"
                    onClick={() => onNavigate('registry')}
                    className="flex h-12 w-full items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-4 text-left text-[14px] font-medium text-slate-400 shadow-sm active:scale-[0.99] lg:h-14"
                >
                    <Search size={17} className="shrink-0" />
                    <span className="flex-1 truncate">Αναζήτηση προϊόντος, τιμής ή διαθεσιμότητας…</span>
                    <ChevronRight size={17} className="shrink-0 text-slate-300" />
                </button>

                {/* ── Stats ────────────────────────────────────────────────── */}
                <section className="grid grid-cols-2 gap-2 min-[400px]:gap-2.5 lg:grid-cols-4 lg:gap-3">
                    <StatTile icon={TrendingUp} label="Πωλήσεις σήμερα" value={formatCurrency(stats.todaySales)} tone="border-emerald-100 bg-emerald-50 text-emerald-800" onClick={() => onNavigate('orders')} />
                    <StatTile icon={Clock} label="Εκκρεμείς" value={formatNumber(stats.pending)} tone="border-amber-100 bg-amber-50 text-amber-800" onClick={() => onNavigate('orders')} />
                    <StatTile icon={CheckCircle2} label="Έτοιμες" value={formatNumber(stats.ready)} tone="border-sky-100 bg-sky-50 text-sky-800" onClick={() => onNavigate('orders')} />
                    <StatTile icon={CalendarRange} label="Παραδόσεις" value={formatNumber(deliveriesDue || 0)} tone="border-slate-200 bg-white text-slate-800" onClick={() => onNavigate('deliveries')} />
                </section>

                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-5">
                    {/* ── Shortcuts ─────────────────────────────────────────── */}
                    <section className="space-y-2">
                        <h2 className="px-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Γρήγορη πρόσβαση</h2>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                            <ShortcutTile icon={Database} label="Προϊόντα & Τιμές" description="Λιανικές τιμές, απόθεμα, ετικέτες" iconTone="bg-violet-50 text-violet-600" onClick={() => onNavigate('registry')} />
                            <ShortcutTile icon={CalendarRange} label="Παραδόσεις" description="Ημερολόγιο & υπενθυμίσεις" iconTone="bg-sky-50 text-sky-600" onClick={() => onNavigate('deliveries')} />
                            <ShortcutTile icon={Factory} label="Ροή Παραγωγής" description="Συναρμολόγηση, συσκευασία, έτοιμα" iconTone="bg-pink-50 text-pink-600" onClick={() => onNavigate('production')} />
                            <ShortcutTile icon={Warehouse} label="Αποθήκη" description="Υπόλοιπα & κινήσεις" iconTone="bg-teal-50 text-teal-600" onClick={() => onNavigate('inventory')} />
                        </div>
                    </section>

                    {/* ── Recent orders ─────────────────────────────────────── */}
                    <section className="space-y-2">
                        <div className="flex items-center justify-between px-1">
                            <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Πρόσφατες παραγγελίες</h2>
                            <button type="button" onClick={() => onNavigate('orders')} className="text-[11px] font-bold text-slate-600 hover:text-[#060b00]">Όλες</button>
                        </div>
                        <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                            {stats.recent.length === 0 ? (
                                <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-slate-400">
                                    <ShoppingCart size={26} className="opacity-30" />
                                    <p className="text-xs font-bold">{stats.loaded ? 'Καμία παραγγελία.' : 'Φόρτωση…'}</p>
                                </div>
                            ) : stats.recent.map((order) => (
                                <button
                                    key={order.id}
                                    type="button"
                                    onClick={() => onNavigate('orders')}
                                    className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-left last:border-b-0 hover:bg-slate-50 lg:px-4"
                                >
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[13px] font-bold text-slate-900"><OrderCustomerName order={order} /></span>
                                        <span className="block truncate text-[11px] font-medium text-slate-400">
                                            {new Date(order.created_at).toLocaleDateString('el-GR')}{order.seller_name ? ` · ${order.seller_name}` : ''}
                                        </span>
                                    </span>
                                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${getOrderStatusClasses(order.status, 'employeeDashboard')}`}>
                                        {getOrderStatusLabel(order.status)}
                                    </span>
                                    <span className="w-20 shrink-0 text-right text-[13px] font-bold tabular-nums text-slate-800">{formatCurrency(netValueOf(order))}</span>
                                </button>
                            ))}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
