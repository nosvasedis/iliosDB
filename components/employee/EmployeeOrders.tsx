
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { Order, OrderStatus } from '../../types';
import { ShoppingCart, Plus, Search, Loader2, ChevronRight, Clock, CheckCircle, Package, Truck, XCircle } from 'lucide-react';
import { useUI } from '../UIProvider';
import { formatCurrency } from '../../utils/pricingEngine';
import MobileOrderBuilder from '../mobile/MobileOrderBuilder'; 

const getStatusColor = (status: OrderStatus) => {
    switch(status) {
        case OrderStatus.Pending: return 'bg-slate-100 text-slate-600 border-slate-200';
        case OrderStatus.InProduction: return 'bg-blue-50 text-blue-600 border-blue-200';
        case OrderStatus.Ready: return 'bg-emerald-50 text-emerald-600 border-emerald-200';
        case OrderStatus.Delivered: return 'bg-[#060b00] text-white border-[#060b00]';
        case OrderStatus.Cancelled: return 'bg-red-50 text-red-500 border-red-200';
    }
};

const STATUS_ICONS = {
    [OrderStatus.Pending]: <Clock size={12} />,
    [OrderStatus.InProduction]: <Package size={12} />,
    [OrderStatus.Ready]: <CheckCircle size={12} />,
    [OrderStatus.Delivered]: <Truck size={12} />,
    [OrderStatus.Cancelled]: <XCircle size={12} />,
};

export default function EmployeeOrders() {
    const { data: orders, isLoading } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });
    const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
    const { showToast } = useUI();
    const [isCreating, setIsCreating] = useState(false);
    const [editingOrder, setEditingOrder] = useState<Order | null>(null);
    const [search, setSearch] = useState('');

    const filteredOrders = orders?.filter(o => 
        o.customer_name.toLowerCase().includes(search.toLowerCase()) || 
        o.id.includes(search)
    ) || [];

    if (isLoading || !products) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-emerald-600"/></div>;

    if (isCreating || editingOrder) {
        return (
            <div className="bg-white md:rounded-3xl shadow-sm border border-slate-100 h-[calc(100vh-140px)] md:h-full overflow-hidden absolute inset-0 md:relative z-50">
                <MobileOrderBuilder 
                    onBack={() => { setIsCreating(false); setEditingOrder(null); }} 
                    products={products} 
                    initialOrder={editingOrder} 
                />
            </div>
        );
    }

    return (
        <div className="space-y-6 h-full flex flex-col">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-slate-800">Παραγγελίες</h1>
                <button 
                    onClick={() => setIsCreating(true)}
                    className="bg-[#060b00] text-white px-5 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-black transition-all active:scale-95"
                >
                    <Plus size={20}/> <span className="hidden md:inline">Νέα Παραγγελία</span><span className="md:hidden">Νέα</span>
                </button>
            </div>

            <div className="bg-white rounded-3xl border border-slate-100 flex flex-col flex-1 overflow-hidden shadow-sm">
                <div className="p-4 border-b border-slate-100 flex items-center gap-4">
                    <Search className="text-slate-400" size={20}/>
                    <input 
                        className="flex-1 outline-none font-medium text-slate-700"
                        placeholder="Αναζήτηση..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 md:bg-white">
                    {/* MOBILE VIEW (CARDS) */}
                    <div className="md:hidden p-3 space-y-3">
                        {filteredOrders.map(order => (
                            <div 
                                key={order.id} 
                                onClick={() => setEditingOrder(order)}
                                className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm active:scale-[0.98] transition-all"
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500 text-xs">
                                            #{order.id.slice(0,3)}
                                        </div>
                                        <div>
                                            <div className="font-bold text-slate-800 text-sm">{order.customer_name}</div>
                                            <div className="text-[10px] text-slate-400">{new Date(order.created_at).toLocaleDateString('el-GR')}</div>
                                        </div>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase flex items-center gap-1 ${getStatusColor(order.status)}`}>
                                        {STATUS_ICONS[order.status]} {order.status}
                                    </span>
                                </div>
                                <div className="flex justify-between items-end border-t border-slate-50 pt-2 mt-2">
                                    <div className="text-xs text-slate-500 font-medium">{order.items.length} είδη</div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-black text-slate-900 text-base">{formatCurrency(order.total_price)}</span>
                                        <ChevronRight size={16} className="text-slate-300"/>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* DESKTOP VIEW (TABLE) */}
                    <table className="hidden md:table w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs sticky top-0">
                            <tr>
                                <th className="p-4">ID</th>
                                <th className="p-4">Πελάτης</th>
                                <th className="p-4">Ημερομηνία</th>
                                <th className="p-4 text-right">Ποσό</th>
                                <th className="p-4 text-center">Κατάσταση</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filteredOrders.map(order => (
                                <tr key={order.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => setEditingOrder(order)}>
                                    <td className="p-4 font-mono font-bold text-slate-600">#{order.id.slice(0,8)}</td>
                                    <td className="p-4 font-bold text-slate-800">{order.customer_name}</td>
                                    <td className="p-4 text-slate-500">{new Date(order.created_at).toLocaleDateString('el-GR')}</td>
                                    <td className="p-4 text-right font-black text-slate-900">{formatCurrency(order.total_price)}</td>
                                    <td className="p-4 text-center">
                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase ${getStatusColor(order.status)}`}>
                                            {order.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {filteredOrders.length === 0 && (
                        <div className="p-10 text-center text-slate-400 italic">Δεν βρέθηκαν παραγγελίες.</div>
                    )}
                </div>
            </div>
        </div>
    );
}
