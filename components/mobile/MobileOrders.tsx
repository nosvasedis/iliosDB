
import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, RETAIL_CUSTOMER_ID, RETAIL_CUSTOMER_NAME } from '../../lib/supabase';
import { Order, OrderShipment, OrderShipmentItem, OrderStatus, Product, ProductVariant, ProductionStage } from '../../types';
import { Search, ChevronDown, ChevronUp, Package, Clock, CheckCircle, Truck, XCircle, AlertCircle, Plus, Edit, Trash2, Printer, Tag, Ban, Archive, ArchiveRestore, Layers, CheckSquare, X, Settings, ShoppingBag, Image as ImageIcon, PackageCheck } from 'lucide-react';
import { formatCurrency } from '../../utils/pricingEngine';
import { extractRetailClientFromNotes } from '../../utils/retailNotes';
import { useUI } from '../UIProvider';
import SkuColorizedText from '../SkuColorizedText';
import { isOrderReady } from '../../utils/orderReadiness';
import { buildItemIdentityKey } from '../../utils/itemIdentity';
import { getRemainingOrderItems } from '../../utils/shipmentUtils';
import { getOrderStatusClasses, getOrderStatusIcon, getOrderStatusLabel } from '../../features/orders/statusPresentation';
import { invalidateOrdersAndBatches } from '../../lib/queryInvalidation';

const buildRemainingOrderForPrint = (order: Order, shipmentItems: OrderShipmentItem[]): Order | null => {
    const remainingItems = getRemainingOrderItems(order, shipmentItems);
    if (remainingItems.length === 0) return null;

    const vatRate = order.vat_rate !== undefined ? order.vat_rate : 0.24;
    const discountFactor = 1 - ((order.discount_percent || 0) / 100);
    const subtotal = remainingItems.reduce((sum, item) => sum + item.price_at_order * item.quantity, 0);
    const totalPrice = subtotal * discountFactor * (1 + vatRate);

    const items = remainingItems
        .map((remainingItem) => {
            const remainingItemKey = buildItemIdentityKey(remainingItem);
            const existingItem = order.items.find(item => buildItemIdentityKey(item) === remainingItemKey);
            if (!existingItem) return null;
            return {
                ...existingItem,
                quantity: remainingItem.quantity,
                price_at_order: remainingItem.price_at_order
            };
        })
        .filter((item): item is Order['items'][number] => item !== null);

    if (items.length === 0) return null;

    return {
        ...order,
        items,
        total_price: totalPrice
    };
};

const OrderPrintSheet: React.FC<{
    order: Order;
    onClose: () => void;
    onPrintOrder?: (order: Order) => void;
    onPrintRemainingOrder?: (order: Order) => void;
    onPrintShipment?: (payload: { order: Order; shipment: OrderShipment; shipmentItems: OrderShipmentItem[] }) => void;
}> = ({ order, onClose, onPrintOrder, onPrintRemainingOrder, onPrintShipment }) => {
    const shipmentsQuery = useQuery({
        queryKey: ['order-shipments', order.id],
        queryFn: () => api.getShipmentsForOrder(order.id),
        enabled: !!order.id,
    });

    const latestShipmentData = useMemo(() => {
        const shipmentData = shipmentsQuery.data;
        if (!shipmentData?.shipments?.length) return null;

        const sortedShipments = [...shipmentData.shipments].sort((a, b) => {
            const timeDiff = new Date(b.shipped_at).getTime() - new Date(a.shipped_at).getTime();
            if (timeDiff !== 0) return timeDiff;
            return (b.shipment_number || 0) - (a.shipment_number || 0);
        });

        const latestShipment = sortedShipments[0];
        const latestShipmentItems = shipmentData.items.filter(item => item.shipment_id === latestShipment.id);
        if (latestShipmentItems.length === 0) return null;

        const remainingOrder = buildRemainingOrderForPrint(order, shipmentData.items);
        if (!remainingOrder) return null;

        return {
            shipment: latestShipment,
            shipmentItems: latestShipmentItems,
            remainingOrder
        };
    }, [order, shipmentsQuery.data]);

    const handlePrintOrder = () => {
        onPrintOrder?.(order);
        onClose();
    };

    const handlePrintShipment = () => {
        if (!latestShipmentData) return;
        onPrintShipment?.({
            order,
            shipment: latestShipmentData.shipment,
            shipmentItems: latestShipmentData.shipmentItems
        });
        onClose();
    };

    const handlePrintRemaining = () => {
        if (!latestShipmentData) return;
        onPrintRemainingOrder?.(latestShipmentData.remainingOrder);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[170] bg-slate-900/60 backdrop-blur-sm flex flex-col justify-end" onClick={onClose}>
            <div
                className="bg-white rounded-t-[2rem] px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom-full duration-300 max-h-[85vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                        <h3 className="text-lg font-black text-slate-900">Εκτύπωση Παραγγελίας</h3>
                        <p className="text-xs font-bold text-slate-500 uppercase mt-1">
                            {order.customer_name} • #{order.id.slice(-6)}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-slate-100 rounded-full text-slate-500">
                        <X size={18} />
                    </button>
                </div>

                {shipmentsQuery.isLoading && (
                    <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
                        Έλεγχος μερικών αποστολών...
                    </div>
                )}

                {latestShipmentData && (
                    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                        <div className="text-sm font-black text-amber-900">Υπάρχει μερική αποστολή</div>
                        <div className="mt-1 text-xs font-medium text-amber-800">
                            Η παραγγελία έχει ήδη αποστολή #{latestShipmentData.shipment.shipment_number}. Μπορείτε να εκτυπώσετε μόνο τα σταλμένα είδη, μόνο τα υπόλοιπα ή ολόκληρη την παραγγελία.
                        </div>
                    </div>
                )}

                <div className="space-y-3">
                    {latestShipmentData && (
                        <button
                            onClick={handlePrintShipment}
                            className="w-full rounded-2xl border-2 border-amber-200 bg-amber-50 px-4 py-4 text-left text-amber-900"
                        >
                            <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-amber-700 shadow-sm">
                                    <Truck size={18} />
                                </div>
                                <div>
                                    <div className="font-black">Μερικά Σταλμένα Είδη</div>
                                    <div className="mt-0.5 text-xs font-medium text-amber-800">
                                        Μόνο τα είδη της αποστολής #{latestShipmentData.shipment.shipment_number}.
                                    </div>
                                </div>
                            </div>
                        </button>
                    )}

                    {latestShipmentData && (
                        <button
                            onClick={handlePrintRemaining}
                            className="w-full rounded-2xl border-2 border-blue-200 bg-blue-50 px-4 py-4 text-left text-blue-900"
                        >
                            <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm">
                                    <PackageCheck size={18} />
                                </div>
                                <div>
                                    <div className="font-black">Υπόλοιπα Είδη</div>
                                    <div className="mt-0.5 text-xs font-medium text-blue-800">
                                        Μόνο όσα είδη δεν έχουν αποσταλεί ακόμα.
                                    </div>
                                </div>
                            </div>
                        </button>
                    )}

                    <button
                        onClick={handlePrintOrder}
                        className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-4 text-left text-slate-900"
                    >
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 shadow-sm">
                                <Printer size={18} />
                            </div>
                            <div>
                                <div className="font-black">Ολόκληρη Παραγγελία</div>
                                <div className="mt-0.5 text-xs font-medium text-slate-600">
                                    Εκτύπωση του πλήρους παραστατικού της παραγγελίας.
                                </div>
                            </div>
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
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
    const isRetailOrder = order.customer_id === RETAIL_CUSTOMER_ID || order.customer_name === RETAIL_CUSTOMER_NAME;
    const { retailClientLabel } = extractRetailClientFromNotes(order.notes);
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
                        <h3 className="font-bold text-slate-800 text-base truncate">
                            {isRetailOrder ? (
                                <span className="flex items-center gap-1.5">
                                    <ShoppingBag size={13} className="text-emerald-600 shrink-0" />
                                    {order.customer_name}
                                </span>
                            ) : order.customer_name}
                        </h3>
                        {isRetailOrder && retailClientLabel && (
                            <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-600 mt-0.5">{retailClientLabel}</p>
                        )}
                        {order.seller_name && <p className="text-[10px] text-slate-500 mt-0.5">Πλάσιε: {order.seller_name}</p>}
                        {order.tags && order.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                                {order.tags.map(t => (
                                    <span key={t} className="text-[8px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-100 font-bold uppercase">{t}</span>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                        <div className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1.5 border ${getOrderStatusClasses(order.status)}`}>
                            {getOrderStatusIcon(order.status, 14)}
                            <span>{getOrderStatusLabel(order.status, 'mobileCompact')}</span>
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

                    {order.items.map((item, idx) => {
                        const product = products.find(p => p.sku === item.sku);
                        return (
                            <div key={idx} className="flex justify-between items-center text-sm bg-white p-2.5 rounded-xl border border-slate-100">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 shrink-0 rounded-lg overflow-hidden border border-slate-100 bg-slate-50 flex items-center justify-center">
                                        {product?.image_url ? (
                                            <img src={product.image_url} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <ImageIcon size={18} className="text-slate-300" />
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <SkuColorizedText sku={item.sku} suffix={item.variant_suffix} gender={product?.gender} className="font-black text-sm tracking-tight" masterClassName="text-slate-800" />
                                        {item.size_info && <div className="text-[10px] text-slate-400 font-medium mt-0.5">Size: {item.size_info}</div>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <div className="w-7 h-7 bg-slate-100 rounded-md border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                                        {item.quantity}x
                                    </div>
                                    <div className="font-mono text-slate-700 text-xs font-bold min-w-[60px] text-right">{formatCurrency(item.price_at_order * item.quantity)}</div>
                                </div>
                            </div>
                        );
                    })}
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
    onPrintRemainingOrder?: (order: Order) => void;
    onPrintShipment?: (payload: { order: Order; shipment: OrderShipment; shipmentItems: OrderShipmentItem[] }) => void;
    onPrintLabels?: (items: { product: Product; variant?: ProductVariant; quantity: number, format?: 'standard' | 'simple' | 'retail' }[]) => void;
    products?: Product[];
    onOpenDeliveries?: (order: Order) => void;
}

export default function MobileOrders({ onCreate, onEdit, onPrint, onPrintRemainingOrder, onPrintShipment, onPrintLabels, products = [], onOpenDeliveries }: MobileOrdersProps) {
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    const { data: orders, isLoading } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });
    const { data: batches } = useQuery({ queryKey: ['batches'], queryFn: api.getProductionBatches });

    const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
    const [filterStatus, setFilterStatus] = useState<OrderStatus | 'ALL'>('ALL');
    const [search, setSearch] = useState('');
    const [managingOrder, setManagingOrder] = useState<Order | null>(null);
    const [printModalOrder, setPrintModalOrder] = useState<Order | null>(null);
    const [tagInput, setTagInput] = useState('');

    const filteredOrders = useMemo(() => {
        if (!orders) return [];
        return orders.filter(o => {
            const isArchived = o.is_archived === true;
            // When filtering by Ready or Delivered, show both active and archived so the status tabs work
            const showRegardlessOfArchive = filterStatus === OrderStatus.Ready || filterStatus === OrderStatus.Delivered;
            if (!showRegardlessOfArchive) {
                if (activeTab === 'active' && isArchived) return false;
                if (activeTab === 'archived' && !isArchived) return false;
            }

            // For the "Έτοιμα" filter: also match orders that are production-ready (flashing checkmark)
            // even if their status is still InProduction
            let matchesStatus: boolean;
            if (filterStatus === OrderStatus.Ready) {
                matchesStatus = String(o.status).trim() === String(OrderStatus.Ready).trim() || isOrderReady(o, batches);
            } else {
                matchesStatus = filterStatus === 'ALL' || String(o.status).trim() === String(filterStatus).trim();
            }

            const matchesSearch = search === '' ||
                o.customer_name.toLowerCase().includes(search.toLowerCase()) ||
                o.id.includes(search) ||
                (o.tags && o.tags.some(t => t.toLowerCase().includes(search.toLowerCase())));
            return matchesStatus && matchesSearch;
        });
    }, [orders, batches, activeTab, filterStatus, search]);

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
                void invalidateOrdersAndBatches(queryClient);
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
                void invalidateOrdersAndBatches(queryClient);
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
                void invalidateOrdersAndBatches(queryClient);
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
                        isReady={isOrderReady(order, batches)}
                        onComplete={handleCompleteOrder}
                        onPrint={setPrintModalOrder}
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
                                <p className="text-xs font-bold text-slate-500 uppercase mt-1">{managingOrder.customer_name} • #{managingOrder.id.slice(-6)}{managingOrder.seller_name ? ` · ${managingOrder.seller_name}` : ''}</p>
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
                                <button onClick={() => { onOpenDeliveries?.(managingOrder); setManagingOrder(null); }} className="w-full flex items-center gap-3 p-4 bg-white border border-slate-200 text-slate-700 rounded-2xl font-bold">
                                    <Settings size={20} /> Προγραμματισμός παράδοσης
                                </button>

                                {isOrderReady(managingOrder, batches) && managingOrder.status !== OrderStatus.Delivered && (
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

            {printModalOrder && (
                <OrderPrintSheet
                    order={printModalOrder}
                    onClose={() => setPrintModalOrder(null)}
                    onPrintOrder={onPrint}
                    onPrintRemainingOrder={onPrintRemainingOrder}
                    onPrintShipment={onPrintShipment}
                />
            )}
        </div>
    );
}
