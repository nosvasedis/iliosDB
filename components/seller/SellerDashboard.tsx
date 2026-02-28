
import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { OrderStatus } from '../../types';
import { useAuth } from '../AuthContext';
import { ShoppingCart, TrendingUp, CheckCircle, Clock, Plus, BookOpen, FolderKanban, ChevronRight } from 'lucide-react';
import { formatCurrency } from '../../utils/pricingEngine';

interface Props {
    onNavigate: (page: string) => void;
    onCreateOrder: () => void;
}

const StatCard = ({ title, value, icon, gradient, sub }: {
    title: string;
    value: string;
    icon: React.ReactNode;
    gradient: string;
    sub?: string;
}) => (
    <div className={`relative p-5 rounded-3xl overflow-hidden flex flex-col justify-between h-32 shadow-sm border border-white/20 ${gradient}`}>
        {/* Ghost icon */}
        <div className="absolute -right-3 -top-3 opacity-15 scale-150">
            {icon}
        </div>
        <div className="flex items-center gap-2 relative z-10">
            <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                {icon}
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-white/80">{title}</span>
        </div>
        <div className="relative z-10">
            <div className="text-3xl font-black text-white leading-none">{value}</div>
            {sub && <div className="text-[10px] font-medium text-white/60 mt-0.5">{sub}</div>}
        </div>
    </div>
);

const QuickAction = ({ icon, label, onClick, color }: { icon: React.ReactNode; label: string; onClick: () => void; color: string }) => (
    <button
        onClick={onClick}
        className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-2xl transition-all active:scale-95 border ${color}`}
    >
        {icon}
        <span className="text-[10px] font-black text-center leading-tight">{label}</span>
    </button>
);

// Context-aware greeting
function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Καλημέρα';
    if (hour < 18) return 'Καλησπέρα';
    return 'Καλονύχτα';
}

// Greek order status labels
const STATUS_LABELS: Record<OrderStatus, string> = {
    [OrderStatus.Pending]: 'Εκκρεμής',
    [OrderStatus.InProduction]: 'Σε Παραγωγή',
    [OrderStatus.Ready]: 'Έτοιμη',
    [OrderStatus.Delivered]: 'Παραδόθηκε',
    [OrderStatus.Cancelled]: 'Ακυρώθηκε',
};

const STATUS_PILL: Record<OrderStatus, string> = {
    [OrderStatus.Pending]: 'bg-amber-100 text-amber-700 border-amber-200',
    [OrderStatus.InProduction]: 'bg-blue-50 text-blue-700 border-blue-200',
    [OrderStatus.Ready]: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    [OrderStatus.Delivered]: 'bg-slate-800 text-white border-slate-800',
    [OrderStatus.Cancelled]: 'bg-red-50 text-red-500 border-red-200',
};

export default function SellerDashboard({ onNavigate, onCreateOrder }: Props) {
    const { user, profile } = useAuth();
    const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });

    // Same "my orders" logic as SellerOrders: seller_id match OR seller_name fallback
    const sellerId = profile?.id ?? user?.id;
    const sellerFullName = profile?.full_name ?? '';
    const sellerEmail = user?.email ?? '';
    const isMyOrder = (o: { seller_id?: string; seller_name?: string }) => {
        if (o.seller_id && sellerId && o.seller_id === sellerId) return true;
        if (o.seller_name) {
            if (sellerFullName && o.seller_name === sellerFullName) return true;
            if (sellerEmail && o.seller_name === sellerEmail) return true;
        }
        return false;
    };

    const stats = useMemo(() => {
        if (!orders) return { totalSales: 0, pendingCount: 0, completedCount: 0, recent: [] };

        const myOrders = orders.filter(isMyOrder);
        const totalSales = myOrders.reduce((sum, o) => sum + (o.total_price / (1 + (o.vat_rate || 0.24))), 0);
        const pendingCount = myOrders.filter(o => o.status === OrderStatus.Pending).length;
        const completedCount = myOrders.filter(o => o.status === OrderStatus.Delivered).length;
        const recent = [...myOrders].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5);

        return { totalSales, pendingCount, completedCount, recent };
    }, [orders, sellerId, sellerFullName, sellerEmail]);

    return (
        <div className="p-5 space-y-6 pb-28 landscape:pb-8 landscape:max-w-4xl landscape:mx-auto">

            {/* ── Hero Greeting ─────────────────────────────────────────────── */}
            <div className="relative rounded-3xl overflow-hidden shadow-lg"
                style={{ background: 'linear-gradient(135deg, #060b00 0%, #1a2400 60%, #2d3a00 100%)' }}>
                {/* Decorative circle */}
                <div className="absolute -right-8 -top-8 w-40 h-40 bg-amber-400/10 rounded-full" />
                <div className="absolute -right-4 top-4 w-24 h-24 bg-amber-400/10 rounded-full" />

                <div className="relative z-10 p-6">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-amber-400 text-xs font-black uppercase tracking-widest mb-1">Πλασιέ</p>
                            <h1 className="text-2xl font-black text-white leading-tight">{getGreeting()},</h1>
                            <p className="text-white/60 font-bold text-sm mt-0.5">{profile?.full_name || 'Πλασιέ'}</p>
                        </div>
                        <button
                            onClick={onCreateOrder}
                            className="bg-amber-400 text-[#060b00] px-4 py-2.5 rounded-2xl text-sm font-black flex items-center gap-2 shadow-lg active:scale-95 transition-transform"
                        >
                            <Plus size={18} /> Νέα Παραγγελία
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Stat Cards ────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4 landscape:grid-cols-3">
                <div className="col-span-2 landscape:col-span-1">
                    <StatCard
                        title="Συνολικός Τζίρος"
                        value={formatCurrency(stats.totalSales)}
                        icon={<TrendingUp size={24} className="text-white" />}
                        gradient="bg-gradient-to-br from-emerald-500 to-emerald-700"
                        sub="Καθαρή αξία (χωρίς ΦΠΑ)"
                    />
                </div>
                <StatCard
                    title="Εκκρεμείς"
                    value={stats.pendingCount.toString()}
                    icon={<Clock size={24} className="text-white" />}
                    gradient="bg-gradient-to-br from-amber-500 to-amber-700"
                    sub="Παραγγελίες"
                />
                <StatCard
                    title="Παραδόθηκαν"
                    value={stats.completedCount.toString()}
                    icon={<CheckCircle size={24} className="text-white" />}
                    gradient="bg-gradient-to-br from-slate-700 to-[#060b00]"
                    sub="Παραγγελίες"
                />
            </div>

            {/* ── Quick Actions ─────────────────────────────────────────────── */}
            <div className="flex gap-3">
                <QuickAction
                    icon={<FolderKanban size={22} className="text-blue-600" />}
                    label="Συλλογές"
                    onClick={() => onNavigate('collections')}
                    color="bg-blue-50 border-blue-100 text-blue-700 hover:bg-blue-100"
                />
                <QuickAction
                    icon={<BookOpen size={22} className="text-violet-600" />}
                    label="Κατάλογος"
                    onClick={() => onNavigate('catalog')}
                    color="bg-violet-50 border-violet-100 text-violet-700 hover:bg-violet-100"
                />
                <QuickAction
                    icon={<ShoppingCart size={22} className="text-slate-700" />}
                    label="Παραγγελίες"
                    onClick={() => onNavigate('orders')}
                    color="bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                />
            </div>

            {/* ── Recent Orders ─────────────────────────────────────────────── */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-black text-slate-800 text-base">Πρόσφατες Παραγγελίες</h3>
                    <button
                        onClick={() => onNavigate('orders')}
                        className="text-amber-600 text-xs font-black flex items-center gap-1"
                    >
                        Όλες <ChevronRight size={14} />
                    </button>
                </div>
                <div className="space-y-3">
                    {stats.recent.map(order => {
                        const netValue = order.total_price / (1 + (order.vat_rate || 0.24));
                        return (
                            <div key={order.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-slate-400 border border-slate-100 shadow-sm">
                                        <ShoppingCart size={16} />
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-800 text-sm">{order.customer_name}</div>
                                        <div className="text-[10px] text-slate-400">{new Date(order.created_at).toLocaleDateString('el-GR')}{order.seller_name && <span className="text-slate-500"> · {order.seller_name}</span>}</div>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                    <div className="font-black text-slate-900 text-sm">{formatCurrency(netValue)}</div>
                                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${STATUS_PILL[order.status]}`}>
                                        {STATUS_LABELS[order.status]}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                    {stats.recent.length === 0 && (
                        <div className="text-center py-10 text-slate-400 text-sm">
                            Καμία πρόσφατη δραστηριότητα.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
