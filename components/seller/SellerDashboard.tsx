import React, { useMemo } from 'react';
import { useAuth } from '../AuthContext';
import { Plus, BookOpen, FolderKanban, ShoppingCart, Users, ChevronRight, Search, Clock, CheckCircle2, Factory, Wallet } from 'lucide-react';
import { OrderStatus } from '../../types';
import { useOrdersList } from '../../hooks/api/useOrders';
import { formatNumber } from '../../utils/numberFormat';
import { formatCurrency } from '../../utils/pricingEngine';
import OrderCustomerName from '../orders/OrderCustomerName';
import { getOrderStatusClasses, getOrderStatusLabel } from '../../features/orders/statusPresentation';
import { isSellerOrder } from './sellerOrderScope';
import type { SellerPage } from '../../surfaces/pageIds';

interface Props {
    onNavigate: (page: SellerPage) => void;
    onCreateOrder: () => void;
}

function getGreeting() {
    return new Date().getHours() < 12 ? 'Καλημέρα' : 'Καλησπέρα';
}

const StatTile = ({ icon: Icon, label, value, tone, onClick }: {
    icon: React.ElementType; label: string; value: string; tone: string; onClick: () => void;
}) => (
    <button
        type="button"
        onClick={onClick}
        className={`flex min-w-0 flex-col items-start rounded-2xl border p-3 text-left transition-colors active:scale-[0.98] lg:p-4 ${tone}`}
    >
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide opacity-80 lg:text-[11px]">
            <Icon size={12} /> <span className="truncate">{label}</span>
        </span>
        <span className="mt-1 truncate text-xl font-black tabular-nums lg:text-2xl">{value}</span>
    </button>
);

const ShortcutRow = ({ icon: Icon, label, description, iconTone, onClick }: {
    icon: React.ElementType; label: string; description: string; iconTone: string; onClick: () => void;
}) => (
    <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-2xl border border-slate-200/70 bg-white p-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-slate-300 active:scale-[0.99] lg:p-4"
    >
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconTone}`}><Icon size={19} /></span>
        <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-bold text-slate-900">{label}</span>
            <span className="block truncate text-[11px] font-medium text-slate-500">{description}</span>
        </span>
        <ChevronRight size={17} className="shrink-0 text-slate-300" />
    </button>
);

export default function SellerDashboard({ onNavigate, onCreateOrder }: Props) {
    const { user, profile } = useAuth();
    const { data: orders } = useOrdersList();

    const sellerId = profile?.id ?? user?.id;
    const sellerEmail = user?.email ?? '';
    const sellerFullName = profile?.full_name ?? '';

    const stats = useMemo(() => {
        const mine = (orders || []).filter((o) => isSellerOrder(o, { id: sellerId, email: sellerEmail, fullName: sellerFullName }));
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        let pending = 0, production = 0, ready = 0, monthNet = 0;
        mine.forEach((o) => {
            if (o.status === OrderStatus.Pending) pending += 1;
            else if (o.status === OrderStatus.InProduction) production += 1;
            else if (o.status === OrderStatus.Ready || o.status === OrderStatus.PartiallyDelivered) ready += 1;
            if (o.status !== OrderStatus.Cancelled && new Date(o.created_at).getTime() >= monthStart) {
                monthNet += o.total_price / (1 + (o.vat_rate !== undefined ? o.vat_rate : 0.24));
            }
        });
        return { pending, production, ready, monthNet, recent: mine.slice(0, 5), loaded: !!orders };
    }, [orders, sellerId, sellerEmail, sellerFullName]);

    const firstName = (profile?.full_name || '').trim().split(/\s+/)[0] || 'Πλασιέ';
    const monthLabel = new Intl.DateTimeFormat('el-GR', { month: 'long' }).format(new Date());

    return (
        <div className="h-full overflow-y-auto overscroll-contain custom-scrollbar">
            <div className="mx-auto w-full max-w-5xl space-y-3 p-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))] min-[400px]:space-y-4 min-[400px]:p-4 lg:space-y-5 lg:p-0">

                {/* ── Hero ─────────────────────────────────────────────────── */}
                <section className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-[#1c2812] via-[#0b1204] to-[#060b00] p-4 text-white shadow-lg shadow-[#060b00]/15 ring-1 ring-inset ring-white/10 min-[400px]:p-5 lg:p-7">
                    <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 -z-10 h-56 w-56 rounded-full bg-amber-400/15 blur-3xl" />
                    <div aria-hidden className="pointer-events-none absolute -bottom-24 left-1/3 -z-10 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
                    <div aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-emerald-400 via-teal-400 to-amber-300" />
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/90">Χώρος πλασιέ</p>
                            <h1 className="mt-1 truncate text-2xl font-black leading-tight lg:text-3xl">{getGreeting()}, {firstName}</h1>
                            <p className="mt-1 text-[12px] font-medium text-white/60 lg:text-sm">
                                {stats.loaded
                                    ? `${monthLabel}: ${formatCurrency(stats.monthNet)} καθαρά σε παραγγελίες`
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

                {/* ── Catalogue search shortcut ────────────────────────────── */}
                <button
                    type="button"
                    onClick={() => onNavigate('catalog')}
                    className="flex h-12 w-full items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-4 text-left text-[14px] font-medium text-slate-400 shadow-sm active:scale-[0.99] lg:h-14"
                >
                    <Search size={17} className="shrink-0" />
                    <span className="flex-1 truncate">Αναζήτηση κωδικού στον κατάλογο…</span>
                    <ChevronRight size={17} className="shrink-0 text-slate-300" />
                </button>

                {/* ── Order stats ──────────────────────────────────────────── */}
                <section className="grid grid-cols-2 gap-2 min-[400px]:gap-2.5 lg:grid-cols-4 lg:gap-3">
                    <StatTile icon={Clock} label="Εκκρεμείς" value={formatNumber(stats.pending)} tone="border-amber-100 bg-amber-50 text-amber-800" onClick={() => onNavigate('orders')} />
                    <StatTile icon={Factory} label="Σε παραγωγή" value={formatNumber(stats.production)} tone="border-indigo-100 bg-indigo-50 text-indigo-800" onClick={() => onNavigate('orders')} />
                    <StatTile icon={CheckCircle2} label="Έτοιμες" value={formatNumber(stats.ready)} tone="border-emerald-100 bg-emerald-50 text-emerald-800" onClick={() => onNavigate('orders')} />
                    <StatTile icon={Wallet} label="Μήνας" value={formatCurrency(stats.monthNet)} tone="border-slate-200 bg-white text-slate-800" onClick={() => onNavigate('orders')} />
                </section>

                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-5">
                    {/* ── Shortcuts ─────────────────────────────────────────── */}
                    <section className="space-y-2">
                        <h2 className="px-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Γρήγορη πρόσβαση</h2>
                        <ShortcutRow icon={BookOpen} label="Κατάλογος" description="Κωδικοί, τιμές & διαθεσιμότητα" iconTone="bg-violet-50 text-violet-600" onClick={() => onNavigate('catalog')} />
                        <ShortcutRow icon={FolderKanban} label="Συλλογές" description="Επιλεγμένες προτάσεις για πελάτες" iconTone="bg-blue-50 text-blue-600" onClick={() => onNavigate('collections')} />
                        <ShortcutRow icon={Users} label="Πελάτες" description="Πελατολόγιο & επικοινωνία" iconTone="bg-teal-50 text-teal-600" onClick={() => onNavigate('customers')} />
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
                                    <p className="text-xs font-bold">{stats.loaded ? 'Δεν υπάρχουν παραγγελίες ακόμη.' : 'Φόρτωση…'}</p>
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
                                        <span className="block text-[11px] font-medium text-slate-400">{new Date(order.created_at).toLocaleDateString('el-GR')}</span>
                                    </span>
                                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${getOrderStatusClasses(order.status, 'seller')}`}>
                                        {getOrderStatusLabel(order.status, 'seller')}
                                    </span>
                                    <span className="w-20 shrink-0 text-right text-[13px] font-bold tabular-nums text-slate-800">
                                        {formatCurrency(order.total_price / (1 + (order.vat_rate !== undefined ? order.vat_rate : 0.24)))}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
