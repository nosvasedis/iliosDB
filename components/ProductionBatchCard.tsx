import React, { useState, useRef, useEffect } from 'react';
import { ProductionBatch, ProductionStage } from '../types';
import { Clock, PauseCircle, StickyNote, Trash2, Printer, MoveRight, ImageIcon, AlertTriangle, PlayCircle, RefreshCcw, ChevronUp, ChevronDown } from 'lucide-react';
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

// Stage colors for the expanding button
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

// Stage display order and labels
const STAGE_ORDER: { id: ProductionStage, label: string }[] = [
    { id: ProductionStage.AwaitingDelivery, label: 'Αναμονή' },
    { id: ProductionStage.Waxing, label: 'Παρασκευή' },
    { id: ProductionStage.Casting, label: 'Χυτήριο' },
    { id: ProductionStage.Setting, label: 'Καρφωτής' },
    { id: ProductionStage.Polishing, label: 'Τεχνίτης' },
    { id: ProductionStage.Assembly, label: 'Συναρμολόγηση' },
    { id: ProductionStage.Labeling, label: 'Συσκευασία' },
    { id: ProductionStage.Ready, label: 'Έτοιμα' },
];

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
    onMoveToStage?: (batch: ProductionBatch, targetStage: ProductionStage) => void;
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
    onMoveToStage,
    onEditNote,
    onToggleHold,
    onDelete,
    onClick,
    hideActions = false
}) => {
    const isRefurbish = batch.type === 'Φρεσκάρισμα';
    const isAwaiting = batch.current_stage === ProductionStage.AwaitingDelivery;
    const isReady = batch.current_stage === ProductionStage.Ready;
    
    // Stage selector state
    const [stageSelectorOpen, setStageSelectorOpen] = useState(false);
    const stageSelectorRef = useRef<HTMLDivElement>(null);
    
    // Close selector when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (stageSelectorRef.current && !stageSelectorRef.current.contains(event.target as Node)) {
                setStageSelectorOpen(false);
            }
        };
        if (stageSelectorOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [stageSelectorOpen]);
    
    // Get current stage index
    const currentStageIndex = STAGE_ORDER.findIndex(s => s.id === batch.current_stage);
    
    // Determine which stages should be disabled (skipped)
    const isStageDisabled = (stageId: ProductionStage): boolean => {
        // Setting is disabled if no zircons
        if (stageId === ProductionStage.Setting && !batch.requires_setting) return true;
        // Assembly is disabled if not required
        if (stageId === ProductionStage.Assembly && !batch.requires_assembly) return true;
        return false;
    };
    
    // Handle stage selection
    const handleStageSelect = (targetStage: ProductionStage) => {
        if (isStageDisabled(targetStage)) return;
        if (targetStage === batch.current_stage) return;
        setStageSelectorOpen(false);
        if (onMoveToStage) {
            onMoveToStage(batch, targetStage);
        }
    };

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

                    {!isReady && !batch.on_hold && (onMoveToStage || onNextStage) && (
                        <div className="relative" ref={stageSelectorRef}>
                            {/* Main button */}
                            <button
                                onClick={(e) => { 
                                    e.stopPropagation(); 
                                    if (onMoveToStage) {
                                        setStageSelectorOpen(!stageSelectorOpen);
                                    } else if (onNextStage) {
                                        onNextStage(batch);
                                    }
                                }}
                                className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-600 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95"
                            >
                                <MoveRight size={12} />
                                {isAwaiting ? 'Παραλαβή' : 'Μετακίνηση'}
                                {onMoveToStage && (stageSelectorOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                            </button>
                            
                            {/* Expanding stage selector */}
                            {stageSelectorOpen && onMoveToStage && (
                                <div 
                                    className="absolute bottom-full right-0 mb-2 bg-white rounded-xl shadow-xl border border-slate-200 p-2 z-50 min-w-[140px] animate-in fade-in slide-in-from-bottom-1 duration-200"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-2">Στάδια</div>
                                    <div className="space-y-1">
                                        {STAGE_ORDER.map((stage, index) => {
                                            const colors = STAGE_BUTTON_COLORS[stage.id.replace('Αναμονή Παραλαβής', 'AwaitingDelivery').replace('Waxing', 'Waxing').replace('Casting', 'Casting').replace('Setting', 'Setting').replace('Polishing', 'Polishing').replace('Assembly', 'Assembly').replace('Labeling', 'Labeling').replace('Ready', 'Ready')] || STAGE_BUTTON_COLORS['Waxing'];
                                            const isCurrent = stage.id === batch.current_stage;
                                            const isDisabled = isStageDisabled(stage.id);
                                            const isPast = index < currentStageIndex;
                                            
                                            // Get correct color key
                                            const colorKey = stage.id === ProductionStage.AwaitingDelivery ? 'AwaitingDelivery' :
                                                             stage.id === ProductionStage.Waxing ? 'Waxing' :
                                                             stage.id === ProductionStage.Casting ? 'Casting' :
                                                             stage.id === ProductionStage.Setting ? 'Setting' :
                                                             stage.id === ProductionStage.Polishing ? 'Polishing' :
                                                             stage.id === ProductionStage.Assembly ? 'Assembly' :
                                                             stage.id === ProductionStage.Labeling ? 'Labeling' : 'Ready';
                                            const stageColors = STAGE_BUTTON_COLORS[colorKey];
                                            
                                            return (
                                                <button
                                                    key={stage.id}
                                                    onClick={() => handleStageSelect(stage.id)}
                                                    disabled={isDisabled}
                                                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center justify-between
                                                        ${isCurrent 
                                                            ? `${stageColors.bg} ${stageColors.text} ${stageColors.border} border ring-2 ring-offset-1 ring-current/30` 
                                                            : isDisabled
                                                            ? 'bg-slate-50/50 text-slate-300/50 border border-slate-100/50 cursor-not-allowed blur-[1px] opacity-50'
                                                            : isPast
                                                            ? `${stageColors.bg}/50 ${stageColors.text}/70 border border-slate-100 hover:${stageColors.bg}`
                                                            : `${stageColors.bg} ${stageColors.text} ${stageColors.border} border hover:shadow-md`
                                                        }
                                                    `}
                                                >
                                                    <span>{stage.label}</span>
                                                    {isCurrent && <span className="text-[8px]">●</span>}
                                                    {isDisabled && <span className="text-[8px] opacity-50">παράλειψη</span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
