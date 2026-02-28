
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { Order, OrderStatus } from '../../types';
import { useAuth } from '../AuthContext';
import {
    Search, Plus, Loader2, Clock, Package, CheckCircle, Truck, XCircle,
    ChevronDown, ChevronUp, Edit, ShoppingCart
} from 'lucide-react';
import { formatCurrency } from '../../utils/pricingEngine';

interface Props {
    onCreate: () => void;
    onEdit: (o: Order) => void;
}

// ─── Greek Status Labels + Styles ────────────────────────────────────────────
const STATUS_LABELS: Record<OrderStatus, string> = {
    [OrderStatus.Pending]: 'Εκκρεμής',
    [OrderStatus.InProduction]: 'Σε Παραγωγή',
    [OrderStatus.Ready]: 'Έτοιμη',
    [OrderStatus.Delivered]: 'Παραδόθηκε',
    [OrderStatus.Cancelled]: 'Ακυρώθηκε',
};

const STATUS_ICONS: Record<OrderStatus, React.ReactNode> = {
    [OrderStatus.Pending]: <Clock size={12} />,
    [OrderStatus.InProduction]: <Package size={12} />,
    [OrderStatus.Ready]: <CheckCircle size={12} />,
    [OrderStatus.Delivered]: <Truck size={12} />,
    [OrderStatus.Cancelled]: <XCircle size={12} />,
};

const STATUS_COLORS: Record<OrderStatus, string> = {
    [OrderStatus.Pending]: 'bg-amber-50 text-amber-700 border-amber-200',
    [OrderStatus.InProduction]: 'bg-blue-50 text-blue-700 border-blue-200',
    [OrderStatus.Ready]: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    [OrderStatus.Delivered]: 'bg-slate-800 text-white border-slate-800',
    [OrderStatus.Cancelled]: 'bg-red-50 text-red-500 border-red-200',
};

// ─── Filter Tabs Config ───────────────────────────────────────────────────────
const FILTER_TABS: Array<{ key: 'all' | OrderStatus; label: string }> = [
    { key: 'all', label: 'Όλες' },
    { key: OrderStatus.Pending, label: 'Εκκρεμείς' },
    { key: OrderStatus.Ready, label: 'Έτοιμες' },
    { key: OrderStatus.Delivered, label: 'Παραδόθηκαν' },
];

// ─── Order Card ───────────────────────────────────────────────────────────────
const SellerOrderCard: React.FC<{ order: Order; onEdit: (o: Order) => void }> = ({ order, onEdit }) => {
    const [expanded, setExpanded] = useState(false);
    const canEdit = order.status === OrderStatus.Pending;
    const activeVat = order.vat_rate !== undefined ? order.vat_rate : 0.24;
    const netValue = order.total_price / (1 + activeVat);

    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden transition-all duration-200">
            {/* Card Header */}
            <div className="p-4" onClick={() => setExpanded(!expanded)}>
                <div className="flex justify-between items-start mb-2">
                    <div>
                        <div className="text-[10px] font-mono text-slate-300 font-bold mb-0.5">#{order.id.slice(-8).toUpperCase()}</div>
                        <div className="font-black text-slate-800 text-base leading-tight">{order.customer_name}</div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-black border uppercase flex items-center gap-1 ${STATUS_COLORS[order.status]}`}>
                        {STATUS_ICONS[order.status]}
                        {STATUS_LABELS[order.status]}
                    </span>
                </div>
                <div className="flex justify-between items-end mt-3">
                    <div className="text-[10px] text-slate-400 font-medium">
                        {order.items.length} {order.items.length === 1 ? 'είδος' : 'είδη'} &nbsp;·&nbsp;
                        {new Date(order.created_at).toLocaleDateString('el-GR')}
                        {order.seller_name && <span className="ml-1.5 text-slate-500">· Πλάσιε: {order.seller_name}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-lg font-black text-slate-900">{formatCurrency(netValue)}</span>
                        {expanded
                            ? <ChevronUp size={16} className="text-slate-300" />
                            : <ChevronDown size={16} className="text-slate-300" />
                        }
                    </div>
                </div>
            </div>

            {/* Expanded Detail */}
            {expanded && (
                <div className="bg-slate-50 p-4 border-t border-slate-100 space-y-2">
                    {order.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-xs bg-white p-2.5 rounded-xl border border-slate-100 shadow-sm">
                            <div className="flex items-center gap-2">
                                <span className="font-black text-slate-800">{item.sku}</span>
                                {item.variant_suffix && (
                                    <span className="text-slate-400 font-bold">{item.variant_suffix}</span>
                                )}
                                {item.size_info && (
                                    <span className="bg-blue-50 text-blue-600 text-[9px] font-bold px-1.5 py-0.5 rounded-md border border-blue-100">
                                        {item.size_info}
                                    </span>
                                )}
                                <span className="text-slate-400">×{item.quantity}</span>
                            </div>
                            <span className="font-mono text-slate-600 font-bold">
                                {formatCurrency(item.price_at_order * item.quantity)}
                            </span>
                        </div>
                    ))}
                    {canEdit && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onEdit(order); }}
                            className="w-full mt-3 bg-white border border-slate-200 text-slate-700 hover:text-[#060b00] hover:border-[#060b00]
                                       py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-sm transition-colors"
                        >
                            <Edit size={14} /> Επεξεργασία
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SellerOrders({ onCreate, onEdit }: Props) {
    const { user } = useAuth();
    const { data: orders, isLoading } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });
    const [search, setSearch] = useState('');
    const [activeFilter, setActiveFilter] = useState<'all' | OrderStatus>('all');

    const myOrders = orders?.filter(o => o.seller_id === user?.id) || [];

    const filteredOrders = myOrders.filter(o => {
        const matchesStatus = activeFilter === 'all' || o.status === activeFilter;
        const matchesSearch = o.customer_name.toLowerCase().includes(search.toLowerCase())
            || o.id.toLowerCase().includes(search.toLowerCase());
        return matchesStatus && matchesSearch;
    });

    if (isLoading) return (
        <div className="p-10 flex justify-center">
            <Loader2 className="animate-spin text-amber-500" />
        </div>
    );

    return (
        <div className="p-4 space-y-4 h-full flex flex-col landscape:max-w-4xl landscape:mx-auto">

            {/* Title + New Button */}
            <div className="flex justify-between items-center shrink-0">
                <div>
                    <h1 className="text-2xl font-black text-slate-900">Οι Παραγγελίες μου</h1>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">{myOrders.length} σύνολο</p>
                </div>
                <button
                    onClick={onCreate}
                    className="bg-[#060b00] text-white p-3 rounded-2xl shadow-lg active:scale-95 hover:bg-slate-800 transition-all flex items-center gap-2 pr-4"
                >
                    <Plus size={20} />
                    <span className="text-sm font-black">Νέα</span>
                </button>
            </div>

            {/* Search */}
            <div className="relative shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                    type="text"
                    placeholder="Αναζήτηση πελάτη ή κωδικού..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-400/30 shadow-sm font-medium text-sm"
                />
            </div>

            {/* Status Filter Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-1 shrink-0 scrollbar-hide -mx-1 px-1">
                {FILTER_TABS.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveFilter(tab.key)}
                        className={`px-3.5 py-2 rounded-xl text-[11px] font-black whitespace-nowrap transition-all border ${activeFilter === tab.key
                                ? 'bg-[#060b00] text-white border-[#060b00] shadow-sm'
                                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                            }`}
                    >
                        {tab.label}
                        {tab.key !== 'all' && (
                            <span className={`ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full ${activeFilter === tab.key ? 'bg-white/20' : 'bg-slate-100'
                                }`}>
                                {myOrders.filter(o => o.status === tab.key).length}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Orders List */}
            <div className="flex-1 overflow-y-auto space-y-3 pb-28 landscape:pb-8 custom-scrollbar
                            landscape:grid landscape:grid-cols-2 landscape:gap-3 landscape:space-y-0">
                {filteredOrders.map(order => (
                    <SellerOrderCard key={order.id} order={order} onEdit={onEdit} />
                ))}
                {filteredOrders.length === 0 && (
                    <div className="landscape:col-span-2 flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
                        <ShoppingCart size={36} className="opacity-20" />
                        <p className="text-sm font-bold">Δεν βρέθηκαν παραγγελίες.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
