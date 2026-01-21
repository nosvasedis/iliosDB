
import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { OrderStatus } from '../../types';
import { useAuth } from '../AuthContext';
import { ShoppingCart, TrendingUp, CheckCircle, Clock, Plus } from 'lucide-react';
import { formatCurrency } from '../../utils/pricingEngine';

interface Props {
    onNavigate: (page: string) => void;
    onCreateOrder: () => void;
}

const StatCard = ({ title, value, icon, color, sub }: { title: string, value: string, icon: React.ReactNode, color: string, sub?: string }) => (
    <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between h-32 relative overflow-hidden">
        <div className={`absolute top-0 right-0 p-4 opacity-10 scale-150 ${color.replace('text', 'text')}`}>
            {icon}
        </div>
        <div className="flex items-center gap-2 relative z-10">
            <div className={`p-2 rounded-xl ${color.replace('text', 'bg').replace('600', '100')} ${color}`}>
                {icon}
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{title}</span>
        </div>
        <div className="relative z-10">
            <div className="text-2xl font-black text-slate-800">{value}</div>
            {sub && <div className="text-[10px] font-medium text-slate-400">{sub}</div>}
        </div>
    </div>
);

export default function SellerDashboard({ onNavigate, onCreateOrder }: Props) {
    const { user, profile } = useAuth();
    // Orders are automatically filtered by RLS, but we filter in memory just in case during dev
    const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });

    const stats = useMemo(() => {
        if (!orders) return { totalSales: 0, pendingCount: 0, completedCount: 0, recent: [] };
        
        // Filter specifically for this seller (though RLS does this)
        const myOrders = orders.filter(o => o.seller_id === user?.id);
        
        // Calculate NET Sales (Excluding VAT)
        const totalSales = myOrders.reduce((sum, o) => sum + (o.total_price / (1 + (o.vat_rate || 0.24))), 0);
        const pendingCount = myOrders.filter(o => o.status === OrderStatus.Pending).length;
        const completedCount = myOrders.filter(o => o.status === OrderStatus.Delivered).length;
        
        const recent = myOrders.slice(0, 5);

        return { totalSales, pendingCount, completedCount, recent };
    }, [orders, user]);

    return (
        <div className="p-5 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-black text-slate-900">Καλησπέρα,</h1>
                    <p className="text-slate-500 font-bold">{profile?.full_name || 'Seller'}</p>
                </div>
                <button 
                    onClick={onCreateOrder}
                    className="bg-[#060b00] text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg active:scale-95 transition-transform hover:bg-slate-900"
                >
                    <Plus size={18}/> Νέα Εντολή
                </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                    <StatCard 
                        title="Συνολικος Τζιρος (Net)" 
                        value={formatCurrency(stats.totalSales)} 
                        icon={<TrendingUp size={24}/>} 
                        color="text-emerald-600"
                        sub="Όλες οι παραγγελίες"
                    />
                </div>
                <StatCard 
                    title="Εκκρεμεις" 
                    value={stats.pendingCount.toString()} 
                    icon={<Clock size={24}/>} 
                    color="text-amber-600"
                />
                <StatCard 
                    title="Ολοκληρωμενες" 
                    value={stats.completedCount.toString()} 
                    icon={<CheckCircle size={24}/>} 
                    color="text-[#060b00]"
                />
            </div>

            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-slate-800 text-lg">Πρόσφατες Εντολές</h3>
                    <button onClick={() => onNavigate('orders')} className="text-amber-600 text-xs font-bold">Προβολή Όλων</button>
                </div>
                <div className="space-y-3">
                    {stats.recent.map(order => {
                        const netValue = order.total_price / (1 + (order.vat_rate || 0.24));
                        return (
                            <div key={order.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-slate-400 border border-slate-100 shadow-sm">
                                        <ShoppingCart size={16}/>
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-800 text-sm">{order.customer_name}</div>
                                        <div className="text-[10px] text-slate-400">{new Date(order.created_at).toLocaleDateString('el-GR')}</div>
                                    </div>
                                </div>
                                <div className="font-black text-slate-900 text-sm">{formatCurrency(netValue)}</div>
                            </div>
                        );
                    })}
                    {stats.recent.length === 0 && (
                        <div className="text-center py-8 text-slate-400 text-sm">Καμία πρόσφατη δραστηριότητα.</div>
                    )}
                </div>
            </div>
        </div>
    );
}
