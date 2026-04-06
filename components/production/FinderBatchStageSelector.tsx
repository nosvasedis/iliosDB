import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, MoveRight, PauseCircle, PlayCircle, StickyNote } from 'lucide-react';
import { ProductionBatch, ProductionStage } from '../../types';
import MobileBatchStageMoveSheet from '../mobile/MobileBatchStageMoveSheet';

type Props = {
    batch: ProductionBatch & { customer_name?: string; requires_setting?: boolean; requires_assembly?: boolean; product_details?: { gender?: string } };
    onMoveToStage: (batch: ProductionBatch, targetStage: ProductionStage, options?: { pendingDispatch?: boolean }) => void;
    onToggleHold: (batch: ProductionBatch) => void;
    hideNotes?: boolean;
};

export default function FinderBatchStageSelector({ batch, onMoveToStage, onToggleHold, hideNotes = false }: Props) {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen]);

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
                <span className="text-[9px] font-bold text-slate-400 uppercase">Στάδιο:</span>

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
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsOpen(!isOpen);
                        }}
                        className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-600 px-2.5 py-1 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95"
                    >
                        <MoveRight size={12} />
                        Στάδιο
                        {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                </div>
            </div>

            <MobileBatchStageMoveSheet
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                batch={batch}
                onMove={(targetStage, options) => onMoveToStage(batch, targetStage, options)}
            />
        </div>
    );
}
