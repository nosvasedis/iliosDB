import React, { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Order, Product, ProductionBatch, Material, ProductionStage, OrderItem, Collection, Gender, ProductionType, BatchStageHistoryEntry, StageBatchPrintData, OrderStatus, OrderShipment, OrderShipmentItem } from '../types';
import { X, Factory, CheckCircle, Loader2, ArrowLeft, Clock, StickyNote, History, Package, PauseCircle, PlayCircle, User, RefreshCw, ImageIcon, Minus, Plus, Filter, Wallet, CheckSquare, Square, Hash, Search, Printer, Scissors, Trash2, Split, Merge, FileText, AlertCircle, Save, Truck, Send, MoreHorizontal } from 'lucide-react';
import { checkStockForOrderItems, deductStockForOrder } from '../lib/supabase';
import { useUI } from './UIProvider';
import { formatCurrency } from '../utils/pricingEngine';
import SkuColorizedText from './SkuColorizedText';
import { useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { groupBatchesByShipment } from '../utils/orderReadiness';
import { getShippedQuantities, itemKey } from '../utils/shipmentUtils';
import { getProductOptionColorLabel } from '../utils/xrOptions';
import BatchHistoryModal from './BatchHistoryModal';
import { PRODUCTION_STAGES } from '../utils/productionStages';
import { getProductionTimingInfo, getProductionTimingStatusClasses } from '../utils/productionTiming';
import { formatOrderId } from '../utils/orderUtils';
import { buildBatchStageHistoryMap, isStageNotRequired } from '../features/production/selectors';
import { groupProductionBatchesByStage } from '../features/production/workflowSelectors';
import { buildOrderItemIdentityKey } from '../features/orders/printHelpers';
import { getSpecialCreationProductStub, isSpecialCreationSku } from '../utils/specialCreationSku';
import { useOrderShipmentsForOrder } from '../hooks/api/useOrders';
import { useBatchStageHistoryEntries } from '../hooks/api/useProductionBatches';
import { ordersRepository } from '../features/orders';
import { productionRepository, productionKeys } from '../features/production';
import { invalidateOrdersAndBatches, invalidateProductionBatches } from '../lib/queryInvalidation';

import { STAGES, STAGE_BUTTON_COLORS, VIBRANT_STAGES, getStageColorKey } from './production/stageConstants';
import { StagePipelineBar } from './production/StagePipelineBar';
import { BulkStageActions } from './production/BulkStageActions';
import { StageFlowRail } from './production/StageFlowRail';
import { BatchItemCard, RowItem } from './production/BatchItemCard';

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
    onBack?: () => void;
    onPartialShipment?: () => void;
    onPrintShipment?: (payload: { order: Order; shipment: OrderShipment; shipmentItems: OrderShipmentItem[] }) => void;
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────

export default function ProductionSendModal({ order, products, materials, existingBatches, collections, onClose, onSuccess, onPrintAggregated, onPrintStageBatches, onBack, onPartialShipment, onPrintShipment }: Props) {
    const { showToast, confirm } = useUI();
    const queryClient = useQueryClient();
    const { data: shipmentSnapshot, isLoading: isLoadingShipments } = useOrderShipmentsForOrder(order.id);
    const { data: batchStageHistoryEntries = [] } = useBatchStageHistoryEntries();
    const [isSending, setIsSending] = useState(false);
    const [isWorking, setIsWorking] = useState(false);
    // Per-batch in-flight tracking so individual rows show a syncing overlay
    // without blocking unrelated batches. Mirrors the ProductionPage pattern.
    const [movingBatchIds, setMovingBatchIds] = useState<Set<string>>(new Set());
    const markMoving = useCallback((ids: string[], isMoving: boolean) => {
        if (ids.length === 0) return;
        setMovingBatchIds(prev => {
            const next = new Set(prev);
            for (const id of ids) {
                if (isMoving) next.add(id);
                else next.delete(id);
            }
            return next;
        });
    }, []);
    const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
    const [zoomImageAlt, setZoomImageAlt] = useState<string>('');

    // Filters
    const [filterGender, setFilterGender] = useState<'All' | Gender>('All');
    const [filterCollection, setFilterCollection] = useState<number | 'All'>('All');
    const [searchInput, setSearchInput] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [toSendQuantities, setToSendQuantities] = useState<Record<number, number>>({});

    // Debounced search — 300ms
    useEffect(() => {
        const timer = setTimeout(() => setSearchTerm(searchInput), 300);
        return () => clearTimeout(timer);
    }, [searchInput]);

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
    // Which sub-tab to show when the Polishing (Τεχνίτης) stage popup is open.
    // 'pending'    → Αναμονή Αποστολής (teal)
    // 'dispatched' → Στον Τεχνίτη (blue)
    const [polishingPopupTab, setPolishingPopupTab] = useState<'pending' | 'dispatched'>('pending');
    const handleStagePipelineClick = useCallback(
        (stage: ProductionStage, polishingSubStage?: 'pending' | 'dispatched') => {
            if (stage === ProductionStage.Polishing) {
                setPolishingPopupTab(polishingSubStage ?? 'pending');
            }
            setActiveStagePopup(stage);
        },
        [],
    );

    // ─── OPTIMIZED: Selection as Set<string> ─────────────────────────────────
    const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());
    const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());

    // ─── Scoped batch history lookup (filtered to this order's batches) ──────
    const orderBatchIds = useMemo(() => new Set(existingBatches.map(b => b.id)), [existingBatches]);
    const batchHistoryLookup = useMemo(() => {
        const filtered = batchStageHistoryEntries.filter(e => orderBatchIds.has(e.batch_id));
        return buildBatchStageHistoryMap(filtered);
    }, [batchStageHistoryEntries, orderBatchIds]);

    const getBatchTiming = useCallback((batch: ProductionBatch) => {
        return getProductionTimingInfo(batch, batchHistoryLookup.get(batch.id));
    }, [batchHistoryLookup]);

    // Order Financials
    const vatRate = order.vat_rate !== undefined ? order.vat_rate : 0.24;
    const discountFactor = 1 - ((order.discount_percent || 0) / 100);

    // Stage counts
    const stageCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        existingBatches.forEach(b => { counts[b.current_stage] = (counts[b.current_stage] || 0) + b.quantity; });
        return counts;
    }, [existingBatches]);

    const stageOnHoldCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        existingBatches.forEach(b => { if (b.on_hold) counts[b.current_stage] = (counts[b.current_stage] || 0) + b.quantity; });
        return counts;
    }, [existingBatches]);

    // Split of the Polishing (Τεχνίτης) stage into its two sub-stages so the
    // pipeline bar can render two discreet segments with the proper colors.
    const polishingSplit = useMemo(() => {
        let pendingCount = 0, dispatchedCount = 0, pendingOnHold = 0, dispatchedOnHold = 0;
        for (const b of existingBatches) {
            if (b.current_stage !== ProductionStage.Polishing) continue;
            if (b.pending_dispatch) {
                pendingCount += b.quantity;
                if (b.on_hold) pendingOnHold += b.quantity;
            } else {
                dispatchedCount += b.quantity;
                if (b.on_hold) dispatchedOnHold += b.quantity;
            }
        }
        return { pendingCount, dispatchedCount, pendingOnHold, dispatchedOnHold };
    }, [existingBatches]);

    const totalInProduction = useMemo(() => existingBatches.reduce((sum, b) => sum + b.quantity, 0), [existingBatches]);
    const readyCount = useMemo(() => existingBatches.filter(b => b.current_stage === ProductionStage.Ready).reduce((sum, b) => sum + b.quantity, 0), [existingBatches]);
    const canPartialShip = readyCount > 0 && order.status !== OrderStatus.Delivered && order.status !== OrderStatus.Cancelled && !!onPartialShipment;

    // Popup Batches
    const popupBatches = useMemo(() => {
        if (!activeStagePopup) return [];
        return existingBatches
            .filter(b => {
                if (b.current_stage !== activeStagePopup) return false;
                if (activeStagePopup === ProductionStage.Polishing) {
                    return polishingPopupTab === 'pending' ? !!b.pending_dispatch : !b.pending_dispatch;
                }
                return true;
            })
            .sort((a, b) => {
                const skuCompare = a.sku.localeCompare(b.sku);
                if (skuCompare !== 0) return skuCompare;
                const variantCompare = (a.variant_suffix || '').localeCompare(b.variant_suffix || '');
                if (variantCompare !== 0) return variantCompare;
                return (a.size_info || '').localeCompare(b.size_info || '');
            });
    }, [activeStagePopup, existingBatches, polishingPopupTab]);

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
            const readyQty = relevantBatches.filter(b => b.current_stage === ProductionStage.Ready).reduce((s, b) => s + b.quantity, 0);
            const inProgressQty = relevantBatches.filter(b => b.current_stage !== ProductionStage.Ready).reduce((s, b) => s + b.quantity, 0);
            const sentTotal = readyQty + inProgressQty;
            const openOrderQty = Math.max(0, item.quantity - shippedQty);
            const remainingQty = Math.max(0, openOrderQty - sentTotal);

            return {
                ...item,
                shippedQty, openOrderQty, readyQty, inProgressQty, remainingQty,
                toSendQty: remainingQty,
                batchDetails: relevantBatches,
                gender: isSpecialCreationSku(item.sku) ? getSpecialCreationProductStub().gender : (product?.gender || 'Unknown'),
                collectionId: isSpecialCreationSku(item.sku) ? undefined : product?.collections?.[0],
                price: item.price_at_order,
                originalIndex: index
            } as RowItem;
        });
        return mapped.sort((a, b) => {
            const skuA = a.sku + (a.variant_suffix || '');
            const skuB = b.sku + (b.variant_suffix || '');
            return skuA.localeCompare(skuB, undefined, { numeric: true });
        });
    }, [order.items, existingBatches, products, shippedQuantities]);

    const totalRemaining = useMemo(() => rows.reduce((s, r) => s + r.remainingQty, 0), [rows]);
    const shipmentHistory = useMemo(() => groupBatchesByShipment(existingBatches), [existingBatches]);

    const relevantCollections = useMemo(() => {
        if (!collections) return [];
        const ids = new Set<number>();
        order.items.forEach(item => {
            const product = products.find(p => p.sku === item.sku);
            product?.collections?.forEach(id => ids.add(id));
        });
        return collections.filter(c => ids.has(c.id));
    }, [collections, order.items, products]);

    // Close zoom overlay on Escape
    useEffect(() => {
        if (!zoomImageUrl) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { setZoomImageUrl(null); setZoomImageAlt(''); } };
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
                const combined = (row.sku + (row.variant_suffix || '')).toLowerCase();
                if (
                    !row.sku.toLowerCase().includes(term) &&
                    !(row.variant_suffix || '').toLowerCase().includes(term) &&
                    !combined.includes(term) &&
                    !product?.category?.toLowerCase().includes(term) &&
                    !stub?.description?.toLowerCase().includes(term) &&
                    !(row.notes || '').toLowerCase().includes(term)
                ) return false;
            }
            return true;
        });
    }, [rows, filterGender, filterCollection, products, searchTerm]);

    const visibleActiveBatches = useMemo(
        () => filteredRows.flatMap((row) => row.batchDetails),
        [filteredRows]
    );

    const visiblePopupBatchIds = useMemo(
        () => new Set(popupBatches.map(b => b.id)),
        [popupBatches]
    );

    const totalSelectedCount = useMemo(
        () => selectedBatchIds.size,
        [selectedBatchIds]
    );

    const selectedVisibleActiveCount = useMemo(
        () => visibleActiveBatches.filter(b => selectedBatchIds.has(b.id)).length,
        [selectedBatchIds, visibleActiveBatches]
    );

    const selectedVisiblePopupCount = useMemo(
        () => popupBatches.filter(b => selectedBatchIds.has(b.id)).length,
        [selectedBatchIds, popupBatches]
    );

    // Derived "something in this order is currently syncing" flag — used to
    // disable order-wide controls (merge-all-parts) without reverting to the
    // global lock.
    const anyOrderBatchMoving = useMemo(
        () => existingBatches.some(b => movingBatchIds.has(b.id)),
        [existingBatches, movingBatchIds]
    );
    const isAnySelectedMoving = useMemo(
        () => Array.from(selectedBatchIds).some(id => movingBatchIds.has(id)),
        [selectedBatchIds, movingBatchIds]
    );
    const isAnyPopupSelectedMoving = useMemo(
        () => popupBatches.some(b => selectedBatchIds.has(b.id) && movingBatchIds.has(b.id)),
        [popupBatches, selectedBatchIds, movingBatchIds]
    );

    // ─── Auto-expand batches (≤2 per item = expanded, ≥3 = collapsed) ───────
    useEffect(() => {
        const next = new Set<string>();
        rows.forEach(row => {
            if (row.batchDetails.length <= 2) {
                row.batchDetails.forEach(b => next.add(b.id));
            }
        });
        setExpandedBatches(next);
    }, [rows]);

    // ─── SELECTION HELPERS ───────────────────────────────────────────────────

    const toggleBatchSelection = useCallback((batchId: string) => {
        setSelectedBatchIds(prev => {
            const next = new Set(prev);
            if (next.has(batchId)) next.delete(batchId); else next.add(batchId);
            return next;
        });
    }, []);

    const selectBatchIds = useCallback((batchIds: string[]) => {
        setSelectedBatchIds(prev => {
            const next = new Set(prev);
            batchIds.forEach(id => next.add(id));
            return next;
        });
    }, []);

    const clearBatchSelection = useCallback((batchIds?: string[]) => {
        if (!batchIds) { setSelectedBatchIds(new Set()); return; }
        setSelectedBatchIds(prev => {
            const next = new Set(prev);
            batchIds.forEach(id => next.delete(id));
            return next;
        });
    }, []);

    const toggleBatchExpand = useCallback((batchId: string) => {
        setExpandedBatches(prev => {
            const next = new Set(prev);
            if (next.has(batchId)) next.delete(batchId); else next.add(batchId);
            return next;
        });
    }, []);

    // ─── SEND LOGIC ─────────────────────────────────────────────────────────

    const currentSendValue = useMemo(() => {
        return order.items.reduce((sum, item, idx) => {
            const qty = toSendQuantities[idx] || 0;
            return sum + (qty * item.price_at_order * discountFactor);
        }, 0);
    }, [order.items, toSendQuantities, discountFactor]);

    const totalToSend = useMemo(() => (Object.values(toSendQuantities) as number[]).reduce((a, b) => a + b, 0), [toSendQuantities]);

    const updateToSend = useCallback((originalIdx: number, val: number) => {
        const item = order.items[originalIdx];
        if (!item) return;
        const row = rows.find(r => r.originalIndex === originalIdx);
        const maxQty = row ? row.remainingQty : item.quantity;
        setToSendQuantities(prev => ({ ...prev, [originalIdx]: Math.min(maxQty, Math.max(0, val)) }));
    }, [order.items, rows]);

    const handleSelectVisible = useCallback(() => {
        if (isLoadingShipments) { showToast("Περιμένετε να φορτωθεί το ιστορικό αποστολών.", "info"); return; }
        const newQuantities = { ...toSendQuantities };
        filteredRows.forEach(row => { if (row.remainingQty > 0) newQuantities[row.originalIndex] = row.remainingQty; });
        setToSendQuantities(newQuantities);
    }, [isLoadingShipments, showToast, toSendQuantities, filteredRows]);

    const handleClearSelection = useCallback(() => setToSendQuantities({}), []);

    const executeSend = useCallback(async (
        itemsToSend: Array<{ sku: string; variant: string | null; qty: number; size_info?: string; cord_color?: string | null; enamel_color?: string | null; notes?: string; line_id?: string | null }>,
        stockFulfilledItems?: Array<{ sku: string; variant_suffix: string | null; qty: number; size_info?: string | null; cord_color?: string | null; enamel_color?: string | null; line_id?: string | null }>
    ) => {
        setIsSending(true);
        try {
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
    }, [order.id, products, materials, queryClient, showToast]);

    const handleSend = useCallback(async () => {
        if (isLoadingShipments) { showToast("Περιμένετε να φορτωθεί το ιστορικό αποστολών.", "info"); return; }
        const itemsToSend = rows.map((r) => ({
            sku: r.sku, variant: r.variant_suffix || null, qty: toSendQuantities[r.originalIndex] || 0,
            size_info: r.size_info, cord_color: r.cord_color || null, enamel_color: r.enamel_color || null,
            notes: r.notes, line_id: r.line_id ?? null
        })).filter(i => i.qty > 0);
        if (itemsToSend.length === 0) { showToast("Δεν επιλέχθηκαν τεμάχια για αποστολή.", "info"); return; }
        const stockCheck = checkStockForOrderItems(itemsToSend, products);
        const hasStock = stockCheck.some(s => s.available_in_stock > 0);
        if (hasStock) {
            setStockDecision({
                items: stockCheck.map(s => ({ ...s, fromStock: Math.min(s.available_in_stock, s.requested_qty) })),
                originalItemsToSend: itemsToSend
            });
            return;
        }
        await executeSend(itemsToSend);
    }, [isLoadingShipments, showToast, rows, toSendQuantities, products, executeSend]);

    const handleConfirmStockDecision = useCallback(async () => {
        if (!stockDecision) return;
        const stockFulfilled = stockDecision.items
            .filter(i => i.fromStock > 0)
            .map(i => ({ sku: i.sku, variant_suffix: i.variant_suffix, qty: i.fromStock, size_info: i.size_info, cord_color: i.cord_color || null, enamel_color: i.enamel_color || null, line_id: i.line_id ?? null }));
        const productionItems = stockDecision.originalItemsToSend.map(orig => {
            const matchKey = buildOrderItemIdentityKey({
                sku: orig.sku, variant_suffix: orig.variant, size_info: orig.size_info,
                cord_color: orig.cord_color as OrderItem['cord_color'], enamel_color: orig.enamel_color as OrderItem['enamel_color'],
                line_id: orig.line_id ?? null
            });
            const match = stockDecision.items.find(s => buildOrderItemIdentityKey({
                sku: s.sku, variant_suffix: s.variant_suffix, size_info: s.size_info,
                cord_color: s.cord_color as OrderItem['cord_color'], enamel_color: s.enamel_color as OrderItem['enamel_color'],
                line_id: s.line_id ?? null
            }) === matchKey);
            if (!match) return orig;
            return { ...orig, qty: orig.qty - match.fromStock };
        }).filter(i => i.qty > 0);
        await executeSend(
            productionItems.length > 0 ? productionItems : stockDecision.originalItemsToSend.map(i => ({ ...i, qty: 0 })),
            stockFulfilled
        );
    }, [stockDecision, executeSend]);

    // ─── Optimistic cache helpers (mirrors ProductionPage) ──────────────────
    // Instantly jumps a batch to its target stage in the cache, so its row in
    // this modal (and any other consumer of productionKeys.batches()) updates
    // without waiting for the network round-trip. Returns a snapshot used to
    // roll back on error.
    const applyOptimisticStage = useCallback((
        batchId: string,
        targetStage: ProductionStage,
        pendingDispatch?: boolean,
    ): ProductionBatch[] | undefined => {
        const key = productionKeys.batches();
        const prev = queryClient.getQueryData<ProductionBatch[]>(key);
        const nowIso = new Date().toISOString();
        queryClient.setQueryData<ProductionBatch[]>(key, (cur) => {
            if (!cur) return cur;
            return cur.map(b => {
                if (b.id !== batchId) return b;
                const wasPolishing = b.current_stage === ProductionStage.Polishing;
                const willBePolishing = targetStage === ProductionStage.Polishing;
                return {
                    ...b,
                    current_stage: targetStage,
                    pending_dispatch: willBePolishing
                        ? (pendingDispatch ?? true)
                        : (wasPolishing ? false : b.pending_dispatch),
                    updated_at: nowIso,
                };
            });
        });
        return prev;
    }, [queryClient]);

    const applyOptimisticBulkStage = useCallback((
        batchIds: string[],
        targetStage: ProductionStage,
        pendingDispatch?: boolean,
    ): ProductionBatch[] | undefined => {
        const key = productionKeys.batches();
        const prev = queryClient.getQueryData<ProductionBatch[]>(key);
        const idSet = new Set(batchIds);
        const nowIso = new Date().toISOString();
        queryClient.setQueryData<ProductionBatch[]>(key, (cur) => {
            if (!cur) return cur;
            return cur.map(b => {
                if (!idSet.has(b.id)) return b;
                const wasPolishing = b.current_stage === ProductionStage.Polishing;
                const willBePolishing = targetStage === ProductionStage.Polishing;
                return {
                    ...b,
                    current_stage: targetStage,
                    pending_dispatch: willBePolishing
                        ? (pendingDispatch ?? true)
                        : (wasPolishing ? false : b.pending_dispatch),
                    updated_at: nowIso,
                };
            });
        });
        return prev;
    }, [queryClient]);

    const rollbackBatchesCache = useCallback((snapshot: ProductionBatch[] | undefined) => {
        if (!snapshot) return;
        queryClient.setQueryData<ProductionBatch[]>(productionKeys.batches(), snapshot);
    }, [queryClient]);

    // ─── BATCH MANAGEMENT ACTIONS ───────────────────────────────────────────

    const handleStageMove = useCallback(async (batch: ProductionBatch, newStage: ProductionStage, options?: { pendingDispatch?: boolean }) => {
        if (movingBatchIds.has(batch.id)) return;
        if (batch.on_hold) {
            showToast("Η παρτίδα είναι σε αναμονή. Ξεμπλοκάρετε την πρώτα.", "error");
            return;
        }
        const pendingDispatch = newStage === ProductionStage.Polishing ? (options?.pendingDispatch ?? true) : undefined;

        // Intra-Polishing sub-stage toggle (dispatch / recall) — same stage,
        // only flips pending_dispatch. Skip if not changing anything.
        if (batch.current_stage === ProductionStage.Polishing && newStage === ProductionStage.Polishing) {
            if (pendingDispatch === batch.pending_dispatch) return;
        } else if (batch.current_stage === newStage) {
            return;
        }

        markMoving([batch.id], true);
        await queryClient.cancelQueries({ queryKey: productionKeys.batches() });
        const snapshot = applyOptimisticStage(batch.id, newStage, pendingDispatch);
        try {
            await productionRepository.updateBatchStage(batch.id, newStage, undefined, pendingDispatch);
            await Promise.all([invalidateOrdersAndBatches(queryClient), queryClient.invalidateQueries({ queryKey: ['products'] })]);
            showToast("Η παρτίδα μετακινήθηκε.", "success");
        } catch (e) {
            rollbackBatchesCache(snapshot);
            showToast("Σφάλμα ενημέρωσης.", "error");
        } finally {
            markMoving([batch.id], false);
        }
    }, [movingBatchIds, markMoving, queryClient, applyOptimisticStage, rollbackBatchesCache, showToast]);

    const handleDeleteBatch = useCallback(async (batch: ProductionBatch) => {
        if (movingBatchIds.has(batch.id)) return;
        if (!await confirm({ title: 'Διαγραφή', message: `Διαγραφή παρτίδας (${batch.quantity} τεμ);`, isDestructive: true })) return;
        markMoving([batch.id], true);
        try {
            await productionRepository.deleteProductionBatch(batch.id);
            await Promise.all([invalidateOrdersAndBatches(queryClient), queryClient.invalidateQueries({ queryKey: ['products'] })]);
            showToast("Η παρτίδα διαγράφηκε.", "info");
        } catch (e) { showToast("Σφάλμα διαγραφής.", "error"); }
        finally { markMoving([batch.id], false); }
    }, [movingBatchIds, markMoving, queryClient, showToast, confirm]);

    const handleRevertBatch = useCallback(async (batch: ProductionBatch) => {
        if (movingBatchIds.has(batch.id)) return;
        const batchLabel = [
            `${batch.sku}${batch.variant_suffix || ''}`, batch.size_info,
            batch.cord_color ? `Κορδόνι: ${getProductOptionColorLabel(batch.cord_color)}` : null,
            batch.enamel_color ? `Σμάλτο: ${getProductOptionColorLabel(batch.enamel_color)}` : null
        ].filter(Boolean).join(' / ');
        const stockHint = batch.type === 'Από Stock' ? ' Η ποσότητα θα επιστραφεί και στο απόθεμα.' : '';
        if (!await confirm({
            title: 'Επαναφορά παρτίδας',
            message: `Η παρτίδα ${batchLabel} (${batch.quantity} τεμ.) θα αφαιρεθεί από την παραγωγή.${stockHint}`,
            isDestructive: true, confirmText: 'Επαναφορά'
        })) return;
        markMoving([batch.id], true);
        try {
            await productionRepository.revertProductionBatch(batch.id);
            await Promise.all([invalidateOrdersAndBatches(queryClient), queryClient.invalidateQueries({ queryKey: ['products'] })]);
            showToast("Η παρτίδα επανήλθε επιτυχώς.", "success");
        } catch (e) { showToast("Σφάλμα κατά την επαναφορά.", "error"); }
        finally { markMoving([batch.id], false); }
    }, [movingBatchIds, markMoving, queryClient, showToast, confirm]);

    const handleMergeAllParts = useCallback(async () => {
        if (isWorking || shipmentHistory.length < 2) return;
        if (!await confirm({
            title: 'Συγχώνευση Τμημάτων',
            message: `Τα ${shipmentHistory.length} τμήματα θα ενοποιηθούν σε ένα.`,
            confirmText: 'Συγχώνευση', cancelText: 'Ακύρωση',
        })) return;
        const earliestGroup = shipmentHistory[shipmentHistory.length - 1];
        const earliestCreatedAt = earliestGroup[1][0].created_at;
        const earliestMinute = earliestGroup[0];
        const batchIdsToMove = shipmentHistory.filter(([k]) => k !== earliestMinute).flatMap(([, bs]) => bs.map(b => b.id));
        if (batchIdsToMove.length === 0) return;
        // Lock every impacted batch so each row shows the syncing indicator.
        markMoving(batchIdsToMove, true);
        try {
            await productionRepository.mergeBatchParts(batchIdsToMove, earliestCreatedAt);
            await invalidateProductionBatches(queryClient);
            showToast('Τα τμήματα συγχωνεύτηκαν επιτυχώς.', 'success');
        } catch (e) { showToast('Σφάλμα συγχώνευσης.', 'error'); }
        finally { markMoving(batchIdsToMove, false); }
    }, [isWorking, shipmentHistory, markMoving, queryClient, showToast, confirm]);

    const handleToggleHold = useCallback(async (batch: ProductionBatch) => {
        if (movingBatchIds.has(batch.id)) return;
        if (batch.on_hold) {
            markMoving([batch.id], true);
            try {
                await productionRepository.toggleBatchHold(batch.id, false);
                await invalidateProductionBatches(queryClient);
                showToast('Η παρτίδα συνεχίζει.', 'success');
            } catch (e) { showToast('Σφάλμα.', 'error'); }
            finally { markMoving([batch.id], false); }
            return;
        }
        setHoldingBatch(batch);
        setHoldReason(batch.on_hold_reason || '');
    }, [movingBatchIds, markMoving, queryClient, showToast]);

    const confirmHold = useCallback(async () => {
        if (!holdingBatch || !holdReason.trim()) return;
        const targetId = holdingBatch.id;
        markMoving([targetId], true);
        try {
            await productionRepository.toggleBatchHold(targetId, true, holdReason.trim());
            await invalidateProductionBatches(queryClient);
            showToast('Σε αναμονή.', 'warning');
            setHoldingBatch(null); setHoldReason('');
        } catch (e) { showToast('Σφάλμα.', 'error'); }
        finally { markMoving([targetId], false); }
    }, [holdingBatch, holdReason, markMoving, queryClient, showToast]);

    const handleBulkStageMove = useCallback(async (newStage: ProductionStage, batchIds: string[], options?: { pendingDispatch?: boolean }) => {
        if (batchIds.length === 0) return;
        // Skip any batches that are already mid-move to avoid conflicting
        // transitions; other selections continue normally.
        const targetIds = batchIds.filter(id => !movingBatchIds.has(id));
        if (targetIds.length === 0) return;
        const pendingDispatch = newStage === ProductionStage.Polishing ? (options?.pendingDispatch ?? true) : undefined;

        markMoving(targetIds, true);
        await queryClient.cancelQueries({ queryKey: productionKeys.batches() });
        const snapshot = applyOptimisticBulkStage(targetIds, newStage, pendingDispatch);
        try {
            const summary = await productionRepository.bulkUpdateBatchStages(targetIds, newStage, undefined, pendingDispatch);
            await Promise.all([invalidateOrdersAndBatches(queryClient), queryClient.invalidateQueries({ queryKey: ['products'] })]);
            clearBatchSelection(targetIds);
            showToast(`${summary.movedCount} μετακινήθηκαν${summary.skippedCount > 0 ? `, ${summary.skippedCount} παραλείφθηκαν` : ''}.`, summary.movedCount > 0 ? "success" : "info");
        } catch (e) {
            rollbackBatchesCache(snapshot);
            showToast("Σφάλμα μαζικής μετακίνησης.", "error");
        } finally {
            markMoving(targetIds, false);
        }
    }, [movingBatchIds, markMoving, queryClient, applyOptimisticBulkStage, rollbackBatchesCache, clearBatchSelection, showToast]);

    const handleMergeBatches = useCallback(async (stage: ProductionStage, batchesToMerge: ProductionBatch[]) => {
        if (batchesToMerge.length < 2) return;
        const ids = batchesToMerge.map(b => b.id);
        if (ids.some(id => movingBatchIds.has(id))) return;
        const totalQty = batchesToMerge.reduce((sum, b) => sum + b.quantity, 0);
        if (!await confirm({
            title: 'Συγχώνευση Παρτίδων',
            message: `${batchesToMerge.length} παρτίδες → 1 × ${totalQty} τεμ.`,
            confirmText: 'Συγχώνευση'
        })) return;
        markMoving(ids, true);
        try {
            await productionRepository.mergeBatches(batchesToMerge[0].id, batchesToMerge.slice(1).map(b => b.id), totalQty);
            await invalidateProductionBatches(queryClient);
            showToast("Επιτυχής συγχώνευση.", "success");
        } catch (e) { showToast("Σφάλμα συγχώνευσης.", "error"); }
        finally { markMoving(ids, false); }
    }, [movingBatchIds, markMoving, queryClient, showToast, confirm]);

    const handleSaveNote = useCallback(async () => {
        if (!editingNoteBatch) return;
        setIsWorking(true);
        try {
            const { error } = await productionRepository.updateBatchNotes(editingNoteBatch.id, noteText || null);
            if (error) throw error;
            await invalidateProductionBatches(queryClient);
            showToast("Σημείωση ενημερώθηκε.", "success");
            setEditingNoteBatch(null);
        } catch (e) { showToast("Σφάλμα.", "error"); }
        finally { setIsWorking(false); }
    }, [editingNoteBatch, noteText, queryClient, showToast]);

    const handleViewHistory = useCallback(async (batch: ProductionBatch) => {
        setHistoryModalBatch(batch);
        try {
            const history = await productionRepository.getBatchHistory(batch.id);
            setBatchHistory(history);
        } catch (e) {
            setBatchHistory([]);
            showToast('Αποτυχία φόρτωσης ιστορικού.', 'error');
        }
    }, [showToast]);

    const openSplitModal = useCallback((batch: ProductionBatch) => {
        if (batch.quantity < 2) return;
        setSplitTarget({ batch, maxQty: batch.quantity });
        setSplitQty(1);
        const currIdx = STAGES.findIndex(s => s.id === batch.current_stage);
        setSplitStage(STAGES[Math.min(STAGES.length - 1, currIdx + 1)].id as ProductionStage);
    }, []);

    const handleSplit = useCallback(async () => {
        if (!splitTarget) return;
        if (splitQty >= splitTarget.maxQty) {
            // Whole-batch path: delegate to handleStageMove so we get the same
            // optimistic jump + rollback behavior as a normal move.
            await handleStageMove(splitTarget.batch, splitStage);
            setSplitTarget(null); return;
        }
        const batch = splitTarget.batch;
        if (movingBatchIds.has(batch.id)) return;
        markMoving([batch.id], true);
        try {
            const newBatchData = {
                id: crypto.randomUUID(), order_id: batch.order_id, sku: batch.sku,
                variant_suffix: batch.variant_suffix, quantity: splitQty, current_stage: splitStage,
                created_at: batch.created_at, updated_at: new Date().toISOString(),
                priority: batch.priority, type: batch.type, notes: batch.notes,
                requires_setting: batch.requires_setting, requires_assembly: batch.requires_assembly,
                size_info: batch.size_info, cord_color: batch.cord_color, enamel_color: batch.enamel_color,
                on_hold: false
            };
            await productionRepository.splitBatch(batch.id, splitTarget.maxQty - splitQty, newBatchData);
            await invalidateProductionBatches(queryClient);
            showToast(`Διαχωρισμός ${splitQty} τεμ. επιτυχής.`, "success");
            setSplitTarget(null);
        } catch (e) { showToast("Σφάλμα.", "error"); }
        finally { markMoving([batch.id], false); }
    }, [splitTarget, splitQty, splitStage, handleStageMove, movingBatchIds, markMoving, queryClient, showToast]);

    const handleZoomImage = useCallback((url: string, alt: string) => {
        setZoomImageUrl(url); setZoomImageAlt(alt);
    }, []);

    const handleEditNote = useCallback((batch: ProductionBatch) => {
        setEditingNoteBatch(batch); setNoteText(batch.notes || '');
    }, []);

    // ─── VIRTUALIZATION ─────────────────────────────────────────────────────
    const listParentRef = useRef<HTMLDivElement>(null);
    const popupListParentRef = useRef<HTMLDivElement>(null);

    const rowVirtualizer = useVirtualizer({
        count: filteredRows.length,
        getScrollElement: () => listParentRef.current,
        estimateSize: () => 180,
        overscan: 4,
    });

    const popupVirtualizer = useVirtualizer({
        count: popupBatches.length,
        getScrollElement: () => popupListParentRef.current,
        estimateSize: () => 220,
        overscan: 4,
    });

    // ─── Memoized sidebar financials ────────────────────────────────────────
    const memoizedShipmentFinancials = useMemo(() => {
        if (!shipmentSnapshot) return [];
        return [...shipmentSnapshot.shipments]
            .sort((a, b) => a.shipment_number - b.shipment_number)
            .map(shipment => {
                const shipItems = shipmentSnapshot.items.filter(si => si.shipment_id === shipment.id);
                const totalQty = shipItems.reduce((s, si) => s + si.quantity, 0);
                let net = 0;
                shipItems.forEach(si => { net += si.price_at_order * si.quantity * discountFactor; });
                return { shipment, shipItems, totalQty, net, vat: net * vatRate, total: net + net * vatRate };
            });
    }, [shipmentSnapshot, discountFactor, vatRate]);

    const memoizedProductionWaves = useMemo(() => {
        return shipmentHistory.map(([dateKey, batches]) => {
            const totalItems = batches.reduce((acc, b) => acc + b.quantity, 0);
            let net = 0;
            batches.forEach(b => {
                const item = order.items.find(i => buildOrderItemIdentityKey(i) === buildOrderItemIdentityKey(b));
                if (item) net += item.price_at_order * b.quantity * discountFactor;
            });
            return { dateKey, batches, totalItems, net, vat: net * vatRate, total: net + net * vatRate };
        });
    }, [shipmentHistory, order.items, discountFactor, vatRate]);

    // ═════════════════════════════════════════════════════════════════════════
    // RENDER
    // ═════════════════════════════════════════════════════════════════════════

    return (
        <div className="fixed inset-0 z-[230] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in zoom-in-95">
            <div className="bg-white w-full h-full max-w-[1600px] sm:h-[92vh] sm:rounded-[2rem] shadow-2xl flex flex-col overflow-hidden border border-slate-200 relative">

                {isWorking && (
                    <div className="absolute inset-0 bg-white/50 backdrop-blur-[2px] z-50 flex items-center justify-center">
                        <Loader2 className="animate-spin text-slate-800" size={48} />
                    </div>
                )}

                {/* ═══ HEADER ═══ */}
                <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-100 bg-white sticky top-0 z-10 flex justify-between items-start shrink-0 gap-4">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="p-2.5 bg-[#060b00] text-white rounded-xl shadow-lg hidden sm:block">
                            <Factory size={24} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">Διαχείριση Παραγωγής</h2>
                            <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-500 mt-0.5">
                                <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100 text-xs">#{formatOrderId(order.id)}</span>
                                <span className="flex items-start gap-1 min-w-0 text-slate-600 text-xs">
                                    <User size={13} className="mt-0.5 shrink-0" />
                                    <span className="break-words">{order.customer_name}</span>
                                </span>
                            </div>

                            {/* Pipeline Bar */}
                            <StagePipelineBar
                                stageCounts={stageCounts}
                                stageOnHoldCounts={stageOnHoldCounts}
                                totalInProduction={totalInProduction}
                                onStageClick={handleStagePipelineClick}
                                polishingSplit={polishingSplit}
                            />
                        </div>
                    </div>

                    <div className="flex gap-2 shrink-0">
                        {order.notes && (
                            <div className="hidden lg:flex items-start gap-2 bg-yellow-50 text-yellow-800 px-3 py-1.5 rounded-xl border border-yellow-100 mr-2 max-w-[500px]" title={order.notes}>
                                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                <span className="text-[10px] font-bold break-words whitespace-normal leading-snug">{order.notes}</span>
                            </div>
                        )}
                        {onBack && (
                            <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 hover:text-slate-700 transition-colors" title="Πίσω">
                                <ArrowLeft size={22} />
                            </button>
                        )}
                        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"><X size={22} /></button>
                    </div>
                </div>

                <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

                    {/* ═══ LEFT PANEL ═══ */}
                    <div className="flex-1 flex flex-col min-h-0 bg-slate-50/50">

                        {/* Filters */}
                        <div className="px-3 py-2.5 border-b border-slate-100 bg-white flex items-center gap-2 overflow-x-auto scrollbar-hide shrink-0">
                            <div className="flex items-center gap-1.5 bg-slate-50 p-0.5 rounded-lg border border-slate-100 shrink-0">
                                <span className="text-[9px] font-black text-slate-400 uppercase px-1.5 hidden sm:inline"><Filter size={9} className="inline mr-0.5" />Φύλο</span>
                                {['All', Gender.Women, Gender.Men, Gender.Unisex].map(g => (
                                    <button
                                        key={g} onClick={() => setFilterGender(g as any)}
                                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all whitespace-nowrap ${filterGender === g ? 'bg-white shadow-sm text-slate-900 ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        {g === 'All' ? 'Όλα' : (g === Gender.Women ? 'Γ' : (g === Gender.Men ? 'Α' : 'U'))}
                                    </button>
                                ))}
                            </div>

                            {relevantCollections.length > 0 && (
                                <select
                                    value={filterCollection}
                                    onChange={(e) => setFilterCollection(e.target.value === 'All' ? 'All' : parseInt(e.target.value))}
                                    className="bg-white border border-slate-200 text-slate-700 text-[11px] font-bold py-1.5 pl-2.5 pr-7 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer shrink-0 max-w-[140px]"
                                >
                                    <option value="All">Συλλογές</option>
                                    {relevantCollections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            )}

                            <div className="relative group shrink-0">
                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={13} />
                                <input
                                    type="text"
                                    placeholder="Αναζήτηση..."
                                    value={searchInput}
                                    onChange={(e) => setSearchInput(e.target.value)}
                                    className="pl-7 pr-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-bold outline-none focus:ring-2 focus:ring-blue-500/20 w-28 focus:w-44 transition-all text-slate-700 placeholder:text-slate-400"
                                />
                            </div>
                        </div>

                        {isLoadingShipments && (
                            <div className="px-3 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-2 text-xs font-bold text-blue-700">
                                <Loader2 size={14} className="animate-spin" />
                                Φόρτωση ιστορικού αποστολών...
                            </div>
                        )}

                        {/* Virtualized Item List */}
                        <div ref={listParentRef} className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                            {/* Sticky bulk bar */}
                            {visibleActiveBatches.length > 0 && (
                                <div className="sticky top-0 z-[5] mx-3 mt-3 mb-2 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl p-2.5 shadow-sm">
                                    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <button
                                                onClick={() => selectBatchIds(visibleActiveBatches.map(b => b.id))}
                                                className="px-2.5 py-1 rounded-md text-[11px] font-black bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
                                            >
                                                Επιλ. όλων
                                            </button>
                                            <button
                                                onClick={() => clearBatchSelection(visibleActiveBatches.map(b => b.id))}
                                                className="px-2.5 py-1 rounded-md text-[11px] font-black bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
                                            >
                                                Καθαρ.
                                            </button>
                                            <span className="text-[11px] font-black text-slate-500">
                                                Επιλ: <span className="text-slate-900">{totalSelectedCount}</span>
                                                {searchTerm && selectedVisibleActiveCount !== totalSelectedCount && (
                                                    <span className="text-slate-400 ml-1">({selectedVisibleActiveCount} ορατές)</span>
                                                )}
                                            </span>
                                        </div>
                                        <BulkStageActions
                                            disabled={isAnySelectedMoving || totalSelectedCount === 0}
                                            onMove={(stage, options) => handleBulkStageMove(stage, Array.from(selectedBatchIds), options)}
                                        />
                                    </div>
                                </div>
                            )}

                            {filteredRows.length > 0 ? (
                                <div className="px-3 pb-3" style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
                                    {rowVirtualizer.getVirtualItems().map(virtualRow => {
                                        const row = filteredRows[virtualRow.index];
                                        const product = products.find(p => p.sku === row.sku);
                                        const currentSend = toSendQuantities[row.originalIndex] || 0;
                                        return (
                                            <div
                                                key={buildOrderItemIdentityKey(row)}
                                                data-index={virtualRow.index}
                                                ref={rowVirtualizer.measureElement}
                                                style={{
                                                    position: 'absolute',
                                                    top: 0,
                                                    left: 0,
                                                    width: '100%',
                                                    transform: `translateY(${virtualRow.start}px)`,
                                                }}
                                            >
                                                <div className="pb-3">
                                                    <BatchItemCard
                                                        row={row}
                                                        product={product}
                                                        currentSend={currentSend}
                                                        discountFactor={discountFactor}
                                                        isWorking={isWorking}
                                                        movingBatchIds={movingBatchIds}
                                                        selectedBatchIds={selectedBatchIds}
                                                        expandedBatches={expandedBatches}
                                                        getBatchTiming={getBatchTiming}
                                                        rows={rows}
                                                        onUpdateToSend={updateToSend}
                                                        onToggleBatchSelect={toggleBatchSelection}
                                                        onToggleBatchExpand={toggleBatchExpand}
                                                        onStageMove={handleStageMove}
                                                        onToggleHold={handleToggleHold}
                                                        onEditNote={handleEditNote}
                                                        onViewHistory={handleViewHistory}
                                                        onRevert={handleRevertBatch}
                                                        onSplit={openSplitModal}
                                                        onDelete={handleDeleteBatch}
                                                        onMergeBatches={handleMergeBatches}
                                                        onZoomImage={handleZoomImage}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-center py-10 text-slate-400 italic text-sm">Δεν βρέθηκαν είδη.</div>
                            )}
                        </div>
                    </div>

                    {/* ═══ RIGHT PANEL ═══ */}
                    <div className="w-full lg:w-[420px] bg-white flex flex-col shrink-0 border-t lg:border-t-0 lg:border-l border-slate-100 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-20">

                        {/* Send Summary */}
                        <div className="p-5 bg-[#060b00] text-white flex flex-col gap-3 shrink-0">
                            <h3 className="font-bold uppercase text-[10px] tracking-widest text-slate-400 flex items-center gap-2">
                                <Wallet size={13} /> Τρέχουσα Αποστολή
                            </h3>
                            <div className="flex justify-between items-end">
                                <div>
                                    <div className="text-3xl font-black tracking-tight">{totalToSend} <span className="text-base font-medium text-slate-400">τεμ</span></div>
                                    <div className="text-[10px] text-slate-400 font-bold mt-0.5">Επιλεγμένα Είδη</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xl font-black text-emerald-400">{formatCurrency(currentSendValue)}</div>
                                    <div className="text-[9px] text-slate-500 font-bold uppercase">Καθαρή Αξία</div>
                                </div>
                            </div>
                            <button
                                onClick={handleSend}
                                disabled={isSending || isLoadingShipments || totalToSend === 0}
                                className="w-full py-3.5 bg-white text-slate-900 rounded-xl font-black text-base shadow-lg hover:bg-emerald-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 active:scale-95"
                            >
                                {isSending ? <Loader2 className="animate-spin" size={18} /> : <Factory size={18} />}
                                {isSending ? 'Αποστολή...' : 'Εκκίνηση Παραγωγής'}
                            </button>
                        </div>

                        {/* History/Shipments */}
                        <div className="flex-1 overflow-y-auto p-3 bg-slate-50 border-t border-slate-900 space-y-4">

                            {canPartialShip && (
                                <button
                                    onClick={() => { onClose(); onPartialShipment!(); }}
                                    className="w-full text-left p-3 rounded-xl flex items-center gap-3 font-bold bg-amber-50 border-2 border-amber-300 text-amber-800 hover:bg-amber-100 transition-colors shadow-sm"
                                >
                                    <Truck size={16} className="shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-black">Μερική Αποστολή</div>
                                        <div className="text-[10px] font-medium text-amber-600">{readyCount} τεμ. έτοιμα</div>
                                    </div>
                                    <Send size={12} className="shrink-0 text-amber-500" />
                                </button>
                            )}

                            {/* Customer Shipments */}
                            <div>
                                <h3 className="font-bold text-slate-500 uppercase text-[10px] tracking-widest flex items-center gap-2 mb-2">
                                    <Truck size={13} /> Αποστολές Πελάτη
                                </h3>
                                {isLoadingShipments ? (
                                    <div className="flex items-center justify-center py-4 text-slate-400 text-xs">
                                        <Loader2 size={14} className="animate-spin mr-2" /> Φόρτωση...
                                    </div>
                                ) : memoizedShipmentFinancials.length > 0 ? (
                                    <div className="space-y-2">
                                        {memoizedShipmentFinancials.map(({ shipment, shipItems, totalQty, net, vat, total }) => {
                                            const prettyDate = new Date(shipment.shipped_at).toLocaleDateString('el-GR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                                            return (
                                                <div key={shipment.id} className="bg-white p-2.5 rounded-xl border border-emerald-200 shadow-sm">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[9px] font-black bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full uppercase tracking-wide">#{shipment.shipment_number}</span>
                                                            <span className="text-[11px] font-bold text-slate-700">{prettyDate}</span>
                                                        </div>
                                                        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{totalQty} τεμ.</span>
                                                    </div>
                                                    {shipment.shipped_by && (
                                                        <div className="text-[9px] text-slate-400 mb-1.5 flex items-center gap-1"><User size={9} /> {shipment.shipped_by}</div>
                                                    )}
                                                    <div className="space-y-0.5 text-[11px]">
                                                        <div className="flex justify-between text-slate-500"><span>Καθαρή:</span><span className="font-mono font-bold">{formatCurrency(net)}</span></div>
                                                        <div className="flex justify-between text-slate-500"><span>ΦΠΑ ({(vatRate * 100).toFixed(0)}%):</span><span className="font-mono font-bold">{formatCurrency(vat)}</span></div>
                                                        <div className="flex justify-between font-black text-slate-800 border-t border-slate-100 pt-0.5 mt-0.5"><span>Σύνολο:</span><span>{formatCurrency(total)}</span></div>
                                                    </div>
                                                    {onPrintShipment && (
                                                        <button
                                                            onClick={() => onPrintShipment({ order, shipment, shipmentItems: shipItems })}
                                                            className="w-full py-1.5 bg-slate-50 hover:bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-colors mt-1.5"
                                                        >
                                                            <FileText size={11} /> Δελτίο Αποστολής
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-center py-3 text-slate-400 italic text-[10px]">Δεν υπάρχουν αποστολές.</div>
                                )}
                            </div>

                            {/* Production Waves */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="font-bold text-slate-500 uppercase text-[10px] tracking-widest flex items-center gap-2">
                                        <History size={13} /> Εκκινήσεις Παραγωγής
                                    </h3>
                                    {shipmentHistory.length > 1 && (
                                        <button onClick={handleMergeAllParts} disabled={isWorking || anyOrderBatchMoving}
                                            className="flex items-center gap-1 px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg text-[10px] font-bold transition-colors disabled:opacity-50">
                                            {anyOrderBatchMoving ? <Loader2 size={10} className="animate-spin" /> : <Merge size={10} />}
                                            Συγχ. Τμημάτων
                                        </button>
                                    )}
                                </div>
                                {memoizedProductionWaves.length > 0 ? memoizedProductionWaves.map(({ dateKey, batches, totalItems, net, vat, total }) => {
                                    const prettyDate = new Date(dateKey).toLocaleDateString('el-GR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
                                    return (
                                        <div key={dateKey} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm hover:border-blue-300 transition-colors mb-2">
                                            <div className="flex justify-between items-start mb-1.5">
                                                <div className="text-[11px] font-black text-slate-800 uppercase tracking-wide">{prettyDate}</div>
                                                <div className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{totalItems} τεμ.</div>
                                            </div>
                                            <div className="space-y-0.5 mb-2 text-[11px]">
                                                <div className="flex justify-between text-slate-500"><span>Καθαρή:</span><span className="font-mono font-bold">{formatCurrency(net)}</span></div>
                                                <div className="flex justify-between text-slate-500"><span>ΦΠΑ ({(vatRate * 100).toFixed(0)}%):</span><span className="font-mono font-bold">{formatCurrency(vat)}</span></div>
                                                <div className="flex justify-between text-xs font-black text-slate-800 border-t border-slate-100 pt-0.5 mt-0.5"><span>Σύνολο:</span><span>{formatCurrency(total)}</span></div>
                                            </div>
                                            {onPrintAggregated && (
                                                <button
                                                    onClick={() => onPrintAggregated(batches, { orderId: order.id, customerName: order.customer_name })}
                                                    className="w-full py-1.5 bg-slate-50 hover:bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-colors"
                                                >
                                                    <FileText size={12} /> Εκτύπωση Δελτίου
                                                </button>
                                            )}
                                        </div>
                                    );
                                }) : (
                                    <div className="text-center py-3 text-slate-400 italic text-[10px]">Δεν υπάρχουν εκκινήσεις.</div>
                                )}
                            </div>
                        </div>

                        {/* Totals Footer */}
                        <div className="p-3 bg-white border-t border-slate-200">
                            <div className="flex gap-2 w-full mb-3">
                                <button onClick={handleSelectVisible} disabled={isLoadingShipments} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-[10px] font-bold hover:bg-blue-200 transition-colors border border-blue-200 shadow-sm disabled:opacity-50">
                                    <CheckSquare size={12} /> Επιλ. Ορατών
                                </button>
                                <button onClick={handleClearSelection} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-white text-slate-600 rounded-lg text-[10px] font-bold hover:bg-slate-100 transition-colors border border-slate-200 shadow-sm">
                                    <Square size={12} /> Καθαρ.
                                </button>
                            </div>
                            <div className="space-y-1 text-[11px] pt-2 border-t border-slate-100">
                                <div className="flex justify-between text-slate-500"><span>Σύνολο Παραγγελίας:</span><span className="font-bold text-slate-900">{order.items.reduce((s, i) => s + i.quantity, 0)}</span></div>
                                <div className="flex justify-between text-slate-500"><span>Σε Παραγωγή / Έτοιμα:</span><span className="font-bold text-blue-600">{rows.reduce((s, r) => s + r.inProgressQty + r.readyQty, 0)}</span></div>
                                <div className="flex justify-between text-slate-500"><span>Υπόλοιπο:</span><span className="font-bold text-amber-600">{totalRemaining}</span></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ SUB MODALS ═══ */}

            {/* Split */}
            {splitTarget && (
                <div className="fixed inset-0 z-[250] bg-black/60 flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-sm rounded-2xl p-5 shadow-2xl animate-in zoom-in-95 space-y-4">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                            <h3 className="font-black text-base text-slate-800 flex items-center gap-2"><Scissors className="text-blue-500" /> Διαχωρισμός</h3>
                            <button onClick={() => setSplitTarget(null)}><X size={18} className="text-slate-400" /></button>
                        </div>
                        <div className="text-center">
                            <div className="text-xs font-bold text-slate-400 uppercase mb-1">Μετακίνηση Ποσότητας</div>
                            <div className="flex items-center justify-center gap-4">
                                <button onClick={() => setSplitQty(Math.max(1, splitQty - 1))} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center font-bold text-lg text-slate-600 hover:bg-slate-200">-</button>
                                <span className="text-2xl font-black text-slate-900 w-14 text-center">{splitQty}</span>
                                <button onClick={() => setSplitQty(Math.min(splitTarget.maxQty, splitQty + 1))} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center font-bold text-lg text-slate-600 hover:bg-slate-200">+</button>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-1 font-bold">από {splitTarget.maxQty}</div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Σε Στάδιο</label>
                            <select value={splitStage} onChange={(e) => setSplitStage(e.target.value as ProductionStage)}
                                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none text-sm">
                                {STAGES.map(s => {
                                    const dis = (s.id === ProductionStage.Setting && !splitTarget?.batch.requires_setting) || (s.id === ProductionStage.Assembly && !splitTarget?.batch.requires_assembly);
                                    return <option key={s.id} value={s.id} disabled={dis}>{s.label}{dis ? ' (παραλείπεται)' : ''}</option>;
                                })}
                            </select>
                        </div>
                        <button onClick={handleSplit} className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-bold shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2 text-sm">
                            <Split size={16} /> Εκτέλεση
                        </button>
                    </div>
                </div>
            )}

            {/* Note */}
            {editingNoteBatch && (
                <div className="fixed inset-0 z-[270] bg-black/60 flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-sm rounded-2xl p-5 shadow-2xl animate-in zoom-in-95 space-y-4">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                            <h3 className="font-black text-base text-slate-800 flex items-center gap-2"><StickyNote className="text-amber-500" /> Σημείωση</h3>
                            <button onClick={() => setEditingNoteBatch(null)}><X size={18} className="text-slate-400" /></button>
                        </div>
                        <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)}
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 outline-none h-28 resize-none text-sm" placeholder="Σημείωση..." autoFocus />
                        <button onClick={handleSaveNote} className="w-full py-2.5 bg-slate-900 text-white rounded-xl font-bold shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2 text-sm">
                            <Save size={16} /> Αποθήκευση
                        </button>
                    </div>
                </div>
            )}

            {/* Hold */}
            {holdingBatch && (
                <div className="fixed inset-0 z-[260] bg-black/60 flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-md rounded-2xl p-5 shadow-2xl animate-in zoom-in-95 space-y-4 border border-amber-200">
                        <div className="flex justify-between items-center pb-2 border-b border-amber-100">
                            <h3 className="font-black text-base text-amber-800 flex items-center gap-2"><PauseCircle className="text-amber-500" /> Θέση σε Αναμονή</h3>
                            <button onClick={() => { setHoldingBatch(null); setHoldReason(''); }}><X size={18} className="text-slate-400" /></button>
                        </div>
                        <div className="text-xs font-bold text-slate-600 mb-2">Γιατί σταματάει η παραγωγή του {holdingBatch.sku}{holdingBatch.variant_suffix || ''};</div>
                        <textarea value={holdReason} onChange={(e) => setHoldReason(e.target.value)}
                            className="w-full p-3 bg-white border-2 border-amber-100 rounded-xl outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-500/10 h-28 resize-none text-sm font-bold text-slate-800"
                            placeholder="π.χ. Έλλειψη εξαρτήματος..." autoFocus />
                        {(() => {
                            const holdingMoving = holdingBatch ? movingBatchIds.has(holdingBatch.id) : false;
                            return (
                                <button onClick={confirmHold} disabled={holdingMoving || !holdReason.trim()}
                                    className="w-full py-2.5 bg-amber-500 text-white rounded-xl font-bold shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-50 text-sm">
                                    {holdingMoving ? <Loader2 size={16} className="animate-spin" /> : <PauseCircle size={16} />} Σε Αναμονή
                                </button>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* Stage Popup */}
            {activeStagePopup && (() => {
                const isPolishingPopup = activeStagePopup === ProductionStage.Polishing;
                const headerBg = isPolishingPopup
                    ? (polishingPopupTab === 'pending' ? 'bg-teal-500' : 'bg-blue-500')
                    : (VIBRANT_STAGES[activeStagePopup as string] || 'bg-slate-600');
                const subLabel = isPolishingPopup
                    ? (polishingPopupTab === 'pending' ? 'Αναμονή Αποστολής' : 'Στον Τεχνίτη')
                    : null;
                return (
                <div className="fixed inset-0 z-[260] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in" onClick={() => setActiveStagePopup(null)}>
                    <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl animate-in zoom-in-95 overflow-hidden flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
                        {/* Stage popup header */}
                        <div className={`p-4 sm:p-5 flex justify-between items-center ${headerBg} text-white transition-colors`}>
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white/20 rounded-xl"><Factory size={22} className="text-white" /></div>
                                <div>
                                    <h3 className="font-black text-xl uppercase tracking-tight">
                                        {STAGES.find(s => s.id === activeStagePopup)?.label}
                                        {subLabel && <span className="ml-2 text-white/80 text-sm font-bold tracking-normal normal-case">• {subLabel}</span>}
                                    </h3>
                                    <p className="text-white/80 text-xs font-bold uppercase tracking-widest">{popupBatches.reduce((a, b) => a + b.quantity, 0)} τεμάχια</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {onPrintStageBatches && popupBatches.length > 0 && (
                                    <button
                                        onClick={() => {
                                            const stageConf = STAGES.find(s => s.id === activeStagePopup);
                                            const stageName = isPolishingPopup
                                                ? `${stageConf?.label ?? activeStagePopup} • ${subLabel}`
                                                : (stageConf?.label ?? activeStagePopup);
                                            onPrintStageBatches({
                                                stageName, stageId: activeStagePopup,
                                                customerName: order.customer_name, orderId: order.id,
                                                batches: popupBatches, generatedAt: new Date().toISOString(),
                                            });
                                        }}
                                        className="flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all border border-white/30 active:scale-95"
                                    >
                                        <Printer size={15} /><span className="hidden sm:inline">Εκτύπωση</span>
                                    </button>
                                )}
                                <button onClick={() => setActiveStagePopup(null)} className="p-2 rounded-full hover:bg-white/20 transition-colors text-white"><X size={24} /></button>
                            </div>
                        </div>

                        {/* Polishing sub-stage tabs */}
                        {isPolishingPopup && (
                            <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-1">
                                <button
                                    onClick={() => setPolishingPopupTab('pending')}
                                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black transition-all ${
                                        polishingPopupTab === 'pending'
                                            ? 'bg-teal-600 text-white shadow-sm'
                                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                                    }`}
                                >
                                    <Package size={13} />
                                    Αναμονή Αποστολής
                                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${polishingPopupTab === 'pending' ? 'bg-white/25 text-white' : 'bg-teal-100 text-teal-700'}`}>
                                        {polishingSplit.pendingCount}
                                    </span>
                                    {polishingSplit.pendingOnHold > 0 && (
                                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black flex items-center gap-0.5 ${polishingPopupTab === 'pending' ? 'bg-amber-300/40 text-amber-100' : 'bg-amber-100 text-amber-700'}`}>
                                            <PauseCircle size={9} className="fill-current shrink-0" />{polishingSplit.pendingOnHold}
                                        </span>
                                    )}
                                </button>
                                <button
                                    onClick={() => setPolishingPopupTab('dispatched')}
                                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black transition-all ${
                                        polishingPopupTab === 'dispatched'
                                            ? 'bg-blue-600 text-white shadow-sm'
                                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                                    }`}
                                >
                                    <Factory size={13} />
                                    Στον Τεχνίτη
                                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${polishingPopupTab === 'dispatched' ? 'bg-white/25 text-white' : 'bg-blue-100 text-blue-700'}`}>
                                        {polishingSplit.dispatchedCount}
                                    </span>
                                    {polishingSplit.dispatchedOnHold > 0 && (
                                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black flex items-center gap-0.5 ${polishingPopupTab === 'dispatched' ? 'bg-amber-300/40 text-amber-100' : 'bg-amber-100 text-amber-700'}`}>
                                            <PauseCircle size={9} className="fill-current shrink-0" />{polishingSplit.dispatchedOnHold}
                                        </span>
                                    )}
                                </button>
                            </div>
                        )}

                        {/* Stage popup body */}
                        <div ref={popupListParentRef} className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/50">
                            {popupBatches.length > 0 ? (
                                <>
                                    {/* Sticky bulk bar */}
                                    <div className="sticky top-0 z-[5] mx-4 mt-4 mb-2 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl p-2.5 shadow-sm">
                                        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <button onClick={() => selectBatchIds(popupBatches.map(b => b.id))}
                                                    className="px-2.5 py-1 rounded-md text-[11px] font-black bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors">
                                                    Επιλ. όλων
                                                </button>
                                                <button onClick={() => clearBatchSelection(popupBatches.map(b => b.id))}
                                                    className="px-2.5 py-1 rounded-md text-[11px] font-black bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors">
                                                    Καθαρ.
                                                </button>
                                                <span className="text-[11px] font-black text-slate-500">Επιλ: <span className="text-slate-900">{selectedVisiblePopupCount}</span></span>
                                            </div>
                                            <BulkStageActions
                                                disabled={isAnyPopupSelectedMoving || selectedVisiblePopupCount === 0}
                                                onMove={(stage, options) => handleBulkStageMove(stage, popupBatches.filter(b => selectedBatchIds.has(b.id)).map(b => b.id), options)}
                                            />
                                        </div>
                                    </div>

                                    {/* Virtualized popup batch list */}
                                    <div className="px-4 pb-4" style={{ height: `${popupVirtualizer.getTotalSize()}px`, position: 'relative' }}>
                                        {popupVirtualizer.getVirtualItems().map(virtualRow => {
                                            const batch = popupBatches[virtualRow.index];
                                            const product = products.find(p => p.sku === batch.sku);
                                            const isSelected = selectedBatchIds.has(batch.id);
                                            const timeInfo = getBatchTiming(batch);
                                            const isRowMoving = movingBatchIds.has(batch.id);

                                            return (
                                                <div
                                                    key={batch.id}
                                                    data-index={virtualRow.index}
                                                    ref={popupVirtualizer.measureElement}
                                                    style={{
                                                        position: 'absolute', top: 0, left: 0, width: '100%',
                                                        transform: `translateY(${virtualRow.start}px)`,
                                                    }}
                                                >
                                                    <div className="pb-2.5">
                                                        <div className={`bg-white rounded-xl border shadow-sm overflow-hidden relative transition-all ${isRowMoving ? 'border-emerald-300 ring-2 ring-emerald-400/60 ring-offset-1 shadow-lg animate-pulse' : 'border-slate-200'}`}>
                                                            {isRowMoving && (
                                                                <div className="absolute inset-0 z-20 rounded-xl bg-white/55 backdrop-blur-[1.5px] flex items-start justify-center pt-2 pointer-events-auto cursor-wait">
                                                                    <div className="flex items-center gap-1.5 bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-lg ring-2 ring-white">
                                                                        <Loader2 size={11} className="animate-spin" />
                                                                        <span>Μετακινείται…</span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {/* Card Header */}
                                                            <div className="p-2.5 flex gap-2.5 border-b border-slate-50">
                                                                <button type="button" onClick={() => toggleBatchSelection(batch.id)}
                                                                    className={`w-8 h-8 mt-1.5 rounded-lg border flex items-center justify-center transition-colors shrink-0 ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-400 hover:border-blue-300 hover:text-blue-600'}`}>
                                                                    {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                                                                </button>
                                                                <button type="button"
                                                                    className="w-12 h-12 bg-slate-100 rounded-lg overflow-hidden border border-slate-100 shrink-0"
                                                                    onClick={(e) => { e.stopPropagation(); if (product?.image_url) handleZoomImage(product.image_url, batch.sku); }}>
                                                                    {product?.image_url ? (
                                                                        <img src={product.image_url} className="w-full h-full object-cover" alt="" />
                                                                    ) : (
                                                                        <div className="w-full h-full flex items-center justify-center"><ImageIcon size={18} className="text-slate-300" /></div>
                                                                    )}
                                                                </button>
                                                                <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                                    <div className="text-[9px] font-bold text-slate-400 uppercase truncate">{product?.category || 'Προϊόν'}</div>
                                                                    <SkuColorizedText sku={batch.sku} suffix={batch.variant_suffix || ''} gender={product?.gender || Gender.Unisex} className="font-black text-sm" masterClassName="text-slate-900" />
                                                                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                                                                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md border ${getProductionTimingStatusClasses(timeInfo.timingStatus)}`}>
                                                                            <Clock size={10} className="inline mr-0.5" />{timeInfo.timingLabel}
                                                                        </span>
                                                                        {batch.on_hold && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md border bg-amber-50 text-amber-800 border-amber-200"><PauseCircle size={10} className="inline mr-0.5" />Αναμονή</span>}
                                                                        {batch.size_info && <span className="text-[9px] bg-blue-50 text-blue-700 px-1 py-0.5 rounded border border-blue-100 font-bold">#{batch.size_info}</span>}
                                                                        {batch.cord_color && <span className="text-[9px] bg-amber-50 text-amber-700 px-1 py-0.5 rounded border border-amber-100 font-bold">{getProductOptionColorLabel(batch.cord_color)}</span>}
                                                                        {batch.enamel_color && <span className="text-[9px] bg-rose-50 text-rose-700 px-1 py-0.5 rounded border border-rose-100 font-bold">{getProductOptionColorLabel(batch.enamel_color)}</span>}
                                                                    </div>
                                                                </div>
                                                                <div className="flex flex-col items-center justify-center pl-2 border-l border-slate-50">
                                                                    <span className="text-[8px] font-bold text-slate-400 uppercase">Ποσ.</span>
                                                                    <span className="text-lg font-black text-slate-900">{batch.quantity}</span>
                                                                </div>
                                                            </div>

                                                            {/* Stage Movement */}
                                                            <div className="p-2.5 bg-slate-50/50 border-t border-slate-100">
                                                                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                                                                    <RefreshCw size={9} /> Μετακίνηση σε Στάδιο
                                                                </div>
                                                                <StageFlowRail batch={batch} disabled={isWorking || isRowMoving} onMove={(stage, options) => handleStageMove(batch, stage, options)} />
                                                            </div>

                                                            {/* Notes/Hold */}
                                                            {(batch.notes || batch.on_hold) && (
                                                                <div className="px-2.5 pb-2.5 space-y-1">
                                                                    {batch.notes && (
                                                                        <div className="flex items-start gap-1.5 text-[10px] font-medium text-amber-900 bg-amber-50 p-1.5 rounded-lg border border-amber-100 leading-snug">
                                                                            <StickyNote size={10} className="shrink-0 mt-0.5 text-amber-500" /><span>{batch.notes}</span>
                                                                        </div>
                                                                    )}
                                                                    {batch.on_hold && (
                                                                        <div className="flex items-start gap-1.5 text-[10px] font-medium text-amber-900 bg-amber-50 p-1.5 rounded-lg border border-amber-200 leading-snug">
                                                                            <PauseCircle size={10} className="shrink-0 mt-0.5 text-amber-600" /><span>{batch.on_hold_reason || 'Σε αναμονή'}</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}

                                                            {/* Actions */}
                                                            <div className="px-2.5 pb-2.5 flex flex-wrap gap-1">
                                                                <button onClick={() => handleToggleHold(batch)} disabled={isRowMoving}
                                                                    className={`px-2 py-1 rounded-lg border text-[10px] font-black transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed ${batch.on_hold ? 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100' : 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100'}`}>
                                                                    {isRowMoving ? <Loader2 size={11} className="animate-spin" /> : (batch.on_hold ? <PlayCircle size={11} /> : <PauseCircle size={11} />)}
                                                                    {batch.on_hold ? 'Συνέχιση' : 'Αναμονή'}
                                                                </button>
                                                                <button onClick={() => handleViewHistory(batch)} disabled={isRowMoving}
                                                                    className="px-2 py-1 rounded-lg border text-[10px] font-black transition-colors flex items-center gap-1 text-slate-700 bg-white border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed">
                                                                    <History size={11} /> Ιστορικό
                                                                </button>
                                                                <button onClick={() => handleEditNote(batch)} disabled={isRowMoving}
                                                                    className={`px-2 py-1 rounded-lg border text-[10px] font-black transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed ${batch.notes ? 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100' : 'text-slate-600 bg-white border-slate-200 hover:bg-slate-50'}`}>
                                                                    <StickyNote size={11} /> Σημειώσεις
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3 py-16">
                                    <div className="p-5 bg-slate-100 rounded-full"><Package size={40} className="opacity-20" /></div>
                                    <p className="font-bold text-base">Κανένα είδος.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                );
            })()}

            {/* Stock Decision */}
            {stockDecision && (
                <div className="fixed inset-0 z-[500] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setStockDecision(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="px-5 py-4 border-b border-slate-100">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-base font-black text-slate-900">Διαθέσιμο Stock</h3>
                                    <p className="text-[10px] text-slate-500 font-medium mt-0.5">Επιλέξτε πόσα θα ληφθούν από Stock (έτοιμα αμέσως).</p>
                                </div>
                                <button onClick={() => setStockDecision(null)} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"><X size={14} /></button>
                            </div>
                        </div>
                        <div className="px-5 py-3 space-y-2.5 overflow-y-auto max-h-[50vh]">
                            {stockDecision.items.map((item, idx) => {
                                const product = products.find(p => p.sku === item.sku);
                                const hasStock = item.available_in_stock > 0;
                                return (
                                    <div key={idx} className={`rounded-xl border p-3 ${hasStock ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-100 bg-slate-50/50'}`}>
                                        <div className="flex items-center gap-2.5">
                                            {product?.image_url ? <img src={product.image_url} alt="" className="w-9 h-9 rounded-lg object-cover" /> :
                                                <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center"><Package size={14} className="text-slate-400" /></div>}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <SkuColorizedText sku={item.sku} suffix={item.variant_suffix || ''} gender={product?.gender} className="font-black text-sm" masterClassName="text-slate-900" />
                                                    {item.size_info && <span className="text-[10px] text-slate-500 font-bold">#{item.size_info}</span>}
                                                </div>
                                                <div className="text-[10px] text-slate-500 font-medium">
                                                    Ζητ: <span className="font-bold text-slate-700">{item.requested_qty}</span> · Stock: <span className={`font-bold ${hasStock ? 'text-emerald-600' : 'text-slate-400'}`}>{item.available_in_stock}</span>
                                                </div>
                                            </div>
                                        </div>
                                        {hasStock && (
                                            <div className="mt-2 flex items-center gap-2.5">
                                                <span className="text-[10px] font-bold text-emerald-700">Από Stock:</span>
                                                <div className="flex items-center gap-0.5">
                                                    <button onClick={() => { const u = [...stockDecision.items]; u[idx] = { ...u[idx], fromStock: Math.max(0, u[idx].fromStock - 1) }; setStockDecision({ ...stockDecision, items: u }); }}
                                                        className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50"><Minus size={10} /></button>
                                                    <span className="w-7 text-center text-xs font-black text-slate-800">{item.fromStock}</span>
                                                    <button onClick={() => { const u = [...stockDecision.items]; const max = Math.min(u[idx].available_in_stock, u[idx].requested_qty); u[idx] = { ...u[idx], fromStock: Math.min(max, u[idx].fromStock + 1) }; setStockDecision({ ...stockDecision, items: u }); }}
                                                        className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50"><Plus size={10} /></button>
                                                </div>
                                                <span className="text-[10px] text-slate-400 font-medium">→ {item.requested_qty - item.fromStock} Παραγ.</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-2.5">
                            <button onClick={() => { const ns = stockDecision.originalItemsToSend; setStockDecision(null); executeSend(ns); }}
                                className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                                Όλα στην Παραγωγή
                            </button>
                            <button onClick={handleConfirmStockDecision} disabled={isSending}
                                className="flex-1 px-3 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                                {isSending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} Επιβεβαίωση
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Batch History Modal */}
            <BatchHistoryModal
                isOpen={!!historyModalBatch}
                onClose={() => { setHistoryModalBatch(null); setBatchHistory([]); }}
                batch={historyModalBatch}
                history={batchHistory as any}
            />

            {/* Image Zoom */}
            {zoomImageUrl && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[600] bg-black/90 flex items-center justify-center" onClick={() => { setZoomImageUrl(null); setZoomImageAlt(''); }}>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setZoomImageUrl(null); setZoomImageAlt(''); }}
                        className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white transition-colors">
                        <X size={20} />
                    </button>
                    <img src={zoomImageUrl} alt={zoomImageAlt || 'Product'} className="max-w-[95vw] max-h-[95vh] object-contain rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()} />
                </div>,
                document.body
            )}
        </div>
    );
}
