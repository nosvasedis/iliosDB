
import React, { useCallback, useState, useMemo, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Order, Product, ProductionBatch, Material, ProductionStage, OrderItem, Collection, Gender, ProductionType, BatchStageHistoryEntry, StageBatchPrintData, OrderStatus } from '../types';
import { X, Factory, CheckCircle, AlertTriangle, Loader2, ArrowRight, ArrowLeft, Clock, StickyNote, History, Package, Box, Info, PauseCircle, PlayCircle, User, ShoppingCart, RefreshCcw, RefreshCw, ImageIcon, Minus, Plus, Filter, Wallet, CheckSquare, Square, Coins, Layers, Hash, Search, Printer, Scissors, Trash2, Split, Merge, FileText, AlertCircle, Save, Check, Truck, Send } from 'lucide-react';
import { checkStockForOrderItems, deductStockForOrder } from '../lib/supabase';
import { useUI } from './UIProvider';
import { formatCurrency, formatDecimal } from '../utils/pricingEngine';
import SkuColorizedText from './SkuColorizedText';
import { useQueryClient } from '@tanstack/react-query';
import { groupBatchesByShipment } from '../utils/orderReadiness';
import { getShippedQuantities, itemKey } from '../utils/shipmentUtils';
import { getProductOptionColorLabel } from '../utils/xrOptions';
import BatchHistoryModal from './BatchHistoryModal';
import { PRODUCTION_STAGES, getProductionStageLabel, getProductionStageShortLabel } from '../utils/productionStages';
import { getProductionTimingInfo, getProductionTimingStatusClasses } from '../utils/productionTiming';
import { buildBatchStageHistoryMap, getStageColorKey, isStageNotRequired } from '../features/production/selectors';
import { groupProductionBatchesByStage } from '../features/production/workflowSelectors';
import { buildOrderItemIdentityKey } from '../features/orders/printHelpers';
import { getSpecialCreationProductStub, isSpecialCreationSku } from '../utils/specialCreationSku';
import { useOrderShipmentsForOrder } from '../hooks/api/useOrders';
import { useBatchStageHistoryEntries } from '../hooks/api/useProductionBatches';
import { ordersRepository } from '../features/orders';
import { productionRepository } from '../features/production';
import { invalidateOrdersAndBatches, invalidateProductionBatches } from '../lib/queryInvalidation';

interface Props {
    order: Order;
    products: Product[];
    materials: Material[];
    existingBatches: ProductionBatch[];
    collections?: Collection[];
    onClose: () => void;
    onSuccess: () => void;
    onPrintAggregated?: (batches: ProductionBatch[], orderDetails?: { orderId: string, customerName: string }) => void;
    onPrintStageBatches?: (data: StageBatchPrintData) => void;
    onBack?: () => void; // Optional: navigate back to quick picker
    onPartialShipment?: () => void;
}

const STAGES = PRODUCTION_STAGES.map((stage) => ({
    id: stage.id,
    label: stage.label,
    color:
        stage.id === ProductionStage.AwaitingDelivery ? 'bg-indigo-100/60 border-indigo-200 text-indigo-800' :
        stage.id === ProductionStage.Waxing ? 'bg-slate-100 border-slate-200 text-slate-800' :
        stage.id === ProductionStage.Casting ? 'bg-orange-100/60 border-orange-200 text-orange-800' :
        stage.id === ProductionStage.Setting ? 'bg-purple-100/60 border-purple-200 text-purple-800' :
        stage.id === ProductionStage.Polishing ? 'bg-blue-100/60 border-blue-200 text-blue-800' :
        stage.id === ProductionStage.Assembly ? 'bg-pink-100/60 border-pink-200 text-pink-800' :
        stage.id === ProductionStage.Labeling ? 'bg-yellow-100/60 border-yellow-200 text-yellow-800' :
        'bg-emerald-100/60 border-emerald-200 text-emerald-800'
}));

const STAGE_SHORT_LABELS: Record<string, string> = {
    [ProductionStage.AwaitingDelivery]: getProductionStageShortLabel(ProductionStage.AwaitingDelivery),
    [ProductionStage.Waxing]: getProductionStageShortLabel(ProductionStage.Waxing),
    [ProductionStage.Casting]: getProductionStageShortLabel(ProductionStage.Casting),
    [ProductionStage.Setting]: getProductionStageShortLabel(ProductionStage.Setting),
    [ProductionStage.Polishing]: getProductionStageShortLabel(ProductionStage.Polishing),
    [ProductionStage.Assembly]: getProductionStageShortLabel(ProductionStage.Assembly),
    [ProductionStage.Labeling]: getProductionStageShortLabel(ProductionStage.Labeling),
    [ProductionStage.Ready]: getProductionStageShortLabel(ProductionStage.Ready)
};

// Stage colors for movement buttons - matching ProductionBatchCard
const STAGE_BUTTON_COLORS: Record<string, { bg: string, text: string, border: string }> = {
    'AwaitingDelivery': { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
    'Waxing': { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
    'Casting': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
    'Setting': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
    'Polishing': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
    'Assembly': { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
    'Labeling': { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
    'Ready': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
};

interface RowItem extends OrderItem {
    shippedQty: number;
    openOrderQty: number;
    readyQty: number;
    inProgressQty: number;
    remainingQty: number;
    toSendQty: number;
    batchDetails: ProductionBatch[];
    gender?: Gender;
    collectionId?: number;
    price: number;
    originalIndex: number;
}

const VIBRANT_STAGES: Record<string, string> = {
    [ProductionStage.AwaitingDelivery]: 'bg-indigo-500',
    [ProductionStage.Waxing]: 'bg-slate-500',
    [ProductionStage.Casting]: 'bg-orange-500',
    [ProductionStage.Setting]: 'bg-purple-500',
    [ProductionStage.Polishing]: 'bg-blue-500',
    [ProductionStage.Assembly]: 'bg-pink-500',
    [ProductionStage.Labeling]: 'bg-yellow-500',
    [ProductionStage.Ready]: 'bg-emerald-500'
};

const BulkStageActions = ({
    onMove,
    disabled
}: {
    onMove: (stage: ProductionStage) => void;
    disabled: boolean;
}) => (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 xl:grid-cols-8">
        {STAGES.map((stage) => {
            const stageColors = STAGE_BUTTON_COLORS[getStageColorKey(stage.id as ProductionStage)];
            return (
                <button
                    key={`bulk-stage-${stage.id}`}
                    onClick={() => onMove(stage.id as ProductionStage)}
                    disabled={disabled}
                    className={`min-h-[44px] rounded-xl border px-2 py-2 text-[10px] font-black leading-tight transition-all ${stageColors.bg} ${stageColors.text} ${stageColors.border} hover:shadow-sm disabled:opacity-40 disabled:cursor-not-allowed`}
                    title={`Μετακίνηση επιλεγμένων σε ${stage.label}`}
                >
                    <span className="block text-center break-words leading-tight">{stage.label}</span>
                </button>
            );
        })}
    </div>
);

const StageFlowRail = ({
    batch,
    onMove,
    disabled
}: {
    batch: ProductionBatch;
    onMove: (stage: ProductionStage) => void;
    disabled: boolean;
}) => {
    const currentStageIndex = STAGES.findIndex((stage) => stage.id === batch.current_stage);

    return (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
            {STAGES.map((stage, index) => {
                const stageId = stage.id as ProductionStage;
                const stageColors = STAGE_BUTTON_COLORS[getStageColorKey(stageId)];
                const isCurrentStage = stageId === batch.current_stage;
                const isCompletedStage = index < currentStageIndex;
                const isUnavailableStage = !isCurrentStage && isStageNotRequired(batch, stageId);
                const isClickable = !disabled && !batch.on_hold && !isCurrentStage && !isUnavailableStage;
                const helperText = isCurrentStage
                    ? 'Τρέχον'
                    : isUnavailableStage
                    ? 'Δεν χρειάζεται'
                    : isCompletedStage
                    ? 'ΟΚ'
                    : '';

                const className = isCurrentStage
                    ? `${stage.color} ring-2 ring-offset-1 ring-current/25 shadow-md saturate-150`
                    : isUnavailableStage
                    ? 'bg-slate-50 text-slate-400 border-slate-200'
                    : isCompletedStage
                    ? `${stageColors.bg} ${stageColors.text} ${stageColors.border} opacity-45`
                    : `${stageColors.bg} ${stageColors.text} ${stageColors.border} hover:-translate-y-0.5 hover:shadow-sm`;

                const title = isCurrentStage
                    ? `${stage.label} (τρέχον στάδιο)`
                    : isUnavailableStage
                    ? `${stage.label} (δεν απαιτείται για αυτή την παρτίδα)`
                    : `Μετακίνηση σε ${stage.label}`;

                return (
                    <button
                        key={stage.id}
                        onClick={() => isClickable && onMove(stageId)}
                        disabled={!isClickable}
                        className={`min-h-[54px] rounded-2xl border px-3 py-2 text-left transition-all ${className} ${!isClickable ? 'cursor-default' : ''}`}
                        title={title}
                    >
                        <span className="flex items-start justify-between gap-2">
                            <span className="text-[11px] font-black leading-tight break-words">{stage.label}</span>
                            {isCurrentStage && <CheckCircle size={12} className="shrink-0" />}
                            {isCompletedStage && !isCurrentStage && !isUnavailableStage && <Check size={12} className="shrink-0 opacity-80" />}
                        </span>
                        {helperText && (
                            <span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.12em] opacity-75">
                                {helperText}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
};

export default function ProductionSendModal({ order, products, materials, existingBatches, collections, onClose, onSuccess, onPrintAggregated, onPrintStageBatches, onBack, onPartialShipment }: Props) {
    const { showToast, confirm } = useUI();
    const queryClient = useQueryClient();
    const { data: shipmentSnapshot, isLoading: isLoadingShipments } = useOrderShipmentsForOrder(order.id);
    const { data: batchStageHistoryEntries = [] } = useBatchStageHistoryEntries();
    const [isSending, setIsSending] = useState(false);
    const [isWorking, setIsWorking] = useState(false); // Global blocker for internal actions
    const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
    const [zoomImageAlt, setZoomImageAlt] = useState<string>('');

    const [filterGender, setFilterGender] = useState<'All' | Gender>('All');
    const [filterCollection, setFilterCollection] = useState<number | 'All'>('All');
    const [searchTerm, setSearchTerm] = useState('');
    const [toSendQuantities, setToSendQuantities] = useState<Record<number, number>>({});

    // Stock Decision State
    const [stockDecision, setStockDecision] = useState<{
        items: Array<{ sku: string; variant_suffix: string | null; size_info: string | null; cord_color?: string | null; enamel_color?: string | null; line_id?: string | null; requested_qty: number; available_in_stock: number; fromStock: number }>;
        originalItemsToSend: Array<{ sku: string; variant: string | null; qty: number; size_info?: string; cord_color?: string | null; enamel_color?: string | null; notes?: string; line_id?: string | null }>;
    } | null>(null);

    // Split Modal State
    const [splitTarget, setSplitTarget] = useState<{ batch: ProductionBatch, maxQty: number } | null>(null);
    const [splitQty, setSplitQty] = useState(1);
    const [splitStage, setSplitStage] = useState<ProductionStage>(ProductionStage.Waxing);

    // Note Editing State
    const [editingNoteBatch, setEditingNoteBatch] = useState<ProductionBatch | null>(null);
    const [noteText, setNoteText] = useState('');
    const [holdingBatch, setHoldingBatch] = useState<ProductionBatch | null>(null);
    const [holdReason, setHoldReason] = useState('');
    const [historyModalBatch, setHistoryModalBatch] = useState<ProductionBatch | null>(null);
    const [batchHistory, setBatchHistory] = useState<BatchStageHistoryEntry[]>([]);

    // Stage Popup State
    const [activeStagePopup, setActiveStagePopup] = useState<ProductionStage | null>(null);
    const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
    const batchHistoryLookup = useMemo(() => buildBatchStageHistoryMap(batchStageHistoryEntries), [batchStageHistoryEntries]);
    const getBatchTiming = useCallback((batch: ProductionBatch) => {
        return getProductionTimingInfo(batch, batchHistoryLookup.get(batch.id));
    }, [batchHistoryLookup]);

    // Order Financials
    const vatRate = order.vat_rate !== undefined ? order.vat_rate : 0.24;
    const discountFactor = 1 - ((order.discount_percent || 0) / 100);

    // --- NEW: STAGE COUNT SUMMARY ---
    const stageCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        existingBatches.forEach(b => {
            counts[b.current_stage] = (counts[b.current_stage] || 0) + b.quantity;
        });
        return counts;
    }, [existingBatches]);

    const totalInProduction = existingBatches.reduce((sum, b) => sum + b.quantity, 0);
    const readyCount = existingBatches.filter(b => b.current_stage === ProductionStage.Ready).reduce((sum, b) => sum + b.quantity, 0);
    const canPartialShip = readyCount > 0 && order.status !== OrderStatus.Delivered && order.status !== OrderStatus.Cancelled && !!onPartialShipment;
    // --------------------------------

    // Popup Data
    const popupItems = useMemo(() => {
        if (!activeStagePopup) return [];

        const targetBatches = existingBatches.filter(b => b.current_stage === activeStagePopup);
        const groups: Record<string, {
            sku: string,
            variant: string,
            size?: string,
            qty: number,
            img?: string | null,
            notes: string[],
            gender: Gender,
            category: string // Added category for display
        }> = {};

        targetBatches.forEach(b => {
            const key = buildOrderItemIdentityKey(b);
            if (!groups[key]) {
                const product = products.find(p => p.sku === b.sku);
                const stub = isSpecialCreationSku(b.sku) ? getSpecialCreationProductStub() : null;
                groups[key] = {
                    sku: b.sku,
                    variant: b.variant_suffix || '',
                    size: b.size_info,
                    qty: 0,
                    img: product?.image_url ?? null,
                    notes: [],
                    gender: stub?.gender ?? product?.gender ?? Gender.Unisex,
                    category: stub?.category ?? product?.category ?? 'Προϊόν'
                };
            }
            groups[key].qty += b.quantity;
            if (b.notes) groups[key].notes.push(b.notes);
        });

        return Object.values(groups).sort((a, b) => a.sku.localeCompare(b.sku));
    }, [activeStagePopup, existingBatches, products]);

    // Popup Batches - individual batches for stage popup with movement buttons
    const popupBatches = useMemo(() => {
        if (!activeStagePopup) return [];
        return existingBatches
            .filter(b => b.current_stage === activeStagePopup)
            .sort((a, b) => {
                // Sort by SKU, then variant, then size
                const skuCompare = a.sku.localeCompare(b.sku);
                if (skuCompare !== 0) return skuCompare;
                const variantCompare = (a.variant_suffix || '').localeCompare(b.variant_suffix || '');
                if (variantCompare !== 0) return variantCompare;
                return (a.size_info || '').localeCompare(b.size_info || '');
            });
    }, [activeStagePopup, existingBatches]);

    const shippedQuantities = useMemo(
        () => getShippedQuantities(shipmentSnapshot?.items || []),
        [shipmentSnapshot]
    );

    const rows = useMemo(() => {
        const mapped = order.items.map((item, index) => {
            const product = products.find(p => p.sku === item.sku);
            const key = itemKey(item.sku, item.variant_suffix, item.size_info, item.cord_color, item.enamel_color, item.line_id);
            const shippedQty = shippedQuantities.get(key) || 0;

            const relevantBatches = existingBatches.filter(b =>
                buildOrderItemIdentityKey(b) === buildOrderItemIdentityKey(item)
            ).sort((a, b) => {
                const stages = Object.values(ProductionStage);
                return stages.indexOf(a.current_stage) - stages.indexOf(b.current_stage);
            });

            const readyQty = relevantBatches
                .filter(b => b.current_stage === ProductionStage.Ready)
                .reduce((s, b) => s + b.quantity, 0);

            const inProgressQty = relevantBatches
                .filter(b => b.current_stage !== ProductionStage.Ready)
                .reduce((s, b) => s + b.quantity, 0);

            const sentTotal = readyQty + inProgressQty;
            const openOrderQty = Math.max(0, item.quantity - shippedQty);
            const remainingQty = Math.max(0, openOrderQty - sentTotal);

            return {
                ...item,
                shippedQty,
                openOrderQty,
                readyQty,
                inProgressQty,
                remainingQty,
                toSendQty: remainingQty,
                batchDetails: relevantBatches,
                gender: isSpecialCreationSku(item.sku) ? getSpecialCreationProductStub().gender : (product?.gender || 'Unknown'),
                collectionId: isSpecialCreationSku(item.sku) ? undefined : product?.collections?.[0],
                price: item.price_at_order,
                originalIndex: index
            } as RowItem;
        });

        // 1. Sort Alphabetically by SKU
        return mapped.sort((a, b) => {
            const skuA = a.sku + (a.variant_suffix || '');
            const skuB = b.sku + (b.variant_suffix || '');
            return skuA.localeCompare(skuB, undefined, { numeric: true });
        });
    }, [order.items, existingBatches, products, shippedQuantities]);

    const totalRemaining = useMemo(() => rows.reduce((s, r) => s + r.remainingQty, 0), [rows]);

    const shipmentHistory = useMemo(() => groupBatchesByShipment(existingBatches), [existingBatches]);

    function canMoveBatchToStage(batch: ProductionBatch, stage: ProductionStage) {
        if (batch.on_hold) return false;
        if (batch.current_stage === stage) return false;
        if (stage === ProductionStage.Setting && !batch.requires_setting) return false;
        if (stage === ProductionStage.Assembly && !batch.requires_assembly) return false;
        return true;
    }

    const relevantCollections = useMemo(() => {
        if (!collections) return [];
        const orderCollectionIds = new Set<number>();
        order.items.forEach(item => {
            const product = products.find(p => p.sku === item.sku);
            product?.collections?.forEach(id => orderCollectionIds.add(id));
        });
        return collections.filter(c => orderCollectionIds.has(c.id));
    }, [collections, order.items, products]);

    // Close zoom overlay on Escape
    useEffect(() => {
        if (!zoomImageUrl) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setZoomImageUrl(null);
                setZoomImageAlt('');
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [zoomImageUrl]);

    const filteredRows = useMemo(() => {
        return rows.filter(row => {
            if (filterGender !== 'All' && !isSpecialCreationSku(row.sku) && row.gender !== filterGender) return false;
            if (filterCollection !== 'All') {
                if (isSpecialCreationSku(row.sku)) return true;
                const product = products.find(p => p.sku === row.sku);
                if (!product?.collections?.includes(filterCollection)) return false;
            }
            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                const product = products.find(p => p.sku === row.sku);
                const stub = isSpecialCreationSku(row.sku) ? getSpecialCreationProductStub() : null;
                const matchesSku = row.sku.toLowerCase().includes(term);
                const matchesSuffix = (row.variant_suffix || '').toLowerCase().includes(term);
                const matchesCategory =
                    product?.category?.toLowerCase().includes(term) ||
                    stub?.description?.toLowerCase().includes(term) ||
                    false;
                const matchesNotes = (row.notes || '').toLowerCase().includes(term);
                if (!matchesSku && !matchesSuffix && !matchesCategory && !matchesNotes) return false;
            }
            return true;
        });
    }, [rows, filterGender, filterCollection, products, searchTerm]);

    const visibleActiveBatches = useMemo(
        () => filteredRows.flatMap((row) => row.batchDetails),
        [filteredRows]
    );

    const visiblePopupBatchIds = useMemo(
        () => popupBatches.map((batch) => batch.id),
        [popupBatches]
    );

    const selectedVisibleActiveCount = useMemo(
        () => visibleActiveBatches.filter((batch) => selectedBatchIds.includes(batch.id)).length,
        [selectedBatchIds, visibleActiveBatches]
    );

    const selectedVisiblePopupCount = useMemo(
        () => visiblePopupBatchIds.filter((id) => selectedBatchIds.includes(id)).length,
        [selectedBatchIds, visiblePopupBatchIds]
    );

    const toggleBatchSelection = (batchId: string) => {
        setSelectedBatchIds((prev) => prev.includes(batchId) ? prev.filter((id) => id !== batchId) : [...prev, batchId]);
    };

    const selectBatchIds = (batchIds: string[]) => {
        setSelectedBatchIds((prev) => Array.from(new Set([...prev, ...batchIds])));
    };

    const clearBatchSelection = (batchIds?: string[]) => {
        if (!batchIds) {
            setSelectedBatchIds([]);
            return;
        }
        setSelectedBatchIds((prev) => prev.filter((id) => !batchIds.includes(id)));
    };

    const currentSendValue = useMemo(() => {
        return order.items.reduce((sum, item, idx) => {
            const qty = toSendQuantities[idx] || 0;
            return sum + (qty * item.price_at_order * discountFactor);
        }, 0);
    }, [order.items, toSendQuantities, discountFactor]);

    const totalToSend = (Object.values(toSendQuantities) as number[]).reduce((a, b) => a + b, 0);

    const updateToSend = (originalIdx: number, val: number) => {
        const item = order.items[originalIdx];
        if (!item) return;

        // Find the row to get the correct remaining quantity (which accounts for production batches)
        const row = rows.find(r => r.originalIndex === originalIdx);
        const maxQty = row ? row.remainingQty : item.quantity;

        setToSendQuantities(prev => ({
            ...prev,
            [originalIdx]: Math.min(maxQty, Math.max(0, val))
        }));
    };

    const handleSelectVisible = () => {
        if (isLoadingShipments) {
            showToast("Περιμένετε να φορτωθεί το ιστορικό αποστολών.", "info");
            return;
        }
        const newQuantities = { ...toSendQuantities };
        filteredRows.forEach(row => {
            if (row.remainingQty > 0) newQuantities[row.originalIndex] = row.remainingQty;
        });
        setToSendQuantities(newQuantities);
    };

    const handleClearSelection = () => setToSendQuantities({});

    const handleSend = async () => {
        if (isLoadingShipments) {
            showToast("Περιμένετε να φορτωθεί το ιστορικό αποστολών.", "info");
            return;
        }

        const itemsToSend = rows.map((r) => ({
            sku: r.sku,
            variant: r.variant_suffix || null,
            qty: toSendQuantities[r.originalIndex] || 0,
            size_info: r.size_info,
            cord_color: r.cord_color || null,
            enamel_color: r.enamel_color || null,
            notes: r.notes,
            line_id: r.line_id ?? null
        })).filter(i => i.qty > 0);

        if (itemsToSend.length === 0) {
            showToast("Δεν επιλέχθηκαν τεμάχια για αποστολή.", "info");
            return;
        }

        // Check stock availability before sending
        const stockCheck = checkStockForOrderItems(itemsToSend, products);
        const hasStock = stockCheck.some(s => s.available_in_stock > 0);

        if (hasStock) {
            // Show stock decision overlay
            setStockDecision({
                items: stockCheck.map(s => ({
                    ...s,
                    fromStock: Math.min(s.available_in_stock, s.requested_qty)
                })),
                originalItemsToSend: itemsToSend
            });
            return;
        }

        // No stock available — send everything to production directly
        await executeSend(itemsToSend);
    };

    const executeSend = async (
        itemsToSend: Array<{ sku: string; variant: string | null; qty: number; size_info?: string; cord_color?: string | null; enamel_color?: string | null; notes?: string; line_id?: string | null }>,
        stockFulfilledItems?: Array<{ sku: string; variant_suffix: string | null; qty: number; size_info?: string | null; cord_color?: string | null; enamel_color?: string | null; line_id?: string | null }>
    ) => {
        setIsSending(true);
        try {
            // Deduct stock first if any items taken from stock
            if (stockFulfilledItems && stockFulfilledItems.length > 0) {
                await deductStockForOrder(order.id, stockFulfilledItems, products);
            }

            await ordersRepository.sendPartialOrderToProduction(order.id, itemsToSend, products, materials, stockFulfilledItems);
            await Promise.all([
                invalidateOrdersAndBatches(queryClient),
                queryClient.invalidateQueries({ queryKey: ['products'] })
            ]);
            showToast(`Επιτυχής αποστολή ${itemsToSend.length} ειδών.`, "success");
            setToSendQuantities({});
            setStockDecision(null);
        } catch (e) {
            showToast("Σφάλμα κατά την αποστολή.", "error");
        } finally {
            setIsSending(false);
        }
    };

    const handleConfirmStockDecision = async () => {
        if (!stockDecision) return;

        const stockFulfilled = stockDecision.items
            .filter(i => i.fromStock > 0)
            .map(i => ({ sku: i.sku, variant_suffix: i.variant_suffix, qty: i.fromStock, size_info: i.size_info, cord_color: i.cord_color || null, enamel_color: i.enamel_color || null, line_id: i.line_id ?? null }));

        // Build the production items: reduce qty by fromStock for items partially in stock, remove items fully in stock
        const productionItems = stockDecision.originalItemsToSend.map(orig => {
            const matchKey = buildOrderItemIdentityKey({
                sku: orig.sku,
                variant_suffix: orig.variant,
                size_info: orig.size_info,
                cord_color: orig.cord_color as OrderItem['cord_color'],
                enamel_color: orig.enamel_color as OrderItem['enamel_color'],
                line_id: orig.line_id ?? null
            });
            const match = stockDecision.items.find(s => buildOrderItemIdentityKey({
                sku: s.sku,
                variant_suffix: s.variant_suffix,
                size_info: s.size_info,
                cord_color: s.cord_color as OrderItem['cord_color'],
                enamel_color: s.enamel_color as OrderItem['enamel_color'],
                line_id: s.line_id ?? null
            }) === matchKey);
            if (!match) return orig;
            const prodQty = orig.qty - match.fromStock;
            return { ...orig, qty: prodQty };
        }).filter(i => i.qty > 0);

        // If all items from stock, still pass the original items for status tracking, but with 0 production
        await executeSend(
            productionItems.length > 0 ? productionItems : stockDecision.originalItemsToSend.map(i => ({ ...i, qty: 0 })),
            stockFulfilled
        );
    };

    // --- BATCH MANAGEMENT ACTIONS ---

    const handleStageMove = async (batch: ProductionBatch, newStage: ProductionStage) => {
        if (isWorking) return;
        setIsWorking(true);
        try {
            await productionRepository.updateBatchStage(batch.id, newStage);
            await Promise.all([
                invalidateOrdersAndBatches(queryClient),
                queryClient.invalidateQueries({ queryKey: ['products'] })
            ]);
            showToast("Η παρτίδα μετακινήθηκε.", "success");
        } catch (e) {
            showToast("Σφάλμα ενημέρωσης.", "error");
        } finally {
            setIsWorking(false);
        }
    };

    const handleDeleteBatch = async (batch: ProductionBatch) => {
        if (isWorking) return;
        if (!await confirm({ title: 'Διαγραφή', message: `Διαγραφή παρτίδας (${batch.quantity} τεμ);`, isDestructive: true })) return;

        setIsWorking(true);
        try {
            await productionRepository.deleteProductionBatch(batch.id);
            await Promise.all([
                invalidateOrdersAndBatches(queryClient),
                queryClient.invalidateQueries({ queryKey: ['products'] })
            ]);
            showToast("Η παρτίδα διαγράφηκε.", "info");
        } catch (e) {
            showToast("Σφάλμα διαγραφής.", "error");
        } finally {
            setIsWorking(false);
        }
    };

    const handleRevertBatch = async (batch: ProductionBatch) => {
        if (isWorking) return;

        const batchLabel = [
            `${batch.sku}${batch.variant_suffix || ''}`,
            batch.size_info,
            batch.cord_color ? `Κορδόνι: ${getProductOptionColorLabel(batch.cord_color)}` : null,
            batch.enamel_color ? `Σμάλτο: ${getProductOptionColorLabel(batch.enamel_color)}` : null
        ].filter(Boolean).join(' / ');
        const stockHint = batch.type === 'Από Stock'
            ? ' Η ποσότητα θα επιστραφεί και στο απόθεμα.'
            : '';

        const confirmed = await confirm({
            title: 'Επαναφορά παρτίδας',
            message: `Η παρτίδα ${batchLabel} (${batch.quantity} τεμ.) θα αφαιρεθεί από την παραγωγή και η ποσότητα θα επιστρέψει ως εκκρεμής στην παραγγελία, ώστε να σταλεί ξανά αργότερα.${stockHint}`,
            isDestructive: true,
            confirmText: 'Επαναφορά'
        });

        if (!confirmed) return;

        setIsWorking(true);
        try {
            await productionRepository.revertProductionBatch(batch.id);
            await Promise.all([
                invalidateOrdersAndBatches(queryClient),
                queryClient.invalidateQueries({ queryKey: ['products'] })
            ]);
            showToast("Η παρτίδα επανήλθε επιτυχώς και μπορεί να σταλεί ξανά αργότερα.", "success");
        } catch (e) {
            showToast("Σφάλμα κατά την επαναφορά της παρτίδας.", "error");
        } finally {
            setIsWorking(false);
        }
    };

    const handleMergeAllParts = async () => {
        if (isWorking || shipmentHistory.length < 2) return;

        const confirmed = await confirm({
            title: 'Συγχώνευση Τμημάτων',
            message: `Τα ${shipmentHistory.length} τμήματα θα ενοποιηθούν σε ένα. Θα χρησιμοποιηθεί η ημερομηνία του πρώτου τμήματος. Η ενέργεια δεν αναιρείται εύκολα.`,
            confirmText: 'Συγχώνευση',
            cancelText: 'Ακύρωση',
        });
        if (!confirmed) return;

        // The earliest group is last in the array (sorted newest-first)
        const earliestGroup = shipmentHistory[shipmentHistory.length - 1];
        const earliestCreatedAt = earliestGroup[1][0].created_at;

        // Collect all batch IDs that are NOT already in the earliest group
        const earliestMinute = earliestGroup[0];
        const batchIdsToMove = shipmentHistory
            .filter(([dateKey]) => dateKey !== earliestMinute)
            .flatMap(([, batches]) => batches.map((b) => b.id));

        if (batchIdsToMove.length === 0) return;

        setIsWorking(true);
        try {
            await productionRepository.mergeBatchParts(batchIdsToMove, earliestCreatedAt);
            await invalidateProductionBatches(queryClient);
            showToast('Τα τμήματα συγχωνεύτηκαν επιτυχώς.', 'success');
        } catch (e) {
            showToast('Σφάλμα συγχώνευσης τμημάτων.', 'error');
        } finally {
            setIsWorking(false);
        }
    };

    const handleToggleHold = async (batch: ProductionBatch) => {
        if (isWorking) return;

        if (batch.on_hold) {
            setIsWorking(true);
            try {
                await productionRepository.toggleBatchHold(batch.id, false);
                await invalidateProductionBatches(queryClient);
                showToast('Η παρτίδα συνεχίζει την παραγωγή.', 'success');
            } catch (e) {
                showToast('Σφάλμα ενημέρωσης αναμονής.', 'error');
            } finally {
                setIsWorking(false);
            }
            return;
        }

        setHoldingBatch(batch);
        setHoldReason(batch.on_hold_reason || '');
    };

    const confirmHold = async () => {
        if (!holdingBatch || !holdReason.trim()) return;
        setIsWorking(true);
        try {
            await productionRepository.toggleBatchHold(holdingBatch.id, true, holdReason.trim());
            await invalidateProductionBatches(queryClient);
            showToast('Η παρτίδα τέθηκε σε αναμονή.', 'warning');
            setHoldingBatch(null);
            setHoldReason('');
        } catch (e) {
            showToast('Σφάλμα ενημέρωσης αναμονής.', 'error');
        } finally {
            setIsWorking(false);
        }
    };

    const handleBulkStageMove = async (newStage: ProductionStage, batchIds = selectedBatchIds) => {
        if (isWorking || batchIds.length === 0) return;
        setIsWorking(true);
        try {
            const summary = await productionRepository.bulkUpdateBatchStages(batchIds, newStage);
            await Promise.all([
                invalidateOrdersAndBatches(queryClient),
                queryClient.invalidateQueries({ queryKey: ['products'] })
            ]);
            clearBatchSelection(batchIds);
            showToast(`Μετακινήθηκαν ${summary.movedCount} παρτίδες${summary.skippedCount > 0 ? `, παραλείφθηκαν ${summary.skippedCount}` : ''}.`, summary.movedCount > 0 ? "success" : "info");
        } catch (e) {
            showToast("Σφάλμα μαζικής μετακίνησης.", "error");
        } finally {
            setIsWorking(false);
        }
    };

    const handleMergeBatches = async (stage: ProductionStage, batchesToMerge: ProductionBatch[]) => {
        if (isWorking) return;
        if (batchesToMerge.length < 2) return;

        const totalQty = batchesToMerge.reduce((sum, b) => sum + b.quantity, 0);

        const yes = await confirm({
            title: 'Συγχώνευση Παρτίδων',
            message: `Θα συγχωνευθούν ${batchesToMerge.length} παρτίδες στο στάδιο "${STAGES.find(s => s.id === stage)?.label}" σε μία ενιαία παρτίδα των ${totalQty} τεμαχίων.`,
            confirmText: 'Συγχώνευση'
        });

        if (!yes) return;

        setIsWorking(true);
        try {
            const target = batchesToMerge[0];
            const sourceIds = batchesToMerge.slice(1).map(b => b.id);

            await productionRepository.mergeBatches(target.id, sourceIds, totalQty);
            await invalidateProductionBatches(queryClient);

            showToast("Επιτυχής συγχώνευση.", "success");
        } catch (e) {
            console.error(e);
            showToast("Σφάλμα συγχώνευσης.", "error");
        } finally {
            setIsWorking(false);
        }
    };

    const handleSaveNote = async () => {
        if (!editingNoteBatch) return;
        setIsWorking(true);
        try {
            const { error } = await productionRepository.updateBatchNotes(editingNoteBatch.id, noteText || null);
            if (error) throw error;

            await invalidateProductionBatches(queryClient);
            showToast("Η σημείωση ενημερώθηκε.", "success");
            setEditingNoteBatch(null);
        } catch (e) {
            showToast("Σφάλμα ενημέρωσης.", "error");
        } finally {
            setIsWorking(false);
        }
    };

    const handleViewHistory = async (batch: ProductionBatch) => {
        setHistoryModalBatch(batch);
        try {
            const history = await productionRepository.getBatchHistory(batch.id);
            setBatchHistory(history);
        } catch (e) {
            console.error('Failed to load batch history:', e);
            setBatchHistory([]);
            showToast('Αποτυχία φόρτωσης ιστορικού παρτίδας.', 'error');
        }
    };

    const openSplitModal = (batch: ProductionBatch) => {
        if (batch.quantity < 2) return;
        setSplitTarget({ batch, maxQty: batch.quantity });
        setSplitQty(1);

        // Default target stage to the next logical stage
        const currIdx = STAGES.findIndex(s => s.id === batch.current_stage);
        const nextIdx = Math.min(STAGES.length - 1, currIdx + 1);
        setSplitStage(STAGES[nextIdx].id as ProductionStage);
    };

    const handleSplit = async () => {
        if (!splitTarget) return;
        if (splitQty >= splitTarget.maxQty) {
            // Just move if qty is full
            await handleStageMove(splitTarget.batch, splitStage);
            setSplitTarget(null);
            return;
        }

        setIsWorking(true);
        try {
            const originalNewQty = splitTarget.maxQty - splitQty;
            const batch = splitTarget.batch;

            // Prepare new batch object
            // Use existing batch properties but update stage, qty, id
            // Ensure we strictly copy only DB columns to avoid errors
            const newBatchData = {
                id: crypto.randomUUID(),
                order_id: batch.order_id,
                sku: batch.sku,
                variant_suffix: batch.variant_suffix,
                quantity: splitQty,
                current_stage: splitStage,
                created_at: batch.created_at, // Preserve creation time for tracking
                updated_at: new Date().toISOString(),
                priority: batch.priority,
                type: batch.type,
                notes: batch.notes,
                requires_setting: batch.requires_setting,
                requires_assembly: batch.requires_assembly,
                size_info: batch.size_info,
                cord_color: batch.cord_color,
                enamel_color: batch.enamel_color,
                on_hold: false
            };

            await productionRepository.splitBatch(batch.id, originalNewQty, newBatchData);
            await invalidateProductionBatches(queryClient);

            showToast(`Διαχωρισμός ${splitQty} τεμ. επιτυχής.`, "success");
            setSplitTarget(null);
        } catch (e) {
            showToast("Σφάλμα διαχωρισμού.", "error");
        } finally {
            setIsWorking(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[230] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in zoom-in-95">
            <div className="bg-white w-full h-full max-w-[1600px] sm:h-[92vh] sm:rounded-[2rem] shadow-2xl flex flex-col overflow-hidden border border-slate-200 relative">

                {isWorking && (
                    <div className="absolute inset-0 bg-white/50 backdrop-blur-[2px] z-50 flex items-center justify-center">
                        <Loader2 className="animate-spin text-slate-800" size={48} />
                    </div>
                )}

                {/* HEADER */}
                <div className="p-6 border-b border-slate-100 bg-white sticky top-0 z-10 flex justify-between items-start shrink-0 gap-4">
                    <div className="flex items-start gap-4 min-w-0 flex-1">
                        <div className="p-3 bg-[#060b00] text-white rounded-2xl shadow-lg hidden sm:block">
                            <Factory size={28} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Διαχείριση Παραγωγής</h2>
                            <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-500 mt-0.5">
                                <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100">#{order.id.slice(0, 8)}</span>
                                <span className="flex items-start gap-1 min-w-0 text-slate-600">
                                    <User size={14} className="mt-0.5 shrink-0" />
                                    <span className="break-words">{order.customer_name}</span>
                                </span>
                            </div>

                            {/* STAGE SUMMARY BAR */}
                            {totalInProduction > 0 && (
                                <div className="flex flex-wrap gap-2 mt-3">
                                    {STAGES.map(stage => {
                                        const count = stageCounts[stage.id] || 0;
                                        if (count === 0) return null;
                                        return (
                                            <button
                                                key={stage.id}
                                                onClick={() => setActiveStagePopup(stage.id as ProductionStage)}
                                                className={`text-[10px] px-2 py-0.5 rounded-md border font-bold flex items-center gap-1.5 transition-transform active:scale-95 ${stage.color}`}
                                            >
                                                <span>{stage.label}:</span>
                                                <span className="bg-white/50 px-1 rounded text-xs leading-none">{count}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex gap-2">
                        {order.notes && (
                            <div className="hidden lg:flex items-start gap-2 bg-yellow-50 text-yellow-800 px-4 py-2 rounded-xl border border-yellow-100 mr-2 max-w-[680px]" title={order.notes}>
                                <AlertCircle size={16} className="shrink-0" />
                                <span className="text-xs font-bold break-words whitespace-normal leading-snug">{order.notes}</span>
                            </div>
                        )}
                        {onBack && (
                            <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 hover:text-slate-700 transition-colors" title="Πίσω στη λίστα">
                                <ArrowLeft size={24} />
                            </button>
                        )}
                        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"><X size={24} /></button>
                    </div>
                </div>

                <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

                    {/* LEFT PANEL: ORDER ITEMS & ACTIVE BATCHES */}
                    <div className="flex-1 flex flex-col min-h-0 bg-slate-50/50">

                        {/* FILTERS */}
                        <div className="p-4 border-b border-slate-100 bg-white flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between shrink-0">
                            <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-hide">
                                <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-xl border border-slate-100 shrink-0">
                                    <span className="text-[10px] font-black text-slate-400 uppercase px-2 hidden sm:inline"><Filter size={10} className="inline mr-1" /> Φύλο</span>
                                    {['All', Gender.Women, Gender.Men, Gender.Unisex].map(g => (
                                        <button
                                            key={g} onClick={() => setFilterGender(g as any)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${filterGender === g ? 'bg-white shadow-sm text-slate-900 ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            {g === 'All' ? 'Όλα' : (g === Gender.Women ? 'Γυν' : (g === Gender.Men ? 'Ανδ' : 'Uni'))}
                                        </button>
                                    ))}
                                </div>

                                {relevantCollections.length > 0 && (
                                    <select
                                        value={filterCollection}
                                        onChange={(e) => setFilterCollection(e.target.value === 'All' ? 'All' : parseInt(e.target.value))}
                                        className="bg-white border border-slate-200 text-slate-700 text-xs font-bold py-2 pl-3 pr-8 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer shrink-0 max-w-[150px]"
                                    >
                                        <option value="All">Συλλογές Εντολής</option>
                                        {relevantCollections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                )}

                                <div className="relative group shrink-0">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={14} />
                                    <input
                                        type="text"
                                        placeholder="Αναζήτηση..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/20 w-32 focus:w-48 transition-all text-slate-700 placeholder:text-slate-400"
                                    />
                                </div>
                            </div>
                        </div>

                        {isLoadingShipments && (
                            <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex items-center gap-2 text-sm font-bold text-blue-700">
                                <Loader2 size={16} className="animate-spin" />
                                Φόρτωση ιστορικού αποστολών για σωστό υπολογισμό υπολοίπου...
                            </div>
                        )}

                        {/* LIST */}
                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar min-h-0">
                            {visibleActiveBatches.length > 0 && (
                                <div className="sticky top-0 z-[5] mb-4 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-2xl p-3 shadow-sm">
                                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <button
                                                onClick={() => selectBatchIds(visibleActiveBatches.map((batch) => batch.id))}
                                                className="px-3 py-1.5 rounded-lg text-xs font-black bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
                                            >
                                                Επιλογή όλων των ορατών
                                            </button>
                                            <button
                                                onClick={() => clearBatchSelection(visibleActiveBatches.map((batch) => batch.id))}
                                                className="px-3 py-1.5 rounded-lg text-xs font-black bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
                                            >
                                                Καθαρισμός
                                            </button>
                                            <span className="text-xs font-black text-slate-500">
                                                Επιλεγμένες: <span className="text-slate-900">{selectedVisibleActiveCount}</span>
                                            </span>
                                        </div>
                                        <BulkStageActions
                                            disabled={isWorking || selectedVisibleActiveCount === 0}
                                            onMove={(stage) => handleBulkStageMove(stage, visibleActiveBatches.filter((batch) => selectedBatchIds.includes(batch.id)).map((batch) => batch.id))}
                                        />
                                    </div>
                                </div>
                            )}
                            {filteredRows.length > 0 ? (
                                <div className="space-y-4">
                                    {filteredRows.map((row) => {
                                        const product = products.find(p => p.sku === row.sku);
                                        const spStub = isSpecialCreationSku(row.sku) ? getSpecialCreationProductStub() : null;
                                        const originalIndex = row.originalIndex;
                                        const currentSend = toSendQuantities[originalIndex] || 0;
                                        const isFullySent = row.remainingQty === 0;

                                        const batchesByStage = groupProductionBatchesByStage(row.batchDetails);
                                        const sortedStages = Object.keys(batchesByStage).sort((a, b) => {
                                            const idxA = STAGES.findIndex(s => s.id === a);
                                            const idxB = STAGES.findIndex(s => s.id === b);
                                            return idxA - idxB;
                                        });

                                        return (
                                    <div key={`content-${buildOrderItemIdentityKey(row)}`} className="bg-white p-4 rounded-2xl border border-slate-100 hover:border-slate-300 transition-all shadow-sm">

                                        {/* TOP: Item Info & Send Controls */}
                                        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4 mb-4">
                                            <div className="flex items-start gap-3 min-w-0 flex-1">
                                                <button
                                                    type="button"
                                                    className={`w-12 h-12 rounded-xl overflow-hidden shrink-0 border ${spStub ? 'bg-violet-50 border-violet-200' : 'bg-slate-50 border-slate-100'}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (product?.image_url) {
                                                            setZoomImageUrl(product.image_url);
                                                            setZoomImageAlt(product.sku);
                                                        }
                                                    }}
                                                >
                                                    {product?.image_url ? (
                                                        <img src={product.image_url} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center">
                                                            <ImageIcon size={20} className={spStub ? 'text-violet-400' : 'text-slate-300'} />
                                                        </div>
                                                    )}
                                                </button>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <SkuColorizedText sku={row.sku} suffix={row.variant_suffix} gender={row.gender} className="font-black" masterClassName={spStub ? 'text-violet-900' : 'text-slate-900'} />
                                                        {row.size_info && <span className="text-[9px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100 font-bold flex items-center gap-0.5"><Hash size={8} /> {row.size_info}</span>}
                                                        {row.cord_color && <span className="text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-100 font-bold">Κορδόνι: {getProductOptionColorLabel(row.cord_color)}</span>}
                                                        {row.enamel_color && <span className="text-[9px] bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded border border-rose-100 font-bold">Σμάλτο: {getProductOptionColorLabel(row.enamel_color)}</span>}
                                                    </div>
                                                    <div className={`text-[10px] font-bold uppercase truncate mt-0.5 ${spStub ? 'text-violet-600' : 'text-slate-400'}`}>{product?.category ?? spStub?.category}</div>

                                                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-bold">
                                                        <span className="bg-slate-50 text-slate-600 px-2 py-1 rounded-lg border border-slate-200">
                                                            Παραγγελία: {row.quantity}
                                                        </span>
                                                        {row.shippedQty > 0 && (
                                                            <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg border border-emerald-200">
                                                                Παραδόθηκαν: {row.shippedQty}
                                                            </span>
                                                        )}
                                                        <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-lg border border-blue-200">
                                                            Σε παραγωγή / έτοιμα: {row.inProgressQty + row.readyQty}
                                                        </span>
                                                        <span className="bg-amber-50 text-amber-700 px-2 py-1 rounded-lg border border-amber-200">
                                                            Απομένουν: {row.remainingQty}
                                                        </span>
                                                    </div>

                                                    {/* UNIT PRICE DISPLAY */}
                                                    <div className="text-[10px] font-mono text-slate-500 font-bold mt-1">
                                                        Τιμή Μονάδος: {formatCurrency(row.price)}
                                                        {discountFactor < 1 && (
                                                            <span className="text-emerald-600 ml-2">
                                                                (Με έκπτωση: {formatCurrency(row.price * discountFactor)})
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* DISPLAY ROW NOTE */}
                                                    {row.notes && (
                                                        <div className="mt-1.5 flex items-start gap-1 p-1.5 bg-yellow-50 text-yellow-800 rounded border border-yellow-100 max-w-fit">
                                                            <StickyNote size={10} className="shrink-0 mt-0.5" />
                                                            <span className="text-[10px] font-bold italic leading-tight">{row.notes}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Send Controls */}
                                            {isFullySent ? (
                                                <div
                                                    className="px-3 py-1.5 bg-slate-50 rounded-lg text-xs font-bold text-slate-500 border border-slate-100 whitespace-nowrap flex items-center gap-1 self-start"
                                                    title="Δεν απομένει ποσότητα για αποστολή σε παραγωγή για αυτό το είδος."
                                                >
                                                    <CheckCircle size={12} /> Δεν απομένουν
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-start xl:items-end gap-1">
                                                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Προς Αποστολή (Max: {row.remainingQty})</div>
                                                    <div className="flex items-center gap-1 bg-blue-50 p-1 rounded-xl border border-blue-100">
                                                        <button onClick={() => updateToSend(originalIndex, currentSend - 1)} className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-sm text-blue-600 hover:text-blue-900 active:scale-95 transition-transform"><Minus size={14} /></button>
                                                        <input type="number" min="0" max={row.remainingQty} value={currentSend} onChange={(e) => updateToSend(originalIndex, parseInt(e.target.value) || 0)} className="w-10 text-center font-black text-lg bg-transparent outline-none text-blue-900" />
                                                        <button onClick={() => updateToSend(originalIndex, currentSend + 1)} className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-sm text-blue-600 hover:text-blue-900 active:scale-95 transition-transform"><Plus size={14} /></button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* BOTTOM: Active Batches Management */}
                                        {row.batchDetails.length > 0 && (
                                            <div className="pt-3 border-t border-slate-100 space-y-3">
                                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                                    <RefreshCw size={10} /> Ενεργές Παρτίδες ({row.batchDetails.length})
                                                </div>

                                                {sortedStages.map(stageId => {
                                                    const stageBatches = batchesByStage[stageId];
                                                    const stageLabel = STAGES.find(s => s.id === stageId)?.label || stageId;

                                                    return (
                                                        <div key={stageId} className="space-y-1">
                                                            {/* Stage Header with optional Merge Button */}
                                                            <div className="flex items-center justify-between px-1">
                                                                <span className="text-[10px] font-bold text-slate-500 uppercase">{stageLabel}</span>
                                                                {stageBatches.length > 1 && (
                                                                    <button
                                                                        onClick={() => handleMergeBatches(stageId as ProductionStage, stageBatches)}
                                                                        className="flex items-center gap-1 text-[9px] font-black bg-purple-50 text-purple-700 px-2 py-0.5 rounded border border-purple-100 hover:bg-purple-100 transition-colors"
                                                                    >
                                                                        <Merge size={10} /> Συγχώνευση ({stageBatches.length})
                                                                    </button>
                                                                )}
                                                            </div>

                                                            {stageBatches.map(batch => {
                                                                // Calculate value for this specific batch
                                                                const batchRow = rows.find(r => buildOrderItemIdentityKey(r) === buildOrderItemIdentityKey(batch));
                                                                const unitPrice = batchRow?.price || 0;
                                                                const batchVal = unitPrice * batch.quantity * discountFactor;
                                                                const isSelected = selectedBatchIds.includes(batch.id);
                                                                const timeInfo = getBatchTiming(batch);

                                                                return (
                                                                    <div key={batch.id} className="flex flex-col gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                                                                        <div className="flex flex-col gap-2 min-w-0 flex-1">
                                                                            <div className="flex flex-wrap items-center gap-2">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => toggleBatchSelection(batch.id)}
                                                                                    className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-400 hover:border-blue-300 hover:text-blue-600'}`}
                                                                                    title="Επιλογή παρτίδας"
                                                                                >
                                                                                    {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                                                                                </button>
                                                                                <span className="font-black text-slate-800 bg-white px-2 py-1 rounded border border-slate-200 shadow-sm min-w-[3rem] text-center">{batch.quantity}</span>
                                                                                <span className={`text-[10px] font-black px-2 py-1 rounded-lg border ${getProductionTimingStatusClasses(timeInfo.timingStatus)}`} title={`Χρόνος στο τρέχον στάδιο από ${new Date(timeInfo.stageEnteredAt).toLocaleString('el-GR')}`}>
                                                                                    <Clock size={11} className="inline mr-1" />{timeInfo.timingLabel}
                                                                                </span>
                                                                                <span className="text-[10px] font-mono text-slate-500 bg-white px-2 py-1 rounded border border-slate-200">{formatCurrency(batchVal)}</span>
                                                                                {batch.size_info && <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-1 rounded-lg border border-blue-100 font-bold">{batch.size_info}</span>}
                                                                                {batch.cord_color && <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-1 rounded-lg border border-amber-100 font-bold">Κορδόνι: {getProductOptionColorLabel(batch.cord_color)}</span>}
                                                                                {batch.enamel_color && <span className="text-[10px] bg-rose-50 text-rose-700 px-2 py-1 rounded-lg border border-rose-100 font-bold">Σμάλτο: {getProductOptionColorLabel(batch.enamel_color)}</span>}
                                                                            </div>

                                                                            <StageFlowRail
                                                                                batch={batch}
                                                                                disabled={isWorking}
                                                                                onMove={(stage) => handleStageMove(batch, stage)}
                                                                            />

                                                                            {/* Batch Note */}
                                                                            {batch.notes && (
                                                                                <div className="text-[10px] text-amber-700 bg-amber-50 px-2 py-1 rounded-lg border border-amber-100 font-bold flex items-center gap-1 w-fit max-w-full" title={batch.notes}>
                                                                                    <StickyNote size={10} /> {batch.notes}
                                                                                </div>
                                                                            )}
                                                                            {batch.on_hold && (
                                                                                <div className="text-[10px] text-amber-800 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200 font-bold flex items-center gap-1 w-fit max-w-full" title={batch.on_hold_reason || 'Σε αναμονή'}>
                                                                                    <PauseCircle size={10} className="shrink-0" />
                                                                                    <span>Σε αναμονή{batch.on_hold_reason ? ` • ${batch.on_hold_reason}` : ''}</span>
                                                                                </div>
                                                                            )}
                                                                        </div>

                                                                        <div className="flex flex-wrap gap-1 items-center">
                                                                            <button
                                                                                onClick={() => handleToggleHold(batch)}
                                                                                className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-black transition-colors flex items-center gap-1.5 ${batch.on_hold ? 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100' : 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100'}`}
                                                                                title={batch.on_hold ? 'Συνέχιση παραγωγής' : 'Θέση σε αναμονή'}
                                                                            >
                                                                                {batch.on_hold ? <PlayCircle size={12} /> : <PauseCircle size={12} />}
                                                                                {batch.on_hold ? 'Συνέχιση' : 'Αναμονή'}
                                                                            </button>
                                                                            <button
                                                                                onClick={() => { setEditingNoteBatch(batch); setNoteText(batch.notes || ''); }}
                                                                                className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-black transition-colors flex items-center gap-1.5 ${batch.notes ? 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100' : 'text-slate-600 bg-white border-slate-200 hover:bg-slate-50'}`}
                                                                                title="Σημειώσεις"
                                                                            >
                                                                                <StickyNote size={12} className={batch.notes ? "fill-current" : ""} /> Σημείωση
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handleViewHistory(batch)}
                                                                                className="px-2.5 py-1.5 rounded-lg border text-[10px] font-black transition-colors flex items-center gap-1.5 text-slate-700 bg-white border-slate-200 hover:bg-slate-50"
                                                                                title="Ιστορικό παρτίδας"
                                                                            >
                                                                                <History size={12} /> Ιστορικό
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handleRevertBatch(batch)}
                                                                                className="px-2.5 py-1.5 rounded-lg border text-[10px] font-black transition-colors flex items-center gap-1.5 text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100"
                                                                                title="Επαναφορά παρτίδας"
                                                                            >
                                                                                <RefreshCcw size={12} /> Επαναφορά
                                                                            </button>
                                                                            {batch.current_stage !== ProductionStage.Ready && batch.quantity >= 2 && (
                                                                                <button
                                                                                    onClick={() => openSplitModal(batch)}
                                                                                    className="px-2.5 py-1.5 rounded-lg border text-[10px] font-black transition-colors flex items-center gap-1.5 text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100"
                                                                                    title="Διαχωρισμός"
                                                                                >
                                                                                    <Split size={12} /> Διαχωρισμός
                                                                                </button>
                                                                            )}
                                                                            <button
                                                                                onClick={() => handleDeleteBatch(batch)}
                                                                                className="px-2.5 py-1.5 rounded-lg border text-[10px] font-black transition-colors flex items-center gap-1.5 text-red-600 bg-red-50 border-red-200 hover:bg-red-100"
                                                                                title="Διαγραφή"
                                                                            >
                                                                                <Trash2 size={12} /> Διαγραφή
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    );
                                                }                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                                    })}
                                </div>
                            ) : (
                                <div className="text-center py-10 text-slate-400 italic">Δεν βρέθηκαν είδη.</div>
                            )}
                        </div>
                    </div>

                    {/* RIGHT PANEL: SUMMARY & HISTORY */}
                    <div className="w-full lg:w-[450px] bg-white flex flex-col shrink-0 border-t lg:border-t-0 lg:border-l border-slate-100 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-20">

                        {/* 1. CURRENT SEND SUMMARY */}
                        <div className="p-6 bg-[#060b00] text-white flex flex-col gap-4 shrink-0">
                            <h3 className="font-bold uppercase text-xs tracking-widest text-slate-400 flex items-center gap-2">
                                <Wallet size={14} /> Τρέχουσα Αποστολή
                            </h3>
                            <div className="flex justify-between items-end">
                                <div>
                                    <div className="text-4xl font-black tracking-tight">{totalToSend} <span className="text-lg font-medium text-slate-400">τεμ</span></div>
                                    <div className="text-xs text-slate-400 font-bold mt-1">Επιλεγμένα Είδη</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-2xl font-black text-emerald-400">{formatCurrency(currentSendValue)}</div>
                                    <div className="text-[10px] text-slate-500 font-bold uppercase">Καθαρη Αξια</div>
                                </div>
                            </div>

                            <button
                                onClick={handleSend}
                                disabled={isSending || isLoadingShipments || totalToSend === 0}
                                className="w-full py-4 bg-white text-slate-900 rounded-2xl font-black text-lg shadow-lg hover:bg-emerald-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 active:scale-95"
                            >
                                {isSending ? <Loader2 className="animate-spin" /> : <Factory size={20} />}
                                {isSending ? 'Αποστολή...' : 'Εκκίνηση Παραγωγής'}
                            </button>
                        </div>

                        {/* 2. HISTORY / SHIPMENTS */}
                        <div className="flex-1 overflow-y-auto p-4 bg-slate-50 border-t border-slate-900 space-y-5">

                            {/* 2a. Μερική Αποστολή CTA — shown when Ready batches exist */}
                            {canPartialShip && (
                                <button
                                    onClick={() => { onClose(); onPartialShipment!(); }}
                                    className="w-full text-left p-4 rounded-2xl flex items-center gap-3 font-bold bg-amber-50 border-2 border-amber-300 text-amber-800 hover:bg-amber-100 transition-colors shadow-sm"
                                >
                                    <Truck size={18} className="shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-black">Μερική Αποστολή</div>
                                        <div className="text-xs font-medium text-amber-600">{readyCount} τεμ. έτοιμα για αποστολή</div>
                                    </div>
                                    <Send size={14} className="shrink-0 text-amber-500" />
                                </button>
                            )}

                            {/* 2b. Αποστολές Πελάτη — real order_shipments */}
                            <div>
                                <h3 className="font-bold text-slate-500 uppercase text-xs tracking-widest flex items-center gap-2 mb-3">
                                    <Truck size={14} /> Αποστολές Πελάτη
                                </h3>
                                {isLoadingShipments ? (
                                    <div className="flex items-center justify-center py-6 text-slate-400">
                                        <Loader2 size={16} className="animate-spin mr-2" /> Φόρτωση...
                                    </div>
                                ) : shipmentSnapshot && shipmentSnapshot.shipments.length > 0 ? (
                                    <div className="space-y-2">
                                        {[...shipmentSnapshot.shipments]
                                            .sort((a, b) => a.shipment_number - b.shipment_number)
                                            .map(shipment => {
                                                const shipItems = shipmentSnapshot.items.filter(si => si.shipment_id === shipment.id);
                                                const totalShippedQty = shipItems.reduce((s, si) => s + si.quantity, 0);
                                                let shipNet = 0;
                                                shipItems.forEach(si => {
                                                    shipNet += si.price_at_order * si.quantity * discountFactor;
                                                });
                                                const shipVat = shipNet * vatRate;
                                                const shipTotal = shipNet + shipVat;
                                                const prettyDate = new Date(shipment.shipped_at).toLocaleDateString('el-GR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                                                return (
                                                    <div key={shipment.id} className="bg-white p-3 rounded-xl border border-emerald-200 shadow-sm">
                                                        <div className="flex items-center justify-between mb-1.5">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full uppercase tracking-wide">#{shipment.shipment_number}</span>
                                                                <span className="text-xs font-bold text-slate-700">{prettyDate}</span>
                                                            </div>
                                                            <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{totalShippedQty} τεμ.</span>
                                                        </div>
                                                        {shipment.shipped_by && (
                                                            <div className="text-[10px] text-slate-400 mb-2 flex items-center gap-1">
                                                                <User size={10} /> {shipment.shipped_by}
                                                            </div>
                                                        )}
                                                        <div className="space-y-0.5">
                                                            <div className="flex justify-between text-xs text-slate-500">
                                                                <span>Καθαρή:</span>
                                                                <span className="font-mono font-bold">{formatCurrency(shipNet)}</span>
                                                            </div>
                                                            <div className="flex justify-between text-xs text-slate-500">
                                                                <span>ΦΠΑ ({(vatRate * 100).toFixed(0)}%):</span>
                                                                <span className="font-mono font-bold">{formatCurrency(shipVat)}</span>
                                                            </div>
                                                            <div className="flex justify-between text-xs font-black text-slate-800 border-t border-slate-100 pt-1 mt-1">
                                                                <span>Σύνολο:</span>
                                                                <span>{formatCurrency(shipTotal)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                ) : (
                                    <div className="text-center py-4 text-slate-400 italic text-xs">
                                        Δεν υπάρχουν αποστολές πελάτη.
                                    </div>
                                )}
                            </div>

                            {/* 2c. Εκκινήσεις Παραγωγής — production batch waves */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="font-bold text-slate-500 uppercase text-xs tracking-widest flex items-center gap-2">
                                        <History size={14} /> Εκκινήσεις Παραγωγής
                                    </h3>
                                    {shipmentHistory.length > 1 && (
                                        <button
                                            onClick={handleMergeAllParts}
                                            disabled={isWorking}
                                            className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            title="Συγχώνευση όλων των τμημάτων σε ένα"
                                        >
                                            <Merge size={12} /> Συγχώνευση Τμημάτων
                                        </button>
                                    )}
                                </div>

                                {shipmentHistory.length > 0 ? shipmentHistory.map(([dateKey, batches]) => {
                                    const totalItems = batches.reduce((acc, b) => acc + b.quantity, 0);

                                    let shipNet = 0;
                                    batches.forEach(b => {
                                        const item = order.items.find(i => buildOrderItemIdentityKey(i) === buildOrderItemIdentityKey(b));
                                        if (item) {
                                            shipNet += (item.price_at_order * b.quantity * discountFactor);
                                        }
                                    });
                                    const shipVat = shipNet * vatRate;
                                    const shipTotal = shipNet + shipVat;

                                    const prettyDate = new Date(dateKey).toLocaleDateString('el-GR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

                                    return (
                                        <div key={dateKey} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-blue-300 transition-colors group">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="text-xs font-black text-slate-800 uppercase tracking-wide">{prettyDate}</div>
                                                <div className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{totalItems} τεμ.</div>
                                            </div>

                                            <div className="space-y-1 mb-3">
                                                <div className="flex justify-between text-xs text-slate-500">
                                                    <span>Καθαρή:</span>
                                                    <span className="font-mono font-bold">{formatCurrency(shipNet)}</span>
                                                </div>
                                                <div className="flex justify-between text-xs text-slate-500">
                                                    <span>ΦΠΑ ({(vatRate * 100).toFixed(0)}%):</span>
                                                    <span className="font-mono font-bold">{formatCurrency(shipVat)}</span>
                                                </div>
                                                <div className="flex justify-between text-sm font-black text-slate-800 border-t border-slate-100 pt-1 mt-1">
                                                    <span>Σύνολο:</span>
                                                    <span>{formatCurrency(shipTotal)}</span>
                                                </div>
                                            </div>

                                            {onPrintAggregated && (
                                                <button
                                                    onClick={() => onPrintAggregated(batches, { orderId: order.id, customerName: order.customer_name })}
                                                    className="w-full py-2 bg-slate-50 hover:bg-blue-50 text-blue-600 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                                                >
                                                    <FileText size={14} /> Εκτύπωση Δελτίου
                                                </button>
                                            )}
                                        </div>
                                    );
                                }) : (
                                    <div className="text-center py-4 text-slate-400 italic text-xs">
                                        Δεν υπάρχουν εκκινήσεις παραγωγής.
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 3. TOTALS FOOTER */}
                        <div className="p-4 bg-white border-t border-slate-200">
                            <div className="flex gap-2 w-full mb-4">
                                <button onClick={handleSelectVisible} disabled={isLoadingShipments} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-100 text-blue-700 rounded-xl text-xs font-bold hover:bg-blue-200 transition-colors border border-blue-200 whitespace-nowrap shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                                    <CheckSquare size={14} /> Επιλογή Ορατών
                                </button>
                                <button onClick={handleClearSelection} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-100 transition-colors border border-slate-200 whitespace-nowrap shadow-sm">
                                    <Square size={14} /> Καθαρισμός
                                </button>
                            </div>

                            <div className="space-y-2 text-xs pt-2 border-t border-slate-100">
                                <div className="flex justify-between items-center text-slate-500">
                                    <span>Σύνολο Παραγγελίας:</span>
                                    <span className="font-bold text-slate-900">{order.items.reduce((s, i) => s + i.quantity, 0)}</span>
                                </div>
                                <div className="flex justify-between items-center text-slate-500">
                                    <span>Σε Παραγωγή / Έτοιμα:</span>
                                    <span className="font-bold text-blue-600">{rows.reduce((s, r) => s + r.inProgressQty + r.readyQty, 0)}</span>
                                </div>
                                <div className="flex justify-between items-center text-slate-500">
                                    <span>Υπόλοιπο:</span>
                                    <span className="font-bold text-amber-600">{totalRemaining}</span>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            {/* SPLIT MODAL OVERLAY */}
            {splitTarget && (
                <div className="fixed inset-0 z-[250] bg-black/60 flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 space-y-4">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                            <h3 className="font-black text-lg text-slate-800 flex items-center gap-2"><Scissors className="text-blue-500" /> Διαχωρισμός</h3>
                            <button onClick={() => setSplitTarget(null)}><X size={20} className="text-slate-400" /></button>
                        </div>

                        <div className="text-center">
                            <div className="text-xs font-bold text-slate-400 uppercase mb-1">Μετακίνηση Ποσότητας</div>
                            <div className="flex items-center justify-center gap-4">
                                <button onClick={() => setSplitQty(Math.max(1, splitQty - 1))} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-xl text-slate-600 hover:bg-slate-200">-</button>
                                <span className="text-3xl font-black text-slate-900 w-16">{splitQty}</span>
                                <button onClick={() => setSplitQty(Math.min(splitTarget.maxQty, splitQty + 1))} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-xl text-slate-600 hover:bg-slate-200">+</button>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-1 font-bold">από {splitTarget.maxQty} διαθέσιμα</div>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Σε Στάδιο</label>
                            <select
                                value={splitStage}
                                onChange={(e) => setSplitStage(e.target.value as ProductionStage)}
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none"
                            >
                                {STAGES.map(s => {
                                    // Check if stage is disabled for this batch
                                    const isStageDisabled = 
                                        (s.id === ProductionStage.Setting && !splitTarget?.batch.requires_setting) ||
                                        (s.id === ProductionStage.Assembly && !splitTarget?.batch.requires_assembly);
                                    
                                    return (
                                        <option 
                                            key={s.id} 
                                            value={s.id}
                                            disabled={isStageDisabled}
                                        >
                                            {s.label}{isStageDisabled ? ' (παραλείπεται)' : ''}
                                        </option>
                                    );
                                })}
                            </select>
                        </div>

                        <button onClick={handleSplit} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2">
                            <Split size={18} /> Εκτέλεση
                        </button>
                    </div>
                </div>
            )}

            {/* NOTE EDIT MODAL */}
            {editingNoteBatch && (
                <div className="fixed inset-0 z-[260] bg-black/60 flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 space-y-4">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                            <h3 className="font-black text-lg text-slate-800 flex items-center gap-2"><StickyNote className="text-amber-500" /> Σημείωση</h3>
                            <button onClick={() => setEditingNoteBatch(null)}><X size={20} className="text-slate-400" /></button>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Κείμενο</label>
                            <textarea
                                value={noteText}
                                onChange={(e) => setNoteText(e.target.value)}
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 outline-none h-32 resize-none"
                                placeholder="Γράψτε μια σημείωση..."
                                autoFocus
                            />
                        </div>

                        <button onClick={handleSaveNote} className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2">
                            <Save size={18} /> Αποθήκευση
                        </button>
                    </div>
                </div>
            )}

            {holdingBatch && (
                <div className="fixed inset-0 z-[260] bg-black/60 flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 space-y-4 border border-amber-200">
                        <div className="flex justify-between items-center pb-2 border-b border-amber-100">
                            <h3 className="font-black text-lg text-amber-800 flex items-center gap-2"><PauseCircle className="text-amber-500" /> Θέση σε Αναμονή</h3>
                            <button onClick={() => { setHoldingBatch(null); setHoldReason(''); }}><X size={20} className="text-slate-400" /></button>
                        </div>
                        <div>
                            <div className="mb-3 text-sm font-bold text-slate-600">
                                Γιατί σταματάει η παραγωγή του {holdingBatch.sku}{holdingBatch.variant_suffix || ''};
                            </div>
                            <textarea
                                value={holdReason}
                                onChange={(e) => setHoldReason(e.target.value)}
                                className="w-full p-4 bg-white border-2 border-amber-100 rounded-xl outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-500/10 h-32 resize-none text-sm font-bold text-slate-800"
                                placeholder="π.χ. Έλλειψη εξαρτήματος, Σπασμένο λάστιχο..."
                                autoFocus
                            />
                        </div>
                        <button
                            onClick={confirmHold}
                            disabled={isWorking || !holdReason.trim()}
                            className="w-full py-3 bg-amber-500 text-white rounded-xl font-bold shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {isWorking ? <Loader2 size={18} className="animate-spin" /> : <PauseCircle size={18} />} Σε Αναμονή
                        </button>
                    </div>
                </div>
            )}

            {/* STAGE POPUP */}
            {activeStagePopup && (
                <div className="fixed inset-0 z-[260] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in" onClick={() => setActiveStagePopup(null)}>
                    <div className="bg-white w-full max-w-5xl rounded-[2rem] shadow-2xl animate-in zoom-in-95 overflow-hidden flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
                        <div className={`p-6 flex justify-between items-center border-b ${STAGES.find(s => s.id === activeStagePopup)?.color.split(' ')[0]} md:${VIBRANT_STAGES[activeStagePopup as string] || 'bg-slate-600'} text-white`}>
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
                                    <Factory size={24} className="text-white" />
                                </div>
                                <div>
                                    <h3 className="font-black text-2xl uppercase tracking-tight">
                                        {STAGES.find(s => s.id === activeStagePopup)?.label}
                                    </h3>
                                    <p className="text-white/80 text-xs font-bold uppercase tracking-widest">{popupBatches.reduce((a, b) => a + b.quantity, 0)} Τεμαχια συνολικα</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {onPrintStageBatches && popupBatches.length > 0 && (
                                    <button
                                        onClick={() => {
                                            const stageConf = STAGES.find(s => s.id === activeStagePopup);
                                            onPrintStageBatches({
                                                stageName: stageConf?.label ?? activeStagePopup,
                                                stageId: activeStagePopup,
                                                customerName: order.customer_name,
                                                orderId: order.id,
                                                batches: popupBatches,
                                                generatedAt: new Date().toISOString(),
                                            });
                                        }}
                                        className="flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all border border-white/30 active:scale-95"
                                        title="Εκτύπωση λίστας σταδίου"
                                    >
                                        <Printer size={17} />
                                        <span className="hidden sm:inline">Εκτύπωση</span>
                                    </button>
                                )}
                                <button onClick={() => setActiveStagePopup(null)} className="p-2 rounded-full hover:bg-white/20 transition-colors text-white"><X size={28} /></button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-50/50">
                            {popupBatches.length > 0 ? (
                                <div className="space-y-3">
                                    <div className="sticky top-0 z-[5] bg-white/95 backdrop-blur-sm border border-slate-200 rounded-2xl p-3 shadow-sm">
                                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <button
                                                    onClick={() => selectBatchIds(visiblePopupBatchIds)}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-black bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
                                                >
                                                    Επιλογή όλων των ορατών
                                                </button>
                                                <button
                                                    onClick={() => clearBatchSelection(visiblePopupBatchIds)}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-black bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
                                                >
                                                    Καθαρισμός
                                                </button>
                                                <span className="text-xs font-black text-slate-500">
                                                    Επιλεγμένες: <span className="text-slate-900">{selectedVisiblePopupCount}</span>
                                                </span>
                                            </div>
                                            <BulkStageActions
                                                disabled={isWorking || selectedVisiblePopupCount === 0}
                                                onMove={(stage) => handleBulkStageMove(stage, popupBatches.filter((batch) => selectedBatchIds.includes(batch.id)).map((batch) => batch.id))}
                                            />
                                        </div>
                                    </div>
                                    {popupBatches.map((batch) => {
                                        const product = products.find(p => p.sku === batch.sku);
                                        const isSelected = selectedBatchIds.includes(batch.id);
                                        const timeInfo = getBatchTiming(batch);
                                        
                                        return (
                                            <div key={batch.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                                {/* Card Header */}
                                                <div className="p-3 flex gap-3 border-b border-slate-50">
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleBatchSelection(batch.id)}
                                                        className={`w-9 h-9 mt-2 rounded-xl border flex items-center justify-center transition-colors shrink-0 ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-400 hover:border-blue-300 hover:text-blue-600'}`}
                                                        title="Επιλογή παρτίδας"
                                                    >
                                                        {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="w-14 h-14 bg-slate-100 rounded-xl overflow-hidden border border-slate-100 shrink-0"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (product?.image_url) {
                                                                setZoomImageUrl(product.image_url);
                                                                setZoomImageAlt(batch.sku);
                                                            }
                                                        }}
                                                    >
                                                        {product?.image_url ? (
                                                            <img src={product.image_url} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center">
                                                                <ImageIcon size={20} className="text-slate-300" />
                                                            </div>
                                                        )}
                                                    </button>
                                                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                        <div className="text-[10px] font-bold text-slate-400 uppercase truncate">{product?.category || 'Προϊόν'}</div>
                                                        <div className="font-black text-slate-900 text-base leading-none truncate">
                                                            <SkuColorizedText sku={batch.sku} suffix={batch.variant_suffix || ''} gender={product?.gender || Gender.Unisex} className="font-black" masterClassName="text-slate-900" />
                                                        </div>
                                                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                                            <span className={`text-[10px] font-black px-2 py-1 rounded-lg border ${getProductionTimingStatusClasses(timeInfo.timingStatus)}`}>
                                                                <Clock size={11} className="inline mr-1" />{timeInfo.timingLabel}
                                                            </span>
                                                            {batch.on_hold && (
                                                                <span className="text-[10px] font-black px-2 py-1 rounded-lg border bg-amber-50 text-amber-800 border-amber-200">
                                                                    <PauseCircle size={11} className="inline mr-1" />Σε αναμονή
                                                                </span>
                                                            )}
                                                        </div>
                                                        {batch.size_info && (
                                                            <span className="text-[9px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100 font-bold flex items-center gap-0.5 w-fit mt-1">
                                                                <Hash size={8} /> {batch.size_info}
                                                            </span>
                                                        )}
                                                        {batch.cord_color && (
                                                            <span className="text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-100 font-bold w-fit mt-1">
                                                                Κορδόνι: {getProductOptionColorLabel(batch.cord_color)}
                                                            </span>
                                                        )}
                                                        {batch.enamel_color && (
                                                            <span className="text-[9px] bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded border border-rose-100 font-bold w-fit mt-1">
                                                                Σμάλτο: {getProductOptionColorLabel(batch.enamel_color)}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col items-center justify-center pl-2 border-l border-slate-50">
                                                        <span className="text-[9px] font-bold text-slate-400 uppercase">Ποσ.</span>
                                                        <span className="text-xl font-black text-slate-900">{batch.quantity}</span>
                                                    </div>
                                                </div>

                                                {/* Stage Movement Buttons */}
                                                <div className="p-3 bg-slate-50/50 border-t border-slate-100">
                                                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                                                        <RefreshCw size={10} /> Μετακίνηση σε Στάδιο
                                                    </div>
                                                    <StageFlowRail
                                                        batch={batch}
                                                        disabled={isWorking}
                                                        onMove={(stage) => handleStageMove(batch, stage)}
                                                    />
                                                </div>

                                                {/* Batch Note */}
                                                {batch.notes && (
                                                    <div className="px-3 pb-3">
                                                        <div className="flex items-start gap-2 text-[10px] font-medium text-amber-900 bg-amber-50 p-2 rounded-lg border border-amber-100 leading-snug">
                                                            <StickyNote size={12} className="shrink-0 mt-0.5 text-amber-500" />
                                                            <span>{batch.notes}</span>
                                                        </div>
                                                    </div>
                                                )}
                                                {batch.on_hold && (
                                                    <div className="px-3 pb-3">
                                                        <div className="flex items-start gap-2 text-[10px] font-medium text-amber-900 bg-amber-50 p-2 rounded-lg border border-amber-200 leading-snug">
                                                            <PauseCircle size={12} className="shrink-0 mt-0.5 text-amber-600" />
                                                            <span>{batch.on_hold_reason || 'Σε αναμονή'}</span>
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="px-3 pb-3 flex flex-wrap gap-1">
                                                    <button
                                                        onClick={() => handleToggleHold(batch)}
                                                        className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-black transition-colors flex items-center gap-1.5 ${batch.on_hold ? 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100' : 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100'}`}
                                                    >
                                                        {batch.on_hold ? <PlayCircle size={12} /> : <PauseCircle size={12} />}
                                                        {batch.on_hold ? 'Συνέχιση' : 'Αναμονή'}
                                                    </button>
                                                    <button
                                                        onClick={() => handleViewHistory(batch)}
                                                        className="px-2.5 py-1.5 rounded-lg border text-[10px] font-black transition-colors flex items-center gap-1.5 text-slate-700 bg-white border-slate-200 hover:bg-slate-50"
                                                    >
                                                        <History size={12} /> Ιστορικό
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4">
                                    <div className="p-6 bg-slate-100 rounded-full">
                                        <Package size={48} className="opacity-20" />
                                    </div>
                                    <p className="font-bold text-lg">Κανένα είδος σε αυτό το στάδιο.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Stock Decision Overlay */}
            {stockDecision && (
                <div className="fixed inset-0 z-[500] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setStockDecision(null)}>
                    <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-5 border-b border-slate-100">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-black text-slate-900">Διαθέσιμο Stock</h3>
                                    <p className="text-xs text-slate-500 font-medium mt-1">Ορισμένα είδη υπάρχουν ήδη στο απόθεμα. Επιλέξτε πόσα θα ληφθούν από Stock (έτοιμα αμέσως).</p>
                                </div>
                                <button onClick={() => setStockDecision(null)} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                                    <X size={16} />
                                </button>
                            </div>
                        </div>
                        <div className="px-6 py-4 space-y-3 overflow-y-auto max-h-[50vh]">
                            {stockDecision.items.map((item, idx) => {
                                const product = products.find(p => p.sku === item.sku);
                                const hasStock = item.available_in_stock > 0;
                                return (
                                    <div key={idx} className={`rounded-2xl border p-4 ${hasStock ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-100 bg-slate-50/50'}`}>
                                        <div className="flex items-center gap-3">
                                            {product?.image_url ? (
                                                <img src={product.image_url} alt={item.sku} className="w-10 h-10 rounded-lg object-cover" />
                                            ) : (
                                                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center"><Package size={16} className="text-slate-400" /></div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <SkuColorizedText sku={item.sku} suffix={item.variant_suffix || ''} gender={product?.gender} className="font-black" masterClassName="text-slate-900" />
                                                    {item.size_info && <span className="text-xs text-slate-500 font-bold">#{item.size_info}</span>}
                                                    {item.cord_color && <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-100 font-bold">Κορδόνι: {getProductOptionColorLabel(item.cord_color as OrderItem['cord_color'])}</span>}
                                                    {item.enamel_color && <span className="text-[10px] bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded border border-rose-100 font-bold">Σμάλτο: {getProductOptionColorLabel(item.enamel_color as OrderItem['enamel_color'])}</span>}
                                                </div>
                                                <div className="text-xs text-slate-500 font-medium mt-0.5">
                                                    Ζητούνται: <span className="font-bold text-slate-700">{item.requested_qty}</span> · Stock: <span className={`font-bold ${hasStock ? 'text-emerald-600' : 'text-slate-400'}`}>{item.available_in_stock}</span>
                                                </div>
                                            </div>
                                        </div>
                                        {hasStock && (
                                            <div className="mt-3 flex items-center gap-3">
                                                <span className="text-xs font-bold text-emerald-700">Από Stock:</span>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => {
                                                            const updated = [...stockDecision.items];
                                                            updated[idx] = { ...updated[idx], fromStock: Math.max(0, updated[idx].fromStock - 1) };
                                                            setStockDecision({ ...stockDecision, items: updated });
                                                        }}
                                                        className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50"
                                                    >
                                                        <Minus size={12} />
                                                    </button>
                                                    <span className="w-8 text-center text-sm font-black text-slate-800">{item.fromStock}</span>
                                                    <button
                                                        onClick={() => {
                                                            const updated = [...stockDecision.items];
                                                            const max = Math.min(updated[idx].available_in_stock, updated[idx].requested_qty);
                                                            updated[idx] = { ...updated[idx], fromStock: Math.min(max, updated[idx].fromStock + 1) };
                                                            setStockDecision({ ...stockDecision, items: updated });
                                                        }}
                                                        className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50"
                                                    >
                                                        <Plus size={12} />
                                                    </button>
                                                </div>
                                                <span className="text-xs text-slate-400 font-medium">
                                                    → {item.requested_qty - item.fromStock} στην Παραγωγή
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <div className="px-6 py-4 border-t border-slate-100 flex items-center gap-3">
                            <button onClick={() => {
                                // Send all to production (ignore stock)
                                const noStock = stockDecision.originalItemsToSend;
                                setStockDecision(null);
                                executeSend(noStock);
                            }} className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                                Όλα στην Παραγωγή
                            </button>
                            <button onClick={handleConfirmStockDecision} disabled={isSending} className="flex-1 px-4 py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                                {isSending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                                Επιβεβαίωση
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Image zoom overlay */}
            <BatchHistoryModal
                isOpen={!!historyModalBatch}
                onClose={() => {
                    setHistoryModalBatch(null);
                    setBatchHistory([]);
                }}
                batch={historyModalBatch}
                history={batchHistory as any}
            />

            {zoomImageUrl && ReactDOM.createPortal(
                <div
                    className="fixed inset-0 z-[600] bg-black/90 flex items-center justify-center"
                    onClick={() => { setZoomImageUrl(null); setZoomImageAlt(''); }}
                >
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setZoomImageUrl(null); setZoomImageAlt(''); }}
                        className="absolute top-4 right-4 w-11 h-11 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white transition-colors"
                    >
                        <X size={22} />
                    </button>
                    <img
                        src={zoomImageUrl}
                        alt={zoomImageAlt || 'Product image'}
                        className="max-w-[95vw] max-h-[95vh] object-contain rounded-2xl shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>,
                document.body
            )}
        </div>
    );
}
