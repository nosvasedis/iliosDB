
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Order, OrderStatus, Product, ProductVariant, ProductionBatch, Material, MaterialType, VatRegime, OrderShipment, OrderShipmentItem } from '../types';
import { ShoppingCart, Plus, Search, Calendar, CheckCircle, Package, ArrowRight, X, Printer, Tag, Settings, Edit, Trash2, Ban, BarChart3, Globe, Flame, Gem, Hammer, BookOpen, FileText, ChevronDown, ChevronUp, Clock, Truck, XCircle, AlertCircle, Factory, Send, RotateCcw, Archive, ArchiveRestore, Layers, CheckSquare, PackageCheck, FileCheck, Loader2, History, UserCheck } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { RETAIL_CUSTOMER_ID, RETAIL_CUSTOMER_NAME } from '../lib/supabase';
import { retailEndClientPillClass } from '../utils/retailPresentation';
import { useUI } from './UIProvider';
import { useAuth } from './AuthContext';
import { formatCurrency, getVariantComponents } from '../utils/pricingEngine';
import DesktopOrderBuilder from './DesktopOrderBuilder';
import ProductionSendModal from './ProductionSendModal';
import { extractRetailClientFromNotes } from '../utils/retailNotes';
import { groupBatchesByShipment, getShipmentReadiness, isOrderReady } from '../utils/orderReadiness';
import { OrderListProgressBar } from './orders/OrderListProgressBar';
import ShipmentCreationModal from './deliveries/ShipmentCreationModal';
import { invalidateOrdersAndBatches } from '../lib/queryInvalidation';
import { buildPartialOrderFromBatches, buildLatestShipmentPrintData, buildOrderLabelPrintItems, buildSyntheticAggregatedBatches, getShipmentStageBreakdown, getShipmentSummary, getShipmentValue, buildOrderRevisions } from '../features/orders';
import { getOrderStatusClasses, getOrderStatusLabel, getOrderStatusIcon } from '../features/orders/statusPresentation';
import { getTagColor } from '../features/orders/tagColors';
import { OrdersFilterPanel, OrderFilters, DEFAULT_FILTERS, countActiveFilters } from './orders/OrdersFilterPanel';
import { useTagColorOverrides } from '../hooks/api/useTagColorOverrides';
import { getSpecialCreationProductStub, isSpecialCreationSku } from '../utils/specialCreationSku';
import { useCollections } from '../hooks/api/useCollections';
import { useCustomers, useOrderShipmentsForOrder, useOrders } from '../hooks/api/useOrders';
import { useProductionBatches } from '../hooks/api/useProductionBatches';
import { ordersRepository } from '../features/orders';
import DesktopPageHeader from './DesktopPageHeader';
import { SellerPicker } from './OrderBuilder/SellerPicker';
import { productionRepository } from '../features/production';
import { auditRepository } from '../features/audit';

interface Props {
    products: Product[];
    onPrintOrder?: (order: Order) => void;
    onPrintRemainingOrder?: (order: Order) => void;
    onPrintShipment?: (payload: { order: Order; shipment: OrderShipment; shipmentItems: OrderShipmentItem[] }) => void;
    onPrintLabels?: (items: { product: Product; variant?: ProductVariant; quantity: number, size?: string, format?: 'standard' | 'simple' | 'retail' }[]) => void;
    materials: Material[];
    onPrintAggregated: (batches: ProductionBatch[], orderDetails?: { orderId: string, customerName: string }) => void;
    onPrintPreparation: (batches: ProductionBatch[]) => void;
    onPrintTechnician: (batches: ProductionBatch[]) => void;
    onPrintAnalytics?: (order: Order) => void;
    onPrintPartialOrder?: (order: Order, selectedBatches: ProductionBatch[]) => void;
    onOpenDeliveries?: (order: Order) => void;
}

// ── Inline Seller Assignment Modal ──────────────────────────────────────────
function SellerAssignmentModal({ order, onClose, onSaved }: {
    order: Order;
    onClose: () => void;
    onSaved: (updatedOrder: Order) => void;
}) {
    const { showToast } = useUI();
    const [sellerId, setSellerId] = React.useState<string | undefined>(order.seller_id);
    const [sellerName, setSellerName] = React.useState<string | undefined>(order.seller_name);
    const [commission, setCommission] = React.useState<number | undefined>(order.seller_commission_percent);
    const [isSaving, setIsSaving] = React.useState(false);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const updated: Order = {
                ...order,
                seller_id: sellerId || undefined,
                seller_name: sellerName || undefined,
                seller_commission_percent: sellerId ? commission : undefined,
            };
            await ordersRepository.updateOrder(updated);
            showToast('Ο πλασιέ ενημερώθηκε.', 'success');
            onSaved(updated);
            onClose();
        } catch (e: any) {
            showToast(e.message || 'Σφάλμα', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] bg-slate-900/55 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-100 animate-in zoom-in-95">
                <div className="p-6 border-b border-slate-100 bg-sky-50/70 flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><UserCheck size={18} /> Ανάθεση Πλασιέ</h3>
                        <p className="text-xs text-slate-500 font-mono mt-1">#{order.id}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white rounded-full text-slate-500"><X size={20} /></button>
                </div>
                <div className="p-6 space-y-4">
                    <SellerPicker
                        selectedSellerId={sellerId}
                        selectedSellerName={sellerName}
                        commissionPercent={commission}
                        onSellerChange={(id, name) => { setSellerId(id); setSellerName(name); }}
                        onCommissionChange={setCommission}
                    />
                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                        <button onClick={onClose} disabled={isSaving} className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100">
                            Ακύρωση
                        </button>
                        <button onClick={handleSave} disabled={isSaving} className="px-6 py-2.5 bg-sky-600 text-white rounded-xl font-bold text-sm hover:bg-sky-700 disabled:opacity-50">
                            {isSaving ? 'Αποθήκευση...' : 'Αποθήκευση'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Modal for selecting which parts/shipments of an order to print
const OrderPartSelectorModal = ({
    order,
    batches,
    products,
    onClose,
    onPrintSelected,
    onPrintAll
}: {
    order: Order;
    batches: ProductionBatch[];
    products: Product[];
    onClose: () => void;
    onPrintSelected: (selectedBatches: ProductionBatch[]) => void;
    onPrintAll: () => void;
}) => {
    const shipments = useMemo(() => groupBatchesByShipment(batches), [batches]);
    const [selectedShipments, setSelectedShipments] = useState<Set<string>>(new Set(shipments.map(([key]) => key)));

    const toggleShipment = (key: string) => {
        const newSet = new Set(selectedShipments);
        if (newSet.has(key)) {
            newSet.delete(key);
        } else {
            newSet.add(key);
        }
        setSelectedShipments(newSet);
    };

    const selectAll = () => setSelectedShipments(new Set(shipments.map(([key]) => key)));
    const deselectAll = () => setSelectedShipments(new Set());

    const getSelectedBatches = (): ProductionBatch[] => {
        return shipments
            .filter(([key]) => selectedShipments.has(key))
            .flatMap(([, batches]) => batches);
    };

    const selectedBatches = getSelectedBatches();
    const selectedValue = getShipmentValue(order, selectedBatches);
    const allValue = order.total_price;

    return (
        <div className="fixed inset-0 z-[160] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Επιλογή Τμημάτων για Εκτύπωση</h2>
                        <p className="text-sm text-slate-500 font-mono font-bold">Παραγγελία #{order.id.slice(-8)} • {order.customer_name}{order.seller_name ? ` · ${order.seller_name}` : ''}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20} /></button>
                </div>

                {/* Info Banner */}
                <div className="px-6 py-3 bg-blue-50 border-b border-blue-100 shrink-0">
                    <p className="text-xs text-blue-700 font-medium">
                        Η παραγγελία έχει σταλεί στην παραγωγή σε <span className="font-bold">{shipments.length} διαφορετικά τμήματα</span>. Επιλέξτε ποια θέλετε να εκτυπώσετε.
                    </p>
                </div>

                {/* Shipment List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {shipments.map(([dateKey, shipmentBatches]) => {
                        const summary = getShipmentSummary(shipmentBatches);
                        const value = getShipmentValue(order, shipmentBatches);
                        const isSelected = selectedShipments.has(dateKey);
                        const prettyDate = new Date(dateKey).toLocaleDateString('el-GR', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        });

                        // Get stage breakdown
                        const stageBreakdown = getShipmentStageBreakdown(shipmentBatches);

                        return (
                            <button
                                key={dateKey}
                                onClick={() => toggleShipment(dateKey)}
                                className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${isSelected
                                        ? 'border-blue-500 bg-blue-50 shadow-sm'
                                        : 'border-slate-200 bg-white hover:border-slate-300'
                                    }`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-3">
                                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${isSelected ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-400'
                                            }`}>
                                            {isSelected ? <CheckCircle size={14} /> : <Package size={14} />}
                                        </div>
                                        <div>
                                            <div className="font-bold text-slate-800 text-sm">{prettyDate}</div>
                                            <div className="text-xs text-slate-500 mt-0.5">
                                                {summary.totalItems} τεμ. • {summary.uniqueSkus} SKU
                                            </div>
                                            {/* Stage Pills */}
                                            <div className="flex flex-wrap gap-1 mt-2">
                                                {Object.entries(stageBreakdown).map(([stage, qty]) => (
                                                    <span key={stage} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                                                        {stage}: {qty}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="font-bold text-slate-800">{formatCurrency(value)}</div>
                                        <div className="text-[10px] text-slate-400">με ΦΠΑ</div>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Actions Footer */}
                <div className="p-4 border-t border-slate-100 bg-slate-50/50 shrink-0 space-y-3">
                    {/* Selection Controls */}
                    <div className="flex gap-2">
                        <button
                            onClick={selectAll}
                            className="flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                        >
                            Επιλογή Όλων
                        </button>
                        <button
                            onClick={deselectAll}
                            className="flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                        >
                            Αποεπιλογή Όλων
                        </button>
                    </div>

                    {/* Summary */}
                    <div className="flex justify-between items-center py-2 px-3 bg-white rounded-xl border border-slate-200">
                        <div>
                            <div className="text-xs text-slate-500">Επιλεγμένα: {selectedBatches.length} batches</div>
                            <div className="font-bold text-slate-800">{formatCurrency(selectedValue)}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-xs text-slate-500">Σύνολο Παραγγελίας:</div>
                            <div className="font-bold text-slate-600">{formatCurrency(allValue)}</div>
                        </div>
                    </div>

                    {/* Print Buttons */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => onPrintSelected(selectedBatches)}
                            disabled={selectedBatches.length === 0}
                            className="flex-1 py-3 px-4 rounded-xl font-bold text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            <Printer size={16} />
                            Εκτύπωση Επιλεγμένων ({selectedBatches.reduce((s, b) => s + b.quantity, 0)} τεμ.)
                        </button>
                        <button
                            onClick={onPrintAll}
                            className="py-3 px-4 rounded-xl font-bold text-sm bg-slate-800 text-white hover:bg-slate-900 transition-colors shadow-lg flex items-center justify-center gap-2"
                        >
                            <FileCheck size={16} />
                            Ολόκληρη Παραγγελία
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const PrintOptionsModal = ({ order, onClose, onPrintOrder, onPrintRemainingOrder, onPrintShipment, onPrintLabels, products, allBatches, showToast, onPrintAggregated, onPrintPreparation, onPrintTechnician, onPrintAnalytics, onShowPartSelector }: {
    order: Order;
    onClose: () => void;
    onPrintOrder?: (order: Order) => void;
    onPrintRemainingOrder?: (order: Order) => void;
    onPrintShipment?: (payload: { order: Order; shipment: OrderShipment; shipmentItems: OrderShipmentItem[] }) => void;
    onPrintLabels?: (items: { product: Product; variant?: ProductVariant; quantity: number, size?: string, format?: 'standard' | 'simple' | 'retail' }[]) => void;
    onPrintAggregated: (batches: ProductionBatch[], orderDetails?: { orderId: string, customerName: string }) => void;
    onPrintPreparation: (batches: ProductionBatch[]) => void;
    onPrintTechnician: (batches: ProductionBatch[]) => void;
    onPrintAnalytics?: (order: Order) => void;
    products: Product[];
    allBatches: ProductionBatch[] | undefined;
    showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
    onShowPartSelector?: () => void;
}) => {
    const orderBatches = useMemo(() => allBatches?.filter(b => b.order_id === order.id) || [], [allBatches, order.id]);
    const [showShipmentPrompt, setShowShipmentPrompt] = useState(false);
    const [showVersionSelector, setShowVersionSelector] = useState(false);
    const shipmentsQuery = useOrderShipmentsForOrder(order.id);

    // Check if order has multiple shipments (parts)
    const shipments = useMemo(() => groupBatchesByShipment(orderBatches), [orderBatches]);
    const hasMultipleShipments = shipments.length > 1;
    const latestShipmentData = useMemo(() => buildLatestShipmentPrintData(order, shipmentsQuery.data), [order, shipmentsQuery.data]);
    const orderRevisions = useMemo(() => buildOrderRevisions(order), [order]);

    const handlePrintOrder = () => {
        if (latestShipmentData && onPrintShipment) {
            setShowShipmentPrompt(true);
            return;
        }
        // If order has multiple shipments, show the part selector
        if (hasMultipleShipments && onShowPartSelector) {
            onShowPartSelector();
            return;
        }
        // If order has price change history, show version selector
        if (orderRevisions.length > 0) {
            setShowVersionSelector(true);
            return;
        }
        // Otherwise print the full order
        onPrintOrder?.(order);
        onClose();
    };

    const handlePrintLabelsAction = () => {
        const itemsToPrint = buildOrderLabelPrintItems(order, products);
        if (itemsToPrint.length > 0) {
            onPrintLabels?.(itemsToPrint);
            const totalQuantity = itemsToPrint.reduce((sum, item) => sum + item.quantity, 0);
            showToast(`Στάλθηκαν ${totalQuantity} τεμάχια για εκτύπωση ετικετών.`, "success");
        }
        onClose();
    };

    const handlePrintProductionSheet = (printFn: (batches: ProductionBatch[], details?: any) => void) => {
        if (orderBatches.length === 0) {
            showToast("Η παραγγελία δεν έχει αποσταλεί στην παραγωγή.", "info");
            return;
        }
        if (printFn === onPrintAggregated) {
            printFn(orderBatches, { orderId: order.id, customerName: order.customer_name });
        } else {
            printFn(orderBatches);
        }
        onClose();
    };

    const productionSheetsDisabled = orderBatches.length === 0;

    const options = [
        {
            label: "Εκτύπωση Παραγγελίας",
            icon: <Printer size={20} />,
            color: "slate",
            action: handlePrintOrder,
            disabled: !onPrintOrder,
            badge: hasMultipleShipments ? `${shipments.length} μέρη` : orderRevisions.length > 0 ? `${orderRevisions.length} εκδόσεις` : undefined,
        },
        {
            label: "Εκτύπωση Ετικετών",
            icon: <Tag size={20} />,
            color: "emerald",
            action: handlePrintLabelsAction,
            disabled: !onPrintLabels,
        },
        {
            label: "Οικονομική Ανάλυση",
            icon: <BarChart3 size={20} />,
            color: "teal",
            action: () => { onPrintAnalytics && onPrintAnalytics(order); onClose(); },
            disabled: !onPrintAnalytics,
        },
        {
            label: "Συγκεντρωτική Παραγωγής",
            icon: <FileText size={20} />,
            color: "blue",
            action: () => {
                if (orderBatches.length === 0) {
                    const syntheticBatches = buildSyntheticAggregatedBatches(order);
                    if (syntheticBatches.length === 0) {
                        showToast("Η παραγγελία δεν έχει είδη για εκτύπωση.", "info");
                        return;
                    }
                    onPrintAggregated(syntheticBatches, { orderId: order.id, customerName: order.customer_name });
                    onClose();
                } else {
                    handlePrintProductionSheet(onPrintAggregated);
                }
            },
            disabled: !onPrintAggregated,
        },
        {
            label: "Φύλλο Προετοιμασίας",
            icon: <BookOpen size={20} />,
            color: "purple",
            action: () => handlePrintProductionSheet(onPrintPreparation),
            disabled: productionSheetsDisabled,
        },
        {
            label: "Φύλλо Τεχνίτη",
            icon: <Hammer size={20} />,
            color: "orange",
            action: () => handlePrintProductionSheet(onPrintTechnician),
            disabled: productionSheetsDisabled,
        },
    ];

    const colors = {
        slate: { bg: 'bg-slate-100', text: 'text-slate-700', hover: 'hover:bg-slate-200', border: 'border-slate-200' },
        emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', hover: 'hover:bg-emerald-100', border: 'border-emerald-200' },
        teal: { bg: 'bg-teal-50', text: 'text-teal-700', hover: 'hover:bg-teal-100', border: 'border-teal-200' },
        blue: { bg: 'bg-blue-50', text: 'text-blue-700', hover: 'hover:bg-blue-100', border: 'border-blue-200' },
        purple: { bg: 'bg-purple-50', text: 'text-purple-700', hover: 'hover:bg-purple-100', border: 'border-purple-200' },
        orange: { bg: 'bg-orange-50', text: 'text-orange-700', hover: 'hover:bg-orange-100', border: 'border-orange-200' },
    };

    return (
        <>
        <div className="fixed inset-0 z-[150] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Επιλογές Εκτύπωσης</h2>
                        <p className="text-sm text-slate-500 font-mono font-bold">Παραγγελία #{order.id}{order.seller_name ? ` · ${order.seller_name}` : ''}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20} /></button>
                </div>
                <div className="p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {options.map(opt => {
                        const colorClass = colors[opt.color as keyof typeof colors];
                        return (
                            <button
                                key={opt.label}
                                onClick={opt.action}
                                disabled={opt.disabled}
                                className={`
                                    p-6 rounded-2xl flex flex-col items-center justify-center gap-3 text-center font-bold border-2 transition-all relative
                                    ${opt.disabled
                                        ? 'bg-slate-50 border-slate-100 text-slate-400 cursor-not-allowed'
                                        : `${colorClass.bg} ${colorClass.text} ${colorClass.border} ${colorClass.hover} transform hover:-translate-y-1`
                                    }
                                `}
                            >
                                {opt.badge && (
                                    <span className="absolute top-2 right-2 bg-blue-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">
                                        {opt.badge}
                                    </span>
                                )}
                                <div className="p-3 bg-white rounded-xl shadow-sm">{opt.icon}</div>
                                <span className="text-xs uppercase tracking-wider">{opt.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
        {showShipmentPrompt && latestShipmentData && (
            <div className="fixed inset-0 z-[170] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
                    <div className="p-6 border-b border-slate-100 bg-amber-50">
                        <h3 className="text-xl font-bold text-slate-900">{'\u03A5\u03C0\u03AC\u03C1\u03C7\u03B5\u03B9 \u039C\u03B5\u03C1\u03B9\u03BA\u03AE \u0391\u03C0\u03BF\u03C3\u03C4\u03BF\u03BB\u03AE'}</h3>
                        <p className="text-sm text-slate-600 mt-1">
                            {`\u0397 \u03C0\u03B1\u03C1\u03B1\u03B3\u03B3\u03B5\u03BB\u03AF\u03B1 \u03AD\u03C7\u03B5\u03B9 \u03BA\u03B1\u03C4\u03B1\u03C7\u03C9\u03C1\u03B7\u03BC\u03AD\u03BD\u03B7 \u03BC\u03B5\u03C1\u03B9\u03BA\u03AE \u03B1\u03C0\u03BF\u03C3\u03C4\u03BF\u03BB\u03AE #${latestShipmentData.shipment.shipment_number}. \u03A4\u03B9 \u03B8\u03AD\u03BB\u03B5\u03C4\u03B5 \u03BD\u03B1 \u03B5\u03BA\u03C4\u03C5\u03C0\u03CE\u03C3\u03B5\u03C4\u03B5;`}
                        </p>
                    </div>
                    <div className="p-6 space-y-3">
                        <button
                            onClick={() => {
                                onPrintShipment?.({ order, shipment: latestShipmentData.shipment, shipmentItems: latestShipmentData.shipmentItems });
                                setShowShipmentPrompt(false);
                                onClose();
                            }}
                            className="w-full p-4 rounded-2xl border-2 border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors text-left"
                        >
                            <div className="font-bold">{'\u0395\u03BA\u03C4\u03CD\u03C0\u03C9\u03C3\u03B7 \u039C\u03B5\u03C1\u03B9\u03BA\u03AE\u03C2 \u0391\u03C0\u03BF\u03C3\u03C4\u03BF\u03BB\u03AE\u03C2'}</div>
                            <div className="text-xs mt-1 opacity-80">
                                {`\u039C\u03CC\u03BD\u03BF \u03C4\u03B1 \u03C0\u03C1\u03BF\u03CA\u03CC\u03BD\u03C4\u03B1 \u03C0\u03BF\u03C5 \u03C3\u03C4\u03AC\u03BB\u03B8\u03B7\u03BA\u03B1\u03BD \u03C3\u03C4\u03B7 \u03BC\u03B5\u03C1\u03B9\u03BA\u03AE \u03B1\u03C0\u03BF\u03C3\u03C4\u03BF\u03BB\u03AE #${latestShipmentData.shipment.shipment_number}.`}
                            </div>
                        </button>
                        <button
                            onClick={() => {
                                onPrintRemainingOrder?.(latestShipmentData.remainingOrder);
                                setShowShipmentPrompt(false);
                                onClose();
                            }}
                            className="w-full p-4 rounded-2xl border-2 border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100 transition-colors text-left"
                        >
                            <div className="font-bold">{'\u0395\u03BA\u03C4\u03CD\u03C0\u03C9\u03C3\u03B7 \u03A5\u03C0\u03BF\u03BB\u03BF\u03AF\u03C0\u03C9\u03BD \u0395\u03B9\u03B4\u03CE\u03BD'}</div>
                            <div className="text-xs mt-1 opacity-80">
                                {'\u039C\u03CC\u03BD\u03BF \u03C4\u03B1 \u03C5\u03C0\u03CC\u03BB\u03BF\u03B9\u03C0\u03B1 \u03B5\u03AF\u03B4\u03B7 \u03C0\u03BF\u03C5 \u03B4\u03B5\u03BD \u03AD\u03C7\u03BF\u03C5\u03BD \u03C3\u03C4\u03B1\u03BB\u03B5\u03AF \u03B1\u03BA\u03CC\u03BC\u03B1.'}
                            </div>
                        </button>
                        <button
                            onClick={() => {
                                setShowShipmentPrompt(false);
                                if (hasMultipleShipments && onShowPartSelector) {
                                    onShowPartSelector();
                                } else if (orderRevisions.length > 0) {
                                    setShowVersionSelector(true);
                                } else {
                                    onPrintOrder?.(order);
                                    onClose();
                                }
                            }}
                            className="w-full p-4 rounded-2xl border-2 border-slate-200 bg-white text-slate-800 hover:bg-slate-50 transition-colors text-left"
                        >
                            <div className="font-bold">{'\u0395\u03BA\u03C4\u03CD\u03C0\u03C9\u03C3\u03B7 \u03A0\u03B1\u03C1\u03B1\u03C3\u03C4\u03B1\u03C4\u03B9\u03BA\u03BF\u03CD \u03A0\u03B1\u03C1\u03B1\u03B3\u03B3\u03B5\u03BB\u03AF\u03B1\u03C2'}</div>
                            <div className="text-xs mt-1 opacity-80">
                                {'\u0395\u03BA\u03C4\u03C5\u03C0\u03CE\u03BD\u03B5\u03B9 \u03C4\u03BF \u03BA\u03B1\u03BD\u03BF\u03BD\u03B9\u03BA\u03CC \u03C0\u03B1\u03C1\u03B1\u03C3\u03C4\u03B1\u03C4\u03B9\u03BA\u03CC \u03C4\u03B7\u03C2 \u03C0\u03B1\u03C1\u03B1\u03B3\u03B3\u03B5\u03BB\u03AF\u03B1\u03C2.'}
                            </div>
                        </button>
                        <button
                            onClick={() => setShowShipmentPrompt(false)}
                            className="w-full py-3 rounded-2xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition-colors"
                        >
                            {'\u039A\u03BB\u03B5\u03AF\u03C3\u03B9\u03BC\u03BF'}
                        </button>
                    </div>
                </div>
            </div>
        )}
        {showVersionSelector && orderRevisions.length > 0 && (
            <div className="fixed inset-0 z-[170] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
                    <div className="p-6 border-b border-slate-100 bg-indigo-50">
                        <div className="flex items-center gap-2 mb-1">
                            <History size={18} className="text-indigo-600" />
                            <h3 className="text-xl font-bold text-slate-900">{'\u0395\u03BA\u03B4\u03CC\u03C3\u03B5\u03B9\u03C2 \u03A0\u03B1\u03C1\u03B1\u03C3\u03C4\u03B1\u03C4\u03B9\u03BA\u03BF\u03CD'}</h3>
                        </div>
                        <p className="text-sm text-slate-600">
                            {'\u0397 \u03C0\u03B1\u03C1\u03B1\u03B3\u03B3\u03B5\u03BB\u03AF\u03B1 \u03AD\u03C7\u03B5\u03B9 '}{orderRevisions.length}{' \u03B5\u03BA\u03B4\u03CC\u03C3\u03B5\u03B9\u03C2 \u03BB\u03CC\u03B3\u03C9 \u03B1\u03BB\u03BB\u03B1\u03B3\u03CE\u03BD \u03C4\u03B9\u03BC\u03CE\u03BD. \u0395\u03C0\u03B9\u03BB\u03AD\u03BE\u03C4\u03B5 \u03AD\u03BA\u03B4\u03BF\u03C3\u03B7 \u03B3\u03B9\u03B1 \u03B5\u03BA\u03C4\u03CD\u03C0\u03C9\u03C3\u03B7.'}
                        </p>
                    </div>
                    <div className="p-6 space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
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
                                    className={`w-full p-4 rounded-2xl border-2 text-left transition-all hover:-translate-y-0.5 ${
                                        isCurrent
                                            ? 'border-indigo-300 bg-indigo-50 hover:bg-indigo-100'
                                            : 'border-slate-200 bg-white hover:bg-slate-50'
                                    }`}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            <span className={`font-bold ${isCurrent ? 'text-indigo-800' : 'text-slate-800'}`}>
                                                {rev.label}
                                            </span>
                                            {isCurrent && (
                                                <span className="text-[9px] font-black bg-indigo-600 text-white px-1.5 py-0.5 rounded-full uppercase">{'\u03C4\u03C1\u03AD\u03C7\u03BF\u03C5\u03C3\u03B1'}</span>
                                            )}
                                        </div>
                                        {revisionSuffix && (
                                            <span className="font-mono text-xs font-bold text-slate-500">#{order.id}{revisionSuffix}</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-slate-500">
                                        <span>
                                            {rev.timestamp ? new Date(rev.timestamp).toLocaleDateString('el-GR', {
                                                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                                            }) : ''}
                                        </span>
                                        <span className="font-mono font-bold text-slate-700">{rev.order.total_price.toFixed(2).replace('.', ',')}€</span>
                                        {rev.totalDiff !== null && rev.totalDiff !== 0 && (
                                            <span className={`font-bold ${rev.totalDiff > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                                ({rev.totalDiff > 0 ? '+' : ''}{rev.totalDiff.toFixed(2).replace('.', ',')}€)
                                            </span>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                    <div className="p-4 border-t border-slate-100">
                        <button
                            onClick={() => setShowVersionSelector(false)}
                            className="w-full py-3 rounded-2xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition-colors"
                        >
                            {'\u039A\u03BB\u03B5\u03AF\u03C3\u03B9\u03BC\u03BF'}
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
};

export default function OrdersPage({ products, onPrintOrder, onPrintRemainingOrder, onPrintShipment, onPrintLabels, materials, onPrintAggregated, onPrintPreparation, onPrintTechnician, onPrintAnalytics, onPrintPartialOrder, onOpenDeliveries }: Props) {
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    const { profile } = useAuth();
    const { data: orders, isLoading: loadingOrders, isError: ordersError, error: ordersErr, refetch: refetchOrders } = useOrders();
    const { data: customers } = useCustomers();
    const { data: batches, isLoading: loadingBatches, isError: batchesError, error: batchesErr, refetch: refetchBatches } = useProductionBatches();
    const { data: collections } = useCollections();

    // View State
    const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
    const [searchTerm, setSearchTerm] = useState('');
    const [filters, setFilters] = useState<OrderFilters>(DEFAULT_FILTERS);
    const deferredSearchTerm = React.useDeferredValue(searchTerm);

    // Tag color overrides — synced via Supabase, shared across all devices
    const { overrides: tagColorOverrides, changeTagColor: handleChangeTagColor } = useTagColorOverrides();

    // Create/Edit/Manage State
    const [isCreating, setIsCreating] = useState(false);
    const [editingOrder, setEditingOrder] = useState<Order | null>(null);
    const [managingOrder, setManagingOrder] = useState<Order | null>(null);
    const [printModalOrder, setPrintModalOrder] = useState<Order | null>(null);
    const [productionModalOrder, setProductionModalOrder] = useState<Order | null>(null);
    const [showPartSelector, setShowPartSelector] = useState(false);
    const [shipmentModalOrder, setShipmentModalOrder] = useState<Order | null>(null);
    const [showTagsManager, setShowTagsManager] = useState(false);
    const [showWorkflowActions, setShowWorkflowActions] = useState(false);
    const [showStatusActions, setShowStatusActions] = useState(false);
    const [showSellerAssignment, setShowSellerAssignment] = useState(false);
    const [quickSendingOrders, setQuickSendingOrders] = useState<Set<string>>(new Set());

    // Group Management in Modal
    const [tagInput, setTagInput] = useState('');
    const [tagInputFocused, setTagInputFocused] = useState(false);

    useEffect(() => {
        if (managingOrder) return;
        setShowTagsManager(false);
        setShowWorkflowActions(false);
        setShowStatusActions(false);
        setShowSellerAssignment(false);
        setTagInput('');
        setTagInputFocused(false);
    }, [managingOrder]);

    const productsMap = useMemo(() => new Map(products.map(product => [product.sku, product])), [products]);
    const materialsMap = useMemo(() => new Map(materials.map(material => [material.id, material])), [materials]);

    const enrichedBatches = useMemo(() => {
        const ZIRCON_CODES = ['LE', 'PR', 'AK', 'MP', 'KO', 'MV', 'RZ'];
        const NON_ZIRCON_STONE_CODES = ['TKO', 'TPR', 'TMP'];
        return batches?.map(b => {
            const prod = isSpecialCreationSku(b.sku) ? getSpecialCreationProductStub() : productsMap.get(b.sku);
            const suffix = b.variant_suffix || '';
            const stone = getVariantComponents(suffix, prod?.gender).stone;
            const hasZirconsFromSuffix = stone?.code && ZIRCON_CODES.includes(stone.code) && !NON_ZIRCON_STONE_CODES.includes(stone.code);
            const hasZirconsFromRecipe =
                !!prod?.recipe?.some((r) => {
                    if (r.type !== 'raw') return false;
                    const material = materialsMap.get(r.id);
                    return material?.type === MaterialType.Stone && ZIRCON_CODES.some((code) => material.name.includes(code));
                });
            const hasZircons = hasZirconsFromSuffix || hasZirconsFromRecipe;

            return { ...b, product_details: prod, requires_setting: hasZircons }
        }) || [];
    }, [batches, productsMap, materialsMap]);

    const batchesByOrderId = useMemo(() => {
        const map = new Map<string, typeof enrichedBatches>();
        enrichedBatches.forEach(batch => {
            if (!batch.order_id) return;
            const existing = map.get(batch.order_id);
            if (existing) existing.push(batch);
            else map.set(batch.order_id, [batch]);
        });
        return map;
    }, [enrichedBatches]);

    const orderMetaById = useMemo(() => {
        const map = new Map<string, { isReady: boolean; retailClientLabel: string }>();
        orders?.forEach(order => {
            const retailClientLabel = extractRetailClientFromNotes(order.notes).retailClientLabel;
            map.set(order.id, {
                isReady: isOrderReady(order, enrichedBatches),
                retailClientLabel
            });
        });
        return map;
    }, [orders, enrichedBatches]);

    // Derived: All unique tags across all orders (for filter panel + autocomplete)
    const allTags = useMemo(() => {
        if (!orders) return [];
        const tagSet = new Set<string>();
        orders.forEach(o => o.tags?.forEach(t => tagSet.add(t)));
        return Array.from(tagSet).sort((a, b) => a.localeCompare(b, 'el'));
    }, [orders]);

    // Derived: All unique sellers across all orders (for filter panel)
    const allSellers = useMemo(() => {
        if (!orders) return [];
        const sellerSet = new Set<string>();
        orders.forEach(o => { if (o.seller_name) sellerSet.add(o.seller_name); });
        return Array.from(sellerSet).sort((a, b) => a.localeCompare(b, 'el'));
    }, [orders]);

    const tagSuggestions = useMemo(() => {
        if (!managingOrder || !tagInputFocused) return [];
        const currentTags = managingOrder.tags || [];
        const normalizedInput = tagInput.toLowerCase();
        return allTags.filter(tag =>
            !currentTags.includes(tag) &&
            (tagInput.trim() === '' || tag.toLowerCase().includes(normalizedInput))
        );
    }, [allTags, managingOrder, tagInput, tagInputFocused]);

    const managingShipmentReadiness = useMemo(() => {
        if (!managingOrder) return null;
        return getShipmentReadiness(managingOrder.id, batchesByOrderId.get(managingOrder.id) || []);
    }, [managingOrder, batchesByOrderId]);

    // Derived: Filter orders based on Tab, Search, and all panel Filters
    const filteredOrders = useMemo(() => {
        if (!orders) return [];

        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
        const monthAgo = new Date(now); monthAgo.setMonth(now.getMonth() - 1);
        const normalizedSearch = (deferredSearchTerm ?? '').trim().toLowerCase();
        const hasSearch = normalizedSearch.length > 0;

        return orders.filter(o => {
            // Tab Filter
            const isArchived = o.is_archived === true;
            // When searching on "Ενεργές", include archived matches too.
            // When searching on "Αρχείο", keep it archived-only.
            if (!hasSearch) {
                if (activeTab === 'active' && isArchived) return false;
                if (activeTab === 'archived' && !isArchived) return false;
            } else if (activeTab === 'archived' && !isArchived) {
                return false;
            }

            // Status filter (OR)
            if (filters.statuses.size > 0 && !filters.statuses.has(o.status as OrderStatus)) return false;

            // Date filter
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

            // Seller filter (OR)
            if (filters.sellers.size > 0) {
                const sellerName = o.seller_name ?? '';
                if (!filters.sellers.has(sellerName)) return false;
            }

            // Tag filter (AND or OR)
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

            // Search Filter (ID, Name, Tags)
            if (!hasSearch) return true;
            const term = normalizedSearch;
            return (
                o.id.toLowerCase().includes(term) ||
                o.customer_name.toLowerCase().includes(term) ||
                (o.tags && o.tags.some(t => t.toLowerCase().includes(term)))
            );
        });
    }, [orders, activeTab, deferredSearchTerm, filters]);

    const ordersScrollRef = useRef<HTMLDivElement>(null);
    const ordersRowVirtualizer = useVirtualizer({
        count: filteredOrders.length,
        getScrollElement: () => ordersScrollRef.current,
        estimateSize: () => 96,
        overscan: 8
    });

    const handleEditOrder = (order: Order) => {
        setEditingOrder(order);
        setIsCreating(true);
    };

    const handleSendToProduction = async (orderId: string) => {
        const order = orders?.find(o => o.id === orderId);
        if (order) {
            setProductionModalOrder(order);
            setManagingOrder(null);
        } else {
            showToast("Σφάλμα εύρεσης παραγγελίας", "error");
        }
    };

    const handleQuickSendToProduction = async (order: Order) => {
        if (quickSendingOrders.has(order.id)) return;

        const existingBatchesForOrder = batchesByOrderId.get(order.id) || [];
        const inProductionQtyByKey = new Map<string, number>();
        existingBatchesForOrder.forEach(b => {
            const key = [b.sku, b.variant_suffix || '', b.size_info || '', b.cord_color || '', b.enamel_color || '', b.line_id || ''].join('|');
            inProductionQtyByKey.set(key, (inProductionQtyByKey.get(key) || 0) + b.quantity);
        });

        // For PartiallyDelivered orders, subtract already-shipped quantities
        // so we don't re-send items that have already been delivered to the client.
        const shippedQtyByKey = new Map<string, number>();
        if (order.status === OrderStatus.PartiallyDelivered) {
            try {
                const snapshot = await ordersRepository.getShipmentsForOrder(order.id);
                for (const si of snapshot.items) {
                    const key = [si.sku, si.variant_suffix || '', si.size_info || '', si.cord_color || '', si.enamel_color || '', si.line_id || ''].join('|');
                    shippedQtyByKey.set(key, (shippedQtyByKey.get(key) || 0) + si.quantity);
                }
            } catch { /* proceed without shipped data */ }
        }

        const itemsToSend = order.items
            .map(item => {
                const key = [item.sku, item.variant_suffix || '', item.size_info || '', item.cord_color || '', item.enamel_color || '', item.line_id || ''].join('|');
                const alreadyInProduction = inProductionQtyByKey.get(key) || 0;
                const alreadyShipped = shippedQtyByKey.get(key) || 0;
                const qty = Math.max(0, item.quantity - alreadyShipped - alreadyInProduction);
                return {
                    sku: item.sku,
                    variant: item.variant_suffix || null,
                    qty,
                    size_info: item.size_info,
                    cord_color: item.cord_color || null,
                    enamel_color: item.enamel_color || null,
                    notes: item.notes,
                    line_id: item.line_id ?? null,
                };
            })
            .filter(i => i.qty > 0);

        if (itemsToSend.length === 0) {
            showToast("Όλα τα τεμάχια έχουν ήδη σταλεί στην παραγωγή.", "info");
            return;
        }

        setQuickSendingOrders(prev => new Set([...prev, order.id]));
        try {
            await ordersRepository.sendPartialOrderToProduction(order.id, itemsToSend, products, materials);
            await invalidateOrdersAndBatches(queryClient);
            const totalQty = itemsToSend.reduce((s, i) => s + i.qty, 0);
            showToast(`Στάλθηκαν ${totalQty} τεμάχια στην παραγωγή.`, "success");
        } catch {
            showToast("Σφάλμα κατά την αποστολή στην παραγωγή.", "error");
        } finally {
            setQuickSendingOrders(prev => {
                const next = new Set(prev);
                next.delete(order.id);
                return next;
            });
        }
    };

    const onProductionSuccess = () => {
        setProductionModalOrder(null);
        void invalidateOrdersAndBatches(queryClient);
    };

    const handleRevertFromProduction = async (orderId: string) => {
        // Block revert if order has shipments
        const order = orders?.find(o => o.id === orderId);
        if (order && order.status === OrderStatus.PartiallyDelivered) {
            showToast('Δεν μπορεί να γίνει επαναφορά σε παραγγελία με ήδη πραγματοποιημένες αποστολές.', 'error');
            return;
        }

        const yes = await confirm({
            title: 'Επαναφορά από Παραγωγή',
            message: 'Αυτή η ενέργεια θα ΔΙΑΓΡΑΨΕΙ όλες τις παρτίδες παραγωγής for αυτή την εντολή και θα την επαναφέρει σε κατάσταση "Εκκρεμεί". Συνέχεια;',
            isDestructive: true,
            confirmText: 'Επαναφορά'
        });

        if (yes) {
            try {
                await ordersRepository.revertOrderFromProduction(orderId);
                void invalidateOrdersAndBatches(queryClient);
                setManagingOrder(null);
                showToast('Η παραγγελία επαναφέρθηκε επιτυχώς.', 'success');
            } catch (err: any) {
                showToast(`Σφάλμα: ${err.message}`, 'error');
            }
        }
    };

    const handleCancelOrder = async (orderId: string) => {
        const yes = await confirm({
            title: 'Ακύρωση Παραγγελίας',
            message: 'Είστε σίγουροι ότι θέλετε να ακυρώσετε αυτή την παραγγελία; Η ενέργεια θα αφαιρέσει τυχόν παρτίδες παραγωγής, αλλά θα διατηρήσει το ιστορικό.',
            isDestructive: true,
            confirmText: 'Ακύρωση'
        });

        if (yes) {
            try {
                await ordersRepository.updateOrderStatus(orderId, OrderStatus.Cancelled);
                await auditRepository.logAction(profile?.full_name || 'System', 'Ακύρωση Παραγγελίας', { order_id: orderId });
                void invalidateOrdersAndBatches(queryClient);
                setManagingOrder(null);
                showToast('Η παραγγελία ακυρώθηκε.', 'info');
            } catch (err: any) {
                showToast(`Σφάλμα: ${err.message}`, 'error');
            }
        }
    };

    const handleDeleteOrder = async (orderId: string) => {
        const yes = await confirm({
            title: 'Διαγραφή Παραγγελίας',
            message: 'ΠΡΟΣΟΧΗ: Αυτή η ενέργεια θα διαγράψει ΟΡΙΣΤΙΚΑ την παραγγελία και όλα τα δεδομένα της. Δεν μπορεί να αναιρεθεί.',
            isDestructive: true,
            confirmText: 'Οριστική Διαγραφή'
        });

        if (yes) {
            try {
                await ordersRepository.deleteOrder(orderId);
                await auditRepository.logAction(profile?.full_name || 'System', 'Διαγραφή Παραγγελίας', { order_id: orderId });
                void invalidateOrdersAndBatches(queryClient);
                setManagingOrder(null);
                showToast('Η παραγγελία διαγράφηκε οριστικά.', 'success');
            } catch (err: any) {
                showToast(`Σφάλμα: ${err.message}`, 'error');
            }
        }
    };

    // --- NEW ACTIONS ---
    const handleCompleteOrder = async (order: Order) => {
        const yes = await confirm({
            title: 'Ολοκλήρωση Παραγγελίας',
            message: 'Η παραγγελία θα σημειωθεί ως "Παραδόθηκε" (Delivered) και τα τεμάχια θα αφαιρεθούν από τη Ροή Παραγωγής. Συνέχεια;',
            confirmText: 'Ολοκλήρωση & Παράδοση'
        });
        if (yes) {
            try {
                await ordersRepository.updateOrderStatus(order.id, OrderStatus.Delivered);
                await auditRepository.logAction(profile?.full_name || 'System', 'Ολοκλήρωση Παραγγελίας', { order_id: order.id, customer: order.customer_name });
                void invalidateOrdersAndBatches(queryClient);
                if (managingOrder?.id === order.id) setManagingOrder(null);
                showToast("Η παραγγελία ολοκληρώθηκε επιτυχώς!", "success");
            } catch (e) {
                showToast("Σφάλμα ολοκλήρωσης.", "error");
            }
        }
    };

    const handleConfirmShipmentFromOrders = async (
        items: Array<{ sku: string; variant_suffix?: string | null; size_info?: string | null; cord_color?: Order['items'][number]['cord_color']; enamel_color?: Order['items'][number]['enamel_color']; quantity: number; price_at_order: number; line_id?: string | null }>,
        notes: string | null
    ) => {
        if (!shipmentModalOrder) return;
        const order = shipmentModalOrder;
        try {
            await ordersRepository.createPartialShipment({
                orderId: order.id,
                orderItems: order.items.map(i => ({ sku: i.sku, variant_suffix: i.variant_suffix, quantity: i.quantity, price_at_order: i.price_at_order, size_info: i.size_info, cord_color: i.cord_color, enamel_color: i.enamel_color, line_id: i.line_id || null })),
                items: items.map(i => ({ sku: i.sku, variant_suffix: i.variant_suffix, size_info: i.size_info, cord_color: i.cord_color, enamel_color: i.enamel_color, quantity: i.quantity, price_at_order: i.price_at_order, line_id: i.line_id || null })),
                shippedBy: profile?.full_name || 'System',
                deliveryPlanId: null,
                notes,
                allBatches: batches || []
            });
            void invalidateOrdersAndBatches(queryClient);
            showToast(`Αποστολή ${items.reduce((s, i) => s + i.quantity, 0)} τεμαχίων καταχωρήθηκε.`, 'success');
            setShipmentModalOrder(null);
        } catch (e) {
            showToast('Σφάλμα κατά την αποστολή.', 'error');
        }
    };

    const handleArchiveOrder = async (order: Order, archive: boolean) => {
        try {
            await ordersRepository.archiveOrder(order.id, archive);
            await auditRepository.logAction(profile?.full_name || 'System', archive ? 'Αρχειοθέτηση Παραγγελίας' : 'Ανάκτηση Παραγγελίας', { order_id: order.id, customer: order.customer_name });
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            if (managingOrder?.id === order.id) setManagingOrder(null);
            showToast(archive ? "Η παραγγελία αρχειοθετήθηκε." : "Η παραγγελία ανακτήθηκε.", "success");
        } catch (e) {
            showToast("Σφάλμα αρχειοθέτησης.", "error");
        }
    };

    const handleAddTag = async () => {
        if (!managingOrder || !tagInput.trim()) return;
        const currentTags = managingOrder.tags || [];
        if (currentTags.includes(tagInput.trim())) return;

        const newTags = [...currentTags, tagInput.trim()];
        try {
            await ordersRepository.updateOrder({ ...managingOrder, tags: newTags });
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            setManagingOrder(prev => prev ? ({ ...prev, tags: newTags }) : null);
            setTagInput('');
            showToast("Ετικέτα προστέθηκε.", "success");
        } catch (e) {
            showToast("Σφάλμα.", "error");
        }
    };

    const handleRemoveTag = async (tag: string) => {
        if (!managingOrder) return;
        const newTags = (managingOrder.tags || []).filter(t => t !== tag);
        try {
            await ordersRepository.updateOrder({ ...managingOrder, tags: newTags });
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            setManagingOrder(prev => prev ? ({ ...prev, tags: newTags }) : null);
            showToast("Ετικέτα αφαιρέθηκε.", "success");
        } catch (e) {
            showToast("Σφάλμα.", "error");
        }
    };

    if (isCreating) {
        return (
            <div className="bg-white rounded-3xl shadow-lg border border-slate-100 flex flex-col overflow-hidden animate-in slide-in-from-right duration-300" style={{ minHeight: 'calc(100dvh - 8rem)' }}>
                <DesktopOrderBuilder
                    onBack={() => { setIsCreating(false); setEditingOrder(null); }}
                    initialOrder={editingOrder}
                    products={products}
                    customers={customers || []}
                    collections={collections || []}
                />
            </div>
        );
    }

    if (ordersError || batchesError) {
        const err = ordersErr || batchesErr;
        return (
            <div className="space-y-6 flex flex-col">
                <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-6 rounded-r-xl" role="alert">
                    <p className="font-bold mb-2">Σφάλμα φόρτωσης</p>
                    <p>Δεν ήταν δυνατή η φόρτωση των παραγγελιών ή των παρτίδων παραγωγής.</p>
                    <p className="text-sm mt-4 font-mono bg-red-100/50 p-2 rounded">{(err as Error)?.message}</p>
                    <div className="mt-4 flex gap-2">
                        <button onClick={() => { refetchOrders(); refetchBatches(); }} className="px-4 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors">
                            Ανανέωση
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 flex flex-col">
            <DesktopPageHeader
                icon={ShoppingCart}
                title="Παραγγελίες Πελατών"
                subtitle="Διαχείριση λιανικής και χονδρικής."
                tail={(
                    <div className="flex flex-wrap gap-3">
                        <div className="flex rounded-xl bg-slate-100 p-1">
                            <button
                                type="button"
                                onClick={() => setActiveTab('active')}
                                className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition-all ${activeTab === 'active' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <ShoppingCart size={16} /> Ενεργές
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('archived')}
                                className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition-all ${activeTab === 'archived' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <Archive size={16} /> Αρχείο
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={() => { setEditingOrder(null); setIsCreating(true); }}
                            className="flex items-center gap-2 rounded-xl bg-[#060b00] px-5 py-3 font-bold text-white shadow-lg shadow-slate-200 transition-all hover:-translate-y-0.5 hover:bg-black"
                        >
                            <Plus size={20} /> Νέα Παραγγελία
                        </button>
                    </div>
                )}
            />

            {/* SEARCH BAR */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input
                    type="text"
                    placeholder="Αναζήτηση παραγγελίας, πελάτη ή ετικέτας..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-10 p-3 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/20 text-slate-700 font-medium transition-all"
                />
            </div>

            {/* FILTER PANEL */}
            <OrdersFilterPanel
                allTags={allTags}
                allSellers={allSellers}
                filters={filters}
                onChange={setFilters}
                tagColorOverrides={tagColorOverrides}
                onChangeTagColor={handleChangeTagColor}
            />

            {/* ACTIVE FILTERS SUMMARY BAR */}
            {countActiveFilters(filters) > 0 && (
                <div className="flex flex-wrap items-center gap-2 px-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest shrink-0">Ενεργά:</span>
                    {Array.from(filters.statuses).map(s => (
                        <span key={s} className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border font-bold ${getOrderStatusClasses(s)}`}>
                            {getOrderStatusIcon(s, 10)}
                            {getOrderStatusLabel(s)}
                            <button onClick={() => { const next = new Set(filters.statuses); next.delete(s); setFilters(f => ({ ...f, statuses: next })); }} className="ml-0.5 hover:opacity-70 transition-opacity"><X size={9} /></button>
                        </span>
                    ))}
                    {filters.datePreset !== 'all' && (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border font-bold bg-violet-100 text-violet-700 border-violet-200">
                            {filters.datePreset === 'today' && 'Σήμερα'}
                            {filters.datePreset === 'week' && 'Εβδομάδα'}
                            {filters.datePreset === 'month' && 'Μήνας'}
                            {filters.datePreset === 'custom' && `${filters.dateFrom ?? '…'} — ${filters.dateTo ?? '…'}`}
                            <button onClick={() => setFilters(f => ({ ...f, datePreset: 'all', dateFrom: null, dateTo: null }))} className="ml-0.5 hover:opacity-70 transition-opacity"><X size={9} /></button>
                        </span>
                    )}
                    {Array.from(filters.sellers).map(seller => (
                        <span key={seller} className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border font-bold bg-sky-100 text-sky-700 border-sky-200">
                            {seller}
                            <button onClick={() => { const next = new Set(filters.sellers); next.delete(seller); setFilters(f => ({ ...f, sellers: next })); }} className="ml-0.5 hover:opacity-70 transition-opacity"><X size={9} /></button>
                        </span>
                    ))}
                    {Array.from(filters.tags).map(tag => {
                        const c = getTagColor(tag, tagColorOverrides);
                        return (
                            <span key={tag} className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border font-bold ${c.activeBg} ${c.activeText} ${c.activeBorder}`}>
                                {tag}
                                <button onClick={() => { const next = new Set(filters.tags); next.delete(tag); setFilters(f => ({ ...f, tags: next })); }} className="ml-0.5 hover:opacity-70 transition-opacity"><X size={9} /></button>
                            </span>
                        );
                    })}
                    <button
                        onClick={() => setFilters(DEFAULT_FILTERS)}
                        className="text-[10px] font-black text-slate-400 hover:text-rose-500 flex items-center gap-0.5 ml-1 transition-colors"
                    >
                        <X size={10} /> Καθαρισμός όλων
                    </button>
                </div>
            )}

            <div ref={ordersScrollRef} className="flex-1 overflow-auto min-h-0">
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                    {/* Table header - sticky */}
                    <div className="grid grid-cols-[minmax(0,1fr)_2fr_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.45fr)_minmax(0,1fr)] gap-0 bg-slate-50 text-slate-500 font-bold uppercase text-xs sticky top-0 z-10 border-b border-slate-100">
                        <div className="p-4 pl-6">ID</div>
                        <div className="p-4">Πελάτης / Ετικέτες</div>
                        <div className="p-4">Ημερομηνία</div>
                        <div className="p-4 text-right">Ποσό</div>
                        <div className="p-4">Κατάσταση</div>
                        <div className="p-4" />
                    </div>
                    {filteredOrders.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 italic text-sm">Δεν βρέθηκαν παραγγελίες.</div>
                    ) : (
                        <div style={{ height: `${ordersRowVirtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
                            {ordersRowVirtualizer.getVirtualItems().map((virtualRow) => {
                                const order = filteredOrders[virtualRow.index];
                                const activeVat = order.vat_rate !== undefined ? order.vat_rate : 0.24;
                                const netValue = order.total_price / (1 + activeVat);
                                const orderMeta = orderMetaById.get(order.id);
                                const ready = orderMeta?.isReady || false;
                                const isRetailOrder = order.customer_id === RETAIL_CUSTOMER_ID || order.customer_name === RETAIL_CUSTOMER_NAME;
                                const retailClientLabel = orderMeta?.retailClientLabel || '';
                                return (
                                    <div
                                        key={order.id}
                                        data-index={virtualRow.index}
                                        ref={ordersRowVirtualizer.measureElement}
                                        className="grid grid-cols-[minmax(0,1fr)_2fr_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.45fr)_minmax(0,1fr)] gap-0 border-b border-slate-50 hover:bg-slate-50/80 transition-colors group absolute left-0 w-full text-sm"
                                        style={{ transform: `translateY(${virtualRow.start}px)` }}
                                    >
                                        <div className="p-4 pl-6 font-mono font-bold text-slate-800">{order.id}</div>
                                        <div className="p-4">
                                            <div className="font-bold text-slate-800">
                                                {order.customer_name}
                                                {isRetailOrder && retailClientLabel && (
                                                    <span
                                                        className={`ml-2 align-middle ${retailEndClientPillClass}`}
                                                        title="Τελικός πελάτης (λιανική)"
                                                    >
                                                        {retailClientLabel}
                                                    </span>
                                                )}
                                            </div>
                                            {order.seller_name && (
                                                <div className="mt-1.5">
                                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-bold text-sky-700">
                                                        <span className="uppercase tracking-wide text-[9px] text-sky-600">Πλάσιε</span>
                                                        <span className="text-sky-800">{order.seller_name}</span>
                                                        {order.seller_commission_percent != null && (
                                                            <span className="text-emerald-600 font-black">{order.seller_commission_percent}%</span>
                                                        )}
                                                    </span>
                                                </div>
                                            )}
                                            {order.tags && order.tags.length > 0 && (
                                                <div className="flex gap-1.5 mt-2 flex-wrap">
                                                    {order.tags.map(t => {
                                                        const c = getTagColor(t, tagColorOverrides);
                                                        return (
                                                            <span key={t} className={`text-[10px] px-2 py-1 rounded-md border font-bold uppercase tracking-wide ${c.bg} ${c.text} ${c.border}`}>{t}</span>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-4 text-slate-500">{new Date(order.created_at).toLocaleDateString('el-GR')}</div>
                                        <div className="p-4 text-right font-bold text-slate-800">{formatCurrency(netValue)}</div>
                                        <div className="p-4 min-w-0">
                                            <div className="flex flex-wrap items-start gap-2">
                                                <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-bold border ${getOrderStatusClasses(order.status)}`}>{getOrderStatusLabel(order.status)}</span>
                                                {!ready && <OrderListProgressBar order={order} batches={batches} ready={ready} density="desktop" />}
                                                {ready && order.status !== OrderStatus.Delivered && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleCompleteOrder(order); }}
                                                        className="bg-emerald-500 text-white p-1 rounded-full hover:bg-emerald-600 transition-colors shadow-sm animate-pulse shrink-0"
                                                        title="Έτοιμη για Ολοκλήρωση"
                                                    >
                                                        <CheckCircle size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="p-4 text-right">
                                            <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => setManagingOrder(order)} title="Διαχείριση" className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg"><Settings size={16} /></button>
                                                {order.status === OrderStatus.Pending && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleQuickSendToProduction(order); }}
                                                        disabled={quickSendingOrders.has(order.id)}
                                                        title="Άμεση Αποστολή στην Παραγωγή"
                                                        className="p-2 text-blue-400 hover:text-blue-700 hover:bg-blue-50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        {quickSendingOrders.has(order.id)
                                                            ? <Loader2 size={16} className="animate-spin" />
                                                            : <Factory size={16} />}
                                                    </button>
                                                )}
                                                <button onClick={() => setPrintModalOrder(order)} title="Εκτύπωση Εντολών" className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg"><Printer size={16} /></button>
                                                {activeTab === 'active' && (
                                                    <button onClick={() => handleArchiveOrder(order, true)} title="Αρχειοθέτηση" className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Archive size={16} /></button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {managingOrder && (
                <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl animate-in zoom-in-95 border border-slate-100 flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0 bg-slate-50/50">
                            <div>
                                <h3 className="text-xl font-bold text-slate-800">Διαχείριση #{managingOrder.id}</h3>
                                <p className="text-sm font-bold text-slate-500">
                                    {managingOrder.customer_name}
                                    {(managingOrder.customer_id === RETAIL_CUSTOMER_ID || managingOrder.customer_name === RETAIL_CUSTOMER_NAME) && (orderMetaById.get(managingOrder.id)?.retailClientLabel || '') && (
                                        <span
                                            className={`ml-2 align-middle ${retailEndClientPillClass}`}
                                            title="Τελικός πελάτης (λιανική)"
                                        >
                                            {orderMetaById.get(managingOrder.id)?.retailClientLabel}
                                        </span>
                                    )}
                                </p>
                            </div>
                            <button onClick={() => setManagingOrder(null)} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} /></button>
                        </div>
                        <div className="p-6 overflow-y-auto">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <button
                                    onClick={() => { handleEditOrder(managingOrder); setManagingOrder(null); }}
                                    className="p-5 rounded-2xl flex flex-col items-center justify-center gap-3 text-center font-bold border-2 bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200 transition-all hover:-translate-y-0.5"
                                >
                                    <div className="p-3 bg-white rounded-xl shadow-sm"><Edit size={20} /></div>
                                    <span className="text-xs uppercase tracking-wider">Επεξεργασία</span>
                                </button>

                                <button
                                    onClick={() => setShowTagsManager(true)}
                                    className="p-5 rounded-2xl flex flex-col items-center justify-center gap-3 text-center font-bold border-2 bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 transition-all hover:-translate-y-0.5 relative"
                                >
                                    {(managingOrder.tags?.length || 0) > 0 && (
                                        <span className="absolute top-2 right-2 bg-indigo-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">
                                            {managingOrder.tags?.length}
                                        </span>
                                    )}
                                    <div className="p-3 bg-white rounded-xl shadow-sm"><Layers size={20} /></div>
                                    <span className="text-xs uppercase tracking-wider">Ετικέτες / Ομαδοποίηση</span>
                                </button>

                                <button
                                    onClick={() => setShowWorkflowActions(true)}
                                    className="p-5 rounded-2xl flex flex-col items-center justify-center gap-3 text-center font-bold border-2 bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 transition-all hover:-translate-y-0.5"
                                >
                                    <div className="p-3 bg-white rounded-xl shadow-sm"><Factory size={20} /></div>
                                    <span className="text-xs uppercase tracking-wider">Παράδοση & Παραγωγή</span>
                                </button>

                                <button
                                    onClick={() => setShowStatusActions(true)}
                                    className="p-5 rounded-2xl flex flex-col items-center justify-center gap-3 text-center font-bold border-2 bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100 transition-all hover:-translate-y-0.5"
                                >
                                    <div className="p-3 bg-white rounded-xl shadow-sm"><Archive size={20} /></div>
                                    <span className="text-xs uppercase tracking-wider">Κατάσταση & Αρχείο</span>
                                </button>

                                <button
                                    onClick={() => setShowSellerAssignment(true)}
                                    className="p-5 rounded-2xl flex flex-col items-center justify-center gap-3 text-center font-bold border-2 bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 transition-all hover:-translate-y-0.5 relative"
                                >
                                    {managingOrder.seller_name && (
                                        <span className="absolute top-2 right-2 bg-sky-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full max-w-[80%] truncate">
                                            {managingOrder.seller_name}
                                        </span>
                                    )}
                                    <div className="p-3 bg-white rounded-xl shadow-sm"><UserCheck size={20} /></div>
                                    <span className="text-xs uppercase tracking-wider">Ανάθεση Πλασιέ</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {managingOrder && showTagsManager && (
                <div className="fixed inset-0 z-[60] bg-slate-900/55 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-slate-100 animate-in zoom-in-95">
                        <div className="p-6 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Layers size={18} /> Ετικέτες / Ομαδοποίηση</h3>
                                <p className="text-xs text-slate-500 font-mono mt-1">#{managingOrder.id}</p>
                            </div>
                            <button onClick={() => setShowTagsManager(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20} /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="flex flex-wrap gap-2 min-h-9">
                                {managingOrder.tags && managingOrder.tags.map(t => {
                                    const c = getTagColor(t, tagColorOverrides);
                                    return (
                                        <span key={t} className={`${c.bg} ${c.border} ${c.text} border px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5`}>
                                            {t}
                                            <button onClick={() => handleRemoveTag(t)} className="opacity-60 hover:opacity-100 hover:text-red-600 transition-opacity">
                                                <X size={11} />
                                            </button>
                                        </span>
                                    );
                                })}
                                {(!managingOrder.tags || managingOrder.tags.length === 0) && <span className="text-xs text-slate-400 italic">Καμία ετικέτα.</span>}
                            </div>
                            <div className="relative">
                                <div className="flex gap-2">
                                    <input
                                        value={tagInput}
                                        onChange={e => setTagInput(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleAddTag()}
                                        onFocus={() => setTagInputFocused(true)}
                                        onBlur={() => setTimeout(() => setTagInputFocused(false), 150)}
                                        placeholder="Προσθήκη ετικέτας (π.χ. 'Έκθεση A')..."
                                        className="flex-1 p-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-slate-400/20 bg-white"
                                    />
                                    <button
                                        onClick={handleAddTag}
                                        disabled={!tagInput.trim()}
                                        className="bg-slate-800 text-white px-4 py-2.5 rounded-xl font-bold text-xs hover:bg-black transition-colors disabled:opacity-40"
                                    >
                                        Προσθήκη
                                    </button>
                                </div>
                                {tagInputFocused && (() => {
                                    if (tagSuggestions.length === 0) return null;
                                    return (
                                        <div className="mt-2 bg-white border border-slate-200 rounded-xl shadow-lg z-20 overflow-hidden">
                                            <div className="text-[10px] font-bold text-slate-400 uppercase px-3 pt-2 pb-1">Υπάρχουσες ετικέτες</div>
                                            <div className="max-h-44 overflow-y-auto">
                                                {tagSuggestions.map(s => {
                                                    const c = getTagColor(s, tagColorOverrides);
                                                    return (
                                                        <button
                                                            key={s}
                                                            onMouseDown={() => { setTagInput(s); }}
                                                            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2 transition-colors"
                                                        >
                                                            <span className={`w-2.5 h-2.5 rounded-full ${c.bg} ${c.border} border-2`} />
                                                            <span className={`font-medium ${c.text}`}>{s}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {managingOrder && showWorkflowActions && (
                <div className="fixed inset-0 z-[60] bg-slate-900/55 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95">
                        <div className="p-6 border-b border-slate-100 bg-blue-50/70 flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Factory size={18} /> Παράδοση & Παραγωγή</h3>
                                <p className="text-xs text-slate-500 font-mono mt-1">#{managingOrder.id}</p>
                            </div>
                            <button onClick={() => setShowWorkflowActions(false)} className="p-2 hover:bg-white rounded-full text-slate-500"><X size={20} /></button>
                        </div>
                        <div className="p-6 space-y-3">
                            <button
                                onClick={() => { onOpenDeliveries?.(managingOrder); setManagingOrder(null); }}
                                className="w-full text-left p-4 rounded-2xl flex items-center gap-3 font-bold border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 transition-colors"
                            >
                                <Calendar size={18} /> Προγραμματισμός παράδοσης
                            </button>

                            {(orderMetaById.get(managingOrder.id)?.isReady || false) && managingOrder.status !== OrderStatus.Delivered && (
                                <button
                                    onClick={() => handleCompleteOrder(managingOrder)}
                                    className="w-full text-left p-4 rounded-2xl flex items-center gap-3 font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100"
                                >
                                    <CheckSquare size={18} /> Ολοκλήρωση & Παράδοση
                                </button>
                            )}

                            {managingShipmentReadiness?.is_partially_ready && managingOrder.status !== OrderStatus.Delivered && managingOrder.status !== OrderStatus.Cancelled && (
                                <button
                                    onClick={() => { setShipmentModalOrder(managingOrder); setManagingOrder(null); }}
                                    className="w-full text-left p-4 rounded-2xl flex items-center gap-3 font-bold bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors"
                                >
                                    <Truck size={18} /> Μερική Αποστολή ({managingShipmentReadiness.ready_qty}/{managingShipmentReadiness.total_qty} τεμ. έτοιμα)
                                </button>
                            )}

                            {(managingOrder.status === OrderStatus.Pending || managingOrder.status === OrderStatus.InProduction || managingOrder.status === OrderStatus.PartiallyDelivered) && (
                                <button
                                    onClick={() => handleSendToProduction(managingOrder.id)}
                                    className="w-full text-left p-4 rounded-2xl flex items-center gap-3 font-bold bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 transition-colors"
                                >
                                    <Factory size={18} /> Αποστολή στην Παραγωγή
                                </button>
                            )}

                            {managingOrder.status === OrderStatus.InProduction && (
                                <button
                                    onClick={() => handleRevertFromProduction(managingOrder.id)}
                                    className="w-full text-left p-4 rounded-2xl flex items-center gap-3 font-bold bg-orange-50 border border-orange-200 text-orange-700 hover:bg-orange-100 transition-colors"
                                >
                                    <RotateCcw size={18} /> Επαναφορά από Παραγωγή
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {managingOrder && showStatusActions && (
                <div className="fixed inset-0 z-[60] bg-slate-900/55 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95">
                        <div className="p-6 border-b border-slate-100 bg-violet-50/70 flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Archive size={18} /> Κατάσταση & Αρχείο</h3>
                                <p className="text-xs text-slate-500 font-mono mt-1">#{managingOrder.id}</p>
                            </div>
                            <button onClick={() => setShowStatusActions(false)} className="p-2 hover:bg-white rounded-full text-slate-500"><X size={20} /></button>
                        </div>
                        <div className="p-6 space-y-3">
                            <button
                                onClick={() => handleArchiveOrder(managingOrder, !managingOrder.is_archived)}
                                className="w-full text-left p-4 rounded-2xl flex items-center gap-3 font-bold bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 transition-colors"
                            >
                                {managingOrder.is_archived ? <ArchiveRestore size={18} /> : <Archive size={18} />}
                                {managingOrder.is_archived ? 'Ανάκτηση από Αρχείο' : 'Αρχειοθέτηση'}
                            </button>

                            {managingOrder.status !== OrderStatus.Cancelled && managingOrder.status !== OrderStatus.Delivered && (
                                <button
                                    onClick={() => handleCancelOrder(managingOrder.id)}
                                    className="w-full text-left p-4 rounded-2xl flex items-center gap-3 font-bold bg-orange-50 border border-orange-200 text-orange-700 hover:bg-orange-100 transition-colors"
                                >
                                    <Ban size={18} /> Ακύρωση
                                </button>
                            )}

                            <button
                                onClick={() => handleDeleteOrder(managingOrder.id)}
                                className="w-full text-left p-4 rounded-2xl flex items-center gap-3 font-bold bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 transition-colors"
                            >
                                <Trash2 size={18} /> Οριστική Διαγραφή
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {managingOrder && showSellerAssignment && (
                <SellerAssignmentModal
                    order={managingOrder}
                    onClose={() => setShowSellerAssignment(false)}
                    onSaved={(updatedOrder) => {
                        setManagingOrder(updatedOrder);
                        queryClient.invalidateQueries({ queryKey: ['orders'] });
                    }}
                />
            )}

            {printModalOrder && (
                <PrintOptionsModal
                    order={printModalOrder}
                    onClose={() => { setPrintModalOrder(null); setShowPartSelector(false); }}
                    onPrintOrder={onPrintOrder}
                    onPrintRemainingOrder={onPrintRemainingOrder}
                    onPrintShipment={onPrintShipment}
                    onPrintLabels={onPrintLabels}
                    onPrintAggregated={onPrintAggregated}
                    onPrintPreparation={onPrintPreparation}
                    onPrintTechnician={onPrintTechnician}
                    onPrintAnalytics={onPrintAnalytics}
                    onShowPartSelector={() => setShowPartSelector(true)}
                    products={products}
                    allBatches={enrichedBatches}
                    showToast={showToast}
                />
            )}

            {/* Part Selector Modal - shown when order has multiple shipments */}
            {printModalOrder && showPartSelector && (
                <OrderPartSelectorModal
                    order={printModalOrder}
                    batches={batchesByOrderId.get(printModalOrder.id) || []}
                    products={products}
                    onClose={() => { setPrintModalOrder(null); setShowPartSelector(false); }}
                    onPrintSelected={(selectedBatches) => {
                        if (onPrintPartialOrder) {
                            onPrintPartialOrder(printModalOrder, selectedBatches);
                        } else {
                            onPrintOrder?.(buildPartialOrderFromBatches(printModalOrder, selectedBatches));
                        }
                        setPrintModalOrder(null);
                        setShowPartSelector(false);
                    }}
                    onPrintAll={() => {
                        onPrintOrder?.(printModalOrder);
                        setPrintModalOrder(null);
                        setShowPartSelector(false);
                    }}
                />
            )}

            {productionModalOrder && collections && (
                <ProductionSendModal
                    order={productionModalOrder}
                    products={products}
                    materials={materials}
                    existingBatches={batchesByOrderId.get(productionModalOrder.id) || []}
                    onClose={() => setProductionModalOrder(null)}
                    onSuccess={onProductionSuccess}
                    collections={collections}
                    onPrintAggregated={onPrintAggregated}
                    onPrintShipment={onPrintShipment}
                    onPartialShipment={() => {
                        setShipmentModalOrder(productionModalOrder);
                        setProductionModalOrder(null);
                    }}
                />
            )}

            {shipmentModalOrder && (
                <ShipmentCreationModal
                    order={shipmentModalOrder}
                    batches={enrichedBatches}
                    products={products}
                    deliveryPlanId={null}
                    userName={profile?.full_name || 'System'}
                    onConfirm={handleConfirmShipmentFromOrders}
                    onClose={() => setShipmentModalOrder(null)}
                />
            )}
        </div>
    );
}
