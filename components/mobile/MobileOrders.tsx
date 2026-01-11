
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { Order, OrderStatus } from '../../types';
import { Search, ChevronDown, ChevronUp, Package, Clock, CheckCircle, XCircle, Truck, AlertCircle, Plus, Edit } from 'lucide-react';
import { formatCurrency } from '../../utils/pricingEngine';

const STATUS_ICONS = {
    [OrderStatus.Pending]: <Clock size={16} />,
    [OrderStatus.InProduction]: <Package size={16} />,
    [OrderStatus.Ready]: <CheckCircle size={16} />,
    [OrderStatus.Delivered]: <Truck size={16} />,
    [OrderStatus.Cancelled]: <XCircle size={16} />,
};

const STATUS_COLORS = {
    [OrderStatus.Pending]: 'bg-slate-100 text-slate-600 border-slate-200',
    [OrderStatus.InProduction]: 'bg-blue-50 text-blue-600 border-blue-200',
    [OrderStatus.Ready]: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    [OrderStatus.Delivered]: 'bg-slate-900 text-white border-slate-900',
    [OrderStatus.Cancelled]: 'bg-red-50 text-red-500 border-red-200',
};

const OrderCard: React.FC<{ order: Order, onEdit: (o: Order) => void }> = ({ order, onEdit }) => {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden transition-all duration-200 active:scale-[0.99]">
            <div 
                className="p-4 flex flex-col gap-3"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-mono font-bold text-slate-400">#{order.id.slice(0, 8)}...</span>
                            <span className="text-[10px] text-slate-400">{new Date(order.created_at).toLocaleDateString('el-GR')}</span>
                        </div>
                        <h3 className="font-bold text-slate-800 text-base">{order.customer_name}</h3>
                    </div>
                    <div className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1.5 border ${STATUS_COLORS[order.status]}`}>
                        {STATUS_ICONS[order.status]}
                        <span>{order.status}</span>
                    </div>
                </div>

                <div className="flex justify-between items-end border-t border-slate-50 pt-3 mt-1">
                    <div className="text-xs text-slate-500 font-medium">
                        {order.items.length} είδη
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-lg font-black text-slate-900">{formatCurrency(order.total_price)}</span>
                        {expanded ? <ChevronUp size={18} className="text-slate-300"/> : <ChevronDown size={18} className="text-slate-300"/>}
                    </div>
                </div>
            </div>

            {expanded && (
                <div className="bg-slate-50 p-4 border-t border-slate-100 space-y-3 animate-in slide-in-from-top-2">
                    <div className="flex justify-end mb-2">
                        <button 
                            onClick={(e) => { e.stopPropagation(); onEdit(order); }}
                            className="flex items-center gap-1 bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm active:scale-95"
                        >
                            <Edit size={12}/> Επεξεργασία
                        </button>
                    </div>
                    {order.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center text-sm">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-white rounded-lg border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-400">
                                    {item.quantity}x
                                </div>
                                <div>
                                    <div className="font-bold text-slate-700">{item.sku}{item.variant_suffix}</div>
                                    {item.size_info && <div className="text-[10px] text-slate-400 font-medium">Size: {item.size_info}</div>}
                                </div>
                            </div>
                            <div className="font-mono text-slate-600">{formatCurrency(item.price_at_order * item.quantity)}</div>
                        </div>
                    ))}
                    {order.notes && (
                        <div className="mt-3 p-3 bg-yellow-50 text-yellow-800 text-xs rounded-xl border border-yellow-100 flex gap-2">
                            <AlertCircle size={14} className="shrink-0"/>
                            {order.notes}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

interface MobileOrdersProps {
    onCreate?: () => void;
    onEdit?: (order: Order) => void;
}

export default function MobileOrders({ onCreate, onEdit }: MobileOrdersProps) {
    const { data: orders, isLoading } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });
    const [filter, setFilter] = useState<OrderStatus | 'ALL'>('ALL');
    const [search, setSearch] = useState('');

    const filteredOrders = useMemo(() => {
        if (!orders) return [];
        return orders.filter(o => {
            const matchesStatus = filter === 'ALL' || o.status === filter;
            const matchesSearch = search === '' || 
                o.customer_name.toLowerCase().includes(search.toLowerCase()) || 
                o.id.includes(search);
            return matchesStatus && matchesSearch;
        });
    }, [orders, filter, search]);

    if (isLoading) return <div className="p-8 text-center text-slate-400">Φόρτωση...</div>;

    const tabs = [
        { id: 'ALL', label: 'Όλα' },
        { id: OrderStatus.Pending, label: 'Εκκρεμεί' },
        { id: OrderStatus.InProduction, label: 'Παραγωγή' },
        { id: OrderStatus.Ready, label: 'Έτοιμα' },
    ];

    return (
        <div className="p-4 space-y-4 pb-24 h-full flex flex-col">
            <div className="flex justify-between items-center shrink-0">
                <h1 className="text-2xl font-black text-slate-900">Παραγγελίες</h1>
                {onCreate && (
                    <button onClick={onCreate} className="bg-[#060b00] text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg active:scale-95">
                        <Plus size={18}/> Νέα
                    </button>
                )}
            </div>
            
            {/* Search */}
            <div className="relative shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                    type="text" 
                    placeholder="Αναζήτηση πελάτη ή ID..." 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm font-medium"
                />
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide shrink-0">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setFilter(tab.id as any)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                            filter === tab.id 
                                ? 'bg-slate-900 text-white shadow-md' 
                                : 'bg-white text-slate-500 border border-slate-200'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* List */}
            <div className="space-y-3 overflow-y-auto pb-20 custom-scrollbar">
                {filteredOrders.map(order => (
                    <OrderCard key={order.id} order={order} onEdit={onEdit || (() => {})} />
                ))}
                {filteredOrders.length === 0 && (
                    <div className="text-center py-10 text-slate-400 text-sm font-medium">
                        Δεν βρέθηκαν παραγγελίες.
                    </div>
                )}
            </div>
        </div>
    );
}
