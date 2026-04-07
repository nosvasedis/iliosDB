
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RETAIL_CUSTOMER_ID, RETAIL_CUSTOMER_NAME } from '../../lib/supabase';
import { ProductionBatch, ProductionStage, Product, Material, MaterialType, ProductionType, Order, ProductVariant, AssemblyPrintData, StageBatchPrintData } from '../../types';
import { ChevronDown, ChevronUp, Clock, AlertTriangle, ArrowRight, ArrowLeft, CheckCircle, Factory, MoveRight, Printer, BookOpen, FileText, Hammer, Search, User, StickyNote, Hash, X, PauseCircle, PlayCircle, Check, Tag, Loader2, Save, Image as ImageIcon, Gem, Package, Truck, Layers } from 'lucide-react';
import MobileScreenHeader from './MobileScreenHeader';
import { useUI } from '../UIProvider';
import SkuColorizedText from '../SkuColorizedText';
import MobileBatchBuildModal from './MobileBatchBuildModal';
import BatchHistoryModal from '../BatchHistoryModal';
import { formatOrderId } from '../../utils/orderUtils';
import { formatCurrency, formatDecimal, getVariantComponents } from '../../utils/pricingEngine';
import { requiresAssemblyStage } from '../../constants';
import { getSpecialCreationProductStub, isSpecialCreationSku } from '../../utils/specialCreationSku';
import { extractRetailClientFromNotes } from '../../utils/retailNotes';
import FinderBatchStageSelector from '../production/FinderBatchStageSelector';
import MobileBatchStageMoveSheet from './MobileBatchStageMoveSheet';
import { PRODUCTION_STAGES, getProductionStageLabel } from '../../utils/productionStages';
import { getFinderSearchBadgeTone, getFinderSearchResultSurface } from '../../utils/productionFinderSurfaces';
import {
    buildBatchStageHistoryLookup,
    formatGreekDurationFromMs,
    getProductionTimingInfo,
    getProductionTimingStatusClasses,
    getProductionTimingStatusLabel,
} from '../../utils/productionTiming';
import {
    AssemblyOrderCandidate,
    buildAssemblyOrderCandidates,
    buildStageBatchPrintPayload,
    buildLabelPrintQueue,
    buildMobileProductionFoundBatches,
    buildMobileSettingStoneBreakdown,
    buildMobileSettingStoneOrderGroups,
    buildMobileSettingStoneOrderList,
    getMobileProductionNextStage,
    groupMobilePrintSelectorBatches,
    LabelPrintSortMode,
} from '../../features/production/workflowSelectors';
import { useMaterials } from '../../hooks/api/useMaterials';
import { useMolds } from '../../hooks/api/useMolds';
import { useOrders } from '../../hooks/api/useOrders';
import { useBatchStageHistoryEntries, useProductionBatches } from '../../hooks/api/useProductionBatches';
import { productionRepository } from '../../features/production';
import { getBatchAgeInfo } from '../../features/production/selectors';
import { invalidateProductionBatches } from '../../lib/queryInvalidation';

interface Props {
    allProducts: Product[];
    onPrintAggregated: (batches: ProductionBatch[]) => void;
    onPrintPreparation: (batches: ProductionBatch[]) => void;
    onPrintTechnician: (batches: ProductionBatch[]) => void;
    onPrintAssembly?: (data: AssemblyPrintData) => void;
    onPrintStageBatches?: (data: StageBatchPrintData) => void;
    onPrintLabels?: (items: { product: Product; variant?: ProductVariant; quantity: number, size?: string, format?: 'standard' | 'simple' | 'retail' }[]) => void;
}

const STAGES = PRODUCTION_STAGES.map((stage) => ({
    id: stage.id,
    label: getProductionStageLabel(stage.id),
    color: stage.colorKey
}));

const STAGE_COLORS: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    pink: 'bg-pink-50 text-pink-700 border-pink-200',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

type PrintSelectorType = 'technician' | 'preparation' | 'aggregated' | 'labels' | 'stagePdf';

const MobileBatchCard: React.FC<{ 
    batch: ProductionBatch & { isDelayed?: boolean, customer_name?: string, product_image?: string | null, stageEnteredAt?: string, timingStatus?: 'normal' | 'attention' | 'delayed' | 'critical', timingLabel?: string, reminderKey?: string }, 
    onNext: (b: ProductionBatch) => void, 
    onMoveToStage?: (b: ProductionBatch, stage: ProductionStage, options?: { pendingDispatch?: boolean }) => void,
    onToggleHold: (b: ProductionBatch) => void, 
    onClick: (b: ProductionBatch) => void,
}> = ({ batch, onNext, onMoveToStage, onToggleHold, onClick }) => {
    const isSpecialCreation = isSpecialCreationSku(batch.sku);
    const isDelayed = batch.isDelayed;
    const isReady = batch.current_stage === ProductionStage.Ready;
    const timingStatus = batch.timingStatus || 'normal';
    const timeInfo = {
        label: batch.timingLabel || formatGreekDurationFromMs(Date.now() - new Date(batch.stageEnteredAt || batch.created_at).getTime()),
        colorClass: getProductionTimingStatusClasses(timingStatus),
    };
    const [stageSheetOpen, setStageSheetOpen] = useState(false);
    const lastStageSheetCloseAt = useRef(0);
    const closeStageSheet = useCallback(() => {
        lastStageSheetCloseAt.current = typeof performance !== 'undefined' ? performance.now() : Date.now();
        setStageSheetOpen(false);
    }, []);
    const openStageSheet = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (now - lastStageSheetCloseAt.current < 450) return;
        setStageSheetOpen(true);
    }, []);

    const outerSurface = batch.on_hold
        ? 'border-amber-400 bg-amber-50/30'
        : isDelayed
            ? 'border-red-300 ring-1 ring-red-50 bg-white'
            : isSpecialCreation
                ? 'bg-violet-50/40 border-violet-200 ring-1 ring-violet-100/80 hover:border-violet-400'
                : 'bg-white border-slate-200 hover:border-slate-300';

    return (
        <>
        <div
            onClick={() => onClick(batch)}
            className={`p-3 rounded-2xl border shadow-sm relative transition-transform active:scale-[0.98] cursor-pointer touch-manipulation ${outerSurface}`}
        >
            <div className="flex justify-between items-start gap-3 mb-2">
                <div className="w-11 h-11 shrink-0 rounded-xl overflow-hidden border border-slate-100 bg-slate-50 flex items-center justify-center">
                    {(batch as any).product_image ? (
                        <img src={(batch as any).product_image} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <ImageIcon size={20} className="text-slate-300" />
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    <SkuColorizedText sku={batch.sku} suffix={batch.variant_suffix || ''} gender={batch.product_details?.gender} className="font-black text-lg tracking-tight" masterClassName={isSpecialCreation ? 'text-violet-900' : 'text-slate-800'} />
                    {batch.size_info && <div className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-bold inline-block mt-1">{batch.size_info}</div>}
                    {batch.customer_name && <div className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-tight">{batch.customer_name}</div>}
                </div>
                <div className="flex flex-col items-end gap-1">
                    <div className="text-xl font-black text-slate-900 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-100 shadow-sm">
                        {batch.quantity}
                    </div>
                    {batch.on_hold && (
                        <span className="bg-amber-100 text-amber-700 border border-amber-200 text-[10px] font-black px-1.5 py-0.5 rounded flex items-center gap-1 animate-pulse">
                            <PauseCircle size={8} className="fill-current" /> ΑΝΑΜΟΝΗ
                        </span>
                    )}
                </div>
            </div>

            {batch.on_hold && batch.on_hold_reason && (
                <div className="mb-3 bg-amber-100 border border-amber-200 rounded-lg p-2.5 flex gap-2">
                    <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                    <span className="text-xs text-amber-800 font-bold leading-snug">{batch.on_hold_reason}</span>
                </div>
            )}

            {batch.notes && !batch.on_hold && (
                <div className="mb-3 bg-amber-50 border border-amber-100 rounded-lg p-2.5 flex gap-2">
                    <StickyNote size={14} className="text-amber-500 shrink-0 mt-0.5" />
                    <span className="text-xs text-amber-800 italic font-medium leading-snug">"{batch.notes}"</span>
                </div>
            )}

            <div className="mt-3 pt-2.5 border-t border-slate-50 space-y-2">
                <div className="flex flex-wrap gap-2 items-center">
                    <div className={`text-[10px] font-black px-2 py-1 rounded-full flex items-center gap-1 border ${timeInfo.colorClass}`}>
                        <Clock size={10} />
                        <span>{timeInfo.label}</span>
                    </div>
                    {!batch.on_hold && timingStatus !== 'normal' && (
                        <div className={`text-[10px] font-bold px-2 py-1 rounded-full border flex items-center gap-1 ${getProductionTimingStatusClasses(timingStatus)}`}>
                            <AlertTriangle size={10} /> {getProductionTimingStatusLabel(timingStatus)}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-end gap-1.5 flex-wrap" onClick={e => e.stopPropagation()}>
                    <button
                        type="button"
                        onClick={() => onToggleHold(batch)}
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all shadow-sm active:scale-95 border ${
                            batch.on_hold
                                ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                : 'bg-amber-100 text-amber-700 border-amber-200'
                        }`}
                    >
                        {batch.on_hold ? <PlayCircle size={12} className="fill-current" /> : <PauseCircle size={12} />}
                        {batch.on_hold ? 'Συνέχεια' : 'Αναμονή'}
                    </button>

                    {batch.current_stage === ProductionStage.Polishing && !batch.on_hold && onMoveToStage && (
                        <>
                            {batch.pending_dispatch && (
                                <button
                                    type="button"
                                    onClick={() => onMoveToStage(batch, ProductionStage.Polishing, { pendingDispatch: false })}
                                    className="flex items-center gap-1 bg-teal-100 active:bg-teal-200 text-teal-700 p-1.5 rounded-lg text-[10px] font-bold border border-teal-200 transition-all shadow-sm active:scale-95"
                                    title="Αποστολή στον Τεχνίτη"
                                >
                                    <Truck size={12} />
                                </button>
                            )}
                            {!batch.pending_dispatch && (
                                <button
                                    type="button"
                                    onClick={() => onMoveToStage(batch, ProductionStage.Polishing, { pendingDispatch: true })}
                                    className="flex items-center gap-1 bg-blue-100 active:bg-blue-200 text-blue-700 p-1.5 rounded-lg text-[10px] font-bold border border-blue-200 transition-all shadow-sm active:scale-95"
                                    title="Επιστροφή σε Αναμονή Αποστολής"
                                >
                                    <Package size={12} />
                                </button>
                            )}
                        </>
                    )}

                    {!isReady && !batch.on_hold && (
                        <button
                            type="button"
                            onClick={(e) => {
                                if (onMoveToStage) {
                                    openStageSheet(e);
                                } else {
                                    onNext(batch);
                                }
                            }}
                            className="flex items-center gap-1 bg-slate-100 active:bg-slate-200 text-slate-600 px-2 py-1 rounded-lg text-[10px] font-bold transition-all shadow-sm active:scale-95"
                        >
                            <MoveRight size={11} />
                            Στάδιο
                            {onMoveToStage ? <ChevronDown size={11} /> : null}
                        </button>
                    )}
                </div>
            </div>
        </div>
        {!isReady && !batch.on_hold && onMoveToStage ? (
            <MobileBatchStageMoveSheet
                isOpen={stageSheetOpen}
                onClose={closeStageSheet}
                batch={batch}
                onMove={(targetStage, options) => onMoveToStage(batch, targetStage, options)}
            />
        ) : null}
        </>
    );
};

const PrintSelectorModal = ({ isOpen, onClose, onConfirm, batches, title, subtitle, labelSortMode, onLabelSortModeChange }: {
    isOpen: boolean,
    onClose: () => void,
    onConfirm: (selected: ProductionBatch[]) => void,
    batches: (ProductionBatch & { customer_name?: string })[],
    title: string,
    subtitle?: string,
    labelSortMode?: LabelPrintSortMode,
    onLabelSortModeChange?: (mode: LabelPrintSortMode) => void
}) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(batches.map(b => b.id)));
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        setSearchTerm('');
        setSelectedIds(new Set(batches.map(b => b.id)));
    }, [isOpen, batches]);

    const groupedBatches = useMemo(() => groupMobilePrintSelectorBatches(batches, searchTerm), [batches, searchTerm]);

    const visibleBatchIds = useMemo(
        () => groupedBatches.flatMap(([, group]) => group.items.map((b) => b.id)),
        [groupedBatches]
    );

    const allVisibleSelected =
        visibleBatchIds.length > 0 && visibleBatchIds.every((id) => selectedIds.has(id));

    const toggleBatch = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const toggleGroup = (batchIds: string[]) => {
        const allSelected = batchIds.every(id => selectedIds.has(id));
        const next = new Set(selectedIds);
        if (allSelected) {
            batchIds.forEach(id => next.delete(id));
        } else {
            batchIds.forEach(id => next.add(id));
        }
        setSelectedIds(next);
    };

    const toggleAllVisibleInView = () => {
        if (visibleBatchIds.length === 0) return;
        if (allVisibleSelected) {
            const next = new Set(selectedIds);
            visibleBatchIds.forEach((id) => next.delete(id));
            setSelectedIds(next);
        } else {
            const next = new Set(selectedIds);
            visibleBatchIds.forEach((id) => next.add(id));
            setSelectedIds(next);
        }
    };

    const handleConfirm = () => {
        const selected = batches.filter(b => selectedIds.has(b.id));
        onConfirm(selected);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[210] bg-slate-900/60 backdrop-blur-sm flex flex-col justify-end animate-in fade-in" onClick={onClose}>
            <div
                className="bg-white rounded-t-[2rem] px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom-full duration-300 max-h-[88vh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-4 flex shrink-0 items-start justify-between gap-4">
                    <div className="min-w-0 pr-2">
                        <h3 className="text-lg font-black text-slate-900">{title}</h3>
                        {subtitle ? (
                            <p className="mt-1 text-xs font-medium text-slate-500">{subtitle}</p>
                        ) : null}
                    </div>
                    <button type="button" onClick={onClose} className="shrink-0 rounded-full bg-slate-100 p-2 text-slate-500">
                        <X size={18} />
                    </button>
                </div>

                <div className="mb-4 flex shrink-0 gap-2">
                    <div className="relative flex-1">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Αναζήτηση πελάτη, SKU, εντολής..."
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm font-medium outline-none focus:border-pink-300 focus:ring-2 focus:ring-pink-500/20"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={toggleAllVisibleInView}
                        disabled={visibleBatchIds.length === 0}
                        className="shrink-0 rounded-xl bg-slate-100 px-2.5 py-2 text-center text-[10px] font-black leading-snug text-slate-700 disabled:opacity-40 max-w-[6.25rem]"
                    >
                        {allVisibleSelected ? 'Καμία επιλογή' : 'Όλοι οι πελάτες'}
                    </button>
                </div>

                {labelSortMode && onLabelSortModeChange && (
                    <div className="mb-4 grid shrink-0 grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={() => onLabelSortModeChange('as_sent')}
                            className={`rounded-2xl py-2.5 text-[11px] font-black transition-all ${labelSortMode === 'as_sent' ? 'border-2 border-pink-300 bg-pink-50 text-pink-800' : 'border-2 border-slate-200 bg-white text-slate-600'}`}
                        >
                            Όπως στάλθηκαν
                        </button>
                        <button
                            type="button"
                            onClick={() => onLabelSortModeChange('customer')}
                            className={`rounded-2xl py-2.5 text-[11px] font-black transition-all ${labelSortMode === 'customer' ? 'border-2 border-pink-300 bg-pink-50 text-pink-800' : 'border-2 border-slate-200 bg-white text-slate-600'}`}
                        >
                            Ανά πελάτη
                        </button>
                    </div>
                )}

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pb-1">
                    {groupedBatches.map(([key, group]) => {
                        const allSelected = group.items.every(b => selectedIds.has(b.id));
                        const someSelected = group.items.some(b => selectedIds.has(b.id));

                        return (
                            <div
                                key={key}
                                className={`rounded-2xl border-2 transition-all ${allSelected ? 'border-pink-300 bg-pink-50' : someSelected ? 'border-pink-200 bg-pink-50/40' : 'border-slate-200 bg-white'}`}
                            >
                                <button
                                    type="button"
                                    onClick={() => toggleGroup(group.items.map(b => b.id))}
                                    className="flex w-full items-start gap-3 border-b border-slate-100/80 px-4 py-3 text-left active:bg-white/60"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="font-black text-slate-900">{group.name}</div>
                                        <div className="mt-1 flex flex-wrap gap-2 text-[10px] font-black uppercase">
                                            <span className="rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-slate-700">
                                                {group.items.length} {group.items.length === 1 ? 'είδος' : 'είδη'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${allSelected ? 'border-pink-600 bg-pink-600 text-white' : someSelected ? 'border-pink-400 bg-pink-200' : 'border-slate-300 bg-white text-transparent'}`}>
                                        {someSelected && !allSelected ? <div className="h-2 w-2 rounded-sm bg-pink-700" /> : <Check size={13} />}
                                    </div>
                                </button>
                                <div className="space-y-1 px-2 py-2">
                                    {group.items.map(item => {
                                        const on = selectedIds.has(item.id);
                                        return (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => toggleBatch(item.id)}
                                                className={`flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors ${on ? 'bg-pink-100/60' : 'active:bg-slate-50'}`}
                                            >
                                                <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${on ? 'border-pink-600 bg-pink-600 text-white' : 'border-slate-300 bg-white text-transparent'}`}>
                                                    <Check size={13} />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="font-mono text-sm font-black text-slate-800">{item.sku}{item.variant_suffix}</span>
                                                        {item.size_info ? (
                                                            <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-black text-slate-500">{item.size_info}</span>
                                                        ) : null}
                                                    </div>
                                                    <div className="mt-1.5 inline-flex rounded-lg border border-pink-200 bg-pink-100 px-2 py-0.5 text-[10px] font-black text-pink-800">
                                                        {item.quantity} τμχ
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                    {groupedBatches.length === 0 && (
                        <div className="py-10 text-center text-sm italic text-slate-400">Δεν βρέθηκαν παρτίδες.</div>
                    )}
                </div>

                <div className="mt-5 flex shrink-0 gap-2 border-t border-slate-100 pt-4">
                    <button type="button" onClick={onClose} className="flex-1 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700">
                        Άκυρο
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={selectedIds.size === 0}
                        className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-pink-600 px-4 py-3 text-sm font-black text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Printer size={17} />
                        Εκτύπωση ({selectedIds.size})
                    </button>
                </div>
            </div>
        </div>
    );
};

const AssemblyOrderSelectorSheet = ({
    isOpen,
    onClose,
    candidates,
    onConfirm
}: {
    isOpen: boolean;
    onClose: () => void;
    candidates: AssemblyOrderCandidate[];
    onConfirm: (selectedOrderIds: string[]) => void;
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set(candidates.map((candidate) => candidate.order.id)));

    useEffect(() => {
        if (!isOpen) return;
        setSearchTerm('');
        setSelectedOrderIds(new Set(candidates.map((candidate) => candidate.order.id)));
    }, [isOpen, candidates]);

    const filteredCandidates = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return candidates;
        return candidates.filter((candidate) =>
            candidate.order.customer_name.toLowerCase().includes(term) ||
            candidate.order.id.toLowerCase().includes(term)
        );
    }, [candidates, searchTerm]);

    const visibleOrderIds = useMemo(
        () => filteredCandidates.map((c) => c.order.id),
        [filteredCandidates]
    );

    const allVisibleOrdersSelected =
        visibleOrderIds.length > 0 && visibleOrderIds.every((id) => selectedOrderIds.has(id));

    const toggleAllVisibleOrders = () => {
        if (visibleOrderIds.length === 0) return;
        if (allVisibleOrdersSelected) {
            setSelectedOrderIds((prev) => {
                const next = new Set(prev);
                visibleOrderIds.forEach((id) => next.delete(id));
                return next;
            });
        } else {
            setSelectedOrderIds((prev) => {
                const next = new Set(prev);
                visibleOrderIds.forEach((id) => next.add(id));
                return next;
            });
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[210] bg-slate-900/60 backdrop-blur-sm flex flex-col justify-end" onClick={onClose}>
            <div
                className="bg-white rounded-t-[2rem] px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom-full duration-300 max-h-[88vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-black text-slate-900">Εκτύπωση Συναρμολόγησης</h3>
                        <p className="mt-1 text-xs font-medium text-slate-500">Επιλέξτε εντολές που έχουν εκκρεμή είδη για συναρμολόγηση.</p>
                    </div>
                    <button onClick={onClose} className="rounded-full bg-slate-100 p-2 text-slate-500">
                        <X size={18} />
                    </button>
                </div>

                <div className="mb-4 flex gap-2">
                    <div className="relative flex-1">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Αναζήτηση πελάτη ή εντολής..."
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm font-medium outline-none focus:border-pink-300 focus:ring-2 focus:ring-pink-500/20"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={toggleAllVisibleOrders}
                        disabled={visibleOrderIds.length === 0}
                        className="shrink-0 rounded-xl bg-slate-100 px-2.5 py-2 text-center text-[10px] font-black leading-snug text-slate-700 disabled:opacity-40 max-w-[6.25rem]"
                    >
                        {allVisibleOrdersSelected ? 'Καμία επιλογή' : 'Όλοι οι πελάτες'}
                    </button>
                </div>

                <div className="space-y-3">
                    {filteredCandidates.map((candidate) => {
                        const selected = selectedOrderIds.has(candidate.order.id);
                        return (
                            <button
                                key={candidate.order.id}
                                onClick={() => {
                                    setSelectedOrderIds((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(candidate.order.id)) next.delete(candidate.order.id);
                                        else next.add(candidate.order.id);
                                        return next;
                                    });
                                }}
                                className={`w-full rounded-2xl border-2 px-4 py-4 text-left transition-all ${selected ? 'border-pink-300 bg-pink-50' : 'border-slate-200 bg-white'}`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="font-black text-slate-900">{candidate.order.customer_name}</div>
                                        <div className="mt-1 text-xs font-mono text-slate-500">#{formatOrderId(candidate.order.id)}</div>
                                        <div className="mt-2 flex gap-2 text-[10px] font-black uppercase">
                                            <span className="rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-slate-700">
                                                Κωδικοί: {candidate.assemblySkuCount}
                                            </span>
                                            <span className="rounded-lg border border-pink-200 bg-pink-100 px-2 py-1 text-pink-700">
                                                Τεμάχια: {candidate.totalAssemblyQty}
                                            </span>
                                        </div>
                                    </div>
                                    <div className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded border ${selected ? 'border-pink-600 bg-pink-600 text-white' : 'border-slate-300 bg-white text-transparent'}`}>
                                        <Check size={13} />
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                    {filteredCandidates.length === 0 && (
                        <div className="py-10 text-center text-sm italic text-slate-400">Δεν βρέθηκαν επιλέξιμες εντολές.</div>
                    )}
                </div>

                <div className="mt-5 flex gap-2">
                    <button onClick={onClose} className="flex-1 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700">
                        Άκυρο
                    </button>
                    <button
                        onClick={() => {
                            onConfirm(Array.from(selectedOrderIds));
                            onClose();
                        }}
                        disabled={selectedOrderIds.size === 0}
                        className="flex-1 rounded-2xl bg-pink-600 px-4 py-3 text-sm font-black text-white shadow-lg disabled:opacity-50"
                    >
                        Εκτύπωση ({selectedOrderIds.size})
                    </button>
                </div>
            </div>
        </div>
    );
};

const MobileHoldModal = ({ batch, onClose, onConfirm }: { batch: ProductionBatch, onClose: () => void, onConfirm: (reason: string) => void }) => {
    const [reason, setReason] = useState('');
    return (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex flex-col justify-end">
            <div className="bg-white rounded-t-3xl p-6 animate-in slide-in-from-bottom-full duration-300">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-black text-lg text-amber-800 flex items-center gap-2"><PauseCircle /> Θέση σε Αναμονή</h3>
                    <button onClick={onClose}><X size={24} className="text-slate-400" /></button>
                </div>
                <p className="text-sm font-bold text-slate-600 mb-2">Αιτιολογία για {batch.sku}:</p>
                <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    className="w-full p-4 border-2 border-amber-200 rounded-xl bg-amber-50/50 outline-none text-slate-800 font-bold h-32 mb-4 focus:bg-white focus:border-amber-400"
                    placeholder="π.χ. Έλλειψη, Σπάσιμο..."
                    autoFocus
                />
                <button
                    onClick={() => onConfirm(reason)}
                    disabled={!reason.trim()}
                    className="w-full bg-amber-500 text-white py-4 rounded-xl font-black text-lg shadow-lg disabled:opacity-50"
                >
                    Επιβεβαίωση
                </button>
            </div>
        </div>
    );
};

const EditBatchNoteModal = ({ batch, onClose, onSave, isProcessing }: { batch: ProductionBatch, onClose: () => void, onSave: (notes: string) => void, isProcessing: boolean }) => {
    const [note, setNote] = useState(batch.notes || '');

    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-amber-50/50">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <StickyNote size={18} className="text-amber-500" /> Σημειώσεις Παρτίδας
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X size={20} /></button>
                </div>
                <div className="p-6">
                    <div className="mb-4 text-xs text-slate-500">
                        Προσθέστε οδηγίες ή παρατηρήσεις για την παρτίδα <strong>{batch.sku}</strong>.
                    </div>
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500/20 h-32 resize-none text-sm font-medium"
                        placeholder="Γράψτε εδώ..."
                        autoFocus
                    />
                </div>
                <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
                    <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-slate-500 font-bold hover:bg-slate-200 transition-colors">Άκυρο</button>
                    <button
                        onClick={() => onSave(note)}
                        disabled={isProcessing}
                        className="px-6 py-2.5 rounded-xl bg-slate-900 text-white font-bold hover:bg-black transition-colors flex items-center gap-2 shadow-lg"
                    >
                        {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Αποθήκευση
                    </button>
                </div>
            </div>
        </div>
    );
};

const SplitBatchModal = ({ state, onClose, onConfirm, isProcessing }: { state: { batch: ProductionBatch, targetStage: ProductionStage }, onClose: () => void, onConfirm: (qty: number, targetStage: ProductionStage) => void, isProcessing: boolean }) => {
    const { batch, targetStage } = state;
    const [quantity, setQuantity] = useState(batch.quantity);
    const [selectedTarget, setSelectedTarget] = useState<ProductionStage>(targetStage);

    const handleConfirmClick = () => {
        if (quantity > 0 && quantity <= batch.quantity) {
            onConfirm(quantity, selectedTarget);
        }
    };

    return (
        <div className="fixed inset-0 z-[250] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h2 className="text-xl font-black text-slate-800">Μετακίνηση Παρτίδας</h2>
                        <p className="text-sm text-slate-500 font-mono font-bold tracking-wider">{batch.sku}{batch.variant_suffix}</p>
                    </div>
                    <button onClick={onClose} disabled={isProcessing} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={24} /></button>
                </div>
                <div className="p-8 space-y-6">
                    <div className="flex flex-col gap-4">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Σταδιο Προορισμου</label>
                        <select
                            value={selectedTarget}
                            onChange={(e) => setSelectedTarget(e.target.value as ProductionStage)}
                            className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-800 outline-none focus:border-emerald-500 transition-all appearance-none"
                        >
                            {STAGES.map(s => {
                                // Check if stage is disabled for this batch
                                const isStageDisabled = 
                                    (s.id === ProductionStage.Setting && !batch.requires_setting) ||
                                    (s.id === ProductionStage.Assembly && !batch.requires_assembly);
                                
                                return (
                                    <option 
                                        key={s.id} 
                                        value={s.id} 
                                        disabled={s.id === batch.current_stage || isStageDisabled}
                                    >
                                        {s.label}{isStageDisabled ? ' (παραλείπεται)' : ''}
                                    </option>
                                );
                            })}
                        </select>
                    </div>

                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 text-center">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1">Ποσοτητα προς Μετακινηση</label>
                        <div className="flex items-center justify-center gap-4">
                            <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-12 h-12 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 font-black text-xl">-</button>
                            <input
                                type="number"
                                value={quantity}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    if (isNaN(val)) setQuantity(1);
                                    else if (val > batch.quantity) setQuantity(batch.quantity);
                                    else if (val < 1) setQuantity(1);
                                    else setQuantity(val);
                                }}
                                className="w-24 p-3 text-center font-black text-3xl bg-transparent outline-none text-slate-800"
                                autoFocus
                            />
                            <button onClick={() => setQuantity(Math.min(batch.quantity, quantity + 1))} className="w-12 h-12 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 font-black text-xl">+</button>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 font-bold">Διαθέσιμα: {batch.quantity}</p>
                    </div>
                </div>
                <div className="p-6 bg-white border-t border-slate-50 flex gap-3">
                    <button onClick={onClose} disabled={isProcessing} className="flex-1 py-4 rounded-2xl font-black text-slate-500 bg-slate-50 hover:bg-slate-100 transition-colors">
                        ΑΚΥΡΟ
                    </button>
                    <button onClick={handleConfirmClick} disabled={isProcessing} className="flex-[2] py-4 rounded-2xl bg-emerald-600 text-white font-black hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-200">
                        {isProcessing ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle size={20} />}
                        ΕΠΙΒΕΒΑΙΩΣΗ
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── SettingStoneModal ────────────────────────────────────────────────────────
const SettingStoneModal: React.FC<{
    batches: Array<ProductionBatch & { requires_setting?: boolean; requires_assembly?: boolean; product_details?: Product; product_image?: string | null; customer_name?: string; isDelayed?: boolean }>;
    orders: Order[];
    allProducts: Product[];
    allMaterials: Material[];
    onClose: () => void;
}> = ({ batches, orders, allProducts, allMaterials, onClose }) => {
    const settingBatches = batches.filter(b => b.current_stage === ProductionStage.Setting);

    const orderGroups = useMemo(() => buildMobileSettingStoneOrderGroups(settingBatches), [settingBatches]);

    const [selectedOrderKey, setSelectedOrderKey] = useState<string | null>(
        () => orderGroups.size === 1 ? Array.from(orderGroups.keys())[0] : null
    );

    const orderList = useMemo(() => buildMobileSettingStoneOrderList(orderGroups, orders), [orderGroups, orders]);

    const stones = useMemo(() => buildMobileSettingStoneBreakdown(orderGroups, selectedOrderKey, allProducts, allMaterials), [selectedOrderKey, orderGroups, allProducts, allMaterials]);

    const selectedBatches = selectedOrderKey ? (orderGroups.get(selectedOrderKey) || []) : [];
    const selectedOrderInfo = orderList.find(o => o.key === selectedOrderKey);

    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-end justify-center animate-in fade-in" onClick={onClose}>
            <div
                className="bg-white w-full max-w-lg rounded-t-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-full duration-300"
                style={{ maxHeight: '85vh' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex-shrink-0 p-5 border-b border-slate-100 bg-purple-50/60">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            {selectedOrderKey ? (
                                <button
                                    onClick={() => setSelectedOrderKey(null)}
                                    className="p-1.5 bg-purple-100 text-purple-700 rounded-xl hover:bg-purple-200 transition-colors active:scale-90"
                                >
                                    <ArrowLeft size={16} />
                                </button>
                            ) : (
                                <div className="p-2 bg-purple-100 rounded-xl">
                                    <Gem size={18} className="text-purple-700" />
                                </div>
                            )}
                            <div>
                                <h3 className="font-black text-slate-900 text-base">Πέτρες Καρφωτή</h3>
                                <p className="text-[10px] text-slate-500 font-medium">
                                    {selectedOrderInfo
                                        ? selectedOrderInfo.customerName
                                        : `${settingBatches.length} παρτίδες σε εξέλιξη`}
                                </p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-400">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {!selectedOrderKey ? (
                        /* ── Order selection ── */
                        <div className="p-4 space-y-2.5">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Επιλέξτε Παραγγελία</p>
                            {orderList.map(order => (
                                <button
                                    key={order.key}
                                    onClick={() => setSelectedOrderKey(order.key)}
                                    className="w-full bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between hover:border-purple-300 hover:bg-purple-50/30 transition-all active:scale-[0.98] shadow-sm"
                                >
                                    <div className="text-left">
                                        <div className="font-black text-slate-800 text-sm">{order.customerName}</div>
                                        {order.orderId && (
                                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">#{formatOrderId(order.orderId)}</div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-black bg-purple-50 text-purple-700 border border-purple-100 px-2 py-1 rounded-lg">
                                            {order.batchCount} παρτ.
                                        </span>
                                        <ArrowRight size={16} className="text-slate-400" />
                                    </div>
                                </button>
                            ))}
                            {orderList.length === 0 && (
                                <div className="text-center py-12 text-slate-400 text-sm italic">
                                    Κανένα στάδιο Καρφωτή αυτή τη στιγμή.
                                </div>
                            )}
                        </div>
                    ) : (
                        /* ── Stones breakdown for selected order ── */
                        <div className="p-4 space-y-5">
                            {/* Batches */}
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Παρτίδες</p>
                                <div className="space-y-2">
                                    {selectedBatches.map(b => (
                                        <div key={b.id} className="bg-slate-50 rounded-xl px-3 py-2.5 flex items-center justify-between border border-slate-100">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <SkuColorizedText sku={b.sku} suffix={b.variant_suffix || ''} gender={(b as any).product_details?.gender} className="font-black text-lg tracking-tight" masterClassName="text-slate-800" />
                                                {b.size_info && (
                                                    <span className="text-[9px] bg-slate-200 px-1.5 rounded-md font-bold text-slate-600 shrink-0">{b.size_info}</span>
                                                )}
                                            </div>
                                            <span className="text-sm font-black text-slate-700 bg-white border border-slate-100 px-2.5 py-0.5 rounded-xl shadow-sm shrink-0">
                                                {b.quantity} τμχ
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Stones */}
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Απαιτούμενες Πέτρες</p>
                                {stones.length > 0 ? (
                                    <div className="space-y-2">
                                        {stones.map((stone, i) => (
                                            <div key={i} className="bg-white border border-purple-100 rounded-2xl p-4 flex items-center justify-between shadow-sm ring-1 ring-purple-50">
                                                <div className="flex-1 min-w-0 pr-3">
                                                    <div className="font-black text-slate-800 text-sm leading-tight">{stone.name}</div>
                                                    {stone.description && (
                                                        <div className="text-[11px] text-slate-500 font-medium mt-0.5">{stone.description}</div>
                                                    )}
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <div className="text-3xl font-black text-purple-700 leading-none">{stone.quantity}</div>
                                                    <div className="text-[10px] text-slate-400 font-bold mt-0.5">{stone.unit}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 text-amber-700 text-sm font-bold text-center">
                                        Δεν βρέθηκαν πέτρες στη Λίστα Υλικών για αυτή την παραγγελία.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default function MobileProduction({ allProducts, onPrintAggregated, onPrintPreparation, onPrintTechnician, onPrintAssembly, onPrintStageBatches, onPrintLabels }: Props) {
    const { data: batches, isLoading: loadingBatches } = useProductionBatches();
    const { data: batchStageHistoryEntries = [] } = useBatchStageHistoryEntries();
    const { data: materials, isLoading: loadingMaterials } = useMaterials();
    const { data: molds, isLoading: loadingMolds } = useMolds();
    const { data: orders } = useOrders();

    const queryClient = useQueryClient();
    const { showToast } = useUI();
    const [timingNow, setTimingNow] = useState(() => Date.now());

    const [openStage, setOpenStage] = useState<string | null>(null);
    const [polishingTab, setPolishingTab] = useState<'pending' | 'dispatched'>('pending');
    const [viewBuildBatch, setViewBuildBatch] = useState<ProductionBatch | null>(null);
    const [finderTerm, setFinderTerm] = useState('');
    const deferredFinderTerm = React.useDeferredValue(finderTerm);
    const [holdBatch, setHoldBatch] = useState<ProductionBatch | null>(null);
    const [showSettingStones, setShowSettingStones] = useState(false);
    const [assemblySelectorOpen, setAssemblySelectorOpen] = useState(false);

    // Note Saving Handler
    const [editingNoteBatch, setEditingNoteBatch] = useState<ProductionBatch | null>(null);
    const [isSavingNote, setIsSavingNote] = useState(false);

    // Batch History Modal State
    const [historyModalBatch, setHistoryModalBatch] = useState<ProductionBatch | null>(null);
    const [batchHistory, setBatchHistory] = useState<any[]>([]);
    const [, setIsLoadingHistory] = useState(false);

    // Split/Move State
    const [splitModalState, setSplitModalState] = useState<{ batch: ProductionBatch, targetStage: ProductionStage, pendingDispatch?: boolean } | null>(null);
    const [isProcessingSplit, setIsProcessingSplit] = useState(false);

    // Print Modal State
    const [printSelectorState, setPrintSelectorState] = useState<{
        isOpen: boolean,
        type: PrintSelectorType | '',
        batches: (ProductionBatch & { customer_name?: string })[],
        stageMeta?: { stageId: ProductionStage; stageName: string }
    }>({ isOpen: false, type: '', batches: [] });
    const [labelPrintSortMode, setLabelPrintSortMode] = useState<LabelPrintSortMode>('as_sent');
    const batchHistoryLookup = useMemo(() => buildBatchStageHistoryLookup(batchStageHistoryEntries), [batchStageHistoryEntries]);
    const productsMap = useMemo(() => new Map(allProducts.map((product) => [product.sku, product])), [allProducts]);

    useEffect(() => {
        const intervalId = window.setInterval(() => setTimingNow(Date.now()), 60_000);
        return () => window.clearInterval(intervalId);
    }, []);

    const enrichedBatches = useMemo(() => {
        if (!batches || !allProducts || !materials || !orders) return [];
        const ZIRCON_CODES = ['LE', 'PR', 'AK', 'MP', 'KO', 'MV', 'RZ'];
        const NON_ZIRCON_STONE_CODES = ['TKO', 'TPR', 'TMP'];

        return batches.map(b => {
            const prod = isSpecialCreationSku(b.sku) ? getSpecialCreationProductStub() : allProducts.find(p => p.sku === b.sku);
            const suffix = b.variant_suffix || '';
            const stone = getVariantComponents(suffix, prod?.gender).stone;
            const hasZirconsFromSuffix = stone?.code && ZIRCON_CODES.includes(stone.code) && !NON_ZIRCON_STONE_CODES.includes(stone.code);
            const hasZirconsFromRecipe =
                !!prod?.recipe?.some((r) => {
                    if (r.type !== 'raw') return false;
                    const material = materials.find((m) => m.id === r.id);
                    return material?.type === MaterialType.Stone && ZIRCON_CODES.some((code) => material.name.includes(code));
                });
            const hasZircons = hasZirconsFromSuffix || hasZirconsFromRecipe;

            const order = orders.find(o => o.id === b.order_id);
            const timingInfo = getProductionTimingInfo(b, batchHistoryLookup.get(b.id), timingNow);

            // Check if assembly stage is required based on SKU
            const requires_assembly = isSpecialCreationSku(b.sku) ? false : requiresAssemblyStage(b.sku);

            return {
                ...b,
                requires_setting: hasZircons,
                requires_assembly,
                product_details: prod,
                product_image: prod?.image_url ?? null,
                customer_name: (() => {
                    const isRetailOrder =
                        order?.customer_id === RETAIL_CUSTOMER_ID ||
                        order?.customer_name === RETAIL_CUSTOMER_NAME;

                    const { retailClientLabel } = extractRetailClientFromNotes(order?.notes);
                    if (isRetailOrder && retailClientLabel) {
                        return `${RETAIL_CUSTOMER_NAME} • ${retailClientLabel}`;
                    }

                    return order?.customer_name || '';
                })(),
                diffHours: timingInfo.timeInStageHours,
                isDelayed: timingInfo.isDelayed,
                stageEnteredAt: timingInfo.stageEnteredAt,
                timeInStageHours: timingInfo.timeInStageHours,
                timingStatus: timingInfo.timingStatus,
                timingLabel: timingInfo.timingLabel,
                reminderKey: timingInfo.reminderKey,
            };
        });
    }, [batches, allProducts, materials, orders, batchHistoryLookup, timingNow]);

    const assemblyOrderCandidates = useMemo<AssemblyOrderCandidate[]>(() => {
        if (!orders) return [];
        return buildAssemblyOrderCandidates(orders, enrichedBatches);
    }, [orders, enrichedBatches]);

    const foundBatches = useMemo(() => buildMobileProductionFoundBatches(enrichedBatches, deferredFinderTerm), [enrichedBatches, deferredFinderTerm]);

    const toggleStage = (stageId: string) => {
        setOpenStage((prev) => {
            if (prev === stageId) return null;
            if (stageId === ProductionStage.Polishing) setPolishingTab('pending');
            return stageId;
        });
    };

    const handleNextStage = async (batch: ProductionBatch) => {
        const nextStage = getMobileProductionNextStage(batch);
        if (!nextStage) return;
        try {
            await productionRepository.updateBatchStage(batch.id, nextStage, undefined, nextStage === ProductionStage.Polishing ? true : undefined);
            void invalidateProductionBatches(queryClient);
            showToast(`Το ${batch.sku} μετακινήθηκε στο στάδιο ${STAGES.find(s => s.id === nextStage)?.label}.`, "success");
        } catch (error) {
            showToast("Σφάλμα μετακίνησης.", "error");
        }
    };

    const handleToggleHold = async (batch: ProductionBatch) => {
        if (batch.on_hold) {
            await productionRepository.toggleBatchHold(batch.id, false);
            void invalidateProductionBatches(queryClient);
            showToast("Η παραγωγή συνεχίζεται.", "success");
        } else {
            setHoldBatch(batch);
        }
    };

    const confirmHold = async (reason: string) => {
        if (!holdBatch) return;
        try {
            await productionRepository.toggleBatchHold(holdBatch.id, true, reason);
            void invalidateProductionBatches(queryClient);
            setHoldBatch(null);
            showToast("Τέθηκε σε αναμονή.", "warning");
        } catch (e) { showToast("Σφάλμα.", "error"); }
    };

    const handleViewHistory = async (batch: ProductionBatch) => {
        setHistoryModalBatch(batch);
        setIsLoadingHistory(true);
        try {
            const history = await productionRepository.getBatchHistory(batch.id);
            setBatchHistory(history);
        } catch (e) {
            console.error('Failed to load batch history:', e);
            setBatchHistory([]);
        } finally {
            setIsLoadingHistory(false);
        }
    };

    const handleMoveBatch = async (batch: ProductionBatch, stage: ProductionStage, options?: { pendingDispatch?: boolean }) => {
        if (batch.on_hold) {
            showToast("Η παρτίδα είναι σε αναμονή.", "error");
            return;
        }

        // Handle intra-Polishing sub-stage transitions (dispatch / recall)
        if (batch.current_stage === ProductionStage.Polishing && stage === ProductionStage.Polishing) {
            const wantPending = options?.pendingDispatch ?? true;
            const currentlyPending = !!batch.pending_dispatch;
            if (wantPending === currentlyPending) return; // No change
            try {
                if (wantPending) {
                    await productionRepository.markBatchesPendingDispatch([batch.id]);
                } else {
                    await productionRepository.markBatchesDispatched([batch.id]);
                }
                void invalidateProductionBatches(queryClient);
                showToast(wantPending ? 'Επιστροφή σε Αναμονή Αποστολής' : 'Αποστολή στον Τεχνίτη', 'success');
            } catch (e: any) {
                showToast(`Σφάλμα: ${e.message}`, 'error');
            }
            return;
        }

        if (batch.current_stage === stage) return;

        if (batch.current_stage === ProductionStage.AwaitingDelivery) {
            handleImportReceive(batch, stage, options?.pendingDispatch);
            return;
        }

        setSplitModalState({ batch, targetStage: stage, pendingDispatch: options?.pendingDispatch });
    };

    const handleDispatchAllPendingPolishing = async () => {
        const ids = enrichedBatches
            .filter((b) => b.current_stage === ProductionStage.Polishing && b.pending_dispatch && !b.on_hold)
            .map((b) => b.id);
        if (ids.length === 0) return;
        setIsProcessingSplit(true);
        try {
            const count = await productionRepository.markBatchesDispatched(ids);
            void invalidateProductionBatches(queryClient);
            showToast(`${count} παρτίδ${count === 1 ? 'α' : 'ες'} στάλθηκ${count === 1 ? 'ε' : 'αν'} στον Τεχνίτη.`, 'success');
        } catch (e: any) {
            showToast(`Σφάλμα: ${e.message}`, 'error');
        } finally {
            setIsProcessingSplit(false);
        }
    };

    const handleImportReceive = async (batch: ProductionBatch, targetStage: ProductionStage, pendingDispatch?: boolean) => {
        const confirmed = window.confirm(`Επιβεβαιώνετε την παραλαβή για την παρτίδα ${batch.sku}${batch.variant_suffix || ''}?`);
        if (confirmed) {
            setIsProcessingSplit(true);
            try {
                await productionRepository.updateBatchStage(batch.id, targetStage, undefined, pendingDispatch);
                void invalidateProductionBatches(queryClient);
                showToast('Η παρτίδα παρελήφθη.', 'success');
            } catch (e: any) {
                showToast(`Σφάλμα: ${e.message}`, 'error');
            } finally {
                setIsProcessingSplit(false);
            }
        }
    };

    const handleConfirmSplit = async (quantityToMove: number, targetStage: ProductionStage) => {
        if (!splitModalState) return;
        const { batch, pendingDispatch } = splitModalState;

        setIsProcessingSplit(true);
        try {
            if (quantityToMove >= batch.quantity) {
                await productionRepository.updateBatchStage(batch.id, targetStage, undefined, pendingDispatch);
            } else {
                const originalNewQty = batch.quantity - quantityToMove;
                const { product_details, isDelayed, customer_name, ...dbBatch } = batch as any;

                const newBatchData = {
                    ...dbBatch,
                    id: crypto.randomUUID(),
                    quantity: quantityToMove,
                    current_stage: targetStage,
                    ...(targetStage === ProductionStage.Polishing ? { pending_dispatch: pendingDispatch ?? true } : {}),
                    updated_at: new Date().toISOString()
                };

                await productionRepository.splitBatch(batch.id, originalNewQty, newBatchData);
            }
            void invalidateProductionBatches(queryClient);
            showToast('Η μετακίνηση ολοκληρώθηκε.', 'success');
            setSplitModalState(null);
        } catch (e: any) {
            showToast(`Σφάλμα: ${e.message}`, 'error');
        } finally {
            setIsProcessingSplit(false);
        }
    };

    const handlePrintRequest = (batchesToPrint: (ProductionBatch & { customer_name?: string })[], type: PrintSelectorType) => {
        const validBatches = batchesToPrint.filter(b => !b.on_hold);

        if (validBatches.length === 0) {
            showToast("Δεν υπάρχουν επιλέξιμες παρτίδες για εκτύπωση.", "info");
            return;
        }

        setPrintSelectorState({
            isOpen: true,
            type: type,
            batches: validBatches
        });
    };

    const handlePrintStageLabels = () => {
        const stageBatches = enrichedBatches.filter(b => b.current_stage === ProductionStage.Labeling && !b.on_hold);
        if (stageBatches.length === 0) {
            showToast(`Δεν υπάρχουν παρτίδες στο στάδιο ${getProductionStageLabel(ProductionStage.Labeling)}.`, "info");
            return;
        }

        setLabelPrintSortMode('as_sent');
        setPrintSelectorState({
            isOpen: true,
            type: 'labels',
            batches: stageBatches
        });
    };

    const handleOpenStagePdfBatchPicker = (stageId: ProductionStage) => {
        if (!onPrintStageBatches) return;
        const stageConfig = STAGES.find((stage) => stage.id === stageId);
        const stageBatches = enrichedBatches.filter((batch) => batch.current_stage === stageId && !batch.on_hold);
        if (!stageConfig || stageBatches.length === 0) {
            showToast('Δεν υπάρχουν παρτίδες για εκτύπωση φύλλου σταδίου.', 'info');
            return;
        }

        setPrintSelectorState({
            isOpen: true,
            type: 'stagePdf',
            batches: stageBatches,
            stageMeta: { stageId, stageName: stageConfig.label }
        });
    };

    const handleAssemblyOrderPrintConfirm = (selectedOrderIds: string[]) => {
        if (!onPrintAssembly) return;

        const rows = assemblyOrderCandidates
            .filter((candidate) => selectedOrderIds.includes(candidate.order.id))
            .flatMap((candidate) => candidate.rows);

        if (rows.length === 0) {
            showToast('Δεν βρέθηκαν είδη συναρμολόγησης για τις επιλεγμένες εντολές.', 'info');
            return;
        }

        onPrintAssembly({
            rows,
            selected_order_ids: selectedOrderIds,
            generated_at: new Date().toISOString()
        });
    };

    const executePrint = (selected: ProductionBatch[]) => {
        const type = printSelectorState.type;
        if (type === 'technician') onPrintTechnician(selected);
        else if (type === 'preparation') onPrintPreparation(selected);
        else if (type === 'aggregated') onPrintAggregated(selected);
        else if (type === 'labels') {
            const printQueue = buildLabelPrintQueue(selected as any, labelPrintSortMode, productsMap);
            if (printQueue.length > 0 && onPrintLabels) {
                onPrintLabels(printQueue as any);
                const modeLabel = labelPrintSortMode === 'as_sent' ? 'Σειρά Αποστολής' : 'Ταξινόμηση ανά Πελάτη';
                const totalQuantity = printQueue.reduce((sum, item) => sum + item.quantity, 0);
                showToast(`Στάλθηκαν ${totalQuantity} τεμάχια για εκτύπωση ετικετών (${modeLabel}).`, "success");
            } else {
                showToast("Δεν βρέθηκαν προϊόντα για τις παρτίδες.", "error");
            }
        } else if (type === 'stagePdf') {
            const meta = printSelectorState.stageMeta;
            if (!meta || !onPrintStageBatches || selected.length === 0) return;
            const orderIds = [...new Set(selected.map(b => (b.order_id || '').trim()).filter(Boolean))];
            let customerName: string;
            let orderId: string;
            if (orderIds.length === 1) {
                orderId = orderIds[0];
                customerName = selected.find(b => (b.order_id || '').trim() === orderId)?.customer_name?.trim() || '—';
            } else if (orderIds.length === 0) {
                orderId = '';
                const names = [...new Set(selected.map(b => (b.customer_name || '').trim()).filter(Boolean))];
                customerName =
                    names.length === 1 ? names[0]
                    : names.length > 1 ? 'Διάφοροι πελάτες (χωρίς εντολή)'
                    : 'Χωρίς εντολή';
            } else {
                orderId = '';
                customerName = `Πολλαπλές εντολές (${orderIds.length})`;
            }
            onPrintStageBatches({
                stageName: meta.stageName,
                stageId: meta.stageId,
                customerName,
                orderId,
                batches: selected,
                generatedAt: new Date().toISOString(),
            });
        }
    };

    // Note Saving Handler
    const handleSaveNote = async (newNote: string) => {
        if (!editingNoteBatch) return;
        setIsSavingNote(true);
        try {
            const { error } = await productionRepository.updateBatchNotes(editingNoteBatch.id, newNote || null);
            if (error) throw error;
            void invalidateProductionBatches(queryClient);
            showToast("Η σημείωση αποθηκεύτηκε.", "success");
            setEditingNoteBatch(null);
        } catch (e) {
            showToast("Σφάλμα αποθήκευσης.", "error");
        } finally {
            setIsSavingNote(false);
        }
    };

    if (loadingBatches || loadingMaterials || !allProducts || !materials || !batches) {
        return <div className="p-8 text-center text-slate-400">Φόρτωση παραγωγής...</div>;
    }

    const activeBatchesCount = enrichedBatches.filter(b => b.current_stage !== ProductionStage.Ready && !b.on_hold).length;

    return (
        <div className="flex min-h-0 flex-col bg-slate-50 pb-24">
            <MobileScreenHeader
                icon={Factory}
                title="Παραγωγή"
                subtitle="Ροή παρτίδων & σταδίων"
                iconClassName="text-amber-700"
                right={
                    <span className="rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-white">
                        {activeBatchesCount} ενεργά
                    </span>
                }
            />

            <div className="space-y-4 px-4 pt-3">
            <div className="relative overflow-hidden rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-emerald-500/[0.07]" aria-hidden />
                <div className="relative z-10">
                    <div className="mb-3 flex items-center justify-between gap-2">
                        <h2 className="flex items-center gap-2.5 text-sm font-bold tracking-tight text-slate-800">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#060b00] text-white shadow-sm">
                                <Search size={17} strokeWidth={2.25} aria-hidden />
                            </span>
                            Εύρεση Παρτίδας
                        </h2>
                        {finderTerm ? (
                            <span className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                {foundBatches.length} αποτ.
                            </span>
                        ) : null}
                    </div>
                    <div className="group relative">
                        <input
                            type="text"
                            enterKeyHint="search"
                            autoComplete="off"
                            autoCorrect="off"
                            spellCheck={false}
                            value={finderTerm}
                            onChange={(e) => setFinderTerm(e.target.value)}
                            placeholder="Εύρεση SKU / Εντολής / Πελάτη..."
                            className="min-h-[48px] w-full rounded-2xl border border-slate-200 bg-slate-100 py-3.5 pl-11 pr-12 text-[15px] font-bold uppercase text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/20"
                        />
                        <Search
                            className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-600"
                            strokeWidth={2.25}
                            aria-hidden
                        />
                        {finderTerm ? (
                            <button
                                type="button"
                                onClick={() => setFinderTerm('')}
                                className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-200/80 hover:text-slate-700 active:scale-95 touch-manipulation"
                                aria-label="Καθαρισμός αναζήτησης"
                            >
                                <X size={18} />
                            </button>
                        ) : null}
                    </div>
                </div>
                {finderTerm.length >= 2 && (
                    <div className="relative z-10 mt-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-2 shadow-inner">
                        <div className="custom-scrollbar max-h-[min(50vh,20rem)] space-y-2 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
                        {foundBatches.map(b => {
                            const isSpecialBatch = isSpecialCreationSku(b.sku);
                            const stageMeta = STAGES.find(s => s.id === b.current_stage);
                            const isPendingPolishing = b.current_stage === ProductionStage.Polishing && b.pending_dispatch;
                            const finderSurface = isPendingPolishing
                                ? 'bg-teal-50/25 border border-teal-100/80 border-l-4 border-l-teal-400/45 hover:bg-teal-50/40'
                                : getFinderSearchResultSurface(stageMeta?.color);
                            const finderBadgeTone = isPendingPolishing
                                ? 'text-teal-700 border-teal-200'
                                : getFinderSearchBadgeTone(stageMeta?.color);
                            const stagePillLabel =
                                b.current_stage === ProductionStage.Polishing
                                    ? (b.pending_dispatch ? 'Τεχν. • Αναμονή' : 'Τεχν. • Στον Τεχν.')
                                    : (stageMeta?.label || b.current_stage);
                            const age = getBatchAgeInfo(b);
                            const imgUrl = (b as { product_image?: string | null }).product_image;
                            return (
                            <div key={b.id} onClick={() => setViewBuildBatch(b)} className={`rounded-xl p-2.5 shadow-sm active:scale-[0.99] transition-transform cursor-pointer touch-manipulation ${finderSurface} ${isSpecialBatch ? 'ring-1 ring-violet-100/80' : ''}`}>
                                <div className="flex gap-2.5 items-start">
                                    <div className="w-11 h-11 shrink-0 bg-slate-100 rounded-xl overflow-hidden border border-slate-200 relative flex items-center justify-center">
                                        {imgUrl ? (
                                            <img src={imgUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                                        ) : (
                                            <ImageIcon size={20} className="text-slate-300 relative z-0" />
                                        )}
                                        <div className="absolute bottom-0 right-0 z-[1] bg-slate-900 text-white text-[9px] font-bold px-1 py-0.5 rounded-tl-md leading-none">x{b.quantity}</div>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <SkuColorizedText sku={b.sku} suffix={b.variant_suffix || ''} gender={b.product_details?.gender} className="font-black text-base tracking-tight" masterClassName={isSpecialBatch ? 'text-violet-900' : 'text-slate-800'} />
                                            {b.size_info && <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-md text-[10px] font-black border border-blue-100 flex items-center gap-0.5"><Hash size={9} /> {b.size_info}</span>}
                                            {b.on_hold && (
                                                <span className="bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded text-[9px] font-black flex items-center gap-0.5">
                                                    <PauseCircle size={9} /> Αναμ.
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 mt-1 min-w-0 flex-wrap">
                                            <span className="text-[11px] font-bold text-slate-700 truncate flex items-center gap-1 min-w-0"><User size={11} className="text-slate-400 shrink-0" /> {b.customerName}</span>
                                            {b.on_hold ? (
                                                <div className="text-[9px] font-black px-1.5 py-0.5 rounded border flex items-center gap-0.5 shrink-0 bg-amber-50 text-amber-700 border-amber-200">
                                                    <PauseCircle size={9} /> Hold
                                                </div>
                                            ) : (
                                                <div className={`text-[9px] font-black px-1.5 py-0.5 rounded border flex items-center gap-0.5 shrink-0 ${age.style}`}>
                                                    <Clock size={9} /> {age.label}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-right flex flex-col items-end gap-1 shrink-0 max-w-[38%]">
                                        <div className="text-[9px] font-mono font-bold text-slate-500 select-all tracking-wider truncate w-full">#{formatOrderId(b.order_id)}</div>
                                        <div className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border bg-white/80 backdrop-blur-sm ${finderBadgeTone}`}>
                                            {stagePillLabel}
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-2 pt-2 border-t border-slate-200/60" onClick={e => e.stopPropagation()}>
                                    <FinderBatchStageSelector
                                        batch={b}
                                        onMoveToStage={(batch, stage, opts) => handleMoveBatch(batch, stage, opts)}
                                        onToggleHold={handleToggleHold}
                                        onEditNote={(b) => setEditingNoteBatch(b)}
                                    />
                                </div>
                            </div>
                            );
                        })}
                        {foundBatches.length === 0 && (
                            <div className="py-10 text-center text-sm font-bold italic text-slate-400">Δεν βρέθηκαν παρτίδες.</div>
                        )}
                        </div>
                    </div>
                )}
            </div>

            <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 flex items-center gap-4 mb-2">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-black border-4 shrink-0 ${(enrichedBatches.filter(b => b.isDelayed && !b.on_hold).length / (activeBatchesCount || 1)) > 0.3 ? 'border-red-100 text-red-600 bg-red-50' : 'border-emerald-100 text-emerald-600 bg-emerald-50'}`}>
                    {Math.max(0, 100 - (enrichedBatches.filter(b => b.isDelayed && !b.on_hold).length / (activeBatchesCount || 1)) * 100).toFixed(0)}%
                </div>
                <div>
                    <h3 className="font-bold text-slate-800 text-sm">Κατάσταση Παραγωγής</h3>
                    <div className="flex gap-3 items-center mt-1">
                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full"><Clock size={10} /> {activeBatchesCount} Ενεργά</div>
                        <div className="flex items-center gap-1 text-[10px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full"><AlertTriangle size={10} /> {enrichedBatches.filter(b => b.isDelayed && !b.on_hold).length} Καθυστέρηση</div>
                    </div>
                </div>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                <button
                    onClick={() => setAssemblySelectorOpen(true)}
                    disabled={!onPrintAssembly || assemblyOrderCandidates.length === 0}
                    className="flex items-center gap-1.5 bg-white border border-slate-200 text-pink-700 px-4 py-2.5 rounded-2xl text-xs font-black shadow-sm whitespace-nowrap active:scale-95 transition-all disabled:opacity-50"
                >
                    <Layers size={14} /> Συναρμολόγηση
                </button>
                <button
                    onClick={() => handlePrintRequest(enrichedBatches.filter(b => [ProductionStage.Waxing, ProductionStage.Casting].includes(b.current_stage)), 'preparation')}
                    className="flex items-center gap-1.5 bg-white border border-slate-200 text-purple-700 px-4 py-2.5 rounded-2xl text-xs font-black shadow-sm whitespace-nowrap active:scale-95 transition-all"
                >
                    <BookOpen size={14} /> Προετοιμασία
                </button>
                <button
                    onClick={() => handlePrintRequest(enrichedBatches.filter(b => b.current_stage === ProductionStage.Polishing), 'technician')}
                    className="flex items-center gap-1.5 bg-white border border-slate-200 text-blue-700 px-4 py-2.5 rounded-2xl text-xs font-black shadow-sm whitespace-nowrap active:scale-95 transition-all"
                >
                    <Hammer size={14} /> Τεχνίτης
                </button>
                <button
                    onClick={() => handlePrintRequest(enrichedBatches.filter(b => b.current_stage !== ProductionStage.Ready), 'aggregated')}
                    className="flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 px-4 py-2.5 rounded-2xl text-xs font-black shadow-sm whitespace-nowrap active:scale-95 transition-all"
                >
                    <FileText size={14} /> Συγκεντρωτική
                </button>
                <button
                    onClick={handlePrintStageLabels}
                    className="flex items-center gap-1.5 bg-white border border-slate-200 text-yellow-700 px-4 py-2.5 rounded-2xl text-xs font-black shadow-sm whitespace-nowrap active:scale-95 transition-all"
                >
                    <Tag size={14} /> Ετικέτες
                </button>
            </div>

            <div className="space-y-3">
                {STAGES.map(stage => {
                    const allAtStage = enrichedBatches.filter(b => b.current_stage === stage.id);
                    const isPolishingStage = stage.id === ProductionStage.Polishing;
                    const pendingPolishingCount = isPolishingStage
                        ? allAtStage.filter(b => b.pending_dispatch).length
                        : 0;
                    const dispatchedPolishingCount = isPolishingStage
                        ? allAtStage.filter(b => !b.pending_dispatch).length
                        : 0;
                    const stageBatches = isPolishingStage
                        ? allAtStage.filter(b => (polishingTab === 'pending' ? b.pending_dispatch : !b.pending_dispatch))
                        : allAtStage;
                    const isOpen = openStage === stage.id;
                    const colorClass = STAGE_COLORS[stage.color];
                    const headerCount = allAtStage.length;
                    return (
                        <div key={stage.id} className={`rounded-2xl border transition-all duration-300 overflow-hidden ${isOpen ? 'bg-white border-slate-300 shadow-md' : `bg-white border-slate-100 shadow-sm opacity-90`}`}>
                            <div onClick={() => toggleStage(stage.id)} className={`p-4 flex justify-between items-center cursor-pointer ${isOpen ? 'bg-slate-50' : ''}`}>
                                <div className="flex items-center gap-3"><div className={`w-3 h-3 rounded-full ${colorClass.split(' ')[0].replace('bg-', 'bg-').replace('50', '500')}`} /><span className={`font-bold text-sm ${isOpen ? 'text-slate-900' : 'text-slate-600'}`}>{stage.label}</span></div>
                                <div className="flex items-center gap-3">
                                    {onPrintStageBatches && headerCount > 0 && (
                                        <button
                                            onClick={e => { e.stopPropagation(); handleOpenStagePdfBatchPicker(stage.id); }}
                                            className="p-1.5 bg-blue-100 text-blue-600 rounded-xl hover:bg-blue-200 active:scale-90 transition-all"
                                            title="Εκτύπωση φύλλου σταδίου"
                                        >
                                            <FileText size={13} />
                                        </button>
                                    )}
                                    {stage.id === ProductionStage.Setting && (
                                        <button
                                            onClick={e => { e.stopPropagation(); setShowSettingStones(true); }}
                                            className="p-1.5 bg-purple-100 text-purple-600 rounded-xl hover:bg-purple-200 active:scale-90 transition-all"
                                            title="Πέτρες Καρφωτή"
                                        >
                                            <Gem size={13} />
                                        </button>
                                    )}
                                    <span className={`px-2 py-0.5 rounded-md text-xs font-black ${headerCount > 0 ? colorClass : 'bg-slate-100 text-slate-400'}`}>{headerCount}</span>{isOpen ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                                </div>
                            </div>
                            {isOpen && isPolishingStage && (
                                <div
                                    className="px-3 pt-0 pb-3 border-b border-slate-100 bg-slate-50 space-y-2"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                                        <button
                                            type="button"
                                            onClick={() => setPolishingTab('pending')}
                                            className={`flex-1 flex items-center justify-center gap-1 px-2 py-2 rounded-lg text-[10px] font-black transition-all ${
                                                polishingTab === 'pending'
                                                    ? 'bg-teal-600 text-white shadow-sm'
                                                    : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
                                            }`}
                                        >
                                            <Package size={12} className="shrink-0" />
                                            <span className="truncate">Αναμονή Αποστολής</span>
                                            <span className={`px-1 py-0.5 rounded-full text-[9px] font-black shrink-0 ${polishingTab === 'pending' ? 'bg-white/25 text-white' : 'bg-teal-100 text-teal-700'}`}>
                                                {pendingPolishingCount}
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPolishingTab('dispatched')}
                                            className={`flex-1 flex items-center justify-center gap-1 px-2 py-2 rounded-lg text-[10px] font-black transition-all ${
                                                polishingTab === 'dispatched'
                                                    ? 'bg-blue-600 text-white shadow-sm'
                                                    : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
                                            }`}
                                        >
                                            <Hammer size={12} className="shrink-0" />
                                            <span className="truncate">Στον Τεχνίτη</span>
                                            <span className={`px-1 py-0.5 rounded-full text-[9px] font-black shrink-0 ${polishingTab === 'dispatched' ? 'bg-white/25 text-white' : 'bg-blue-100 text-blue-700'}`}>
                                                {dispatchedPolishingCount}
                                            </span>
                                        </button>
                                    </div>
                                    {polishingTab === 'pending' && pendingPolishingCount > 0 && (
                                        <button
                                            type="button"
                                            disabled={isProcessingSplit}
                                            onClick={() => void handleDispatchAllPendingPolishing()}
                                            className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-teal-600 text-white text-[11px] font-bold hover:bg-teal-700 transition-colors shadow-sm disabled:opacity-50"
                                            title="Αποστολή όλων στον Τεχνίτη"
                                        >
                                            <Truck size={14} />
                                            Αποστολή Όλων
                                        </button>
                                    )}
                                </div>
                            )}
                            {isOpen && (
                                <div className="p-3 space-y-3 bg-slate-50/50 border-t border-slate-100">
                                    {stageBatches.map(batch => <MobileBatchCard key={batch.id} batch={batch} onNext={handleNextStage} onMoveToStage={handleMoveBatch} onToggleHold={handleToggleHold} onClick={setViewBuildBatch} />)}
                                    {stageBatches.length === 0 && (
                                        <div className="text-center py-6 text-slate-400 text-xs italic">
                                            {isPolishingStage
                                                ? (polishingTab === 'pending' ? 'Κανένα προϊόν σε αναμονή αποστολής.' : 'Κανένα προϊόν στον τεχνίτη.')
                                                : 'Κανένα προϊόν σε αυτό το στάδιο.'}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            </div>

            {holdBatch && <MobileHoldModal batch={holdBatch} onClose={() => setHoldBatch(null)} onConfirm={confirmHold} />}

            {showSettingStones && orders && (
                <SettingStoneModal
                    batches={enrichedBatches}
                    orders={orders}
                    allProducts={allProducts}
                    allMaterials={materials}
                    onClose={() => setShowSettingStones(false)}
                />
            )}

            {viewBuildBatch && molds && (
                <MobileBatchBuildModal
                    batch={viewBuildBatch}
                    allMaterials={materials}
                    allMolds={molds}
                    allProducts={allProducts}
                    onClose={() => setViewBuildBatch(null)}
                    onMove={handleMoveBatch}
                    onEditNote={(b) => setEditingNoteBatch(b)}
                    onToggleHold={handleToggleHold}
                    onViewHistory={handleViewHistory}
                />
            )}

            <BatchHistoryModal
                isOpen={!!historyModalBatch}
                onClose={() => setHistoryModalBatch(null)}
                batch={historyModalBatch}
                history={batchHistory}
            />

            {/* Edit Note Modal */}
            {editingNoteBatch && (
                <EditBatchNoteModal
                    batch={editingNoteBatch}
                    onClose={() => setEditingNoteBatch(null)}
                    onSave={handleSaveNote}
                    isProcessing={isSavingNote}
                />
            )}

            {/* Split Modal */}
            {splitModalState && (
                <SplitBatchModal
                    state={splitModalState}
                    onClose={() => setSplitModalState(null)}
                    onConfirm={handleConfirmSplit}
                    isProcessing={isProcessingSplit}
                />
            )}

            <AssemblyOrderSelectorSheet
                isOpen={assemblySelectorOpen}
                onClose={() => setAssemblySelectorOpen(false)}
                candidates={assemblyOrderCandidates}
                onConfirm={handleAssemblyOrderPrintConfirm}
            />

            {printSelectorState.isOpen && (
                <PrintSelectorModal
                    isOpen={printSelectorState.isOpen}
                    onClose={() => setPrintSelectorState({ ...printSelectorState, isOpen: false })}
                    onConfirm={executePrint}
                    batches={printSelectorState.batches}
                    title={
                        printSelectorState.type === 'technician' ? 'Εκτύπωση Τεχνίτη' :
                            printSelectorState.type === 'preparation' ? 'Εκτύπωση Προετοιμασίας' :
                                printSelectorState.type === 'labels' ? 'Εκτύπωση Ετικετών' :
                                    printSelectorState.type === 'stagePdf'
                                        ? `Φύλλο σταδίου — ${printSelectorState.stageMeta?.stageName ?? ''}`
                                        : 'Συγκεντρωτική Εκτύπωση'
                    }
                    subtitle={
                        printSelectorState.type === 'technician'
                            ? 'Επιλέξτε παρτίδες για φύλλο τεχνίτη.'
                            : printSelectorState.type === 'preparation'
                                ? 'Επιλέξτε παρτίδες για φύλλο προετοιμασίας.'
                                : printSelectorState.type === 'labels'
                                    ? 'Επιλέξτε παρτίδες και σειρά εκτύπωσης ετικετών.'
                                    : printSelectorState.type === 'stagePdf'
                                        ? 'Επιλέξτε παρτίδες για εκτύπωση λίστας σταδίου.'
                                        : 'Επιλέξτε παρτίδες για συγκεντρωτική λίστα παραγωγής.'
                    }
                    labelSortMode={printSelectorState.type === 'labels' ? labelPrintSortMode : undefined}
                    onLabelSortModeChange={printSelectorState.type === 'labels' ? setLabelPrintSortMode : undefined}
                />
            )}
        </div>
    );
}
