import React, { useState, useRef, useEffect } from 'react';
import { ProductionBatch, ProductionStage, ProductionTimingStatus } from '../../types';
import {
    CheckSquare, Square, Clock, PauseCircle, PlayCircle,
    StickyNote, History, RefreshCcw, Split, Trash2,
    ChevronDown, MoreHorizontal
} from 'lucide-react';
import { formatCurrency } from '../../utils/pricingEngine';
import { getProductionTimingStatusClasses } from '../../utils/productionTiming';
import { getProductOptionColorLabel } from '../../utils/xrOptions';
import { StageFlowRail } from './StageFlowRail';
import { STAGES, STAGE_BUTTON_COLORS, getStageColorKey } from './stageConstants';

interface BatchRowProps {
    batch: ProductionBatch;
    isSelected: boolean;
    isExpanded: boolean;
    batchValue: number;
    timeInfo: { timingLabel: string; timingStatus: ProductionTimingStatus; stageEnteredAt: string };
    isWorking: boolean;
    onToggleSelect: (batchId: string) => void;
    onToggleExpand: () => void;
    onStageMove: (batch: ProductionBatch, stage: ProductionStage, options?: { pendingDispatch?: boolean }) => void;
    onToggleHold: (batch: ProductionBatch) => void;
    onEditNote: (batch: ProductionBatch) => void;
    onViewHistory: (batch: ProductionBatch) => void;
    onRevert: (batch: ProductionBatch) => void;
    onSplit: (batch: ProductionBatch) => void;
    onDelete: (batch: ProductionBatch) => void;
}

export const BatchRow = React.memo(function BatchRow({
    batch,
    isSelected,
    isExpanded,
    batchValue,
    timeInfo,
    isWorking,
    onToggleSelect,
    onToggleExpand,
    onStageMove,
    onToggleHold,
    onEditNote,
    onViewHistory,
    onRevert,
    onSplit,
    onDelete,
}: BatchRowProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!menuOpen) return;
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [menuOpen]);

    const stageConf = STAGES.find(s => s.id === batch.current_stage);
    const stageColors = STAGE_BUTTON_COLORS[getStageColorKey(batch.current_stage)];

    return (
        <div className={`rounded-xl border text-xs transition-all ${isSelected ? 'border-blue-300 bg-blue-50/30' : 'border-slate-200 bg-slate-50/50'}`}>
            {/* Compact row — always visible */}
            <div
                className="flex items-center gap-2 px-2.5 py-2 cursor-pointer select-none"
                onClick={onToggleExpand}
            >
                {/* Selection checkbox */}
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onToggleSelect(batch.id); }}
                    className={`w-6 h-6 rounded-md border flex items-center justify-center transition-colors shrink-0 ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-400 hover:border-blue-300 hover:text-blue-600'}`}
                    title="Επιλογή παρτίδας"
                >
                    {isSelected ? <CheckSquare size={13} /> : <Square size={13} />}
                </button>

                {/* Quantity */}
                <span className="font-black text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200 shadow-sm min-w-[2.5rem] text-center text-sm">
                    {batch.quantity}
                </span>

                {/* Current stage pill */}
                <span className={`text-[10px] font-black px-2 py-1 rounded-lg border whitespace-nowrap ${stageColors.bg} ${stageColors.text} ${stageColors.border}`}>
                    {stageConf?.label || batch.current_stage}
                </span>

                {/* Timing */}
                <span
                    className={`text-[10px] font-black px-1.5 py-0.5 rounded-md border whitespace-nowrap ${getProductionTimingStatusClasses(timeInfo.timingStatus)}`}
                    title={`Χρόνος στο στάδιο από ${new Date(timeInfo.stageEnteredAt).toLocaleString('el-GR')}`}
                >
                    <Clock size={10} className="inline mr-0.5" />{timeInfo.timingLabel}
                </span>

                {/* Value */}
                <span className="text-[10px] font-mono text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-100 hidden sm:inline">
                    {formatCurrency(batchValue)}
                </span>

                {/* Variant badges (compact) */}
                {batch.size_info && <span className="text-[9px] bg-blue-50 text-blue-600 px-1 py-0.5 rounded border border-blue-100 font-bold hidden md:inline">#{batch.size_info}</span>}
                {batch.cord_color && <span className="text-[9px] bg-amber-50 text-amber-600 px-1 py-0.5 rounded border border-amber-100 font-bold hidden lg:inline">{getProductOptionColorLabel(batch.cord_color)}</span>}
                {batch.enamel_color && <span className="text-[9px] bg-rose-50 text-rose-600 px-1 py-0.5 rounded border border-rose-100 font-bold hidden lg:inline">{getProductOptionColorLabel(batch.enamel_color)}</span>}

                {/* On-hold indicator */}
                {batch.on_hold && (
                    <span className="text-[9px] font-black text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 flex items-center gap-0.5">
                        <PauseCircle size={10} /> Αναμονή
                    </span>
                )}

                {/* Note indicator */}
                {batch.notes && (
                    <StickyNote size={12} className="text-amber-500 shrink-0" />
                )}

                {/* Spacer */}
                <div className="flex-1" />

                {/* Hold toggle - always visible as primary */}
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleHold(batch); }}
                    className={`p-1.5 rounded-lg border transition-colors shrink-0 ${batch.on_hold ? 'text-emerald-600 bg-emerald-50 border-emerald-200 hover:bg-emerald-100' : 'text-amber-600 bg-amber-50 border-amber-200 hover:bg-amber-100'}`}
                    title={batch.on_hold ? 'Συνέχιση παραγωγής' : 'Θέση σε αναμονή'}
                >
                    {batch.on_hold ? <PlayCircle size={14} /> : <PauseCircle size={14} />}
                </button>

                {/* More actions dropdown */}
                <div className="relative" ref={menuRef}>
                    <button
                        onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors shrink-0"
                        title="Περισσότερα"
                    >
                        <MoreHorizontal size={14} />
                    </button>
                    {menuOpen && (
                        <div className="absolute right-0 top-full mt-1 z-30 bg-white rounded-xl border border-slate-200 shadow-xl py-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-150">
                            <button
                                onClick={() => { setMenuOpen(false); onEditNote(batch); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                            >
                                <StickyNote size={13} className={batch.notes ? 'text-amber-500' : 'text-slate-400'} /> Σημείωση
                            </button>
                            <button
                                onClick={() => { setMenuOpen(false); onViewHistory(batch); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                            >
                                <History size={13} className="text-slate-400" /> Ιστορικό
                            </button>
                            <button
                                onClick={() => { setMenuOpen(false); onRevert(batch); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-50 transition-colors"
                            >
                                <RefreshCcw size={13} /> Επαναφορά
                            </button>
                            {batch.current_stage !== ProductionStage.Ready && batch.quantity >= 2 && (
                                <button
                                    onClick={() => { setMenuOpen(false); onSplit(batch); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 transition-colors"
                                >
                                    <Split size={13} /> Διαχωρισμός
                                </button>
                            )}
                            <div className="border-t border-slate-100 my-1" />
                            <button
                                onClick={() => { setMenuOpen(false); onDelete(batch); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors"
                            >
                                <Trash2 size={13} /> Διαγραφή
                            </button>
                        </div>
                    )}
                </div>

                {/* Expand chevron */}
                <ChevronDown
                    size={16}
                    className={`text-slate-400 transition-transform duration-200 shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                />
            </div>

            {/* Expanded section — stage rail + details */}
            <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden">
                    <div className="px-2.5 pb-2.5 space-y-2 border-t border-slate-100 pt-2">
                        {/* Full variant badges when expanded (shown on all screen sizes) */}
                        <div className="flex flex-wrap items-center gap-1.5">
                            {batch.size_info && <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg border border-blue-100 font-bold">#{batch.size_info}</span>}
                            {batch.cord_color && <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-lg border border-amber-100 font-bold">Κορδόνι: {getProductOptionColorLabel(batch.cord_color)}</span>}
                            {batch.enamel_color && <span className="text-[10px] bg-rose-50 text-rose-700 px-2 py-0.5 rounded-lg border border-rose-100 font-bold">Σμάλτο: {getProductOptionColorLabel(batch.enamel_color)}</span>}
                            <span className="text-[10px] font-mono text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200 sm:hidden">{formatCurrency(batchValue)}</span>
                        </div>

                        {/* Notes */}
                        {batch.notes && (
                            <div className="text-[10px] text-amber-700 bg-amber-50 px-2 py-1 rounded-lg border border-amber-100 font-bold flex items-center gap-1 w-fit max-w-full" title={batch.notes}>
                                <StickyNote size={10} /> {batch.notes}
                            </div>
                        )}
                        {batch.on_hold && batch.on_hold_reason && (
                            <div className="text-[10px] text-amber-800 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200 font-bold flex items-center gap-1 w-fit max-w-full">
                                <PauseCircle size={10} className="shrink-0" />
                                <span>Αναμονή: {batch.on_hold_reason}</span>
                            </div>
                        )}

                        {/* Stage flow rail */}
                        <StageFlowRail
                            batch={batch}
                            disabled={isWorking}
                            onMove={(stage, options) => onStageMove(batch, stage, options)}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
});
