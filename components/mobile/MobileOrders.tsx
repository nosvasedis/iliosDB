
import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { Order, OrderStatus, Product, ProductVariant, ProductionStage } from '../../types';
import { Search, ChevronDown, ChevronUp, Package, Clock, CheckCircle, Truck, XCircle, AlertCircle, Plus, Edit, Trash2, Printer, Tag, Ban, Archive, ArchiveRestore, Layers, CheckSquare, X, Settings } from 'lucide-react';
import { formatCurrency } from '../../utils/pricingEngine';
import { useUI } from '../UIProvider';

const STATUS_TRANSLATIONS: Record<OrderStatus, string> = {
    [OrderStatus.Pending]: 'Εκκρεμεί',
    [OrderStatus.InProduction]: 'Παραγωγή',
    [OrderStatus.Ready]: 'Έτοιμο',
    [OrderStatus.Delivered]: 'Παραδόθηκε',
    [OrderStatus.Cancelled]: 'Ακυρώθηκε',
};

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
    [OrderStatus.Delivered]: 'bg-slate-900 text-white border-slate-900',
    [OrderStatus.Cancelled]: 'bg-red-50 text-red-500 border-red-200',
};

const OrderCard: React.FC<{
    order: Order,
    products: Product[],
    onEdit: (o: Order) => void,
    onDelete: (o: Order) => void,
    onCancel: (o: Order) => void,
    onManage: (o: Order) => void,
    isReady?: boolean,
    onComplete?: (o: Order) => void,
    onPrint?: (o: Order) => void,
    onPrintLabels?: (items: { product: Product; variant?: ProductVariant; quantity: number, format?: 'standard' | 'simple' | 'retail' }[]) => void;
}> = ({ order, products, onEdit, onDelete, onCancel, onManage, isReady, onComplete, onPrint, onPrintLabels }) => {
    const [expanded, setExpanded] = useState(false);

    const handlePrintLabels = () => {
        if (!onPrintLabels) return;
        const itemsToPrint: any[] = [];
        for (const item of order.items) {
            const product = products.find(p => p.sku === item.sku);
            if (product) {
                const variant = product.variants?.find(v => v.suffix === item.variant_suffix);
                itemsToPrint.push({
                    product,
                    variant,
                    quantity: item.quantity,
                    size: item.size_info,
                    format: 'standard'
                });
            }
        }
        if (itemsToPrint.length > 0) {
            onPrintLabels(itemsToPrint);
        }
    };

    const isCancelled = order.status === OrderStatus.Cancelled;
    const isDelivered = order.status === OrderStatus.Delivered;

    const activeVat = order.vat_rate !== undefined ? order.vat_rate : 0.24;
    const netValue = order.total_price / (1 + activeVat);

    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden transition-all duration-200 active:scale-[0.99]">
            <div
                className="p-4 flex flex-col gap-3"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex justify-between items-start">
                    <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-mono font-bold text-slate-400">#{order.id.slice(-6)}</span>
                            <span className="text-[10px] text-slate-400">• {new Date(order.created_at).toLocaleDateString('el-GR')}</span>
                        </div>
                        <h3 className="font-bold text-slate-800 text-base truncate">{order.customer_name}</h3>
                        {order.tags && order.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                                {order.tags.map(t => (
                                    <span key={t} className="text-[8px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-100 font-bold uppercase">{t}</span>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                        <div className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1.5 border ${STATUS_COLORS[order.status]}`}>
                            {STATUS_ICONS[order.status]}
                            <span>{STATUS_TRANSLATIONS[order.status]}</span>
                        </div>
                        {isReady && !isDelivered && !isCancelled && (
                            <div className="bg-emerald-500 text-white p-1 rounded-full animate-pulse shadow-sm shadow-emerald-200">
                                <CheckCircle size={14} />
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex justify-between items-end border-t border-slate-50 pt-3 mt-1">
                    <div className="text-xs text-slate-500 font-medium">
                        {order.items.length} είδη
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-lg font-black text-slate-900">{formatCurrency(netValue)}</span>
                        {expanded ? <ChevronUp size={18} className="text-slate-300" /> : <ChevronDown size={18} className="text-slate-300" />}
                    </div>
                </div>
            </div>

            {expanded && (
                <div className="bg-slate-50 p-4 border-t border-slate-100 space-y-3 animate-in slide-in-from-top-2">
                    <div className="flex justify-end gap-2 mb-2 flex-wrap">
                        <button
                            onClick={(e) => { e.stopPropagation(); onManage(order); }}
                            className="flex items-center gap-1 bg-white border border-slate-200 text-indigo-700 px-3 py-2 rounded-lg text-xs font-bold shadow-sm active:scale-95"
                        >
                            <Settings size={14} /> Διαχείριση
                        </button>

                        {isReady && !isDelivered && !isCancelled && onComplete && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onComplete(order); }}
                                className="flex items-center gap-1 bg-emerald-600 text-white px-3 py-2 rounded-lg text-xs font-bold shadow-md active:scale-95"
                            >
                                <CheckSquare size={14} /> Ολοκλήρωση
                            </button>
                        )}

                        {onPrintLabels && (
                            <button
                                onClick={(e) => { e.stopPropagation(); handlePrintLabels(); }}
                                className="flex items-center gap-1 bg-white border border-slate-200 text-emerald-700 px-3 py-2 rounded-lg text-xs font-bold shadow-sm active:scale-95"
                            >
                                <Tag size={14} /> Ετικέτες
                            </button>
                        )}
                        {onPrint && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onPrint(order); }}
                                className="flex items-center gap-1 bg-white border border-slate-200 text-slate-700 px-3 py-2 rounded-lg text-xs font-bold shadow-sm active:scale-95"
                            >
                                <Printer size={14} /> Εκτύπωση
                            </button>
                        )}

                        <button
                            onClick={(e) => { e.stopPropagation(); onEdit(order); }}
                            className="flex items-center gap-1 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-xs font-bold shadow-sm active:scale-95"
                        >
                            <Edit size={14} /> Επεξεργασία
                        </button>
                    </div>

                    {order.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center text-sm bg-white p-2 rounded-lg border border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-slate-100 rounded-md border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">
                                    {item.quantity}x
                                </div>
                                <div>
                                    <div className="font-bold text-slate-700 text-xs">{item.sku}<span className="text-slate-400">{item.variant_suffix}</span></div>
                                    {item.size_info && <div className="text-[10px] text-slate-400 font-medium">Size: {item.size_info}</div>}
                                </div>
                            </div>
                            <div className="font-mono text-slate-600 text-xs font-bold">{formatCurrency(item.price_at_order * item.quantity)}</div>
                        </div>
                    ))}
                    {order.notes && (
                        <div className="mt-3 p-3 bg-yellow-50 text-yellow-800 text-xs rounded-xl border border-yellow-100 flex gap-2">
                            <AlertCircle size={14} className="shrink-0 mt-0.5" />
                            <span className="leading-tight">{order.notes}</span>
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
    onPrint?: (order: Order) => void;
    onPrintLabels?: (items: { product: Product; variant?: ProductVariant; quantity: number, format?: 'standard' | 'simple' | 'retail' }[]) => void;
    products?: Product[];
}

export default function MobileOrders({ onCreate, onEdit, onPrint, onPrintLabels, products = [] }: MobileOrdersProps) {
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    const { data: orders, isLoading } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });
    const { data: batches } = useQuery({ queryKey: ['batches'], queryFn: api.getProductionBatches });

    const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
    const [filterStatus, setFilterStatus] = useState<OrderStatus | 'ALL'>('ALL');
    const [search, setSearch] = useState('');
    const [managingOrder, setManagingOrder] = useState<Order | null>(null);
    const [tagInput, setTagInput] = useState('');

    const filteredOrders = useMemo(() => {
        if (!orders) return [];
        return orders.filter(o => {
            const isArchived = o.is_archived === true;
            if (activeTab === 'active' && isArchived) return false;
            if (activeTab === 'archived' && !isArchived) return false;

            const matchesStatus = filterStatus === 'ALL' || o.status === filterStatus;
            const matchesSearch = search === '' ||
                o.customer_name.toLowerCase().includes(search.toLowerCase()) ||
                o.id.includes(search) ||
                (o.tags && o.tags.some(t => t.toLowerCase().includes(search.toLowerCase())));
            return matchesStatus && matchesSearch;
        });
    }, [orders, activeTab, filterStatus, search]);

    const isOrderReady = (order: Order) => {
        if (!batches) return false;
        const orderBatches = batches.filter(b => b.order_id === order.id);
        if (orderBatches.length === 0) return false;
        return orderBatches.every(b => b.current_stage === ProductionStage.Ready);
    };

    const handleDeleteOrder = async (order: Order) => {
        const yes = await confirm({
            title: 'Οριστική Διαγραφή',
            message: 'ΠΡΟΣΟΧΗ: Διαγραφή οριστικά της παραγγελίας και όλων των δεδομένων της. Δεν αναιρείται.',
            isDestructive: true,
            confirmText: 'Διαγραφή'
        });

        if (yes) {
            try {
                await api.deleteOrder(order.id);
                queryClient.invalidateQueries({ queryKey: ['orders'] });
                queryClient.invalidateQueries({ queryKey: ['batches'] });
                showToast('Η παραγγελία διαγράφηκε.', 'success');
                if (managingOrder?.id === order.id) setManagingOrder(null);
            } catch (err: any) {
                showToast('Σφάλμα διαγραφής.', 'error');
            }
        }
    };

    const handleCancelOrder = async (order: Order) => {
        const yes = await confirm({
            title: 'Ακύρωση Παραγγελίας',
            message: 'Η παραγγελία θα σημειωθεί ως Ακυρωμένη αλλά θα παραμείνει στο ιστορικό.',
            isDestructive: true,
            confirmText: 'Ακύρωση'
        });

        if (yes) {
            try {
                await api.updateOrderStatus(order.id, OrderStatus.Cancelled);
                queryClient.invalidateQueries({ queryKey: ['orders'] });
                queryClient.invalidateQueries({ queryKey: ['batches'] });
                showToast('Η παραγγελία ακυρώθηκε.', 'info');
                if (managingOrder?.id === order.id) setManagingOrder(null);
            } catch (err: any) {
                showToast('Σφάλμα ακύρωσης.', 'error');
            }
        }
    };

    const handleCompleteOrder = async (order: Order) => {
        const yes = await confirm({
            title: 'Ολοκλήρωση Παραγγελίας',
            message: 'Η παραγγελία θα σημειωθεί ως "Παραδόθηκε" και τα τεμάχια θα αφαιρεθούν από την παραγωγή.',
            confirmText: 'Ολοκλήρωση'
        });
        if (yes) {
            try {
                await api.updateOrderStatus(order.id, OrderStatus.Delivered);
                queryClient.invalidateQueries({ queryKey: ['orders'] });
                queryClient.invalidateQueries({ queryKey: ['batches'] });
                showToast("Η παραγγελία ολοκληρώθηκε!", "success");
                if (managingOrder?.id === order.id) setManagingOrder(null);
            } catch (e) {
                showToast("Σφάλμα ολοκλήρωσης.", "error");
            }
        }
    };

    const handleArchiveOrder = async (order: Order, archive: boolean) => {
        try {
            await api.archiveOrder(order.id, archive);
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            showToast(archive ? "Αρχειοθετήθηκε." : "Ανακτήθηκε.", "success");
            if (managingOrder?.id === order.id) setManagingOrder(null);
        } catch (e) {
            showToast("Σφάλμα.", "error");
        }
    };

    const handleAddTag = async () => {
        if (!managingOrder || !tagInput.trim()) return;
        const currentTags = managingOrder.tags || [];
        if (currentTags.includes(tagInput.trim())) return;

        const newTags = [...currentTags, tagInput.trim()];
        try {
            await api.updateOrder({ ...managingOrder, tags: newTags });
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            setManagingOrder(prev => prev ? ({ ...prev, tags: newTags }) : null);
            setTagInput('');
        } catch (e) {
            showToast("Σφάλμα.", "error");
        }
    };

    const handleRemoveTag = async (tag: string) => {
        if (!managingOrder) return;
        const newTags = (managingOrder.tags || []).filter(t => t !== tag);
        try {
            await api.updateOrder({ ...managingOrder, tags: newTags });
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            setManagingOrder(prev => prev ? ({ ...prev, tags: newTags }) : null);
        } catch (e) {
            showToast("Σφάλμα.", "error");
        }
    };

    if (isLoading) return <div className="p-8 text-center text-slate-400">Φόρτωση...</div>;

    const statusTabs = [
        { id: 'ALL', label: 'Όλα' },
        { id: OrderStatus.Pending, label: 'Εκκρεμεί' },
        { id: OrderStatus.InProduction, label: 'Παραγωγή' },
        { id: OrderStatus.Ready, label: 'Έτοιμα' },
        { id: OrderStatus.Delivered, label: 'Παραδόθηκε' },
    ];

    return (
        <div className="min-h-full bg-slate-50 pb-4">

            {/* Sticky Header Group */}
            <div className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm pt-4 pb-2 px-4 shadow-sm border-b border-slate-100 space-y-3">
                <div className="flex justify-between items-center">
                    <div className="flex bg-slate-200 p-1 rounded-xl">
                        <button onClick={() => setActiveTab('active')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'active' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Ενεργές</button>
                        <button onClick={() => setActiveTab('archived')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'archived' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Αρχείο</button>
                    </div>
                    {onCreate && (
                        <button onClick={onCreate} className="bg-[#060b00] text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg active:scale-95 transition-transform">
                            <Plus size={18} /> Νέα
                        </button>
                    )}
                </div>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                        type="text"
                        placeholder="Αναζήτηση πελάτη, ID ή ετικέτας..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm font-medium"
                    />
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4">
                    {statusTabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setFilterStatus(tab.id as any)}
                            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${filterStatus === tab.id
                                    ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                                    : 'bg-white text-slate-500 border-slate-200'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* List */}
            <div className="px-4 py-3 space-y-3">
                {filteredOrders.map(order => (
                    <OrderCard
                        key={order.id}
                        order={order}
                        products={products}
                        onEdit={onEdit || (() => { })}
                        onDelete={handleDeleteOrder}
                        onCancel={handleCancelOrder}
                        onManage={setManagingOrder}
                        isReady={isOrderReady(order)}
                        onComplete={handleCompleteOrder}
                        onPrint={onPrint}
                        onPrintLabels={onPrintLabels}
                    />
                ))}
                {filteredOrders.length === 0 && (
                    <div className="text-center py-10 text-slate-400 text-sm font-medium">
                        Δεν βρέθηκαν παραγγελίες.
                    </div>
                )}
            </div>

            {/* MOBILE MANAGEMENT MODAL */}
            {managingOrder && (
                <div className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-sm flex flex-col justify-end">
                    <div className="bg-white rounded-t-[2.5rem] p-6 pb-safe animate-in slide-in-from-bottom-full duration-300 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className="text-xl font-black text-slate-900">Διαχείριση Παραγγελίας</h3>
                                <p className="text-xs font-bold text-slate-500 uppercase mt-1">{managingOrder.customer_name} • #{managingOrder.id.slice(-6)}</p>
                            </div>
                            <button onClick={() => setManagingOrder(null)} className="p-2 bg-slate-100 rounded-full"><X size={20} /></button>
                        </div>

                        <div className="space-y-4">
                            {/* TAGS SECTION */}
                            <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100">
                                <label className="text-[10px] font-black text-indigo-800 uppercase mb-3 flex items-center gap-2"><Layers size={14} /> Ετικέτες & Ομαδοποίηση</label>
                                <div className="flex gap-2 mb-3">
                                    <input
                                        value={tagInput}
                                        onChange={e => setTagInput(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleAddTag()}
                                        placeholder="Προσθήκη ετικέτας..."
                                        className="flex-1 p-3 bg-white border border-indigo-200 rounded-xl text-sm font-bold outline-none"
                                    />
                                    <button onClick={handleAddTag} disabled={!tagInput.trim()} className="bg-indigo-600 text-white px-4 rounded-xl font-bold shadow-md">Προσθήκη</button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {managingOrder.tags && managingOrder.tags.map(t => (
                                        <span key={t} className="bg-white border border-indigo-200 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2 shadow-sm">
                                            {t} <button onClick={() => handleRemoveTag(t)}><X size={14} className="text-indigo-300 hover:text-red-500" /></button>
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-2">
                                {isOrderReady(managingOrder) && managingOrder.status !== OrderStatus.Delivered && (
                                    <button onClick={() => handleCompleteOrder(managingOrder)} className="w-full flex items-center gap-3 p-4 bg-emerald-600 text-white rounded-2xl font-bold shadow-lg"><CheckSquare size={20} /> Ολοκλήρωση & Παράδοση</button>
                                )}

                                <button onClick={() => handleArchiveOrder(managingOrder, !managingOrder.is_archived)} className="w-full flex items-center gap-3 p-4 bg-white border border-slate-200 text-slate-700 rounded-2xl font-bold">
                                    {managingOrder.is_archived ? <ArchiveRestore size={20} /> : <Archive size={20} />}
                                    {managingOrder.is_archived ? 'Ανάκτηση από Αρχείο' : 'Αρχειοθέτηση'}
                                </button>

                                {managingOrder.status !== OrderStatus.Cancelled && managingOrder.status !== OrderStatus.Delivered && (
                                    <button onClick={() => handleCancelOrder(managingOrder)} className="w-full flex items-center gap-3 p-4 bg-orange-50 border border-orange-200 text-orange-700 rounded-2xl font-bold"><Ban size={20} /> Ακύρωση</button>
                                )}

                                <button onClick={() => handleDeleteOrder(managingOrder)} className="w-full flex items-center gap-3 p-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl font-bold"><Trash2 size={20} /> Οριστική Διαγραφή</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
