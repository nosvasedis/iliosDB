
import React, { useMemo } from 'react';
import { ProductionBatch, ProductionStage, Collection } from '../types';
import { X, ImageIcon, PauseCircle, PlayCircle, StickyNote, Clock, AlertTriangle } from 'lucide-react';
import { PRODUCTION_STAGES, getProductionStageLabel } from '../utils/productionStages';
import SkuColorizedText from './SkuColorizedText';
import { getBatchAgeInfo } from '../features/production/selectors';
import { formatOrderId } from '../utils/orderUtils';
import { getProductionTimingStatusClasses } from '../utils/productionTiming';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    filterType: 'active' | 'delayed' | 'onHold' | 'ready';
    batches: (ProductionBatch & {
        customer_name?: string;
        isDelayed?: boolean;
        product_details?: any;
        product_image?: string | null;
        timingStatus?: string;
        timingLabel?: string;
        stageEnteredAt?: string;
    })[];
    collections: Collection[];
    onPrint: (batch: ProductionBatch) => void;
    onNextStage?: (batch: ProductionBatch) => void;
    onMoveToStage?: (batch: ProductionBatch, targetStage: ProductionStage) => void;
    onEditNote: (batch: ProductionBatch) => void;
    onToggleHold: (batch: ProductionBatch) => void;
    onDelete: (batch: ProductionBatch) => void;
    onClick: (batch: ProductionBatch) => void;
    onViewHistory?: (batch: ProductionBatch) => void;
}

const STAGES = PRODUCTION_STAGES.map((stage) => ({
    id: stage.id,
    label: getProductionStageLabel(stage.id),
    color: stage.colorKey,
}));

const STAGE_HEADER_COLORS: Record<string, { header: string; text: string; border: string; dot: string }> = {
    indigo:  { header: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200',  dot: 'bg-indigo-400'  },
    slate:   { header: 'bg-slate-100',  text: 'text-slate-600',   border: 'border-slate-200',   dot: 'bg-slate-400'   },
    orange:  { header: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200',  dot: 'bg-orange-400'  },
    purple:  { header: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200',  dot: 'bg-purple-400'  },
    blue:    { header: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-400'    },
    pink:    { header: 'bg-pink-50',    text: 'text-pink-700',    border: 'border-pink-200',    dot: 'bg-pink-400'    },
    yellow:  { header: 'bg-yellow-50',  text: 'text-yellow-700',  border: 'border-yellow-200',  dot: 'bg-yellow-400'  },
    emerald: { header: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-400' },
};

const TIMING_LEFT_BORDER: Record<string, string> = {
    normal:    'border-l-emerald-400',
    attention: 'border-l-amber-400',
    delayed:   'border-l-orange-500',
    critical:  'border-l-red-500',
};

const FILTER_BADGE: Record<string, { bg: string; text: string }> = {
    active:  { bg: 'bg-emerald-100', text: 'text-emerald-700' },
    delayed: { bg: 'bg-red-100',     text: 'text-red-700'     },
    onHold:  { bg: 'bg-amber-100',   text: 'text-amber-700'   },
    ready:   { bg: 'bg-blue-100',    text: 'text-blue-700'    },
};

const STAGE_MOVE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    'Αναμονή Παραλαβής': { bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200'  },
    'Waxing':            { bg: 'bg-slate-50',   text: 'text-slate-700',   border: 'border-slate-200'   },
    'Casting':           { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200'  },
    'Setting':           { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200'  },
    'Polishing':         { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200'    },
    'Assembly':          { bg: 'bg-pink-50',    text: 'text-pink-700',    border: 'border-pink-200'    },
    'Labeling':          { bg: 'bg-yellow-50',  text: 'text-yellow-700',  border: 'border-yellow-200'  },
    'Ready':             { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
};

// Inline compact stage mover — avoids nested-button issues
function InlineStageMover({ batch, onMoveToStage, onToggleHold }: {
    batch: ProductionBatch & { requires_setting?: boolean; requires_assembly?: boolean };
    onMoveToStage: (batch: ProductionBatch, s: ProductionStage) => void;
    onToggleHold: (batch: ProductionBatch) => void;
}) {
    const [open, setOpen] = React.useState(false);
    const currentIdx = PRODUCTION_STAGES.findIndex(s => s.id === batch.current_stage);

    const isDisabled = (stageId: ProductionStage) => {
        if (stageId === ProductionStage.Setting && !batch.requires_setting) return true;
        if (stageId === ProductionStage.Assembly && !batch.requires_assembly) return true;
        return false;
    };

    return (
        <div className="flex items-center gap-1.5 relative">
            {/* Hold toggle */}
            <button
                onClick={(e) => { e.stopPropagation(); onToggleHold(batch); }}
                className={`flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-colors border
                    ${batch.on_hold
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                    }`}
            >
                {batch.on_hold
                    ? <><PlayCircle size={12} className="fill-current" /> Συνέχεια</>
                    : <><PauseCircle size={12} /> Αναμονή</>
                }
            </button>

            {/* Stage picker */}
            {batch.current_stage !== ProductionStage.Ready && !batch.on_hold && (
                <div className="relative">
                    <button
                        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
                        className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 transition-colors"
                    >
                        Μετακίνηση ▾
                    </button>
                    {open && (
                        <div
                            className="absolute bottom-full right-0 mb-1 bg-white rounded-xl border border-slate-200 shadow-xl p-2 z-[500] min-w-[160px] space-y-1 animate-in fade-in zoom-in-95 duration-150"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-2 pb-1">Μετακίνηση σε</div>
                            {PRODUCTION_STAGES.map((s, idx) => {
                                const isCurrent = s.id === batch.current_stage;
                                const disabled = isDisabled(s.id);
                                const isPast = idx < currentIdx;
                                const sc = STAGE_MOVE_COLORS[s.id] || { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' };
                                return (
                                    <button
                                        key={s.id}
                                        disabled={disabled || isCurrent}
                                        onClick={(e) => { e.stopPropagation(); setOpen(false); onMoveToStage(batch, s.id); }}
                                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center justify-between
                                            ${isCurrent ? `${sc.bg} ${sc.text} ${sc.border} border ring-2 ring-offset-1 ring-current/20`
                                                : disabled ? 'opacity-40 cursor-not-allowed text-slate-300 border border-transparent'
                                                : isPast ? `${sc.bg} ${sc.text} border ${sc.border} opacity-70 hover:opacity-100`
                                                : `${sc.bg} ${sc.text} border ${sc.border} hover:shadow-sm`}
                                        `}
                                    >
                                        <span>{s.label}</span>
                                        {isCurrent && <span className="text-[8px]">●</span>}
                                        {disabled && <span className="text-[8px] opacity-50">παράλειψη</span>}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function ProductionOverviewModal({
    isOpen, onClose, title, filterType, batches,
    onMoveToStage, onEditNote, onToggleHold, onClick,
}: Props) {

    const filteredBatches = useMemo(() => {
        return batches.filter(b => {
            if (filterType === 'onHold')  return b.on_hold;
            if (filterType === 'ready')   return b.current_stage === ProductionStage.Ready;
            if (filterType === 'delayed') return b.isDelayed && !b.on_hold;
            return !b.on_hold && b.current_stage !== ProductionStage.Ready;
        });
    }, [batches, filterType]);

    const batchesByStage = useMemo(() => {
        const result: Record<string, typeof filteredBatches> = {};
        filteredBatches.forEach(b => {
            if (!result[b.current_stage]) result[b.current_stage] = [];
            result[b.current_stage].push(b);
        });
        const severityOrder: Record<string, number> = { critical: 0, delayed: 1, attention: 2, normal: 3 };
        Object.keys(result).forEach(stage => {
            result[stage].sort((a, b) => {
                if ((a.on_hold ? 1 : 0) !== (b.on_hold ? 1 : 0)) return a.on_hold ? -1 : 1;
                const sA = severityOrder[a.timingStatus || 'normal'] ?? 3;
                const sB = severityOrder[b.timingStatus || 'normal'] ?? 3;
                if (sA !== sB) return sA - sB;
                return (a.sku + (a.variant_suffix || '')).localeCompare(b.sku + (b.variant_suffix || ''));
            });
        });
        return result;
    }, [filteredBatches]);

    const totalQty = filteredBatches.reduce((s, b) => s + b.quantity, 0);
    const badge = FILTER_BADGE[filterType] || FILTER_BADGE.active;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-3xl h-[90vh] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">

                {/* Header */}
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
                    <div>
                        <h2 className="text-xl font-black text-slate-900">{title}</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <span className={`text-xs font-black px-2.5 py-0.5 rounded-full ${badge.bg} ${badge.text}`}>
                                {filteredBatches.length} παρτίδες
                            </span>
                            <span className="text-xs text-slate-400 font-medium">{totalQty} τεμ. συνολικά</span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2.5 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto bg-slate-50/60 p-5 custom-scrollbar space-y-5">
                    {filteredBatches.length === 0 && (
                        <div className="py-24 flex flex-col items-center text-slate-400">
                            <p className="text-base font-semibold">Δεν βρέθηκαν παρτίδες σε αυτή την κατηγορία.</p>
                        </div>
                    )}

                    {STAGES.map(stage => {
                        const stageBatches = batchesByStage[stage.id];
                        if (!stageBatches || stageBatches.length === 0) return null;
                        const colors = STAGE_HEADER_COLORS[stage.color] || STAGE_HEADER_COLORS.slate;

                        return (
                            <div key={stage.id}>
                                {/* Stage header */}
                                <div className={`sticky top-0 z-10 flex items-center gap-2.5 px-4 py-2.5 rounded-xl border mb-2 ${colors.header} ${colors.border}`}>
                                    <div className={`w-2 h-2 rounded-full shrink-0 ${colors.dot}`} />
                                    <span className={`text-[11px] font-black uppercase tracking-widest ${colors.text}`}>{stage.label}</span>
                                    <span className={`ml-auto text-[11px] font-bold ${colors.text} opacity-70`}>
                                        {stageBatches.length} παρτ. · {stageBatches.reduce((s, b) => s + b.quantity, 0)} τεμ.
                                    </span>
                                </div>

                                {/* Batch list */}
                                <div className="space-y-2">
                                    {stageBatches.map(batch => {
                                        const ageInfo = getBatchAgeInfo(batch as any);
                                        const timingStatus = batch.timingStatus || 'normal';
                                        const leftBorder = batch.on_hold
                                            ? 'border-l-amber-400'
                                            : (TIMING_LEFT_BORDER[timingStatus] || 'border-l-emerald-400');

                                        return (
                                            <div
                                                key={batch.id}
                                                className={`bg-white rounded-2xl border border-l-[3px] shadow-sm overflow-hidden ${leftBorder}
                                                    ${batch.on_hold ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200 hover:shadow-md'}
                                                    transition-shadow`}
                                            >
                                                {/* Main row — clickable */}
                                                <div
                                                    className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                                                    onClick={() => onClick(batch)}
                                                >
                                                    {/* Thumbnail */}
                                                    <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-slate-100 bg-slate-50 flex items-center justify-center">
                                                        {batch.product_image ? (
                                                            <img src={batch.product_image} className="w-full h-full object-cover" alt={batch.sku} />
                                                        ) : (
                                                            <ImageIcon size={16} className="text-slate-300" />
                                                        )}
                                                    </div>

                                                    {/* SKU + secondary info */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <SkuColorizedText
                                                                sku={batch.sku}
                                                                suffix={batch.variant_suffix || ''}
                                                                gender={batch.product_details?.gender}
                                                                className="font-black text-sm"
                                                                masterClassName="text-slate-800"
                                                            />
                                                            {batch.size_info && (
                                                                <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-bold text-slate-500 shrink-0">
                                                                    {batch.size_info}
                                                                </span>
                                                            )}
                                                            <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200 font-black text-slate-600 shrink-0">
                                                                ×{batch.quantity}
                                                            </span>
                                                            {batch.on_hold && (
                                                                <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-black shrink-0 flex items-center gap-1">
                                                                    <PauseCircle size={9} className="fill-current" /> ΣΕ ΑΝΑΜΟΝΗ
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-0.5 min-w-0">
                                                            {batch.customer_name && (
                                                                <span className="text-[11px] font-semibold text-slate-600 truncate">{batch.customer_name}</span>
                                                            )}
                                                            {batch.order_id && (
                                                                <span className="text-[10px] font-mono text-slate-400 shrink-0">#{formatOrderId(batch.order_id)}</span>
                                                            )}
                                                            {batch.notes && (
                                                                <StickyNote size={11} className="text-amber-400 shrink-0" />
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Timing badge */}
                                                    <div className="shrink-0 flex flex-col items-end gap-1">
                                                        {!batch.on_hold && (
                                                            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border flex items-center gap-1 ${ageInfo.style}`}>
                                                                <Clock size={10} />
                                                                {ageInfo.label}
                                                            </span>
                                                        )}
                                                        {timingStatus !== 'normal' && !batch.on_hold && (
                                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${getProductionTimingStatusClasses(timingStatus as any)}`}>
                                                                <AlertTriangle size={9} />
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Hold reason or notes strip */}
                                                {(batch.on_hold_reason || batch.notes) && (
                                                    <div className="px-4 pb-2">
                                                        {batch.on_hold_reason && (
                                                            <div className="bg-amber-100 border border-amber-200 rounded-lg px-3 py-1.5 flex items-center gap-1.5 mb-1">
                                                                <AlertTriangle size={11} className="text-amber-600 shrink-0" />
                                                                <span className="text-[11px] font-bold text-amber-800 truncate">{batch.on_hold_reason}</span>
                                                            </div>
                                                        )}
                                                        {batch.notes && (
                                                            <div className="bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
                                                                <StickyNote size={11} className="text-yellow-500 shrink-0" />
                                                                <span className="text-[11px] text-yellow-800 truncate italic">{batch.notes}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Actions footer */}
                                                <div
                                                    className={`flex items-center justify-between gap-2 px-4 py-2 border-t ${batch.on_hold ? 'border-amber-100 bg-amber-50/60' : 'border-slate-100 bg-slate-50/50'}`}
                                                    onClick={e => e.stopPropagation()}
                                                >
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onEditNote(batch); }}
                                                        className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-colors border
                                                            ${batch.notes
                                                                ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                                                                : 'bg-white text-slate-500 border-slate-200 hover:text-amber-600 hover:bg-amber-50 hover:border-amber-200'
                                                            }`}
                                                    >
                                                        <StickyNote size={12} />
                                                        Σημείωση
                                                    </button>

                                                    {onMoveToStage && (
                                                        <InlineStageMover
                                                            batch={batch}
                                                            onMoveToStage={onMoveToStage}
                                                            onToggleHold={onToggleHold}
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
