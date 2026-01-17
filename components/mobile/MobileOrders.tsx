
import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { Order, OrderStatus, Product, Material, ProductionBatch, ProductVariant } from '../../types';
import { Search, ChevronDown, ChevronUp, Package, Clock, CheckCircle, Truck, XCircle, AlertCircle, Plus, Edit, Trash2, Printer, Factory, RefreshCcw, Tag, BookOpen, Hammer, FileText, Loader2 } from 'lucide-react';
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
    onEdit: (o: Order) => void, 
    onDelete: (o: Order) => void, 
    onPrint?: (o: Order) => void,
    onProduction: (o: Order) => void,
    onResetStatus: (o: Order) => void,
    onPrintLabels?: (items: any[]) => void,
    onPrintSheets: (o: Order, type: 'aggregated' | 'prep' | 'tech') => void,
    hasBatches: boolean,
    isProcessing: boolean
}> = ({ order, onEdit, onDelete, onPrint, onProduction, onResetStatus, onPrintLabels, onPrintSheets, hasBatches, isProcessing }) => {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden transition-all duration-200 active:scale-[0.99]">
            <div className="p-4 flex flex-col gap-3" onClick={() => setExpanded(!expanded)}>
                <div className="flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-mono font-bold text-slate-400">#{order.id}</span>
                            <span className="text-[10px] text-slate-400">• {new Date(order.created_at).toLocaleDateString('el-GR')}</span>
                        </div>
                        <h3 className="font-bold text-slate-800 text-base">{order.customer_name}</h3>
                    </div>
                    <div className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1.5 border ${STATUS_COLORS[order.status]}`}>
                        {STATUS_ICONS[order.status]}
                        <span>{STATUS_TRANSLATIONS[order.status]}</span>
                    </div>
                </div>
                <div className="flex justify-between items-end border-t border-slate-50 pt-3 mt-1">
                    <div className="text-xs text-slate-500 font-medium">{order.items.length} είδη</div>
                    <div className="flex items-center gap-2">
                        <span className="text-lg font-black text-slate-900">{formatCurrency(order.total_price)}</span>
                        {expanded ? <ChevronUp size={18} className="text-slate-300"/> : <ChevronDown size={18} className="text-slate-300"/>}
                    </div>
                </div>
            </div>

            {expanded && (
                <div className="bg-slate-50 p-4 border-t border-slate-100 space-y-4 animate-in slide-in-from-top-2">
                    {/* Primary Actions Grid */}
                    <div className="grid grid-cols-2 gap-2">
                        {order.status === OrderStatus.Pending && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); onProduction(order); }}
                                disabled={isProcessing}
                                className="col-span-2 flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-xl text-xs font-black uppercase shadow-md active:scale-95 transition-all"
                            >
                                {isProcessing ? <Loader2 size={14} className="animate-spin"/> : <Factory size={16}/>}
                                Αποστολή στην Παραγωγή
                            </button>
                        )}
                        {order.status === OrderStatus.InProduction && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); onResetStatus(order); }}
                                className="col-span-2 flex items-center justify-center gap-2 bg-amber-500 text-white py-3 rounded-xl text-xs font-black uppercase shadow-md active:scale-95 transition-all"
                            >
                                <RefreshCcw size={16}/> Επαναφορά σε Εκκρεμεί
                            </button>
                        )}
                        
                        <button onClick={(e) => { e.stopPropagation(); onEdit(order); }} className="flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-700 py-2.5 rounded-xl text-xs font-bold shadow-sm active:scale-95"><Edit size={14}/> Επεξεργασία</button>
                        <button onClick={(e) => { e.stopPropagation(); onDelete(order); }} className="flex items-center justify-center gap-2 bg-white border border-red-100 text-red-500 py-2.5 rounded-xl text-xs font-bold shadow-sm active:scale-95"><Trash2 size={14}/> Διαγραφή</button>
                    </div>

                    {/* Print Actions */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Εκτυπώσεις</label>
                        <div className="grid grid-cols-3 gap-2">
                            <button onClick={(e) => { e.stopPropagation(); onPrint?.(order); }} className="flex flex-col items-center gap-1 bg-white border border-slate-100 p-3 rounded-xl text-[9px] font-black text-slate-600 shadow-sm active:scale-95 transition-all">
                                <FileText size={18} className="text-slate-400"/> ΕΝΤΟΛΗ
                            </button>
                            <button 
                                onClick={(e) => { 
                                    e.stopPropagation(); 
                                    if (onPrintLabels) {
                                        const items = order.items.map(i => ({ sku: i.sku, variant_suffix: i.variant_suffix, quantity: i.quantity, size: i.size_info }));
                                        onPrintLabels(items);
                                    }
                                }} 
                                className="flex flex-col items-center gap-1 bg-white border border-slate-100 p-3 rounded-xl text-[9px] font-black text-slate-600 shadow-sm active:scale-95 transition-all"
                            >
                                <Tag size={18} className="text-emerald-500"/> ΕΤΙΚΕΤΕΣ
                            </button>
                            <button 
                                onClick={(e) => { e.stopPropagation(); onPrintSheets(order, 'tech'); }}
                                disabled={!hasBatches}
                                className={`flex flex-col items-center gap-1 p-3 rounded-xl text-[9px] font-black shadow-sm active:scale-95 transition-all border ${hasBatches ? 'bg-white border-slate-100 text-slate-600' : 'bg-slate-100 border-transparent text-slate-300'}`}
                            >
                                <Hammer size={18} className={hasBatches ? "text-purple-500" : "text-slate-200"}/> ΤΕΧΝΙΤΗ
                            </button>
                        </div>
                    </div>

                    {/* Items List */}
                    <div className="space-y-2 pt-2 border-t border-slate-200">
                        {order.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center text-sm bg-white p-2 rounded-lg border border-slate-100">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-slate-100 rounded-md border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">{item.quantity}x</div>
                                    <div><div className="font-bold text-slate-700 text-xs">{item.sku}<span className="text-slate-400">{item.variant_suffix}</span></div>{item.size_info && <div className="text-[10px] text-slate-400 font-medium">SZ: {item.size_info}</div>}</div>
                                </div>
                                <div className="font-mono text-slate-600 text-xs font-bold">{formatCurrency(item.price_at_order * item.quantity)}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

interface MobileOrdersProps {
    onCreate?: () => void;
    onEdit?: (order: Order) => void;
    onPrint?: (order: Order) => void;
    products: Product[];
    materials: Material[];
    onPrintAggregated: (b: ProductionBatch[], details: any) => void;
    onPrintPreparation: (b: ProductionBatch[]) => void;
    onPrintTechnician: (b: ProductionBatch[]) => void;
}

export default function MobileOrders({ onCreate, onEdit, onPrint, products, materials, onPrintAggregated, onPrintPreparation, onPrintTechnician }: MobileOrdersProps) {
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    const { data: orders, isLoading } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });
    const { data: batches } = useQuery({ queryKey: ['batches'], queryFn: api.getProductionBatches });
    
    const [filter, setFilter] = useState<OrderStatus | 'ALL'>('ALL');
    const [search, setSearch] = useState('');
    const [processingId, setProcessingId] = useState<string | null>(null);

    const filteredOrders = useMemo(() => {
        if (!orders) return [];
        return orders.filter(o => {
            const matchesStatus = filter === 'ALL' || o.status === filter;
            const matchesSearch = search === '' || o.customer_name.toLowerCase().includes(search.toLowerCase()) || o.id.includes(search);
            return matchesStatus && matchesSearch;
        });
    }, [orders, filter, search]);

    const handleProduction = async (order: Order) => {
        setProcessingId(order.id);
        try {
            await api.sendOrderToProduction(order.id, products, materials);
            await queryClient.invalidateQueries({ queryKey: ['orders'] });
            await queryClient.invalidateQueries({ queryKey: ['batches'] });
            showToast("Η παραγγελία στάλθηκε στην παραγωγή.", "success");
        } catch (e: any) {
            showToast(`Σφάλμα: ${e.message}`, "error");
        } finally {
            setProcessingId(null);
        }
    };

    const handleResetStatus = async (order: Order) => {
        if (await confirm({ title: 'Επαναφορά Κατάστασης', message: 'Η παραγγελία θα επιστρέψει σε "Εκκρεμεί" και οι παρτίδες παραγωγής της θα διαγραφούν. Συνέχεια;' })) {
            try {
                // api.updateOrderStatus now correctly deletes batches for OrderStatus.Pending in lib/supabase.ts
                await api.updateOrderStatus(order.id, OrderStatus.Pending);
                await queryClient.invalidateQueries({ queryKey: ['orders'] });
                await queryClient.invalidateQueries({ queryKey: ['batches'] });
                showToast("Η κατάσταση επαναφέρθηκε και οι παρτίδες διαγράφηκαν.", "info");
            } catch (e) {
                showToast("Σφάλμα.", "error");
            }
        }
    };

    const handlePrintSheets = (order: Order, type: 'aggregated' | 'prep' | 'tech') => {
        const orderBatches = batches?.filter(b => b.order_id === order.id) || [];
        if (orderBatches.length === 0) return;
        if (type === 'aggregated') onPrintAggregated(orderBatches, { orderId: order.id, customerName: order.customer_name });
        else if (type === 'prep') onPrintPreparation(orderBatches);
        else onPrintTechnician(orderBatches);
    };

    if (isLoading) return <div className="p-8 text-center text-slate-400">Φόρτωση...</div>;

    return (
        <div className="p-4 space-y-4 pb-24 h-full flex flex-col bg-slate-50">
            <div className="flex justify-between items-center shrink-0">
                <h1 className="text-2xl font-black text-slate-900">Παραγγελίες</h1>
                {onCreate && (
                    <button onClick={onCreate} className="bg-[#060b00] text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg active:scale-95 transition-transform">
                        <Plus size={18}/> Νέα
                    </button>
                )}
            </div>
            
            <div className="relative shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input type="text" placeholder="Αναζήτηση..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm font-medium"/>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide shrink-0">
                {['ALL', OrderStatus.Pending, OrderStatus.InProduction, OrderStatus.Ready, OrderStatus.Delivered].map(tab => (
                    <button key={tab} onClick={() => setFilter(tab as any)} className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap border ${filter === tab ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white text-slate-500 border-slate-200'}`}>{tab === 'ALL' ? 'Όλα' : STATUS_TRANSLATIONS[tab as OrderStatus]}</button>
                ))}
            </div>

            <div className="space-y-3 overflow-y-auto pb-24 custom-scrollbar">
                {filteredOrders.map(order => (
                    <OrderCard 
                        key={order.id} 
                        order={order} 
                        onEdit={onEdit || (() => {})} 
                        onDelete={async (o) => { if (await confirm({ title: 'Διαγραφή', message: 'Είστε σίγουροι;', isDestructive: true })) { await api.deleteOrder(o.id); queryClient.invalidateQueries({ queryKey: ['orders'] }); } }}
                        onPrint={onPrint}
                        onProduction={handleProduction}
                        onResetStatus={handleResetStatus}
                        onPrintSheets={handlePrintSheets}
                        hasBatches={!!batches?.some(b => b.order_id === order.id)}
                        isProcessing={processingId === order.id}
                    />
                ))}
            </div>
        </div>
    );
}
