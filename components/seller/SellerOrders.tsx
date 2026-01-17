
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { Order, OrderStatus } from '../../types';
import { useAuth } from '../AuthContext';
import { Search, Plus, Loader2, Clock, Package, CheckCircle, Truck, XCircle, ChevronDown, ChevronUp, Edit } from 'lucide-react';
import { formatCurrency } from '../../utils/pricingEngine';

interface Props {
    onCreate: () => void;
    onEdit: (o: Order) => void;
}

const STATUS_ICONS = {
    [OrderStatus.Pending]: <Clock size={14} />,
    [OrderStatus.InProduction]: <Package size={14} />,
    [OrderStatus.Ready]: <CheckCircle size={14} />,
    [OrderStatus.Delivered]: <Truck size={14} />,
    [OrderStatus.Cancelled]: <XCircle size={14} />,
};

const STATUS_COLORS = {
    [OrderStatus.Pending]: 'bg-slate-100 text-slate-600 border-slate-200',
    [OrderStatus.InProduction]: 'bg-blue-50 text-blue-600 border-blue-200',
    [OrderStatus.Ready]: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    [OrderStatus.Delivered]: 'bg-[#060b00] text-white border-[#060b00]',
    [OrderStatus.Cancelled]: 'bg-red-50 text-red-500 border-red-200',
};

const SellerOrderCard: React.FC<{ order: Order; onEdit: (o: Order) => void }> = ({ order, onEdit }) => {
    const [expanded, setExpanded] = useState(false);
    // Can edit only if Pending
    const canEdit = order.status === OrderStatus.Pending;

    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden transition-all duration-200">
            <div className="p-4" onClick={() => setExpanded(!expanded)}>
                <div className="flex justify-between items-start mb-2">
                    <div>
                        <div className="text-[10px] font-mono text-slate-400 font-bold mb-0.5">#{order.id}</div>
                        <div className="font-bold text-slate-800">{order.customer_name}</div>
                    </div>
                    <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase flex items-center gap-1 ${STATUS_COLORS[order.status]}`}>
                        {STATUS_ICONS[order.status]} {order.status}
                    </div>
                </div>
                <div className="flex justify-between items-end">
                    <div className="text-xs text-slate-500">{order.items.length} είδη • {new Date(order.created_at).toLocaleDateString('el-GR')}</div>
                    <div className="flex items-center gap-2">
                        <span className="text-lg font-black text-slate-900">{formatCurrency(order.total_price)}</span>
                        {expanded ? <ChevronUp size={16} className="text-slate-300"/> : <ChevronDown size={16} className="text-slate-300"/>}
                    </div>
                </div>
            </div>
            
            {expanded && (
                <div className="bg-slate-50 p-4 border-t border-slate-100 space-y-2">
                    {order.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-xs bg-white p-2 rounded border border-slate-100">
                            <div>
                                <span className="font-bold text-slate-700">{item.sku}</span>
                                {item.variant_suffix && <span className="text-slate-500 ml-1">{item.variant_suffix}</span>}
                                <span className="ml-2 text-slate-400">x{item.quantity}</span>
                            </div>
                            <span className="font-mono text-slate-600">{formatCurrency(item.price_at_order * item.quantity)}</span>
                        </div>
                    ))}
                    {canEdit && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); onEdit(order); }}
                            className="w-full mt-3 bg-white border border-slate-200 text-slate-700 hover:text-[#060b00] hover:border-[#060b00] py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-colors"
                        >
                            <Edit size={14}/> Επεξεργασία
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

export default function SellerOrders({ onCreate, onEdit }: Props) {
    const { user } = useAuth();
    const { data: orders, isLoading } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });
    const [search, setSearch] = useState('');

    const myOrders = orders?.filter(o => o.seller_id === user?.id) || [];
    
    const filteredOrders = myOrders.filter(o => 
        o.customer_name.toLowerCase().includes(search.toLowerCase()) || 
        o.id.toLowerCase().includes(search.toLowerCase())
    );

    if (isLoading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-emerald-600"/></div>;

    return (
        <div className="p-4 space-y-4 h-full flex flex-col">
            <div className="flex justify-between items-center shrink-0">
                <h1 className="text-2xl font-black text-slate-900">Οι Εντολές μου</h1>
                <button onClick={onCreate} className="bg-[#060b00] text-white p-2 rounded-xl shadow-md active:scale-95 hover:bg-slate-900 transition-colors">
                    <Plus size={24}/>
                </button>
            </div>

            <div className="relative shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                    type="text" 
                    placeholder="Αναζήτηση..." 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm font-medium"
                />
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pb-24 custom-scrollbar">
                {filteredOrders.map(order => (
                    <SellerOrderCard key={order.id} order={order} onEdit={onEdit} />
                ))}
                {filteredOrders.length === 0 && (
                    <div className="text-center py-10 text-slate-400 text-sm">Δεν βρέθηκαν εντολές.</div>
                )}
            </div>
        </div>
    );
}
