
import React, { useState, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RETAIL_CUSTOMER_ID, RETAIL_CUSTOMER_NAME } from '../../lib/supabase';
import { ProductionBatch, ProductionStage, Product, Material, MaterialType, ProductionType, Order, ProductVariant } from '../../types';
import { ChevronDown, ChevronUp, Clock, AlertTriangle, ArrowRight, ArrowLeft, CheckCircle, Factory, MoveRight, Printer, BookOpen, FileText, Hammer, Search, User, StickyNote, Hash, X, PauseCircle, PlayCircle, Check, Tag, Loader2, Save, Square, CheckSquare, Image as ImageIcon, Gem, Package, Truck } from 'lucide-react';
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

type PrintSelectorType = 'technician' | 'preparation' | 'aggregated' | 'labels';

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
    const [stageSelectorOpen, setStageSelectorOpen] = useState(false);
    
    // Get current stage index
    const currentStageIndex = STAGES.findIndex(s => s.id === batch.current_stage);
    
    // Determine which stages should be disabled (skipped)
    const isStageDisabled = (stageId: ProductionStage): boolean => {
        if (stageId === ProductionStage.Setting && !batch.requires_setting) return true;
        if (stageId === ProductionStage.Assembly && !batch.requires_assembly) return true;
        return false;
    };
    
    // Handle stage selection
    const handleStageSelect = (targetStage: ProductionStage, options?: { pendingDispatch?: boolean }) => {
        if (isStageDisabled(targetStage)) return;
        if (targetStage === batch.current_stage && targetStage !== ProductionStage.Polishing) return;
        setStageSelectorOpen(false);
        if (onMoveToStage) {
            onMoveToStage(batch, targetStage, options);
        }
    };

    const outerSurface = batch.on_hold
        ? 'border-amber-400 bg-amber-50/30'
        : isDelayed
            ? 'border-red-300 ring-1 ring-red-50 bg-white'
            : isSpecialCreation
                ? 'bg-violet-50/40 border-violet-200 ring-1 ring-violet-100/80 hover:border-violet-400'
                : 'bg-white border-slate-200 hover:border-slate-300';

    return (
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
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => {
                                    if (onMoveToStage) {
                                        setStageSelectorOpen(!stageSelectorOpen);
                                    } else {
                                        onNext(batch);
                                    }
                                }}
                                className="flex items-center gap-1 bg-slate-100 active:bg-slate-200 text-slate-600 px-2 py-1 rounded-lg text-[10px] font-bold transition-all shadow-sm active:scale-95"
                            >
                                <MoveRight size={11} />
                                Μετακ.
                                {onMoveToStage && (stageSelectorOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
                            </button>

                            {stageSelectorOpen && onMoveToStage && (
                                <div className="absolute bottom-full right-0 mb-2 bg-white rounded-2xl shadow-xl border border-slate-200 p-2 z-50 w-[min(100vw-2rem,220px)]">
                                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-2">Στάδια</div>
                                    <div className="space-y-1 max-h-[280px] overflow-y-auto">
                                        {STAGES.map((stage, index) => {
                                            const isCurrent = stage.id === batch.current_stage;
                                            const isDisabled = isStageDisabled(stage.id);
                                            const isPast = index < currentStageIndex;
                                            const stageColors = STAGE_COLORS[stage.color];

                                            if (stage.id === ProductionStage.Polishing) {
                                                const isCurrentPending = isCurrent && batch.pending_dispatch;
                                                const isCurrentDispatched = isCurrent && !batch.pending_dispatch;
                                                return (
                                                    <div key={stage.id} className="flex gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleStageSelect(ProductionStage.Polishing, { pendingDispatch: true })}
                                                            disabled={isDisabled}
                                                            className={`flex-1 min-w-0 text-center px-1.5 py-1.5 rounded-lg text-[9px] font-bold transition-all border flex items-center justify-between gap-0.5
                                                                ${isCurrentPending
                                                                    ? 'bg-teal-50 text-teal-700 border-teal-200 ring-2 ring-offset-1 ring-teal-400/30'
                                                                    : isDisabled
                                                                    ? 'bg-slate-50/50 text-slate-300/50 cursor-not-allowed opacity-50'
                                                                    : isPast
                                                                    ? 'bg-teal-50/50 text-teal-700/80 border border-slate-100'
                                                                    : 'bg-teal-50 text-teal-700 border-teal-200 hover:shadow-md'
                                                                }
                                                            `}
                                                        >
                                                            <span className="truncate">Τεχν. • Αναμ.</span>
                                                            {isCurrentPending && <span className="text-[8px] shrink-0">●</span>}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleStageSelect(ProductionStage.Polishing, { pendingDispatch: false })}
                                                            disabled={isDisabled}
                                                            className={`flex-1 min-w-0 text-center px-1.5 py-1.5 rounded-lg text-[9px] font-bold transition-all border flex items-center justify-between gap-0.5
                                                                ${isCurrentDispatched
                                                                    ? 'bg-blue-50 text-blue-700 border-blue-200 ring-2 ring-offset-1 ring-blue-400/30'
                                                                    : isDisabled
                                                                    ? 'bg-slate-50/50 text-slate-300/50 cursor-not-allowed opacity-50'
                                                                    : isPast
                                                                    ? 'bg-blue-50/50 text-blue-700/80 border border-slate-100'
                                                                    : 'bg-blue-50 text-blue-700 border-blue-200 hover:shadow-md'
                                                                }
                                                            `}
                                                        >
                                                            <span className="truncate">Τεχν. • Τεχν.</span>
                                                            {isCurrentDispatched && <span className="text-[8px] shrink-0">●</span>}
                                                        </button>
                                                    </div>
                                                );
                                            }

                                            return (
                                                <button
                                                    key={stage.id}
                                                    type="button"
                                                    onClick={() => handleStageSelect(stage.id)}
                                                    disabled={isDisabled}
                                                    className={`w-full text-left px-2.5 py-2 rounded-xl text-[11px] font-bold transition-all flex items-center justify-between
                                                        ${isCurrent
                                                            ? `${stageColors} ring-2 ring-offset-1 ring-current/30`
                                                            : isDisabled
                                                            ? 'bg-slate-50/50 text-slate-300/50 cursor-not-allowed blur-[1px] opacity-50'
                                                            : isPast
                                                            ? 'bg-slate-50 text-slate-500 border border-slate-100'
                                                            : `${stageColors} hover:shadow-md`
                                                        }
                                                    `}
                                                >
                                                    <span className="truncate">{stage.label}</span>
                                                    {isCurrent && <span className="text-[8px]">●</span>}
                                                    {isDisabled && <span className="text-[7px] opacity-50">παράλειψη</span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const PrintSelectorModal = ({ isOpen, onClose, onConfirm, batches, title, labelSortMode, onLabelSortModeChange }: {
    isOpen: boolean,
    onClose: () => void,
    onConfirm: (selected: ProductionBatch[]) => void,
    batches: (ProductionBatch & { customer_name?: string })[],
    title: string,
    labelSortMode?: LabelPrintSortMode,
    onLabelSortModeChange?: (mode: LabelPrintSortMode) => void
}) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(batches.map(b => b.id)));
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (isOpen) setSelectedIds(new Set(batches.map(b => b.id)));
    }, [isOpen, batches]);

    const groupedBatches = useMemo(() => groupMobilePrintSelectorBatches(batches, searchTerm), [batches, searchTerm]);

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

    const toggleAll = () => {
        if (selectedIds.size === batches.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(batches.map(b => b.id)));
        }
    };

    const handleConfirm = () => {
        const selected = batches.filter(b => selectedIds.has(b.id));
        onConfirm(selected);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-lg max-h-[85vh] rounded-3xl shadow-2xl flex flex-col animate-in zoom-in-95">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <Printer size={18} className="text-blue-600" /> {title}
                        </h3>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-400"><X size={20} /></button>
                </div>

                <div className="p-4 border-b border-slate-100 bg-white space-y-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            placeholder="Αναζήτηση..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-9 p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 text-sm font-medium"
                        />
                    </div>
                    <button
                        onClick={toggleAll}
                        className="w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border border-slate-100 bg-slate-50 text-slate-500 flex items-center justify-center gap-2 active:bg-slate-100"
                    >
                        {selectedIds.size === batches.length ? (
                            <><Square size={14} /> Αποεπιλογη ολων</>
                        ) : (
                            <><CheckSquare size={14} /> Επιλογη ολων</>
                        )}
                    </button>
                    {labelSortMode && onLabelSortModeChange && (
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => onLabelSortModeChange('as_sent')}
                                className={`py-2 rounded-xl text-[11px] font-black border transition-all ${labelSortMode === 'as_sent' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}
                            >
                                Όπως Στάλθηκαν
                            </button>
                            <button
                                onClick={() => onLabelSortModeChange('customer')}
                                className={`py-2 rounded-xl text-[11px] font-black border transition-all ${labelSortMode === 'customer' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}
                            >
                                Ανά Πελάτη
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4 bg-slate-50/30">
                    {groupedBatches.map(([key, group]) => {
                        const allSelected = group.items.every(b => selectedIds.has(b.id));
                        const someSelected = group.items.some(b => selectedIds.has(b.id));

                        return (
                            <div key={key} className={`bg-white rounded-xl border transition-all ${allSelected ? 'border-blue-300 ring-1 ring-blue-100' : 'border-slate-200'}`}>
                                <div
                                    className="p-3 border-b border-slate-100 flex items-center gap-3 cursor-pointer hover:bg-slate-50 rounded-t-xl"
                                    onClick={() => toggleGroup(group.items.map(b => b.id))}
                                >
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${allSelected ? 'bg-blue-600 border-blue-600' : (someSelected ? 'bg-blue-100 border-blue-300' : 'bg-white border-slate-300')}`}>
                                        {allSelected && <Check size={14} className="text-white" />}
                                        {someSelected && !allSelected && <div className="w-2 h-2 bg-blue-600 rounded-sm" />}
                                    </div>
                                    <div className="flex-1">
                                        <div className="font-bold text-slate-800 text-sm">{group.name}</div>
                                        <div className="text-[10px] text-slate-500">{group.items.length} είδη</div>
                                    </div>
                                </div>
                                <div className="p-2 space-y-1">
                                    {group.items.map(item => (
                                        <div
                                            key={item.id}
                                            onClick={() => toggleBatch(item.id)}
                                            className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg cursor-pointer"
                                        >
                                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedIds.has(item.id) ? 'bg-blue-500 border-blue-500' : 'bg-white border-slate-300'}`}>
                                                {selectedIds.has(item.id) && <Check size={12} className="text-white" />}
                                            </div>
                                            <div className="flex-1 flex justify-between items-center">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono font-bold text-sm text-slate-700">{item.sku}{item.variant_suffix}</span>
                                                    {item.size_info && <span className="text-[9px] bg-slate-100 px-1.5 rounded border border-slate-200 font-bold text-slate-500">{item.size_info}</span>}
                                                </div>
                                                <div className="text-xs font-black bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                                                    {item.quantity} τμχ
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                    {groupedBatches.length === 0 && <div className="text-center py-10 text-slate-400 italic">Δεν βρέθηκαν παρτίδες.</div>}
                </div>

                <div className="p-4 border-t border-slate-100 bg-white flex justify-end gap-3 rounded-b-3xl">
                    <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-slate-600 font-bold hover:bg-slate-100 transition-colors flex-1">
                        Άκυρο
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={selectedIds.size === 0}
                        className="px-6 py-2.5 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 flex-[2]"
                    >
                        <Printer size={18} /> Εκτύπωση ({selectedIds.size})
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

export default function MobileProduction({ allProducts, onPrintAggregated, onPrintPreparation, onPrintTechnician, onPrintLabels }: Props) {
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
    const [printSelectorState, setPrintSelectorState] = useState<{ isOpen: boolean, type: PrintSelectorType | '', batches: (ProductionBatch & { customer_name?: string })[] }>({ isOpen: false, type: '', batches: [] });
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
        <div className="p-4 space-y-4 pb-24">
            <div className="flex justify-between items-center mb-2">
                <h1 className="text-2xl font-black text-slate-900">Παραγωγή</h1>
                <span className="bg-slate-900 text-white text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-widest">{activeBatchesCount} ΕΝΕΡΓΑ</span>
            </div>

            <div className="bg-slate-900 rounded-3xl p-5 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10 text-white"><Search size={80} /></div>
                <div className="relative z-10">
                    <div className="flex items-center justify-between mb-3 text-white">
                        <h2 className="font-bold text-sm flex items-center gap-2">
                            <Search size={16} className="text-emerald-400" /> Εύρεση Παρτίδας
                        </h2>
                        {finderTerm && <div className="text-[10px] font-black bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-lg border border-emerald-500/20">{foundBatches.length} ΑΠΟΤΕΛΕΣΜΑΤΑ</div>}
                    </div>
                    <div className="relative">
                        <input type="text" value={finderTerm} onChange={(e) => setFinderTerm(e.target.value)} placeholder="Εύρεση SKU / Εντολής / Πελάτη..." className="w-full pl-10 p-4 rounded-2xl bg-white/10 border border-white/20 text-white placeholder-white/40 outline-none focus:bg-white/20 focus:ring-2 focus:ring-emerald-500/20 font-bold transition-all uppercase" />
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" size={20} />
                        {finderTerm && <button onClick={() => setFinderTerm('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white p-1.5 bg-white/5 rounded-full"><X size={16} /></button>}
                    </div>
                </div>
                {finderTerm.length >= 2 && (
                    <div className="mt-4 rounded-2xl bg-white p-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-slate-200/90 relative z-10">
                    <div className="space-y-2 max-h-[min(50vh,20rem)] overflow-y-auto custom-scrollbar">
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
                                    />
                                </div>
                            </div>
                            );
                        })}
                        {foundBatches.length === 0 && <div className="text-center py-8 text-slate-400 italic font-bold text-sm">Δεν βρέθηκαν παρτίδες.</div>}
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

            {printSelectorState.isOpen && (
                <PrintSelectorModal
                    isOpen={printSelectorState.isOpen}
                    onClose={() => setPrintSelectorState({ ...printSelectorState, isOpen: false })}
                    onConfirm={executePrint}
                    batches={printSelectorState.batches}
                    title={
                        printSelectorState.type === 'technician' ? 'Εκτύπωση Τεχνίτη' :
                            printSelectorState.type === 'preparation' ? 'Εκτύπωση Προετοιμασίας' :
                                printSelectorState.type === 'labels' ? 'Εκτύπωση Ετικετών' : 'Συγκεντρωτική Εκτύπωση'
                    }
                    labelSortMode={printSelectorState.type === 'labels' ? labelPrintSortMode : undefined}
                    onLabelSortModeChange={printSelectorState.type === 'labels' ? setLabelPrintSortMode : undefined}
                />
            )}
        </div>
    );
}
