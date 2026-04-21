
import React, { useState, useMemo, useDeferredValue } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, RETAIL_CUSTOMER_ID, RETAIL_CUSTOMER_NAME } from '../../lib/supabase';
import { Order, OrderShipment, OrderShipmentItem, OrderStatus, Product, ProductVariant, ProductionBatch, ProductionStage } from '../../types';
import { Search, ChevronDown, ChevronUp, Package, Clock, CheckCircle, Truck, XCircle, AlertCircle, Plus, Edit, Trash2, Printer, Tag, Ban, Archive, ArchiveRestore, Layers, CheckSquare, X, Settings, ShoppingBag, Image as ImageIcon, PackageCheck, Globe, Flame, Gem, Hammer, CheckCircle2, SlidersHorizontal, ShoppingCart, BookOpen, FileText, BarChart3, History, Hash } from 'lucide-react';
import MobileScreenHeader, { MOBILE_HEADER_SURFACE } from './MobileScreenHeader';
import type { LucideIcon } from 'lucide-react';
import { formatCurrency } from '../../utils/pricingEngine';
import { extractRetailClientFromNotes } from '../../utils/retailNotes';
import { retailEndClientPillClass, retailOrderBagIconClass } from '../../utils/retailPresentation';
import { useUI } from '../UIProvider';
import SkuColorizedText from '../SkuColorizedText';
import { buildOrderProductionStageSegments, getOrderItemProductionStageBreakdown, groupBatchesByShipment, isOrderReady, orderStatusShowsProductionProgress } from '../../utils/orderReadiness';
import { OrderListProgressBar } from '../orders/OrderListProgressBar';
import {
  ORDER_PRODUCTION_STAGE_BAR_CLASSNAMES,
  UNBATCHED_PRODUCTION_STAGE_STYLES,
} from '../orders/orderProductionBarStyles';
import { buildItemIdentityKey } from '../../utils/itemIdentity';
import { getOrderStatusClasses, getOrderStatusIcon, getOrderStatusLabel } from '../../features/orders/statusPresentation';
import { getTagColor } from '../../features/orders/tagColors';
import { OrdersFilterPanel, OrderFilters, DEFAULT_FILTERS, countActiveFilters } from '../orders/OrdersFilterPanel';
import { useTagColorOverrides } from '../../hooks/api/useTagColorOverrides';
import { invalidateOrdersAndBatches } from '../../lib/queryInvalidation';
import { PRODUCTION_STAGE_COLORS, getProductionStageLabel } from '../../utils/deliveryLabels';
import { buildLatestShipmentPrintData, buildOrderLabelPrintItems, buildSyntheticAggregatedBatches, buildOrderRevisions } from '../../features/orders';
import { isSpecialCreationSku } from '../../utils/specialCreationSku';
import { StickyNote, UserCheck } from 'lucide-react';
import { SellerPicker } from '../OrderBuilder/SellerPicker';
import { useSellers } from '../../hooks/api/useSellers';
import SkuOrderSearchModal from '../orders/SkuOrderSearchModal';

const STAGE_ICON_MAP: Record<ProductionStage, LucideIcon> = {
    [ProductionStage.AwaitingDelivery]: Globe,
    [ProductionStage.Waxing]: Package,
    [ProductionStage.Casting]: Flame,
    [ProductionStage.Setting]: Gem,
    [ProductionStage.Polishing]: Hammer,
    [ProductionStage.Assembly]: Layers,
    [ProductionStage.Labeling]: Tag,
    [ProductionStage.Ready]: CheckCircle2,
};

const POLISHING_PENDING_COLORS = { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' };

const StageBadge: React.FC<{
    stage: ProductionStage;
    quantity: number;
    compact?: boolean;
    pendingDispatch?: boolean;
}> = ({ stage, quantity, compact = false, pendingDispatch }) => {
    const Icon = STAGE_ICON_MAP[stage];
    const isPendingPolishing = stage === ProductionStage.Polishing && pendingDispatch === true;
    const stageColors = isPendingPolishing
        ? POLISHING_PENDING_COLORS
        : (PRODUCTION_STAGE_COLORS[stage] ?? PRODUCTION_STAGE_COLORS[ProductionStage.Waxing]);
    const label = stage === ProductionStage.Polishing
        ? (pendingDispatch ? 'Τεχν. • Αναμονή' : 'Τεχν. • Στον Τεχν.')
        : getProductionStageLabel(stage);

    return (
        <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-bold ${compact ? 'text-[10px]' : 'text-[11px]'} ${stageColors.bg} ${stageColors.text} ${stageColors.border}`}>
            <Icon size={compact ? 12 : 13} />
            <span>{quantity}x</span>
            <span>{label}</span>
        </div>
    );
};

const UnbatchedBadge: React.FC<{ quantity: number; compact?: boolean }> = ({ quantity, compact = false }) => (
    <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-bold ${compact ? 'text-[10px]' : 'text-[11px]'} ${UNBATCHED_PRODUCTION_STAGE_STYLES.bg} ${UNBATCHED_PRODUCTION_STAGE_STYLES.text} ${UNBATCHED_PRODUCTION_STAGE_STYLES.border}`}>
        <Clock size={compact ? 12 : 13} />
        <span>{quantity}x</span>
        <span>Χωρίς παρτίδα παραγωγής</span>
    </div>
);

function buildRemainingOrderForPrint(order: Order, _shipmentItems?: OrderShipmentItem[]) {
    return order;
}

const LegacyOrderPrintSheet: React.FC<{
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

    const orderRevisions = useMemo(() => buildOrderRevisions(order), [order]);
    const [showVersionSelector, setShowVersionSelector] = useState(false);

    const handlePrintOrder = () => {
        if (orderRevisions.length > 0) {
            setShowVersionSelector(true);
            return;
        }
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
        <>
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
        {showVersionSelector && orderRevisions.length > 0 && (
            <div className="fixed inset-0 z-[175] bg-slate-900/60 backdrop-blur-sm flex flex-col justify-end" onClick={() => setShowVersionSelector(false)}>
                <div
                    className="bg-white rounded-t-[2rem] px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom-full duration-300 max-h-[85vh] overflow-y-auto"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-start justify-between gap-4 mb-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <History size={18} className="text-indigo-600" />
                                <h3 className="text-lg font-black text-slate-900">{'\u0395\u03BA\u03B4\u03CC\u03C3\u03B5\u03B9\u03C2 \u03A0\u03B1\u03C1\u03B1\u03C3\u03C4\u03B1\u03C4\u03B9\u03BA\u03BF\u03CD'}</h3>
                            </div>
                            <p className="mt-1 text-xs font-medium text-slate-500">
                                {orderRevisions.length} {'\u03B5\u03BA\u03B4\u03CC\u03C3\u03B5\u03B9\u03C2 \u03BB\u03CC\u03B3\u03C9 \u03B1\u03BB\u03BB\u03B1\u03B3\u03CE\u03BD \u03C4\u03B9\u03BC\u03CE\u03BD'}
                            </p>
                        </div>
                        <button onClick={() => setShowVersionSelector(false)} className="rounded-full bg-slate-100 p-2 text-slate-500">
                            <X size={18} />
                        </button>
                    </div>
                    <div className="space-y-2.5">
                        {orderRevisions.map((rev) => {
                            const isCurrent = rev.revisionNumber === orderRevisions.length;
                            const revisionSuffix = rev.revisionNumber === 1 ? '' : `/${rev.revisionNumber}`;
                            return (
                                <button
                                    key={rev.revisionNumber}
                                    onClick={() => {
                                        const printOrder = { ...rev.order, _revisionSuffix: revisionSuffix };
                                        onPrintOrder?.(printOrder as Order);
                                        setShowVersionSelector(false);
                                        onClose();
                                    }}
                                    className={`w-full rounded-2xl border-2 px-4 py-4 text-left ${
                                        isCurrent ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl shadow-sm shrink-0 ${
                                            isCurrent ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
                                        }`}>
                                            <History size={18} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className={`font-black ${isCurrent ? 'text-indigo-800' : 'text-slate-800'}`}>{rev.label}</span>
                                                {isCurrent && (
                                                    <span className="text-[9px] font-black bg-indigo-600 text-white px-1.5 py-0.5 rounded-full uppercase">{'\u03C4\u03C1\u03AD\u03C7\u03BF\u03C5\u03C3\u03B1'}</span>
                                                )}
                                            </div>
                                            <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                                                <span>{rev.timestamp ? new Date(rev.timestamp).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}</span>
                                                <span className="font-mono font-bold text-slate-700">{rev.order.total_price.toFixed(2).replace('.', ',')}€</span>
                                                {rev.totalDiff !== null && rev.totalDiff !== 0 && (
                                                    <span className={`font-bold ${rev.totalDiff > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                                        ({rev.totalDiff > 0 ? '+' : ''}{rev.totalDiff.toFixed(2).replace('.', ',')}€)
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        )}
        </>
    );
};

const OrderPartSelectorSheet: React.FC<{
    order: Order;
    batches: ProductionBatch[];
    onBack: () => void;
    onClose: () => void;
    onConfirm: (selectedBatches: ProductionBatch[]) => void;
    onPrintAll: () => void;
}> = ({ order, batches, onBack, onClose, onConfirm, onPrintAll }) => {
    const shipments = useMemo(() => groupBatchesByShipment(batches), [batches]);
    const [selectedShipments, setSelectedShipments] = useState<Set<string>>(() => new Set(shipments.map(([key]) => key)));

    React.useEffect(() => {
        setSelectedShipments(new Set(shipments.map(([key]) => key)));
    }, [shipments]);

    const selectedBatches = useMemo(
        () => shipments.filter(([key]) => selectedShipments.has(key)).flatMap(([, grouped]) => grouped),
        [shipments, selectedShipments]
    );

    return (
        <div className="fixed inset-0 z-[175] bg-slate-900/60 backdrop-blur-sm flex flex-col justify-end" onClick={onClose}>
            <div
                className="bg-white rounded-t-[2rem] px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom-full duration-300 max-h-[88vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-4 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <h3 className="text-lg font-black text-slate-900">Μερική Εκτύπωση Παραγγελίας</h3>
                        <p className="mt-1 text-xs font-bold uppercase text-slate-500">
                            {order.customer_name} • #{order.id.slice(-6)}
                        </p>
                    </div>
                    <button onClick={onClose} className="rounded-full bg-slate-100 p-2 text-slate-500">
                        <X size={18} />
                    </button>
                </div>

                <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-medium text-blue-800">
                    Η παραγγελία έχει χωριστεί σε {shipments.length} τμήματα παραγωγής. Επιλέξτε ποια τμήματα θέλετε να συμπεριληφθούν στο εκτυπώσιμο παραστατικό.
                </div>

                <div className="mb-4 flex gap-2">
                    <button
                        onClick={() => setSelectedShipments(new Set(shipments.map(([key]) => key)))}
                        className="flex-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700"
                    >
                        Επιλογή Όλων
                    </button>
                    <button
                        onClick={() => setSelectedShipments(new Set())}
                        className="flex-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700"
                    >
                        Καμία Επιλογή
                    </button>
                </div>

                <div className="space-y-3">
                    {shipments.map(([shipmentKey, shipmentBatches]) => {
                        const selected = selectedShipments.has(shipmentKey);
                        const totalQuantity = shipmentBatches.reduce((sum, batch) => sum + batch.quantity, 0);
                        const label = new Date(shipmentKey).toLocaleString('el-GR', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                        });

                        return (
                            <button
                                key={shipmentKey}
                                onClick={() => {
                                    setSelectedShipments((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(shipmentKey)) next.delete(shipmentKey);
                                        else next.add(shipmentKey);
                                        return next;
                                    });
                                }}
                                className={`w-full rounded-2xl border-2 px-4 py-4 text-left transition-all ${selected ? 'border-blue-400 bg-blue-50 text-blue-950' : 'border-slate-200 bg-white text-slate-900'}`}
                            >
                                <div className="flex items-start gap-3">
                                    <div className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl ${selected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                        {selected ? <CheckSquare size={18} /> : <Layers size={18} />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="font-black">{label}</div>
                                        <div className="mt-1 text-xs font-medium text-slate-600">
                                            {shipmentBatches.length} παρτίδες • {totalQuantity} τεμ.
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {shipmentBatches.slice(0, 6).map((batch) => (
                                                <span key={batch.id} className="rounded-full border border-slate-200 bg-white/80 px-2 py-1 text-[10px] font-bold text-slate-700">
                                                    {batch.sku}{batch.variant_suffix || ''} ×{batch.quantity}
                                                </span>
                                            ))}
                                            {shipmentBatches.length > 6 && (
                                                <span className="rounded-full border border-slate-200 bg-white/80 px-2 py-1 text-[10px] font-bold text-slate-700">
                                                    +{shipmentBatches.length - 6} ακόμη
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                <div className="mt-5 space-y-2">
                    <button
                        onClick={() => onConfirm(selectedBatches)}
                        disabled={selectedBatches.length === 0}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#060b00] px-4 py-3.5 text-sm font-black text-white shadow-lg disabled:opacity-50"
                    >
                        <Printer size={18} />
                        Εκτύπωση Επιλεγμένων ({selectedBatches.reduce((sum, batch) => sum + batch.quantity, 0)} τεμ.)
                    </button>
                    <div className="flex gap-2">
                        <button onClick={onBack} className="flex-1 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700">
                            Πίσω
                        </button>
                        <button onClick={onPrintAll} className="flex-1 rounded-2xl bg-slate-200 px-4 py-3 text-sm font-bold text-slate-800">
                            Όλη η Παραγγελία
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const OrderPrintSheet: React.FC<{
    order: Order;
    products: Product[];
    batches?: ProductionBatch[] | null;
    showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
    onClose: () => void;
    onPrintOrder?: (order: Order) => void;
    onPrintRemainingOrder?: (order: Order) => void;
    onPrintShipment?: (payload: { order: Order; shipment: OrderShipment; shipmentItems: OrderShipmentItem[] }) => void;
    onPrintLabels?: (items: { product: Product; variant?: ProductVariant; quantity: number, format?: 'standard' | 'simple' | 'retail' }[]) => void;
    onPrintAggregated?: (batches: ProductionBatch[], orderDetails?: { orderId: string; customerName: string }) => void;
    onPrintPreparation?: (batches: ProductionBatch[]) => void;
    onPrintTechnician?: (batches: ProductionBatch[]) => void;
    onPrintAnalytics?: (order: Order) => void;
    onPrintPartialOrder?: (order: Order, selectedBatches: ProductionBatch[]) => void;
}> = ({
    order,
    products,
    batches,
    showToast,
    onClose,
    onPrintOrder,
    onPrintRemainingOrder,
    onPrintShipment,
    onPrintLabels,
    onPrintAggregated,
    onPrintPreparation,
    onPrintTechnician,
    onPrintAnalytics,
    onPrintPartialOrder,
}) => {
    const [showPartSelector, setShowPartSelector] = useState(false);
    const [showVersionSelector, setShowVersionSelector] = useState(false);
    const shipmentsQuery = useQuery({
        queryKey: ['order-shipments', order.id],
        queryFn: () => api.getShipmentsForOrder(order.id),
        enabled: !!order.id,
    });

    const orderBatches = useMemo(() => (batches || []).filter((batch) => batch.order_id === order.id), [batches, order.id]);
    const shipments = useMemo(() => groupBatchesByShipment(orderBatches), [orderBatches]);
    const hasMultipleShipments = shipments.length > 1;
    const latestShipmentData = useMemo(() => buildLatestShipmentPrintData(order, shipmentsQuery.data), [order, shipmentsQuery.data]);
    const orderRevisions = useMemo(() => buildOrderRevisions(order), [order]);

    const handlePrintLabelsAction = () => {
        const itemsToPrint = buildOrderLabelPrintItems(order, products);
        if (itemsToPrint.length === 0) {
            showToast('Δεν βρέθηκαν είδη για εκτύπωση ετικετών.', 'info');
            return;
        }
        onPrintLabels?.(itemsToPrint);
        showToast(`Στάλθηκαν ${itemsToPrint.reduce((sum, item) => sum + item.quantity, 0)} τεμάχια για εκτύπωση ετικετών.`, 'success');
        onClose();
    };

    const handleProductionSheet = (type: 'aggregated' | 'preparation' | 'technician') => {
        if (type === 'aggregated' && orderBatches.length === 0) {
            const syntheticBatches = buildSyntheticAggregatedBatches(order);
            if (syntheticBatches.length === 0) {
                showToast('Η παραγγελία δεν έχει είδη για εκτύπωση.', 'info');
                return;
            }
            onPrintAggregated?.(syntheticBatches, { orderId: order.id, customerName: order.customer_name });
            onClose();
            return;
        }

        if (orderBatches.length === 0) {
            showToast('Η παραγγελία δεν έχει σταλεί ακόμη στην παραγωγή.', 'info');
            return;
        }

        if (type === 'aggregated') onPrintAggregated?.(orderBatches, { orderId: order.id, customerName: order.customer_name });
        if (type === 'preparation') onPrintPreparation?.(orderBatches);
        if (type === 'technician') onPrintTechnician?.(orderBatches);
        onClose();
    };

    if (showPartSelector) {
        return (
            <OrderPartSelectorSheet
                order={order}
                batches={orderBatches}
                onBack={() => setShowPartSelector(false)}
                onClose={onClose}
                onConfirm={(selectedBatches) => {
                    onPrintPartialOrder?.(order, selectedBatches);
                    onClose();
                }}
                onPrintAll={() => {
                    onPrintOrder?.(order);
                    onClose();
                }}
            />
        );
    }

    if (showVersionSelector && orderRevisions.length > 0) {
        return (
            <div className="fixed inset-0 z-[175] bg-slate-900/60 backdrop-blur-sm flex flex-col justify-end" onClick={() => setShowVersionSelector(false)}>
                <div
                    className="bg-white rounded-t-[2rem] px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom-full duration-300 max-h-[85vh] overflow-y-auto"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-start justify-between gap-4 mb-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <History size={18} className="text-indigo-600" />
                                <h3 className="text-lg font-black text-slate-900">{'\u0395\u03BA\u03B4\u03CC\u03C3\u03B5\u03B9\u03C2 \u03A0\u03B1\u03C1\u03B1\u03C3\u03C4\u03B1\u03C4\u03B9\u03BA\u03BF\u03CD'}</h3>
                            </div>
                            <p className="mt-1 text-xs font-medium text-slate-500">
                                {orderRevisions.length} {'\u03B5\u03BA\u03B4\u03CC\u03C3\u03B5\u03B9\u03C2 \u03BB\u03CC\u03B3\u03C9 \u03B1\u03BB\u03BB\u03B1\u03B3\u03CE\u03BD \u03C4\u03B9\u03BC\u03CE\u03BD'}
                            </p>
                        </div>
                        <button onClick={() => setShowVersionSelector(false)} className="rounded-full bg-slate-100 p-2 text-slate-500">
                            <X size={18} />
                        </button>
                    </div>

                    <div className="space-y-2.5">
                        {orderRevisions.map((rev) => {
                            const isCurrent = rev.revisionNumber === orderRevisions.length;
                            const revisionSuffix = rev.revisionNumber === 1 ? '' : `/${rev.revisionNumber}`;
                            return (
                                <button
                                    key={rev.revisionNumber}
                                    onClick={() => {
                                        const printOrder = {
                                            ...rev.order,
                                            _revisionSuffix: revisionSuffix,
                                        };
                                        onPrintOrder?.(printOrder as Order);
                                        setShowVersionSelector(false);
                                        onClose();
                                    }}
                                    className={`w-full rounded-2xl border-2 px-4 py-4 text-left transition-colors ${
                                        isCurrent
                                            ? 'border-indigo-300 bg-indigo-50'
                                            : 'border-slate-200 bg-white'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl shadow-sm shrink-0 ${
                                            isCurrent ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
                                        }`}>
                                            <History size={18} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className={`font-black ${isCurrent ? 'text-indigo-800' : 'text-slate-800'}`}>
                                                    {rev.label}
                                                </span>
                                                {isCurrent && (
                                                    <span className="text-[9px] font-black bg-indigo-600 text-white px-1.5 py-0.5 rounded-full uppercase">{'\u03C4\u03C1\u03AD\u03C7\u03BF\u03C5\u03C3\u03B1'}</span>
                                                )}
                                            </div>
                                            <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                                                <span>{rev.timestamp ? new Date(rev.timestamp).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}</span>
                                                <span className="font-mono font-bold text-slate-700">{rev.order.total_price.toFixed(2).replace('.', ',')}€</span>
                                                {rev.totalDiff !== null && rev.totalDiff !== 0 && (
                                                    <span className={`font-bold ${rev.totalDiff > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                                        ({rev.totalDiff > 0 ? '+' : ''}{rev.totalDiff.toFixed(2).replace('.', ',')}€)
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[170] bg-slate-900/60 backdrop-blur-sm flex flex-col justify-end" onClick={onClose}>
            <div
                className="bg-white rounded-t-[2rem] px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom-full duration-300 max-h-[88vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-black text-slate-900">Επιλογές Εκτύπωσης</h3>
                        <p className="mt-1 text-xs font-bold uppercase text-slate-500">
                            {order.customer_name} • #{order.id.slice(-6)}
                        </p>
                    </div>
                    <button onClick={onClose} className="rounded-full bg-slate-100 p-2 text-slate-500">
                        <X size={18} />
                    </button>
                </div>

                {shipmentsQuery.isLoading && (
                    <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
                        Έλεγχος μερικών αποστολών...
                    </div>
                )}

                {latestShipmentData && (
                    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-900">
                        Η παραγγελία έχει ήδη μερική αποστολή #{latestShipmentData.shipment.shipment_number}. Μπορείτε να εκτυπώσετε μόνο τα σταλμένα είδη ή μόνο τα υπόλοιπα.
                    </div>
                )}

                <div className="mb-3">
                    <div className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Παραστατικά</div>
                    <div className="space-y-3">
                        <button
                            onClick={() => {
                                if (hasMultipleShipments && onPrintPartialOrder) {
                                    setShowPartSelector(true);
                                    return;
                                }
                                if (orderRevisions.length > 0) {
                                    setShowVersionSelector(true);
                                    return;
                                }
                                onPrintOrder?.(order);
                                onClose();
                            }}
                            className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-4 text-left text-slate-900"
                        >
                            <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 shadow-sm">
                                    <Printer size={18} />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-black">{hasMultipleShipments ? 'Εκτύπωση Παραγγελίας / Τμημάτων' : 'Ολόκληρη Παραγγελία'}</span>
                                        {orderRevisions.length > 0 && !hasMultipleShipments && (
                                            <span className="text-[9px] font-black bg-indigo-500 text-white px-1.5 py-0.5 rounded-full">{orderRevisions.length} εκδ.</span>
                                        )}
                                    </div>
                                    <div className="mt-0.5 text-xs font-medium text-slate-600">
                                        {hasMultipleShipments ? 'Επιλέξτε αν θέλετε όλη την παραγγελία ή μόνο συγκεκριμένα τμήματα.' : 'Εκτύπωση του πλήρους παραστατικού της παραγγελίας.'}
                                    </div>
                                </div>
                            </div>
                        </button>

                        {latestShipmentData && (
                            <button
                                onClick={() => {
                                    onPrintShipment?.({
                                        order,
                                        shipment: latestShipmentData.shipment,
                                        shipmentItems: latestShipmentData.shipmentItems,
                                    });
                                    onClose();
                                }}
                                className="w-full rounded-2xl border-2 border-amber-200 bg-amber-50 px-4 py-4 text-left text-amber-900"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-amber-700 shadow-sm">
                                        <Truck size={18} />
                                    </div>
                                    <div>
                                        <div className="font-black">Μερική Αποστολή</div>
                                        <div className="mt-0.5 text-xs font-medium text-amber-800">
                                            Μόνο τα είδη της αποστολής #{latestShipmentData.shipment.shipment_number}.
                                        </div>
                                    </div>
                                </div>
                            </button>
                        )}

                        {latestShipmentData && (
                            <button
                                onClick={() => {
                                    onPrintRemainingOrder?.(latestShipmentData.remainingOrder);
                                    onClose();
                                }}
                                className="w-full rounded-2xl border-2 border-blue-200 bg-blue-50 px-4 py-4 text-left text-blue-900"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm">
                                        <PackageCheck size={18} />
                                    </div>
                                    <div>
                                        <div className="font-black">Υπόλοιπα Είδη</div>
                                        <div className="mt-0.5 text-xs font-medium text-blue-800">
                                            Μόνο όσα είδη δεν έχουν σταλεί ακόμη.
                                        </div>
                                    </div>
                                </div>
                            </button>
                        )}

                        <button
                            onClick={handlePrintLabelsAction}
                            disabled={!onPrintLabels}
                            className="w-full rounded-2xl border-2 border-emerald-200 bg-emerald-50 px-4 py-4 text-left text-emerald-900 disabled:opacity-50"
                        >
                            <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm">
                                    <Tag size={18} />
                                </div>
                                <div>
                                    <div className="font-black">Ετικέτες Παραγγελίας</div>
                                    <div className="mt-0.5 text-xs font-medium text-emerald-800">
                                        Εκτύπωση ετικετών για όλα τα είδη της παραγγελίας.
                                    </div>
                                </div>
                            </div>
                        </button>

                        <button
                            onClick={() => {
                                onPrintAnalytics?.(order);
                                onClose();
                            }}
                            disabled={!onPrintAnalytics}
                            className="w-full rounded-2xl border-2 border-teal-200 bg-teal-50 px-4 py-4 text-left text-teal-900 disabled:opacity-50"
                        >
                            <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-teal-700 shadow-sm">
                                    <BarChart3 size={18} />
                                </div>
                                <div>
                                    <div className="font-black">Οικονομική Αναφορά</div>
                                    <div className="mt-0.5 text-xs font-medium text-teal-800">
                                        Εκτύπωση οικονομικών στοιχείων για τη συγκεκριμένη παραγγελία.
                                    </div>
                                </div>
                            </div>
                        </button>
                    </div>
                </div>

                <div>
                    <div className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Παραγωγή</div>
                    <div className="space-y-3">
                        <button
                            onClick={() => handleProductionSheet('aggregated')}
                            disabled={!onPrintAggregated}
                            className="w-full rounded-2xl border-2 border-blue-200 bg-blue-50 px-4 py-4 text-left text-blue-900 disabled:opacity-50"
                        >
                            <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm">
                                    <FileText size={18} />
                                </div>
                                <div>
                                    <div className="font-black">Συγκεντρωτική Παραγωγής</div>
                                    <div className="mt-0.5 text-xs font-medium text-blue-800">
                                        Συνοπτικό φύλλο παραγωγής για τα είδη της παραγγελίας.
                                    </div>
                                </div>
                            </div>
                        </button>

                        <button
                            onClick={() => handleProductionSheet('preparation')}
                            disabled={!onPrintPreparation}
                            className="w-full rounded-2xl border-2 border-purple-200 bg-purple-50 px-4 py-4 text-left text-purple-900 disabled:opacity-50"
                        >
                            <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-purple-700 shadow-sm">
                                    <BookOpen size={18} />
                                </div>
                                <div>
                                    <div className="font-black">Φύλλο Προετοιμασίας</div>
                                    <div className="mt-0.5 text-xs font-medium text-purple-800">
                                        Εκτύπωση φύλλου για κερί και χύτευση.
                                    </div>
                                </div>
                            </div>
                        </button>

                        <button
                            onClick={() => handleProductionSheet('technician')}
                            disabled={!onPrintTechnician}
                            className="w-full rounded-2xl border-2 border-orange-200 bg-orange-50 px-4 py-4 text-left text-orange-900 disabled:opacity-50"
                        >
                            <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-orange-700 shadow-sm">
                                    <Hammer size={18} />
                                </div>
                                <div>
                                    <div className="font-black">Φύλλο Τεχνίτη</div>
                                    <div className="mt-0.5 text-xs font-medium text-orange-800">
                                        Εκτύπωση τεχνικού φύλλου για τις παρτίδες παραγωγής της παραγγελίας.
                                    </div>
                                </div>
                            </div>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const OrderCard: React.FC<{
    order: Order,
    products: Product[],
    batches?: ProductionBatch[] | null,
    onEdit: (o: Order) => void,
    onDelete: (o: Order) => void,
    onCancel: (o: Order) => void,
    onManage: (o: Order) => void,
    isReady?: boolean,
    onComplete?: (o: Order) => void,
    onPrint?: (o: Order) => void,
    onPrintLabels?: (items: { product: Product; variant?: ProductVariant; quantity: number, format?: 'standard' | 'simple' | 'retail' }[]) => void;
    tagColorOverrides?: Record<string, number>;
}> = ({ order, products, batches, onEdit, onDelete, onCancel, onManage, isReady, onComplete, onPrint, onPrintLabels, tagColorOverrides = {} }) => {
    const isRetailOrder = order.customer_id === RETAIL_CUSTOMER_ID || order.customer_name === RETAIL_CUSTOMER_NAME;
    const { retailClientLabel } = extractRetailClientFromNotes(order.notes);
    const [expanded, setExpanded] = useState(false);
    const orderBatches = useMemo(() => (batches || []).filter((batch) => batch.order_id === order.id), [batches, order.id]);
    const stageProgress = useMemo(() => buildOrderProductionStageSegments(order, orderBatches), [order, orderBatches]);
    const itemStageBreakdownByKey = useMemo(() => {
        return new Map(
            order.items.map((item) => [
                buildItemIdentityKey(item),
                getOrderItemProductionStageBreakdown(item, orderBatches),
            ])
        );
    }, [order.items, orderBatches]);

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
                                <span className="flex min-w-0 items-center gap-1.5">
                                    <ShoppingBag size={13} className={retailOrderBagIconClass} aria-hidden />
                                    <span className="truncate">{order.customer_name}</span>
                                </span>
                            ) : (
                                order.customer_name
                            )}
                        </h3>
                        {isRetailOrder && retailClientLabel && (
                            <div className="mt-1">
                                <span className={retailEndClientPillClass} title="Τελικός πελάτης (λιανική)">
                                    {retailClientLabel}
                                </span>
                            </div>
                        )}
                        {order.seller_name && <p className="text-[10px] text-slate-500 mt-0.5">Πλάσιε: {order.seller_name}{order.seller_commission_percent != null ? ` (${order.seller_commission_percent}%)` : ''}</p>}
                        {order.tags && order.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                                {order.tags.map(t => {
                                    const c = getTagColor(t, tagColorOverrides);
                                    return (
                                        <span key={t} className={`text-[8px] px-1.5 py-0.5 rounded border font-bold uppercase ${c.bg} ${c.text} ${c.border}`}>{t}</span>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0 max-w-[55%]">
                        <div className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1.5 border ${getOrderStatusClasses(order.status)}`}>
                            {getOrderStatusIcon(order.status, 14)}
                            <span>{getOrderStatusLabel(order.status, 'mobileCompact')}</span>
                        </div>
                        {!isReady && orderStatusShowsProductionProgress(order.status) && (
                            <div className="w-full flex justify-end">
                                <OrderListProgressBar order={order} batches={batches} ready={isReady} density="mobile" />
                            </div>
                        )}
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

                    {order.status === OrderStatus.InProduction && stageProgress && (
                        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Στάδια Παραγωγής</div>
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="text-base font-black text-slate-900">{stageProgress.totalQty} τεμ.</div>
                                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">σύνολο</div>
                                </div>
                            </div>

                            <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                                {stageProgress.segments.map((segment, index) => (
                                    <div
                                        key={`${segment.kind}-${segment.kind === 'stage' ? segment.stage : 'unbatched'}-${index}`}
                                        className={`${segment.kind === 'stage' ? ORDER_PRODUCTION_STAGE_BAR_CLASSNAMES[segment.stage] : UNBATCHED_PRODUCTION_STAGE_STYLES.bar} min-w-px border-r border-white/60 last:border-r-0 transition-[width] duration-300`}
                                        style={{ width: `${segment.pct}%` }}
                                        title={segment.kind === 'stage'
                                            ? `${getProductionStageLabel(segment.stage)}: ${segment.quantity} τεμ.`
                                            : `Χωρίς παρτίδα παραγωγής: ${segment.quantity} τεμ.`}
                                    />
                                ))}
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                                {stageProgress.segments.map((segment, index) => (
                                    segment.kind === 'stage' ? (
                                        <StageBadge key={`${segment.stage}-${index}`} stage={segment.stage} quantity={segment.quantity} compact pendingDispatch={(segment as any).pendingDispatch} />
                                    ) : (
                                        <UnbatchedBadge key={`unbatched-${index}`} quantity={segment.quantity} compact />
                                    )
                                ))}
                            </div>

                            {stageProgress.assignedQty < stageProgress.totalQty && (
                                <p className="mt-2 text-[10px] font-medium text-slate-400">
                                    Τα γκρι τμήματα δείχνουν ποσότητες που δεν έχουν ακόμη μπει σε παρτίδα παραγωγής.
                                </p>
                            )}
                        </div>
                    )}

                    {order.items.map((item, idx) => {
                        const product = products.find(p => p.sku === item.sku);
                        const itemStageBreakdown = itemStageBreakdownByKey.get(buildItemIdentityKey(item)) || [];
                        const isSP = isSpecialCreationSku(item.sku);
                        return (
                            <div key={idx} className={`flex justify-between items-center text-sm p-2.5 rounded-xl border ${isSP ? 'bg-violet-50 border-violet-100' : 'bg-white border-slate-100'}`}>
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 shrink-0 rounded-lg overflow-hidden border flex items-center justify-center ${isSP ? 'bg-violet-100 border-violet-200' : 'bg-slate-50 border-slate-100'}`}>
                                        {isSP ? (
                                            <span className="text-[11px] font-black text-violet-700">SP</span>
                                        ) : product?.image_url ? (
                                            <img src={product.image_url} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <ImageIcon size={18} className="text-slate-300" />
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <SkuColorizedText sku={item.sku} suffix={item.variant_suffix} gender={product?.gender} className="font-black text-sm tracking-tight" masterClassName={isSP ? 'text-violet-900' : 'text-slate-800'} />
                                        {item.size_info && <div className="text-[10px] text-slate-400 font-medium mt-0.5">Size: {item.size_info}</div>}
                                        {item.notes && (
                                            <div className="text-[10px] text-emerald-700 italic flex items-center gap-1 mt-0.5 leading-tight font-medium">
                                                <StickyNote size={9} className="shrink-0" />{item.notes}
                                            </div>
                                        )}
                                        {order.status === OrderStatus.InProduction && (
                                            itemStageBreakdown.length > 0 ? (
                                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                                    {itemStageBreakdown.map((entry, stageIndex) => (
                                                        entry.kind === 'stage' ? (
                                                            <StageBadge key={`${entry.stage}-${entry.pendingDispatch}-${stageIndex}`} stage={entry.stage} quantity={entry.quantity} pendingDispatch={entry.pendingDispatch} />
                                                        ) : (
                                                            <UnbatchedBadge key={`unbatched-${stageIndex}`} quantity={entry.quantity} />
                                                        )
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="mt-1 text-[10px] font-medium text-slate-400">Χωρίς ενεργή παρτίδα παραγωγής ακόμη.</div>
                                            )
                                        )}
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
    onPrintAggregated?: (batches: ProductionBatch[], orderDetails?: { orderId: string; customerName: string }) => void;
    onPrintPreparation?: (batches: ProductionBatch[]) => void;
    onPrintTechnician?: (batches: ProductionBatch[]) => void;
    onPrintAnalytics?: (order: Order) => void;
    onPrintPartialOrder?: (order: Order, selectedBatches: ProductionBatch[]) => void;
    products?: Product[];
    onOpenDeliveries?: (order: Order) => void;
}

export default function MobileOrders({
    onCreate,
    onEdit,
    onPrint,
    onPrintRemainingOrder,
    onPrintShipment,
    onPrintLabels,
    onPrintAggregated,
    onPrintPreparation,
    onPrintTechnician,
    onPrintAnalytics,
    onPrintPartialOrder,
    products = [],
    onOpenDeliveries
}: MobileOrdersProps) {
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    const { data: orders, isLoading } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });
    const { data: batches } = useQuery({ queryKey: ['batches'], queryFn: api.getProductionBatches });
    const { overrides: tagColorOverrides, changeTagColor: handleChangeTagColor } = useTagColorOverrides();

    const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
    const [filters, setFilters] = useState<OrderFilters>(DEFAULT_FILTERS);
    const [search, setSearch] = useState('');
    const deferredSearchTerm = useDeferredValue(search);
    const [managingOrder, setManagingOrder] = useState<Order | null>(null);
    const [printModalOrder, setPrintModalOrder] = useState<Order | null>(null);
    const [tagInput, setTagInput] = useState('');
    const [filtersSheetOpen, setFiltersSheetOpen] = useState(false);
    const [skuSearchOpen, setSkuSearchOpen] = useState(false);
    const [sellerAssignOrder, setSellerAssignOrder] = useState<Order | null>(null);
    const [assignSellerId, setAssignSellerId] = useState<string | null>(null);
    const [assignSellerName, setAssignSellerName] = useState<string | null>(null);
    const [assignCommission, setAssignCommission] = useState<number | undefined>(undefined);
    const { data: sellers } = useSellers();

    const allTags = useMemo(() => {
        if (!orders) return [];
        const tagSet = new Set<string>();
        orders.forEach(o => o.tags?.forEach(t => tagSet.add(t)));
        return Array.from(tagSet).sort((a, b) => a.localeCompare(b, 'el'));
    }, [orders]);

    const allSellers = useMemo(() => {
        if (!orders) return [];
        const sellerSet = new Set<string>();
        orders.forEach(o => { if (o.seller_name) sellerSet.add(o.seller_name); });
        return Array.from(sellerSet).sort((a, b) => a.localeCompare(b, 'el'));
    }, [orders]);

    const filteredOrders = useMemo(() => {
        if (!orders) return [];

        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
        const monthAgo = new Date(now); monthAgo.setMonth(now.getMonth() - 1);
        const normalizedSearch = (deferredSearchTerm ?? '').trim().toLowerCase();
        const hasSearch = normalizedSearch.length > 0;

        return orders.filter(o => {
            const isArchived = o.is_archived === true;
            const relaxArchive =
                filters.statuses.has(OrderStatus.Ready) ||
                filters.statuses.has(OrderStatus.Delivered);
            // When searching on "Ενεργές", include archived matches too.
            // (Keep existing "relaxArchive" behavior for Ready/Delivered.)
            if (!relaxArchive && !(hasSearch && activeTab === 'active')) {
                if (activeTab === 'active' && isArchived) return false;
                if (activeTab === 'archived' && !isArchived) return false;
            }

            if (filters.statuses.size > 0) {
                const inSet = filters.statuses.has(o.status as OrderStatus);
                const readyExtra = filters.statuses.has(OrderStatus.Ready) && isOrderReady(o, batches);
                if (!inSet && !readyExtra) return false;
            }

            if (filters.datePreset !== 'all') {
                const created = new Date(o.created_at);
                if (filters.datePreset === 'today') {
                    if (o.created_at.slice(0, 10) !== todayStr) return false;
                } else if (filters.datePreset === 'week') {
                    if (created < weekAgo) return false;
                } else if (filters.datePreset === 'month') {
                    if (created < monthAgo) return false;
                } else if (filters.datePreset === 'custom') {
                    if (filters.dateFrom && o.created_at.slice(0, 10) < filters.dateFrom) return false;
                    if (filters.dateTo && o.created_at.slice(0, 10) > filters.dateTo) return false;
                }
            }

            if (filters.sellers.size > 0) {
                const sellerName = o.seller_name ?? '';
                if (!filters.sellers.has(sellerName)) return false;
            }

            if (filters.tags.size > 0) {
                const orderTags = new Set(o.tags || []);
                if (filters.tagLogic === 'AND') {
                    for (const t of filters.tags) {
                        if (!orderTags.has(t)) return false;
                    }
                } else {
                    let anyMatch = false;
                    for (const t of filters.tags) {
                        if (orderTags.has(t)) { anyMatch = true; break; }
                    }
                    if (!anyMatch) return false;
                }
            }

            if (!hasSearch) return true;
            const term = normalizedSearch;
            return (
                o.id.toLowerCase().includes(term) ||
                o.customer_name.toLowerCase().includes(term) ||
                (o.tags && o.tags.some(t => t.toLowerCase().includes(term)))
            );
        });
    }, [orders, batches, activeTab, deferredSearchTerm, filters]);

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

    const activeFilterCount = countActiveFilters(filters);

    return (
        <div className="min-h-full bg-slate-50 pb-4">

            {/* Sticky Header Group */}
            <div className={`sticky top-0 z-10 shadow-sm ${MOBILE_HEADER_SURFACE}`}>
                <div className="space-y-3 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top,0px))]">
                <MobileScreenHeader
                    embedded
                    icon={ShoppingCart}
                    title="Παραγγελίες"
                    subtitle="Πωλήσεις & κατάσταση"
                    iconClassName="text-emerald-700"
                />
                <div className="flex justify-between items-center">
                    <div className="flex bg-slate-200 p-1 rounded-xl">
                        <button onClick={() => setActiveTab('active')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'active' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Ενεργές</button>
                        <button onClick={() => setActiveTab('archived')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'archived' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Αρχείο</button>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setSkuSearchOpen(true)}
                            className="flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 bg-white shadow-sm text-emerald-600 active:scale-95 transition-transform"
                            aria-label="Αναζήτηση SKU"
                        >
                            <Hash size={17} strokeWidth={2.5} />
                        </button>
                        {onCreate && (
                            <button onClick={onCreate} className="bg-[#060b00] text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg active:scale-95 transition-transform">
                                <Plus size={18} /> Νέα
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex gap-2">
                    <div className="relative flex-1 min-w-0">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Αναζήτηση πελάτη, ID ή ετικέτας..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-3 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm font-medium"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => setFiltersSheetOpen(true)}
                        className="shrink-0 flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl shadow-sm font-bold text-slate-700 active:scale-95 transition-transform"
                    >
                        <SlidersHorizontal size={18} className="text-slate-500" />
                        <span className="text-xs">Φίλτρα</span>
                        {activeFilterCount > 0 && (
                            <span className="bg-emerald-500 text-white text-[9px] font-black min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center">
                                {activeFilterCount}
                            </span>
                        )}
                    </button>
                </div>

                {activeFilterCount > 0 && (
                    <div className="flex flex-wrap items-center gap-2 -mx-1">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest shrink-0">Ενεργά:</span>
                        {Array.from(filters.statuses).map(s => (
                            <span key={s} className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border font-bold ${getOrderStatusClasses(s)}`}>
                                {getOrderStatusIcon(s, 10)}
                                {getOrderStatusLabel(s)}
                                <button type="button" onClick={() => { const next = new Set(filters.statuses); next.delete(s); setFilters(f => ({ ...f, statuses: next })); }} className="ml-0.5 hover:opacity-70 transition-opacity"><X size={9} /></button>
                            </span>
                        ))}
                        {filters.datePreset !== 'all' && (
                            <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border font-bold bg-violet-100 text-violet-700 border-violet-200">
                                {filters.datePreset === 'today' && 'Σήμερα'}
                                {filters.datePreset === 'week' && 'Εβδομάδα'}
                                {filters.datePreset === 'month' && 'Μήνας'}
                                {filters.datePreset === 'custom' && `${filters.dateFrom ?? '…'} — ${filters.dateTo ?? '…'}`}
                                <button type="button" onClick={() => setFilters(f => ({ ...f, datePreset: 'all', dateFrom: null, dateTo: null }))} className="ml-0.5 hover:opacity-70 transition-opacity"><X size={9} /></button>
                            </span>
                        )}
                        {Array.from(filters.sellers).map(seller => (
                            <span key={seller} className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border font-bold bg-sky-100 text-sky-700 border-sky-200">
                                {seller}
                                <button type="button" onClick={() => { const next = new Set(filters.sellers); next.delete(seller); setFilters(f => ({ ...f, sellers: next })); }} className="ml-0.5 hover:opacity-70 transition-opacity"><X size={9} /></button>
                            </span>
                        ))}
                        {Array.from(filters.tags).map(tag => {
                            const c = getTagColor(tag, tagColorOverrides);
                            return (
                                <span key={tag} className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border font-bold ${c.activeBg} ${c.activeText} ${c.activeBorder}`}>
                                    {tag}
                                    <button type="button" onClick={() => { const next = new Set(filters.tags); next.delete(tag); setFilters(f => ({ ...f, tags: next })); }} className="ml-0.5 hover:opacity-70 transition-opacity"><X size={9} /></button>
                                </span>
                            );
                        })}
                        <button
                            type="button"
                            onClick={() => setFilters(DEFAULT_FILTERS)}
                            className="text-[10px] font-black text-slate-400 hover:text-rose-500 flex items-center gap-0.5 transition-colors"
                        >
                            <X size={10} /> Καθαρισμός
                        </button>
                    </div>
                )}
                </div>
            </div>

            {/* List */}
            <div className="px-4 py-3 space-y-3">
                {filteredOrders.map(order => (
                    <OrderCard
                        key={order.id}
                        order={order}
                        products={products}
                        batches={batches}
                        onEdit={onEdit || (() => { })}
                        onDelete={handleDeleteOrder}
                        onCancel={handleCancelOrder}
                        onManage={setManagingOrder}
                        isReady={isOrderReady(order, batches)}
                        onComplete={handleCompleteOrder}
                        onPrint={setPrintModalOrder}
                        onPrintLabels={onPrintLabels}
                        tagColorOverrides={tagColorOverrides}
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
                                    {managingOrder.tags && managingOrder.tags.map(t => {
                                        const c = getTagColor(t, tagColorOverrides);
                                        return (
                                            <span key={t} className={`${c.bg} ${c.border} ${c.text} border px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2 shadow-sm`}>
                                                {t}{' '}
                                                <button type="button" onClick={() => handleRemoveTag(t)} aria-label={`Αφαίρεση ${t}`}>
                                                    <X size={14} className="opacity-50 hover:opacity-100 hover:text-red-600 transition-opacity" />
                                                </button>
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => {
                                    setSellerAssignOrder(managingOrder);
                                    setAssignSellerId(managingOrder.seller_id || null);
                                    setAssignSellerName(managingOrder.seller_name || null);
                                    setAssignCommission(managingOrder.seller_commission_percent ?? undefined);
                                    setManagingOrder(null);
                                }} className="flex items-center gap-2 p-3.5 bg-white border border-slate-200 text-slate-600 rounded-2xl text-sm font-bold">
                                    <UserCheck size={18} className="text-slate-400" /> Πλασιέ
                                </button>

                                <button onClick={() => { onOpenDeliveries?.(managingOrder); setManagingOrder(null); }} className="flex items-center gap-2 p-3.5 bg-white border border-slate-200 text-slate-600 rounded-2xl text-sm font-bold">
                                    <Settings size={18} className="text-slate-400" /> Παράδοση
                                </button>

                                <button onClick={() => handleArchiveOrder(managingOrder, !managingOrder.is_archived)} className="flex items-center gap-2 p-3.5 bg-white border border-slate-200 text-slate-600 rounded-2xl text-sm font-bold">
                                    {managingOrder.is_archived ? <ArchiveRestore size={18} className="text-slate-400" /> : <Archive size={18} className="text-slate-400" />}
                                    {managingOrder.is_archived ? 'Ανάκτηση' : 'Αρχείο'}
                                </button>

                                {managingOrder.status !== OrderStatus.Cancelled && managingOrder.status !== OrderStatus.Delivered && (
                                    <button onClick={() => handleCancelOrder(managingOrder)} className="flex items-center gap-2 p-3.5 bg-white border border-slate-200 text-orange-600 rounded-2xl text-sm font-bold"><Ban size={18} className="text-orange-400" /> Ακύρωση</button>
                                )}
                            </div>

                            {isOrderReady(managingOrder, batches) && managingOrder.status !== OrderStatus.Delivered && (
                                <button onClick={() => handleCompleteOrder(managingOrder)} className="w-full flex items-center justify-center gap-2 p-3.5 bg-emerald-600 text-white rounded-2xl font-bold text-sm shadow-sm"><CheckSquare size={18} /> Ολοκλήρωση & Παράδοση</button>
                            )}

                            <button onClick={() => handleDeleteOrder(managingOrder)} className="w-full flex items-center justify-center gap-2 p-3 text-red-400 text-xs font-bold"><Trash2 size={14} /> Οριστική Διαγραφή</button>
                        </div>
                    </div>
                </div>
            )}

            {/* SELLER ASSIGNMENT MODAL */}
            {sellerAssignOrder && (
                <div className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-sm flex flex-col justify-end">
                    <div className="bg-white rounded-t-[2.5rem] p-6 pb-safe animate-in slide-in-from-bottom-full duration-300">
                        <div className="flex justify-between items-start mb-5">
                            <div>
                                <h3 className="text-lg font-black text-slate-900">Ανάθεση Πλασιέ</h3>
                                <p className="text-xs font-bold text-slate-500 mt-1">{sellerAssignOrder.customer_name} • #{sellerAssignOrder.id.slice(-6)}</p>
                            </div>
                            <button onClick={() => setSellerAssignOrder(null)} className="p-2 bg-slate-100 rounded-full"><X size={20} /></button>
                        </div>
                        <SellerPicker
                            compact
                            selectedSellerId={assignSellerId}
                            commissionPercent={assignCommission}
                            onSellerChange={(id, name, defaultCommission) => {
                                setAssignSellerId(id);
                                setAssignSellerName(name);
                                setAssignCommission(defaultCommission);
                            }}
                            onCommissionChange={setAssignCommission}
                        />
                        <button
                            onClick={async () => {
                                try {
                                    const seller = sellers?.find(s => s.id === assignSellerId);
                                    await api.updateOrder(sellerAssignOrder.id, {
                                        seller_id: assignSellerId || null,
                                        seller_name: assignSellerName || (seller?.full_name ?? null),
                                        seller_commission_percent: assignCommission ?? null,
                                    } as any);
                                    invalidateOrdersAndBatches(queryClient);
                                    showToast('Ο πλασιέ ανατέθηκε.', 'success');
                                    setSellerAssignOrder(null);
                                } catch (e: any) {
                                    showToast(e.message || 'Σφάλμα', 'error');
                                }
                            }}
                            className="w-full mt-4 py-3.5 bg-sky-600 text-white rounded-xl font-bold text-sm active:scale-[0.98]"
                        >
                            Αποθήκευση
                        </button>
                    </div>
                </div>
            )}

            {printModalOrder && (
                <OrderPrintSheet
                    order={printModalOrder}
                    products={products}
                    batches={batches}
                    showToast={showToast}
                    onClose={() => setPrintModalOrder(null)}
                    onPrintOrder={onPrint}
                    onPrintRemainingOrder={onPrintRemainingOrder}
                    onPrintShipment={onPrintShipment}
                    onPrintLabels={onPrintLabels}
                    onPrintAggregated={onPrintAggregated}
                    onPrintPreparation={onPrintPreparation}
                    onPrintTechnician={onPrintTechnician}
                    onPrintAnalytics={onPrintAnalytics}
                    onPrintPartialOrder={onPrintPartialOrder}
                />
            )}

            {filtersSheetOpen && (
                <div className="fixed inset-0 z-[160] flex flex-col bg-slate-900/50" role="dialog" aria-modal="true">
                    <button type="button" className="absolute inset-0" aria-label="Κλείσιμο" onClick={() => setFiltersSheetOpen(false)} />
                    <div
                        className="relative mt-auto max-h-[min(92vh,720px)] flex flex-col rounded-t-[2rem] bg-white shadow-2xl border-t border-slate-200"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-slate-100 shrink-0">
                            <h2 className="text-lg font-black text-slate-900">Φίλτρα</h2>
                            <button type="button" onClick={() => setFiltersSheetOpen(false)} className="p-2 rounded-full bg-slate-100 text-slate-600">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="overflow-y-auto flex-1 pb-[max(1rem,env(safe-area-inset-bottom))]">
                            <OrdersFilterPanel
                                variant="embedded"
                                alwaysShowTagPalette
                                allTags={allTags}
                                allSellers={allSellers}
                                filters={filters}
                                onChange={setFilters}
                                tagColorOverrides={tagColorOverrides}
                                onChangeTagColor={handleChangeTagColor}
                            />
                            <div className="px-4 pb-4 flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setFilters(DEFAULT_FILTERS)}
                                    className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-600"
                                >
                                    Καθαρισμός όλων
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFiltersSheetOpen(false)}
                                    className="flex-1 py-3 rounded-xl bg-slate-900 text-white text-sm font-bold"
                                >
                                    Έτοιμο
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {skuSearchOpen && (
                <SkuOrderSearchModal
                    onClose={() => setSkuSearchOpen(false)}
                    orders={orders || []}
                    products={products}
                    mobile={true}
                />
            )}
        </div>
    );
}
