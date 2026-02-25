import React from 'react';
import { ProductionBatch, ProductionStage } from '../types';
import { Clock, PauseCircle, StickyNote, Trash2, Printer, MoveRight, ImageIcon, AlertTriangle, PlayCircle, RefreshCcw } from 'lucide-react';
import { getVariantComponents } from '../utils/pricingEngine';
import { formatOrderId } from '../utils/orderUtils';

// Finish/Plating Visuals
export const FINISH_STYLES: Record<string, { style: string, label: string }> = {
    'X': { style: 'bg-amber-100 text-amber-900 border-amber-200', label: 'Επίχρυσο' },
    'P': { style: 'bg-stone-200 text-stone-800 border-stone-300', label: 'Πατίνα' },
    'D': { style: 'bg-orange-100 text-orange-800 border-orange-200', label: 'Δίχρωμο' },
    'H': { style: 'bg-cyan-100 text-cyan-900 border-cyan-200', label: 'Πλατίνα' },
    '': { style: 'bg-slate-100 text-slate-700 border-slate-200', label: 'Λουστρέ' }
};

// Time Aging Helper
export const getTimeInStage = (dateStr: string) => {
    const start = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHrs / 24);

    let label = '';
    let colorClass = '';

    if (diffDays > 0) {
        label = `${diffDays}d ${diffHrs % 24}h`;
        if (diffDays >= 6) colorClass = 'bg-red-50 text-red-600 border-red-200'; // Critical (> 6 days)
        else if (diffDays >= 4) colorClass = 'bg-orange-50 text-orange-600 border-orange-200'; // Warning (4-5 days)
        else colorClass = 'bg-blue-50 text-blue-600 border-blue-200'; // Normal
    } else {
        label = `${diffHrs}h`;
        if (diffHrs < 4) colorClass = 'bg-emerald-50 text-emerald-600 border-emerald-200'; // Fresh
        else colorClass = 'bg-blue-50 text-blue-600 border-blue-200'; // Normal
    }

    return { label, colorClass };
};

interface BatchCardProps {
    batch: ProductionBatch & { customer_name?: string };
    onDragStart?: (e: React.DragEvent<HTMLDivElement>, batchId: string) => void;
    onPrint: (batch: ProductionBatch) => void;
    onNextStage?: (batch: ProductionBatch) => void;
    onEditNote: (batch: ProductionBatch) => void;
    onToggleHold: (batch: ProductionBatch) => void;
    onDelete: (batch: ProductionBatch) => void;
    onClick: (batch: ProductionBatch) => void;
    // Optional: Hide action footer if used in restrictive views
    hideActions?: boolean;
}

export const ProductionBatchCard: React.FC<BatchCardProps> = ({
    batch,
    onDragStart,
    onPrint,
    onNextStage,
    onEditNote,
    onToggleHold,
    onDelete,
    onClick,
    hideActions = false
}) => {
    const isRefurbish = batch.type === 'Φρεσκάρισμα';
    const isAwaiting = batch.current_stage === ProductionStage.AwaitingDelivery;
    const isReady = batch.current_stage === ProductionStage.Ready;

    // Calculate finish for styling
    const { finish } = getVariantComponents(batch.variant_suffix || '', batch.product_details?.gender);
    const finishConfig = FINISH_STYLES[finish.code] || FINISH_STYLES[''];

    const timeInfo = getTimeInStage(batch.updated_at);

    return (
        <div
            draggable={!!onDragStart}
            onDragStart={onDragStart ? (e) => onDragStart(e, batch.id) : undefined}
            onClick={() => onClick(batch)}
            className={`bg-white p-3 sm:p-4 rounded-2xl border transition-all relative flex flex-col justify-between group touch-manipulation cursor-pointer
                    ${batch.on_hold
                    ? 'border-amber-400 bg-amber-50/30' // Visual indication of HOLD
                    : (isRefurbish ? 'border-blue-300 ring-1 ring-blue-50' : 'border-slate-200 hover:border-emerald-400 hover:shadow-md')}
                    ${isReady ? 'opacity-90 hover:opacity-100' : ''}
        `}
        >
            {/* Header Badges */}
            <div className="flex justify-between items-start mb-3">
                <div className="flex flex-wrap gap-2">
                    {batch.on_hold ? (
                        <div className="bg-amber-100 text-amber-700 border border-amber-200 text-[10px] font-black px-2 py-1 rounded-full flex items-center gap-1 animate-pulse">
                            <PauseCircle size={10} className="fill-current" />
                            <span>ΣΕ ΑΝΑΜΟΝΗ</span>
                        </div>
                    ) : (
                        <div className={`text-[10px] font-black px-2 py-1 rounded-full flex items-center gap-1 border ${timeInfo.colorClass}`}>
                            <Clock size={10} />
                            <span>{timeInfo.label}</span>
                        </div>
                    )}
                    {isRefurbish && (
                        <div className="bg-blue-100 text-blue-700 border border-blue-200 text-[10px] font-black px-2 py-1 rounded-full flex items-center gap-1">
                            <RefreshCcw size={10} /> Repair
                        </div>
                    )}
                </div>

                <div className="flex gap-1">
                    <button
                        onClick={(e) => { e.stopPropagation(); onToggleHold(batch); }}
                        className={`p-1.5 rounded-lg transition-colors ${batch.on_hold ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'}`}
                        title={batch.on_hold ? "Συνέχιση Παραγωγής" : "Θέση σε Αναμονή"}
                    >
                        {batch.on_hold ? <PlayCircle size={16} className="fill-current" /> : <PauseCircle size={16} />}
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onEditNote(batch); }}
                        className={`p-1.5 rounded-lg transition-colors ${batch.notes ? 'bg-amber-100 text-amber-700' : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'}`}
                        title={batch.notes || "Προσθήκη Σημείωσης"}
                    >
                        <StickyNote size={16} className={batch.notes ? "fill-current" : ""} />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(batch); }}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Διαγραφή Παρτίδας"
                    >
                        <Trash2 size={16} />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onPrint(batch); }}
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Εκτύπωση Εντολής"
                    >
                        <Printer size={16} />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex gap-3 items-center mb-3 pointer-events-none">
                <div className="w-12 h-12 bg-slate-50 rounded-xl overflow-hidden shrink-0 border border-slate-100 relative">
                    {batch.product_image ? (
                        <img src={batch.product_image} className="w-full h-full object-cover" alt="prod" />
                    ) : (
                        <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                            <ImageIcon size={18} className="text-slate-300" />
                        </div>
                    )}
                    {batch.quantity > 1 && (
                        <div className="absolute bottom-0 left-0 bg-slate-900/95 text-white text-[9px] font-black px-1.5 py-0.5 rounded-tr-lg shadow-sm">
                            x{batch.quantity}
                        </div>
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    {/* SKU Badge with Finish Color */}
                    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border mb-1 ${finishConfig.style}`}>
                        <span className="font-black text-sm leading-none">{batch.sku}{batch.variant_suffix}</span>
                        <span className="text-[9px] font-bold opacity-70 uppercase tracking-tight hidden sm:inline-block">| {finishConfig.label}</span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        {batch.size_info && <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{batch.size_info}</span>}
                    </div>
                </div>
            </div>

            {/* Hold Reason Display */}
            {batch.on_hold && batch.on_hold_reason && (
                <div className="mb-3 bg-amber-100 border border-amber-200 rounded-lg p-2 flex gap-2">
                    <AlertTriangle size={12} className="text-amber-600 shrink-0 mt-0.5" />
                    <span className="text-[10px] text-amber-800 font-bold leading-tight">{batch.on_hold_reason}</span>
                </div>
            )}

            {batch.notes && !batch.on_hold && (
                <div className="mb-3 bg-yellow-50 border border-yellow-100 rounded-lg p-2 text-[10px] text-yellow-800 italic leading-tight pointer-events-none">
                    "{batch.notes}"
                </div>
            )}

            {/* Action Footer */}
            {!hideActions && (
                <div className="mt-auto pt-3 border-t border-slate-50 flex justify-between items-center">
                    <div className="flex flex-col pointer-events-none">
                        {batch.order_id ? (
                            <div className="text-[10px] font-mono font-medium text-slate-400">#{formatOrderId(batch.order_id)}</div>
                        ) : <div />}
                        {batch.customer_name && (
                            <div className="text-[10px] font-bold text-slate-600 truncate max-w-[120px]">{batch.customer_name}</div>
                        )}
                    </div>

                    {!isReady && onNextStage && !batch.on_hold && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onNextStage(batch); }}
                            className="flex items-center gap-1 bg-slate-100 hover:bg-emerald-500 hover:text-white text-slate-600 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95"
                        >
                            {isAwaiting ? 'Παραλαβή' : 'Επόμενο'} <MoveRight size={12} />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};
