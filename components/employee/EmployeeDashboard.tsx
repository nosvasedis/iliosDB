
import React, { useMemo } from 'react';
import { Product, Order, OrderStatus } from '../../types';
import { ShoppingCart, Clock, CheckCircle, Package, Truck, Search, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { formatCurrency } from '../../utils/pricingEngine';

interface Props {
    onNavigate: (page: string) => void;
}

const StatCard = ({ title, value, icon, color }: { title: string, value: string, icon: React.ReactNode, color: string }) => (
    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
        <div className={`p-4 rounded-2xl ${color} text-white shadow-lg`}>
            {icon}
        </div>
        <div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">{title}</p>
            <h3 className="text-2xl font-black text-slate-800">{value}</h3>
        </div>
    </div>
);

export default function EmployeeDashboard({ onNavigate }: Props) {
    const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });

    const stats = useMemo(() => {
        if (!orders) return { pending: 0, todaySales: 0, ready: 0 };
        
        const today = new Date().toISOString().split('T')[0];
        
        const pending = orders.filter(o => o.status === OrderStatus.Pending || o.status === OrderStatus.InProduction).length;
        const ready = orders.filter(o => o.status === OrderStatus.Ready).length;
        
        const todaySales = orders
            .filter(o => o.created_at.startsWith(today))
            .reduce((acc, o) => acc + o.total_price, 0);

        return { pending, todaySales, ready };
    }, [orders]);

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800">Πίνακας Πωλητή</h1>
                    <p className="text-slate-500 mt-1">Επισκόπηση πωλήσεων και παραγγελιών.</p>
                </div>
                <button 
                    onClick={() => onNavigate('orders')}
                    className="bg-[#060b00] text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-black transition-all hover:-translate-y-0.5"
                >
                    <Plus size={20} /> Νέα Παραγγελία
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard 
                    title="Πωλήσεις Σήμερα" 
                    value={formatCurrency(stats.todaySales)} 
                    icon={<ShoppingCart size={24} />} 
                    color="bg-emerald-500" 
                />
                <StatCard 
                    title="Εκκρεμείς Παραγγελίες" 
                    value={stats.pending.toString()} 
                    icon={<Clock size={24} />} 
                    color="bg-amber-500" 
                />
                <StatCard 
                    title="Έτοιμα προς Παράδοση" 
                    value={stats.ready.toString()} 
                    icon={<CheckCircle size={24} />} 
                    color="bg-blue-500" 
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 flex flex-col h-full">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-slate-800 text-lg">Πρόσφατες Παραγγελίες</h3>
                        <button onClick={() => onNavigate('orders')} className="text-emerald-600 text-sm font-bold hover:underline">Προβολή Όλων</button>
                    </div>
                    
                    <div className="space-y-3 flex-1 overflow-y-auto max-h-[400px] custom-scrollbar pr-2">
                        {orders?.slice(0, 10).map(order => (
                            <div key={order.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-emerald-200 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 font-bold">
                                        #{order.id.slice(0,3)}
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-800">{order.customer_name}</div>
                                        <div className="text-xs text-slate-500">{new Date(order.created_at).toLocaleDateString('el-GR')}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-black text-emerald-700">{formatCurrency(order.total_price)}</div>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                        order.status === OrderStatus.Delivered ? 'bg-slate-200 text-slate-600' :
                                        order.status === OrderStatus.Ready ? 'bg-emerald-100 text-emerald-600' : 
                                        'bg-amber-100 text-amber-600'
                                    }`}>
                                        {order.status}
                                    </span>
                                </div>
                            </div>
                        ))}
                        {!orders?.length && <div className="text-center py-10 text-slate-400 italic">Καμία παραγγελία.</div>}
                    </div>
                </div>

                <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-8 text-white flex flex-col justify-between relative overflow-hidden">
                    <div className="relative z-10">
                        <h3 className="text-2xl font-black mb-2">Γρήγορη Αναζήτηση</h3>
                        <p className="text-slate-400 mb-8">Βρείτε προϊόντα, τιμές και διαθεσιμότητα άμεσα.</p>
                        
                        <button 
                            onClick={() => onNavigate('registry')}
                            className="bg-white text-slate-900 w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-emerald-50 transition-colors shadow-lg"
                        >
                            <Search size={20} /> Αναζήτηση στον Κατάλογο
                        </button>
                    </div>
                    
                    <div className="absolute -bottom-10 -right-10 opacity-10">
                        <Package size={200} />
                    </div>
                </div>
            </div>
        </div>
    );
}
