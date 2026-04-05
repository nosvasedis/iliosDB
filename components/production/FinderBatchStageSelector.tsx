import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { ChevronDown, ChevronUp, MoveRight, PauseCircle, PlayCircle, StickyNote } from 'lucide-react';
import { ProductionBatch, ProductionStage } from '../../types';
import { PRODUCTION_STAGES } from '../../utils/productionStages';

// Stage button colors for finder batch selector
const FINDER_STAGE_BUTTON_COLORS: Record<string, { bg: string, text: string, border: string }> = {
    'AwaitingDelivery': { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
    'Waxing': { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
    'Casting': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
    'Setting': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
    'Polishing': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
    'Assembly': { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
    'Labeling': { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
    'Ready': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
};

// Stage display order and labels for finder
const FINDER_STAGE_ORDER: { id: ProductionStage, label: string }[] = PRODUCTION_STAGES.map((stage) => ({
    id: stage.id,
    label: stage.label,
}));

type Props = {
    batch: ProductionBatch & { customer_name?: string };
    onMoveToStage: (batch: ProductionBatch, targetStage: ProductionStage) => void;
    onToggleHold: (batch: ProductionBatch) => void;
    hideNotes?: boolean;
};

export default function FinderBatchStageSelector({ batch, onMoveToStage, onToggleHold, hideNotes = false }: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 });
    const buttonRef = useRef<HTMLButtonElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);

    // Calculate popup position when opening
    const updatePosition = useCallback(() => {
        if (!buttonRef.current) return;

        const buttonRect = buttonRef.current.getBoundingClientRect();
        const popupHeight = 320; // Approximate max height
        const popupWidth = 160;
        const padding = 8;

        // Calculate vertical position - prefer above, but go below if not enough space
        let top = buttonRect.top - popupHeight - padding;
        if (top < padding) {
            top = buttonRect.bottom + padding;
        }

        // Ensure doesn't go off bottom of screen
        const viewportHeight = window.innerHeight;
        if (top + popupHeight > viewportHeight - padding) {
            top = viewportHeight - popupHeight - padding;
        }

        // Calculate horizontal position - align right edge with button
        let left = buttonRect.right - popupWidth;
        if (left < padding) {
            left = padding;
        }

        setPopupPosition({ top, left });
    }, []);

    // Open/close handler
    const handleToggle = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isOpen) {
            updatePosition();
        }
        setIsOpen(!isOpen);
    }, [isOpen, updatePosition]);

    // Close selector when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                popupRef.current && !popupRef.current.contains(event.target as Node) &&
                buttonRef.current && !buttonRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    // Update position on scroll/resize
    useEffect(() => {
        if (!isOpen) return;

        const handleScroll = () => updatePosition();
        window.addEventListener('scroll', handleScroll, true);
        window.addEventListener('resize', handleScroll);

        return () => {
            window.removeEventListener('scroll', handleScroll, true);
            window.removeEventListener('resize', handleScroll);
        };
    }, [isOpen, updatePosition]);

    const currentStageIndex = FINDER_STAGE_ORDER.findIndex(s => s.id === batch.current_stage);

    const isStageDisabled = (stageId: ProductionStage): boolean => {
        if (stageId === ProductionStage.Setting && !batch.requires_setting) return true;
        if (stageId === ProductionStage.Assembly && !batch.requires_assembly) return true;
        return false;
    };

    const handleStageSelect = (targetStage: ProductionStage) => {
        if (isStageDisabled(targetStage)) return;
        if (targetStage === batch.current_stage) return;
        setIsOpen(false);
        onMoveToStage(batch, targetStage);
    };

    return (
        <div className="mt-2 pt-2 border-t border-slate-200/50">
            {batch.on_hold && (
                <div className="bg-amber-100 text-amber-800 text-xs font-black p-1.5 px-2 rounded-lg flex items-center gap-1 border border-amber-200 mb-2">
                    <PauseCircle size={11} className="shrink-0" />
                    <span>Σε Αναμονή{batch.on_hold_reason ? ` • ${batch.on_hold_reason}` : ''}</span>
                </div>
            )}
            {!hideNotes && batch.notes && (
                <div className="bg-amber-50 text-amber-800 text-xs font-bold p-1.5 px-2 rounded-lg flex items-center gap-1 border border-amber-100 mb-2 truncate">
                    <StickyNote size={10} className="shrink-0" />
                    <span className="truncate">{batch.notes}</span>
                </div>
            )}

            <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-slate-400 uppercase">Μετακίνηση:</span>

                <div className="flex items-center gap-2">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleHold(batch);
                        }}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 ${batch.on_hold ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-700' : 'bg-amber-100 hover:bg-amber-200 text-amber-700'}`}
                    >
                        {batch.on_hold ? <PlayCircle size={12} className="fill-current" /> : <PauseCircle size={12} />}
                        {batch.on_hold ? 'Συνέχεια' : 'Αναμονή'}
                    </button>

                    <button
                        ref={buttonRef}
                        onClick={handleToggle}
                        className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-600 px-2.5 py-1 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95"
                    >
                        <MoveRight size={12} />
                        Στάδιο
                        {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                </div>
            </div>

            {/* Portal-style fixed position popup - rendered at root level */}
            {isOpen && ReactDOM.createPortal(
                <div
                    ref={popupRef}
                    className="fixed bg-white rounded-xl shadow-2xl border border-slate-200 p-2 z-[9999] min-w-[150px] max-h-[280px] overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-150"
                    style={{
                        top: popupPosition.top,
                        left: popupPosition.left,
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-2 sticky top-0 bg-white pt-1">Επιλογή Σταδίου</div>
                    <div className="space-y-1">
                        {FINDER_STAGE_ORDER.map((stage, index) => {
                            const isCurrent = stage.id === batch.current_stage;
                            const isDisabled = isStageDisabled(stage.id);
                            const isPast = index < currentStageIndex;

                            const colorKey = stage.id === ProductionStage.AwaitingDelivery ? 'AwaitingDelivery' :
                                stage.id === ProductionStage.Waxing ? 'Waxing' :
                                    stage.id === ProductionStage.Casting ? 'Casting' :
                                        stage.id === ProductionStage.Setting ? 'Setting' :
                                            stage.id === ProductionStage.Polishing ? 'Polishing' :
                                                stage.id === ProductionStage.Assembly ? 'Assembly' :
                                                    stage.id === ProductionStage.Labeling ? 'Labeling' : 'Ready';
                            const stageColors = FINDER_STAGE_BUTTON_COLORS[colorKey];

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
                                                    : `${stageColors.bg} ${stageColors.text} ${stageColors.border} border hover:shadow-md active:scale-95`
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
                </div>,
                document.body
            )}
        </div>
    );
}

