
import React, { useEffect, useMemo, useState } from 'react';
import { BatchStageHistoryEntry, ProductionBatch, ProductionStage } from '../types';
import { X, Clock, ArrowRight, User, Calendar, Package, Flame, Gem, Hammer, Layers, Tag, CheckCircle, Globe, PlayCircle } from 'lucide-react';
import {
    formatGreekDurationFromMs,
    getProductionTimingInfo,
    getProductionTimingStatusClasses,
    getProductionTimingStatusLabel,
} from '../utils/productionTiming';
import { getProductionStageLabel } from '../utils/productionStages';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    batch: ProductionBatch | null;
    history: BatchStageHistoryEntry[];
}

const STAGE_CONFIG: Record<ProductionStage, { label: string; icon: React.ReactNode; color: string; bg: string; border: string }> = {
    [ProductionStage.AwaitingDelivery]: {
        label: 'Αναμονή Παραλαβής',
        icon: <Globe size={14} />,
        color: 'text-indigo-700',
        bg: 'bg-indigo-50',
        border: 'border-indigo-200'
    },
    [ProductionStage.Waxing]: {
        label: getProductionStageLabel(ProductionStage.Waxing),
        icon: <Package size={14} />,
        color: 'text-slate-700',
        bg: 'bg-slate-50',
        border: 'border-slate-200'
    },
    [ProductionStage.Casting]: {
        label: getProductionStageLabel(ProductionStage.Casting),
        icon: <Flame size={14} />,
        color: 'text-orange-700',
        bg: 'bg-orange-50',
        border: 'border-orange-200'
    },
    [ProductionStage.Setting]: {
        label: getProductionStageLabel(ProductionStage.Setting),
        icon: <Gem size={14} />,
        color: 'text-purple-700',
        bg: 'bg-purple-50',
        border: 'border-purple-200'
    },
    [ProductionStage.Polishing]: {
        label: getProductionStageLabel(ProductionStage.Polishing),
        icon: <Hammer size={14} />,
        color: 'text-blue-700',
        bg: 'bg-blue-50',
        border: 'border-blue-200'
    },
    [ProductionStage.Assembly]: {
        label: getProductionStageLabel(ProductionStage.Assembly),
        icon: <Layers size={14} />,
        color: 'text-pink-700',
        bg: 'bg-pink-50',
        border: 'border-pink-200'
    },
    [ProductionStage.Labeling]: {
        label: getProductionStageLabel(ProductionStage.Labeling),
        icon: <Tag size={14} />,
        color: 'text-yellow-700',
        bg: 'bg-yellow-50',
        border: 'border-yellow-200'
    },
    [ProductionStage.Ready]: {
        label: getProductionStageLabel(ProductionStage.Ready),
        icon: <CheckCircle size={14} />,
        color: 'text-emerald-700',
        bg: 'bg-emerald-50',
        border: 'border-emerald-200'
    }
};

const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return {
        date: date.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        time: date.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' }),
        full: date.toLocaleString('el-GR')
    };
};

const getDurationInStage = (fromDate: string, toDate: string) => {
    const from = new Date(fromDate).getTime();
    const to = new Date(toDate).getTime();
    return formatGreekDurationFromMs(to - from);
};

export default function BatchHistoryModal({ isOpen, onClose, batch, history }: Props) {
    const [nowMs, setNowMs] = useState(() => Date.now());

    useEffect(() => {
        const intervalId = window.setInterval(() => setNowMs(Date.now()), 60_000);
        return () => window.clearInterval(intervalId);
    }, []);

    const timelineHistory = useMemo(() => {
        if (!batch) return [] as BatchStageHistoryEntry[];

        const ascending = [...history].sort((a, b) => new Date(a.moved_at).getTime() - new Date(b.moved_at).getTime());
        const hasCreationEntry = ascending.some((entry) => entry.from_stage === null);

        if (hasCreationEntry) return ascending;

        return [
            {
                id: `synthetic-create-${batch.id}`,
                batch_id: batch.id,
                from_stage: null,
                to_stage: batch.current_stage,
                moved_by: 'Σύστημα',
                moved_at: batch.created_at,
                notes: 'Συντέθηκε από την ημερομηνία δημιουργίας παρτίδας',
            },
            ...ascending,
        ];
    }, [batch, history]);

    const sortedHistory = useMemo(() => {
        return [...timelineHistory].sort((a, b) =>
            new Date(b.moved_at).getTime() - new Date(a.moved_at).getTime()
        );
    }, [timelineHistory]);

    const totalTimeInProduction = useMemo(() => {
        if (sortedHistory.length === 0) return null;
        const firstEntry = sortedHistory[sortedHistory.length - 1];
        const lastEntry = sortedHistory[0];
        const start = new Date(firstEntry.moved_at).getTime();
        const end = new Date(lastEntry.moved_at).getTime();
        const diffMs = end - start;
        const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffHrs / 24);
        
        return formatGreekDurationFromMs(diffMs);
    }, [sortedHistory]);

    if (!isOpen || !batch) return null;

    const currentTiming = getProductionTimingInfo(batch, timelineHistory, nowMs);
    const currentStageLabel = getProductionStageLabel(batch.current_stage);
    const currentStageSinceLabel = formatDateTime(currentTiming.stageEnteredAt);
    const currentStatusClasses = getProductionTimingStatusClasses(currentTiming.timingStatus);
    const currentStatusLabel = getProductionTimingStatusLabel(currentTiming.timingStatus);

    return (
        <div className="fixed inset-0 z-[250] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-gradient-to-r from-slate-50 to-white shrink-0">
                    <div>
                        <h2 className="text-xl font-black text-slate-900 flex items-center gap-3">
                            <Clock size={22} className="text-blue-600" />
                            Ιστορικό Παρτίδας
                        </h2>
                        <div className="mt-2 flex items-center gap-3">
                            <span className="font-mono font-bold text-lg text-slate-800 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
                                {batch.sku}{batch.variant_suffix}
                            </span>
                            {batch.size_info && (
                                <span className="text-xs font-bold text-slate-600 bg-slate-50 px-2 py-1 rounded border border-slate-200">
                                    {batch.size_info}
                                </span>
                            )}
                        </div>
                        <div className="mt-1 text-sm text-slate-500">
                            Ποσότητα: <span className="font-bold text-slate-700">{batch.quantity} τεμ.</span>
                        </div>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="p-2.5 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Summary Stats */}
                <div className="px-6 py-4 bg-blue-50/50 border-b border-blue-100">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                        <div className="bg-white/80 border border-blue-100 rounded-2xl px-4 py-3">
                            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-black mb-1">Τρέχον στάδιο</div>
                            <div className="font-black text-slate-800">{currentStageLabel}</div>
                        </div>
                        <div className="bg-white/80 border border-blue-100 rounded-2xl px-4 py-3">
                            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-black mb-1">Από πότε</div>
                            <div className="font-bold text-slate-700">{currentStageSinceLabel.date} • {currentStageSinceLabel.time}</div>
                        </div>
                        <div className="bg-white/80 border border-blue-100 rounded-2xl px-4 py-3">
                            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-black mb-1">Χρόνος στο στάδιο</div>
                            <div className="font-black text-blue-700">{currentTiming.timingLabel}</div>
                        </div>
                        <div className="bg-white/80 border border-blue-100 rounded-2xl px-4 py-3">
                            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-black mb-1">Κατάσταση</div>
                            <div className={`inline-flex items-center gap-1 text-xs font-black px-2.5 py-1 rounded-full border ${currentStatusClasses}`}>
                                <Clock size={12} />
                                <span>{currentStatusLabel}</span>
                            </div>
                        </div>
                    </div>
                    {sortedHistory.length > 0 && (
                        <div className="mt-3 flex items-center gap-6 text-sm text-slate-600 flex-wrap">
                            <div className="flex items-center gap-2">
                                <Calendar size={16} className="text-blue-600" />
                                <span>Συνολικός χρόνος: <span className="font-bold text-blue-700">{totalTimeInProduction}</span></span>
                            </div>
                            <div className="flex items-center gap-2">
                                <ArrowRight size={16} className="text-emerald-600" />
                                <span>Μετακινήσεις: <span className="font-bold text-emerald-700">{sortedHistory.length}</span></span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Timeline */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30 custom-scrollbar">
                    {sortedHistory.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                            <Clock size={48} className="mb-4 opacity-30" />
                            <p className="text-lg font-bold">Δεν υπάρχει ιστορικό</p>
                            <p className="text-sm">Η παρτίδα δεν έχει καταγεγραμμένες μετακινήσεις.</p>
                        </div>
                    ) : (
                        <div className="relative">
                            {/* Timeline Line */}
                            <div className="absolute left-[19px] top-4 bottom-4 w-0.5 bg-slate-200" />
                            
                            <div className="space-y-4">
                                {sortedHistory.map((entry, index) => {
                                    const toConfig = STAGE_CONFIG[entry.to_stage];
                                    const fromConfig = entry.from_stage ? STAGE_CONFIG[entry.from_stage] : null;
                                    const dateTime = formatDateTime(entry.moved_at);
                                    const isLatest = index === 0;
                                    const isCreation = entry.from_stage === null;
                                    
                                    // Calculate time spent in previous stage
                                    const timeInPrevStage = !isCreation && entry.from_stage && sortedHistory[index + 1] 
                                        ? getDurationInStage(sortedHistory[index + 1].moved_at, entry.moved_at)
                                        : null;

                                    return (
                                        <div 
                                            key={entry.id} 
                                            className={`relative flex gap-4 ${isLatest ? 'opacity-100' : 'opacity-85'}`}
                                        >
                                            {/* Timeline Dot */}
                                            <div className="relative z-10 shrink-0">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${toConfig.bg} ${toConfig.border} ${toConfig.color} ${isLatest ? 'ring-4 ring-blue-100' : ''}`}>
                                                    {toConfig.icon}
                                                </div>
                                                {isLatest && (
                                                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full border-2 border-white flex items-center justify-center">
                                                        <div className="w-1.5 h-1.5 bg-white rounded-full" />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Content Card */}
                                            <div className={`flex-1 p-4 rounded-2xl border ${isLatest ? 'bg-white border-blue-200 shadow-md' : 'bg-white border-slate-200'} transition-all hover:shadow-md`}>
                                                {/* Stage Transition */}
                                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                    {isCreation ? (
                                                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                                            Δημιουργία Παρτίδας
                                                        </span>
                                                    ) : fromConfig ? (
                                                        <>
                                                            <span className={`text-xs font-bold px-2 py-0.5 rounded border ${fromConfig.bg} ${fromConfig.color} ${fromConfig.border}`}>
                                                                {fromConfig.label}
                                                            </span>
                                                            <ArrowRight size={14} className="text-slate-400" />
                                                            <span className={`text-xs font-bold px-2 py-0.5 rounded border ${toConfig.bg} ${toConfig.color} ${toConfig.border}`}>
                                                                {toConfig.label}
                                                            </span>
                                                        </>
                                                    ) : (
                                                        <span className={`text-xs font-bold px-2 py-0.5 rounded border ${toConfig.bg} ${toConfig.color} ${toConfig.border}`}>
                                                            {toConfig.label}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Time Info */}
                                                <div className="flex items-center gap-4 text-xs text-slate-500 mb-2">
                                                    <div className="flex items-center gap-1">
                                                        <Calendar size={12} />
                                                        <span className="font-medium">{dateTime.date}</span>
                                                        <span className="text-slate-400">|</span>
                                                        <span>{dateTime.time}</span>
                                                    </div>
                                                    {entry.moved_by && (
                                                        <div className="flex items-center gap-1">
                                                            <User size={12} />
                                                            <span className="font-medium">{entry.moved_by}</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Duration in Previous Stage */}
                                                {timeInPrevStage && (
                                                    <div className="flex items-center gap-1.5 text-xs">
                                                        <Clock size={12} className="text-slate-400" />
                                                        <span className="text-slate-500">Χρόνος στο προηγούμενο στάδιο:</span>
                                                        <span className="font-bold text-slate-700">{timeInPrevStage}</span>
                                                    </div>
                                                )}

                                                {/* Notes */}
                                                {entry.notes && (
                                                    <div className="mt-2 p-2 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-800 italic">
                                                        "{entry.notes}"
                                                    </div>
                                                )}

                                                {/* Latest Badge */}
                                                {isLatest && (
                                                    <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                                        <PlayCircle size={10} />
                                                        Τρέχουσα Κατάσταση
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                    <button 
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800 transition-colors"
                    >
                        Κλείσιμο
                    </button>
                </div>
            </div>
        </div>
    );
}
